import { strFromU8, strToU8 } from 'fflate';
import { blobStore } from '@/core/db/repository';
import { omFetch } from '@/modules/weather/omFetch';

/**
 * Pronóstico del lugar de cada lote (Open-Meteo): máxima y mínima de hoy y los 3 días que siguen, para avisar calor o frío según el
 * umbral de cada especie. Se guarda cifrado (lleva coordenadas) para usarlo sin conexión, como el clima de la huerta.
 */

export interface FarmDay {
  date: string;
  max: number;
  min: number;
}
export interface FarmWeather {
  fetchedAt: string;
  lat: number;
  lon: number;
  days: FarmDay[];
}

const CACHE_ID = 'farm-weather';
export const FARM_WEATHER_STALE_MS = 3 * 3_600_000;
const MAX_PLACES = 8;
export const farmWeatherKey = (lat: number, lon: number) => `${lat.toFixed(2)},${lon.toFixed(2)}`;

export function parseFarmWeather(data: { daily?: { time?: unknown[]; temperature_2m_max?: unknown[]; temperature_2m_min?: unknown[] } }, lat: number, lon: number, now = new Date()): FarmWeather {
  const d = data.daily;
  if (!d || !Array.isArray(d.time)) throw new Error('bad response');
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const days: FarmDay[] = [];
  d.time.forEach((date, i) => {
    const max = num(d.temperature_2m_max?.[i]);
    const min = num(d.temperature_2m_min?.[i]);
    if (typeof date === 'string' && max !== null && min !== null) days.push({ date, max, min });
  });
  if (!days.length) throw new Error('empty');
  return { fetchedAt: now.toISOString(), lat, lon, days };
}

export async function fetchFarmWeather(base: string, lat: number, lon: number): Promise<FarmWeather> {
  const params = new URLSearchParams({ latitude: lat.toFixed(2), longitude: lon.toFixed(2), daily: 'temperature_2m_max,temperature_2m_min', timezone: 'auto', forecast_days: '4' });
  const res = await omFetch(`${base.replace(/\/+$/, '')}/v1/forecast?${params}`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseFarmWeather(await res.json(), lat, lon);
}

export async function cachedFarmWeather(): Promise<Record<string, FarmWeather>> {
  const bytes = await blobStore.get(CACHE_ID);
  if (!bytes) return {};
  try {
    return JSON.parse(strFromU8(bytes)) as Record<string, FarmWeather>;
  } catch {
    return {};
  }
}

export async function storeFarmWeather(w: FarmWeather): Promise<void> {
  const all = await cachedFarmWeather();
  all[farmWeatherKey(w.lat, w.lon)] = w;
  const kept = Object.entries(all)
    .sort(([, a], [, b]) => b.fetchedAt.localeCompare(a.fetchedAt))
    .slice(0, MAX_PLACES);
  await blobStore.put(CACHE_ID, strToU8(JSON.stringify(Object.fromEntries(kept))) as Uint8Array<ArrayBuffer>);
}

/** Días (desde hoy) en que el pronóstico pasa el umbral de calor o de frío de la especie. */
export function stressDays(days: FarmDay[], today: string, heat: number | null, cold: number | null): { heat: FarmDay[]; cold: FarmDay[] } {
  const next = days.filter((d) => d.date >= today);
  return { heat: heat === null ? [] : next.filter((d) => d.max >= heat), cold: cold === null ? [] : next.filter((d) => d.min <= cold) };
}
