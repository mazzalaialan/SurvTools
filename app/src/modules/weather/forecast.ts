import { nowcastParams, parseSlots, type RainSlot } from './nowcast';
import { omFetch } from './omFetch';

/**
 * Pronóstico de Open-Meteo (open source, autoalojable; la URL se configura en
 * Ajustes). Se pide siempre en unidades métricas y se convierte al mostrar.
 */

export interface Forecast {
  /** Cuándo se descargó (ISO). */
  fetchedAt: string;
  lat: number;
  lon: number;
  /** Zona horaria del lugar (las horas de `hourly`/`daily` vienen en esa zona). */
  timezone: string;
  current: {
    time: string;
    temperature: number;
    apparent: number;
    humidity: number;
    precipitation: number;
    code: number;
    windSpeed: number;
    windDirection: number;
    windGusts: number;
    pressure: number;
  };
  hourly: {
    time: string;
    temperature: number;
    precipProbability: number | null;
    code: number;
    windSpeed: number;
    // Los siguientes son `null` en pronósticos guardados por versiones anteriores.
    /** De dónde viene el viento, grados. */
    windDirection: number | null;
    windGusts: number | null;
    apparent: number | null;
    humidity: number | null;
    /** Lluvia y nieve de esa hora: mm y cm. */
    precipitation: number | null;
    snowfall: number | null;
    /** Nubosidad, %. */
    cloudCover: number | null;
    /** Visibilidad, metros. */
    visibility: number | null;
    /** Energía disponible para tormentas (J/kg). */
    cape: number | null;
    /** Altura de la isoterma de 0 °C, metros. */
    freezingLevel: number | null;
  }[];
  daily: {
    date: string;
    code: number;
    max: number;
    min: number;
    precipitation: number;
    precipProbability: number | null;
    windMax: number;
    gustMax: number;
    /** Dirección predominante (de dónde viene). */
    windDirection: number | null;
    uvMax: number | null;
  }[];
  /** Lluvia de las próximas 2 horas cada 15 min (vacío en pronósticos guardados por versiones anteriores). */
  minutely15?: RainSlot[];
}

const CURRENT = 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl';
const HOURLY = [
  'temperature_2m',
  'apparent_temperature',
  'relative_humidity_2m',
  'precipitation_probability',
  'precipitation',
  'snowfall',
  'weather_code',
  'cloud_cover',
  'visibility',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'cape',
  'freezing_level_height',
].join(',');
const DAILY =
  'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,uv_index_max';

/** Open-Meteo permite hasta 16 días; después del 7.º se muestran como tendencia (son menos confiables). */
export const FORECAST_DAYS = 16;
export const RELIABLE_DAYS = 7;

/**
 * `elevationM`: la altura real del lugar. Open-Meteo corrige la temperatura según esa altura (sin ella usa
 * la del punto de su malla, que en la montaña puede estar cientos de metros más abajo o más arriba).
 */
export function forecastUrl(base: string, lat: number, lon: number, elevationM?: number | null): string {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: CURRENT,
    hourly: HOURLY,
    daily: DAILY,
    timezone: 'auto',
    forecast_days: String(FORECAST_DAYS),
    ...nowcastParams(),
  });
  if (typeof elevationM === 'number' && Number.isFinite(elevationM) && elevationM > -400 && elevationM < 8900) params.set('elevation', String(Math.round(elevationM)));
  return `${base.replace(/\/+$/, '')}/v1/forecast?${params}`;
}

export class WeatherError extends Error {
  constructor(public readonly code: 'offline' | 'unreachable' | 'invalid-response') {
    super(code);
    this.name = 'WeatherError';
  }
}

interface ApiResponse {
  latitude: number;
  longitude: number;
  timezone: string;
  current: Record<string, number | string>;
  hourly: Record<string, (number | string | null)[]>;
  daily: Record<string, (number | string | null)[]>;
  minutely_15?: { time?: unknown[]; precipitation?: unknown[] };
}

