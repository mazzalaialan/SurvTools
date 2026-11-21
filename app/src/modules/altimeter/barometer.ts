/**
 * Altura a partir de la presión del barómetro (lógica pura, sin sensores). El barómetro mide los CAMBIOS de altura con mucha más precisión que
 * el GPS (decímetros contra varios metros), pero la presión también cambia con el clima (hasta ~1 hPa por hora, unos 8 m): la altura de
 * presión hay que calibrarla con la del mapa o con un punto conocido (la misma calibración que usa el GPS, ver `altimeter.ts`) y volver a
 * calibrarla de vez en cuando.
 */

/** Presión al nivel del mar de la atmósfera estándar (hPa). */
export const STANDARD_SEA_LEVEL_HPA = 1013.25;

/** Exponente de la fórmula barométrica de la atmósfera estándar (1 / 5,255). */
const EXPONENT = 0.190284;
const SCALE_M = 44330.77;

/** Altura (m) que corresponde a una presión (hPa) con esa presión al nivel del mar; con la estándar es la «altura de presión». */
export function pressureAltitude(hPa: number, seaLevelHpa: number = STANDARD_SEA_LEVEL_HPA): number {
  return SCALE_M * (1 - Math.pow(hPa / seaLevelHpa, EXPONENT));
}

/** Presión al nivel del mar (hPa) que explica esa presión medida a esa altura (para calibrar con un punto conocido). */
export function seaLevelPressure(hPa: number, altitudeM: number): number {
  return hPa / Math.pow(1 - altitudeM / SCALE_M, 1 / EXPONENT);
}

/** Una lectura de presión es creíble en la superficie de la Tierra (del Mar Muerto al Everest, con margen). */
export function plausiblePressure(hPa: number): boolean {
  return Number.isFinite(hPa) && hPa >= 280 && hPa <= 1100;
}

/**
 * Corrección que se suma a la altura sin calibrar (la del GPS alisada o la de presión) para que coincida con la del barómetro calibrado con la presión
 * al nivel del mar del pronóstico (`seaLevelHpa`). Es una calibración independiente del GPS y del mapa; su error es el de esa presión (±1 hPa son unos ±8 m).
 */
export function barometerOffset(hPa: number, seaLevelHpa: number, rawAltitudeM: number): number | null {
  if (!plausiblePressure(hPa) || !plausiblePressure(seaLevelHpa)) return null;
  return pressureAltitude(hPa, seaLevelHpa) - rawAltitudeM;
}
