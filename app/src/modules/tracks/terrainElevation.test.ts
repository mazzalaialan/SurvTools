import { describe, expect, it } from 'vitest';
import type { Track } from '@/core/model/types';
import type { HeightLoader } from '@/modules/maps/measure';
import { SLOPE_TILE } from '@/modules/maps/slope';
import { ELEVATION_V } from './elevationFix';
import type { TrackPoint } from './gpx';
import { needsTerrain, PROFILE_POINTS, resampleProfile, TERRAIN_V, terrainStats, withTerrain } from './terrainElevation';

/** Terreno de mentira: cada píxel del mundo (a zoom 12) vale `height(gx, gy)`; las teselas se arman al pedirlas. */
const world = (height: (gx: number, gy: number) => number): HeightLoader => {
  const tiles = new Map<string, Float32Array>();
  return async (x, y) => {
    const key = `${x}/${y}`;
    let tile = tiles.get(key);
    if (!tile) {
      tile = new Float32Array(SLOPE_TILE * SLOPE_TILE);
      for (let py = 0; py < SLOPE_TILE; py++) for (let px = 0; px < SLOPE_TILE; px++) tile[py * SLOPE_TILE + px] = height(x * SLOPE_TILE + px, y * SLOPE_TILE + py);
      tiles.set(key, tile);
    }
    return tile;
  };
};

/** Píxel del mundo (zoom 12) donde empieza el recorrido de las pruebas, y cuántos píxeles ocupa su primer kilómetro aprox. */
const GX0 = Math.floor(((-58.63 + 180) / 360) * 2 ** 12 * SLOPE_TILE);
/** ~3 km hacia el este por la latitud de Buenos Aires: unos 3 píxeles de terreno por cada 100 m. */
const path = (n = 100) => Array.from({ length: n }, (_, i) => ({ lat: -34.58, lon: -58.63 + i * 0.0003 }));

const track = (over: Partial<Track> = {}): Track =>
  ({ id: 't', name: 'Caminata', desc: '', source: '', link: null, segments: [path(10).map((p) => [p.lat, p.lon, 40, 0] as TrackPoint)], waypoints: [], distanceM: 0, ascentM: 121, descentM: 126, minEle: 14, maxEle: 53, notes: '', recorded: true, recording: false, ...over }) as unknown as Track;

describe('altura del terreno de un recorrido', () => {
  it('terreno llano de 2 a 15 m: mínima, máxima y poco desnivel, aunque el GPS dijera 14 a 53 m', async () => {
    // Una loma suave de 12 m en el medio del recorrido.
    const hill = world((gx) => 3 + 12 * Math.exp(-(((gx - GX0 - 60) / 25) ** 2)));
    const s = await terrainStats(path(), hill);
    expect(s).not.toBeNull();
    expect(s!.minEle).toBeGreaterThan(2);
    expect(s!.maxEle).toBeLessThan(16);
    expect(s!.maxEle - s!.minEle).toBeLessThan(14);
    expect(s!.ascentM).toBeLessThan(30);
    expect(s!.profile).toHaveLength(PROFILE_POINTS);
  });

  it('una subida pareja se mide completa en el terreno', async () => {
    const slope = world((gx) => 100 + (gx - GX0) * 0.5);
    const s = await terrainStats(path(), slope);
    expect(s!.ascentM).toBeGreaterThan(30);
    expect(s!.descentM).toBe(0);
    expect(s!.profile[0]!).toBeLessThan(s!.profile.at(-1)!);
  });

  it('el ruido del propio modelo de terreno no se suma como desnivel ni da mínimas y máximas que no existen', async () => {
    // Terreno llano a 20 m con ±8 m de ruido de píxel a píxel: sin alisar sumaría cientos de metros de desnivel y daría extremos de 12 y 28 m.
    const noisy = world((gx) => 20 + ((gx * 7919) % 17) - 8);
    const s = await terrainStats(path(), noisy);
    expect(s!.ascentM).toBeLessThan(10);
    expect(s!.descentM).toBeLessThan(10);
    expect(s!.minEle).toBeGreaterThan(16);
    expect(s!.maxEle).toBeLessThan(24);
  });

  it('un pozo de un solo píxel no cambia la altura mínima', async () => {
    const pit = world((gx) => (gx === GX0 + 40 ? -30 : 10));
    const s = await terrainStats(path(), pit);
    expect(s!.minEle).toBeGreaterThan(8);
    expect(s!.maxEle).toBeLessThan(12);
  });

  it('en un circuito (termina donde empezó) la subida y la bajada son iguales', async () => {
    const wavy = world((gx) => 10 + 6 * Math.sin((gx - GX0) / 18));
    const out = await terrainStats(path(), wavy); // la ida termina lejos del inicio: no es circuito
    const back = [...path(), ...path().reverse()];
    const loop = await terrainStats(back, wavy);
    expect(loop!.ascentM).toBe(loop!.descentM);
    expect(loop!.ascentM).toBeGreaterThan(0);
    expect(out!.ascentM).not.toBeNull();
  });

  it('sin datos de elevación (sin conexión y sin zona descargada): no hay valores, se queda con el GPS', async () => {
    expect(await terrainStats(path(), async () => null)).toBeNull();
    // Un solo tramo sin datos (un borde del recorrido): tampoco se inventa nada.
    const partial: HeightLoader = async (x, y) => (x > Math.floor(GX0 / SLOPE_TILE) ? null : world(() => 5)(x, y));
    expect(await terrainStats(path(), partial)).toBeNull();
    expect(await terrainStats([{ lat: -34.58, lon: -58.63 }], world(() => 5))).toBeNull();
  });

  it('el perfil se reparte en alturas a intervalos iguales de distancia', () => {
    const p: [number, number][] = [[0, 0], [100, 10], [300, 10]];
    const r = resampleProfile(p, 7); // cada 50 m
    expect(r).toHaveLength(7);
    expect(r[0]).toBe(0);
    expect(r[1]).toBeCloseTo(5, 5);
    expect(r[2]).toBeCloseTo(10, 5);
    expect(r.at(-1)).toBeCloseTo(10, 5);
    expect(resampleProfile([], 5)).toEqual([]);
    expect(resampleProfile([[0, 7]], 3)).toEqual([7, 7, 7]);
  });

  it('el recorrido pasa a usar los valores del terreno y queda marcado para que el desnivel viejo no lo pise', () => {
    expect(needsTerrain(track())).toBe(true);
    const done = withTerrain(track(), { minEle: 2.5, maxEle: 15, ascentM: 24, descentM: 28, profile: [3, 5, 4] });
    expect(done).toMatchObject({ minEle: 2.5, maxEle: 15, ascentM: 24, descentM: 28, elevationV: ELEVATION_V, terrain: { profile: [3, 5, 4], v: TERRAIN_V } });
    expect(needsTerrain(done)).toBe(false);
    // Un cálculo anterior (sin versión) se rehace una vez.
    expect(needsTerrain({ ...done, terrain: { profile: [3, 5, 4] } })).toBe(true);
  });

  it('solo se calcula para recorridos grabados con la app, terminados y con puntos', () => {
    expect(needsTerrain(track({ recorded: false }))).toBe(false); // un GPX importado ya trae su altura
    expect(needsTerrain(track({ recording: true }))).toBe(false);
    expect(needsTerrain(track({ segments: [] }))).toBe(false);
  });
});
