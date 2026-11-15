import { distanceMeters } from '@/core/geo/geo';

/**
 * Sobreelevación meteorológica del Río de la Plata (INA, API a5, calibrado 308 «marea_rdp_0», marea astronómica + meteorológica):
 * cuánto sube o baja el agua por el viento y la presión respecto de la marea calculada (la variable 36 de cada punto). Una corrida
 * por día, un valor por hora durante 4 días, en 12 puntos del Delta y de la costa norte del estuario que dan casi lo mismo (por eso se
 * promedian y solo se usa cerca de ahí). Se pide desde el teléfono (la API permite CORS) y se guarda la última para verla sin conexión.
 * Es informativo, no oficial: para navegar o evacuar vale el pronóstico del SHN.
 */
export const SURGE_CAL = 308;
export const SURGE_VAR = 36;
/** El centro de los puntos del modelo (Delta y costa norte) y hasta dónde vale su sobreelevación para otro lugar. */
export const SURGE_CENTER = { lat: -34.15, lon: -58.45 };
export const SURGE_MAX_KM = 100;

export interface SurgePoint {
  /** Instante (ms) y sobreelevación (m): positiva, el agua sube más de lo calculado. */
  t: number;
  v: number;
}

export interface SurgeForecast {
  /** Emisión de la corrida (ms) y cuándo la bajó el teléfono (ms). */
  issued: number;
  fetchedAt: number;
  points: SurgePoint[];
}

interface RawSeries {
  series_id?: number;
  estacion_id?: number;
  var_id?: number;
  pronosticos?: { timestart: string; valor: number | null; qualifier?: string }[];
}
interface RawRun {
  forecast_date: string;
  series: RawSeries[];
}

/** ¿Este lugar está cerca de los puntos del modelo? */
export function nearSurgePoints(lat: number, lon: number): boolean {
  return distanceMeters({ lat, lon }, SURGE_CENTER) / 1000 <= SURGE_MAX_KM;
}

/**
 * De las dos corridas (la liviana dice qué series son la variable 36; la completa trae los datos sin estación): el promedio
 * por hora de todos los puntos. `null` si no hay datos.
 */
export function parseSurge(meta: RawRun[], full: RawRun[], fetchedAt = Date.now()): SurgeForecast | null {
  const ids = new Set((meta[0]?.series ?? []).filter((s) => s.var_id === SURGE_VAR && s.series_id !== undefined).map((s) => s.series_id!));
  const run = full[0];
  if (!run || ids.size === 0) return null;
  const sums = new Map<number, { sum: number; n: number }>();
  for (const s of run.series) {
    if (s.series_id === undefined || !ids.has(s.series_id)) continue;
    for (const p of s.pronosticos ?? []) {
      if (p.valor === null || !Number.isFinite(p.valor)) continue;
      const t = Date.parse(p.timestart);
      if (!Number.isFinite(t)) continue;
      const acc = sums.get(t) ?? { sum: 0, n: 0 };
      acc.sum += p.valor;
      acc.n += 1;
      sums.set(t, acc);
    }
  }
  const points = [...sums].map(([t, a]) => ({ t, v: a.sum / a.n })).sort((a, b) => a.t - b.t);
  if (points.length < 2) return null;
  const issued = Date.parse(run.forecast_date);
  return { issued: Number.isFinite(issued) ? issued : fetchedAt, fetchedAt, points };
}

const BASE = 'https://alerta.ina.gob.ar/a5/sim/calibrados';

export async function fetchSurge(fetcher: typeof fetch = fetch): Promise<SurgeForecast | null> {
  const get = async (prono: boolean) => {
    const res = await fetcher(`${BASE}/${SURGE_CAL}/corridas?includeProno=${prono}`, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`INA ${res.status}`);
    return (await res.json()) as RawRun[];
  };
  const [meta, full] = await Promise.all([get(false), get(true)]);
  return parseSurge(meta, full);
}

/** La sobreelevación en un instante (interpolada entre horas); `null` fuera del período que cubre el pronóstico. */
export function surgeAt(s: SurgeForecast, ms: number): number | null {
  const p = s.points;
  if (ms < p[0]!.t || ms > p[p.length - 1]!.t) return null;
  let i = 1;
  while (i < p.length - 1 && p[i]!.t < ms) i++;
  const a = p[i - 1]!;
  const b = p[i]!;
  const k = b.t === a.t ? 0 : (ms - a.t) / (b.t - a.t);
  return a.v + (b.v - a.v) * k;
}

export interface SurgeSummary {
  now: number | null;
  max: SurgePoint;
  min: SurgePoint;
}

/** De ahora en adelante: la sobreelevación de ahora, la máxima y la mínima (esta última, el agua más baja de lo calculado). */
export function surgeSummary(s: SurgeForecast, nowMs: number): SurgeSummary | null {
  const future = s.points.filter((p) => p.t >= nowMs - 3_600_000);
  if (future.length === 0) return null;
  return {
    now: surgeAt(s, nowMs),
    max: future.reduce((m, p) => (p.v > m.v ? p : m)),
    min: future.reduce((m, p) => (p.v < m.v ? p : m)),
  };
}

const STORE = 'vikarg.surge.last';
export function loadSavedSurge(): SurgeForecast | null {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as SurgeForecast) : null;
  } catch {
    return null;
  }
}
export function saveSurge(s: SurgeForecast): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(s));
  } catch {
    /* sin almacenamiento: se ve igual con conexión */
  }
}
