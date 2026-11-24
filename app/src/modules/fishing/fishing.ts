import { hasDataFile, loadDataFile } from '@/modules/emergency/dataFile';
import type { Country } from '@/core/settings/settings';

/**
 * Pesca (ver docs/PESCA.md): qué peces se pueden pescar en cada tramo de río o lago, con su veda, cupo y talla, y las carnadas
 * orientativas de cada especie. Los datos salen del reglamento de pesca vigente (normativa pública, con atribución) y los tramos
 * se ubicaron a mano sobre los ríos de OpenStreetMap (ODbL). Todo es **informativo**: la app siempre remite al reglamento vigente.
 * Un archivo por país (`fish-<CC>.json`) que se baja con los demás datos del país y sirve sin conexión.
 */

/** Modalidades de pesca que nombra el reglamento. */
export type Modality = 'fly' | 'spinning' | 'trolling' | 'bait' | 'boat' | 'shore';

export interface FishSource {
  id: string;
  name: string;
  url: string;
  license: string;
  date: string;
}

export interface FishSpecies {
  id: string;
  scientific: string;
  native: boolean;
  name: { es: string; en?: string; pt?: string };
  /** Tamaño típico en la región (texto propio, p. ej. «30–50 cm»). */
  size?: string;
  /** Resumen propio de la dieta. */
  diet?: string;
  bestSeason?: string;
  bestTime?: string;
  /** Imagen del pez (ilustración o foto con licencia libre, en `public/fish/`), con su crédito. */
  image?: { file: string; credit: string; license: string; url: string };
  /** Para una emergencia de supervivencia (cuando ya no rigen los reglamentos): carnadas naturales según lo que come y un consejo. */
  survival?: { baits: string[]; tip?: string };
  /** Carnadas orientativas (tabla propia de VikArg: dieta de FishBase y experiencia de pescadores). */
  baits?: { natural?: string[]; lures?: string[]; fly?: string[]; confidence?: 'high' | 'medium' | 'low' };
}

/** Reglas para una especie en un tramo. `limit` 0 = solo devolución. */
export interface SectorSpecies {
  id: string;
  limit?: number | null;
  minSizeCm?: number | null;
  maxSizeCm?: number | null;
  /** Prohibida todo el año (pacú y manguruyú en Santa Fe, veda absoluta de la CARU…). */
  forbidden?: boolean;
  /** Vedas de la especie que se repiten cada año («MM-DD»). */
  closures?: { from: string; to: string }[];
  /** Aclaración de la norma para esta especie. */
  note?: string;
  /** El dato sale de la autoridad citada en prensa o de una fuente secundaria, no del texto oficial. */
  unconfirmed?: boolean;
}

/** ¿Está la especie en veda hoy? Devuelve hasta cuándo, si está. */
export function speciesClosedUntil(sp: SectorSpecies, now: Date = new Date()): Date | null {
  for (const c of sp.closures ?? []) {
    const st = seasonStatus({ from: c.from, to: c.to }, now);
    if (st.state === 'open' && st.until) return st.until;
  }
  return null;
}

/** Veda total del tramo vigente hoy (fechas «AAAA-MM-DD» o «MM-DD»), si hay. */
export function sectorClosure(s: Pick<FishSector, 'closures'>, now: Date = new Date()): { until: Date; note?: string } | null {
  for (const c of s.closures ?? []) {
    const st = seasonStatus({ from: c.from, to: c.to }, now);
    if (st.state === 'open' && st.until) return { until: st.until, note: c.note };
  }
  return null;
}

/** Temporada: fechas «MM-DD» (se repiten cada año) o «AAAA-MM-DD» (una temporada concreta). Sin fechas = todo el año. */
export interface Season {
  from?: string;
  to?: string;
  allYear?: boolean;
}

