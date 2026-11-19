import { describe, expect, it } from 'vitest';
import { frameMs, nextSpeed, speedLabel, SPEEDS } from './animationSpeed';

describe('velocidad de la animación del mapa del clima', () => {
  it('recorre las velocidades y vuelve a empezar', () => {
    expect(SPEEDS).toEqual([0.5, 1, 2, 4]);
    expect(nextSpeed(0.5)).toBe(1);
    expect(nextSpeed(1)).toBe(2);
    expect(nextSpeed(2)).toBe(4);
    expect(nextSpeed(4)).toBe(0.5);
  });
  it('un valor que no existe (ajuste viejo o roto) arranca desde el principio', () => {
    expect(nextSpeed(3)).toBe(0.5);
    expect(nextSpeed(NaN)).toBe(0.5);
  });
  it('cada cuadro dura menos cuanto más rápido, y 1× es lo de siempre (0,7 s)', () => {
    expect(frameMs(1)).toBe(700);
    expect(frameMs(2)).toBe(350);
    expect(frameMs(4)).toBe(175);
    expect(frameMs(0.5)).toBe(1400);
    expect(frameMs(7)).toBe(700);
  });
  it('una vuelta de 12 cuadros dura entre ~2 y ~17 segundos', () => {
    expect((12 * frameMs(4)) / 1000).toBeCloseTo(2.1, 1);
    expect((12 * frameMs(0.5)) / 1000).toBeCloseTo(16.8, 1);
  });
  it('el texto del botón usa la coma decimal en español', () => {
    expect(speedLabel(1)).toBe('1×');
    expect(speedLabel(0.5, 'es')).toBe('0,5×');
    expect(speedLabel(0.5, 'en')).toBe('0.5×');
    expect(speedLabel(9)).toBe('1×');
  });
});
