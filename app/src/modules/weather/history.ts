/**
 * Clima histórico: qué clima hubo en un lugar en una fecha pasada, con Open-Meteo (la fuente configurada en Ajustes). Se junta lo de dos
 * interfaces de la misma fuente, según qué tan reciente sea cada día:
 * - **Historial** (`/v1/archive`, reanálisis ERA5 desde 1940, ~25 km de resolución): los días hasta hace `ARCHIVE_DELAY_DAYS`.
 * - **Pronóstico** (`/v1/forecast` con `start_date` y `end_date`, que guarda los últimos 92 días): los días más recientes, que el historial
 *   todavía no tiene cerrados.
 * Son datos de modelos, no lo que midió una estación: sirven para saber cuánto llovió o qué temperatura hubo en la zona.
 */
import { archiveBase } from '@/modules/maps/wind';
import { omFetch } from './omFetch';

export type HistorySource = 'archive' | 'forecast';

export interface HistoryHour {
  time: string;
  temperature: number | null;
  apparent: number | null;
  humidity: number | null;
  /** Lluvia y nieve de esa hora: mm y cm. */
  precipitation: number | null;
  snowfall: number | null;
  code: number | null;
  cloudCover: number | null;
  pressure: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  windGusts: number | null;
}

export interface HistoryDay {
  date: string;
  /** De qué interfaz salió el día (los más recientes vienen del pronóstico). */
  source: HistorySource;
  code: number | null;
  max: number | null;
  min: number | null;
  precipitation: number | null;
  snowfall: number | null;
  windMax: number | null;
  gustMax: number | null;
  windDirection: number | null;
  hours: HistoryHour[];
}

export interface History {
  fetchedAt: string;
  lat: number;
  lon: number;
  timezone: string;
  elevation: number | null;
  /** El rango pedido (AAAA-MM-DD) y el día que se eligió. */
  start: string;
  end: string;
  date: string;
  days: HistoryDay[];
}

/** El historial (ERA5) se cierra con unos días de demora: lo más reciente se toma del pronóstico. */
export const ARCHIVE_DELAY_DAYS = 5;
/** El pronóstico guarda los últimos 92 días. */
export const FORECAST_PAST_DAYS = 92;
/** Primer día con datos en el historial. */
export const FIRST_DAY = '1940-01-01';
/** Días que se traen alrededor de la fecha elegida: 3 antes y 3 después (menos si llega a hoy). */
export const WINDOW_DAYS = 7;

const DAY_MS = 86_400_000;
const parse = (iso: string) => new Date(`${iso}T00:00:00Z`);
const fmt = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (iso: string, n: number): string => fmt(new Date(parse(iso).getTime() + n * DAY_MS));
export const daysBetween = (a: string, b: string): number => Math.round((parse(b).getTime() - parse(a).getTime()) / DAY_MS);

/** Hoy en la zona horaria del teléfono (AAAA-MM-DD). */
export function localToday(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** El rango que mejor se adapta a una fecha: 7 días alrededor de ella, sin pasar de hoy ni de la primera fecha del historial. */
export function historyWindow(date: string, today: string): { start: string; end: string } {
  const d = date > today ? today : date < FIRST_DAY ? FIRST_DAY : date;
  const end = addDays(d, 3) > today ? today : addDays(d, 3);
  let start = addDays(end, -(WINDOW_DAYS - 1));
  if (start < FIRST_DAY) start = FIRST_DAY;
  return { start, end };
}

export interface Segment {
  kind: HistorySource;
  start: string;
  end: string;
}

/**
 * Qué pedir a cada interfaz: el historial hasta hace `ARCHIVE_DELAY_DAYS` días y el pronóstico de ahí en adelante (si el rango toca los días
 * recientes, son dos pedidos). El pronóstico solo llega 92 días atrás; si el rango es más viejo, todo sale del historial.
 */
export function planHistory(range: { start: string; end: string }, today: string): Segment[] {
  const lastArchive = addDays(today, -ARCHIVE_DELAY_DAYS);
  const out: Segment[] = [];
  if (range.start <= lastArchive) out.push({ kind: 'archive', start: range.start, end: range.end < lastArchive ? range.end : lastArchive });
  if (range.end > lastArchive) {
    const start = addDays(lastArchive, 1) > range.start ? addDays(lastArchive, 1) : range.start;
    out.push({ kind: 'forecast', start, end: range.end });
  }
  return out;
}

const HOURLY = 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,snowfall,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m';
const DAILY = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant';

export function historyUrl(seg: Segment, base: string, lat: number, lon: number, elevationM?: number | null): string {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    start_date: seg.start,
    end_date: seg.end,
    hourly: HOURLY,
    daily: DAILY,
    timezone: 'auto',
  });
  if (typeof elevationM === 'number' && Number.isFinite(elevationM) && elevationM > -400 && elevationM < 8900) params.set('elevation', String(Math.round(elevationM)));
  const root = seg.kind === 'archive' ? `${archiveBase(base)}/v1/archive` : `${base.replace(/\/+$/, '')}/v1/forecast`;
  return `${root}?${params}`;
}

