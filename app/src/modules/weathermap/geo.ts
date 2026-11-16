/** Mapa base incluido en la app (tools/geo-data/build.mjs). Se carga aparte para no pesar en el inicio. */

/** Países con provincias (o regiones, departamentos) en el mapa base. */
export type GeoCountry = 'AR' | 'CL' | 'UY' | 'BO' | 'PE' | 'PY';
export const GEO_COUNTRIES: GeoCountry[] = ['AR', 'CL', 'UY', 'BO', 'PE', 'PY'];

export interface GeoRegion {
  id: string;
  country: GeoCountry;
  name: string;
  label: [number, number];
  /** Anillos como [lon, lat, lon, lat, …]. */
  rings: number[][];
}

export interface Capital {
  name: string;
  country: GeoCountry;
  national: boolean;
  lon: number;
  lat: number;
}

export interface Volcano {
  id: number;
  name: string;
  lon: number;
  lat: number;
  elevation: number | null;
  /** Año de la última erupción conocida (negativo: antes de Cristo), o `null` si no se sabe. */
  lastEruption: number | null;
  type: string | null;
  country: string;
}

export interface GeoData {
  source: string;
  regions: GeoRegion[];
  /** El resto de América del Sur, solo el contorno. */
  neighbors: { code: string; rings: number[][] }[];
  /** Frontera y costa de nuestros países (para dibujarlas distinto de los límites internos). */
  borders: { code: GeoCountry; rings: number[][] }[];
  /** Nombre de cada país de América del Sur y dónde escribirlo ([lon, lat]). */
  countries: { code: string; name: { es: string; en: string }; label: [number, number] }[];
  capitals: Capital[];
  volcanoes: Volcano[];
  /** Ríos de América del Sur (Natural Earth): `rank` 1 es el mayor; cada línea es [lon, lat, lon, lat, …]. */
  rivers: { name: string; rank: number; lines: number[][] }[];
}

let pending: Promise<GeoData> | null = null;

export function loadGeoData(): Promise<GeoData> {
  pending ??= import('./geo-data.json').then((m) => m.default as GeoData);
  return pending;
}
