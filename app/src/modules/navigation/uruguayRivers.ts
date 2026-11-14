import { distanceMeters } from '@/core/geo/geo';

/**
 * Niveles de ríos de Uruguay (CARU, del río Uruguay, y DINAGUA, del resto del país) que lee el servidor propio: `GET /api/rivers/uy`
 * (ver server/src/rivers/uy.ts). No traen umbrales de alerta: solo el nivel sobre el cero de la estación, su variación y cuándo se midió.
 */
export interface UyStation {
  id: string;
  name: string;
  source: 'CARU' | 'DINAGUA';
  provider: string;
  lat: number;
  lon: number;
  level: number;
  at: string;
  change: number | null;
  trend: 'rising' | 'falling' | 'steady' | null;
}

export interface UyLevels {
  fetchedAt: number;
  stations: UyStation[];
  sources: { caru: boolean; dinagua: boolean };
  stale?: boolean;
}

export async function fetchUyLevels(server: string): Promise<UyLevels> {
  const res = await fetch(`${server.replace(/\/+$/, '')}/api/rivers/uy`, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`servidor ${res.status}`);
  const data = (await res.json()) as UyLevels;
  if (!Array.isArray(data.stations)) throw new Error('respuesta inesperada');
  return data;
}

export interface NearUy {
  station: UyStation;
  km: number;
}

/** Las estaciones más cercanas a un punto, hasta una distancia máxima. */
export function nearestUy(stations: UyStation[], lat: number, lon: number, count = 6, maxKm = 120): NearUy[] {
  return stations
    .map((station) => ({ station, km: distanceMeters({ lat, lon }, station) / 1000 }))
    .filter((n) => n.km <= maxKm)
    .sort((a, b) => a.km - b.km)
    .slice(0, count);
}

const STORE = 'vikarg.rivers.uy.last';
export function loadSavedUy(): UyLevels | null {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as UyLevels) : null;
  } catch {
    return null;
  }
}
export function saveUy(l: UyLevels): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(l));
  } catch {
    /* sin almacenamiento: se ve igual con conexión */
  }
}
