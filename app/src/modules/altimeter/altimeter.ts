/**
 * Altímetro: lógica pura (sin sensores ni React) para poder probarla.
 *
 * Hoy la altura viene del GPS. El GPS mide mal la altura (peor que la
 * posición horizontal), así que se suaviza, se calibra con la altura del mapa
 * o con un punto conocido y el desnivel se cuenta con un umbral para no sumar
 * el ruido. En la app nativa el barómetro es otra fuente (`source`, ver
 * `barometer.ts`): mide cambios de altura con mucha más precisión, pero igual
 * necesita una calibración (la misma) porque la presión cambia con el clima.
 */

export type AltitudeSource = 'gps' | 'baro';

export interface AltSample {
  /** Hora (ms). */
  t: number;
  /** Altura ya calibrada y suavizada (m). */
  alt: number;
  source: AltitudeSource;
}

/** Lecturas que se descartan: el GPS a veces informa alturas absurdas al engancharse. */
export const MAX_VERTICAL_ACCURACY = 100;

/** Mediana (null si no hay valores). */
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * Suavizado: mediana de las últimas `n` lecturas (corta los saltos sueltos
 * del GPS sin atrasarse tanto como un promedio largo).
 */
export function smoothAltitude(recent: number[], n = 5): number | null {
  return median(recent.slice(-n));
}

/**
 * Corrección para calibrar con el mapa: mediana de (mapa − GPS) en las
 * lecturas con buena posición horizontal. El mapa da la altura del suelo en
 * ese punto (de un modelo de ~30 m); si el GPS está corrido, la del mapa también.
 */
export function mapOffset(pairs: { gps: number; map: number; accuracy: number }[], maxAccuracy = 30): number | null {
  const good = pairs.filter((p) => p.accuracy <= maxAccuracy).map((p) => p.map - p.gps);
  return good.length ? median(good) : null;
}

export interface ClimbState {
  ascent: number;
  descent: number;
  /** Última altura desde la que se cuenta. */
  ref: number | null;
}

export const EMPTY_CLIMB: ClimbState = { ascent: 0, descent: 0, ref: null };

/**
 * Desnivel acumulado con histéresis: solo se suma cuando la altura se movió
 * más que `threshold` desde la última referencia (el ruido del GPS es de
 * varios metros y sumado inventaría cientos de metros de subida).
 */
export function addClimb(state: ClimbState, alt: number, threshold = 10): ClimbState {
  if (state.ref === null) return { ...state, ref: alt };
  const d = alt - state.ref;
  if (d >= threshold) return { ascent: state.ascent + d, descent: state.descent, ref: alt };
  if (d <= -threshold) return { ascent: state.ascent, descent: state.descent - d, ref: alt };
  return state;
}

export type Alarm =
  /** Llegar a una altura (subiendo o bajando, según dónde estabas al ponerla). */
  | { kind: 'reach'; target: number; direction: 'up' | 'down' }
  /** Subir tantos metros desde que se puso. */
  | { kind: 'climb'; meters: number; startAscent: number };

/** Si la alarma ya se cumplió. */
export function alarmReached(alarm: Alarm, alt: number, ascent: number): boolean {
  if (alarm.kind === 'reach') return alarm.direction === 'up' ? alt >= alarm.target : alt <= alarm.target;
  return ascent - alarm.startAscent >= alarm.meters;
}

/** Alarma para llegar a `target` estando en `current`. */
export function reachAlarm(target: number, current: number): Alarm {
  return { kind: 'reach', target, direction: target >= current ? 'up' : 'down' };
}

/** Muestras a guardar: una cada `minGapMs` como mínimo, hasta `max` (se ralea la mitad más vieja). */
export function pushSample(samples: AltSample[], s: AltSample, minGapMs = 5_000, max = 2_000): AltSample[] {
  const last = samples.at(-1);
  if (last && s.t - last.t < minGapMs) return samples;
  const next = [...samples, s];
  if (next.length <= max) return next;
  const half = next.length >> 1;
  return [...next.slice(0, half).filter((_, i) => i % 2 === 0), ...next.slice(half)];
}
