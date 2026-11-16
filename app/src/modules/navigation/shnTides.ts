import { distanceMeters } from '@/core/geo/geo';
import type { TideExtreme } from './tides';

/**
 * Pronóstico mareológico oficial del SHN para el Río de la Plata (con viento), que lee el servidor propio: `GET /api/tides/shn`
 * (ver server/src/tides/shn.ts). Cada emisión vale unas 13 horas. Las alturas son sobre el cero de las tablas del SHN (en Buenos Aires,
 * 0,91 m bajo el nivel medio), distinto del de las mareas calculadas: lo comparable es la **hora**.
 */
export interface ShnEvent {
  type: 'high' | 'low';
  at: string;
  height: number;
}
export interface ShnStation {
  id: string;
  name: string;
  section: 'interior' | 'exterior';
  lat: number;
  lon: number;
  events: ShnEvent[];
}
export interface ShnForecast {
  fetchedAt: number;
  issuedOn: string;
  validFrom: string;
  validTo: string;
  notes: string[];
  stations: ShnStation[];
  stale?: boolean;
}

export async function fetchShnForecast(server: string): Promise<ShnForecast> {
  const res = await fetch(`${server.replace(/\/+$/, '')}/api/tides/shn`, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`servidor ${res.status}`);
  const data = (await res.json()) as ShnForecast;
  if (!Array.isArray(data.stations)) throw new Error('respuesta inesperada');
  return data;
}

/** El puerto del SHN más cercano a un punto, hasta una distancia máxima (el pronóstico solo cubre el Río de la Plata). */
export function nearestShn(stations: ShnStation[], lat: number, lon: number, maxKm = 45): { station: ShnStation; km: number } | null {
  const best = stations
    .map((station) => ({ station, km: distanceMeters({ lat, lon }, station) / 1000 }))
    .sort((a, b) => a.km - b.km)[0];
  return best && best.km <= maxKm ? best : null;
}

/** ¿Ya venció la emisión? (cada una vale hasta `validTo`; el SHN emite otra unas 3 veces por día). */
export const shnExpired = (f: Pick<ShnForecast, 'validTo'>, now = Date.now()): boolean => Date.parse(f.validTo) < now;

export interface ShnRow {
  event: ShnEvent;
  /** El extremo calculado del mismo tipo más cercano en el tiempo (a menos de 4 horas), y cuántos minutos después (+) o antes (−) llega el oficial. */
  calculated: TideExtreme | null;
  diffMin: number | null;
}

/** Cada extremo del SHN con el calculado por la app del mismo tipo que más se le acerca en el tiempo. */
export function compareWithCalculated(events: ShnEvent[], calculated: TideExtreme[]): ShnRow[] {
  return events.map((event) => {
    const at = Date.parse(event.at);
    const near = calculated
      .filter((c) => c.high === (event.type === 'high') && Math.abs(c.time.getTime() - at) <= 4 * 3_600_000)
      .sort((a, b) => Math.abs(a.time.getTime() - at) - Math.abs(b.time.getTime() - at))[0];
    return { event, calculated: near ?? null, diffMin: near ? Math.round((at - near.time.getTime()) / 60_000) : null };
  });
}

const STORE = 'vikarg.tides.shn.last';
export function loadSavedShn(): ShnForecast | null {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as ShnForecast) : null;
  } catch {
    return null;
  }
}
export function saveShn(f: ShnForecast): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(f));
  } catch {
    /* sin almacenamiento: no se guarda */
  }
}
