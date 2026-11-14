import { distanceMeters } from '@/core/geo/geo';
import { loadDataFile } from '@/modules/emergency/dataFile';

/**
 * Niveles de los ríos de Argentina: el catálogo de estaciones con sus umbrales viene con la app (`data/rivers-AR.json`, tools/river-data)
 * y el último nivel se le pide directo al INA (Alerta Hidrológico, API a5) cuando hay conexión. Sin conexión se ve el último guardado,
 * con su fecha. Los niveles son en metros sobre el cero de escala de cada estación.
 */
export interface RiverStation {
  id: number;
  name: string;
  river: string;
  province: string;
  lat: number;
  lon: number;
  /** Umbrales de la estación (m); null si no tiene. */
  alert: number | null;
  evac: number | null;
  low: number | null;
  /** Serie de altura del INA. */
  series: number;
  /** Modelos del INA que pronostican su altura, del mejor al peor (ver `forecast.ts`); no tiene si no hay pronóstico. */
  forecast?: number[];
  /** Serie del caudal medio diario del INA (m³/s), si la estación la tiene al día; es el valor del día anterior. */
  flow?: number;
}

export interface RiversData {
  generatedAt: string;
  source: string;
  stations: RiverStation[];
}

export const loadRivers = (): Promise<RiversData> => loadDataFile<RiversData>('rivers-AR.json');

export type RiverState = 'evac' | 'alert' | 'low' | 'normal';

/** Estado de un nivel respecto de los umbrales de su estación. */
export function riverState(level: number, s: Pick<RiverStation, 'alert' | 'evac' | 'low'>): RiverState {
  if (s.evac !== null && level >= s.evac) return 'evac';
  if (s.alert !== null && level >= s.alert) return 'alert';
  if (s.low !== null && level <= s.low) return 'low';
  return 'normal';
}

export interface NearRiver {
  station: RiverStation;
  km: number;
}

/** Las estaciones más cercanas a un punto, hasta una distancia máxima. */
export function nearestRivers(stations: RiverStation[], lat: number, lon: number, count = 5, maxKm = 250): NearRiver[] {
  return stations
    .map((station) => ({ station, km: distanceMeters({ lat, lon }, station) / 1000 }))
    .filter((n) => n.km <= maxKm)
    .sort((a, b) => a.km - b.km)
    .slice(0, count);
}

export interface RiverReading {
  /** Nivel en metros. */
  level: number;
  /** Cuándo se midió (ISO). */
  at: string;
  /** Cambio respecto de hace un día (m), si hay con qué comparar. */
  change: number | null;
}

const INA = 'https://alerta.ina.gob.ar/a5/obs/puntual/observaciones';
const STORE = 'vikarg.rivers.last';
/** Dónde se guardan los últimos caudales (mismo formato: `level` es el caudal en m³/s). */
export const FLOW_STORE = 'vikarg.rivers.flows';
/** Un caudal medio diario más viejo que esto (días) se avisa como viejo. */
export const OLD_FLOW_DAYS = 4;
const DAY = 86_400_000;

interface Observation {
  series_id: number;
  timestart: string;
  valor: number | null;
}

/** De las observaciones de unos días, el último nivel de cada serie y su cambio respecto de un día antes. */
export function readingsFrom(observations: Observation[]): Map<number, RiverReading> {
  const bySeries = new Map<number, { t: number; v: number }[]>();
  for (const o of observations) {
    if (o.valor === null || !Number.isFinite(o.valor)) continue;
    const t = Date.parse(o.timestart);
    if (!Number.isFinite(t)) continue;
    bySeries.set(o.series_id, [...(bySeries.get(o.series_id) ?? []), { t, v: o.valor }]);
  }
  const out = new Map<number, RiverReading>();
  for (const [id, points] of bySeries) {
    points.sort((a, b) => a.t - b.t);
    const last = points[points.length - 1]!;
    // El punto más parecido a «hace 24 h», si cae entre 18 y 30 h antes.
    const before = points
      .filter((p) => last.t - p.t >= 18 * 3_600_000 && last.t - p.t <= 30 * 3_600_000)
      .sort((a, b) => Math.abs(last.t - DAY - a.t) - Math.abs(last.t - DAY - b.t))[0];
    out.set(id, { level: last.v, at: new Date(last.t).toISOString(), change: before ? last.v - before.v : null });
  }
  return out;
}

/** Pide al INA los últimos días de cada serie (una sola consulta). */
export async function fetchReadings(series: number[], now = new Date()): Promise<Map<number, RiverReading>> {
  const params = new URLSearchParams({
    series_id: series.join(','),
    timestart: new Date(now.getTime() - 3 * DAY).toISOString().slice(0, 10),
    timeend: new Date(now.getTime() + DAY).toISOString().slice(0, 10),
  });
  const res = await fetch(`${INA}?${params}`, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`INA ${res.status}`);
  return readingsFrom((await res.json()) as Observation[]);
}

/** Los últimos niveles guardados en el teléfono (para verlos sin conexión). */
export function loadSavedReadings(store = STORE): Map<number, RiverReading> {
  try {
    const raw = localStorage.getItem(store);
    return new Map(raw ? (JSON.parse(raw) as [number, RiverReading][]) : []);
  } catch {
    return new Map();
  }
}

export function saveReadings(readings: Map<number, RiverReading>, store = STORE): void {
  try {
    const merged = loadSavedReadings(store);
    for (const [id, r] of readings) merged.set(id, r);
    localStorage.setItem(store, JSON.stringify([...merged]));
  } catch {
    /* sin almacenamiento: se ve igual con conexión */
  }
}
