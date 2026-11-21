import { describe, expect, it } from 'vitest';
import type { Track } from '@/core/model/types';
import { ELEVATION_V, needsElevationFix, withFixedElevation } from './elevationFix';
import type { TrackPoint } from './gpx';

/** Desnivel con el cálculo viejo (altura cruda, umbral de 5 m), para comprobar que el problema existía con estos puntos. */
function trackStatsRaw(seg: TrackPoint[]): number {
  let ref = seg[0]![2]!;
  let up = 0;
  for (const p of seg) {
    const e = p[2]!;
    if (e - ref >= 5) {
      up += e - ref;
      ref = e;
    } else if (ref - e >= 5) ref = e;
  }
  return up;
}

const track = (over: Partial<Track>): Track =>
  ({ id: 't', name: 'Caminata', desc: '', source: '', link: null, segments: [], waypoints: [], distanceM: 0, ascentM: 121, descentM: 126, minEle: null, maxEle: null, notes: '', recorded: true, recording: false, ...over }) as unknown as Track;

describe('desnivel de los recorridos ya grabados', () => {
  it('solo se recalculan los grabados con la app, terminados y con el cálculo viejo', () => {
    expect(needsElevationFix(track({}))).toBe(true);
    expect(needsElevationFix(track({ elevationV: ELEVATION_V }))).toBe(false);
    expect(needsElevationFix(track({ recording: true }))).toBe(false);
    expect(needsElevationFix(track({ recorded: false }))).toBe(false); // un GPX importado
  });

  it('un recorrido llano con la altura ruidosa pasa de cientos de metros a casi nada y queda marcado', () => {
    // Un punto cada ~33 m con la altura moviéndose al azar (ruido repetible) como en una caminata real en terreno llano: error fijo, deriva lenta y ruido rápido.
    let seed = 5;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296 - 0.5;
    };
    const seg: TrackPoint[] = Array.from({ length: 100 }, (_, i) => [-34.58 - i * 0.0003, -58.63, 30 + 8 * Math.sin(i / 7) + rnd() * 14, 1_000_000 + i * 20] as TrackPoint);
    const fixed = withFixedElevation(track({ segments: [seg], ascentM: 300, descentM: 300 }));
    expect(trackStatsRaw(seg)).toBeGreaterThan(150); // el cálculo viejo sumaba cientos de metros con estos mismos puntos
    expect(fixed.ascentM).toBeLessThan(40);
    expect(fixed.descentM).toBeLessThan(40);
    expect(fixed.elevationV).toBe(ELEVATION_V);
    expect(needsElevationFix(fixed)).toBe(false);
  });
});
