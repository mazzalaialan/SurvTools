import { describe, expect, it } from 'vitest';
import type { Track } from '@/core/model/types';
import { addPoint, closeGap, dropOpenGap, finishedTrack, firstPoints, gapLines, joinLastSegments, openGap, SAVER_STEP_M, shouldAdd } from './record';
import { balancedClimb, trackStats, type TrackPoint } from './gpx';

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

  it('la altura mínima y máxima salen de la altura alisada: un salto suelto del GPS no es la cima', () => {
    // Terreno llano a 100 m con un único punto en 160 m (un salto del GPS): no puede ser la altura máxima.
    const seg = walk(50, (i) => (i === 25 ? 160 : 100));
    const s = trackStats([seg]);
    expect(s.maxEle).toBeLessThan(110);
    expect(s.minEle).toBeGreaterThan(95);
    // Una cima sostenida (tramo largo) sí cuenta.
    const climb = trackStats([walk(80, (i) => 100 + (i > 30 && i < 60 ? 40 : 0))]);
    expect(climb.maxEle).toBeGreaterThan(135);
  });
});

describe('subida y bajada cierran la cuenta', () => {
  it('subida menos bajada es la diferencia de altura entre el inicio y el final (el umbral no pierde el saldo)', () => {
    // Sube 20 m y baja solo 3 al final (menos que el umbral de 5 m): antes ese último tramo no se contaba.
    const h = [100, 110, 120, 117];
    const c = balancedClimb(h);
    expect(c.ascent - c.descent).toBeCloseTo(17, 6);
    // Un vaivén chico (menos que el umbral) sigue sin sumar nada.
    expect(balancedClimb([100, 102, 99, 101, 100]).ascent + balancedClimb([100, 102, 99, 101, 100]).descent).toBeLessThan(1e-9);
    expect(balancedClimb([])).toEqual({ ascent: 0, descent: 0 });
  });

  it('un circuito por caminos distintos no se iguala: cada subida y bajada son las de los datos', () => {
    // Termina donde empezó (mismo punto, misma altura), pero la ida tiene una loma de 40 m y la vuelta casi no sube: el total de subida y de bajada lo dan los datos.
    const n = 120;
    const lat = (i: number) => -34.58 - (i <= n ? i : 2 * n - i) * 0.00009;
    const ele = (i: number) => (i <= n ? 20 + 40 * Math.sin((Math.PI * i) / n) ** 2 * (i < n / 2 ? 1 : 0.2) : 20 + 3 * Math.sin((Math.PI * (2 * n - i)) / n));
    const seg: TrackPoint[] = Array.from({ length: 2 * n + 1 }, (_, i) => [lat(i), -58.63 + (i > n ? 0.0004 : 0), ele(i), 1_000_000 + i * 8] as TrackPoint);
    const s = trackStats([seg]);
    expect(Math.abs(s.ascentM - s.descentM)).toBeLessThanOrEqual(6); // termina cerca de la altura del inicio, pero no se fuerza la igualdad
    expect(s.ascentM).toBeGreaterThan(15);
  });

  it('subida menos bajada es la diferencia de altura entre el inicio y el final, aunque no terminen en el mismo lugar', () => {
    const seg: TrackPoint[] = Array.from({ length: 120 }, (_, i) => [-34.58 - i * 0.00009, -58.63, 50 + (i < 60 ? i : 120 - i) * 0.4 + 12, 1_000_000 + i * 8] as TrackPoint);
    const s = trackStats([seg]);
    expect(s.ascentM - s.descentM).toBeGreaterThanOrEqual(-3);
    expect(s.ascentM - s.descentM).toBeLessThanOrEqual(3);
  });
});

describe('escalones sostenidos del error de altura del GPS', () => {
  it('tramos largos con el GPS 15 m más alto o más bajo (como en una caminata llana real) no suman casi desnivel', () => {
    // Terreno llano a 10 m; el error del GPS tiene escalones que duran unos 300 a 600 m (la altura medida salta y se queda).
    const offset = (i: number) => (i < 27 ? 13 : i < 37 ? 28 : i < 50 ? 14 : i < 56 ? 7 : i < 67 ? 14 : i < 84 ? 30 : 15);
    let seed = 9;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296 - 0.5;
    };
    const seg: TrackPoint[] = Array.from({ length: 100 }, (_, i) => [-34.58 - i * 0.0003, -58.63, 10 + offset(i) + rnd() * 8, 1_000_000 + i * 20] as TrackPoint);
    const s = trackStats([seg]);
    // Los escalones suman ~75 m de movimiento (+15, −14, −7, +7, +16, −15): con solo el GPS no se pueden distinguir de una subida real, así que el desnivel queda en ese orden.
    // Lo que el alisado sí saca es el ruido de punto a punto: sin él sumaría varios cientos de metros.
    expect(s.ascentM).toBeLessThan(60);
    expect(s.descentM).toBeLessThan(60);
    expect(s.ascentM + s.descentM).toBeLessThan(2 * 75);
  });
});