export interface FishSector {
  id: string;
  region: string;
  /** Nombre del río, arroyo o lago. */
  water: string;
  /** Descripción del tramo tal como la da el reglamento («desde … hasta …»). */
  name: string;
  geometry: { type: 'LineString'; coordinates: [number, number][] } | { type: 'MultiLineString'; coordinates: [number, number][][] } | { type: 'Polygon'; coordinates: [number, number][][] };
  season?: Season;
  modality?: Modality[];
  catchAndRelease?: boolean;
  species: SectorSpecies[];
  /** Prohibiciones y aclaraciones del reglamento para este tramo (el texto literal). */
  notes?: string;
  /** Pesca no autorizada en este tramo (todo el año). */
  closed?: boolean;
  /** Vedas totales del tramo con fecha (p. ej. la veda de Misiones en el Paraná). */
  closures?: { from: string; to: string; note?: string }[];
  /** La ubicación del tramo es aproximada (qué se aproximó). */
  approx?: string;
  /**
   * Ambiente compartido entre jurisdicciones: el reglamento de cada una, con a quién pertenece (la ficha los muestra todos). En ese
   * caso `species` junta las especies de todas, con la regla más estricta, para el mapa y las listas.
   */
  rules?: (Partial<Omit<FishSector, 'rules' | 'geometry' | 'water' | 'id'>> & { region: string; regionName: string; species: SectorSpecies[] })[];
  source: string;
  /** Página, artículo o anexo del reglamento. */
  ref?: string;
}

/** Un permiso de pesca de la jurisdicción (tipo, quién, precio). */
export interface FishPermit {
  type: string;
  who?: string;
  price?: string;
}

export interface FishRegion {
  id: string;
  name: string;
  /** Cómo sacar el permiso de pesca: tipos y precios, enlace oficial de compra y otros lugares de venta. */
  permit?: { items: FishPermit[]; extra?: string[]; buyUrl?: string; infoUrl?: string; where?: string; requirements?: string; source?: string; date?: string };
  /** Reglas generales de la jurisdicción (texto del reglamento, resumido). */
  rules?: string[];
  season?: Season;
  source: string;
}

export interface FishData {
  version: number;
  generatedAt: string;
  /** Nombre de la temporada del reglamento (p. ej. «2025/2026»). */
  seasonLabel?: string;
  sources: FishSource[];
  species: FishSpecies[];
  regions: FishRegion[];
  sectors: FishSector[];
}

export const fishFile = (country: Country) => `fish-${country}.json`;

/** Países con datos de pesca (los demás muestran «todavía no hay datos»). */
export const FISH_COUNTRIES: Country[] = ['AR'];

const cache = new Map<string, Promise<FishData | null>>();

/** Los datos de pesca del país, o `null` si no se bajaron o no hay. */
export function loadFishData(country: Country): Promise<FishData | null> {
  if (!FISH_COUNTRIES.includes(country)) return Promise.resolve(null);
  const file = fishFile(country);
  let p = cache.get(file);
  if (!p) {
    p = (async () => {
      try {
        return await loadDataFile<FishData>(file);
      } catch {
        // Sin el archivo guardado y sin conexión: se reintenta la próxima vez.
        cache.delete(file);
        return null;
      }
    })();
    cache.set(file, p);
  }
  return p;
}

export async function hasFishData(country: Country): Promise<boolean> {
  return FISH_COUNTRIES.includes(country) && hasDataFile(fishFile(country));
}

// --- Temporada ------------------------------------------------------------------------------------------------------------------

export type SeasonStatus = { state: 'open'; until?: Date } | { state: 'closed'; from?: Date } | { state: 'forbidden' } | { state: 'unknown' };

/** Fecha local a medianoche. */
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);

function parse(s: string, year: number): Date {
  const p = s.split('-').map(Number);
  return p.length === 3 ? day(p[0]!, p[1]!, p[2]!) : day(year, p[0]!, p[1]!);
}

/**
 * ¿Está abierta la temporada en `now`? Con fechas «MM-DD» la temporada se repite cada año y puede cruzar el año (noviembre a
 * mayo). Devuelve hasta cuándo sigue abierta o desde cuándo abre; el último día cuenta como abierto.
 */
