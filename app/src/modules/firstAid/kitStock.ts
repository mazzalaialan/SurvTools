import { newEntity } from '@/core/model/entity';
import type { Id, Location, Lot } from '@/core/model/types';
import { pathLabel } from '@/modules/inventory/domain/locations';
import { allKitsScope } from './kits';

/**
 * Lo que ya tenés cargado de un artículo y puede pasar a un botiquín: solo lo que está en lugares que NO son botiquines (el estante, el
 * placard, el auto). Lo que hay en otros botiquines no se cuenta ni se mueve: cada botiquín tiene lo suyo.
 */
export function lotsOutsideKits(itemId: Id, lots: Lot[], locations: Location[]): Lot[] {
  const scope = allKitsScope(locations);
  return lots.filter((l) => !l.deletedAt && l.itemId === itemId && l.quantity > 0 && !scope.has(l.locationId));
}

/** Cuánto hay de un artículo dentro de botiquines (para avisar que no se toca). */
export function quantityInKits(itemId: Id, lots: Lot[], locations: Location[]): number {
  const scope = allKitsScope(locations);
  return lots.filter((l) => !l.deletedAt && l.itemId === itemId && scope.has(l.locationId)).reduce((sum, l) => sum + l.quantity, 0);
}

export const quantityOf = (lots: Lot[]): number => lots.reduce((sum, l) => sum + l.quantity, 0);

export interface MoveStep {
  source: Lot;
  /** Cuánto se toma de ese lote (todo el lote si es igual a su cantidad). */
  take: number;
}

/** De qué lotes se toma `qty`: primero los que vencen antes (los que no vencen, al final). */
export function planMove(lots: Lot[], qty: number): MoveStep[] {
  const sorted = [...lots].sort((a, b) => (a.expiryDate ?? '9999-12-31').localeCompare(b.expiryDate ?? '9999-12-31'));
  const steps: MoveStep[] = [];
  let left = qty;
  for (const source of sorted) {
    if (left <= 0) break;
    const take = Math.min(left, source.quantity);
    steps.push({ source, take });
    left -= take;
  }
  return steps;
}

/** Lugares de donde se toma, para decirlo («Placard › Estante 2, Auto»). */
export function sourcePlaces(lots: Lot[], locations: Map<Id, Location>): string {
  return [...new Set(lots.map((l) => pathLabel(l.locationId, locations)))].join(', ');
}

/**
 * Pasa `qty` del artículo desde lugares que no son botiquines al botiquín: se mueven lotes enteros (con su vencimiento y envases) y, si hay
 * que partir uno, el resto queda donde estaba. Devuelve cuánto se pasó (puede ser menos de lo pedido si no había tanto).
 */
export async function moveToKit(kitId: Id, itemId: Id, qty: number, lots: Lot[], locations: Location[], saveLot: (l: Lot) => Promise<void>): Promise<number> {
  let moved = 0;
  for (const { source, take } of planMove(lotsOutsideKits(itemId, lots, locations), qty)) {
    if (take >= source.quantity) {
      await saveLot({ ...source, locationId: kitId });
    } else {
      const noPackage = { packageCount: null, packageSize: null, packageName: null };
      await saveLot({ ...source, ...noPackage, quantity: source.quantity - take });
      const { id: _id, createdAt: _c, updatedAt: _u, deletedAt: _d, ...fields } = source;
      await saveLot(newEntity<Lot>({ ...fields, ...noPackage, locationId: kitId, quantity: take }));
    }
    moved += take;
  }
  return moved;
}
