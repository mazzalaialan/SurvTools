import { create } from 'zustand';
import { v7 as uuidv7 } from 'uuid';
import { repos } from '@/core/db/repository';
import { newEntity, touch } from '@/core/model/entity';
import type { FarmEvent, FarmHerd, FarmPen, FarmProduction, Id, IsoDay, Item, Lot } from '@/core/model/types';
import { isUnlocked, onSessionChange } from '@/core/security/session';
import { systemCategoryId } from '@/modules/inventory/domain/categories';
import { onLinkedLotsRemoved, useInventory } from '@/modules/inventory/store';
import { addDays } from '@/modules/garden/logic';

/**
 * Granja: mis lotes de animales, con sus eventos (vacunas, nacimientos, bajas…) y su producción (huevos, leche, miel…), cifrados como
 * todo lo del usuario. Lo producido se puede sumar al inventario (categoría Alimento), igual que la cosecha de Huerta.
 */

/** Cuántos días dura lo producido sin conservar (vencimiento del lote del inventario). Orientativo: huevos frescos en heladera, etc. */
export const KEEPS_DAYS: Record<FarmProduction['product'], number> = { eggs: 21, milk: 2, meat: 3, honey: 730, wool: 3650 };
/** Unidad habitual de cada producto. */
export const PRODUCT_UNIT: Record<FarmProduction['product'], string> = { eggs: 'u', milk: 'l', meat: 'kg', honey: 'kg', wool: 'kg' };
/** Qué produce cada especie (para los botones de producción). */
export const SPECIES_PRODUCTS: Record<string, FarmProduction['product'][]> = {
  gallina: ['eggs', 'meat'], codorniz: ['eggs', 'meat'], pato: ['eggs', 'meat'], ganso: ['eggs', 'meat'], pavo: ['meat'], nandu: ['eggs', 'meat'],
  conejo: ['meat'], vaca: ['milk', 'meat'], oveja: ['milk', 'meat', 'wool'], cabra: ['milk', 'meat'], cerdo: ['meat'], caballo: [], burro: ['milk'],
  mula: [], llama: ['wool', 'meat'], alpaca: ['wool'], abeja: ['honey'], 'peces-estanque': ['meat'],
};
/** Eventos que suman o restan animales al lote. */
const DELTA: Partial<Record<FarmEvent['kind'], 1 | -1>> = { birth: 1, bought: 1, death: -1, slaughter: -1, sold: -1 };

export function newPen(fields: Partial<FarmPen> = {}): FarmPen {
  return newEntity<FarmPen>({ name: '', waypointId: null, notes: '', ...fields });
}

export function newHerd(speciesId: string, startedOn: IsoDay, fields: Partial<FarmHerd> = {}): FarmHerd {
  return newEntity<FarmHerd>({ name: '', speciesId, count: 1, breed: '', startedOn, notes: '', events: [], production: [], ...fields });
}

/** Producción de un lote en los últimos `days` días, por producto. */
export function recentProduction(h: FarmHerd, today: IsoDay, days = 7): Partial<Record<FarmProduction['product'], number>> {
  const from = addDays(today, -days + 1);
  const out: Partial<Record<FarmProduction['product'], number>> = {};
  for (const p of h.production) if (p.date >= from && p.date <= today) out[p.product] = (out[p.product] ?? 0) + p.quantity;
  return out;
}

interface HerdState {
  loaded: boolean;
  herds: Map<Id, FarmHerd>;
  pens: Map<Id, FarmPen>;
  savePen: (p: FarmPen) => Promise<void>;
  /** Borra el corral; sus lotes quedan sin corral (no se borran animales). */
  removePen: (id: Id) => Promise<void>;
  load: () => Promise<void>;
  clear: () => void;
  save: (h: FarmHerd) => Promise<void>;
  remove: (id: Id) => Promise<void>;
  /** Registra un evento; nacimientos y compras suman animales, muertes, faena y ventas restan. */
  addEvent: (herdId: Id, e: Omit<FarmEvent, 'id'>) => Promise<Id | null>;
  removeEvent: (herdId: Id, eventId: Id) => Promise<void>;
  /** Registra producción y, si se pide, la suma al inventario en esa ubicación. */
  addProduction: (herdId: Id, p: Omit<FarmProduction, 'id' | 'lotId'>, inventory: { locationId: Id; itemName: string } | null) => Promise<Id | null>;
  removeProduction: (herdId: Id, prodId: Id) => Promise<void>;
}

