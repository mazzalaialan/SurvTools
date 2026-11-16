import { afterEach, describe, expect, it, vi } from 'vitest';
import { fitBounds, fromMercator, project, REGION_BOUNDS, tileBBox, tilesFor, toMercator, unproject, zoomAt } from './projection';
import { fireDays, frameTimes, latestSatellite, MapSourceError, parseHazards, parseNoaaTimes, parseQuakes, parseZoneWeather, satelliteUrl, zoneWeatherUrl } from './sources';

describe('proyección Mercator', () => {
  it('ida y vuelta', () => {
    const m = toMercator(-58.38, -34.6);
    const back = fromMercator(m.x, m.y);
    expect(back.lon).toBeCloseTo(-58.38, 6);
    expect(back.lat).toBeCloseTo(-34.6, 6);
  });

  it('la vista inicial muestra los tres países completos', () => {
    const size = { width: 360, height: 600 };
    const view = fitBounds(REGION_BOUNDS, size);
    for (const [lon, lat] of [[-73.5, -54.9], [-53.3, -33.7], [-68.6, -22.0]]) {
      const p = project(lon!, lat!, view, size);
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(size.width);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(size.height);
    }
  });

  it('el zoom deja fijo el punto bajo el dedo', () => {
    const size = { width: 400, height: 600 };
    const view = fitBounds(REGION_BOUNDS, size);
    const before = unproject(100, 200, view, size);
    const after = unproject(100, 200, zoomAt(view, size, 2, 100, 200), size);
    expect(after.lon).toBeCloseTo(before.lon, 6);
    expect(after.lat).toBeCloseTo(before.lat, 6);
  });

  it('teselas: cubren la vista y sus límites coinciden con la grilla', () => {
    const size = { width: 400, height: 600 };
    const view = fitBounds(REGION_BOUNDS, size);
    const tiles = tilesFor(view, size, 4);
    expect(tiles.length).toBeGreaterThan(0);
    const ba = toMercator(-58.38, -34.6);
    expect(tiles.some((t) => {
      const b = tileBBox(t.x, t.y, t.z);
      return ba.x >= b.minX && ba.x <= b.maxX && ba.y >= b.minY && ba.y <= b.maxY;
    })).toBe(true);
  });
});

describe('fuentes', () => {
  it('animación: 13 imágenes cada 10 minutos, de la más vieja a la última', () => {
    const times = frameTimes(new Date('2026-10-31T15:00:00Z'));
    expect(times).toHaveLength(13);
    expect(times[0]!.toISOString()).toBe('2026-10-31T13:00:00.000Z');
    expect(times.at(-1)!.toISOString()).toBe('2026-10-31T15:00:00.000Z');
  });

  it('focos de calor: ayer y hoy (UTC)', () => {
    expect(fireDays(new Date('2026-10-31T02:00:00Z'))).toEqual(['2026-10-30', '2026-10-31']);
  });

  it('sismos: solo la región, los más nuevos primero', () => {
    const f = (id: string, lon: number, lat: number, time: number) => ({
      id,
      properties: { mag: 4.1, place: id, time, url: `https://x/${id}` },
      geometry: { coordinates: [lon, lat, 30] as [number, number, number] },
    });
    const quakes = parseQuakes({ features: [f('japon', 140, 35, 3), f('mendoza', -68.8, -32.9, 1), f('chile', -71, -30, 2)] });
    expect(quakes.map((q) => q.id)).toEqual(['chile', 'mendoza']);
    expect(quakes[0]).toMatchObject({ depthKm: 30, mag: 4.1 });
  });

  it('GDACS: tipos útiles dentro de la región (los sismos vienen de USGS)', () => {
    const f = (type: string, lon: number, lat: number, level = 'Orange') => ({
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: { eventtype: type, eventid: 1, episodeid: 1, name: `${type} test`, alertlevel: level, fromdate: '2026-10-30T00:00:00', todate: '2026-10-31T00:00:00' },
    });
    const hazards = parseHazards({ features: [f('WF', -64, -27), f('EQ', -70, -30), f('TC', 140, 20), f('FL', -58, -34, 'Weird')] });
    expect(hazards.map((h) => [h.type, h.level])).toEqual([['WF', 'Orange'], ['FL', 'Green']]);
  });

  it('clima por zona: una consulta con todos los puntos, en el mismo orden', () => {
    const points = [{ name: 'A', lon: -58.4, lat: -34.6 }, { name: 'B', lon: -64.2, lat: -31.4 }];
    expect(zoneWeatherUrl('https://api.open-meteo.com/', points)).toContain('latitude=-34.600%2C-31.400');
    const cur = (temp: number | null) => ({ current: { temperature_2m: temp, precipitation: 0.2, weather_code: 61, wind_speed_10m: 12, wind_direction_10m: 90, wind_gusts_10m: 30 } });
    expect(parseZoneWeather([cur(21), cur(null)], points).map((z) => [z.name, z.temp])).toEqual([['A', 21]]);
    expect(parseZoneWeather(cur(18), points.slice(0, 1))[0]).toMatchObject({ name: 'A', temp: 18, precip: 0.2 });
  });
});

