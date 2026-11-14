import { useSettings } from '@/core/settings/settings';
/** Cache Storage de los archivos de `public/data/` (paquetes por país, repetidoras oficiales). */
export const DATA_CACHE = 'vikarg-country';

export class CountryDataError extends Error {
  constructor() {
    super('country-data-unavailable');
    this.name = 'CountryDataError';
  }
}

const keyUrl = (file: string) => new URL(`${import.meta.env.BASE_URL}data/${file}`, location.href).href;
/** Fecha de generación del archivo (`generatedAt`, AAAA-MM-DD); vacía si no tiene. */
const dateOf = (d: unknown): string => (d && typeof d === 'object' && 'generatedAt' in d ? String((d as { generatedAt: unknown }).generatedAt) : '');
const serverBase = () => useSettings.getState().settings.serverUrl?.trim().replace(/\/+$/, '') || null;

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** Qué dice un índice (`index.json`) de cada archivo: fecha de generación (vacía si no la tiene) y peso. */
export interface DataIndex {
  files: Record<string, { date: string; bytes: number }>;
}

const isIndex = (d: unknown): d is DataIndex => !!d && typeof d === 'object' && typeof (d as DataIndex).files === 'object' && (d as DataIndex).files !== null;

const INDEX_TTL_MS = 10 * 60_000;
let indexes: { at: number; app: DataIndex | null; server: DataIndex | null; serverBase: string | null } | null = null;

/**
 * Los índices de la app y del servidor propio (unos pocos KB cada uno): con ellos se sabe qué archivos guardados cambiaron sin bajarlos
 * enteros. Se guardan 10 minutos en memoria. Un servidor viejo sin índice da `null`.
 */
export async function loadIndexes(force = false): Promise<{ app: DataIndex | null; server: DataIndex | null }> {
  const server = serverBase();
  if (!force && indexes && indexes.serverBase === server && Date.now() - indexes.at < INDEX_TTL_MS) return indexes;
  const [app, srv] = await Promise.all([fetchJson(keyUrl('index.json')), server ? fetchJson(`${server}/api/data/index.json`) : null]);
  indexes = { at: Date.now(), app: isIndex(app) ? app : null, server: isIndex(srv) ? srv : null, serverBase: server };
  return indexes;
}

/** De dónde bajar la copia más nueva de un archivo según los índices; `null` si ninguna es más nueva que `storedDate`. */
export function newerSource(file: string, storedDate: string, idx: { app: DataIndex | null; server: DataIndex | null }): 'app' | 'server' | null {
  const app = idx.app?.files[file]?.date ?? '';
  const server = idx.server?.files[file]?.date ?? '';
  const best = server > app ? 'server' : 'app';
  const bestDate = best === 'server' ? server : app;
  return bestDate && bestDate > storedDate ? best : null;
}

const CHECKED = 'vikarg.data.legacyChecked';
const LEGACY_EVERY_MS = 24 * 3_600_000;
/** Los archivos sin fecha (o sin índice en ningún lado) se revisan como antes, pero como mucho una vez al día. */
function legacyDue(file: string): boolean {
  try {
    const all = JSON.parse(localStorage.getItem(CHECKED) ?? '{}') as Record<string, number>;
    if (Date.now() - (all[file] ?? 0) < LEGACY_EVERY_MS) return false;
    localStorage.setItem(CHECKED, JSON.stringify({ ...all, [file]: Date.now() }));
  } catch {
    /* sin almacenamiento: se revisa */
  }
  return true;
}

/** Revisión de siempre: baja la copia de la app y la del servidor y se queda con la más nueva (por fecha). */
async function refreshLegacy(file: string, current: unknown, cache: Cache): Promise<boolean> {
  if (!legacyDue(file)) return false;
  const server = serverBase();
  const [fromApp, fromServer] = await Promise.all([fetchJson(keyUrl(file)), server ? fetchJson(`${server}/api/data/${file}`) : null]);
  let best = current;
  // La de la app reemplaza si es más nueva o si ninguna tiene fecha (archivos viejos, como antes).
  if (fromApp && (dateOf(fromApp) > dateOf(best) || (!dateOf(fromApp) && !dateOf(best)))) best = fromApp;
  // La del servidor, solo si es más nueva.
  if (fromServer && dateOf(fromServer) > dateOf(best)) best = fromServer;
  if (best === current) return false;
  await cache.put(keyUrl(file), new Response(JSON.stringify(best), { headers: { 'content-type': 'application/json' } }));
  return true;
}

/**
 * Con conexión, actualiza un archivo guardado solo si hay una copia más nueva (la que viene con la app o la del servidor propio, que
 * vuelve a generar los paquetes cada mes, ver server/src/data/update-data.sh). Mira los índices (unos pocos KB) y baja únicamente el
 * archivo que cambió; sin índice, o si el archivo no tiene fecha, revisa a la antigua pero una vez al día. Devuelve si lo actualizó.
 */