export class HistoryError extends Error {
  constructor(public readonly code: 'offline' | 'unreachable' | 'invalid-response' | 'too-old') {
    super(code);
    this.name = 'HistoryError';
  }
}

interface ApiResponse {
  latitude: number;
  longitude: number;
  timezone: string;
  elevation?: number;
  hourly: Record<string, (number | string | null)[]>;
  daily: Record<string, (number | string | null)[]>;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** De una respuesta de Open-Meteo a días con sus horas (un día sin ningún dato —el historial todavía no lo cerró— no se incluye). */
export function parseSegment(json: ApiResponse, source: HistorySource): HistoryDay[] {
  const d = json.daily;
  const h = json.hourly;
  if (!d || !h || !Array.isArray(d.time) || !Array.isArray(h.time)) throw new Error('respuesta inesperada');
  const hours = new Map<string, HistoryHour[]>();
  h.time.forEach((time, i) => {
    const t = String(time);
    const row: HistoryHour = {
      time: t,
      temperature: num(h.temperature_2m?.[i]),
      apparent: num(h.apparent_temperature?.[i]),
      humidity: num(h.relative_humidity_2m?.[i]),
      precipitation: num(h.precipitation?.[i]),
      snowfall: num(h.snowfall?.[i]),
      code: num(h.weather_code?.[i]),
      cloudCover: num(h.cloud_cover?.[i]),
      pressure: num(h.pressure_msl?.[i]),
      windSpeed: num(h.wind_speed_10m?.[i]),
      windDirection: num(h.wind_direction_10m?.[i]),
      windGusts: num(h.wind_gusts_10m?.[i]),
    };
    const date = t.slice(0, 10);
    hours.set(date, [...(hours.get(date) ?? []), row]);
  });
  const days: HistoryDay[] = d.time.map((date, i) => ({
    date: String(date),
    source,
    code: num(d.weather_code?.[i]),
    max: num(d.temperature_2m_max?.[i]),
    min: num(d.temperature_2m_min?.[i]),
    precipitation: num(d.precipitation_sum?.[i]),
    snowfall: num(d.snowfall_sum?.[i]),
    windMax: num(d.wind_speed_10m_max?.[i]),
    gustMax: num(d.wind_gusts_10m_max?.[i]),
    windDirection: num(d.wind_direction_10m_dominant?.[i]),
    hours: hours.get(String(date)) ?? [],
  }));
  return days.filter((day) => day.max !== null || day.min !== null || day.hours.some((x) => x.temperature !== null));
}

/** Junta los días de las dos interfaces, sin repetir y en orden (si un día viene de las dos, vale el del historial: es el dato cerrado). */
export function mergeDays(...lists: HistoryDay[][]): HistoryDay[] {
  const byDate = new Map<string, HistoryDay>();
  for (const day of lists.flat()) {
    const cur = byDate.get(day.date);
    if (!cur || (day.source === 'archive' && cur.source !== 'archive')) byDate.set(day.date, day);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

async function getSegment(seg: Segment, base: string, lat: number, lon: number, elevationM: number | null | undefined): Promise<{ days: HistoryDay[]; meta: ApiResponse }> {
  let res: Response;
  try {
    res = await omFetch(historyUrl(seg, base, lat, lon, elevationM), { signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new HistoryError('unreachable');
  }
  if (!res.ok) throw new HistoryError('invalid-response');
  try {
    const json = (await res.json()) as ApiResponse;
    return { days: parseSegment(json, seg.kind), meta: json };
  } catch {
    throw new HistoryError('invalid-response');
  }
}

/** Trae el clima de los días alrededor de `date` (los de hace más de 5 días, del historial; los más recientes, del pronóstico). */
export async function fetchHistory(base: string, lat: number, lon: number, date: string, today = localToday(), elevationM?: number | null): Promise<History> {
  if (!navigator.onLine) throw new HistoryError('offline');
  const range = historyWindow(date, today);
  const segments = planHistory(range, today);
  // Un rango reciente no se puede pedir al pronóstico si es más viejo que sus 92 días (no pasa: lo viejo va al historial).
  const results = await Promise.all(segments.map((s) => getSegment(s, base, lat, lon, elevationM)));
  const days = mergeDays(...results.map((r) => r.days));
  if (days.length === 0) throw new HistoryError('invalid-response');
  const meta = results[0]!.meta;
  return {
    fetchedAt: new Date().toISOString(),
    lat,
    lon,
    timezone: meta.timezone,
    elevation: meta.elevation ?? null,
    start: range.start,
    end: range.end,
    date: date > today ? today : date,
    days,
  };
}
