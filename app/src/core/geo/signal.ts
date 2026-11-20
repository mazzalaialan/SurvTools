/**
 * Calidad de la señal del GPS en una frase simple para quien está en apuros: no hace falta entender metros de precisión, solo si sirve y qué hacer.
 * Se mira la precisión de la última posición y hace cuánto llegó (el GPS que deja de mandar posiciones no avisa: se nota por el silencio).
 */
export type GpsSignal = 'searching' | 'good' | 'fair' | 'weak' | 'lost';

/** Hasta esta precisión (m) la señal es buena. */
export const GOOD_ACCURACY_M = 20;
/** Más de esta precisión (m) la grabación descarta el punto: la señal es débil (es `MAX_ACCURACY_M` de la grabación). */
export const WEAK_ACCURACY_M = 50;
/** Sin posiciones nuevas durante este tiempo, la señal se da por perdida. */
export const LOST_AFTER_MS = 20_000;

export function gpsSignal(a: { accuracy: number | null; lastFixAt: number | null; now: number }, weakAboveM = WEAK_ACCURACY_M): GpsSignal {
  if (a.accuracy === null || a.lastFixAt === null) return 'searching';
  if (a.now - a.lastFixAt >= LOST_AFTER_MS) return 'lost';
  if (a.accuracy > weakAboveM) return 'weak';
  if (a.accuracy > GOOD_ACCURACY_M) return 'fair';
  return 'good';
}
