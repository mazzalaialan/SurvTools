import type { Country } from '@/core/settings/settings';
import { hasDataFile, loadDataFile } from '@/modules/emergency/dataFile';
import { COMMERCIAL_BUILD } from '@/modules/navigation/sources';
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

/**
 * Un paquete de geología por país (`geology-<CC>.json`, mismo formato): Argentina (SEGEMAR, CC BY 4.0), Chile (SERNAGEOMIN vía CIGIDEN, solo
 * uso no comercial), Perú (INGEMMET, acceso público, se cita), Uruguay (DINAMIGE, Loureiro et al. 2024), Bolivia y Paraguay (Macrostrat, CC BY 4.0).
 * Los de uso no comercial se apagan en una copia paga, con publicidad o institucional (`VITE_COMMERCIAL=1`, ver navigation/sources.ts).
 * `box` es [oeste, sur, este, norte] (con margen): fuera de todas las cajas no se carga nada.
 */
export interface GeologyPack {
  country: Country;
  file: string;
  box: [number, number, number, number];
  nonCommercial: boolean;
}
export const GEOLOGY_PACKS: GeologyPack[] = [
  { country: 'AR', file: 'geology-AR.json', box: [-74, -56, -53, -21], nonCommercial: false },
  { country: 'CL', file: 'geology-CL.json', box: [-76.5, -56.5, -66, -17], nonCommercial: true },
  { country: 'PE', file: 'geology-PE.json', box: [-82, -19, -68, 0.5], nonCommercial: true },
  { country: 'UY', file: 'geology-UY.json', box: [-58.6, -35.1, -53, -30], nonCommercial: false },
  { country: 'BO', file: 'geology-BO.json', box: [-70, -23, -57, -9], nonCommercial: false },
  { country: 'PY', file: 'geology-PY.json', box: [-63, -28, -54, -19], nonCommercial: false },
];
/** Los paquetes que esta copia puede usar (en una copia comercial no entran los de uso no comercial). */
export const availablePacks = (commercial: boolean = COMMERCIAL_BUILD): GeologyPack[] => GEOLOGY_PACKS.filter((p) => !(commercial && p.nonCommercial));
export const geologyFile = (country: Country): string | null => GEOLOGY_PACKS.find((p) => p.country === country)?.file ?? null;
/** ¿Algún paquete cubre el punto? (por la caja de cada país). */
export const inGeologyCoverage = (lat: number, lon: number, commercial: boolean = COMMERCIAL_BUILD): boolean =>
  availablePacks(commercial).some((p) => lon > p.box[0] && lon < p.box[2] && lat > p.box[1] && lat < p.box[3]);

/** «Sin fuente»: la cita de cada paquete cargado se saca de su propio campo `source`. */
export const GEOLOGY_CREDIT = 'SEGEMAR (SIGAM), CC BY 4.0';

export const unitColor = (u: GeologyUnit): string => periodColor(u.to || u.from);
/** «Plioceno» o «Devónico – Carbonífero». */
export const unitAge = (u: GeologyUnit): string => (u.from && u.to && u.from !== u.to ? `${u.from} – ${u.to}` : u.to || u.from);

const basePending = new Map<string, Promise<GeologyData | null>>();
/**
 * Un paquete de país (guardado con los datos del país). Con `download` lo baja si falta; sin él, solo si ya está guardado (la capa nunca
 * baja por su cuenta los de otros países).
 */
export function loadGeologyPack(pack: GeologyPack, download = false): Promise<GeologyData | null> {
  const cached = basePending.get(pack.file);
  if (cached) return cached;
  const p = (async () => {
    if (!download && !(await hasDataFile(pack.file))) {
      basePending.delete(pack.file);
      return null;
    }
    return loadDataFile<GeologyData>(pack.file);
  })().catch(() => {
    basePending.delete(pack.file);
    return null;
  });
  basePending.set(pack.file, p);
  return p;
}
/** Baja el paquete de geología de un país (para el paquete del país); no falla si ese país no tiene. */
export async function downloadGeologyPack(country: Country): Promise<void> {
  const pack = GEOLOGY_PACKS.find((p) => p.country === country);
  if (pack && availablePacks().includes(pack)) await loadGeologyPack(pack, true);
}

interface Boxed {
  p: number[][];
  u: GeologyUnit;
  b: [number, number, number, number];
}
export interface GeologyIndex {
  detail: Boxed[];
  base: Boxed[];
  /** Citas de las fuentes cargadas (una por paquete de país y el detalle por zona). */
  credits: string[];
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

/** Índice con las bases de los países guardados y todo el detalle de las zonas. */
export async function loadGeologyIndex(): Promise<GeologyIndex> {
  const packs = availablePacks();
  const [datas, stored] = await Promise.all([Promise.all(packs.map((p) => loadGeologyPack(p))), loadStoredLayers()]);
  const loaded = datas.filter((d): d is GeologyData => !!d);
  return {
    detail: stored.geology.map((t) => boxedFrom(t)).flat(),
    base: loaded.flatMap((d) => boxedFrom(d)),
    credits: [...new Set([...loaded.map((d) => d.source ?? ''), ...(stored.geology.length ? ['SEGEMAR (SIGAM), 1:250.000, CC BY 4.0'] : [])].filter(Boolean))],
  };
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
