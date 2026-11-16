import { distanceMeters } from '@/core/geo/geo';
import { loadDataFile } from '@/modules/emergency/dataFile';
import type { ShnEvent } from './shnTides';

/**
 * Tablas de marea oficiales de Argentina (SHN, 48 puertos) y Uruguay (SOHMA, 4 puertos) para usar sin conexión: `tides-official.json`
 * (tools/tide-data/official.mjs). Una vez por año. Las alturas de cada puerto son sobre el cero (plano de reducción) de su fuente y las del SHN
 * y el SOHMA no se mezclan ni se comparan con las de la marea calculada: lo comparable es la hora. Los del SOHMA salen de alturas horarias
 * (pleamares y bajamares por interpolación, error de unos minutos).
 */
export interface OfficialPort {
  id: string;
  name: string;
  src: 'SHN' | 'SOHMA';
  lat: number;
  lon: number;
  /** Huso horario de la tabla (+3 = UTC−3). */
  huso: number;
  meanCm: number | null;
  /** h = pleamar, l = bajamar, uno por extremo. */
  k: string;
  /** Minutos desde el 1 de enero 00:00 (hora local de la tabla): el primero absoluto y los demás, diferencias con el anterior. */
  t: number[];
  /** Altura de cada extremo, en cm. */
  h: number[];
}

export interface OfficialData {
  generatedAt: string;
  year: number;
  source: string;
  ports: OfficialPort[];
}

export const OFFICIAL_FILE = 'tides-official.json';
let pending: Promise<OfficialData | null> | null = null;
/** El archivo de tablas oficiales (se baja con los datos de Argentina y Uruguay); `null` si no está y no hay conexión. */
export function loadOfficialTides(): Promise<OfficialData | null> {
  pending ??= loadDataFile<OfficialData>(OFFICIAL_FILE).catch(() => {
    pending = null;
    return null;
  });
  return pending;
}

export interface OfficialEvent {
  /** Instante (ms desde 1970). */
  at: number;
  high: boolean;
  /** Altura en metros sobre el cero de la fuente. */
  height: number;
}

const decoded = new WeakMap<OfficialPort, OfficialEvent[]>();
/** Los extremos de un puerto del año de la tabla, ya con su instante. */
export function officialEvents(port: OfficialPort, year: number): OfficialEvent[] {
  let out = decoded.get(port);
  if (!out) {
    const base = Date.UTC(year, 0, 1) + port.huso * 3_600_000;
    let minutes = 0;
    out = port.t.map((d, i) => {
      minutes += d;
      return { at: base + minutes * 60_000, high: port.k[i] === 'h', height: port.h[i]! / 100 };
    });
    decoded.set(port, out);
  }
  return out;
}

/** El puerto con tabla oficial más cercano a un punto, hasta una distancia máxima. */
export function nearestOfficial(ports: OfficialPort[], lat: number, lon: number, maxKm = 60): { port: OfficialPort; km: number } | null {
  const best = ports
    .map((port) => ({ port, km: distanceMeters({ lat, lon }, port) / 1000 }))
    .sort((a, b) => a.km - b.km)[0];
  return best && best.km <= maxKm ? best : null;
}

/** Los extremos entre dos instantes (la tabla solo cubre el año de `data.year`: fuera de él no hay nada). */
export function officialBetween(port: OfficialPort, year: number, from: number, to: number): OfficialEvent[] {
  return officialEvents(port, year).filter((e) => e.at >= from && e.at <= to);
}

/** Para compararlos con la marea calculada por la app (misma forma que el pronóstico del SHN). */
export const asShnEvents = (events: OfficialEvent[]): ShnEvent[] => events.map((e) => ({ type: e.high ? 'high' : 'low', at: new Date(e.at).toISOString(), height: e.height }));
