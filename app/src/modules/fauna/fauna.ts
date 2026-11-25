/**
 * Datos de la sección Fauna (tools/fauna-data/build.mjs → `fauna-AR.json`): caza deportiva por provincia (zonas, temporadas,
 * cupos, permisos, áreas protegidas, fuentes) y fichas de las especies cazables. Todo es informativo: la norma vigente manda.
 */
import { loadDataFile } from '@/modules/emergency/dataFile';
import type { Country } from '@/core/settings/settings';

/** Estado de la norma de caza de la provincia (lo decide quien relevó las fuentes, en tools/fauna-data/status.json). */
export type ProvinceStatus = 'vigente' | 'vieja' | 'prohibida' | 'sin-norma' | 'judicializada';

export interface ZoneSpecies {
  id: string;
  /** Cupo (por día o por excursión: lo aclara `note`). */
  bag?: number;
  sex?: string;
  note?: string;
  /** Temporada propia de la especie, si difiere de la de la zona. */
  from?: string;
  to?: string;
  /** Cupo compartido entre las especies del mismo grupo (p. ej. anátidos). */
  group?: string;
  groupTotal?: number;
  perVehicle?: number;
}

export interface HuntZone {
  id: string;
  name: string;
  /** Límites tal como los describe la norma (por rutas y departamentos: ninguna provincia publica coordenadas). */
  limits?: string;
  /** Texto de la norma (literal o resumido). */
  text?: string;
  methods?: string;
  reserves?: string;
  closed: boolean | null;
  season?: { from?: string; to?: string; note?: string };
  species: ZoneSpecies[];
}

export interface HuntProvince {
  name: string;
  region: string;
  status: ProvinceStatus;
  /** Año de la norma cargada, cuando no es la de este año. */
  normYear?: number;
  /** Aviso destacado (caza judicializada, prohibida, sin norma…). */
  warning?: string;
  zones: HuntZone[];
  permit?: {
    buyUrl?: string;
    infoUrl?: string;
    phone?: string[];
    email?: string[];
    where?: string;
    prices?: { type: string; price: string }[];
    priceDate?: string;
    requirements?: string[];
  };
  protected: { name: string; rule?: string; source?: string }[];
  sources: { title: string; org?: string; url?: string; date?: string; validUntil?: string; confidence?: string }[];
}

/** Ficha de una especie. Los campos vienen del relevamiento (texto en español) y pueden faltar. */
export interface FaunaSpecies {
  id: string;
  group: 'mammal' | 'bird';
  nombre: { es: string; en?: string; pt?: string };
  otros_nombres?: string[];
  cientifico?: string;
  origen?: string;
  image?: string;
  [field: string]: unknown;
}

export interface FaunaData {
  version: number;
  generatedAt: string;
  provinces: HuntProvince[];
  species: FaunaSpecies[];
}

export const FAUNA_COUNTRIES: Country[] = ['AR'];
export const faunaFile = (country: Country) => `fauna-${country}.json`;

const cache = new Map<string, Promise<FaunaData | null>>();

/** Los datos de fauna del país (se bajan la primera vez y quedan guardados), o `null` si no hay. */
export function loadFaunaData(country: Country): Promise<FaunaData | null> {
  if (!FAUNA_COUNTRIES.includes(country)) return Promise.resolve(null);
  const file = faunaFile(country);
  let p = cache.get(file);
  if (!p) {
    p = loadDataFile<FaunaData>(file).catch(() => {
      cache.delete(file);
      return null;
    });
    cache.set(file, p);
  }
  return p;
}

/** Color del mapa para cada estado (variables del tema; el rojo es para «prohibida», el naranja para «judicializada»). */
export const STATUS_COLOR: Record<ProvinceStatus, string> = {
  vigente: 'var(--ok)',
  vieja: 'var(--warn)',
  judicializada: 'var(--fauna-legal, #e08a2c)',
  prohibida: 'var(--danger)',
  'sin-norma': 'var(--text-muted)',
};

/** Orden de los estados en la leyenda. */
export const STATUSES: ProvinceStatus[] = ['vigente', 'vieja', 'judicializada', 'prohibida', 'sin-norma'];

export const provinceSlug = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');

export function provinceBySlug(data: FaunaData, slug: string): HuntProvince | undefined {
  return data.provinces.find((p) => provinceSlug(p.name) === slug);
}

export function speciesById(data: FaunaData, id: string): FaunaSpecies | undefined {
  return data.species.find((s) => s.id === id);
}

export function faunaName(sp: FaunaSpecies | undefined, id: string, lang: string): string {
  if (!sp) return id.replace(/-/g, ' ');
  const n = sp.nombre;
  return (lang.startsWith('en') ? n.en : lang.startsWith('pt') ? n.pt : undefined) ?? n.es;
}

/** Provincias donde hay alguna zona con esa especie, con la zona. */
export function whereHunted(data: FaunaData, id: string): { province: HuntProvince; zone: HuntZone; rule: ZoneSpecies }[] {
  return data.provinces.flatMap((p) => p.zones.flatMap((z) => z.species.filter((s) => s.id === id).map((rule) => ({ province: p, zone: z, rule }))));
}

/** Texto de un campo de la ficha: acepta texto o un objeto de textos (p. ej. `como_reconocerla` de las aves). */
export function fieldText(v: unknown): { label?: string; text: string }[] {
  if (typeof v === 'string') return v.trim() ? [{ text: v }] : [];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string').map((text) => ({ text }));
  if (v && typeof v === 'object')
    return Object.entries(v as Record<string, unknown>).flatMap(([label, x]) => (typeof x === 'string' && x.trim() ? [{ label, text: x }] : []));
  return [];
}
