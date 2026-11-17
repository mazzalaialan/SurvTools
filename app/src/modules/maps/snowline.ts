import { db } from '@/core/db/db';
import { DEFAULT_FROM, windLoadFrom, type PrevailingWind } from './wind';
import { omFetch } from '@/modules/weather/omFetch';

/**
 * Línea de nieve para la capa de riesgo de avalancha: solo se pinta la
 * pendiente donde puede haber nieve acumulada. Se estima con la isoterma de
 * 0 °C (altura de congelamiento) de Open-Meteo para el lugar que se mira: la
 * más baja de los últimos 3 días y los próximos 2 (la nieve que cayó queda
 * aunque después suba), menos 300 m (en las nevadas la nieve llega por
 * debajo de la isoterma). Se guarda la última para usarla sin conexión, y se
 * puede poner a mano.
 */

export const SNOW_BELOW_FREEZING_M = 300;
const HOUR = 3_600_000;
/** Isoterma: la más baja de los últimos 3 días. */
const PAST_DAYS = 3;
/** Viento: las placas pueden seguir inestables más de una semana con frío. */
export const WIND_PAST_DAYS = 7;
/** Más lejos que esto (o más viejo), se vuelve a consultar. */
const REFRESH_KM = 50;
const REFRESH_MS = 3 * 3_600_000;
const KEY = 'snowline';

export interface Snowline {
  /** Altura desde la que se pinta (m). */
  meters: number;
  /** Isoterma de 0 °C más baja de la ventana (m). */
  freezingMin: number;
  lat: number;
  lon: number;
  /** Cuándo se consultó. */
  at: number;
  /** De dónde sopló el viento que cargó nieve en los últimos 7 días ([] sin carga; ver wind.ts). */
  windFrom?: number[] | null;
  /** Viento habitual con nieve en este lugar (histórico), si hizo falta pedirlo. */
  prevailing?: number[];
}

/** Variables por hora que se piden a Open-Meteo (viento a 700 hPa ≈ 3000 m, en los filos). */
const HOURLY = 'freezing_level_height,wind_direction_700hPa,wind_speed_700hPa,snowfall';

interface HourlyResponse {
  hourly?: {
    time?: string[];
    freezing_level_height?: (number | null)[];
    wind_direction_700hPa?: (number | null)[];
    wind_speed_700hPa?: (number | null)[];
    snowfall?: (number | null)[];
  };
}

/** De las alturas de congelamiento por hora a la línea de nieve (redondeada a 50 m). */
export function snowlineFrom(freezingLevels: (number | null)[]): { meters: number; freezingMin: number } | null {
  const valid = freezingLevels.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (valid.length === 0) return null;
  const freezingMin = Math.min(...valid);
  return { meters: Math.max(0, Math.round((freezingMin - SNOW_BELOW_FREEZING_M) / 50) * 50), freezingMin: Math.round(freezingMin) };
}

export async function fetchSnowline(base: string, lat: number, lon: number): Promise<Snowline> {
  const params = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lon.toFixed(3),
    hourly: HOURLY,
    past_days: String(WIND_PAST_DAYS),
    forecast_days: '2',
    wind_speed_unit: 'ms',
    timezone: 'GMT',
  });
  const res = await omFetch(`${base.replace(/\/+$/, '')}/v1/forecast?${params}`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error('snowline');
  const data = (await res.json()) as HourlyResponse;
  const now = Date.now();
  const h = data.hourly;
  const times = (h?.time ?? []).map((t) => Date.parse(`${t}:00Z`));
  // La línea de nieve, con la isoterma de los últimos 3 días (la consulta trae 7 por el viento).
  const freezing = h?.freezing_level_height ?? [];
  const s = snowlineFrom(times.length === freezing.length ? freezing.filter((_, i) => times[i]! >= now - PAST_DAYS * 24 * HOUR) : freezing);
  if (!s) throw new Error('snowline');
  // El viento solo hasta ahora: lo que ya cargó.
  const past = times.filter((t) => t <= now).length;
  const windFrom = h ? windLoadFrom((h.wind_direction_700hPa ?? []).slice(0, past), (h.wind_speed_700hPa ?? []).slice(0, past), (h.snowfall ?? []).slice(0, past)) : null;
  return { ...s, lat, lon, at: now, windFrom };
}

export async function readSnowline(): Promise<Snowline | null> {
  return ((await db.meta.get(KEY))?.value as Snowline | undefined) ?? null;
}

export async function saveSnowline(s: Snowline): Promise<void> {
  await db.meta.put({ key: KEY, value: s });
}

const km = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) =>
  Math.hypot((a.lat - b.lat) * 111.2, (a.lon - b.lon) * 111.2 * Math.cos((a.lat * Math.PI) / 180));

