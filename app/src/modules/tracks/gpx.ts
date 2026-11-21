import { distanceMeters } from '@/core/geo/geo';
import type { TrackWaypoint } from '@/core/model/types';

/**
 * Lectura de archivos GPX (Wikiloc, y cualquier app de rutas o GPS). Se leen
 * con expresiones regulares, como los de repetidoras: andan igual en el
 * navegador y en las pruebas, sin DOMParser.
 */

/** [lat, lon, altura o null] */
/** [lat, lon, altura o null, y, si se grabó con la app, la hora en segundos desde 1970]. */
export type TrackPoint = [number, number, number | null, number?];

export interface ParsedTrack {
  name: string;
  desc: string;
  /** Página de origen (Wikiloc pone el link a la ruta). */
  link: string | null;
  /** Segmentos del recorrido (un track puede venir cortado). */
  segments: TrackPoint[][];
  waypoints: TrackWaypoint[];
}

export interface TrackStats {
  distanceM: number;
  ascentM: number;
  descentM: number;
  minEle: number | null;
  maxEle: number | null;
}

/** Texto de una etiqueta, sin CDATA, entidades básicas ni HTML. */
function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return (m?.[1] ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

const attr = (open: string, name: string): number => Number(open.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`))?.[1]);

function points(xml: string, element: 'trkpt' | 'rtept'): TrackPoint[] {
  const out: TrackPoint[] = [];
  for (const m of xml.matchAll(new RegExp(`(<${element}\\b[^>]*?)(?:/>|>([\\s\\S]*?)</${element}>)`, 'gi'))) {
    const lat = attr(m[1]!, 'lat');
    const lon = attr(m[1]!, 'lon');
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const ele = Number(tag(m[2] ?? '', 'ele'));
    const e = m[2] && Number.isFinite(ele) && tag(m[2], 'ele') !== '' ? ele : null;
    // La hora (si el archivo la trae) permite calcular ritmo y tiempo en movimiento al importar una actividad.
    const ms = m[2] ? Date.parse(tag(m[2], 'time')) : NaN;
    out.push(Number.isFinite(ms) ? [lat, lon, e, Math.round(ms / 1000)] : [lat, lon, e]);
  }
  return out;
}

export class GpxError extends Error {
  constructor(public readonly code: 'not-gpx' | 'empty') {
    super(code);
    this.name = 'GpxError';
  }
}

export function parseGpx(text: string, fileName = ''): ParsedTrack {
  if (!/<gpx\b/i.test(text)) throw new GpxError('not-gpx');
  const metadata = text.match(/<metadata\b[\s\S]*?<\/metadata>/i)?.[0] ?? '';
  // El track, o la ruta (rte) si el archivo no trae track: de ahí salen nombre y descripción.
  const trk = text.match(/<trk\b[\s\S]*?<\/trk>/i)?.[0] ?? text.match(/<rte\b[\s\S]*?<\/rte>/i)?.[0] ?? '';
  const segments: TrackPoint[][] = [];
  for (const seg of text.matchAll(/<trkseg\b[\s\S]*?<\/trkseg>/gi)) {
    const pts = points(seg[0], 'trkpt');
    if (pts.length > 1) segments.push(pts);
  }
  // Algunas apps exportan rutas (rte) en vez de tracks.
  if (segments.length === 0) {
    for (const rte of text.matchAll(/<rte\b[\s\S]*?<\/rte>/gi)) {
      const pts = points(rte[0], 'rtept');
      if (pts.length > 1) segments.push(pts);
    }
  }
  const waypoints: TrackWaypoint[] = [];
  for (const m of text.matchAll(/(<wpt\b[^>]*?)(?:\/>|>([\s\S]*?)<\/wpt>)/gi)) {
    const lat = attr(m[1]!, 'lat');
    const lon = attr(m[1]!, 'lon');
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const body = m[2] ?? '';
    const ele = Number(tag(body, 'ele'));
    waypoints.push({ name: tag(body, 'name') || '—', lat, lon, ele: tag(body, 'ele') !== '' && Number.isFinite(ele) ? ele : null, desc: tag(body, 'desc') || tag(body, 'cmt') });
  }
  if (segments.length === 0 && waypoints.length === 0) throw new GpxError('empty');
  const link = (metadata.match(/<link\b[^>]*href=["']([^"']+)["']/i) ?? trk.match(/<link\b[^>]*href=["']([^"']+)["']/i))?.[1] ?? null;
  const name = tag(trk, 'name') || tag(metadata, 'name') || fileName.replace(/\.gpx$/i, '') || 'Track';
  return { name, desc: tag(trk, 'desc') || tag(metadata, 'desc'), link, segments, waypoints };
}

/** Cambio mínimo de altura (m) que cuenta como subida o bajada, ya con la altura alisada. */
const ELEVATION_THRESHOLD_M = 5;
/** La altura de cada punto se alisa con la media recortada de los puntos a esta distancia (m) hacia cada lado a lo largo del recorrido (calibrado con una caminata real: ver `smoothElevations`). */
const ELEVATION_SMOOTH_HALF_M = 100;

/**
 * Altura alisada: la media recortada (descarta los extremos) de las alturas de los puntos a menos de `ELEVATION_SMOOTH_HALF_M` a lo largo del recorrido. La altura del GPS de un celular
 * tiene un error de ±10 a 30 m que oscila de punto a punto (y deriva despacio); sumada tal cual, en un terreno casi llano daba cientos de metros de
 * desnivel que no existen (medido en una caminata de 3,4 km sobre el mapa de terreno: +121 m con el GPS crudo contra ~25 m reales). Una pendiente
 * real dura bastante más que 200 m, así que el alisado no la pierde. El error medido fue de ±4 m de ruido rápido más una deriva lenta de ±8 m. Con puntos separados por más de esa distancia no hay nada que alisar.
 */
export function smoothElevations(seg: TrackPoint[]): (number | null)[] {
  const along: number[] = [0];
  for (let i = 1; i < seg.length; i++) along.push(along[i - 1]! + distanceMeters({ lat: seg[i - 1]![0], lon: seg[i - 1]![1] }, { lat: seg[i]![0], lon: seg[i]![1] }));
  return smoothAlong(
    along,
    seg.map((p) => p[2]),
  );
}

/** La misma altura alisada para cualquier serie de alturas con su distancia recorrida (la del terreno también trae ruido de punto a punto). */
export function smoothAlong(along: number[], values: (number | null)[]): (number | null)[] {
  const out: (number | null)[] = [];
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i] === null) {
      out.push(null);
      continue;
    }
    while (along[i]! - along[lo]! > ELEVATION_SMOOTH_HALF_M) lo++;
    if (hi < i) hi = i;
    while (hi + 1 < values.length && along[hi + 1]! - along[i]! <= ELEVATION_SMOOTH_HALF_M) hi++;
    const window: number[] = [];
    for (let k = lo; k <= hi; k++) {
      const e = values[k];
      if (e !== null && e !== undefined) window.push(e);
    }
    // Media de lo que queda al descartar el 40 % de cada punta: tan robusta a un valor suelto como la mediana, pero sin saltar entre dos valores
    // cuando la altura alterna (la mediana oscila si hay dos grupos de valores).
    window.sort((x, y) => x - y);
    const cut = Math.floor(window.length * 0.4);
    const kept = window.slice(cut, window.length - cut);
    out.push(kept.reduce((a, b) => a + b, 0) / kept.length);
  }
  return out;
}

/**
 * Subida y bajada de una serie de alturas ya alisada: cuenta los cambios de más de `threshold` y, al final, suma lo que quedó sin contar, así que
 * subida menos bajada es exactamente la diferencia de altura entre el primer y el último punto (el umbral solo descarta ondas, no pierde el saldo).
 */
export function balancedClimb(heights: number[], threshold = ELEVATION_THRESHOLD_M): { ascent: number; descent: number } {
  let ascent = 0;
  let descent = 0;
  if (heights.length === 0) return { ascent, descent };
  let ref = heights[0]!;
  for (const h of heights.slice(1)) {
    if (h - ref >= threshold) {
      ascent += h - ref;
      ref = h;
    } else if (ref - h >= threshold) {
      descent += ref - h;
      ref = h;
    }
  }
  const rest = heights.at(-1)! - ref;
  if (rest > 0) ascent += rest;
  else descent -= rest;
  return { ascent, descent };
}

/**
 * Distancia y desnivel. El desnivel se calcula sobre la altura alisada (ver `smoothElevations`) y acumula solo cambios de más de 5 m, para no sumar
 * el ruido de la altura del GPS (la altura mínima y máxima también salen de la alisada); lo que queda sin contar al final se suma (subida menos bajada = diferencia entre el inicio y el final). No se supone nada
 * más: aunque el recorrido termine donde empezó, cada subida y cada bajada son las de los datos (se pudo ir y volver por caminos distintos). La altura mínima y máxima son las medidas, sin alisar.
 */
export function trackStats(segments: TrackPoint[][]): TrackStats {
  let distanceM = 0;
  let ascentM = 0;
  let descentM = 0;
  let minEle: number | null = null;
  let maxEle: number | null = null;
  for (const seg of segments) {
    const smooth = smoothElevations(seg);
    const heights: number[] = [];
    for (let i = 0; i < seg.length; i++) {
      const [lat, lon, ele] = seg[i]!;
      if (i > 0) distanceM += distanceMeters({ lat: seg[i - 1]![0], lon: seg[i - 1]![1] }, { lat, lon });
      if (ele === null) continue;
      const e = smooth[i]!;
      // La altura mínima y la máxima son las de la altura alisada: un salto suelto del GPS no puede ser la cima ni el punto más bajo.
      minEle = minEle === null ? e : Math.min(minEle, e);
      maxEle = maxEle === null ? e : Math.max(maxEle, e);
      heights.push(e);
    }
    const c = balancedClimb(heights);
    ascentM += c.ascent;
    descentM += c.descent;
  }
  return { distanceM, ascentM: Math.round(ascentM), descentM: Math.round(descentM), minEle, maxEle };
}

/**
 * Cuánto se aparta p del segmento a–b (en grados escalados): de costado o en
 * altura, lo que sea mayor. Así una subida en línea recta conserva su perfil.
 */
function offset(p: TrackPoint, a: TrackPoint, b: TrackPoint, k: number): number {
  const ax = a[1] * k;
  const ay = a[0];
  const dx = b[1] * k - ax;
  const dy = b[0] - ay;
  const px = p[1] * k - ax;
  const py = p[0] - ay;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, (px * dx + py * dy) / len)) : 0;
  const side = Math.hypot(px - t * dx, py - t * dy);
  if (p[2] === null || a[2] === null || b[2] === null) return side;
  const up = Math.abs(p[2] - (a[2] + t * (b[2] - a[2]))) / 111_320;
  return Math.max(side, up);
}

/**
 * Simplifica el recorrido (Douglas-Peucker) sin perder la forma: un track de
 * Wikiloc puede traer decenas de miles de puntos; a ~5 m de tolerancia queda
 * igual en el mapa y ocupa mucho menos.
 */
export function simplify(points: TrackPoint[], toleranceM = 5): TrackPoint[] {
  if (points.length < 3) return points;
  const k = Math.cos((points[0]![0] * Math.PI) / 180);
  const tol = toleranceM / 111_320;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [from, to] = stack.pop()!;
    let maxD = 0;
    let idx = -1;
    for (let i = from + 1; i < to; i++) {
      const d = offset(points[i]!, points[from]!, points[to]!, k);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx >= 0 && maxD > tol) {
      keep[idx] = 1;
      stack.push([from, idx], [idx, to]);
    }
  }
  return points.filter((_, i) => keep[i]);
}
