import { strFromU8, strToU8 } from 'fflate';
import { blobStore } from '@/core/db/repository';
import type { IsoDay } from '@/core/model/types';
import type { WaterDay } from './logic';
import { omFetch } from '@/modules/weather/omFetch';

/**
 * Clima de la huerta (Open-Meteo): evapotranspiración de referencia (ET0,
 * FAO-56) y lluvia de los últimos 10 días para el balance de agua, y la mínima
 * de los próximos días para el aviso de helada. Se guarda cifrado (lleva
 * coordenadas) para usarlo sin conexión.
 */

export interface GardenWeather {
  fetchedAt: string;
  lat: number;
  lon: number;
  /** cloud: nubosidad media del día (%); wind: viento máximo (km/h). Faltan en lo guardado antes de 0.61. */
  days: (WaterDay & { min: number; cloud?: number | null; wind?: number | null })[];
}

const CACHE_ID = 'garden-weather';
export const GARDEN_WEATHER_STALE_MS = 3 * 3_600_000;

export function gardenWeatherUrl(base: string, lat: number, lon: number): string {
  const params = new URLSearchParams({
    latitude: lat.toFixed(2),
    longitude: lon.toFixed(2),
    daily: 'et0_fao_evapotranspiration,precipitation_sum,temperature_2m_min,cloud_cover_mean,wind_speed_10m_max',
    timezone: 'auto',
    past_days: '10',
    forecast_days: '3',
  });
  return `${base.replace(/\/+$/, '')}/v1/forecast?${params}`;
}

interface ApiDaily {
  daily?: { time?: unknown[]; et0_fao_evapotranspiration?: unknown[]; precipitation_sum?: unknown[]; temperature_2m_min?: unknown[]; cloud_cover_mean?: unknown[]; wind_speed_10m_max?: unknown[] };
}

export function parseGardenWeather(data: ApiDaily, lat: number, lon: number, now = new Date()): GardenWeather {
  const d = data.daily;
  if (!d || !Array.isArray(d.time)) throw new Error('bad response');
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const days: GardenWeather['days'] = [];
  d.time.forEach((date, i) => {
    const et0 = num(d.et0_fao_evapotranspiration?.[i]);
    const rain = num(d.precipitation_sum?.[i]);
    const min = num(d.temperature_2m_min?.[i]);
    if (typeof date !== 'string' || et0 === null || rain === null || min === null) return;
    days.push({ date: date as IsoDay, et0, rain, min, cloud: num(d.cloud_cover_mean?.[i]), wind: num(d.wind_speed_10m_max?.[i]) });
  });
  if (!days.length) throw new Error('empty');
  return { fetchedAt: now.toISOString(), lat, lon, days };
}

export async function fetchGardenWeather(base: string, lat: number, lon: number): Promise<GardenWeather> {
  const res = await omFetch(gardenWeatherUrl(base, lat, lon), { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseGardenWeather((await res.json()) as ApiDaily, lat, lon);
}

const MAX_PLACES = 8;

/** Clave por celda de ~1 km. */
export const weatherKey = (lat: number, lon: number) => `${lat.toFixed(2)},${lon.toFixed(2)}`;

export async function cachedGardenWeather(): Promise<Record<string, GardenWeather>> {
  const bytes = await blobStore.get(CACHE_ID);
  if (!bytes) return {};
  try {
    const parsed = JSON.parse(strFromU8(bytes)) as Record<string, GardenWeather> | GardenWeather;
    // Formato de un solo lugar (no publicado, pero por las dudas).
    if ('days' in parsed && Array.isArray(parsed.days)) return { [weatherKey(parsed.lat as number, parsed.lon as number)]: parsed as GardenWeather };
    return parsed as Record<string, GardenWeather>;
  } catch {
    return {};
  }
}

export async function storeGardenWeather(w: GardenWeather): Promise<void> {
  const all = await cachedGardenWeather();
  all[weatherKey(w.lat, w.lon)] = w;
  const kept = Object.entries(all)
    .sort(([, a], [, b]) => b.fetchedAt.localeCompare(a.fetchedAt))
    .slice(0, MAX_PLACES);
  await blobStore.put(CACHE_ID, strToU8(JSON.stringify(Object.fromEntries(kept))) as Uint8Array<ArrayBuffer>);
}
