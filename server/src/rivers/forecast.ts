import type { RiverStation } from './watch.ts';

/**
 * Pronóstico de altura de los ríos del INA para avisar con anticipación (ver rivers/watch.ts, `runRiverForecastWatch`).
 * Mismo origen y mismos modelos que app/src/modules/navigation/forecast.ts (⚠ mantener los dos iguales): API a5
 * `sim/calibrados/{id}/corridas?includeProno=true`. Acá solo importa la línea principal: la banda no dispara avisos.
 */
export interface ForecastModel {
  cal: number;
  main: string;
}

/** Del mejor al peor; el mismo orden que `forecast` en rivers-AR.json (tools/river-data/forecast-map.mjs). */
export const FORECAST_MODELS: ForecastModel[] = [
  { cal: 289, main: 'medio' },
  { cal: 312, main: 'main' },
  { cal: 379, main: 'medio' },
  { cal: 704, main: 'main' },
  { cal: 442, main: 'main' },
  { cal: 489, main: 'main' },
  { cal: 432, main: 'main' },
];

export interface ForecastPoint {
  t: number;
  value: number;
}

export interface StationForecast {
  stationId: number;
  cal: number;
  /** Emisión del pronóstico (ms). */
  issued: number;
  points: ForecastPoint[];
}

interface RawRun {
  forecast_date: string;
  series: { estacion_id: number; pronosticos: { timestart: string; valor: number | null; qualifier: string }[] }[];
}

const BASE = 'https://alerta.ina.gob.ar/a5/sim/calibrados';
const UA = 'VikArg-Survival-Tools/1.0';

export function parseRun(runs: RawRun[], model: ForecastModel): Map<number, StationForecast> {
  const out = new Map<number, StationForecast>();
  const run = runs[0];
  if (!run) return out;
  const issued = Date.parse(run.forecast_date);
  for (const s of run.series) {
    const points = s.pronosticos
      .filter((p) => p.qualifier === model.main && p.valor !== null && Number.isFinite(p.valor) && Number.isFinite(Date.parse(p.timestart)))
      .map((p) => ({ t: Date.parse(p.timestart), value: p.valor as number }))
      .sort((a, b) => a.t - b.t);
    if (points.length >= 2) out.set(s.estacion_id, { stationId: s.estacion_id, cal: model.cal, issued: Number.isFinite(issued) ? issued : 0, points });
  }
  return out;
}

/** El mejor pronóstico de cada estación que lo tiene, pidiendo solo los modelos que hacen falta. Un modelo que falla no tira a los demás. */
export async function fetchForecasts(stations: RiverStation[], fetcher: typeof fetch = fetch): Promise<Map<number, StationForecast>> {
  const cals = new Set(stations.flatMap((s) => s.forecast ?? []));
  const runs = new Map<number, Map<number, StationForecast>>();
  await Promise.all(
    FORECAST_MODELS.filter((m) => cals.has(m.cal)).map(async (m) => {
      try {
        const res = await fetcher(`${BASE}/${m.cal}/corridas?includeProno=true`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(60_000) });
        if (!res.ok) throw new Error(`INA ${res.status}`);
        runs.set(m.cal, parseRun((await res.json()) as RawRun[], m));
      } catch {
        /* se reintenta en la próxima vuelta */
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

export interface Crossing {
  kind: 'evac' | 'alert' | 'low';
  /** Cuándo la línea principal cruza el nivel (ms) y cuánto vale entonces. */
  t: number;
  value: number;
  threshold: number;
}

/** Los días hacia adelante que se miran para avisar. */
export const FORECAST_HORIZON_MS = 7 * 86_400_000;

/**
 * Los cruces de la línea principal con los niveles de la estación dentro del horizonte: el de crecida más grave (evacuación, o si no
 * alerta) y el de bajante (aguas bajas). Solo hacia adelante: lo pasado del modelo no cuenta.
 */
export function crossings(f: StationForecast, s: Pick<RiverStation, 'alert' | 'evac' | 'low'>, now: number): { high: Crossing | null; low: Crossing | null } {
  const ahead = f.points.filter((p) => p.t >= now && p.t <= now + FORECAST_HORIZON_MS);
  const find = (kind: Crossing['kind'], threshold: number | null, test: (v: number) => boolean): Crossing | null => {
    if (threshold === null) return null;
    const p = ahead.find((x) => test(x.value));
    return p ? { kind, t: p.t, value: p.value, threshold } : null;
  };
  const evac = find('evac', s.evac, (v) => v >= s.evac!);
  const alert = find('alert', s.alert, (v) => v >= s.alert!);
  // Crecida: el nivel más grave que se pronostica (evacuación antes que alerta). Si después de avisar la alerta el pronóstico suma la
  // evacuación, el aviso sale de nuevo porque es más grave.
  const high = evac ?? alert;
  return { high, low: find('low', s.low, (v) => v <= s.low!) };
}
