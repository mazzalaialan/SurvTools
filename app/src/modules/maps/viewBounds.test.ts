import { describe, expect, it } from 'vitest';
import { containsBox, nextAreaBox, viewBounds } from './viewBounds';

describe('área que se pide a las capas', () => {
  const v = { lat: -40, lon: -71.4, zoom: 10 };
  it('la vista es chica con zoom alto y el margen la triplica', () => {
    const [w, s, e, n] = viewBounds(v);
    expect(e - w).toBeLessThan(1);
    expect(n - s).toBeLessThan(1);
    const big = viewBounds(v, 1);
    expect(big[2] - big[0]).toBeCloseTo((e - w) * 3, 6);
    expect(containsBox(big, viewBounds(v))).toBe(true);
  });
  it('mover un poco no cambia el área; salirse sí', () => {
    const first = nextAreaBox(null, v);
    expect(nextAreaBox(first, { ...v, lon: v.lon + 0.05 })).toBe(first);
    const far = nextAreaBox(first, { ...v, lon: v.lon + 5 });
    expect(far).not.toBe(first);
    expect(containsBox(far, viewBounds({ ...v, lon: v.lon + 5 }))).toBe(true);
  });
  it('no pasa de los límites del mundo', () => {
    const w = viewBounds({ lat: 80, lon: 179, zoom: 1 }, 1);
    expect(w[2]).toBeLessThanOrEqual(180);
    expect(w[3]).toBeLessThanOrEqual(90);
  });
});
