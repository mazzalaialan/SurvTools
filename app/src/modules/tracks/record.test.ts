import { describe, expect, it } from 'vitest';
import type { Track } from '@/core/model/types';
import { addPoint, closeGap, dropOpenGap, finishedTrack, firstPoints, gapLines, joinLastSegments, openGap, SAVER_STEP_M, shouldAdd } from './record';
import { trackStats, type TrackPoint } from './gpx';

const track = (segments: Track['segments']): Track =>
  ({ id: 'r', name: 'R', desc: '', source: '', link: null, segments, waypoints: [], distanceM: 0, ascentM: 0, descentM: 0, minEle: null, maxEle: null, notes: '', recorded: true, recording: true }) as unknown as Track;

describe('grabación del recorrido', () => {
  it('descarta puntos imprecisos o demasiado cerca del anterior', () => {
    expect(shouldAdd(undefined, { lat: -41, lon: -71, accuracy: 10 })).toBe(true);
    expect(shouldAdd(undefined, { lat: -41, lon: -71, accuracy: 80 })).toBe(false);
    // ~5,5 m: quieto, no suma.
    expect(shouldAdd([-41, -71, null], { lat: -41.00005, lon: -71, accuracy: 5 })).toBe(false);
    // ~11 m con buena precisión, sí; con 30 m de error hace falta más paso.
    expect(shouldAdd([-41, -71, null], { lat: -41.0001, lon: -71, accuracy: 5 })).toBe(true);
    expect(shouldAdd([-41, -71, null], { lat: -41.0001, lon: -71, accuracy: 30 })).toBe(false);
  });

  it('con batería baja pide un paso más largo (menos puntos)', () => {
    // ~11 m: suma con el paso normal, no con el de ahorro (20 m); ~33 m, sí.
    expect(shouldAdd([-41, -71, null], { lat: -41.0001, lon: -71, accuracy: 5 }, SAVER_STEP_M)).toBe(false);
    expect(shouldAdd([-41, -71, null], { lat: -41.0003, lon: -71, accuracy: 5 }, SAVER_STEP_M)).toBe(true);
  });

  it('agrega al último tramo', () => {
    const segs = addPoint([[[-41, -71, null]], []], [-41.001, -71, 900]);
    expect(segs).toEqual([[[-41, -71, null]], [[-41.001, -71, 900]]]);
    expect(addPoint([], [-41, -71, null])).toEqual([[[-41, -71, null]]]);
  });

  it('al terminar deja los tramos con recorrido y calcula los datos', () => {
    const done = finishedTrack(
      track([
        [
          [-41, -71, 1000],
          [-41.001, -71, 1010],
        ],
        [[-41.002, -71, null]],
      ]),
      125,
    )!;
    expect(done.segments).toHaveLength(1);
    expect(done.recording).toBe(false);
    expect(done.durationS).toBe(125);
    expect(Math.round(done.distanceM)).toBe(111);
    expect(done.ascentM).toBe(10);
    expect(finishedTrack(track([[[-41, -71, null]]]), 3)).toBeNull();
  });

  it('para volver al origen toma solo la ida', () => {
    const t = track([
      [
        [1, 1, null],
        [2, 2, null],
      ],
      [
        [3, 3, null],
        [4, 4, null],
        [5, 5, null],
      ],
    ]);
    expect(firstPoints(t, 3).segments).toEqual([[[1, 1, null], [2, 2, null]], [[3, 3, null]]]);
    expect(firstPoints(t, 99).segments).toEqual(t.segments);
  });

  it('un corte con la pantalla apagada: separado no suma distancia; unido con una recta, sí', () => {
    const before: Track['segments'][number] = [[-41, -71, null], [-41.001, -71, null]];
    const after: Track['segments'][number] = [[-41.01, -71, null], [-41.011, -71, null]];
    const apart = trackStats([before, after]).distanceM;
    const joined = joinLastSegments([before, after]);
    expect(joined).toHaveLength(1);
    expect(trackStats(joined).distanceM).toBeGreaterThan(apart + 900);
    expect(joinLastSegments([before])).toEqual([before]);
  });
});

