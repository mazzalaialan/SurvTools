import { hasDataFile, loadDataFile } from '@/modules/emergency/dataFile';

/**
 * Ecorregiones (RESOLVE Ecoregions 2017, CC BY 4.0, ver tools/eco-data/build.mjs): en cuál se está y por cuáles pasó un recorrido.
 * Es una búsqueda de punto en polígono sobre un archivo de ~0,8 MB que se baja con los datos del país y sirve sin conexión.
 * Los contornos están simplificados a ~1 km: los límites reales entre ecorregiones son graduales y esto es una referencia.
 */
export interface Ecoregion {
  id: number;
  /** Nombre original (inglés) y en español. */
  name: string;
  nameEs: string;
  biome: number;
  color: string;
  /** Polígonos: cada uno es [borde, ...huecos] y cada anillo, [lon, lat, lon, lat, …]. */
  polys: number[][][];
}

export interface EcoregionData {
  generatedAt: string;
  source: string;
  biomes: Record<string, string>;
  ecoregions: Ecoregion[];
}

export const ECOREGIONS_FILE = 'ecoregions.json';
export const ECOREGIONS_CREDIT = 'RESOLVE Ecoregions 2017 (Dinerstein et al. 2017, CC BY 4.0)';

export const VEGETATION_CL_FILE = 'vegetation-CL.json';
export const VEGETATION_CL_CREDIT = 'Luebert y Pliscoff (2021), pisos de vegetación de Chile, doi:10.5281/zenodo.4711540 (CC BY 4.0)';

/** Copia con los números de bioma corridos en `offset`: así las formaciones de distintos conjuntos no se pisan al juntarlos. */
export function offsetBiomes(d: EcoregionData, offset: number): EcoregionData {
  return {
    ...d,
    biomes: Object.fromEntries(Object.entries(d.biomes).map(([k, v]) => [String(Number(k) + offset), v])),
    ecoregions: d.ecoregions.map((e) => ({ ...e, biome: e.biome + offset })),
  };
}

let clPending: Promise<EcoregionData | null> | null = null;
/** Pisos de vegetación de Chile (ecorregión fina); `null` si no se bajó (se baja con el paquete de Chile, no por sí solo). */
export function loadVegetationCL(): Promise<EcoregionData | null> {
  clPending ??= (async () => {
    if (!(await hasDataFile(VEGETATION_CL_FILE))) {
      clPending = null;
      return null;
    }
    return offsetBiomes(await loadDataFile<EcoregionData>(VEGETATION_CL_FILE), 100);
  })().catch(() => {
    clPending = null;
    return null;
  });
  return clPending;
}
/** Baja los pisos de Chile (para el paquete del país) y los deja listos. */
export async function downloadVegetationCL(): Promise<void> {
  await loadDataFile<EcoregionData>(VEGETATION_CL_FILE);
  clPending = null;
}

let pending: Promise<EcoregionData | null> | null = null;
/** Carga el archivo (guardado en el dispositivo); `null` si no se pudo bajar y no hay copia. */
export function loadEcoregions(): Promise<EcoregionData | null> {
  pending ??= loadDataFile<EcoregionData>(ECOREGIONS_FILE).catch(() => {
    pending = null;
    return null;
  });
  return pending;
}

