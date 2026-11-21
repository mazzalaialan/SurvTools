import { repos } from '@/core/db/repository';
import { touch } from '@/core/model/entity';
import type { Track } from '@/core/model/types';
import { useTraining } from '@/modules/training/store';
import { trackStats } from './gpx';
import { useTracks } from './store';

/** Versión actual del cálculo del desnivel y la altura (ver `trackStats`): 5 = todo sobre la altura del GPS alisada, con el saldo cerrado. */
export const ELEVATION_V = 5;

/** ¿Hay que recalcular el desnivel de este recorrido? Solo los grabados con la app (con el GPS del celular, que es el ruidoso) y todavía con el cálculo viejo. */
export const needsElevationFix = (t: Track): boolean => t.recorded === true && !t.recording && t.elevationV !== ELEVATION_V;

/** El recorrido con el desnivel recalculado con el cálculo actual (a partir de sus puntos guardados). */
export function withFixedElevation(t: Track): Track {
  const stats = trackStats(t.segments);
  // `terrain` quedó de una prueba que usaba la altura del mapa como dato: la fuente es el GPS y se descarta.
  const { terrain: _unused, ...rest } = t as Track & { terrain?: unknown };
  return { ...rest, ascentM: stats.ascentM, descentM: stats.descentM, minEle: stats.minEle, maxEle: stats.maxEle, elevationV: ELEVATION_V };
}

/**
 * Una sola vez por recorrido: el desnivel que se guardó con el cálculo viejo sumaba el ruido de la altura del GPS (en una caminata llana de 3,4 km
 * daba +121 m contra ~25 m reales). Se recalcula con la altura alisada (la fuente sigue siendo el GPS: no se usa el mapa para poner ningún valor) y se corrige también la
 * actividad de Entrenamiento que lo usa.
 */
export async function migrateElevation(): Promise<void> {
  const { tracks, saveTrack } = useTracks.getState();
  const fixed = new Map<string, Track>();
  for (const t of tracks.values()) {
    if (needsElevationFix(t)) fixed.set(t.id, withFixedElevation(t));
  }
  if (fixed.size === 0) return;
  for (const t of fixed.values()) await saveTrack(t);
  const workouts = await repos.workouts.loadAll();
  let touched = false;
  for (const w of workouts) {
    const t = w.trackId ? fixed.get(w.trackId) : undefined;
    if (!t || (w.ascentM === t.ascentM && w.descentM === t.descentM && w.minEle === t.minEle && w.maxEle === t.maxEle)) continue;
    await repos.workouts.put(touch({ ...w, ascentM: t.ascentM, descentM: t.descentM, minEle: t.minEle, maxEle: t.maxEle }));
    touched = true;
  }
  if (touched && useTraining.getState().loaded) await useTraining.getState().load();
}
