/**
 * Velocidad de la animación del mapa del clima (la línea de tiempo de las últimas 2 horas). A 1× cada cuadro dura 0,7 s, o sea unos 8 segundos
 * por vuelta de 12 cuadros: 0,5× sirve para mirar una tormenta con calma; 2× y 4× para ver el movimiento de un vistazo. Más rápido que 4×
 * (menos de 0,18 s por cuadro) no se alcanza a ver nada, y las imágenes que todavía no bajaron se saltean igual (ver WeatherMapPage).
 */
export const FRAME_BASE_MS = 700;
export const SPEEDS = [0.5, 1, 2, 4] as const;
export type AnimationSpeed = (typeof SPEEDS)[number];

/** La velocidad que sigue al tocar el botón (de la más lenta a la más rápida y vuelve a empezar). */
export function nextSpeed(current: number): AnimationSpeed {
  const i = SPEEDS.findIndex((s) => s === current);
  return SPEEDS[(i + 1) % SPEEDS.length]!;
}

/** Cuánto dura cada cuadro a esa velocidad (una velocidad que no existe, por ejemplo de un ajuste viejo, cuenta como 1×). */
export function frameMs(speed: number): number {
  const s = SPEEDS.includes(speed as AnimationSpeed) ? speed : 1;
  return Math.round(FRAME_BASE_MS / s);
}

/** Texto corto del botón: «0,5×», «1×», «2×», «4×». */
export function speedLabel(speed: number, language = 'es'): string {
  return `${new Intl.NumberFormat(language).format(SPEEDS.includes(speed as AnimationSpeed) ? speed : 1)}×`;
}
