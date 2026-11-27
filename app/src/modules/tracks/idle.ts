import { distanceMeters } from '@/core/geo/geo';
import type { TrackPoint } from './gpx';

/**
 * Descansos y grabaciones olvidadas: tramos en los que no te moviste (te quedaste en un radio chico) durante mucho tiempo. Al guardar,
 * la app los muestra y pregunta si recortarlos; recortar saca los puntos de adentro y descuenta ese tiempo de la duración.
 *
 * Quieto, el GPS igual mueve el punto unos metros (y se graba cada vez que se corre más de un paso), así que no alcanza con mirar el
 * tiempo entre dos puntos: se buscan rachas de puntos que quedan todos cerca del primero de la racha.
 */

/** Cuánto tiempo quieto cuenta como descanso. */
export const IDLE_MIN_S = 10 * 60;
/** Radio (m) dentro del cual se considera que no te moviste (el GPS quieto deambula unos metros). */
export const IDLE_RADIUS_M = 60;

export interface IdleSpan {
  /** Hora (s, Unix) del primer punto quieto y del último (o de ahora, si la grabación siguió sin moverte hasta el final). */
  from: number;
  to: number;
  /** Lugar del descanso. */
  lat: number;
  lon: number;
  /** El final de la grabación: seguiste grabando sin moverte (¿te olvidaste de terminar?). Recortarlo corta el recorrido ahí. */
  tail: boolean;
  /** El principio: empezaste a grabar y tardaste en salir. */
  head: boolean;
}

/**
 * Descansos de una grabación. `nowS`: ahora (s), para el final: si después del último punto pasó mucho tiempo, también es un tramo
 * quieto (el GPS no graba si no te movés).
 */
export function detectIdle(segments: TrackPoint[][], nowS: number, minS = IDLE_MIN_S, radiusM = IDLE_RADIUS_M): IdleSpan[] {
  const pts = segments.flat().filter((p) => typeof p[3] === 'number');
  if (pts.length < 2) return [];
  const spans: IdleSpan[] = [];
  let i = 0;
  while (i < pts.length) {
    const a = pts[i]!;
    let j = i;
    while (j + 1 < pts.length && distanceMeters({ lat: a[0], lon: a[1] }, { lat: pts[j + 1]![0], lon: pts[j + 1]![1] }) <= radiusM) j++;
    const last = j === pts.length - 1;
    // Hasta el próximo punto lejano (ahí ya te habías ido) o, si es el final, hasta ahora.
    const to = last ? Math.max(pts[j]![3]!, nowS) : pts[j]![3]!;
    if (to - a[3]! >= minS) {
      spans.push({ from: a[3]!, to, lat: a[0], lon: a[1], tail: last, head: i === 0 && !last });
      i = j + 1;
    } else i++;
  }
  return spans;
}

/** Saca de los tramos los puntos que caen adentro de los descansos elegidos (deja el primero; en el final, corta ahí). */
export function trimIdle(segments: TrackPoint[][], spans: IdleSpan[]): TrackPoint[][] {
  if (!spans.length) return segments;
  const inside = (t: number | undefined) => typeof t === 'number' && spans.some((s) => (s.tail ? t > s.from : s.head ? t >= s.from && t < s.to : t > s.from && t < s.to));
  return segments.map((seg) => seg.filter((p) => !inside(p[3]))).filter((seg) => seg.length > 0);
}

/** Segundos que se descuentan de la duración al recortar esos descansos. */
export function idleSeconds(spans: IdleSpan[]): number {
  return spans.reduce((n, s) => n + Math.max(0, s.to - s.from), 0);
}
