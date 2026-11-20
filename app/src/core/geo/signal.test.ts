import { describe, expect, it } from 'vitest';
import { GOOD_ACCURACY_M, gpsSignal, LOST_AFTER_MS, WEAK_ACCURACY_M } from './signal';
import { MAX_ACCURACY_M } from '@/modules/tracks/record';

const now = 1_000_000;

describe('señal del GPS', () => {
  it('sin ninguna posición todavía: buscando', () => {
    expect(gpsSignal({ accuracy: null, lastFixAt: null, now })).toBe('searching');
    expect(gpsSignal({ accuracy: 10, lastFixAt: null, now })).toBe('searching');
  });

  it('según la precisión: buena, regular y débil', () => {
    const at = (accuracy: number) => gpsSignal({ accuracy, lastFixAt: now - 1000, now });
    expect(at(5)).toBe('good');
    expect(at(GOOD_ACCURACY_M)).toBe('good');
    expect(at(GOOD_ACCURACY_M + 1)).toBe('fair');
    expect(at(WEAK_ACCURACY_M)).toBe('fair');
    expect(at(WEAK_ACCURACY_M + 1)).toBe('weak');
    expect(at(300)).toBe('weak');
  });

  it('sin posiciones nuevas por un rato: señal perdida, aunque la última haya sido buena', () => {
    expect(gpsSignal({ accuracy: 5, lastFixAt: now - LOST_AFTER_MS + 1, now })).toBe('good');
    expect(gpsSignal({ accuracy: 5, lastFixAt: now - LOST_AFTER_MS, now })).toBe('lost');
    expect(gpsSignal({ accuracy: 80, lastFixAt: now - 60_000, now })).toBe('lost');
  });

  it('el umbral de «débil» es el mismo que usa la grabación para descartar puntos', () => {
    expect(WEAK_ACCURACY_M).toBe(MAX_ACCURACY_M);
  });
});
