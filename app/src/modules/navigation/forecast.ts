import type { RiverStation } from './rivers';

/**
 * Pronóstico de altura de los ríos del INA (Alerta Hidrológico, API a5 `sim/calibrados/{id}/corridas?includeProno=true`).
 * Cada modelo trae, por estación, una línea principal y una banda (inferior y superior). Las tablas de pronóstico oficiales
 * (`tabprono`) dan unos 10 días; el modelo de San Fernando, 14 días con viento y caudales (marea del Río de la Plata).
 * Se pide desde el teléfono (la API permite CORS) y se guarda el último para verlo sin conexión. Es informativo, no oficial.
 */
export interface ForecastModel {
  cal: number;
  name: string;
  /** Nombres de las tres líneas en la respuesta del INA. */
  main: string;
  lo: string;
  hi: string;
}

/** Del mejor al peor; el mismo orden que `tools/river-data/forecast-map.mjs`. */
export const FORECAST_MODELS: ForecastModel[] = [
  { cal: 289, name: 'tabprono_central', main: 'medio', lo: 'inferior', hi: 'superior' },
  { cal: 312, name: 'tabprono_paraguay', main: 'main', lo: 'inferior', hi: 'superior' },
  { cal: 379, name: 'tabprono_uruguay', main: 'medio', lo: 'inferior', hi: 'superior' },
  { cal: 704, name: 'uruguay_medio', main: 'main', lo: 'inferior', hi: 'superior' },
  { cal: 442, name: 'regre_delta_vcons_snico', main: 'main', lo: 'p01', hi: 'p99' },
  // Delta del Paraná (Campana, Zárate…): el más pesado (casi 1 MB), por eso va detrás de los que lo evitan.
  { cal: 489, name: '288_ajuste_salidas', main: 'main', lo: 'error_band_01', hi: 'error_band_99' },
  { cal: 432, name: 'regre_sfer', main: 'main', lo: 'p05', hi: 'p95' },
];

export interface ForecastPoint {
  /** Instante (ms). */
  t: number;
  /** Altura principal (m) y banda (m); `null` si el modelo no da banda. */
  main: number;
  lo: number | null;
  hi: number | null;
}

export interface StationForecast {
  stationId: number;
  cal: number;
  /** Fecha de emisión del pronóstico (ms). */
  issued: number;
  /** Cuándo lo bajó el teléfono (ms). */
  fetchedAt: number;
  points: ForecastPoint[];
}

interface RawPrediction {
  timestart: string;
  valor: number | null;
  qualifier: string;
}
interface RawRun {
  forecast_date: string;
  series: { estacion_id: number; pronosticos: RawPrediction[] }[];
}

const HOUR = 3_600_000;
/** Los modelos horarios (cientos de puntos) se adelgazan a uno cada 3 horas: alcanza para la forma y entra en el teléfono. */
const MIN_STEP_MS = 3 * HOUR - 60_000;
/** Se descartan los días de pasado de la simulación: acá importa el futuro (y un día de contexto). */
const PAST_MS = 2 * 24 * HOUR;

/** Del JSON de una corrida: el pronóstico de cada estación (por id de estación del INA). */
export function parseRun(runs: RawRun[], model: ForecastModel, fetchedAt = Date.now()): Map<number, StationForecast> {
  const out = new Map<number, StationForecast>();
  const run = runs[0];
  if (!run) return out;
  const issued = Date.parse(run.forecast_date);
  for (const s of run.series) {
    const by = new Map<number, Partial<Record<'main' | 'lo' | 'hi', number>>>();
    for (const p of s.pronosticos) {
      if (p.valor === null || !Number.isFinite(p.valor)) continue;
      const t = Date.parse(p.timestart);
      if (!Number.isFinite(t)) continue;
      const slot = p.qualifier === model.main ? 'main' : p.qualifier === model.lo ? 'lo' : p.qualifier === model.hi ? 'hi' : null;
      if (!slot) continue;
      by.set(t, { ...by.get(t), [slot]: p.valor });
    }
    const sorted = [...by].filter(([, v]) => v.main !== undefined).sort((a, b) => a[0] - b[0]);
    const points: ForecastPoint[] = [];
    let last = -Infinity;
    sorted.forEach(([t, v], i) => {
      if (t < fetchedAt - PAST_MS) return;
      if (t - last < MIN_STEP_MS && i !== sorted.length - 1) return;
      last = t;
      points.push({ t, main: v.main!, lo: v.lo ?? null, hi: v.hi ?? null });
    });
    if (points.length >= 2) out.set(s.estacion_id, { stationId: s.estacion_id, cal: model.cal, issued: Number.isFinite(issued) ? issued : fetchedAt, fetchedAt, points });
  }
  return out;
}

