import { WeatherError } from './forecast';
import { omFetch } from './omFetch';

/**
 * Lluvia de las próximas 2 horas en intervalos de 15 minutos (Open-Meteo
 * `minutely_15`). Es pronóstico de modelo, no radar: sirve para "llueve en
 * unos 45 minutos", no para la intensidad exacta.
 */

export interface RainSlot {
  /** Hora local del lugar, "YYYY-MM-DDTHH:MM". */
  time: string;
  /** Milímetros en esos 15 minutos. */
  mm: number;
}

export interface Nowcast {
  /** Hora local del lugar en que se calculó. */
  now: string;
  slots: RainSlot[];
}

/** Por debajo de esto (en 15 min) no se considera lluvia: evita avisar por lloviznas de 0,1 mm. */
export const RAIN_MM_PER_SLOT = 0.2;
const SLOTS = 8;

export function nowcastParams(): Record<string, string> {
  return { minutely_15: 'precipitation', forecast_minutely_15: String(SLOTS) };
}

export function parseSlots(minutely: { time?: unknown[]; precipitation?: unknown[] } | undefined): RainSlot[] {
  if (!minutely?.time || !minutely.precipitation) return [];
  return minutely.time.map((time, i) => ({
    time: String(time),
    mm: typeof minutely.precipitation![i] === 'number' ? (minutely.precipitation![i] as number) : 0,
  }));
}

export async function fetchNowcast(base: string, lat: number, lon: number): Promise<Nowcast> {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: 'precipitation',
    timezone: 'auto',
    ...nowcastParams(),
  });
  let res: Response;
  try {
    res = await omFetch(`${base.replace(/\/+$/, '')}/v1/forecast?${params}`, { signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new WeatherError('unreachable');
  }
  if (!res.ok) throw new WeatherError('invalid-response');
  const data = (await res.json()) as { current?: { time?: string }; minutely_15?: { time?: unknown[]; precipitation?: unknown[] } };
  if (!data.current?.time) throw new WeatherError('invalid-response');
  return { now: data.current.time, slots: parseSlots(data.minutely_15) };
}

export type RainOutlook =
  | { state: 'raining'; mm: number; peakMmH: number }
  | { state: 'soon'; inMinutes: number; startsAt: string; mm: number; peakMmH: number }
  | { state: 'dry' };

/** Minutos entre dos horas locales del mismo lugar ("YYYY-MM-DDTHH:MM"). */
function minutesBetween(from: string, to: string): number {
  return (Date.parse(`${to}:00Z`) - Date.parse(`${from}:00Z`)) / 60_000;
}

/**
 * ¿Llueve ahora, va a llover pronto o no? `mm` es lo esperado desde que empieza
 * hasta el final de la ventana.
 */
export function rainOutlook(nowcast: Nowcast): RainOutlook {
  const upcoming = nowcast.slots.filter((s) => minutesBetween(nowcast.now.slice(0, 16), s.time) > -15);
  const first = upcoming.findIndex((s) => s.mm >= RAIN_MM_PER_SLOT);
  if (first === -1) return { state: 'dry' };
  const mm = upcoming.slice(first).reduce((sum, s) => sum + s.mm, 0);
  // Intensidad: el intervalo de 15 minutos más fuerte, en mm/h.
  const peakMmH = Math.max(...upcoming.slice(first).map((s) => s.mm)) * 4;
  const startsIn = minutesBetween(nowcast.now.slice(0, 16), upcoming[first]!.time);
  if (startsIn <= 0) return { state: 'raining', mm, peakMmH };
  return { state: 'soon', inMinutes: Math.round(startsIn / 5) * 5, startsAt: upcoming[first]!.time, mm, peakMmH };
}