const inRing = (ring: number[], lon: number, lat: number): boolean => {
  let inside = false;
  const n = ring.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[2 * i]!;
    const yi = ring[2 * i + 1]!;
    const xj = ring[2 * j]!;
    const yj = ring[2 * j + 1]!;
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

const boxes = new WeakMap<EcoregionData, { e: Ecoregion; polys: { p: number[][]; b: [number, number, number, number] }[] }[]>();
function index(data: EcoregionData) {
  let idx = boxes.get(data);
  if (!idx) {
    idx = data.ecoregions.map((e) => ({
      e,
      polys: e.polys.map((p) => {
        const r = p[0]!;
        let w = Infinity, s = Infinity, ea = -Infinity, nn = -Infinity;
        for (let i = 0; i < r.length; i += 2) {
          w = Math.min(w, r[i]!); ea = Math.max(ea, r[i]!);
          s = Math.min(s, r[i + 1]!); nn = Math.max(nn, r[i + 1]!);
        }
        return { p, b: [w, s, ea, nn] as [number, number, number, number] };
      }),
    }));
    boxes.set(data, idx);
  }
  return idx;
}

/** Ecorregión del punto, o `null` si no cae en ninguna (mar, otro país, fuera de la región). */
export function ecoregionAt(data: EcoregionData, lat: number, lon: number): Ecoregion | null {
  const hit = exactAt(data, lat, lon);
  if (hit) return hit;
  // En la costa el contorno simplificado (~1 km) puede dejar el punto apenas afuera: se prueba a ~3 km a la redonda.
  const d = 0.03;
  return exactAt(data, lat + d, lon) ?? exactAt(data, lat - d, lon) ?? exactAt(data, lat, lon + d) ?? exactAt(data, lat, lon - d);
}

function exactAt(data: EcoregionData, lat: number, lon: number): Ecoregion | null {
  for (const { e, polys } of index(data)) {
    for (const { p, b } of polys) {
      if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue;
      if (inRing(p[0]!, lon, lat) && !p.slice(1).some((h) => inRing(h, lon, lat))) return e;
    }
  }
  return null;
}

/** Nombre según el idioma de la app. */
export const ecoregionName = (e: Pick<Ecoregion, 'name' | 'nameEs'>, lang: string): string => (lang.startsWith('es') ? e.nameEs : e.name);
export const biomeName = (data: EcoregionData, e: Pick<Ecoregion, 'biome'>): string => data.biomes[String(e.biome)] ?? '';

const R = 6_371_000;
/** Distancia en metros entre dos puntos [lon, lat]. */
export function distanceM(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Búsqueda de una ecorregión por punto (la gruesa sola o la fina con la gruesa de respaldo). */
export type EcoLookup = (lat: number, lon: number) => Ecoregion | null;

/** Dónde hay datos finos (Bosque Andino Patagónico, pisos de Chile) vale la ecorregión fina; en el resto, la gruesa de RESOLVE. */
export function finerLookup(coarse: EcoregionData | null, fine: EcoregionData | null): { lookup: EcoLookup; fineAt: EcoLookup } {
  const fineAt: EcoLookup = (lat, lon) => (fine ? exactAt(fine, lat, lon) : null);
  return { fineAt, lookup: (lat, lon) => fineAt(lat, lon) ?? (coarse ? ecoregionAt(coarse, lat, lon) : null) };
}

export interface EcoregionStretch {
  ecoregion: Ecoregion;
  meters: number;
}

/**
 * Por qué ecorregiones pasó un recorrido y cuántos metros hizo en cada una (en orden de aparición). Cada tramo se asigna a la ecorregión
 * de su punto medio; los tramos fuera de toda ecorregión no se cuentan.
 */
export function ecoregionsAlong(data: EcoregionData, line: [number, number][]): EcoregionStretch[] {
  return ecoregionsAlongWith((lat, lon) => ecoregionAt(data, lat, lon), line);
}

export function ecoregionsAlongWith(lookup: EcoLookup, line: [number, number][]): EcoregionStretch[] {
  const out = new Map<number, EcoregionStretch>();
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const e = lookup((a[1] + b[1]) / 2, (a[0] + b[0]) / 2);
    if (!e) continue;
    const cur = out.get(e.id) ?? { ecoregion: e, meters: 0 };
    cur.meters += distanceM(a, b);
    out.set(e.id, cur);
  }
  return [...out.values()];
}

/** Para dibujar la capa en el mapa (MapLibre): un polígono por ecorregión, con su color y nombre. */
export function ecoregionsGeoJSON(data: EcoregionData, lang: string): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: data.ecoregions.map((e) => ({
      type: 'Feature',
      properties: { id: e.id, name: ecoregionName(e, lang), color: e.color },
      geometry: {
        type: 'MultiPolygon',
        coordinates: e.polys.map((p) => p.map((r) => Array.from({ length: r.length / 2 }, (_, i) => [r[2 * i]!, r[2 * i + 1]!]))),
      },
    })),
  };
}
