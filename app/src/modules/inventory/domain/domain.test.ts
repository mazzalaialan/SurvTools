import { describe, expect, it } from 'vitest';
import { newEntity } from '@/core/model/entity';
import type { Item, Location, Lot, StockMin } from '@/core/model/types';
import { computeAlerts, effectiveConfig, lotDueDate, upcomingNotifications } from './alerts';
import { buildSystemCategories, missingSystemCategories, systemCategoryId } from './categories';
import { addDays, addMonths, daysBetween, today } from './dates';
import { buildTree, canMoveTo, pathLabel } from './locations';
import { KIT_SEPARATOR } from '@/core/notifications/format';
import { itemWeightGrams, lotWeightGrams, minStockAlertRows, normalizeLot, packagedQuantity, quantityOf, stockShortages, weightAt } from './stock';

const cats = buildSystemCategories();
const catMap = new Map(cats.map((c) => [c.id, c]));
const FOOD = systemCategoryId('food');
const FILTERS = systemCategoryId('waterFilters');
const ENERGY = systemCategoryId('energy');
const CLOTHING = systemCategoryId('clothing');

const item = (over: Partial<Item> = {}) =>
  newEntity<Item>({
    name: 'Atún',
    categoryId: FOOD,
    notes: '',
    barcode: null,
    unit: 'latas',
    weightGrams: 170,
    favorite: false,
    controlType: null,
    alertsEnabled: null,
    alertLeadDays: null,
    alertCapacityPct: null,
    ...over,
  });

const lot = (itemId: string, over: Partial<Lot> = {}) =>
  newEntity<Lot>({
    itemId,
    locationId: 'loc',
    quantity: 1,
    packageCount: null,
    packageSize: null,
    packageName: null,
    packageTareGrams: null,
    expiryDate: null,
    manufactureDate: null,
    shelfLifeMonths: null,
    capacityTotal: null,
    capacityRemaining: null,
    capacityUnit: null,
    notes: '',
    ...over,
  });

const loc = (name: string, parentId: string | null, depth: number) =>
  newEntity<Location>({ name, parentId, depth, notes: '', waypointId: null, kitType: null });

describe('dates', () => {
  it('suma días y meses con fin de mes', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-05-15', 60)).toBe('2031-05-15');
    expect(daysBetween('2026-10-30', '2026-11-29')).toBe(30);
  });

  it('today usa la fecha local', () => {
    expect(today(new Date(2026, 9, 30, 23, 59))).toBe('2026-10-30');
  });
});

describe('categorías', () => {
  it('tienen ids fijos y el tipo de control esperado', () => {
    expect(catMap.get(FILTERS)?.controlType).toBe('capacity');
    expect(catMap.get(ENERGY)?.controlType).toBe('shelfLife');
    expect(catMap.get(CLOTHING)?.alertsEnabled).toBe(false);
  });

  it('detecta categorías del sistema faltantes', () => {
    expect(missingSystemCategories(cats)).toEqual([]);
    expect(missingSystemCategories(cats.slice(1)).map((c) => c.id)).toEqual([cats[0]!.id]);
  });
});

describe('alertas', () => {
  it('el artículo gana sobre la categoría', () => {
    const food = catMap.get(FOOD)!;
    expect(effectiveConfig(item(), food).alertLeadDays).toBe(30);
    expect(effectiveConfig(item({ alertLeadDays: 90 }), food).alertLeadDays).toBe(90);
    expect(effectiveConfig(item({ alertsEnabled: false }), food).alertsEnabled).toBe(false);
  });

  it('calcula vencimiento por vida útil', () => {
    const l = lot('x', { manufactureDate: '2024-03-10', shelfLifeMonths: 60 });
    expect(lotDueDate(l, 'shelfLife')).toBe('2029-03-10');
  });

  it('avisa dentro de la ventana, marca vencidos y ordena por urgencia', () => {
    const tuna = item();
    const filter = item({ name: 'Filtro', categoryId: FILTERS });
    const jacket = item({ name: 'Campera', categoryId: CLOTHING });
    const items = new Map([tuna, filter, jacket].map((i) => [i.id, i]));
    const lots = [
      lot(tuna.id, { expiryDate: '2027-06-01' }), // lejos: sin alerta
      lot(tuna.id, { expiryDate: '2026-11-20' }), // dentro de 30 días
      lot(tuna.id, { expiryDate: '2026-10-01' }), // vencido
      lot(filter.id, { capacityTotal: 1000, capacityRemaining: 150 }), // 15% < 20%
      lot(jacket.id, { expiryDate: '2026-01-01' }), // categoría sin alertas
      lot(tuna.id, { expiryDate: '2026-10-01', quantity: 0 }), // sin stock: no avisa
    ];
    const alerts = computeAlerts({ lots, items, categories: catMap, today: '2026-10-30' });
    expect(alerts.map((a) => a.kind)).toEqual(['expired', 'expiring', 'capacityLow']);
    expect(alerts[0]?.daysLeft).toBe(-29);
    expect(alerts[1]?.daysLeft).toBe(21);
    expect(alerts[2]?.pct).toBe(15);
  });

  it('programa avisos futuros con la anticipación configurada', () => {
    const tuna = item({ alertLeadDays: 10 });
    const rows = upcomingNotifications({
      lots: [lot(tuna.id, { expiryDate: '2027-06-01' })],
      items: new Map([[tuna.id, tuna]]),
      categories: catMap,
    });
    expect(rows).toEqual([expect.objectContaining({ itemName: 'Atún', dueDate: '2027-06-01', notifyFrom: '2027-05-22' })]);
  });
});