export function seasonStatus(season: Season | undefined, now: Date = new Date()): SeasonStatus {
  if (!season) return { state: 'unknown' };
  if (season.allYear) return { state: 'open' };
  if (!season.from || !season.to) return { state: 'unknown' };
  const today = day(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const fixed = season.from.split('-').length === 3;
  if (fixed) {
    const from = parse(season.from, 0);
    const to = parse(season.to, 0);
    if (today < from) return { state: 'closed', from };
    if (today > to) return { state: 'closed' };
    return { state: 'open', until: to };
  }
  const y = today.getFullYear();
  // Se prueban la temporada que empezó el año pasado y la de este año (por las que cruzan el año).
  for (const start of [y - 1, y]) {
    const from = parse(season.from, start);
    let to = parse(season.to, start);
    if (to < from) to = parse(season.to, start + 1);
    if (today >= from && today <= to) return { state: 'open', until: to };
  }
  let next = parse(season.from, y);
  if (next < today) next = parse(season.from, y + 1);
  return { state: 'closed', from: next };
}

/** La temporada que rige un tramo: la propia o, si no tiene, la de su jurisdicción. */
export function sectorSeason(data: FishData, sector: FishSector): Season | undefined {
  return sector.season ?? data.regions.find((r) => r.id === sector.region)?.season;
}

// --- Búsquedas ------------------------------------------------------------------------------------------------------------------

export const speciesById = (data: FishData, id: string) => data.species.find((s) => s.id === id);

/** Tramos donde está la especie. */
export function sectorsWithSpecies(data: FishData, speciesId: string): FishSector[] {
  return data.sectors.filter((s) => s.species.some((x) => x.id === speciesId));
}

/** Nombre común en el idioma pedido (o en español si no hay). */
export function speciesName(sp: FishSpecies, lang: string): string {
  const l = lang.slice(0, 2) as 'es' | 'en' | 'pt';
  return sp.name[l] ?? sp.name.es;
}

/** Ríos y lagos con sus tramos, ordenados por nombre. */
export function waters(data: FishData): { water: string; sectors: FishSector[] }[] {
  const by = new Map<string, FishSector[]>();
  for (const s of data.sectors) by.set(s.water, [...(by.get(s.water) ?? []), s]);
  return [...by.entries()].map(([water, sectors]) => ({ water, sectors })).sort((a, b) => a.water.localeCompare(b.water, 'es'));
}

function lines(g: FishSector['geometry']): [number, number][][] {
  if (g.type === 'LineString') return [g.coordinates];
  return g.coordinates;
}

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Distancia en metros de un punto a un segmento (proyección equirrectangular, buena para distancias cortas). */
function pointSegment(p: [number, number], a: [number, number], b: [number, number]): number {
  const k = Math.cos(rad(p[1]));
  const ax = (a[0] - p[0]) * k, ay = a[1] - p[1];
  const bx = (b[0] - p[0]) * k, by = b[1] - p[1];
  const dx = bx - ax, dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len));
  const x = ax + t * dx, y = ay + t * dy;
  return rad(Math.hypot(x, y)) * R;
}

function insideRing(p: [number, number], ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Distancia en metros de un punto (lon, lat) a un tramo (0 si está dentro de un lago). */
export function distanceToSector(p: [number, number], s: FishSector): number {
  if (s.geometry.type === 'Polygon' && insideRing(p, s.geometry.coordinates[0]!)) return 0;
  let best = Infinity;
  for (const line of lines(s.geometry)) {
    for (let i = 1; i < line.length; i++) best = Math.min(best, pointSegment(p, line[i - 1]!, line[i]!));
    if (line.length === 1) best = Math.min(best, pointSegment(p, line[0]!, line[0]!));
  }
  return best;
}

/** Tramos a menos de `radiusM` del punto, del más cercano al más lejano. */
export function sectorsNear(data: FishData, p: [number, number], radiusM: number): { sector: FishSector; distanceM: number }[] {
  return data.sectors
    .map((sector) => ({ sector, distanceM: distanceToSector(p, sector) }))
    .filter((x) => x.distanceM <= radiusM)
    .sort((a, b) => a.distanceM - b.distanceM);
}

/** GeoJSON de los tramos para el mapa (cada tramo con su id y cuántas especies tiene). */
export function sectorsGeoJSON(sectors: FishSector[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: sectors.map((s) => ({
      type: 'Feature',
      id: s.id,
      properties: { id: s.id, water: s.water, count: s.species.length },
      geometry: s.geometry as GeoJSON.Geometry,
    })),
  };
}

/** Datos de más de un año: se avisa que se confirme la normativa. */
export function isStale(data: FishData, now: Date = new Date()): boolean {
  return now.getTime() - new Date(data.generatedAt).getTime() > 365 * 86_400_000;
}
