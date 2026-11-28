import { create } from 'zustand';
import { v7 as uuidv7 } from 'uuid';
import { blobStore, repos } from '@/core/db/repository';
import type { CompressedImage } from '@/core/images/compress';
import { newEntity, touch } from '@/core/model/entity';
import type { Attachment, GardenBed, HarvestEntry, Id, IsoDay, Item, Location, Lot, Planting } from '@/core/model/types';
import { isUnlocked, onSessionChange } from '@/core/security/session';
import { systemCategoryId } from '@/modules/inventory/domain/categories';
import { onLinkedLotsRemoved, useInventory } from '@/modules/inventory/store';
import { CROP_BY_ID, type Crop } from './crops';
import { addDays } from './logic';

type ById<T> = Map<Id, T>;
const toMap = <T extends { id: Id }>(xs: T[]): ById<T> => new Map(xs.map((x) => [x.id, x]));

/** Cuánto dura lo cosechado sin conservar (para el vencimiento del lote en el inventario). */
export function keepsDays(crop: Crop): number {
  const special: Record<string, number> = {
    ajo: 180,
    cebolla: 120,
    zapallo: 120,
    papa: 90,
    batata: 90,
    zanahoria: 30,
    remolacha: 30,
    repollo: 30,
    melon: 14,
    sandia: 14,
    tomate: 10,
    pepino: 10,
    pimiento: 10,
    berenjena: 10,
    rabanito: 10,
    zapallito: 10,
    frutilla: 4,
    choclo: 5,
  };
  return special[crop.id] ?? 7;
}

export interface HarvestToInventory {
  locationId: Id;
  /** Nombre del artículo (por defecto, el del cultivo). */
  itemName: string;
}

interface GardenState {
  loaded: boolean;
  beds: ById<GardenBed>;
  plantings: ById<Planting>;
  /** Foto de cada siembra (por id de siembra; solo metadatos). */
  photos: Map<Id, Attachment>;
  load: () => Promise<void>;
  clear: () => void;
  saveBed: (b: GardenBed) => Promise<void>;
  /** Borra el cantero y lo que tenía plantado. */
  deleteBed: (id: Id) => Promise<void>;
  savePlanting: (p: Planting) => Promise<void>;
  deletePlanting: (id: Id) => Promise<void>;
  /** Registra una cosecha y, si se pide, la suma al inventario (categoría Alimento). */
  addHarvest: (plantingId: Id, h: Omit<HarvestEntry, 'id' | 'lotId'>, inventory: HarvestToInventory | null) => Promise<void>;
  removeHarvest: (plantingId: Id, harvestId: Id) => Promise<void>;
  setPhoto: (plantingId: Id, image: CompressedImage) => Promise<void>;
  removePhoto: (plantingId: Id) => Promise<void>;
}

export function newBed(fields: Partial<GardenBed> = {}): GardenBed {
  return newEntity<GardenBed>({ name: '', kind: 'bed', greenhouse: false, widthCm: 120, lengthCm: 240, sunHours: 8, waypointId: null, notes: '', order: 0, ...fields });
}

export function newPlanting(cropId: string, sownOn: IsoDay, fields: Partial<Planting> = {}): Planting {
  const crop = CROP_BY_ID.get(cropId);
  const method = fields.method ?? (crop?.sowing === 'transplant' && !crop.perennial ? 'nursery' : 'direct');
  return newEntity<Planting>({
    cropId,
    variety: '',
    bedId: null,
    cells: [],
    method,
    sownOn,
    transplantedOn: null,
    status: method === 'nursery' && !fields.bedId ? 'nursery' : 'growing',
    endedOn: null,
    notes: '',
    harvests: [],
    ...fields,
  });
}

