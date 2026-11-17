import { describe, expect, it } from 'vitest';
import { cleanUnit, isNumericUnit, unitText } from './unitText';

describe('unidad de un artículo', () => {
  it('un número suelto no es una unidad', () => {
    for (const n of ['1', ' 12 ', '0,5', '2.5', '1 2']) expect(isNumericUnit(n)).toBe(true);
    for (const w of ['L', 'kg', 'latas', '500 g', 'u', '']) expect(isNumericUnit(w)).toBe(false);
  });
  it('se muestra la palabra, o «unidades» si está vacía o es un número', () => {
    expect(unitText('latas', 'unidades')).toBe('latas');
    expect(unitText('', 'unidades')).toBe('unidades');
    expect(unitText('1', 'unidades')).toBe('unidades');
    expect(unitText(' L ', 'unidades')).toBe('L');
  });
  it('al guardar se descarta un número suelto y se recorta el resto', () => {
    expect(cleanUnit('1')).toBe('');
    expect(cleanUnit(' kg ')).toBe('kg');
  });
});
