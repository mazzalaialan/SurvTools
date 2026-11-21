import { describe, expect, it } from 'vitest';
import { HEIGHT_WARN_M, heightDifferenceFrom } from './heightCheck';

const pairs = (diffs: number[]) => diffs.map((d, i) => ({ gps: 30 + i + d, map: 30 + i }));

describe('aviso de diferencia entre la altura del GPS y la del mapa', () => {
  it('avisa con un error fijo y parejo (GPS más alto que el mapa)', () => {
    const r = heightDifferenceFrom(pairs(Array.from({ length: 20 }, (_, i) => 19 + (i % 3))));
    expect(r?.diffM).toBeGreaterThan(HEIGHT_WARN_M);
    expect(r?.n).toBe(20);
  });
  it('avisa también si el GPS da menos que el mapa', () => {
    expect(heightDifferenceFrom(pairs(Array.from({ length: 12 }, () => -22)))?.diffM).toBeLessThan(-HEIGHT_WARN_M);
  });
  it('no avisa si la diferencia cae dentro del error del propio mapa', () => {
    expect(heightDifferenceFrom(pairs(Array.from({ length: 20 }, () => 8)))).toBeNull();
  });
  it('no avisa si la diferencia no es pareja (no es un error fijo)', () => {
    expect(heightDifferenceFrom(pairs([40, -40, 40, -40, 40, -40, 40, -40, 40, 40, 40, -40]))).toBeNull();
  });
  it('no opina con pocos puntos con altura del mapa', () => {
    expect(heightDifferenceFrom(pairs([30, 30, 30]))).toBeNull();
  });
});