async function refresh(file: string, current: unknown, cache: Cache | null): Promise<boolean> {
  if (!cache || !navigator.onLine) return false;
  const idx = await loadIndexes();
  const storedDate = dateOf(current);
  const known = idx.app?.files[file] ?? idx.server?.files[file];
  // Sin índice que lo conozca o sin fecha en el archivo: la revisión de siempre (una vez al día).
  if (!known || !storedDate || (!idx.app?.files[file]?.date && !idx.server?.files[file]?.date)) return refreshLegacy(file, current, cache);
  const from = newerSource(file, storedDate, idx);
  if (!from) return false;
  const fresh = await fetchJson(from === 'server' ? `${serverBase()}/api/data/${file}` : keyUrl(file));
  if (!fresh || dateOf(fresh) <= storedDate) return false;
  await cache.put(keyUrl(file), new Response(JSON.stringify(fresh), { headers: { 'content-type': 'application/json' } }));
  return true;
}

const REFRESHED = 'vikarg.data.refreshedAt';
/** Cada cuánto se revisa en bloque todo lo guardado (al abrir la app o al detectar un país). */
export const REFRESH_EVERY_MS = 12 * 3_600_000;

/**
 * Revisa los archivos de esta lista que ya están guardados y baja solo los que cambiaron (ver `refresh`). Como mucho una vez cada 12
 * horas, salvo `force`. Los que no están guardados no se bajan acá: eso lo hace `prefetchCountry`. Devuelve cuántos actualizó.
 */
export async function refreshStored(files: string[], force = false): Promise<number> {
  if (!('caches' in globalThis) || !navigator.onLine) return 0;
  try {
    if (!force && Date.now() - Number(localStorage.getItem(REFRESHED) ?? 0) < REFRESH_EVERY_MS) return 0;
    localStorage.setItem(REFRESHED, String(Date.now()));
  } catch {
    /* sin almacenamiento: se revisa igual */
  }
  const cache = await caches.open(DATA_CACHE);
  let updated = 0;
  for (const file of [...new Set(files)]) {
    const stored = await cache.match(keyUrl(file));
    if (!stored) continue;
    const data = await stored.json().catch(() => null);
    if (data && (await refresh(file, data, cache).catch(() => false))) updated++;
  }
  return updated;
}

/**
 * Un archivo de datos de `data/`: guardado si ya se bajó; si no, se baja y se
 * guarda. Con conexión, en segundo plano, se queda con la copia más nueva
 * (la de la app o la del servidor propio).
 */
export async function loadDataFile<T>(file: string): Promise<T> {
  const url = keyUrl(file);
  const cache = 'caches' in globalThis ? await caches.open(DATA_CACHE) : null;
  const stored = await cache?.match(url);
  if (stored) {
    const data = (await stored.json()) as T;
    void refresh(file, data, cache).catch(() => undefined);
    return data;
  }
  let data: unknown = await fetchJson(url);
  const server = serverBase();
  if (server && navigator.onLine) {
    const fromServer = await fetchJson(`${server}/api/data/${file}`);
    if (fromServer && dateOf(fromServer) > dateOf(data)) data = fromServer;
  }
  if (data === null) throw new CountryDataError();
  await cache?.put(url, new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } }));
  return data as T;
}

/** Borra la copia guardada de un archivo de `data/` (p. ej. si quedó con un formato viejo): la próxima carga lo vuelve a bajar. */
export async function forgetDataFile(file: string): Promise<void> {
  if ('caches' in globalThis) await (await caches.open(DATA_CACHE)).delete(keyUrl(file));
}

/** ¿Ya está guardado este archivo de `data/`? (sin leerlo) */
export async function hasDataFile(file: string): Promise<boolean> {
  if (!('caches' in globalThis)) return false;
  return !!(await (await caches.open(DATA_CACHE)).match(keyUrl(file)));
}

/**
 * Datos que vienen dentro de la app (por ejemplo, los parques de Argentina):
 * si el servidor propio tiene una copia más nueva, se guarda y se usa esa.
 */
export async function preferNewer<T>(file: string, bundled: T): Promise<T> {
  const cache = 'caches' in globalThis ? await caches.open(DATA_CACHE) : null;
  const stored = await cache?.match(keyUrl(file));
  let best: T = bundled;
  if (stored) {
    const data = (await stored.json().catch(() => null)) as T | null;
    if (data && dateOf(data) > dateOf(bundled)) best = data;
  }
  const server = serverBase();
  if (cache && server && navigator.onLine) {
    void fetchJson(`${server}/api/data/${file}`).then((c) => (c && dateOf(c) > dateOf(best) ? cache.put(keyUrl(file), new Response(JSON.stringify(c), { headers: { 'content-type': 'application/json' } })) : undefined));
  }
  return best;
}
