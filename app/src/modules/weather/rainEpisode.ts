import type { RainOutlook } from './nowcast';

/**
 * Episodio de lluvia de un lugar: se avisa al empezar y no se repite mientras
 * dure. Termina recién después de unas horas seguidas sin lluvia (el
 * pronóstico va y viene entre seco y lluvia cada 15 minutos y no tiene que
 * volver a sonar por eso). Dentro del episodio solo se vuelve a avisar si la
 * lluvia sube de nivel.
 *
 * ⚠ Copia de server/src/rain/episode.ts: mantener ambas en sincronía.
 */

/** Horas seguidas sin lluvia para dar por terminado el episodio. */
/** Tiempo seco seguido antes de sacar el aviso de lluvia de la barra de notificaciones (como en el servidor: rain/watch.ts). */
export const CLEAR_AFTER_MS = 20 * 60_000;

export const DRY_RESET_MS = 3 * 3_600_000;

/** Nivel por intensidad (mm/h, los rangos de uso común): 1 débil, 2 moderada, 3 fuerte, 4 torrencial. */
export function rainLevel(mmH: number): 1 | 2 | 3 | 4 {
  return mmH >= 50 ? 4 : mmH >= 7.6 ? 3 : mmH >= 2.5 ? 2 : 1;
}

export interface RainEpisode {
  /** Nivel más alto avisado en este episodio. */
  level: number;
  /** Desde cuándo está seco (ms), o null si sigue la lluvia. */
  drySince: number | null;
}

/** Intensidad de la lluvia (mm/h): el pico del pronóstico o, si es mayor, la que ve el satélite. */
export function peakMmH(outlook: RainOutlook): number {
  if (outlook.state === 'dry') return 0;
  const observed = outlook.state === 'raining' && 'observedMmH' in outlook ? Number(outlook.observedMmH ?? 0) : 0;
  return Math.max(outlook.peakMmH, observed);
}

/** Qué hacer con un pronóstico nuevo: el episodio que queda y si hay que avisar ("new" o "stronger"). */
export function nextEpisode(prev: RainEpisode | null, outlook: RainOutlook, now: number): { episode: RainEpisode | null; notify: 'new' | 'stronger' | null } {
  if (outlook.state === 'dry') {
    if (!prev) return { episode: null, notify: null };
    if (prev.drySince === null) return { episode: { ...prev, drySince: now }, notify: null };
    return { episode: now - prev.drySince >= DRY_RESET_MS ? null : prev, notify: null };
  }
  const level = rainLevel(peakMmH(outlook));
  if (!prev) return { episode: { level, drySince: null }, notify: 'new' };
  if (level > prev.level) return { episode: { level, drySince: null }, notify: 'stronger' };
  return { episode: { level: prev.level, drySince: null }, notify: null };
}
