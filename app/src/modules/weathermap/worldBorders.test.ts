import { statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import world from './world-borders.json';
import geo from './geo-data.json';

const FILE = new URL('./world-borders.json', import.meta.url);

describe('contorno de todos los países del mundo (mapa del clima)', () => {
  it('pesa poco: se carga aparte y no engorda el mapa base', () => {
    expect(statSync(FILE).size).toBeLessThan(250_000);
  });

  it('trae casi todos los países del mundo, sin repetir los que ya están en el mapa base', () => {
    const codes = world.countries.map((c) => c.code);
    expect(codes.length).toBeGreaterThan(170);
    for (const code of ['US', 'MX', 'CN', 'RU', 'ES', 'ZA', 'AU', 'IN', 'GL']) expect(codes).toContain(code);
    const own = new Set([...geo.neighbors.map((n) => n.code), ...geo.regions.map((r) => r.country)]);
    for (const code of codes) expect(own.has(code), `${code} ya está en el mapa base`).toBe(false);
    // Las Malvinas van con la Argentina, la Antártida ya está recortada y la Guayana Francesa viene del mapa base.
    for (const code of ['FK', 'GS', 'AQ']) expect(codes).not.toContain(code);
  });

  it('las coordenadas son válidas y entran en el mapa (la proyección Mercator no llega a los polos)', () => {
    for (const c of world.countries) {
      expect(c.rings.length).toBeGreaterThan(0);
      for (const ring of c.rings) {
        expect(ring.length % 2).toBe(0);
        expect(ring.length).toBeGreaterThanOrEqual(8);
        for (let i = 0; i < ring.length; i += 2) {
          expect(Math.abs(ring[i]!)).toBeLessThanOrEqual(180);
          expect(Math.abs(ring[i + 1]!)).toBeLessThanOrEqual(84);
        }
      }
    }
  });

  it('Francia no trae la Guayana Francesa (ya está en el mapa base)', () => {
    const fr = world.countries.find((c) => c.code === 'FR')!;
    for (const ring of fr.rings) {
      const lons = ring.filter((_, i) => i % 2 === 0);
      const lats = ring.filter((_, i) => i % 2 === 1);
      const lon = lons.reduce((a, b) => a + b, 0) / lons.length;
      const lat = lats.reduce((a, b) => a + b, 0) / lats.length;
      expect(lon > -55 && lon < -51 && lat > 2 && lat < 6).toBe(false);
    }
  });
});