/** Huerta: canteros y siembras, cifrados como todo lo del usuario. */
export const useGarden = create<GardenState>((set, get) => ({
  loaded: false,
  beds: new Map(),
  plantings: new Map(),
  photos: new Map(),

  async load() {
    const [beds, plantings, attachments] = await Promise.all([repos.gardenBeds.loadAll(), repos.plantings.loadAll(), repos.attachments.loadAll()]);
    const photos = new Map(attachments.filter((a) => a.ownerType === 'planting').map((a) => [a.ownerId, a]));
    set({ loaded: true, beds: toMap(beds), plantings: toMap(plantings), photos });
  },

  clear() {
    set({ loaded: false, beds: new Map(), plantings: new Map(), photos: new Map() });
  },

  async saveBed(b) {
    const saved = touch(b);
    await repos.gardenBeds.put(saved);
    set({ beds: new Map(get().beds).set(saved.id, saved) });
  },

  async deleteBed(id) {
    const plantings = new Map(get().plantings);
    for (const p of plantings.values()) {
      if (p.bedId !== id) continue;
      await get().removePhoto(p.id);
      await repos.plantings.remove(p.id);
      plantings.delete(p.id);
    }
    await repos.gardenBeds.remove(id);
    const beds = new Map(get().beds);
    beds.delete(id);
    set({ beds, plantings });
  },

  async savePlanting(p) {
    const saved = touch(p);
    await repos.plantings.put(saved);
    set({ plantings: new Map(get().plantings).set(saved.id, saved) });
  },

  async deletePlanting(id) {
    await get().removePhoto(id);
    await repos.plantings.remove(id);
    const plantings = new Map(get().plantings);
    plantings.delete(id);
    set({ plantings });
  },

  async addHarvest(plantingId, h, inventory) {
    const p = get().plantings.get(plantingId);
    const crop = p && CROP_BY_ID.get(p.cropId);
    if (!p || !crop) return;
    let lotId: Id | null = null;
    if (inventory) {
      const inv = useInventory.getState();
      const food = systemCategoryId('food');
      const name = inventory.itemName.trim();
      let item = [...inv.items.values()].find((i) => i.categoryId === food && i.name.trim().toLowerCase() === name.toLowerCase() && i.unit === h.unit);
      if (!item) {
        item = newEntity<Item>({
          name,
          categoryId: food,
          notes: '',
          barcode: null,
          unit: h.unit,
          weightGrams: null,
          favorite: false,
          controlType: null,
          alertsEnabled: null,
          alertLeadDays: null,
          alertCapacityPct: null,
        });
        await inv.saveItem(item);
      }
      const lot = newEntity<Lot>({
        itemId: item.id,
        locationId: inventory.locationId,
        quantity: h.quantity,
        packageCount: null,
        packageSize: null,
        packageName: null,
        packageTareGrams: null,
        expiryDate: addDays(h.date, keepsDays(crop)),
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
    const entry: HarvestEntry = { ...h, id: uuidv7(), lotId };
    await get().savePlanting({
      ...p,
      harvests: [...p.harvests, entry].sort((a, b) => a.date.localeCompare(b.date)),
      // La primera cosecha la pasa a "cosechando".
      status: p.status === 'growing' ? 'harvesting' : p.status,
    });
  },

  async removeHarvest(plantingId, harvestId) {
    const p = get().plantings.get(plantingId);
    const h = p?.harvests.find((x) => x.id === harvestId);
    if (!p || !h) return;
    await get().savePlanting({ ...p, harvests: p.harvests.filter((x) => x.id !== harvestId) });
    // Y su lote del inventario (si se sumó y sigue estando).
    if (h.lotId && useInventory.getState().lots.has(h.lotId)) await useInventory.getState().deleteLot(h.lotId);
  },

  async setPhoto(plantingId, image) {
    // Una foto por siembra: la nueva reemplaza a la anterior.
    await get().removePhoto(plantingId);
    const a = newEntity<Attachment>({
      ownerType: 'planting',
      ownerId: plantingId,
      mime: image.mime,
      width: image.width,
      height: image.height,
      order: 0,
      sizeBytes: image.bytes.byteLength,
    });
    await blobStore.put(a.id, image.bytes);
    await repos.attachments.put(a);
    set({ photos: new Map(get().photos).set(plantingId, a) });
  },

  async removePhoto(plantingId) {
    const a = get().photos.get(plantingId);
    if (!a) return;
    await repos.attachments.remove(a.id);
    await blobStore.remove(a.id);
    const photos = new Map(get().photos);
    photos.delete(plantingId);
    set({ photos });
  },
}));

/** Ubicación para guardar la cosecha: si no hay ninguna, se crea "Despensa". */
export async function harvestLocation(name: string): Promise<Location> {
  const inv = useInventory.getState();
  const existing = [...inv.locations.values()].find((l) => l.parentId === null);
  if (existing) return existing;
  const loc = newEntity<Location>({ parentId: null, depth: 1, name, notes: '', waypointId: null, kitType: null });
  await inv.saveLocation(loc);
  return loc;
}

onSessionChange(() => {
  if (isUnlocked()) {
    if (!useGarden.getState().loaded) void useGarden.getState().load();
  } else {
    useGarden.getState().clear();
  }
});

// Si se borró del inventario un lote que vino de la huerta, se relee (la cosecha ya se sacó de lo guardado).
onLinkedLotsRemoved(() => {
  if (useGarden.getState().loaded) void useGarden.getState().load();
});
