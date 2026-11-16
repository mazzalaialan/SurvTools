import { distanceMeters } from '@/core/geo/geo';

/**
 * Niveles de los ríos de Paraguay (Dirección de Meteorología e Hidrología, DMH) que lee el servidor propio: `GET /api/rivers/py`
 * (ver server/src/rivers/py.ts). Sin niveles de alerta: solo el nivel sobre el cero de la escala, la variación de un día, y el mínimo y
 * máximo históricos. La ubicación es aproximada (la DMH no publica coordenadas).
 */
export interface PyStation {
  code: string;
  name: string;
  river: string;
  lat: number;
  lon: number;
  approx: boolean;
  level: number;
  /** Fecha de la lectura (AAAA-MM-DD). */
  date: string;
  changeCm: number | null;
  trend: 'rising' | 'falling' | 'steady' | null;
  min: { level: number; date: string } | null;
  max: { level: number; date: string } | null;
}

export interface PyLevels {
  fetchedAt: number;
  stations: PyStation[];
  stale?: boolean;
}

export async function fetchPyLevels(server: string): Promise<PyLevels> {
  const res = await fetch(`${server.replace(/\/+$/, '')}/api/rivers/py`, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`servidor ${res.status}`);
  const data = (await res.json()) as PyLevels;
  if (!Array.isArray(data.stations)) throw new Error('respuesta inesperada');
  return data;
}

export interface NearPy {
  station: PyStation;
  km: number;
}

/** Las estaciones más cercanas a un punto, hasta una distancia máxima. */
export function nearestPy(stations: PyStation[], lat: number, lon: number, count = 6, maxKm = 250): NearPy[] {
  return stations
    .map((station) => ({ station, km: distanceMeters({ lat, lon }, station) / 1000 }))
    .filter((n) => n.km <= maxKm)
    .sort((a, b) => a.km - b.km)
    .slice(0, count);
}

/** Días desde la lectura (la DMH publica una por día: pasados unos días la estación está sin datos nuevos). */
export const readingAgeDays = (date: string, now = Date.now()): number => Math.max(0, Math.floor((now - Date.parse(`${date}T12:00:00-03:00`)) / 86_400_000));

const STORE = 'vikarg.rivers.py.last';
export function loadSavedPy(): PyLevels | null {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as PyLevels) : null;
  } catch {
    return null;
  }
}
export function savePy(l: PyLevels): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(l));
  } catch {
    /* sin almacenamiento: se ve igual con conexión */
  }
}