describe('rayos en el mapa', () => {
  it('los ⚡ titilan a destiempo y se ven un rato', async () => {
    const { lightningVisible } = await import('./MapCanvas');
    const on = (key: number) => Array.from({ length: 120 }, (_, t) => lightningVisible(key, t)).filter(Boolean).length;
    for (const key of [1, 42, 100_123]) {
      expect(on(key)).toBeGreaterThan(20);
      expect(on(key)).toBeLessThan(70);
    }
    const pattern = (key: number) => Array.from({ length: 24 }, (_, t) => (lightningVisible(key, t) ? 1 : 0)).join('');
    expect(new Set([1, 2, 3, 4, 5].map(pattern)).size).toBeGreaterThan(1);
  });

  it('los anillos miden lo mismo en km a cualquier latitud', async () => {
    const { kmToPx } = await import('./MapCanvas');
    // En Mercator, 30 km en Ushuaia ocupan más píxeles que en Salta.
    expect(kmToPx(30, -54.8, 1)).toBeGreaterThan(kmToPx(30, -24.8, 1));
    expect(kmToPx(30, 0, 0.001)).toBeCloseTo(30, 5);
  });
});

describe('satélite: NASA primero, NOAA de respaldo y nada de imágenes de más de 2 horas', () => {
  afterEach(() => vi.unstubAllGlobals());
  // Fragmento real del GetCapabilities de NOAA nowCOAST (16-nov-2026): una imagen por hora.
  const capabilities = `<Layer><Name>global_longwave_imagery_mosaic</Name><Title>Global Satellite Longwave Imagery</Title><Dimension name="time" default="2026-11-16T21:00:00Z" units="ISO8601" nearestValue="1">2026-11-16T16:00:00.000Z,2026-11-16T17:00:00.000Z,2026-11-16T18:00:00.000Z,2026-11-16T19:00:00.000Z,2026-11-16T20:00:00.000Z,2026-11-16T21:00:00.000Z</Dimension></Layer>`;

  it('lee los horarios del mosaico de NOAA', () => {
    const times = parseNoaaTimes(capabilities);
    expect(times).toHaveLength(6);
    expect(times[0]!.toISOString()).toBe('2026-11-16T16:00:00.000Z');
    expect(times.at(-1)!.toISOString()).toBe('2026-11-16T21:00:00.000Z');
    expect(parseNoaaTimes('<Layer><Name>otra</Name></Layer>')).toEqual([]);
  });

  /** fetch falso: NASA responde según `gibsFresh` (imagen con contenido o PNG vacío de 75 bytes, como el real) y NOAA con el GetCapabilities de arriba. */
  function fakeFetch(opts: { gibsFresh: boolean; noaa?: 'ok' | 'down' }) {
    return vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes('gibs.earthdata.nasa.gov')) return new Response(new Uint8Array(opts.gibsFresh ? 930 : 75), { status: 200 });
      if (u.includes('nowcoast.noaa.gov')) {
        if (opts.noaa === 'down') throw new TypeError('sin red');
        return new Response(capabilities, { status: 200 });
      }
      throw new Error(`pedido inesperado: ${u}`);
    });
  }
  const at = (iso: string) => new Date(iso);

  it('con NASA al día usa NASA (cada 10 minutos)', async () => {
    vi.stubGlobal('fetch', fakeFetch({ gibsFresh: true }));
    const r = await latestSatellite(at('2026-11-16T22:36:00Z'));
    expect(r).not.toBe('stale');
    if (r === 'stale') return;
    expect(r.source).toBe('gibs');
    expect(r.times).toHaveLength(13);
    expect(r.times.at(-1)!.toISOString()).toBe('2026-11-16T22:10:00.000Z');
  });

  it('con NASA atrasada (hoy: 6 horas) usa el mosaico de NOAA, con sus horas', async () => {
    vi.stubGlobal('fetch', fakeFetch({ gibsFresh: false }));
    const r = await latestSatellite(at('2026-11-16T22:36:00Z'));
    expect(r).not.toBe('stale');
    if (r === 'stale') return;
    expect(r.source).toBe('noaa');
    expect(r.times.at(-1)!.toISOString()).toBe('2026-11-16T21:00:00.000Z');
    expect(r.times.length).toBeLessThanOrEqual(6);
  });

  it('si las dos están a más de 2 horas no se muestra ninguna: «stale» (nunca una imagen vieja)', async () => {
    vi.stubGlobal('fetch', fakeFetch({ gibsFresh: false }));
    // NOAA: la última es de las 21:00 y son las 23:30 (2 h 30): fuera del límite.
    expect(await latestSatellite(at('2026-11-16T23:30:00Z'))).toBe('stale');
  });

  it('sin conexión a ninguna fuente es un error y no un «stale»', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('sin red'); }));
    await expect(latestSatellite(at('2026-11-16T22:36:00Z'))).rejects.toBeInstanceOf(MapSourceError);
  });

  it('la dirección de cada fuente trae su capa y la hora', () => {
    const view = { cx: -7_100_000, cy: -4_900_000, scale: 256 / 2_600_000 };
    const size = { width: 256, height: 256 };
    const gibs = satelliteUrl('gibs', '2026-11-16T22:10:00Z', view, size);
    expect(gibs).toContain('gibs.earthdata.nasa.gov');
    expect(gibs).toContain('GOES-East_ABI_Band13_Clean_Infrared');
    const noaa = satelliteUrl('noaa', '2026-11-16T21:00:00Z', view, size);
    expect(noaa).toContain('nowcoast.noaa.gov');
    expect(noaa).toContain('global_longwave_imagery_mosaic');
    expect(noaa).toContain('TIME=2026-11-16T21%3A00%3A00Z');
  });
});
