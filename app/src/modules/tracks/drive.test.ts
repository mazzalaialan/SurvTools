import { describe, expect, it } from 'vitest';
import { analyzeRecording } from '@/modules/training/stats';
import { bearingOfLast, cardinal, driveSummary, isVehicle, VEHICLES } from './drive';
import type { TrackPoint } from './gpx';

/** Un tramo recto hacia el norte a `kmh` km/h, un punto cada `stepS` segundos (1° de latitud ≈ 111.195 m). */
function drive(kmh: number, seconds: number, stepS = 10, t0 = 1_700_000_000): TrackPoint[] {
  const out: TrackPoint[] = [];
  const ms = kmh / 3.6;
  for (let t = 0; t <= seconds; t += stepS) out.push([-34 + (ms * t) / 111_195, -58, 20, t0 + t]);
  return out;
}

describe('modo Conducir', () => {
  it('los vehículos son un conjunto cerrado', () => {
    expect(VEHICLES).toEqual(['car', 'motorcycle', 'fourByFour', 'truck', 'other']);
    expect(isVehicle('car')).toBe(true);
    expect(isVehicle('kayak')).toBe(false);
    expect(isVehicle(undefined)).toBe(false);
  });

  it('a velocidad de ruta no se descarta como salto del GPS (a pie, sí)', () => {
    const seg = drive(110, 600);
    // Con el límite de actividades a pie (25 m/s ≈ 90 km/h) se tiraría todo.
    expect(analyzeRecording([seg]).maxSpeedKmh).toBe(0);
    const s = driveSummary([seg], 600);
    expect(s.maxKmh).toBeGreaterThan(105);
    expect(s.maxKmh).toBeLessThan(115);
    expect(s.avgMovingKmh).toBeGreaterThan(105);
    expect(s.stoppedS).toBeLessThan(15);
  });

  it('cuenta las paradas: más tiempo grabado que en movimiento', () => {
    const a = drive(60, 300);
    // Parado 5 minutos (sin puntos nuevos) y sigue.
    const b = drive(60, 300, 10, 1_700_000_000 + 600).map((p): TrackPoint => [p[0] + (a.at(-1)![0] - -34) + 0.0001, p[1], p[2], p[3]]);
    const s = driveSummary([[...a, ...b]], 900);
    expect(s.stoppedS).toBeGreaterThan(250);
    expect(s.avgKmh).toBeLessThan(s.avgMovingKmh);
    expect(s.movingS).toBeLessThan(700);
  });

  it('un salto imposible del GPS no infla la velocidad máxima', () => {
    const seg = drive(50, 200);
    seg.push([seg.at(-1)![0] + 2, -58, 20, seg.at(-1)![3]! + 10]); // 22 km en 10 s
    expect(driveSummary([seg], 210).maxKmh).toBeLessThan(60);
  });

  it('sin puntos no inventa nada', () => {
    expect(driveSummary([], 0)).toEqual({ maxKmh: 0, avgMovingKmh: 0, avgKmh: 0, movingS: 0, stoppedS: 0 });
  });

  it('puntos cardinales y rumbo del último tramo', () => {
    expect(cardinal(0)).toBe('N');
    expect(cardinal(44)).toBe('NE');
    expect(cardinal(181)).toBe('S');
    expect(cardinal(359)).toBe('N');
    expect(cardinal(-90)).toBe('W');
    expect(bearingOfLast([drive(50, 60)])).toBeCloseTo(0, 0);
    expect(bearingOfLast([[[-34, -58, null, 1], [-34, -57.9, null, 2]]])).toBeGreaterThan(85);
    expect(bearingOfLast([[[-34, -58, null, 1]]])).toBeNull();
  });
});