export async function fetchForecast(base: string, lat: number, lon: number, now = new Date(), elevationM?: number | null): Promise<Forecast> {
  if (!navigator.onLine) throw new WeatherError('offline');
  let res: Response;
  try {
    res = await omFetch(forecastUrl(base, lat, lon, elevationM), { signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new WeatherError('unreachable');
  }
  if (!res.ok) throw new WeatherError('invalid-response');
  try {
    return parseForecast((await res.json()) as ApiResponse, now);
  } catch {
    throw new WeatherError('invalid-response');
  }
}

export function parseForecast(data: ApiResponse, now = new Date()): Forecast {
  const c = data.current;
  const h = data.hourly;
  const d = data.daily;
  const num = (v: unknown) => {
    if (typeof v !== 'number') throw new Error('bad number');
    return v;
  };
  const opt = (v: unknown) => (typeof v === 'number' ? v : null);
  return {
    fetchedAt: now.toISOString(),
    lat: data.latitude,
    lon: data.longitude,
    timezone: data.timezone,
    current: {
      time: String(c.time),
      temperature: num(c.temperature_2m),
      apparent: num(c.apparent_temperature),
      humidity: num(c.relative_humidity_2m),
      precipitation: num(c.precipitation),
      code: num(c.weather_code),
      windSpeed: num(c.wind_speed_10m),
      windDirection: num(c.wind_direction_10m),
      windGusts: num(c.wind_gusts_10m),
      pressure: num(c.pressure_msl),
    },
    // Al final del rango (día 16) el modelo deja horas y días vacíos (null): se saltean esos,
    // en lugar de descartar todo el pronóstico.
    hourly: (h.time ?? []).flatMap((time, i) => {
      const temperature = opt(h.temperature_2m?.[i]);
      const code = opt(h.weather_code?.[i]);
      if (temperature === null || code === null) return [];
      return [{
      time: String(time),
      temperature,
      precipProbability: opt(h.precipitation_probability?.[i]),
      code,
      windSpeed: opt(h.wind_speed_10m?.[i]) ?? 0,
      windDirection: opt(h.wind_direction_10m?.[i]),
      windGusts: opt(h.wind_gusts_10m?.[i]),
      apparent: opt(h.apparent_temperature?.[i]),
      humidity: opt(h.relative_humidity_2m?.[i]),
      precipitation: opt(h.precipitation?.[i]),
      snowfall: opt(h.snowfall?.[i]),
      cloudCover: opt(h.cloud_cover?.[i]),
      visibility: opt(h.visibility?.[i]),
      cape: opt(h.cape?.[i]),
      freezingLevel: opt(h.freezing_level_height?.[i]),
      }];
    }),
    daily: (d.time ?? []).flatMap((date, i) => {
      const code = opt(d.weather_code?.[i]);
      const max = opt(d.temperature_2m_max?.[i]);
      const min = opt(d.temperature_2m_min?.[i]);
      if (code === null || max === null || min === null) return [];
      return [{
      date: String(date),
      code,
      max,
      min,
      precipitation: opt(d.precipitation_sum?.[i]) ?? 0,
      precipProbability: opt(d.precipitation_probability_max?.[i]),
      windMax: opt(d.wind_speed_10m_max?.[i]) ?? 0,
      gustMax: opt(d.wind_gusts_10m_max?.[i]) ?? 0,
      windDirection: opt(d.wind_direction_10m_dominant?.[i]),
      uvMax: opt(d.uv_index_max?.[i]),
      }];
    }),
    minutely15: parseSlots(data.minutely_15),
  };
}

export type Sky = 'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm';

/** Código WMO de Open-Meteo → tipo de cielo (para ícono y texto). */
export function skyOf(code: number): Sky {
  if (code === 0) return 'clear';
  if (code <= 2) return 'partly';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  return 'cloudy';
}

export type WarningKind = 'storm' | 'gusts' | 'heavyRain' | 'snow' | 'frost' | 'heat' | 'uv';

export interface Warning {
  kind: WarningKind;
  date: string;
  /** Valor que disparó el aviso (km/h, mm, °C o índice UV). */
  value: number;
}

/**
 * Avisos calculados a partir del pronóstico (no son alertas oficiales):
 * lo que conviene saber para planificar una salida o preparar la casa.
 */
export function warningsOf(daily: Forecast['daily']): Warning[] {
  const out: Warning[] = [];
  for (const day of daily) {
    if (skyOf(day.code) === 'storm') out.push({ kind: 'storm', date: day.date, value: day.code });
    if (day.gustMax >= 70) out.push({ kind: 'gusts', date: day.date, value: day.gustMax });
    if (day.precipitation >= 30) out.push({ kind: 'heavyRain', date: day.date, value: day.precipitation });
    if (skyOf(day.code) === 'snow') out.push({ kind: 'snow', date: day.date, value: day.code });
    if (day.min <= 0) out.push({ kind: 'frost', date: day.date, value: day.min });
    if (day.max >= 35) out.push({ kind: 'heat', date: day.date, value: day.max });
    if (day.uvMax !== null && day.uvMax >= 8) out.push({ kind: 'uv', date: day.date, value: day.uvMax });
  }
  return out;
}

/**
 * Hora actual en la zona horaria del lugar, en el formato de Open-Meteo
 * ("YYYY-MM-DDTHH:MM"). Las horas del pronóstico vienen en esa zona: "ahora"
 * no puede ser la hora en que se descargó (un pronóstico guardado quedaría
 * mostrando horas ya pasadas).
 */
export function placeNow(timezone: string, now = new Date()): string {
  try {
    // sv-SE da "2026-10-31 02:15", el formato ISO local.
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .format(now)
      .replace(' ', 'T');
  } catch {
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
  }
}

/** Días con detalle por hora (hoy y los 2 siguientes); hasta el 7.º, por períodos del día; después, sin detalle. */
export const HOURLY_DETAIL_DAYS = 3;

export type DayPeriod = 'night' | 'morning' | 'afternoon' | 'evening';

/** Madrugada 0–6, mañana 6–12, tarde 12–18, noche 18–24. */
export const PERIODS: { id: DayPeriod; from: number; to: number }[] = [
  { id: 'night', from: 0, to: 6 },
  { id: 'morning', from: 6, to: 12 },
  { id: 'afternoon', from: 12, to: 18 },
  { id: 'evening', from: 18, to: 24 },
];

export interface PeriodSummary {
  period: DayPeriod;
  /** Cielo representativo: lo más significativo que dure al menos 2 horas (lluvia antes que nubes). */
  code: number;
  min: number;
  max: number;
  precipProbability: number | null;
  /** mm y cm totales del período. */
  precipitation: number;
  snowfall: number;
  windSpeed: number;
  windGusts: number | null;
  /** Dirección predominante (promedio vectorial), de dónde viene. */
  windDirection: number | null;
  cape: number | null;
  /** Visibilidad mínima (para saber si hubo niebla). */
  visibility: number | null;
  /** Isoterma de 0° más baja. */
  freezingLevel: number | null;
}

const SKY_RANK: Record<Sky, number> = { clear: 0, partly: 1, cloudy: 2, fog: 3, drizzle: 4, rain: 5, snow: 6, storm: 7 };

function representativeCode(codes: number[]): number {
  const counts = new Map<number, number>();
  for (const c of codes) counts.set(c, (counts.get(c) ?? 0) + 1);
  // Lo más significativo que dure 2 horas o más; si nada dura tanto, lo más frecuente.
  const lasting = [...counts].filter(([, n]) => n >= 2).map(([c]) => c);
  if (lasting.length) return lasting.reduce((a, b) => (SKY_RANK[skyOf(b)] > SKY_RANK[skyOf(a)] ? b : a));
  return [...counts].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
}

/** Resumen de las horas de un día en madrugada, mañana, tarde y noche (períodos sin datos se omiten). */
export function periodSummaries(hours: Forecast['hourly']): PeriodSummary[] {
  return PERIODS.flatMap(({ id, from, to }) => {
    const hs = hours.filter((h) => {
      const hour = Number(h.time.slice(11, 13));
      return hour >= from && hour < to;
    });
    if (hs.length === 0) return [];
    const nums = (pick: (h: Forecast['hourly'][number]) => number | null) => hs.map(pick).filter((v): v is number => v !== null);
    const maxOf = (xs: number[]) => (xs.length ? Math.max(...xs) : null);
    const minOf = (xs: number[]) => (xs.length ? Math.min(...xs) : null);
    const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 10) / 10;
    // Dirección predominante: promedio de vectores ponderado por la velocidad.
    let e = 0;
    let n = 0;
    for (const h of hs) {
      if (h.windDirection === null) continue;
      const r = (h.windDirection * Math.PI) / 180;
      e += Math.sin(r) * Math.max(1, h.windSpeed);
      n += Math.cos(r) * Math.max(1, h.windSpeed);
    }
    const direction = e === 0 && n === 0 ? null : ((Math.atan2(e, n) * 180) / Math.PI + 360) % 360;
    return [
      {
        period: id,
        code: representativeCode(hs.map((h) => h.code)),
        min: Math.min(...hs.map((h) => h.temperature)),
        max: Math.max(...hs.map((h) => h.temperature)),
        precipProbability: maxOf(nums((h) => h.precipProbability)),
        precipitation: sum(nums((h) => h.precipitation)),
        snowfall: sum(nums((h) => h.snowfall)),
        windSpeed: Math.max(...hs.map((h) => h.windSpeed)),
        windGusts: maxOf(nums((h) => h.windGusts)),
        windDirection: direction,
        cape: maxOf(nums((h) => h.cape)),
        visibility: minOf(nums((h) => h.visibility)),
        freezingLevel: minOf(nums((h) => h.freezingLevel)),
      },
    ];
  });
}

export type StormRisk = 'low' | 'moderate' | 'high' | 'veryHigh';

/** Riesgo de tormenta a partir del CAPE (umbrales habituales en meteorología operativa). */
export function stormRisk(cape: number): StormRisk {
  if (cape < 300) return 'low';
  if (cape < 1000) return 'moderate';
  if (cape < 2500) return 'high';
  return 'veryHigh';
}

/** Por debajo de 1 km de visibilidad se considera niebla. */
export const FOG_VISIBILITY_M = 1000;

/** Para mostrar en el sistema elegido. */
export const toFahrenheit = (c: number) => (c * 9) / 5 + 32;
export const kmhToMph = (v: number) => v / 1.609344;
export const mmToInch = (v: number) => v / 25.4;
export const metersToFeet = (v: number) => v / 0.3048;
export const metersToMiles = (v: number) => v / 1609.344;