/** ¿Hay que volver a consultar para este lugar? */
export function needsRefresh(s: Snowline | null, at: { lat: number; lon: number }, now = Date.now()): boolean {
  // Las guardadas antes de que existiera el viento, también.
  return !s || s.windFrom === undefined || now - s.at > REFRESH_MS || km(s, at) > REFRESH_KM;
}

// ---------- Sin conexión: el pronóstico guardado con cada zona descargada ----------

/** Isoterma de 0 °C hora por hora, guardada con la zona al descargarla (pasado y próximos días). */
export interface FreezingSeries {
  /** Hora (ms) del primer valor. */
  start: number;
  values: (number | null)[];
  /** Viento a 700 hPa (de dónde, m/s) y nevada (cm), las mismas horas (ver wind.ts). */
  windDir?: (number | null)[];
  windSpeed?: (number | null)[];
  snow?: (number | null)[];
  /** Cuándo se bajó. */
  at: number;
}

const AHEAD_DAYS = 2;
/** Al bajar una zona: hasta dos semanas de pronóstico, para salidas largas sin señal. */
export const ZONE_FORECAST_DAYS = 14;

export async function fetchFreezingSeries(base: string, lat: number, lon: number): Promise<FreezingSeries> {
  const params = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lon.toFixed(3),
    hourly: HOURLY,
    past_days: String(WIND_PAST_DAYS),
    forecast_days: String(ZONE_FORECAST_DAYS),
    wind_speed_unit: 'ms',
    timezone: 'GMT',
  });
  const res = await omFetch(`${base.replace(/\/+$/, '')}/v1/forecast?${params}`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error('snowline');
  const data = (await res.json()) as HourlyResponse;
  const h = data.hourly;
  const time = h?.time?.[0];
  const values = h?.freezing_level_height ?? [];
  if (!time || values.length === 0) throw new Error('snowline');
  const num = (v: number | null | undefined, digits = 0) => (typeof v === 'number' ? Math.round(v * 10 ** digits) / 10 ** digits : null);
  const wind =
    h.wind_direction_700hPa?.length === values.length && h.wind_speed_700hPa?.length === values.length && h.snowfall?.length === values.length
      ? { windDir: h.wind_direction_700hPa.map((v) => num(v)), windSpeed: h.wind_speed_700hPa.map((v) => num(v, 1)), snow: h.snowfall.map((v) => num(v, 1)) }
      : {};
  return { start: Date.parse(`${time}:00Z`), values: values.map((v) => num(v)), ...wind, at: Date.now() };
}

/**
 * Línea de nieve para `now` con una serie guardada: la misma ventana que con
 * conexión (3 días atrás, 2 adelante), hasta donde llegue la serie. `null` si
 * `now` ya pasó el final de la serie.
 */
export function snowlineAt(series: FreezingSeries, now = Date.now()): { meters: number; freezingMin: number } | null {
  const end = series.start + series.values.length * HOUR;
  if (now >= end || now < series.start) return null;
  const from = Math.max(0, Math.floor((now - PAST_DAYS * 24 * HOUR - series.start) / HOUR));
  const to = Math.min(series.values.length, Math.ceil((now + AHEAD_DAYS * 24 * HOUR - series.start) / HOUR));
  return snowlineFrom(series.values.slice(from, to));
}

export interface ZoneWithSeries {
  name: string;
  lat: number;
  lon: number;
  radiusKm: number;
  freezing?: FreezingSeries;
  prevailing?: PrevailingWind;
}

/** Margen alrededor de la zona: la isoterma cambia poco en unos kilómetros. */
const ZONE_MARGIN_KM = 50;

export type SnowlineChoice =
  | { source: 'live'; meters: number; freezingMin: number; at: number }
  | { source: 'zone'; meters: number; freezingMin: number; at: number; zone: string }
  | { source: 'none' };

/**
 * Qué línea de nieve usar para el lugar que se mira: la consultada con
 * conexión si es de cerca y reciente; si no, la del pronóstico guardado con
 * la zona descargada más cercana; si no hay ninguna, nada (se pinta toda la
 * pendiente). Nunca una de otro lugar.
 */
export function chooseSnowline(at: { lat: number; lon: number }, live: Snowline | null, zones: ZoneWithSeries[], now = Date.now()): SnowlineChoice {
  if (live && km(live, at) <= REFRESH_KM && now - live.at <= 2 * REFRESH_MS) return { source: 'live', meters: live.meters, freezingMin: live.freezingMin, at: live.at };
  const candidates = zones
    .filter((z) => z.freezing && km(z, at) <= z.radiusKm + ZONE_MARGIN_KM)
    .sort((a, b) => km(a, at) - km(b, at));
  for (const z of candidates) {
    const s = snowlineAt(z.freezing!, now);
    if (s) return { source: 'zone', ...s, at: z.freezing!.at, zone: z.name };
  }
  return { source: 'none' };
}

