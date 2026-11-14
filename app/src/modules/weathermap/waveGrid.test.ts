import { describe, expect, it } from 'vitest';
import { fetchWaveGrid, gridUrl, parseGrid, waveSegments, WAVE_COASTS, WAVE_GRID } from './waveGrid';

const cell = (lat: number, lon: number, h: number | null, extra: Record<string, number | null> = {}) => ({
  latitude: lat,
  longitude: lon,
  current: { time: 1_800_000_000, wave_height: h, wave_period: 8, wave_direction: 200, swell_wave_height: 1.2, swell_wave_period: 11, ...extra },
});

describe('oleaje en el mapa', () => {
  it('la grilla tiene unos 45 puntos de mar, sin repetir, dentro de Sudamérica', () => {
    expect(WAVE_GRID.length).toBeGreaterThanOrEqual(40);
    expect(new Set(WAVE_GRID.map((p) => p.join(','))).size).toBe(WAVE_GRID.length);
    for (const [lat, lon] of WAVE_GRID) {
      expect(lat).toBeGreaterThan(-56);
      expect(lat).toBeLessThan(0);
      expect(lon).toBeGreaterThan(-83);
      expect(lon).toBeLessThan(-50);
    }
  });

  it('la grilla son tres costas ordenadas de norte a sur, y cada punto sabe qué lugar ocupa', () => {
    expect(WAVE_COASTS).toHaveLength(3);
    for (const coast of WAVE_COASTS.slice(0, 2)) for (let i = 1; i < coast.length; i++) if (coast[i]![0] > coast[i - 1]![0] + 0.01) throw new Error('la cadena no va de norte a sur');
    expect(WAVE_GRID).toEqual(WAVE_COASTS.flat());
  });

  it('une de a dos los puntos vecinos con dato; los que quedan sin vecino van solos', () => {
    const spot = (index: number) => ({ index, lat: -1, lon: -1, height: 1, period: null, direction: null, swellHeight: null, swellPeriod: null });
    // 0-1-2 seguidos; el 4 tiene vacío al 3 y al 5; el 13 (último del Atlántico) y el 14 (primero del Pacífico) son de costas distintas y no se unen.
    const segs = waveSegments([spot(0), spot(1), spot(2), spot(4), spot(13), spot(14)]);
    expect(segs.map((x) => [x.a.index, x.b?.index ?? null])).toEqual([[0, 1], [1, 2], [4, null], [13, null], [14, null]]);
  });

  it('una sola consulta con todas las coordenadas, al servidor marino (o al propio si la base no es la pública)', () => {
    const url = gridUrl('https://api.open-meteo.com/');
    expect(url.startsWith('https://marine-api.open-meteo.com/v1/marine?latitude=')).toBe(true);
    const lat = new URL(url).searchParams.get('latitude')!.split(',');
    const lon = new URL(url).searchParams.get('longitude')!.split(',');
    expect(lat).toHaveLength(WAVE_GRID.length);
    expect(lon).toHaveLength(WAVE_GRID.length);
    expect(new URL(url).searchParams.get('current')).toContain('wave_height');
    expect(gridUrl('https://clima.mi-servidor.test').startsWith('https://clima.mi-servidor.test/v1/marine')).toBe(true);
  });

  it('lee los puntos con ola y descarta los que el modelo no cubre', () => {
    const g = parseGrid([cell(-38.8, -57, 2.3), cell(-34.6, -58.4, null), cell(-23.7, -71, 1.1, { swell_wave_height: null })], 5)!;
    expect(g.spots).toHaveLength(2);
    expect(g.spots.map((x) => x.index)).toEqual([0, 2]);
    expect(g.spots[0]).toMatchObject({ lat: -38.8, lon: -57, height: 2.3, period: 8, direction: 200, swellHeight: 1.2 });
    expect(g.spots[1]!.swellHeight).toBeNull();
    expect(g.at).toBe(1_800_000_000_000);
    expect(g.fetchedAt).toBe(5);
    expect(parseGrid([cell(-1, -1, null)])).toBeNull();
    expect(parseGrid(null)).toBeNull();
    expect(parseGrid('x')).toBeNull();
  });

  it('con una sola coordenada la respuesta es un objeto y también se lee', () => {
    expect(parseGrid(cell(-38.8, -57, 2.3))!.spots).toHaveLength(1);
  });

  it('un error del servidor se informa', async () => {
    const fake = (async () => new Response('x', { status: 500 })) as unknown as typeof fetch;
    await expect(fetchWaveGrid('https://api.open-meteo.com', fake)).rejects.toThrow('500');
    const ok = (async () => new Response(JSON.stringify([cell(-38.8, -57, 2.3)]))) as unknown as typeof fetch;
    expect((await fetchWaveGrid('https://api.open-meteo.com', ok))!.spots).toHaveLength(1);
  });
});
