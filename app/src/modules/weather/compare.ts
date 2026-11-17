import { WeatherError } from './forecast';
import { omFetch } from './omFetch';

/**
 * «Comparación de pronósticos»: lo mismo que pronostica cada modelo meteorológico por separado (el Clima común usa la mezcla que arma
 * Open-Meteo, no un modelo en particular). Se piden varios modelos en una sola consulta (`models=`) y se leen las series de cada uno.
 */

export interface CompareModel {
  /** Nombre del modelo en Open-Meteo (`models=`). */
  id: string;
  /** Cómo se muestra. */
  label: string;
  /** Quién lo hace (leyenda). */
  by: string;
  /** Hasta cuántos días adelante llega (los demás quedan vacíos). */
  days: number;
}

export const MODELS: CompareModel[] = [
  { id: 'ecmwf_ifs025', label: 'ECMWF IFS', by: 'Centro Europeo', days: 15 },
  { id: 'gfs_global', label: 'GFS', by: 'NOAA, EE. UU.', days: 16 },
  { id: 'icon_global', label: 'ICON', by: 'DWD, Alemania', days: 8 },
  { id: 'meteofrance_arpege_world', label: 'ARPEGE', by: 'Météo-France', days: 4 },
  { id: 'ukmo_global_deterministic_10km', label: 'UKMO', by: 'Met Office, Reino Unido', days: 7 },
  { id: 'jma_gsm', label: 'JMA GSM', by: 'JMA, Japón', days: 11 },
];

/** Lo que se compara en el detalle. `temperature_2m` es la temperatura máxima de cada día y `temperature_min`, la mínima (las dos salen de la misma serie por hora). */
export type CompareVar = 'temperature_2m' | 'temperature_min' | 'precipitation' | 'wind_speed_10m' | 'cloud_cover' | 'relative_humidity_2m';
export const VARS: CompareVar[] = ['temperature_2m', 'temperature_min', 'precipitation', 'wind_speed_10m', 'cloud_cover', 'relative_humidity_2m'];
/** Series que se piden a Open-Meteo: además, de dónde sopla el viento (para las flechas de la grilla). */
export type SeriesVar = Exclude<CompareVar, 'temperature_min'> | 'wind_direction_10m';
const SERIES_VARS: SeriesVar[] = ['temperature_2m', 'precipitation', 'wind_speed_10m', 'cloud_cover', 'relative_humidity_2m', 'wind_direction_10m'];
/** La serie por hora de la que sale cada comparación. */
export const sourceOf = (v: CompareVar | SeriesVar): SeriesVar => (v === 'temperature_min' ? 'temperature_2m' : v);

/** Días que se piden: hasta donde llega el modelo más largo (GFS, 16). Cada modelo que no llega a un día queda sin dato ese día y no cuenta. */
export const COMPARE_DAYS = 16;

export interface Compare {
  fetchedAt: string;
  timezone: string;
  /** Hora local de cada punto (ISO sin zona), igual para todos los modelos. */
  time: string[];
  elevation: number | null;
  /** series[modelo][variable] = un valor por hora (null donde ese modelo no llega). */
  series: Record<string, Partial<Record<SeriesVar, (number | null)[]>>>;
}

export function compareUrl(base: string, lat: number, lon: number, elevationM?: number | null): string {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    hourly: SERIES_VARS.join(','),
    models: MODELS.map((m) => m.id).join(','),
    timezone: 'auto',
    forecast_days: String(COMPARE_DAYS),
    wind_speed_unit: 'kmh',
  });
  if (typeof elevationM === 'number' && Number.isFinite(elevationM) && elevationM > -400 && elevationM < 8900) params.set('elevation', String(Math.round(elevationM)));
  return `${base.replace(/\/+$/, '')}/v1/forecast?${params}`;
}

