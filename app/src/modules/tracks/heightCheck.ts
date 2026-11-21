import type { Track } from '@/core/model/types';
import { median } from '@/modules/altimeter/altimeter';
import { elevationAt, type HeightLoader } from '@/modules/maps/measure';
import { smoothElevations } from './gpx';

/**
 * Aviso de diferencia entre la altura del GPS y la del mapa. SOLO avisa: la altura, el desnivel y el perfil del recorrido siguen saliendo del GPS (decisión
 * del 2026-11-21: la única fuente es el GPS, ver `trackStats`). El mapa (modelo de elevación, ~30 m por punto, con ±10 m de error propio) se usa nada más que
 * para detectar un error fijo del GPS (típico: ~20 m, o decenas de metros si el celular da la altura sobre el elipsoide) y sugerir calibrar el Altímetro.
 */

/** Diferencia (GPS − mapa) desde la que se avisa: por debajo cae dentro del error del propio mapa. */
export const HEIGHT_WARN_M = 15;
/** Cuántos puntos del recorrido se comparan (sobra para una mediana y son pocas teselas). */
const SAMPLES = 24;
/** Mínimo de puntos con altura del mapa para opinar. */
const MIN_PAIRS = 8;
/** Qué parte de los puntos tiene que diferir hacia el mismo lado: un error fijo es parejo, un desnivel mal medido no. */
const SAME_SIDE = 0.75;

export interface HeightDifference {
  /** Mediana de (altura del GPS alisada − altura del mapa), en metros. Positivo: el GPS da más que el mapa. */
  diffM: number;
  /** Cuántos puntos se compararon. */
  n: number;
}

/** La diferencia que corresponde avisar, a partir de pares (GPS alisado, mapa); `null` si son pocos, si no es pareja o si es chica. */
export function heightDifferenceFrom(pairs: { gps: number; map: number }[]): HeightDifference | null {
  if (pairs.length < MIN_PAIRS) return null;
  const diffs = pairs.map((p) => p.gps - p.map);
  const diffM = median(diffs)!;
  if (Math.abs(diffM) < HEIGHT_WARN_M) return null;
  const same = diffs.filter((d) => Math.sign(d) === Math.sign(diffM)).length / diffs.length;
  return same >= SAME_SIDE ? { diffM, n: pairs.length } : null;
}

/** Compara la altura del GPS del recorrido con la del mapa (sin conexión y sin la zona descargada devuelve `null`). */
export async function heightDifference(track: Track, load?: HeightLoader): Promise<HeightDifference | null> {
  const pts: { lat: number; lon: number; gps: number }[] = [];
  for (const seg of track.segments) {
    const smooth = smoothElevations(seg);
    seg.forEach((p, i) => {
      const e = smooth[i];
      if (e !== null && e !== undefined) pts.push({ lat: p[0], lon: p[1], gps: e });
    });
  }
  if (pts.length < MIN_PAIRS) return null;
  const step = Math.max(1, Math.floor(pts.length / SAMPLES));
  const chosen = pts.filter((_, i) => i % step === 0).slice(0, SAMPLES);
  const maps = await Promise.all(chosen.map((p) => elevationAt(p, load).catch(() => null)));
  const pairs: { gps: number; map: number }[] = [];
  chosen.forEach((p, i) => {
    const m = maps[i];
    if (m !== null && m !== undefined) pairs.push({ gps: p.gps, map: m });
  });
  return heightDifferenceFrom(pairs);
}
