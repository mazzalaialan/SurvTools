import { describe, expect, it } from 'vitest';
import { plausiblePressure, pressureAltitude, seaLevelPressure, STANDARD_SEA_LEVEL_HPA } from './barometer';

describe('altura por presión (atmósfera estándar)', () => {
  it('al nivel del mar la altura es 0', () => {
    expect(pressureAltitude(STANDARD_SEA_LEVEL_HPA)).toBeCloseTo(0, 6);
  });
  it('coincide con la tabla de la atmósfera estándar (ISA) con menos de 1 m de diferencia', () => {
    // Presión ISA por altura: 1000 m → 898,76 hPa; 2000 m → 795,01; 3000 m → 701,08; 5000 m → 540,19.
    expect(Math.abs(pressureAltitude(898.76) - 1000)).toBeLessThan(1);
    expect(Math.abs(pressureAltitude(795.01) - 2000)).toBeLessThan(1);
    expect(Math.abs(pressureAltitude(701.08) - 3000)).toBeLessThan(1);
    expect(Math.abs(pressureAltitude(540.19) - 5000)).toBeLessThan(1);
  });
  it('menos presión es más altura; más presión que la estándar da altura negativa', () => {
    expect(pressureAltitude(900)).toBeGreaterThan(pressureAltitude(950));
    expect(pressureAltitude(1030)).toBeLessThan(0);
  });
  it('un cambio chico de presión es un cambio chico de altura: ~1 hPa son unos 8 m cerca del nivel del mar', () => {
    const d = pressureAltitude(1012.25) - pressureAltitude(1013.25);
    expect(d).toBeGreaterThan(7.5);
    expect(d).toBeLessThan(9);
  });
  it('con la presión al nivel del mar de ese día, la altura sale bien', () => {
    // Un día de presión baja (1000 hPa al nivel del mar): a 500 m la presión medida es menor que la ISA.
    const p = 1000 * Math.pow(1 - 500 / 44330.77, 1 / 0.190284);
    expect(pressureAltitude(p, 1000)).toBeCloseTo(500, 3);
    // Con la presión estándar el mismo valor da una altura distinta (por eso hay que calibrar).
    expect(Math.abs(pressureAltitude(p) - 500)).toBeGreaterThan(50);
  });
  it('calibrar con un punto conocido: seaLevelPressure y pressureAltitude son inversas', () => {
    const p0 = seaLevelPressure(870, 1234);
    expect(pressureAltitude(870, p0)).toBeCloseTo(1234, 6);
  });
  it('descarta lecturas imposibles', () => {
    expect(plausiblePressure(1013)).toBe(true);
    expect(plausiblePressure(300)).toBe(true);
    expect(plausiblePressure(0)).toBe(false);
    expect(plausiblePressure(5000)).toBe(false);
    expect(plausiblePressure(NaN)).toBe(false);
  });
});

describe('calibrar con el barómetro y la presión del pronóstico', () => {
  it('la corrección lleva la altura sin calibrar a la de presión con el nivel del mar real', async () => {
    const { barometerOffset, pressureAltitude, seaLevelPressure } = await import('./barometer');
    // A 1250 m con 1020 hPa al nivel del mar: la presión medida es la de esa altura.
    const hPa = 1020 * Math.pow(1 - 1250 / 44330.77, 1 / 0.190284);
    expect(seaLevelPressure(hPa, 1250)).toBeCloseTo(1020, 3);
    // El GPS alisado daba 1270 m: la corrección es −20 m y la altura queda en 1250.
    const off = barometerOffset(hPa, 1020, 1270)!;
    expect(off).toBeCloseTo(-20, 1);
    expect(1270 + off).toBeCloseTo(pressureAltitude(hPa, 1020), 3);
  });
  it('sin presiones creíbles no calibra', async () => {
    const { barometerOffset } = await import('./barometer');
    expect(barometerOffset(5, 1013, 100)).toBeNull();
    expect(barometerOffset(900, 2000, 100)).toBeNull();
  });
});
