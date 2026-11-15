import { describe, expect, it } from 'vitest';
import { distanceMeters } from '@/core/geo/geo';
import type { TrackGap } from '@/core/model/types';
import { bridgeAlongTracks, isSignalJump, pathAlong, withBridge } from './bridge';
import type { TrackPoint } from './gpx';
import { gapLines } from './record';

const D = 1 / 111_195; // 1 m en grados de latitud
/** Un camino en «L»: 1 km al norte y después 1 km al este (a −34, −58). */
const L: TrackPoint[] = [
  [-34, -58, 10],
  [-34 + 500 * D, -58, 20],
  [-34 + 1000 * D, -58, 30],
  [-34 + 1000 * D, -58 + 500 * D / Math.cos((34 * Math.PI) / 180), 40],
  [-34 + 1000 * D, -58 + 1000 * D / Math.cos((34 * Math.PI) / 180), 50],
];
const at = (northM: number, eastM = 0) => ({ lat: -34 + northM * D, lon: -58 + (eastM * D) / Math.cos((34 * Math.PI) / 180) });
const len = (pts: { 0: number; 1: number }[]) => pts.slice(1).reduce((d, p, i) => d + distanceMeters({ lat: pts[i]![0], lon: pts[i]![1] }, { lat: p[0], lon: p[1] }), 0);

describe('cortes que siguen un track cargado', () => {
  it('sigue el camino por la esquina en vez de la recta', () => {
    const a = at(200);
    const b = at(1000, 400);
    const found = pathAlong(L, a, b)!;
    expect(found).not.toBeNull();
    // Recta ≈ 825 m; por el camino: 800 al norte + 400 al este = 1200 m.
    expect(distanceMeters(a, b)).toBeLessThan(900);
    expect(found.lengthM).toBeGreaterThan(1150);
    expect(found.lengthM).toBeLessThan(1250);
    // Pasa por la esquina y empieza y termina sobre el track.
    expect(found.points.some((p) => Math.abs(p[0] - L[2]![0]) < 1e-9 && Math.abs(p[1] - L[2]![1]) < 1e-9)).toBe(true);
    expect(len(found.points)).toBeCloseTo(found.lengthM, -1);
    expect(found.points[0]![2]).toBeCloseTo(14, 0); // altura interpolada: 10 → 20 en los primeros 500 m, a los 200 m
  });

  it('vale en los dos sentidos', () => {
    const ab = pathAlong(L, at(200), at(1000, 400))!;
    const ba = pathAlong(L, at(1000, 400), at(200))!;
    expect(ba.lengthM).toBeCloseTo(ab.lengthM, 0);
    expect(ba.points[0]![0]).toBeCloseTo(ab.points.at(-1)![0], 6);
  });

  it('si un punto no está sobre el track, no hay camino', () => {
    expect(pathAlong(L, at(200, 300), at(1000, 400))).toBeNull();
    expect(pathAlong(L, at(200), at(1000, 400), 5)).not.toBeNull();
    expect(pathAlong([L[0]!], at(0), at(1))).toBeNull();
  });

  it('en un circuito da la vuelta por el lado más corto', () => {
    // Un cuadrado de 400 m de lado, cerrado.
    const k = D / Math.cos((34 * Math.PI) / 180);
    const sq: TrackPoint[] = [[-34, -58, null], [-34 + 400 * D, -58, null], [-34 + 400 * D, -58 + 400 * k, null], [-34, -58 + 400 * k, null], [-34, -58, null]];
    const a = at(50); // sobre el lado oeste, cerca del inicio
    const b = at(0, 50); // sobre el lado sur, cerca del inicio
    const found = pathAlong(sq, a, b)!;
    // Por la esquina del inicio son ~100 m; dando toda la vuelta, ~1500 m.
    expect(found.lengthM).toBeLessThan(150);
  });

  it('descarta un camino mucho más largo que la recta (no es la misma calle)', () => {
    // Una «U» larga: los extremos están a 100 m pero por el track hay 5 km.
    const k = D / Math.cos((34 * Math.PI) / 180);
    const U: TrackPoint[] = [[-34, -58, null], [-34 + 2500 * D, -58, null], [-34 + 2500 * D, -58 + 100 * k, null], [-34, -58 + 100 * k, null]];
    expect(pathAlong(U, at(0), at(0, 100))!.lengthM).toBeGreaterThan(4000);
    expect(bridgeAlongTracks([{ id: 'u', name: 'U', line: U }], at(0), at(0, 100))).toBeNull();
  });

  it('elige el track por el que el camino es más corto', () => {
    const corto: TrackPoint[] = [[-34 + 200 * D, -58, null], [-34 + 900 * D, -58, null]];
    const b = bridgeAlongTracks([{ id: 'L', name: 'Camino L', line: L }, { id: 'c', name: 'Corto', line: corto }], at(300), at(800))!;
    expect(b.via === 'L' || b.via === 'c').toBe(true);
    expect(b.lengthM).toBeCloseTo(500, -1);
    expect(bridgeAlongTracks([], at(300), at(800))).toBeNull();
  });

  it('detecta un corte por el salto de tiempo y distancia entre dos puntos', () => {
    const p = (lat: number, t: number): TrackPoint => [lat, -58, null, t];
    expect(isSignalJump(p(-34, 1000), p(-34 + 300 * D, 1060))).toBe(true);
    expect(isSignalJump(p(-34, 1000), p(-34 + 300 * D, 1010))).toBe(false); // rápido: no es un corte
    expect(isSignalJump(p(-34, 1000), p(-34 + 50 * D, 1100))).toBe(false); // parado: casi no se movió
    expect(isSignalJump([-34, -58, null], p(-34 + 300 * D, 1100))).toBe(false); // sin hora no se sabe
  });

  it('anota el corte (nuevo o abierto) con el camino y se dibuja por ahí', () => {
    const last: TrackPoint = [-34 + 200 * D, -58, null, 1000];
    const next: TrackPoint = [-34 + 1000 * D, -58 + 0.004, null, 1100];
    const bridge = bridgeAlongTracks([{ id: 'L', name: 'Camino L', line: L }], { lat: last[0], lon: last[1] }, { lat: next[0], lon: next[1] })!;
    const fresh = withBridge(undefined, false, last, next, bridge);
    expect(fresh).toHaveLength(1);
    expect(fresh[0]).toMatchObject({ joined: true, via: 'Camino L', a: [last[0], last[1]], b: [next[0], next[1]] });
    expect(fresh[0]!.path!.length).toBeGreaterThan(1);
    // Con un corte abierto (pantalla apagada) se completa ese mismo.
    const open: TrackGap[] = [{ from: 1, to: 2, joined: true, a: [last[0], last[1]], b: [next[0], next[1]], lengthM: 5 }];
    const closed = withBridge(open, true, last, next, bridge);
    expect(closed).toHaveLength(1);
    expect(closed[0]).toMatchObject({ from: 1, to: 2, via: 'Camino L' });
    expect(closed[0]!.lengthM).toBe(Math.round(bridge.lengthM));
    // La línea del mapa pasa por todos los puntos del camino; sin camino es la recta de dos puntos.
    expect(gapLines(closed)[0]!.length).toBe(closed[0]!.path!.length + 2);
    expect(gapLines([{ from: 1, to: 2, joined: true, a: [1, 2], b: [3, 4] }])[0]).toEqual([[2, 1], [4, 3]]);
  });
});
