import { distanceMeters } from '@/core/geo/geo';
import type { TrackGap } from '@/core/model/types';
import type { TrackPoint } from './gpx';

/**
 * Cortes que se cierran siguiendo un track cargado. Si la grabación se corta (pantalla apagada, GPS tapado) y vuelve a
 * engancharse en otro punto de un track que tenés cargado, en vez de unir los dos puntos con una recta se sigue ese
 * track por el camino más corto entre ellos. Es geometría sobre una línea que ya está en el teléfono: no usa red.
 *
 * Solo se usa si el punto de antes y el de después están cerca del mismo track; si no, queda la recta de siempre.
 * Es una suposición (el camino real pudo ser otro), por eso el tramo se dibuja en el color de los cortes y queda anotado.
 */

/** Hasta qué distancia del track vale un punto como «sobre el track» (m): más que la precisión mala aceptada al grabar. */
export const MAX_OFF_TRACK_M = 50;
/** Un corte se detecta por el salto entre dos puntos grabados: al menos tanto tiempo y tanta distancia sin posiciones. */
export const JUMP_MIN_S = 45;
export const JUMP_MIN_M = 100;
/** El camino por el track no puede ser mucho más largo que la recta: si lo es, probablemente no es la misma calle. */
const MAX_DETOUR = 4;
const DETOUR_SLACK_M = 500;
/** Un track con el inicio y el final a esta distancia es un circuito: se puede dar la vuelta por el otro lado. */
const CLOSED_LOOP_M = 30;

export interface CandidateLine {
  id: string;
  name: string;
  line: TrackPoint[];
}

export interface Bridge {
  /** Puntos intermedios (sin hora), en el orden del recorrido, sin incluir los dos extremos. */
  points: TrackPoint[];
  lengthM: number;
  via: string;
  viaName: string;
}

interface Projection {
  /** Distancia desde el inicio del track hasta el punto proyectado (m). */
  pos: number;
  offM: number;
}

const M_PER_DEG = 111_195;

/** Proyección local (metros) alrededor de una latitud: alcanza para tramos de decenas de metros. */
function localProject(lat0: number, lat: number, lon: number, lon0: number): [number, number] {
  return [(lon - lon0) * Math.cos((lat0 * Math.PI) / 180) * M_PER_DEG, (lat - lat0) * M_PER_DEG];
}

function cumulative(line: TrackPoint[]): number[] {
  const cum = [0];
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1]! + distanceMeters({ lat: line[i - 1]![0], lon: line[i - 1]![1] }, { lat: line[i]![0], lon: line[i]![1] }));
  return cum;
}

function project(line: TrackPoint[], cum: number[], p: { lat: number; lon: number }): Projection {
  let best: Projection = { pos: 0, offM: Infinity };
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const [bx, by] = localProject(p.lat, b[0], b[1], p.lon);
    const [ax, ay] = localProject(p.lat, a[0], a[1], p.lon);
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    // El punto está en el origen (0, 0) de esta proyección.
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (-ax * dx - ay * dy) / len2));
    const off = Math.hypot(ax + t * dx, ay + t * dy);
    if (off < best.offM) best = { offM: off, pos: cum[i - 1]! + t * (cum[i]! - cum[i - 1]!) };
  }
  return best;
}

/** El punto del track a `pos` metros del inicio (con la altura interpolada, si la tiene). */
function pointAt(line: TrackPoint[], cum: number[], pos: number): TrackPoint {
  let i = 1;
  while (i < line.length - 1 && cum[i]! < pos) i++;
  const a = line[i - 1]!;
  const b = line[i]!;
  const span = cum[i]! - cum[i - 1]!;
  const t = span === 0 ? 0 : Math.max(0, Math.min(1, (pos - cum[i - 1]!) / span));
  const ele = a[2] !== null && b[2] !== null ? a[2] + (b[2] - a[2]) * t : (a[2] ?? b[2] ?? null);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, ele];
}

/** Los puntos del track entre dos posiciones (from ≤ to), con los extremos interpolados. */
function slice(line: TrackPoint[], cum: number[], from: number, to: number): TrackPoint[] {
  const out: TrackPoint[] = [pointAt(line, cum, from)];
  for (let i = 0; i < line.length; i++) if (cum[i]! > from && cum[i]! < to) out.push([line[i]![0], line[i]![1], line[i]![2]]);
  out.push(pointAt(line, cum, to));
  return out;
}

