import type { Country } from '@/core/settings/settings';
import { fileStates, hasDataFile } from './dataFile';
import { SERVICE_CATEGORIES } from './services';
import sizes from './data-sizes.json';
import { availablePacks, geologyFile } from '@/modules/layers/geology';

/**
 * Qué se baja para usar un país sin conexión, cuánto falta y si conviene bajarlo solo o preguntar antes.
 * Los archivos son los mismos que baja `prefetchCountry` (country.ts).
 */

/** Los archivos de `public/data/` que usa un país (los que se guardan en el dispositivo). */
export function countryFiles(country: Country): string[] {
  // Ecorregiones: un solo archivo para todos los países (se baja una vez; ver modules/ecoregions).
  const files: string[] = ['ecoregions.json'];
  if (country !== 'AR') files.push(`${country}.json`);
  // Geología del país (base nacional de la capa de geología del mapa sin conexión), si hay paquete y esta copia puede usarlo.
  const geology = geologyFile(country);
  if (geology && fileBytes(geology) > 0 && availablePacks().some((p) => p.file === geology)) files.push(geology);
  // Tablas de marea oficiales (SHN de Argentina y SOHMA de Uruguay), un archivo con los dos.
  if (country === 'AR' || country === 'UY') files.push('tides-official.json');
  // Pisos de vegetación de Chile (Luebert y Pliscoff, ~3,5 MB): ecorregión fina de Chile.
  if (country === 'CL') files.push('vegetation-CL.json');
  for (const cat of SERVICE_CATEGORIES) files.push(`${cat}-${country}.json`);
  // Parques y repetidoras oficiales de Chile también sirven con Argentina (por la cordillera).
  if (country === 'AR' || country === 'CL') files.push('parks-CL.json', 'repeaters-CL.json');
  if (country === 'BO' || country === 'PE' || country === 'PY' || country === 'UY' || country === 'BR') files.push(`parks-${country}.json`);
  return files;
}

const SIZES = sizes as Record<string, number>;
export const fileBytes = (file: string): number => SIZES[file] ?? 0;

/** Los archivos que todavía no están guardados de varios países, y cuánto pesan (sin repetir los que comparten, como los de Chile). */
export async function missingDownload(countries: Country[]): Promise<{ files: string[]; bytes: number }> {
  const all = [...new Set(countries.flatMap(countryFiles))];
  const stored = await Promise.all(all.map((f) => hasDataFile(f)));
  const files = all.filter((_, i) => !stored[i]);
  return { files, bytes: files.reduce((n, f) => n + fileBytes(f), 0) };
}

export type NetworkKind = 'wifi' | 'cellular' | 'unknown';

interface NetworkInformationLike {
  type?: string;
  saveData?: boolean;
}

/**
 * Qué conexión hay. `navigator.connection.type` solo existe en Chrome de Android (y ChromeOS): en iPhone y en la mayoría de los
 * navegadores no se puede saber si es Wi-Fi, y ahí queda «unknown» (se pregunta antes de bajar). Con el ahorro de datos prendido
 * (`saveData`) también se pregunta.
 */
export function networkInfo(nav: { connection?: NetworkInformationLike } = navigator as unknown as { connection?: NetworkInformationLike }): { kind: NetworkKind; saveData: boolean } {
  const c = nav.connection;
  const type = c?.type;
  const kind: NetworkKind = type === 'wifi' || type === 'ethernet' ? 'wifi' : type === 'cellular' ? 'cellular' : 'unknown';
  return { kind, saveData: !!c?.saveData };
}

/** ¿Se puede bajar sin preguntar? Solo con Wi-Fi (o cable) y sin el ahorro de datos. */
export const downloadsSilently = (n: { kind: NetworkKind; saveData: boolean }): boolean => n.kind === 'wifi' && !n.saveData;

/** «4,2 MB», «380 KB». */
export function formatBytes(bytes: number, lang: string): string {
  const nf = (d: number) => new Intl.NumberFormat(lang, { maximumFractionDigits: d });
  return bytes >= 1024 * 1024 ? `${nf(1).format(bytes / 1024 / 1024)} MB` : `${nf(0).format(Math.max(1, bytes / 1024))} KB`;
}

export type PackState = 'ready' | 'outdated' | 'missing';

/**
 * Cómo está el paquete de un país en este dispositivo: `missing` si falta algún archivo, `outdated` si hay una copia más nueva de alguno
 * (la de la app o la del servidor propio) y `ready` si está todo y al día. Incluye qué archivos hay que bajar y cuánto pesan.
 */
export async function countryPackState(country: Country, force = false): Promise<{ state: PackState; files: string[]; bytes: number }> {
  const states = await fileStates(countryFiles(country), force);
  const missing = Object.keys(states).filter((f) => states[f] === 'missing');
  const stale = Object.keys(states).filter((f) => states[f] === 'stale');
  const files = [...missing, ...stale];
  return { state: missing.length ? 'missing' : stale.length ? 'outdated' : 'ready', files, bytes: files.reduce((n, f) => n + fileBytes(f), 0) };
}
