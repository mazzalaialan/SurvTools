import { archiveBase } from '@/modules/maps/wind';
import { omFetch, ARCHIVE_FROM_YEAR } from '@/modules/weather/omFetch';

/**
 * Fechas de helada del lugar de la huerta, calculadas con las mínimas diarias
 * desde 2020 (histórico de Open-Meteo, el mismo servidor que usa el
 * mapa de viento): en vez de depender solo de la zona del calendario, la
 * última helada de primavera y la primera de otoño de ese punto.
 *
 * Helada = mínima a 2 m de 2 °C o menos (la "helada en el pasto", el mismo
 * umbral que el aviso para los cultivos sensibles). Hemisferio sur: la última
 * de primavera es la última entre julio y diciembre; la primera de otoño, la
 * primera entre enero y junio. Como fecha segura se toma la más tardía de
 * los años (conservador: el histórico es de una grilla y suaviza los bajos fríos).
 */

export const FROST_MIN_C = 2;

export interface FrostDates {
  years: number;
  /** MM-DD: promedio y la más tardía de la última helada de primavera (null si algún año no hubo). */
  lastAvg: string | null;
  lastLatest: string | null;
  /** MM-DD: promedio y la más temprana de la primera helada de otoño. */
  firstAvg: string | null;
  firstEarliest: string | null;
  /** Hubo heladas en diciembre o en enero: en ese lugar hiela todo el año (altiplano, alta montaña). */
  allYear: boolean;
}

const BASE_YEAR = 2001; // año no bisiesto para pasar de día del año a MM-DD
const dayOf = (mmdd: string) => (Date.UTC(BASE_YEAR, Number(mmdd.slice(0, 2)) - 1, Number(mmdd.slice(3, 5))) - Date.UTC(BASE_YEAR, 0, 1)) / 86_400_000;
const mmddOf = (day: number) => new Date(Date.UTC(BASE_YEAR, 0, 1) + Math.round(day) * 86_400_000).toISOString().slice(5, 10);

/** Fechas de helada a partir de días (AAAA-MM-DD) y mínimas diarias. */
export function frostDates(times: string[], mins: (number | null)[], threshold = FROST_MIN_C): FrostDates {
  const last = new Map<number, string>();
  const first = new Map<number, string>();
  const years = new Set<number>();
  let allYear = false;
  times.forEach((t, i) => {
    const y = Number(t.slice(0, 4));
    years.add(y);
    const m = mins[i];
    if (m == null || m > threshold) return;
    const md = t.slice(5, 10);
    if (md >= '12-01' || md < '02-01') allYear = true;
    if (md >= '07-01') last.set(y, md);
    else if (!first.has(y)) first.set(y, md);
  });
  const avg = (v: string[]) => (v.length ? mmddOf(v.reduce((s, x) => s + dayOf(x), 0) / v.length) : null);
  const lasts = [...last.values()];
  const firsts = [...first.values()];
  return {
    years: years.size,
    lastAvg: avg(lasts),
    lastLatest: lasts.length ? lasts.sort().at(-1)! : null,
    firstAvg: avg(firsts),
    firstEarliest: firsts.length ? firsts.sort()[0]! : null,
    allYear,
  };
}

/** Las mínimas diarias del punto desde 2020 hasta el último año completo (los años que guarda el servidor propio). */
export async function fetchFrostDates(base: string, lat: number, lon: number, now = new Date()): Promise<FrostDates> {
  const lastYear = now.getUTCFullYear() - 1;
  const params = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lon.toFixed(3),
    start_date: `${ARCHIVE_FROM_YEAR}-01-01`,
    end_date: `${lastYear}-12-31`,
    daily: 'temperature_2m_min',
    timezone: 'auto',
  });
  const res = await omFetch(`${archiveBase(base)}/v1/archive?${params}`, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = ((await res.json()) as { daily?: { time?: string[]; temperature_2m_min?: (number | null)[] } }).daily;
  if (!d?.time?.length) throw new Error('empty');
  return frostDates(d.time, d.temperature_2m_min ?? []);
}
