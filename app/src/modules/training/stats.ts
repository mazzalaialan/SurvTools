import { distanceMeters } from '@/core/geo/geo';
import type { TrackPoint } from '@/modules/tracks/gpx';
import { trackStats } from '@/modules/tracks/gpx';

/**
 * Datos de una actividad grabada, a partir de los puntos con su hora (antes de
 * simplificar el recorrido): tiempo total y en movimiento, parciales por
 * kilómetro y velocidad máxima.
 */

/** Más de este tiempo entre dos puntos, y casi sin avance, es una parada. */
const STOP_GAP_S = 30;
/** Por debajo de esta velocidad (m/s) entre dos puntos se cuenta como quieto. */
const STOPPED_MS = 0.4;
/** Un salto del GPS: más rápido que esto (m/s) no es posible a pie, en bici ni remando. */
const MAX_PLAUSIBLE_MS = 25;

export interface RecordedStats {
  distanceM: number;
  ascentM: number;
  descentM: number;
  minEle: number | null;
  maxEle: number | null;
  /** Del primer al último punto de cada tramo, sumados (sin las pausas). */
  totalS: number;
  /** Sin las paradas. */
  movingS: number;
  /** Velocidad media en movimiento (km/h) y ritmo (s por km); 0 si no hay datos. */
  avgSpeedKmh: number;
  paceSPerKm: number;
  maxSpeedKmh: number;
  /** Segundos que llevó cada kilómetro completo, en movimiento. */
  splitsS: number[];
}

/** `maxPlausibleMs`: por encima de esa velocidad un salto del GPS se descarta (a pie y en bici 25 m/s; en vehículo mucho más). */
export function analyzeRecording(segments: TrackPoint[][], maxPlausibleMs = MAX_PLAUSIBLE_MS): RecordedStats {
  const base = trackStats(segments);
  let totalS = 0;
  let movingS = 0;
  let maxMs = 0;
  const splitsS: number[] = [];
  let kmAcc = 0; // distancia acumulada hacia el próximo kilómetro (m)
  let kmTime = 0; // tiempo en movimiento del kilómetro en curso (s)
  for (const seg of segments) {
    const timed = seg.filter((p) => p[3] !== undefined);
    if (timed.length >= 2) totalS += Math.max(0, timed.at(-1)![3]! - timed[0]![3]!);
    for (let i = 1; i < seg.length; i++) {
      const a = seg[i - 1]!;
      const b = seg[i]!;
      if (a[3] === undefined || b[3] === undefined) continue;
      const dt = b[3] - a[3];
      if (dt <= 0) continue;
      const d = distanceMeters({ lat: a[0], lon: a[1] }, { lat: b[0], lon: b[1] });
      const v = d / dt;
      if (v > maxPlausibleMs) continue;
      if (v < STOPPED_MS || (dt > STOP_GAP_S && v < STOPPED_MS * 2)) continue;
      movingS += dt;
      maxMs = Math.max(maxMs, v);
      // Parciales: el kilómetro se cierra al pasar los 1000 m (con el tiempo repartido en el tramo que lo cruza).
      let left = d;
      let t = dt;
      while (kmAcc + left >= 1000) {
        const part = 1000 - kmAcc;
        const share = (t * part) / left;
        splitsS.push(Math.round(kmTime + share));
        kmTime = 0;
        kmAcc = 0;
        left -= part;
        t -= share;
      }
      kmAcc += left;
      kmTime += t;
    }
  }
  const hours = movingS / 3600;
  const avgSpeedKmh = hours > 0 ? base.distanceM / 1000 / hours : 0;
  return {
    ...base,
    totalS: Math.round(totalS),
    movingS: Math.round(movingS),
    avgSpeedKmh,
    paceSPerKm: avgSpeedKmh > 0 ? 3600 / avgSpeedKmh : 0,
    maxSpeedKmh: maxMs * 3.6,
    splitsS,
  };
}

/** Segundos por km → "5:32". Vacío si no hay dato. */
export function formatPace(sPerKm: number): string {
  if (!(sPerKm > 0) || !Number.isFinite(sPerKm)) return '—';
  const total = Math.round(sPerKm);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Segundos → "1:05:09" o "45:12". */
export function formatClock(totalS: number): string {
  const s = Math.max(0, Math.round(totalS));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}