describe('envases', () => {
  const water = item({ name: 'Agua', unit: 'L', weightGrams: 1000 });

  it('calcula el total sin errores de coma flotante', () => {
    expect(packagedQuantity(4, 6)).toBe(24);
    expect(packagedQuantity(3, 0.1)).toBe(0.3);
  });

  it('suma el envase vacío solo si se cargó su peso', () => {
    const bottles = lot(water.id, { quantity: 24, packageCount: 4, packageSize: 6, packageTareGrams: 300 });
    const jerrycan = lot(water.id, { quantity: 20, packageCount: 1, packageSize: 20 });
    expect(lotWeightGrams(bottles, water)).toBe(24_000 + 1_200);
    expect(lotWeightGrams(jerrycan, water)).toBe(20_000);
    expect(itemWeightGrams(water, [bottles, jerrycan])).toBe(45_200);
  });

  it('completa los campos de lotes guardados por versiones anteriores', () => {
    const { packageCount, packageSize, packageName, packageTareGrams, ...old } = lot(water.id, { quantity: 6 });
    void [packageCount, packageSize, packageName, packageTareGrams];
    const normalized = normalizeLot(old as never);
    expect(normalized.packageCount).toBeNull();
    expect(normalized.packageTareGrams).toBeNull();
    expect(lotWeightGrams(normalized, water)).toBe(6_000);
  });
});

describe('ubicaciones', () => {
  const casa = loc('Casa', null, 1);
  const sotano = loc('Sótano', casa.id, 2);
  const estante = loc('Estante 3', sotano.id, 3);
  const caja = loc('Caja A', estante.id, 4);
  const auto = loc('Auto', null, 1);
  const all = [casa, sotano, estante, caja, auto];
  const byId = new Map(all.map((l) => [l.id, l]));

  it('arma el árbol y la ruta', () => {
    const tree = buildTree(all);
    expect(tree.map((n) => n.location.name)).toEqual(['Auto', 'Casa']);
    expect(pathLabel(caja.id, byId)).toBe('Casa › Sótano › Estante 3 › Caja A');
  });

  it('impide ciclos y superar 4 niveles', () => {
    expect(canMoveTo(casa.id, caja.id, all)).toBe(false); // dentro de sí misma
    expect(canMoveTo(sotano.id, auto.id, all)).toBe(true); // 1 + 3 niveles = 4
    expect(canMoveTo(casa.id, auto.id, all)).toBe(false); // 1 + 4 = 5
    expect(canMoveTo(caja.id, null, all)).toBe(true);
  });

  it('suma stock, mínimos y peso incluyendo sububicaciones', () => {
    const tuna = item({ weightGrams: 200 });
    const lots = [lot(tuna.id, { locationId: caja.id, quantity: 4 }), lot(tuna.id, { locationId: auto.id, quantity: 2 })];
    expect(quantityOf(tuna.id, lots)).toBe(6);
    const min = newEntity<StockMin>({ itemId: tuna.id, locationId: casa.id, minQuantity: 10 });
    expect(stockShortages([min], lots, all)).toEqual([{ stockMin: min, current: 4, missing: 6 }]);
    expect(weightAt(casa.id, lots, new Map([[tuna.id, tuna]]), all)).toBe(800);
  });

  it('faltantes de mínimo para notificar: sin la ubicación y con la fecha del último cambio', () => {
    const tuna = item();
    const inBox = { ...lot(tuna.id, { locationId: caja.id, quantity: 4 }), updatedAt: '2026-10-20T12:00:00.000Z' };
    const elsewhere = { ...lot(tuna.id, { locationId: auto.id, quantity: 2 }), updatedAt: '2026-10-29T12:00:00.000Z' };
    const min = { ...newEntity<StockMin>({ itemId: tuna.id, locationId: casa.id, minQuantity: 10 }), updatedAt: '2026-10-01T12:00:00.000Z' };
    const rows = minStockAlertRows(stockShortages([min], [inBox, elsewhere], all), [inBox, elsewhere], all, new Map([[tuna.id, tuna]]), (d) =>
      d ? d.toISOString().slice(0, 10) : '2026-10-30',
    );
    // El lote del auto no cuenta para el mínimo de la casa: la fecha es la del lote de la caja.
    expect(rows).toEqual([{ lotId: `min:${min.id}`, itemName: 'Atún', notifyFrom: '2026-10-20' }]);
  });

  it('faltantes de un botiquín: el nombre del botiquín viaja con el del artículo para agrupar el aviso', () => {
    const gasa = item({ name: 'Gasa' });
    const kit = { ...newEntity<Location>({ name: 'Botiquín del auto', parentId: null, depth: 1, notes: '', waypointId: null, kitType: 'trauma' }) };
    const pocket = { ...newEntity<Location>({ name: 'Bolsillo', parentId: kit.id, depth: 2, notes: '', waypointId: null, kitType: null }) };
    const locs = [kit, pocket, casa];
    const minInKit = newEntity<StockMin>({ itemId: gasa.id, locationId: kit.id, minQuantity: 5 });
    const minAtHome = newEntity<StockMin>({ itemId: gasa.id, locationId: casa.id, minQuantity: 5 });
    const rows = minStockAlertRows(stockShortages([minInKit, minAtHome], [], locs), [], locs, new Map([[gasa.id, gasa]]), (d) => (d ? d.toISOString().slice(0, 10) : '2026-10-30'));
    expect(rows.find((r) => r.lotId === `min:${minInKit.id}`)!.itemName).toBe(`Gasa${KIT_SEPARATOR}Botiquín del auto`);
    expect(rows.find((r) => r.lotId === `min:${minAtHome.id}`)!.itemName).toBe('Gasa');
  });
});
