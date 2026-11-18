import { describe, expect, it } from 'vitest';
import { isDark, parseCssColor, toHex } from './systemBars';

describe('barras del sistema: colores', () => {
  it('lee los formatos que devuelve getComputedStyle', () => {
    expect(parseCssColor('rgb(16, 0, 0)')).toEqual({ r: 16, g: 0, b: 0, a: 1 });
    expect(parseCssColor('rgba(18, 26, 36, 0.5)')).toEqual({ r: 18, g: 26, b: 36, a: 0.5 });
    expect(parseCssColor('rgb(255 255 255 / 25%)')).toEqual({ r: 255, g: 255, b: 255, a: 0.25 });
    expect(parseCssColor('color(srgb 0.5 0 1)')).toEqual({ r: 127.5, g: 0, b: 255, a: 1 });
    expect(parseCssColor('transparent')).toBeNull();
    expect(parseCssColor('')).toBeNull();
  });
  it('pasa a hexadecimal, con límites', () => {
    expect(toHex({ r: 16, g: 0, b: 0, a: 1 })).toBe('#100000');
    expect(toHex({ r: 18.4, g: 26.6, b: 36, a: 1 })).toBe('#121b24');
    expect(toHex({ r: 300, g: -5, b: 0, a: 1 })).toBe('#ff0000');
  });
  it('decide si los íconos tienen que ser claros: fondos de los cuatro temas de la app', () => {
    expect(isDark({ r: 18, g: 26, b: 36, a: 1 })).toBe(true); // oscuro
    expect(isDark({ r: 16, g: 0, b: 0, a: 1 })).toBe(true); // rojo nocturno
    expect(isDark({ r: 0, g: 0, b: 0, a: 1 })).toBe(true); // ahorro de batería
    expect(isDark({ r: 255, g: 255, b: 255, a: 1 })).toBe(false); // claro
    expect(isDark({ r: 244, g: 246, b: 248, a: 1 })).toBe(false);
  });
});

describe('escala de rojos de las barras', () => {
  it('va del más oscuro (1) al más claro (10), sin salirse del rango, y es monótona', async () => {
    const { redBarColor } = await import('./systemBars');
    const lum = (n: number) => { const c = redBarColor(n); return c.r + c.g + c.b; };
    expect(toHex(redBarColor(1))).toBe('#5c1710');
    expect(toHex(redBarColor(10))).toBe('#d44a33');
    for (let n = 1; n < 10; n++) expect(lum(n + 1)).toBeGreaterThan(lum(n));
    expect(toHex(redBarColor(0))).toBe('#5c1710');
    expect(toHex(redBarColor(99))).toBe('#d44a33');
    expect(redBarColor(1).r).toBeGreaterThan(redBarColor(1).g * 3); // sigue siendo rojo
  });
});
