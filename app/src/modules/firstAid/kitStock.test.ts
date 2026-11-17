import { describe, expect, it } from 'vitest';
import type { Lot, Location } from '@/core/model/types';
import { lotsOutsideKits, moveToKit, planMove, quantityInKits } from './kitStock';

const loc = (id: string, kitType: Location['kitType'] = null, parentId: string | null = null): Location =>
  ({ id, name: id, parentId, depth: 1, notes: '', waypointId: null, kitType, createdAt: '', updatedAt: '', deletedAt: null }) as Location;
const lot = (id: string, locationId: string, quantity: number, expiryDate: string | null = null, itemId = 'gasa'): Lot =>
  ({ id, itemId, locationId, quantity, packageCount: null, packageSize: null, packageName: null, packageTareGrams: null, expiryDate, manufactureDate: null, shelfLifeMonths: null, capacityTotal: null, capacityRemaining: null, capacityUnit: null, notes: '', createdAt: '', updatedAt: '', deletedAt: null }) as Lot;

const locations = [loc('placard'), loc('estante', null, 'placard'), loc('auto', 'trauma'), loc('bolsillo', null, 'auto'), loc('nuevo', 'general')];

describe('stock que puede pasar a un botiquín', () => {
  const lots = [lot('a', 'placard', 4, '2027-05-01'), lot('b', 'estante', 3, '2026-12-01'), lot('c', 'auto', 5), lot('d', 'bolsillo', 2), lot('e', 'placard', 9, null, 'otro')];

  it('solo cuenta lo que está fuera de los botiquines (los bolsillos de un botiquín también son botiquín)', () => {
    expect(lotsOutsideKits('gasa', lots, locations).map((l) => l.id).sort()).toEqual(['a', 'b']);
    expect(quantityInKits('gasa', lots, locations)).toBe(7);
  });

  it('toma primero lo que vence antes y deja lo que no vence para el final', () => {
    const plan = planMove([lot('x', 'placard', 4, null), lot('y', 'placard', 3, '2026-12-01'), lot('z', 'placard', 2, '2027-05-01')], 6);
    expect(plan.map((s) => [s.source.id, s.take])).toEqual([['y', 3], ['z', 2], ['x', 1]]);
  });

  it('mueve lotes enteros y parte el último; no toca lo de otros botiquines', async () => {
    const saved: Lot[] = [];
    const moved = await moveToKit('nuevo', 'gasa', 5, lots, locations, async (l) => void saved.push(l));
    expect(moved).toBe(5);
    // b (3, vence antes) se mueve entero; a (4) se parte: 2 pasan y 2 quedan en el placard.
    const b = saved.find((l) => l.id === 'b')!;
    expect(b.locationId).toBe('nuevo');
    expect(b.quantity).toBe(3);
    const rest = saved.find((l) => l.id === 'a')!;
    expect(rest.locationId).toBe('placard');
    expect(rest.quantity).toBe(2);
    const split = saved.find((l) => l.id !== 'a' && l.id !== 'b')!;
    expect(split.locationId).toBe('nuevo');
    expect(split.quantity).toBe(2);
    expect(split.expiryDate).toBe('2027-05-01');
    expect(saved.some((l) => l.id === 'c' || l.id === 'd')).toBe(false);
  });

  it('si hay menos de lo pedido, pasa lo que hay', async () => {
    const saved: Lot[] = [];
    expect(await moveToKit('nuevo', 'gasa', 50, lots, locations, async (l) => void saved.push(l))).toBe(7);
  });

  it('sin nada fuera de los botiquines no mueve nada', async () => {
    expect(await moveToKit('nuevo', 'otro-item', 3, lots, locations, async () => undefined)).toBe(0);
  });
});