const BASE = 'https://alerta.ina.gob.ar/a5/sim/calibrados';

export async function fetchRun(model: ForecastModel, fetcher: typeof fetch = fetch): Promise<Map<number, StationForecast>> {
  const res = await fetcher(`${BASE}/${model.cal}/corridas?includeProno=true`, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`INA ${res.status}`);
  return parseRun((await res.json()) as RawRun[], model);
}

/** Pide los modelos que hacen falta para estas estaciones y devuelve el mejor pronóstico de cada una. */
export async function fetchForecasts(stations: RiverStation[], fetcher: typeof fetch = fetch): Promise<Map<number, StationForecast>> {
  const cals = new Set(stations.flatMap((s) => s.forecast ?? []));
  const runs = new Map<number, Map<number, StationForecast>>();
  await Promise.all(
    FORECAST_MODELS.filter((m) => cals.has(m.cal)).map(async (m) => {
      try {
        runs.set(m.cal, await fetchRun(m, fetcher));
      } catch {
        /* un modelo que falla no tira a los demás */
      }
    }),
  );
  const out = new Map<number, StationForecast>();
  for (const s of stations) {
    for (const cal of s.forecast ?? []) {
      const f = runs.get(cal)?.get(s.id);
      if (f) {
        out.set(s.id, f);
        break;
      }
    }
  }
  return out;
}

export interface ForecastSummary {
  /** Mayor y menor altura principal prevista (hacia adelante), con su instante. */
  peak: { t: number; v: number };
  trough: { t: number; v: number };
  /** Primer umbral que cruza la línea principal (si ninguno, el primero que cruza la banda); `band` es verdadero si solo lo cruza la banda superior (o inferior, en aguas bajas). */
  first: { kind: 'evac' | 'alert' | 'low'; t: number; band: boolean } | null;
  /** Último instante pronosticado. */
  until: number;
}

/** Qué dice el pronóstico hacia adelante: máximo, mínimo y cuándo llegaría a un umbral de la estación. */
export function summarize(f: StationForecast, s: Pick<RiverStation, 'alert' | 'evac' | 'low'>, now: number): ForecastSummary | null {
  const ahead = f.points.filter((p) => p.t >= now - HOUR);
  if (ahead.length < 2) return null;
  const peak = ahead.reduce((a, p) => (p.main > a.main ? p : a));
  const trough = ahead.reduce((a, p) => (p.main < a.main ? p : a));
  const hit = (test: (p: ForecastPoint) => boolean) => ahead.find(test);
  let first: ForecastSummary['first'] = null;
  const candidates: NonNullable<ForecastSummary['first']>[] = [];
  const add = (kind: 'evac' | 'alert' | 'low', main: ForecastPoint | undefined, band: ForecastPoint | undefined) => {
    if (main) candidates.push({ kind, t: main.t, band: false });
    else if (band) candidates.push({ kind, t: band.t, band: true });
  };
  if (s.evac !== null) add('evac', hit((p) => p.main >= s.evac!), hit((p) => (p.hi ?? p.main) >= s.evac!));
  if (s.alert !== null) add('alert', hit((p) => p.main >= s.alert!), hit((p) => (p.hi ?? p.main) >= s.alert!));
  if (s.low !== null) add('low', hit((p) => p.main <= s.low!), hit((p) => (p.lo ?? p.main) <= s.low!));
  // Si la línea principal llega a algún nivel se informa eso (el que llega antes; a igual hora, el más grave); la banda solo cuando la principal no llega a ninguno.
  const rank = { evac: 0, alert: 1, low: 2 } as const;
  const byTime = (a: { t: number; kind: keyof typeof rank }, b: { t: number; kind: keyof typeof rank }) => a.t - b.t || rank[a.kind] - rank[b.kind];
  first = candidates.filter((c) => !c.band).sort(byTime)[0] ?? candidates.sort(byTime)[0] ?? null;
  return { peak: { t: peak.t, v: peak.main }, trough: { t: trough.t, v: trough.main }, first, until: ahead[ahead.length - 1]!.t };
}

const STORE = 'vikarg.rivers.forecast';
export function loadSavedForecasts(): Map<number, StationForecast> {
  try {
    const raw = localStorage.getItem(STORE);
    return new Map(raw ? (JSON.parse(raw) as [number, StationForecast][]) : []);
  } catch {
    return new Map();
  }
}
export function saveForecasts(fresh: Map<number, StationForecast>): void {
  try {
    const merged = loadSavedForecasts();
    for (const [id, f] of fresh) merged.set(id, f);
    localStorage.setItem(STORE, JSON.stringify([...merged]));
  } catch {
    /* sin almacenamiento: se ve igual con conexión */
  }
}
