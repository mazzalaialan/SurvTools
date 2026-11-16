import { describe, expect, it } from 'vitest';
import { CONTINENT_BOUNDS } from './projection';

describe('contornos del mapa base', () => {
  it('trae América Central y la Antártida, y el alejado máximo los incluye', async () => {
    const { loadGeoData } = await import('./geo');
    const geo = await loadGeoData();
    for (const code of ['AQ', 'GT', 'BZ', 'SV', 'HN', 'NI', 'CR', 'PA']) {
      expect(geo.neighbors.find((n) => n.code === code)?.rings.length, code).toBeGreaterThan(0);
      expect(geo.countries.some((c) => c.code === code), code).toBe(true);
    }
    expect(CONTINENT_BOUNDS.south).toBeLessThanOrEqual(-70);
    expect(CONTINENT_BOUNDS.north).toBeGreaterThanOrEqual(18);
  });
});
