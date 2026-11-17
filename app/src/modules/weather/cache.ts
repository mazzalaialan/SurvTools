import { strFromU8, strToU8 } from 'fflate';
import { blobStore } from '@/core/db/repository';
import type { Forecast } from './forecast';
import type { Compare } from './compare';
import type { History } from './history';

/**
 * Último pronóstico por lugar, cifrado como el resto de los datos (lleva
 * coordenadas). Se guardan los últimos lugares consultados para tenerlos sin
 * conexión.
 */

const CACHE_ID = 'weather-cache';
const MAX_PLACES = 8;

type Cache = Record<string, Forecast>;

/** Clave por celda de ~1 km: el GPS se mueve en metros y no justifica otra descarga. */
export function placeKey(lat: number, lon: number): string {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

async function readAll(): Promise<Cache> {
  const bytes = await blobStore.get(CACHE_ID);
  if (!bytes) return {};
  try {
    return JSON.parse(strFromU8(bytes)) as Cache;
  } catch {
    return {};
  }
}

export async function cachedForecast(key: string): Promise<Forecast | null> {
  return (await readAll())[key] ?? null;
}

export async function storeForecast(key: string, forecast: Forecast): Promise<void> {
  const all = await readAll();
  all[key] = forecast;
  const kept = Object.entries(all)
    .sort(([, a], [, b]) => b.fetchedAt.localeCompare(a.fetchedAt))
    .slice(0, MAX_PLACES);
  await blobStore.put(CACHE_ID, strToU8(JSON.stringify(Object.fromEntries(kept))) as Uint8Array<ArrayBuffer>);
}

// ---------- Clima histórico ----------

const HISTORY_CACHE_ID = 'weather-history-cache';
const MAX_HISTORY = 12;

type HistoryCache = Record<string, History>;

/** Clave por celda de ~1 km y día elegido. */
export const historyKey = (lat: number, lon: number, date: string): string => `${placeKey(lat, lon)}|${date}`;

async function readHistory(): Promise<HistoryCache> {
  const bytes = await blobStore.get(HISTORY_CACHE_ID);
  if (!bytes) return {};
  try {
    return JSON.parse(strFromU8(bytes)) as HistoryCache;
  } catch {
    return {};
  }
}

export async function cachedHistory(key: string): Promise<History | null> {
  return (await readHistory())[key] ?? null;
}

export async function storeHistory(key: string, history: History): Promise<void> {
  const all = await readHistory();
  all[key] = history;
  const kept = Object.entries(all)
    .sort(([, a], [, b]) => b.fetchedAt.localeCompare(a.fetchedAt))
    .slice(0, MAX_HISTORY);
  await blobStore.put(HISTORY_CACHE_ID, strToU8(JSON.stringify(Object.fromEntries(kept))) as Uint8Array<ArrayBuffer>);
}

// ---------- Comparación de pronósticos ----------

const COMPARE_CACHE_ID = 'weather-compare-cache';
const MAX_COMPARE = 8;

type CompareCache = Record<string, Compare>;

async function readCompare(): Promise<CompareCache> {
  const bytes = await blobStore.get(COMPARE_CACHE_ID);
  if (!bytes) return {};
  try {
    return JSON.parse(strFromU8(bytes)) as CompareCache;
  } catch {
    return {};
  }
}

export async function cachedCompare(key: string): Promise<Compare | null> {
  return (await readCompare())[key] ?? null;
}

export async function storeCompare(key: string, compare: Compare): Promise<void> {
  const all = await readCompare();
  all[key] = compare;
  const kept = Object.entries(all)
    .sort(([, a], [, b]) => b.fetchedAt.localeCompare(a.fetchedAt))
    .slice(0, MAX_COMPARE);
  await blobStore.put(COMPARE_CACHE_ID, strToU8(JSON.stringify(Object.fromEntries(kept))) as Uint8Array<ArrayBuffer>);
}
