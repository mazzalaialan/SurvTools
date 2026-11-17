import { KIT_SEPARATOR } from '@/core/notifications/format';
import type { Id, Item, Location, Lot, StockMin } from '@/core/model/types';
import { subtreeIds } from './locations';

const active = <T extends { deletedAt: string | null }>(xs: T[]) => xs.filter((x) => !x.deletedAt);

/** Cantidad total del artículo; si se indica ubicación, incluye sus sububicaciones. */
export function quantityOf(itemId: Id, lots: Lot[], locationScope?: Set<Id>): number {
  return active(lots)
    .filter((l) => l.itemId === itemId && (!locationScope || locationScope.has(l.locationId)))
    .reduce((sum, l) => sum + l.quantity, 0);
}

export interface StockShortage {
  stockMin: StockMin;
  current: number;
  missing: number;
}

/** Mínimos no cubiertos. El mínimo de "Casa" cuenta lo guardado en "Casa › Sótano". */
export function stockShortages(stockMins: StockMin[], lots: Lot[], locations: Location[]): StockShortage[] {
  return active(stockMins).flatMap((sm) => {
    const current = quantityOf(sm.itemId, lots, subtreeIds(sm.locationId, locations));
    return current < sm.minQuantity ? [{ stockMin: sm, current, missing: sm.minQuantity - current }] : [];
  });
}

/**
 * Faltantes de stock mínimo para el índice de notificaciones. Solo lleva el
 * nombre del artículo (no la ubicación: el índice va en claro). La fecha es el
 * último cambio del mínimo o del stock contado, que es estable mientras nada
 * cambie: así no se avisa de nuevo todos los días.
 */
export function minStockAlertRows(
  shortages: StockShortage[],
  lots: Lot[],
  locations: Location[],
  items: Map<Id, Item>,
  today: (date?: Date) => string,
): { lotId: string; itemName: string; notifyFrom: string }[] {
  const todayStr = today();
  const byId = new Map(locations.map((l) => [l.id, l]));
  /** El botiquín al que pertenece una ubicación (ella misma o la de más arriba que sea un botiquín). */
  const kitOf = (id: Id): Location | null => {
    for (let l = byId.get(id), i = 0; l && i < 8; l = l.parentId ? byId.get(l.parentId) : undefined, i++) if (l.kitType !== null) return l;
    return null;
  };
  return shortages.map(({ stockMin }) => {
    const scope = subtreeIds(stockMin.locationId, locations);
    const kit = kitOf(stockMin.locationId);
    const changedAt = active(lots)
      .filter((l) => l.itemId === stockMin.itemId && scope.has(l.locationId))
      .reduce((latest, l) => (l.updatedAt > latest ? l.updatedAt : latest), stockMin.updatedAt);
    const changedOn = today(new Date(changedAt));
    return {
      lotId: `min:${stockMin.id}`,
      // En un botiquín, el nombre lleva también el del botiquín (el aviso los agrupa); el servidor lo guarda tal cual (máx. 200).
      itemName: kit ? `${(items.get(stockMin.itemId)?.name ?? '').slice(0, 100)}${KIT_SEPARATOR}${kit.name.slice(0, 90)}` : (items.get(stockMin.itemId)?.name ?? '').slice(0, 200),
      notifyFrom: changedOn < todayStr ? changedOn : todayStr,
    };
  });
}

/** Campos de envase de lotes guardados antes de que existieran. */
const NO_PACKAGE = { packageCount: null, packageSize: null, packageName: null, packageTareGrams: null } as const;

/** Completa con valores por defecto los campos que una versión anterior no guardaba. */
export function normalizeLot(lot: Lot): Lot {
  return { ...NO_PACKAGE, ...lot };
}

export function isPackaged(lot: Pick<Lot, 'packageCount' | 'packageSize'>): boolean {
  return lot.packageCount != null && lot.packageSize != null;
}

/** Envases × contenido, redondeado para evitar errores de coma flotante (3 × 0,1 = 0,3). */
export function packagedQuantity(count: number, size: number): number {
  return Math.round(count * size * 1e6) / 1e6;
}

/** Contenido (cantidad × peso por unidad) más los envases vacíos, solo si se cargó su peso. */
export function lotWeightGrams(lot: Lot, item: Item | undefined): number {
  const content = lot.quantity * (item?.weightGrams ?? 0);
  const tare = lot.packageCount != null && lot.packageTareGrams != null ? lot.packageCount * lot.packageTareGrams : 0;
  return content + tare;
}

/** Peso total en gramos de lo guardado en una ubicación y sus sububicaciones. */
export function weightAt(locationId: Id, lots: Lot[], items: Map<Id, Item>, locations: Location[]): number {
  const scope = subtreeIds(locationId, locations);
  return active(lots)
    .filter((l) => scope.has(l.locationId))
    .reduce((sum, l) => sum + lotWeightGrams(l, items.get(l.itemId)), 0);
}

/** Peso total de un artículo en todas sus ubicaciones. */
export function itemWeightGrams(item: Item, lots: Lot[]): number {
  return active(lots)
    .filter((l) => l.itemId === item.id)
    .reduce((sum, l) => sum + lotWeightGrams(l, item), 0);
}
