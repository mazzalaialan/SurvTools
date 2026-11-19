import { distanceMeters } from '@/core/geo/geo';

/**
 * Niveles de los ríos de Brasil (telemetría de la ANA) que lee el servidor propio: `GET /api/rivers/br` (ver server/src/rivers/br.ts).
 * Nivel en cm sobre el cero de cada escala, casi en tiempo real (15 minutos a dos veces por día, según la estación). Las estaciones de la
 * cuenca del río Uruguay traen las cotas de atención, alerta e inundación del SGB/CPRM (tabla de 2023, pueden haber cambiado); el Iguazú, el
 * Paraná y algunas del Uruguay no tienen cotas oficiales: solo nivel, sin estado.
 */
export interface BrThresholds {
  attention: number | null;
  alert: number | null;
  flood: number | null;
}

export interface BrStation {
  code: string;
  name: string;
  river: string;
  muni: string;
  lat: number;
  lon: number;
  basin: string;
  thresholds: BrThresholds | null;
  /** Nivel en cm y momento de la lectura (ISO con la hora de Brasilia). */
  level: number;
  at: string;
  flow: number | null;
  changeCm: number | null;
  changeHours: number | null;
  trend: 'rising' | 'falling' | 'steady' | null;
}

export interface BrLevels {
  fetchedAt: number;
  stations: BrStation[];
  failed?: string[];
  stale?: boolean;
}

/** El servidor está haciendo la primera ronda (tarda más de un minuto): se reintenta en un rato. */
export class BrLoadingError extends Error {}

export async function fetchBrLevels(server: string): Promise<BrLevels> {
  const res = await fetch(`${server.replace(/\/+$/, '')}/api/rivers/br`, { signal: AbortSignal.timeout(60_000) });
  if (res.status === 503) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    if (body?.error === 'loading') throw new BrLoadingError('cargando');
  }
  if (!res.ok) throw new Error(`servidor ${res.status}`);
  const data = (await res.json()) as BrLevels;
  if (!Array.isArray(data.stations)) throw new Error('respuesta inesperada');
  return data;
}

export interface NearBr {
  station: BrStation;
  km: number;
}

/** Las estaciones más cercanas a un punto, hasta una distancia máxima. */
export function nearestBr(stations: BrStation[], lat: number, lon: number, count = 6, maxKm = 250): NearBr[] {
  return stations
    .map((station) => ({ station, km: distanceMeters({ lat, lon }, station) / 1000 }))
    .filter((n) => n.km <= maxKm)
    .sort((a, b) => a.km - b.km)
    .slice(0, count);
}

export type BrState = 'normal' | 'attention' | 'alert' | 'flood';

/** Estado del nivel (cm) frente a las cotas oficiales; null si la estación no tiene cotas (no se inventan). */
export function brState(levelCm: number, th: BrThresholds | null): BrState | null {
  if (!th || (th.attention === null && th.alert === null && th.flood === null)) return null;
  if (th.flood !== null && levelCm >= th.flood) return 'flood';
  if (th.alert !== null && levelCm >= th.alert) return 'alert';
  if (th.attention !== null && levelCm >= th.attention) return 'attention';
  return 'normal';
}

/** Una lectura de más de un día se marca como vieja y no se le pone estado ni tendencia (hay estaciones sin nivel nuevo desde hace días). */
export const OLD_READING_HOURS = 24;
export const readingAgeHours = (at: string, now = Date.now()): number => Math.max(0, (now - Date.parse(at)) / 3_600_000);

const STORE = 'vikarg.rivers.br.last';
export function loadSavedBr(): BrLevels | null {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as BrLevels) : null;
  } catch {
    return null;
  }
}
export function saveBr(l: BrLevels): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(l));
  } catch {
    /* sin almacenamiento: se ve igual con conexión */
  }
}
