import { seaLevelPressure } from '@/modules/altimeter/barometer';
import { median } from '@/modules/altimeter/altimeter';

/**
 * Tendencia de la presión del barómetro para avisar de posible mal tiempo o mejora. El problema de fondo: la presión baja unos 1,2 hPa cada 10 m que se
 * sube, y un cambio de clima grande es de 3 a 6 hPa en 3 horas (el equivalente a 30 a 50 m de altura). Subir o bajar un cerro se confunde con una tormenta.
 * Por eso cada lectura se guarda junto con la altura del GPS de ese momento y la presión se lleva al nivel del mar con ella (`seaLevelPressure`): el error fijo
 * de altura del GPS (~20 m) solo desplaza todas las lecturas por igual y se cancela al medir cambios; lo que no se cancela es la deriva del GPS (~1 hPa),
 * por eso, cuanto más se movió en altura, más se exige, y con mucho desnivel no se opina.
 */

export interface PressureSample {
  /** Momento de la lectura (ms). */
  t: number;
  /** Presión medida en el lugar (hPa). */
  hPa: number;
  /** Altura del GPS en ese momento (m); `null` si no había (esa lectura no se puede separar del desnivel y no se usa). */
  altM: number | null;
}

export type PressureState = 'learning' | 'steady' | 'falling' | 'fastFalling' | 'rising' | 'moving';

export interface PressureTrend {
  state: PressureState;
  /** Cambio de la presión al nivel del mar en 3 horas (hPa), ya sin el efecto de la altura; `null` si todavía no hay datos. */
  changeHpa: number | null;
  /** Cuánto cambió la presión medida sin corregir (hPa en 3 h): lo que se vería sin descontar la altura. */
  rawChangeHpa: number | null;
  /** Diferencia de altura (m) entre lo más alto y lo más bajo del tramo analizado. */
  altRangeM: number | null;
}

/** Ventana que se analiza: el criterio habitual de la meteorología es el cambio en 3 horas. */
export const WINDOW_MS = 3 * 3_600_000;
/** Horas de lecturas que se guardan. */
export const KEEP_MS = 12 * 3_600_000;
/** Si entre dos lecturas pasó más que esto (app cerrada, sin GPS), el tramo se corta: no se interpola el clima. */
export const MAX_GAP_MS = 60 * 60_000;
/** Lo mínimo para opinar: lecturas y horas cubiertas. */
const MIN_SAMPLES = 5;
const MIN_SPAN_MS = 2 * 3_600_000;
/** Cambio en 3 h (hPa) desde el que se avisa: baja o sube «rápido» (criterio de la meteorología marina) y «muy rápido». */
export const CHANGE_HPA = 3.5;
export const FAST_CHANGE_HPA = 6;
/** Con tanto desnivel en la ventana no se puede separar el clima de la altura. */
export const MOVING_ALT_M = 100;
/** Con este desnivel el descuento de la altura ya pesa (30 m son ~3,6 hPa): se exige 1 hPa más. */
export const CAREFUL_ALT_M = 30;
const EXTRA_HPA = 1;

/** Agrega una lectura y descarta las de más de 12 horas (y las repetidas o fuera de orden). */
export function addSample(samples: PressureSample[], s: PressureSample): PressureSample[] {
  const last = samples.at(-1);
  const kept = last && s.t <= last.t ? samples : [...samples, s];
  return kept.filter((x) => x.t >= s.t - KEEP_MS);
}

/** Pendiente por mínimos cuadrados (unidades de y por unidad de x). */
function slope(xs: number[], ys: number[]): number {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - mx) * (ys[i]! - my);
    den += (xs[i]! - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

/** Último tramo seguido (sin huecos largos) de lecturas con altura, dentro de las últimas 3 horas. */
function lastRun(samples: PressureSample[]): { t: number; hPa: number; altM: number }[] {
  const usable = samples.filter((s): s is PressureSample & { altM: number } => s.altM !== null);
  if (usable.length === 0) return [];
  const end = usable.at(-1)!.t;
  const inWindow = usable.filter((s) => s.t >= end - WINDOW_MS);
  const run = [inWindow.at(-1)!];
  for (let i = inWindow.length - 2; i >= 0; i--) {
    if (run[0]!.t - inWindow[i]!.t > MAX_GAP_MS) break;
    run.unshift(inWindow[i]!);
  }
  return run;
}

/** Qué está haciendo la presión, descontando lo que se subió o bajó. */
export function pressureTrend(samples: PressureSample[]): PressureTrend {
  const run = lastRun(samples);
  const none: PressureTrend = { state: 'learning', changeHpa: null, rawChangeHpa: null, altRangeM: null };
  if (run.length < MIN_SAMPLES || run.at(-1)!.t - run[0]!.t < MIN_SPAN_MS) return none;
  // La altura del GPS salta de lectura en lectura: mediana de tres vecinas.
  const alts = run.map((_, i) => median(run.slice(Math.max(0, i - 1), i + 2).map((r) => r.altM))!);
  const hours = run.map((r) => (r.t - run[0]!.t) / 3_600_000);
  const corrected = run.map((r, i) => seaLevelPressure(r.hPa, alts[i]!));
  const changeHpa = slope(hours, corrected) * 3;
  const rawChangeHpa = slope(hours, run.map((r) => r.hPa)) * 3;
  const altRangeM = Math.max(...alts) - Math.min(...alts);
  const base = { changeHpa, rawChangeHpa, altRangeM };
  if (altRangeM >= MOVING_ALT_M) return { state: 'moving', ...base };
  const extra = altRangeM >= CAREFUL_ALT_M ? EXTRA_HPA : 0;
  if (changeHpa <= -(FAST_CHANGE_HPA + extra)) return { state: 'fastFalling', ...base };
  if (changeHpa <= -(CHANGE_HPA + extra)) return { state: 'falling', ...base };
  if (changeHpa >= CHANGE_HPA + extra) return { state: 'rising', ...base };
  return { state: 'steady', ...base };
}

/** No se repite el mismo aviso en este tiempo (la presión tarda en volver); sí se avisa si empeora de «baja» a «baja muy rápido». */
export const RENOTIFY_MS = 6 * 3_600_000;

/** ¿Corresponde avisar ahora? `last` es el último aviso que se mandó. */
export function shouldNotify(last: { state: PressureState; at: number } | null, state: PressureState, now: number): boolean {
  if (state !== 'falling' && state !== 'fastFalling' && state !== 'rising') return false;
  if (!last || now - last.at >= RENOTIFY_MS) return true;
  return last.state === 'falling' && state === 'fastFalling';
}
