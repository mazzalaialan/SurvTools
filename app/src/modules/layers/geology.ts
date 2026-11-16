import { loadDataFile } from '@/modules/emergency/dataFile';
import { loadStoredLayers } from './zoneLayers';
import { periodColor } from './periods';

/**
 * Geología (unidades, edades y litología): la base nacional de Argentina (SEGEMAR 1:2,5 M, `geology-AR.json`, siempre disponible) y, en
 * las zonas descargadas con detalle, el 1:250.000 por teselas (server/src/layers/segemar.ts). Para un punto vale el detalle si lo hay.
 * Fuente: SEGEMAR, SIGAM, CC BY 4.0.
 */
export interface GeologyUnit {
  name: string;
  litho: string;
  from: string;
  to: string;
}

export interface GeologyPoly {
  u: number;
  /** [borde, ...huecos], cada anillo [lon, lat, lon, lat, …]. */
  p: number[][];
}

export interface GeologyData {
  generatedAt?: string;
  source?: string;
  units: GeologyUnit[];
  polys: GeologyPoly[];
}

export const GEOLOGY_FILE = 'geology-AR.json';
/** Solo hay geología para Argentina (con margen): fuera de acá no se carga nada. */
export const inGeologyCoverage = (lat: number, lon: number): boolean => lat > -56 && lat < -21 && lon > -74 && lon < -53;
export const GEOLOGY_CREDIT = 'SEGEMAR (SIGAM), CC BY 4.0';

export const unitColor = (u: GeologyUnit): string => periodColor(u.to || u.from);
/** «Plioceno» o «Devónico – Carbonífero». */
export const unitAge = (u: GeologyUnit): string => (u.from && u.to && u.from !== u.to ? `${u.from} – ${u.to}` : u.to || u.from);

let basePending: Promise<GeologyData | null> | null = null;
/** La base nacional (guardada con los datos del país); `null` si no se pudo bajar y no hay copia. */
export function loadGeologyBase(): Promise<GeologyData | null> {
  basePending ??= loadDataFile<GeologyData>(GEOLOGY_FILE).catch(() => {
    basePending = null;
    return null;
  });
  return basePending;
}

interface Boxed {
  p: number[][];
  u: GeologyUnit;
  b: [number, number, number, number];
}
export interface GeologyIndex {
  detail: Boxed[];
  base: Boxed[];
}

function box(p: number[][], u: GeologyUnit): Boxed {
  const r = p[0]!;
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (let i = 0; i < r.length; i += 2) {
    w = Math.min(w, r[i]!); e = Math.max(e, r[i]!);
    s = Math.min(s, r[i + 1]!); n = Math.max(n, r[i + 1]!);
  }
  return { p, u, b: [w, s, e, n] };
}

export const boxedFrom = (d: GeologyData | null): Boxed[] => (d ? d.polys.map((x) => box(x.p, d.units[x.u]!)) : []);

const inRing = (ring: number[], lon: number, lat: number): boolean => {
  let inside = false;
  const n = ring.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[2 * i]!, yi = ring[2 * i + 1]!, xj = ring[2 * j]!, yj = ring[2 * j + 1]!;
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

function find(list: Boxed[], lat: number, lon: number): GeologyUnit | null {
  for (const { p, u, b } of list) {
    if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue;
    if (inRing(p[0]!, lon, lat) && !p.slice(1).some((h) => inRing(h, lon, lat))) return u;
  }
  return null;
}

/** La unidad en el punto: del detalle de las zonas descargadas si lo hay y, si no, de la base nacional. */
export function geologyAt(idx: GeologyIndex, lat: number, lon: number): { unit: GeologyUnit; detail: boolean } | null {
  const d = find(idx.detail, lat, lon);
  if (d) return { unit: d, detail: true };
  const b = find(idx.base, lat, lon) ?? find(idx.base, lat + 0.03, lon) ?? find(idx.base, lat - 0.03, lon) ?? find(idx.base, lat, lon + 0.03) ?? find(idx.base, lat, lon - 0.03);
  return b ? { unit: b, detail: false } : null;
}

/** Índice con la base y todo el detalle guardado. */
export async function loadGeologyIndex(): Promise<GeologyIndex> {
  const [base, stored] = await Promise.all([loadGeologyBase(), loadStoredLayers()]);
  return { detail: stored.geology.map((t) => boxedFrom(t)).flat(), base: boxedFrom(base) };
}

const R = 6_371_000;
const dist = (a: [number, number], b: [number, number]) => {
  const rad = Math.PI / 180;
  const h = Math.sin(((b[1] - a[1]) * rad) / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(((b[0] - a[0]) * rad) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

export interface GeologyStretch {
  unit: GeologyUnit;
  meters: number;
}
/** Por qué unidades geológicas pasó un recorrido y cuántos metros hizo en cada una (cada tramo, por su punto medio). */
export function geologyAlong(idx: GeologyIndex, line: [number, number][]): GeologyStretch[] {
  const out = new Map<string, GeologyStretch>();
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!, b = line[i]!;
    const hit = geologyAt(idx, (a[1] + b[1]) / 2, (a[0] + b[0]) / 2);
    if (!hit) continue;
    const key = JSON.stringify(hit.unit);
    const cur = out.get(key) ?? { unit: hit.unit, meters: 0 };
    cur.meters += dist(a, b);
    out.set(key, cur);
  }
  return [...out.values()];
}

/** Para dibujar en el mapa: la base y encima el detalle de las zonas. */
export function geologyGeoJSON(idx: GeologyIndex): GeoJSON.FeatureCollection {
  const feature = ({ p, u }: Boxed): GeoJSON.Feature => ({
    type: 'Feature',
    properties: { name: u.name, color: unitColor(u) },
    geometry: { type: 'Polygon', coordinates: p.map((r) => Array.from({ length: r.length / 2 }, (_, i) => [r[2 * i]!, r[2 * i + 1]!])) },
  });
  return { type: 'FeatureCollection', features: [...idx.base.map(feature), ...idx.detail.map(feature)] };
}
