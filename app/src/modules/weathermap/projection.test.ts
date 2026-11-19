import { describe, expect, it } from 'vitest';
import { CONTINENT_BOUNDS, MAP_EXTENT, clampView, fitBounds, fromMercator, toMercator, viewBBox, type Size, type View } from './projection';

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

describe('límite del desplazamiento (no se sale del mapa)', () => {
  const size: Size = { width: 800, height: 600 };
  const home = fitBounds(CONTINENT_BOUNDS, size);
  const edges = (v: View) => {
    const b = viewBBox(v, size);
    return { sw: fromMercator(b.minX, b.minY), ne: fromMercator(b.maxX, b.maxY) };
  };

  it('una vista dentro del mapa no se toca', () => {
    expect(clampView(home, size)).toBe(home);
  });

  it('al arrastrar lejos, el borde de la pantalla se frena en el borde del mapa', () => {
    const west = clampView({ ...home, cx: toMercator(-400, 0).x }, size);
    expect(edges(west).sw.lon).toBeCloseTo(-180, 3);
    const east = clampView({ ...home, cx: toMercator(400, 0).x }, size);
    expect(edges(east).ne.lon).toBeCloseTo(180, 3);
    const north = clampView({ ...home, cy: toMercator(0, 84.9).y * 5 }, size);
    expect(edges(north).ne.lat).toBeCloseTo(MAP_EXTENT.north, 3);
    const south = clampView({ ...home, cy: -toMercator(0, 84.9).y * 5 }, size);
    expect(edges(south).sw.lat).toBeCloseTo(MAP_EXTENT.south, 3);
  });

  it('muy alejado (el mapa entra entero), queda centrado en vez de mostrar vacío de un solo lado', () => {
    const far: View = { cx: toMercator(100, 0).x, cy: 0, scale: 800 / (2 * Math.PI * 6_378_137) / 1.5 };
    expect(clampView(far, size).cx).toBeCloseTo(0, 3);
  });
});