interface ApiResponse {
  timezone?: string;
  elevation?: number;
  hourly?: Record<string, unknown[]> & { time?: string[] };
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Con varios modelos, Open-Meteo nombra cada serie `variable_modelo` (por ejemplo `temperature_2m_gfs_global`). */
export function parseCompare(data: ApiResponse, now = new Date()): Compare {
  const h = data.hourly;
  if (!h?.time?.length) throw new WeatherError('invalid-response');
  const series: Compare['series'] = {};
  for (const m of MODELS) {
    for (const v of SERIES_VARS) {
      const raw = h[`${v}_${m.id}`];
      if (!Array.isArray(raw)) continue;
      const values = raw.map(num);
      if (values.every((x) => x === null)) continue;
      (series[m.id] ??= {})[v] = values;
    }
  }
  if (!Object.keys(series).length) throw new WeatherError('invalid-response');
  return { fetchedAt: now.toISOString(), timezone: data.timezone ?? 'UTC', time: h.time, elevation: num(data.elevation), series };
}

export async function fetchCompare(base: string, lat: number, lon: number, elevationM?: number | null): Promise<Compare> {
  let res: Response;
  try {
    res = await omFetch(compareUrl(base, lat, lon, elevationM), { signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new WeatherError('unreachable');
  }
  if (!res.ok) throw new WeatherError('unreachable');
  let json: ApiResponse;
  try {
    json = (await res.json()) as ApiResponse;
  } catch {
    throw new WeatherError('invalid-response');
  }
  return parseCompare(json);
}

// ---------- Resumen por día ----------


export interface CompareDay {
  date: string;
  /** Valor del día por modelo (null si ese modelo no trae el día completo). */
  byModel: Record<string, number | null>;
  /**
   * Diferencia entre los modelos, sin los dos extremos cuando hay 5 o más: un solo modelo fuera de línea no debe dar la alarma
   * (JMA llegó a dar 40 mm cuando los demás daban entre 3 y 18). Null si hay menos de 2 modelos con dato.
   */
  spread: number | null;
  /** Rango de la mayoría (sin los extremos) y rango completo. */
  core: [number, number] | null;
  full: [number, number] | null;
  /** Modelos que quedan fuera del rango de la mayoría por más de lo que se tolera como «coinciden». */
  outliers: string[];
}

/** Cómo se resume un día de cada variable: máxima de temperatura, lluvia total, viento máximo, nubosidad y humedad medias. */
export function dayValue(v: CompareVar, hours: (number | null)[]): number | null {
  const x = hours.filter((n): n is number => n !== null);
  if (!x.length) return null;
  if (v === 'temperature_min') return Math.min(...x);
  if (v === 'temperature_2m' || v === 'wind_speed_10m') return Math.max(...x);
  if (v === 'precipitation') return x.reduce((a, b) => a + b, 0);
  return x.reduce((a, b) => a + b, 0) / x.length;
}

/** Un día solo se compara si el modelo trae (casi) todas sus horas: un modelo que llega a medio día no debe parecer más frío. */
const MIN_HOURS = 20;

export const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** Umbral por variable de «coinciden» y «difieren» (3 °C ya cambia cómo se sale vestido; 5 mm cambia el plan del día). */
const LIMITS: Record<CompareVar, [number, number]> = {
  temperature_2m: [2, 5],
  temperature_min: [2, 5],
  precipitation: [2, 8],
  wind_speed_10m: [8, 20],
  cloud_cover: [15, 35],
  relative_humidity_2m: [15, 35],
};

export function compareDays(c: Compare, v: CompareVar, enabled: string[] = MODELS.map((m) => m.id)): CompareDay[] {
  const dates = [...new Set(c.time.map((t) => t.slice(0, 10)))];
  return dates.map((date) => {
    const idx = c.time.flatMap((t, i) => (t.startsWith(date) ? [i] : []));
    const byModel: Record<string, number | null> = {};
    for (const m of MODELS) {
      const s = c.series[m.id]?.[sourceOf(v)];
      const hours = s ? idx.map((i) => s[i] ?? null) : [];
      byModel[m.id] = s && hours.filter((x) => x !== null).length >= MIN_HOURS ? dayValue(v, hours) : null;
    }
    const entries = enabled.flatMap((id) => (byModel[id] === null || byModel[id] === undefined ? [] : [[id, byModel[id]!] as const]));
    if (entries.length < 2) return { date, byModel, spread: null, core: null, full: null, outliers: [] };
    const sorted = [...entries].sort((a, b) => a[1] - b[1]);
    const trimmed = sorted.length >= 5 ? sorted.slice(1, -1) : sorted;
    const core: [number, number] = [trimmed[0]![1], trimmed.at(-1)![1]];
    const full: [number, number] = [sorted[0]![1], sorted.at(-1)![1]];
    const tolerance = LIMITS[v][1] / 2;
    const outliers = sorted.length >= 5 ? sorted.filter(([, x]) => x < core[0] - tolerance || x > core[1] + tolerance).map(([id]) => id) : [];
    return { date, byModel, spread: core[1] - core[0], core, full, outliers };
  });
}

export type Agreement = 'high' | 'medium' | 'low';

export function agreementOf(v: CompareVar, spread: number | null): Agreement | null {
  if (spread === null) return null;
  const [ok, bad] = LIMITS[v];
  return spread <= ok ? 'high' : spread <= bad ? 'medium' : 'low';
}

/** El día con más discrepancia (para decirlo en una frase). */
export function widestDay(days: CompareDay[]): CompareDay | null {
  return days.reduce<CompareDay | null>((best, d) => (d.spread !== null && (!best || (best.spread ?? -1) < d.spread) ? d : best), null);
}

// ---------- Grilla al estilo Windguru ----------

/** Un paso cada 3 horas (00, 03, …, 21): el índice de cada columna dentro de las horas de la respuesta. */
export function gridSteps(c: Compare): number[] {
  return c.time.flatMap((t, i) => (Number(t.slice(11, 13)) % 3 === 0 ? [i] : []));
}

/** El valor de un modelo en un paso: la lluvia es la suma de las 3 horas; lo demás, el valor a esa hora. */
export function gridValue(c: Compare, id: string, v: CompareVar | SeriesVar, i: number): number | null {
  const s = c.series[id]?.[sourceOf(v)];
  if (!s) return null;
  if (v !== 'precipitation') return s[i] ?? null;
  const part = [s[i], s[i + 1], s[i + 2]].filter((x): x is number => typeof x === 'number');
  return part.length >= 2 ? part.reduce((a, b) => a + b, 0) : null;
}

/** Mediana de los modelos en un paso (el «consenso»); null con menos de 2 modelos. */
export function consensus(c: Compare, v: CompareVar | SeriesVar, i: number): number | null {
  const xs = MODELS.flatMap((m) => {
    const x = gridValue(c, m.id, v, i);
    return x === null ? [] : [x];
  });
  return xs.length >= 2 ? median(xs) : null;
}

type Stop = [value: number, h: number, s: number, l: number];
const SCALES: Record<CompareVar, Stop[]> = {
  temperature_min: [[-10, 235, 70, 55], [0, 200, 70, 70], [10, 150, 50, 72], [18, 90, 60, 68], [24, 52, 85, 62], [30, 28, 90, 58], [36, 5, 85, 52], [42, 340, 70, 42]],
  temperature_2m: [[-10, 235, 70, 55], [0, 200, 70, 70], [10, 150, 50, 72], [18, 90, 60, 68], [24, 52, 85, 62], [30, 28, 90, 58], [36, 5, 85, 52], [42, 340, 70, 42]],
  precipitation: [[0, 210, 20, 97], [0.2, 200, 70, 88], [1, 205, 75, 72], [3, 215, 80, 58], [8, 235, 75, 45], [20, 275, 65, 38]],
  wind_speed_10m: [[0, 190, 40, 94], [10, 165, 50, 82], [20, 115, 55, 68], [30, 60, 75, 60], [45, 28, 85, 56], [60, 3, 80, 50], [80, 300, 60, 40]],
  cloud_cover: [[0, 210, 30, 98], [50, 215, 12, 82], [100, 220, 8, 62]],
  relative_humidity_2m: [[20, 40, 60, 90], [60, 150, 35, 80], [100, 215, 70, 55]],
};

/** Color de fondo y de texto de una celda, según el valor (la escala de cada variable, interpolada). */
export function cellColor(v: CompareVar, x: number): { bg: string; fg: string } {
  const stops = SCALES[v];
  const first = stops[0]!;
  const last = stops.at(-1)!;
  let h: number, s: number, l: number;
  if (x <= first[0]) [, h, s, l] = first;
  else if (x >= last[0]) [, h, s, l] = last;
  else {
    const k = stops.findIndex((st) => st[0] > x);
    const a = stops[k - 1]!;
    const b = stops[k]!;
    const f = (x - a[0]) / (b[0] - a[0]);
    h = a[1] + (b[1] - a[1]) * f;
    s = a[2] + (b[2] - a[2]) * f;
    l = a[3] + (b[3] - a[3]) * f;
  }
  return { bg: `hsl(${h.toFixed(0)} ${s.toFixed(0)}% ${l.toFixed(0)}%)`, fg: l < 52 ? '#ffffff' : '#111111' };
}

// ---------- Lectura simple día por día ----------

export interface DaySummary {
  date: string;
  /** Cuántos modelos traen ese día completo (los demás quedan en gris y no cuentan). */
  models: number;
  /** Cuántos modelos hay en total para comparar. */
  total: number;
  tempMax: number | null;
  tempMin: number | null;
  /** Mediana de la lluvia total del día entre los modelos. */
  rain: number | null;
  /** Cuántos modelos esperan lluvia (1 mm o más) de los que traen el día completo. */
  rainModels: number;
  windMax: number | null;
}

export const WET_MM = 1;

export function daySummaries(c: Compare): DaySummary[] {
  const temp = compareDays(c, 'temperature_2m');
  const rain = compareDays(c, 'precipitation');
  const wind = compareDays(c, 'wind_speed_10m');
  return temp.map((t, i) => {
    const r = Object.values(rain[i]!.byModel).filter((x): x is number => x !== null);
    const idx = c.time.flatMap((time, k) => (time.startsWith(t.date) ? [k] : []));
    const mins = MODELS.flatMap((m) => {
      const s = c.series[m.id]?.temperature_2m;
      const hours = s ? idx.map((k) => s[k]).filter((x): x is number => typeof x === 'number') : [];
      return hours.length >= MIN_HOURS ? [Math.min(...hours)] : [];
    });
    return {
      date: t.date,
      tempMax: median(Object.values(t.byModel).filter((x): x is number => x !== null)),
      tempMin: median(mins),
      rain: median(r),
      rainModels: r.filter((x) => x >= WET_MM).length,
      models: r.length,
      total: MODELS.filter((m) => c.series[m.id]?.precipitation).length,
      windMax: median(Object.values(wind[i]!.byModel).filter((x): x is number => x !== null)),
    };
  });
}
