/**
 * La unidad es la palabra en que se cuenta un artículo (unidades, L, kg, latas, raciones…). Es común escribir ahí un número («1»),
 * pensando en la cantidad, y entonces la pantalla mostraba «1 1»: un número suelto como unidad no es una unidad.
 */
export const isNumericUnit = (unit: string): boolean => /^[\d\s.,]+$/.test(unit.trim()) && unit.trim() !== '';

/** La unidad para mostrar: la escrita si es una palabra y, si está vacía o es un número, la genérica («unidades»). */
export function unitText(unit: string, fallback: string): string {
  const u = unit.trim();
  return !u || isNumericUnit(u) ? fallback : u;
}

/** La unidad para guardar: un número suelto no se guarda (queda vacía y se muestra «unidades»). */
export const cleanUnit = (unit: string): string => (isNumericUnit(unit) ? '' : unit.trim());