describe('cortes de la grabación (pantalla apagada)', () => {
  // Va por una calle hacia el norte; la pantalla se apaga y vuelve unos 600 m más adelante.
  const before: [number, number, number | null, number][] = [[-41.1, -71.3, null, 1000], [-41.101, -71.3, null, 1010]];
  const after: [number, number, number | null, number] = [-41.1065, -71.3, null, 1700];

  it('el corte se une siempre con una recta y suma su distancia: es menos de lo caminado, pero no se descarta', () => {
    const gaps = openGap(undefined, { from: 1_010_000, to: 1_700_000 }, before[1]);
    expect(gaps).toEqual([{ from: 1_010_000, to: 1_700_000, joined: true, a: [-41.101, -71.3] }]);
    const closed = closeGap(gaps, after)!;
    expect(closed[0]).toMatchObject({ joined: true, a: [-41.101, -71.3], b: [-41.1065, -71.3] });
    expect(closed[0]!.lengthM).toBeGreaterThan(550);
    expect(closed[0]!.lengthM).toBeLessThan(650);
    // Sigue en el mismo tramo: la distancia del recorrido incluye la recta.
    const segments = addPoint([before], after);
    expect(segments).toHaveLength(1);
    const total = trackStats(segments).distanceM;
    const walkedOnly = trackStats([before]).distanceM;
    expect(total).toBeGreaterThan(walkedOnly + closed[0]!.lengthM! - 5);
  });

  it('las rectas de los cortes cerrados salen en [lon, lat] para dibujarlas en otro color; las abiertas no', () => {
    const open = openGap(undefined, { from: 1, to: 2 }, before[1]);
    expect(gapLines(open)).toEqual([]);
    const closed = closeGap(open, after);
    expect(gapLines(closed)).toEqual([[[-71.3, -41.101], [-71.3, -41.1065]]]);
    expect(gapLines(undefined)).toEqual([]);
  });

  it('un corte sin punto de antes no tiene recta, y cerrar dos veces no cambia nada', () => {
    const noLast = openGap(undefined, { from: 1, to: 2 }, undefined);
    expect(closeGap(noLast, after)).toEqual(noLast);
    const closed = closeGap(openGap(undefined, { from: 1, to: 2 }, before[1]), after);
    expect(closeGap(closed, [-42, -71, null, 5000])).toEqual(closed);
  });

  it('si se pausa antes de que llegue el punto de después, ese corte queda sin recta (lo que se camina en pausa no se une)', () => {
    const open = openGap(undefined, { from: 1, to: 2 }, before[1]);
    expect(dropOpenGap(open)).toEqual([{ from: 1, to: 2, joined: false }]);
    const closed = closeGap(open, after);
    expect(dropOpenGap(closed)).toEqual(closed);
  });

  it('sobrevive a terminar la grabación: las coordenadas de la recta se guardan en el corte, aunque el recorrido se simplifique', () => {
    const withGap = { ...track([[...before, after]]), gaps: closeGap(openGap(undefined, { from: 1_010_000, to: 1_700_000 }, before[1]), after) } as Track;
    const done = finishedTrack(withGap, 900)!;
    expect(gapLines(done.gaps)).toEqual([[[-71.3, -41.101], [-71.3, -41.1065]]]);
    expect(done.distanceM).toBeGreaterThan(600);
  });
});

describe('desnivel con la altura ruidosa del GPS', () => {
  /** Ruido repetible (sin azar): un generador lineal simple. */
  const noise = (seed: number) => () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296 - 0.5;
  };
  /** Una caminata de ~3 km hacia el sur con un punto cada ~10 m, y la altura que se le pasa a cada punto. */
  const walk = (n: number, ele: (i: number) => number): TrackPoint[] => Array.from({ length: n }, (_, i) => [-34.58 - i * 0.00009, -58.63, ele(i), 1_000_000 + i * 8] as TrackPoint);

  it('terreno casi llano con el ruido medido de un GPS (19 m de error fijo, deriva y ruido rápido): casi no suma desnivel (antes sumaba más de 100 m)', () => {
    const rnd = noise(7);
    // Terreno real: 12 m de ondulación suave en 3 km; el GPS agrega lo medido en una caminata real: error fijo de 19 m, deriva lenta de ±8 m y ruido rápido de ±4 m.
    const seg = walk(300, (i) => 5 + 6 * Math.sin(i / 60) + 19 + 8 * Math.sin(i / 25 + 1) + rnd() * 14);
    const s = trackStats([seg]);
    expect(s.ascentM).toBeLessThan(30);
    expect(s.descentM).toBeLessThan(30);
  });

  it('una subida real de 150 m en 3 km con el mismo error se sigue midiendo', () => {
    const rnd = noise(11);
    const seg = walk(300, (i) => 30 + i * 0.5 + 19 + 8 * Math.sin(i / 25 + 1) + rnd() * 14);
    const s = trackStats([seg]);
    expect(s.ascentM).toBeGreaterThan(120);
    expect(s.ascentM).toBeLessThan(190);
    expect(s.descentM).toBeLessThan(40);
  });

  it('puntos muy separados (sin nada que alisar): se cuenta cada cambio de más de 5 m, como antes', () => {
    const seg: TrackPoint[] = [[-34.58, -58.63, 100, 0], [-34.59, -58.63, 110, 1], [-34.6, -58.63, 125, 2], [-34.61, -58.63, 120, 3]];
    expect(trackStats([seg]).ascentM).toBe(25);
  });

  it('la altura mínima y máxima son las medidas', () => {
    const seg = walk(50, (i) => 100 + (i % 2 ? 30 : 0));
    const s = trackStats([seg]);
    expect(s.minEle).toBe(100);
    expect(s.maxEle).toBe(130);
  });
});
