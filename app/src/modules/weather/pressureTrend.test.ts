import { describe, expect, it } from 'vitest';
import { seaLevelPressure } from '@/modules/altimeter/barometer';
import { addSample, KEEP_MS, pressureTrend, shouldNotify, type PressureSample } from './pressureTrend';

const MIN = 60_000;
/** Presión medida a `altM` si al nivel del mar hay `msl` hPa (la inversa de lo que usa el análisis). */
const measured = (msl: number, altM: number) => msl * Math.pow(1 - altM / 44330.77, 1 / 0.190284);
/** Una lectura cada 15 min durante `hours` horas; el clima (presión al nivel del mar) y la altura son funciones del tiempo en horas. */
const series = (hours: number, msl: (h: number) => number, alt: (h: number) => number, noise = (_i: number) => 0): PressureSample[] =>
  Array.from({ length: hours * 4 + 1 }, (_, i) => {
    const h = i / 4;
    const a = alt(h);
    return { t: i * 15 * MIN, hPa: measured(msl(h), a), altM: a + noise(i) };
  });

describe('tendencia de la presión', () => {
  it('quieto y con la presión bajando rápido: avisa mal tiempo', () => {
    const t = pressureTrend(series(3, (h) => 1015 - 1.5 * h, () => 30)); // −4,5 hPa en 3 h
    expect(t.state).toBe('falling');
    expect(t.changeHpa).toBeCloseTo(-4.5, 1);
  });
  it('baja muy rápido: aviso más fuerte', () => {
    expect(pressureTrend(series(3, (h) => 1015 - 2.4 * h, () => 30)).state).toBe('fastFalling');
  });
  it('quieto y con la presión subiendo: mejora', () => {
    expect(pressureTrend(series(3, (h) => 1010 + 1.6 * h, () => 30)).state).toBe('rising');
  });
  it('quieto y estable: sin aviso', () => {
    expect(pressureTrend(series(3, () => 1013, () => 30)).state).toBe('steady');
  });
  it('subir un cerro con el clima estable NO es una tormenta (la presión medida baja ~6 hPa, el análisis lo descuenta)', () => {
    const t = pressureTrend(series(3, () => 1013, (h) => 1000 + 20 * h)); // sube 60 m: −7 hPa medidos
    expect(t.rawChangeHpa).toBeLessThan(-6); // sin corregir parecería una baja fuerte
    expect(t.state).toBe('steady');
  });
  it('bajar un cerro con el clima estable NO es mejoría', () => {
    expect(pressureTrend(series(3, () => 1013, (h) => 1060 - 15 * h)).state).toBe('steady');
  });
  it('subir un poco (30 a 100 m) y a la vez baja el clima: avisa solo si la baja es mayor que lo exigido', () => {
    // 45 m de desnivel: se exige 1 hPa más (4,5 en vez de 3,5). Con −5 hPa de clima, avisa; con −4, no.
    expect(pressureTrend(series(3, (h) => 1015 - (5 / 3) * h, (h) => 100 + 15 * h)).state).toBe('falling');
    expect(pressureTrend(series(3, (h) => 1015 - (4 / 3) * h, (h) => 100 + 15 * h)).state).toBe('steady');
  });
  it('con mucho desnivel no opina («moving»), aunque la presión cambie', () => {
    const t = pressureTrend(series(3, (h) => 1015 - 2 * h, (h) => 1000 + 50 * h)); // 150 m
    expect(t.state).toBe('moving');
  });
  it('un error fijo de la altura del GPS (todo corrido 25 m) no cambia el resultado', () => {
    const a = pressureTrend(series(3, (h) => 1015 - 1.5 * h, () => 30));
    const b = pressureTrend(series(3, (h) => 1015 - 1.5 * h, () => 30).map((s) => ({ ...s, altM: s.altM! + 25 })));
    expect(b.changeHpa!).toBeCloseTo(a.changeHpa!, 0);
    expect(b.state).toBe('falling');
  });
  it('el ruido rápido de la altura (±8 m) no inventa una tormenta', () => {
    const noise = (i: number) => (i % 2 ? 8 : -8);
    expect(pressureTrend(series(3, () => 1013, () => 30, noise)).state).toBe('steady');
  });
  it('pocas lecturas, poco tiempo o sin altura: todavía está aprendiendo', () => {
    expect(pressureTrend(series(1, (h) => 1015 - 4 * h, () => 30)).state).toBe('learning');
    expect(pressureTrend([]).state).toBe('learning');
    expect(pressureTrend(series(3, (h) => 1015 - 2 * h, () => 30).map((s) => ({ ...s, altM: null }))).state).toBe('learning');
  });
  it('un hueco de más de una hora corta el tramo: no se mezclan dos jornadas', () => {
    const a = series(3, (h) => 1015 - 2 * h, () => 30);
    const gap = a.map((s) => ({ ...s, t: s.t + 5 * 3_600_000 })); // 2 h de hueco entre la primera parte y la segunda
    const t = pressureTrend([...a.slice(0, 6), ...gap.slice(6)]);
    expect(t.state).toBe('learning');
  });
});

describe('registro y avisos', () => {
  it('guarda hasta 12 horas y descarta lecturas repetidas', () => {
    let log: PressureSample[] = [];
    for (let i = 0; i <= 60; i++) log = addSample(log, { t: i * 15 * MIN, hPa: 1000, altM: 10 });
    expect(log[0]!.t).toBeGreaterThanOrEqual(60 * 15 * MIN - KEEP_MS);
    expect(addSample(log, { ...log.at(-1)! })).toEqual(log);
  });
  it('avisa una vez, no repite por 6 horas, y sí si pasa de «baja» a «baja muy rápido»', () => {
    const h = 3_600_000;
    expect(shouldNotify(null, 'steady', 0)).toBe(false);
    expect(shouldNotify(null, 'moving', 0)).toBe(false);
    expect(shouldNotify(null, 'falling', 0)).toBe(true);
    expect(shouldNotify({ state: 'falling', at: 0 }, 'falling', 2 * h)).toBe(false);
    expect(shouldNotify({ state: 'falling', at: 0 }, 'fastFalling', 2 * h)).toBe(true);
    expect(shouldNotify({ state: 'fastFalling', at: 0 }, 'falling', 2 * h)).toBe(false);
    expect(shouldNotify({ state: 'falling', at: 0 }, 'falling', 7 * h)).toBe(true);
  });
  it('comprobación del propio modelo: llevar al nivel del mar es lo inverso de medir', () => {
    expect(seaLevelPressure(measured(1013, 500), 500)).toBeCloseTo(1013, 3);
  });
});
