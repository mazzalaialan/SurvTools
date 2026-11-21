import { repos } from '@/core/db/repository';
import { touch } from '@/core/model/entity';
import type { Track } from '@/core/model/types';
import { summarizePath, type HeightLoader } from '@/modules/maps/measure';
import { useTraining } from '@/modules/training/store';
import { ELEVATION_V } from './elevationFix';
import { useTracks } from './store';

/**
 * Altura del terreno para un recorrido grabado. La altura del GPS de un celular tiene ~20 m de error fijo y oscila (en una caminata llana de 3,4 km daba
 * alturas de 14 a 53 m donde el terreno va de 2,5 a 15 m); el modelo de elevación del mapa (el de las curvas de nivel, ~30 m por punto) es parejo.
 * Con él se calculan la altura mínima y máxima, el desnivel y el perfil que se dibuja. Sin datos de terreno (sin conexión y sin zona descargada) queda lo
 * que midió el GPS, alisado (ver `trackStats`).
 */

/** Cuántas alturas se guardan del perfil: sobra para dibujarlo (el gráfico mide ~300 px) y pesa poco. */
export const PROFILE_POINTS = 120;

export interface TerrainStats {
  minEle: number;
  maxEle: number;
  ascentM: number;
  descentM: number;
  /** Alturas a intervalos iguales de distancia (`PROFILE_POINTS`). */
  profile: number[];
}

/** Reparte el perfil [distancia, altura] en `n` alturas a intervalos iguales de distancia. */
export function resampleProfile(profile: [number, number][], n = PROFILE_POINTS): number[] {
  if (profile.length === 0) return [];
  if (profile.length === 1) return Array.from({ length: n }, () => profile[0]![1]);
  const total = profile.at(-1)![0];
  if (total <= 0) return Array.from({ length: n }, () => profile[0]![1]);
  const out: number[] = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const d = (total * i) / (n - 1);
    while (j < profile.length - 2 && profile[j + 1]![0] < d) j++;
    const [d0, h0] = profile[j]!;
    const [d1, h1] = profile[j + 1]!;
    const f = d1 > d0 ? Math.max(0, Math.min(1, (d - d0) / (d1 - d0))) : 0;
    out.push(h0 + (h1 - h0) * f);
  }
  return out;
}

/** Altura mínima, máxima, desnivel y perfil del terreno bajo los puntos del recorrido, o `null` si faltan datos de elevación. */
export async function terrainStats(points: { lat: number; lon: number }[], load?: HeightLoader): Promise<TerrainStats | null> {
  if (points.length < 2) return null;
  const s = await summarizePath(points, load);
  if (s.ascent === null || s.descent === null || s.min === null || s.max === null || s.profile.length < 2) return null;
  return {
    minEle: s.min,
    maxEle: s.max,
    ascentM: Math.round(s.ascent),
    descentM: Math.round(s.descent),
    profile: resampleProfile(s.profile).map((h) => Math.round(h * 10) / 10),
  };
}

/** El recorrido con los valores del terreno (altura mínima y máxima, desnivel y perfil). */
export function withTerrain(t: Track, stats: TerrainStats): Track {
  return {
    ...t,
    minEle: stats.minEle,
    maxEle: stats.maxEle,
    ascentM: stats.ascentM,
    descentM: stats.descentM,
    // El desnivel ya no sale del GPS: la migración del alisado no lo pisa.
    elevationV: ELEVATION_V,
    terrain: { profile: stats.profile },
  };
}

/** Solo los grabados con la app y terminados, que todavía no tienen la altura del terreno. */
export const needsTerrain = (t: Track): boolean => t.recorded === true && !t.recording && !t.terrain && t.segments.flat().length >= 2;

/** Pasa la altura y el desnivel del terreno a la actividad de Entrenamiento que usa este recorrido. */
async function syncWorkouts(t: Track): Promise<void> {
  const workouts = await repos.workouts.loadAll();
  let touched = false;
  for (const w of workouts) {
    if (w.trackId !== t.id) continue;
    if (w.ascentM === t.ascentM && w.descentM === t.descentM && w.minEle === t.minEle && w.maxEle === t.maxEle) continue;
    await repos.workouts.put(touch({ ...w, ascentM: t.ascentM, descentM: t.descentM, minEle: t.minEle, maxEle: t.maxEle }));
    touched = true;
  }
  if (touched && useTraining.getState().loaded) await useTraining.getState().load();
}

const attempts = new Map<string, number>();
/** Sin conexión no se insiste a cada rato: se vuelve a intentar a los 10 minutos. */
const RETRY_MS = 10 * 60_000;

/**
 * Calcula (una sola vez por recorrido) la altura del terreno y la guarda, junto con la de la actividad. Sin datos de elevación no cambia nada y se
 * reintenta más tarde. Devuelve si se guardó algo.
 */
export async function ensureTerrain(trackId: string, load?: HeightLoader): Promise<boolean> {
  const track = useTracks.getState().tracks.get(trackId);
  if (!track || !needsTerrain(track)) return false;
  const last = attempts.get(trackId);
  if (last !== undefined && Date.now() - last < RETRY_MS) return false;
  attempts.set(trackId, Date.now());
  const stats = await terrainStats(
    track.segments.flat().map((p) => ({ lat: p[0], lon: p[1] })),
    load,
  ).catch(() => null);
  if (!stats) return false;
  // El recorrido pudo cambiar mientras se leía el terreno: se parte del actual.
  const current = useTracks.getState().tracks.get(trackId);
  if (!current || !needsTerrain(current)) return false;
  const next = withTerrain(current, stats);
  await useTracks.getState().saveTrack(next);
  await syncWorkouts(next);
  attempts.delete(trackId);
  return true;
}
