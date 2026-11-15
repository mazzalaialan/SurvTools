import type { DriveSummary, VehicleKind } from '@/core/model/types';
import { analyzeRecording } from '@/modules/training/stats';
import type { TrackPoint } from './gpx';

/**
 * Modo «Conducir» del grabador: auto, moto, 4x4, camión u otro vehículo. Se guarda solo como
 * recorrido (Tracks), nunca como sesión de Entrenamiento: no hay calorías, ritmo, metas ni récords,
 * solo lo útil al manejar (velocidad de ahora, máxima, media, paradas, altura y rumbo).
 */

export const VEHICLES = ['car', 'motorcycle', 'fourByFour', 'truck', 'other'] as const satisfies readonly VehicleKind[];

export const isVehicle = (v: unknown): v is VehicleKind => typeof v === 'string' && (VEHICLES as readonly string[]).includes(v);

/** Un salto del GPS: más rápido que esto (m/s, ~324 km/h) no lo hace ningún vehículo de ruta. */
export const DRIVE_MAX_PLAUSIBLE_MS = 90;

/** Una posición más vieja que esto (s) ya no es «la velocidad de ahora» (túnel, GPS tapado): se muestra «—». */
export const FIX_STALE_S = 10;

/** Resumen de la conducción con todos los puntos y sus horas (antes de simplificar). `elapsedS`: tiempo grabado, sin pausas. */
export function driveSummary(segments: TrackPoint[][], elapsedS: number): DriveSummary {
  const stats = analyzeRecording(segments, DRIVE_MAX_PLAUSIBLE_MS);
  const total = Math.max(elapsedS, stats.movingS);
  const avgKmh = total > 0 ? stats.distanceM / 1000 / (total / 3600) : 0;
  return {
    maxKmh: stats.maxSpeedKmh,
    avgMovingKmh: stats.avgSpeedKmh,
    avgKmh,
    movingS: stats.movingS,
    stoppedS: Math.max(0, Math.round(total - stats.movingS)),
  };
}

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

/** Rumbo en grados (0 = norte, horario) → punto cardinal de 8 vientos. */
export function cardinal(deg: number): (typeof POINTS)[number] {
  return POINTS[Math.round((((deg % 360) + 360) % 360) / 45) % 8]!;
}

/** Rumbo (grados) del último tramo de puntos, para cuando el GPS no lo da; null si no hay movimiento suficiente. */
export function bearingOfLast(segments: TrackPoint[][]): number | null {
  const seg = segments.at(-1);
  if (!seg || seg.length < 2) return null;
  const a = seg.at(-2)!;
  const b = seg.at(-1)!;
  const φ1 = (a[0] * Math.PI) / 180;
  const φ2 = (b[0] * Math.PI) / 180;
  const dλ = ((b[1] - a[1]) * Math.PI) / 180;
  const y = Math.sin(dλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}