/**
 * Limpieza: saca de la serie las horas de más de 3 días atrás (ya no entran en
 * ninguna ventana). `null` si ya no queda nada útil (el pronóstico se venció).
 */
export function pruneSeries(series: FreezingSeries, now = Date.now()): FreezingSeries | null {
  // Se guarda lo que todavía usa el viento (7 días); la isoterma usa solo los últimos 3.
  const drop = Math.max(0, Math.floor((now - WIND_PAST_DAYS * 24 * HOUR - series.start) / HOUR));
  if (drop >= series.values.length) return null;
  if (drop === 0) return series;
  return {
    ...series,
    start: series.start + drop * HOUR,
    values: series.values.slice(drop),
    ...(series.windDir && series.windSpeed && series.snow
      ? { windDir: series.windDir.slice(drop), windSpeed: series.windSpeed.slice(drop), snow: series.snow.slice(drop) }
      : {}),
  };
}

// ---------- Viento que cargó nieve (rayado de sotavento) ----------

/** Carga por viento de los 7 días anteriores a `now` con una serie guardada (ver wind.ts). */
export function windLoadAt(series: FreezingSeries, now = Date.now()): number[] | null {
  if (!series.windDir || !series.windSpeed || !series.snow) return null;
  const from = Math.max(0, Math.floor((now - WIND_PAST_DAYS * 24 * HOUR - series.start) / HOUR));
  const to = Math.min(series.values.length, Math.floor((now - series.start) / HOUR) + 1);
  if (to - from < 24) return null;
  return windLoadFrom(series.windDir.slice(from, to), series.windSpeed.slice(from, to), series.snow.slice(from, to));
}

/**
 * Viento para el rayado de sotavento, en dos capas que se ven juntas:
 * - `recent`: el que cargó nieve en los últimos 7 días (`from` vacío = no hubo
 *   carga), consultado o guardado con la zona; `null` si no hay datos.
 * - `usual`: el sotavento habitual, donde pueden quedar placas viejas: el de la
 *   zona descargada más cercana o el del lugar consultado; si no, del oeste.
 */
export interface WindChoice {
  recent: { from: number[]; at: number; zone?: string } | null;
  usual: { source: 'prevailing'; from: number[]; zone?: string } | { source: 'default'; from: number[] };
}

const liveFresh = (live: Snowline | null, at: { lat: number; lon: number }, now: number): live is Snowline =>
  !!live && km(live, at) <= REFRESH_KM && now - live.at <= 2 * REFRESH_MS;

export function chooseWind(at: { lat: number; lon: number }, live: Snowline | null, zones: ZoneWithSeries[], now = Date.now()): WindChoice {
  const near = zones.filter((z) => km(z, at) <= z.radiusKm + ZONE_MARGIN_KM).sort((a, b) => km(a, at) - km(b, at));
  let recent: WindChoice['recent'] = null;
  if (liveFresh(live, at, now) && live.windFrom) recent = { from: live.windFrom, at: live.at };
  else {
    for (const z of near) {
      const from = z.freezing ? windLoadAt(z.freezing, now) : null;
      if (from) {
        recent = { from, at: z.freezing!.at, zone: z.name };
        break;
      }
    }
  }
  const withPrevailing = near.find((z) => z.prevailing?.from.length);
  const usual: WindChoice['usual'] = withPrevailing
    ? { source: 'prevailing', from: withPrevailing.prevailing!.from, zone: withPrevailing.name }
    : live && km(live, at) <= REFRESH_KM && live.prevailing?.length
      ? { source: 'prevailing', from: live.prevailing }
      : { source: 'default', from: DEFAULT_FROM };
  return { recent, usual };
}

/** Al renovar la consulta del lugar, se conserva el viento habitual si es el mismo lugar. */
export function carryPrevailing(saved: Snowline | null, fresh: Snowline): Snowline {
  return saved?.prevailing && km(saved, fresh) <= REFRESH_KM ? { ...fresh, prevailing: saved.prevailing } : fresh;
}

/** ¿Hace falta pedir el viento habitual del lugar? (sin zona descargada cerca con el suyo; una vez por lugar). */
export function needsLivePrevailing(at: { lat: number; lon: number }, live: Snowline | null, zones: ZoneWithSeries[]): boolean {
  if (!live || live.prevailing || km(live, at) > REFRESH_KM) return false;
  return !zones.some((z) => z.prevailing?.from.length && km(z, at) <= z.radiusKm + ZONE_MARGIN_KM);
}
