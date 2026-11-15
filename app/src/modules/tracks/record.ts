import { distanceMeters } from '@/core/geo/geo';
import type { Track, TrackGap } from '@/core/model/types';
import { simplify, trackStats, type TrackPoint } from './gpx';

/** Peor precisión aceptada: con más error el punto ensucia el recorrido. */
export const MAX_ACCURACY_M = 50;
/** Paso mínimo entre puntos: quieto, el GPS dibuja una maraña alrededor. */
const MIN_STEP_M = 8;
/** Con batería baja o en ahorro, menos puntos (el celular escribe y cifra menos); el recorrido casi no cambia. */
export const SAVER_STEP_M = 20;

/** ¿Este punto suma al recorrido? Ni con mala precisión ni a menos de un paso del anterior. */
export function shouldAdd(last: TrackPoint | undefined, fix: { lat: number; lon: number; accuracy: number }, minStepM = MIN_STEP_M): boolean {
  if (fix.accuracy > MAX_ACCURACY_M) return false;
  if (!last) return true;
  return distanceMeters({ lat: last[0], lon: last[1] }, fix) >= Math.max(minStepM, fix.accuracy / 2);
}

/** Agrega el punto al último tramo (cada pausa abre uno nuevo). */
export function addPoint(segments: TrackPoint[][], p: TrackPoint): TrackPoint[][] {
  const out = segments.length ? segments.slice() : [[]];
  out[out.length - 1] = [...out[out.length - 1]!, p];
  return out;
}

/** Une el último tramo con el anterior (un corte que el usuario prefiere cerrar con una recta). */
export function joinLastSegments(segments: TrackPoint[][]): TrackPoint[][] {
  if (segments.length < 2) return segments;
  return [...segments.slice(0, -2), [...segments.at(-2)!, ...segments.at(-1)!]];
}

/**
 * Un corte de la grabación (pantalla apagada: el navegador no da posiciones). Siempre se une con una recta, que **suma su distancia**
 * (es menos de lo que se caminó, pero no se borra) y se dibuja en otro color; para eso se anota desde dónde sale.
 */
export function openGap(gaps: TrackGap[] | undefined, gap: { from: number; to: number }, last: TrackPoint | undefined): TrackGap[] {
  return [...(gaps ?? []), { from: gap.from, to: gap.to, joined: true, ...(last ? { a: [last[0], last[1]] as [number, number] } : {}) }];
}

/** Llega el primer punto después del corte: cierra el último corte abierto con ese punto y el largo de la recta. */
export function closeGap(gaps: TrackGap[] | undefined, p: TrackPoint): TrackGap[] | undefined {
  const g = gaps?.at(-1);
  if (!gaps || !g || !g.a || g.b) return gaps;
  const b: [number, number] = [p[0], p[1]];
  const lengthM = Math.round(distanceMeters({ lat: g.a[0], lon: g.a[1] }, { lat: b[0], lon: b[1] }));
  return [...gaps.slice(0, -1), { ...g, b, lengthM }];
}

/** Si se pausa antes de que llegue el punto que cierra el corte, ese corte queda sin recta (lo que se camina en pausa no se une). */
export function dropOpenGap(gaps: TrackGap[] | undefined): TrackGap[] | undefined {
  const g = gaps?.at(-1);
  if (!gaps || !g || !g.a || g.b) return gaps;
  return [...gaps.slice(0, -1), { from: g.from, to: g.to, joined: false }];
}

/** Las rectas de los cortes ya cerrados, en [lon, lat], para dibujarlas en otro color. */
export function gapLines(gaps: TrackGap[] | undefined): [number, number][][] {
  return (gaps ?? []).flatMap((g) =>
    g.a && g.b
      ? // Un corte cerrado siguiendo un track cargado se dibuja por ese camino; si no, la recta.
        [[[g.a[1], g.a[0]] as [number, number], ...(g.path ?? []).map(([lat, lon]) => [lon, lat] as [number, number]), [g.b[1], g.b[0]] as [number, number]]]
      : [],
  );
}

/** Lo grabado, ya terminado: tramos de al menos dos puntos, datos con todo y el recorrido simplificado. */
export function finishedTrack(track: Track, durationS: number): Track | null {
  const segments = track.segments.filter((s) => s.length > 1);
  if (segments.length === 0) return null;
  return { ...track, ...trackStats(segments), segments: segments.map((s) => simplify(s, 3)), recording: false, durationS };
}

/** Los primeros `n` puntos grabados: el camino de ida, sin lo que se grabó volviendo. */
export function firstPoints(track: Track, n: number): Track {
  if (!(n > 1)) return track;
  const segments: Track['segments'] = [];
  let left = n;
  for (const s of track.segments) {
    if (left <= 0) break;
    segments.push(s.slice(0, left));
    left -= s.length;
  }
  return { ...track, segments };
}