/**
 * El camino más corto por una línea entre dos puntos, o null si alguno de los dos no está sobre ella.
 * En un circuito cerrado se elige el lado más corto.
 */
export function pathAlong(line: TrackPoint[], a: { lat: number; lon: number }, b: { lat: number; lon: number }, maxOffM = MAX_OFF_TRACK_M): { points: TrackPoint[]; lengthM: number } | null {
  if (line.length < 2) return null;
  const cum = cumulative(line);
  const pa = project(line, cum, a);
  const pb = project(line, cum, b);
  if (pa.offM > maxOffM || pb.offM > maxOffM) return null;
  const total = cum.at(-1)!;
  const lo = Math.min(pa.pos, pb.pos);
  const hi = Math.max(pa.pos, pb.pos);
  const forward = pa.pos <= pb.pos;
  let points = slice(line, cum, lo, hi);
  if (!forward) points = points.reverse();
  let lengthM = hi - lo;
  const closed = distanceMeters({ lat: line[0]![0], lon: line[0]![1] }, { lat: line.at(-1)![0], lon: line.at(-1)![1] }) <= CLOSED_LOOP_M;
  if (closed && total - (hi - lo) < lengthM) {
    // Dar la vuelta por el otro lado: de A hacia el final del track y desde el inicio hasta B (o al revés).
    const around = pa.pos > pb.pos ? [...slice(line, cum, pa.pos, total), ...slice(line, cum, 0, pb.pos)] : [...slice(line, cum, 0, pa.pos).reverse(), ...slice(line, cum, pb.pos, total).reverse()];
    points = around;
    lengthM = total - (hi - lo);
  }
  return { points, lengthM };
}

/** El mejor camino por alguno de los tracks cargados entre el último punto grabado y el que llegó, o null si no hay uno razonable. */
export function bridgeAlongTracks(lines: CandidateLine[], a: { lat: number; lon: number }, b: { lat: number; lon: number }): Bridge | null {
  const straight = distanceMeters(a, b);
  let best: (Bridge & { len: number }) | null = null;
  for (const c of lines) {
    const found = pathAlong(c.line, a, b);
    if (!found) continue;
    if (found.lengthM > MAX_DETOUR * straight + DETOUR_SLACK_M) continue;
    if (!best || found.lengthM < best.len) {
      // Los extremos del camino son las proyecciones de a y b sobre el track (a pocos metros de los puntos grabados).
      best = { points: found.points, lengthM: found.lengthM, via: c.id, viaName: c.name, len: found.lengthM };
    }
  }
  if (!best) return null;
  const { len: _len, ...bridge } = best;
  return bridge;
}

/** ¿Hubo un corte entre estos dos puntos grabados (mucho tiempo y mucha distancia sin posiciones)? */
export function isSignalJump(last: TrackPoint, next: TrackPoint): boolean {
  if (last[3] === undefined || next[3] === undefined) return false;
  return next[3] - last[3] >= JUMP_MIN_S && distanceMeters({ lat: last[0], lon: last[1] }, { lat: next[0], lon: next[1] }) >= JUMP_MIN_M;
}

/**
 * Anota el puente en los cortes: si el corte ya estaba abierto (pantalla apagada) lo completa con el camino y su largo;
 * si no (un salto del GPS), agrega uno nuevo. `path` son los puntos intermedios para dibujar el tramo.
 */
export function withBridge(gaps: TrackGap[] | undefined, closing: boolean, last: TrackPoint, next: TrackPoint, bridge: Bridge): TrackGap[] {
  const extra = { lengthM: Math.round(bridge.lengthM), via: bridge.viaName, path: bridge.points.map((p): [number, number] => [p[0], p[1]]) };
  if (closing && gaps?.length) return [...gaps.slice(0, -1), { ...gaps.at(-1)!, ...extra }];
  return [...(gaps ?? []), { from: (last[3] ?? 0) * 1000, to: (next[3] ?? 0) * 1000, joined: true, a: [last[0], last[1]], b: [next[0], next[1]], ...extra }];
}