export const useHerds = create<HerdState>((set, get) => ({
  loaded: false,
  herds: new Map(),
  pens: new Map(),

  async load() {
    const [list, pens] = await Promise.all([repos.farmHerds.loadAll(), repos.farmPens.loadAll()]);
    set({ loaded: true, herds: new Map(list.map((h) => [h.id, h])), pens: new Map(pens.map((p) => [p.id, p])) });
  },
  clear() {
    set({ loaded: false, herds: new Map(), pens: new Map() });
  },
  async savePen(p) {
    const saved = touch(p);
    await repos.farmPens.put(saved);
    set({ pens: new Map(get().pens).set(saved.id, saved) });
  },
  async removePen(id) {
    for (const h of get().herds.values()) if (h.penId === id) await get().save({ ...h, penId: null });
    await repos.farmPens.remove(id);
    const pens = new Map(get().pens);
    pens.delete(id);
    set({ pens });
  },
  async save(h) {
    const saved = touch(h);
    await repos.farmHerds.put(saved);
    set({ herds: new Map(get().herds).set(saved.id, saved) });
  },
  async remove(id) {
    await repos.farmHerds.remove(id);
    const herds = new Map(get().herds);
    herds.delete(id);
    set({ herds });
  },
  async addEvent(herdId, e) {
    const h = get().herds.get(herdId);
    if (!h) return null;
    const d = DELTA[e.kind];
    // Corrección: la cantidad nueva queda anotada con la anterior (así el historial explica cada cambio).
    const adjust = e.kind === 'adjust' && e.count !== null;
    const count = adjust ? Math.max(0, e.count!) : d && e.count ? Math.max(0, h.count + d * e.count) : h.count;
    const ev: FarmEvent = { ...e, id: uuidv7(), ...(adjust && { prevCount: h.count }) };
    await get().save({ ...h, count, events: [...h.events, ev].sort((a, b) => b.date.localeCompare(a.date)) });
    return ev.id;
  },
  async removeEvent(herdId, eventId) {
    const h = get().herds.get(herdId);
    const e = h?.events.find((x) => x.id === eventId);
    if (!h || !e) return;
    // Deshacer el evento devuelve los animales que había sumado o restado.
    const d = DELTA[e.kind];
    const count = e.kind === 'adjust' && typeof e.prevCount === 'number' ? e.prevCount : d && e.count ? Math.max(0, h.count - d * e.count) : h.count;
    await get().save({ ...h, count, events: h.events.filter((x) => x.id !== eventId) });
  },
  async addProduction(herdId, p, inventory) {
    const h = get().herds.get(herdId);
    if (!h) return null;
    let lotId: Id | null = null;
    if (inventory) {
      const inv = useInventory.getState();
      const food = systemCategoryId('food');
      const name = inventory.itemName.trim();
      let item = [...inv.items.values()].find((i) => i.categoryId === food && i.name.trim().toLowerCase() === name.toLowerCase() && i.unit === p.unit);
      if (!item) {
        item = newEntity<Item>({ name, categoryId: food, notes: '', barcode: null, unit: p.unit, weightGrams: null, favorite: false, controlType: null, alertsEnabled: null, alertLeadDays: null, alertCapacityPct: null });
        await inv.saveItem(item);
      }
      const lot = newEntity<Lot>({
        itemId: item.id,
        locationId: inventory.locationId,
        quantity: p.quantity,
        packageCount: null,
        packageSize: null,
        packageName: null,
        packageTareGrams: null,
        expiryDate: addDays(p.date, KEEPS_DAYS[p.product]),
        manufactureDate: null,
        shelfLifeMonths: null,
        capacityTotal: null,
        capacityRemaining: null,
        capacityUnit: null,
        notes: '',
      });
      await inv.saveLot(lot);
      lotId = lot.id;
    }
    const id = uuidv7();
    await get().save({ ...h, production: [...h.production, { ...p, id, lotId }].sort((a, b) => b.date.localeCompare(a.date)) });
    return id;
  },
  async removeProduction(herdId, prodId) {
    const h = get().herds.get(herdId);
    const p = h?.production.find((x) => x.id === prodId);
    if (!h || !p) return;
    await get().save({ ...h, production: h.production.filter((x) => x.id !== prodId) });
    // Y su lote del inventario (si se sumó y sigue estando), para que los dos lados coincidan.
    if (p.lotId && useInventory.getState().lots.has(p.lotId)) await useInventory.getState().deleteLot(p.lotId);
  },
}));

onSessionChange(() => {
  if (isUnlocked()) {
    if (!useHerds.getState().loaded) void useHerds.getState().load();
  } else useHerds.getState().clear();
});

// Si se borró del inventario un lote que vino de acá, se relee (la producción ya se sacó de lo guardado).
onLinkedLotsRemoved(() => {
  if (useHerds.getState().loaded) void useHerds.getState().load();
});
