import { distanceMeters } from '@/core/geo/geo';
import { loadDataFile } from '@/modules/emergency/dataFile';

/**
 * Niveles de los ríos y del lago Titicaca de Bolivia (SENAMHI Bolivia): el reporte diario es un PDF que lee el servidor
 * (`GET /api/rivers/bo`, server/src/rivers/bo.ts); las estaciones con sus coordenadas vienen con la app (`data/rivers-BO.json`).
 * Las lecturas son en centímetros sobre la escala de cada estación; algunas estaciones traen lecturas viejas: se muestra la fecha de cada una.
 */
export interface BoStation {
  name: string;
  lat: number;
  lon: number;
  /** Ubicación aproximada (el pueblo o el puente, no la escala). */
  approx: boolean;
}

export interface BoCatalog {
  generatedAt: string;
  source: string;
  stations: BoStation[];
}

export interface BoReading {
  station: string;
  river: string;
  prevDate: string;
  prevCm: number;
  lastDate: string;
  lastCm: number;
  zeroCm: number | null;
  trend: 'rising' | 'falling' | 'steady';
}

export interface BoLevels {
  reportDate: string;
  fetchedAt: number;
  url: string;
  readings: BoReading[];
  /** El servidor no pudo leer un reporte nuevo y devolvió el último bueno. */
  stale?: boolean;
}

export const loadBoCatalog = (): Promise<BoCatalog> => loadDataFile<BoCatalog>('rivers-BO.json');

export interface NearBo {
  reading: BoReading;
  station: BoStation;
  km: number;
}

/** Las lecturas de las estaciones más cercanas a un punto, hasta una distancia máxima. */
export function nearestBo(levels: BoLevels, catalog: BoCatalog, lat: number, lon: number, count = 6, maxKm = 300): NearBo[] {
  const byName = new Map(catalog.stations.map((s) => [s.name, s]));
  return levels.readings
    .flatMap((reading) => {
      const station = byName.get(reading.station);
      return station ? [{ reading, station, km: distanceMeters({ lat, lon }, station) / 1000 }] : [];
    })
    .filter((n) => n.km <= maxKm)
    .sort((a, b) => a.km - b.km)
    .slice(0, count);
}

/** Días entre la fecha de una lectura (AAAA-MM-DD) y el día del reporte. */
export function ageDays(readingDate: string, reportDate: string): number {
  return Math.round((Date.parse(reportDate) - Date.parse(readingDate)) / 86_400_000);
}

/** Una lectura más vieja que esto no es «de hoy»: se avisa. */
export const OLD_READING_DAYS = 5;

export async function fetchBoLevels(server: string): Promise<BoLevels> {
  const res = await fetch(`${server.replace(/\/+$/, '')}/api/rivers/bo`, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`servidor ${res.status}`);
  return (await res.json()) as BoLevels;
}

/** Resumen del pronóstico hidrológico del SENAMHI y boletín semanal del lago Titicaca (ver server/src/rivers/boExtra.ts). */
export interface BoForecast {
  issuedOn: string;
  period: string;
  note: string;
  trend: 'rises' | 'falls' | null;
  spans: string;
  url: string;
}
export interface BoLake {
  date: string;
  levelM: number;
  absoluteM: number;
  weekCm: number | null;
  vsAverageM: number | null;
  url: string;
}
/** La planilla por estación del pronóstico hidrológico (ver server/src/rivers/boPlanilla.ts): amenaza, tendencia y cuánto falta para el desborde. */
export interface BoPlanillaRow {
  station: string;
  river: string;
  threat: 'yellow' | 'orange' | 'red';
  trend: 'rises' | 'falls' | null;
  /** Cuánto falta para el desborde, en metros (`m`) o en m³/s (`m3s`); null sin dato. */
  untilOverflow: number | null;
  unit: 'm' | 'm3s' | null;
  period: string;
}
export interface BoPlanilla {
  issuedOn: string;
  url: string;
  rows: BoPlanillaRow[];
}
export interface BoExtras {
  fetchedAt: number;
  forecast: BoForecast | null;
  lake: BoLake | null;
  /** Ausente en servidores viejos; null si no se pudo leer. */
  planilla?: BoPlanilla | null;
  stale?: boolean;
}

/** «Pronóstico del SENAMHI: amenaza naranja · ascensos · faltan 218,69 m³/s para el desborde». */
export function boThreatLine(row: BoPlanillaRow, t: (key: string, o?: Record<string, unknown>) => string, lang: string): string {
  const nf = new Intl.NumberFormat(lang, { maximumFractionDigits: 2 });
  const parts = [t('navigation.bolivia.threat.line', { level: t(`navigation.bolivia.threat.${row.threat}`) })];
  if (row.trend) parts.push(t(`navigation.bolivia.threat.${row.trend}`));
  if (row.untilOverflow !== null && row.unit) parts.push(t('navigation.bolivia.threat.until', { value: nf.format(row.untilOverflow), unit: row.unit === 'm' ? 'm' : 'm³/s' }));
  return parts.join(' · ');
}

const THREAT_RANK = { yellow: 1, orange: 2, red: 3 } as const;
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * La fila de la planilla que corresponde a una estación del catálogo (el reporte diario y la planilla escriben los nombres distinto:
 * mayúsculas, tildes, una palabra partida como «Guayaram erin»). Si la estación sale en varias tablas, la de mayor amenaza.
 */
export function planillaFor(rows: BoPlanillaRow[] | undefined | null, stationName: string): BoPlanillaRow | null {
  const cn = norm(stationName);
  if (!rows || cn.length < 4) return null;
  const hits = rows.filter((r) => {
    const rn = norm(r.station);
    return rn.length >= 4 && (rn === cn || cn.startsWith(rn) || rn.startsWith(cn));
  });
  return hits.reduce<BoPlanillaRow | null>((best, r) => (!best || THREAT_RANK[r.threat] > THREAT_RANK[best.threat] ? r : best), null);
}

export async function fetchBoExtras(server: string): Promise<BoExtras> {
  const res = await fetch(`${server.replace(/\/+$/, '')}/api/rivers/bo/extra`, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`servidor ${res.status}`);
  return (await res.json()) as BoExtras;
}

const EXTRA_STORE = 'vikarg.rivers.bo.extra';
export function loadSavedBoExtras(): BoExtras | null {
  try {
    const raw = localStorage.getItem(EXTRA_STORE);
    return raw ? (JSON.parse(raw) as BoExtras) : null;
  } catch {
    return null;
  }
}
export function saveBoExtras(e: BoExtras): void {
  try {
    localStorage.setItem(EXTRA_STORE, JSON.stringify(e));
  } catch {
    /* sin almacenamiento: se ve igual con conexión */
  }
}

const STORE = 'vikarg.rivers.bo.last';
export function loadSavedBo(): BoLevels | null {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as BoLevels) : null;
  } catch {
    return null;
  }
}
export function saveBo(l: BoLevels): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(l));
  } catch {
    /* sin almacenamiento: se ve igual con conexión */
  }
}
