import { describe, expect, it } from 'vitest';
import { GpxError, type TrackPoint } from '@/modules/tracks/gpx';
import { ACTIVITIES, ACTIVITY_KINDS, GROUPS, kindsOf } from './activities';
import { calories } from './energy';
import type { Outing, Track, Workout } from '@/core/model/types';
import { distanceMeters } from '@/core/geo/geo';
import { byWeek, goalProgress, inOuting, recalculated, recordsOf, totalsOf, weekStart } from './history';
import { advance, describePlan, parseClock, phases, planDurationS, START_STATE, usesDistance, validPlan, type RunState } from './intervals';
import { gearFor, gearKm, kmForInventoryItem, wear } from './gear';
import type { Gear } from '@/core/model/types';
import { bmi, bmiCategory, parseKg, sortedWeights, summarize } from './weight';
import type { WeightEntry } from '@/core/model/types';
import { buildChunks } from './liveChunks';
import { fastestSlowest, lapRows } from './laps';
import { clampTimer, elapsedMs, TIMER_MAX_S, timerLeftMs, useTimer } from './stopwatch';
import { breathing, breathPhaseAt, formatDuration, formatStopwatch, hrZones, CADENCE_CATEGORIES, cadenceInfo, PATTERN_FOR, patternById, maxHrFromAge, paceOf, parseDuration, riegel, stopwatchLaps, timeAtPace } from './tools';
import { activityFromFile, kindFromSport, parseActivityFile, toGpx, toTcx } from './interchange';
import { buildSharePayload, removeZones, trimEnds } from './share';
import { analyzeRecording, formatClock, formatPace } from './stats';

describe('actividades', () => {
  it('cada actividad tiene su grupo y las de bajo techo no usan GPS', () => {
    expect(ACTIVITY_KINDS).toHaveLength(16);
    for (const k of ACTIVITY_KINDS) expect(ACTIVITIES[k].kind).toBe(k);
    expect(kindsOf('indoor')).toEqual(['treadmill', 'elliptical', 'stairClimber']);
    expect(kindsOf('rowing')).toEqual(['kayak', 'canoe', 'rowboat', 'sup', 'rafting']);
    expect(kindsOf('cycling')).toHaveLength(5);
    expect(GROUPS.flatMap(kindsOf).sort()).toEqual([...ACTIVITY_KINDS].sort());
    expect(ACTIVITY_KINDS.filter((k) => !ACTIVITIES[k].gps)).toEqual(['treadmill', 'elliptical', 'stairClimber']);
    // A pie, ritmo; en bici y remo, velocidad.
    expect(ACTIVITIES.trek.measure).toBe('pace');
    expect(ACTIVITIES.kayak.measure).toBe('speed');
  });
});

describe('calorías', () => {
  it('caminar 5 km/h una hora en llano, 70 kg: unas 250 kcal (ACSM)', () => {
    const k = calories({ kind: 'walk', weightKg: 70, movingS: 3600, distanceM: 5000 });
    expect(k).toBeGreaterThan(235);
    expect(k).toBeLessThan(265);
  });

  it('correr 10 km/h una hora, 70 kg: unas 770 kcal', () => {
    const k = calories({ kind: 'run', weightKg: 70, movingS: 3600, distanceM: 10_000 });
    expect(k).toBeGreaterThan(740);
    expect(k).toBeLessThan(800);
  });

  it('subir cuesta más: el mismo trekking con desnivel y mochila gasta más', () => {
    const flat = calories({ kind: 'trek', weightKg: 75, movingS: 7200, distanceM: 8000 });
    const climb = calories({ kind: 'trek', weightKg: 75, movingS: 7200, distanceM: 8000, ascentM: 800 });
    const pack = calories({ kind: 'trek', weightKg: 75, packKg: 12, movingS: 7200, distanceM: 8000, ascentM: 800 });
    expect(climb).toBeGreaterThan(flat * 1.5);
    expect(pack).toBeGreaterThan(climb * 1.1);
  });

  it('cinta: la inclinación suma; sin movimiento o sin peso, cero', () => {
    const flat = calories({ kind: 'treadmill', weightKg: 80, movingS: 1800, distanceM: 4000 });
    const incline = calories({ kind: 'treadmill', weightKg: 80, movingS: 1800, distanceM: 4000, inclinePct: 8 });
    expect(incline).toBeGreaterThan(flat * 1.25); // a 8 km/h corre: la pendiente pesa menos que al caminar
    expect(calories({ kind: 'run', weightKg: 80, movingS: 0, distanceM: 0 })).toBe(0);
    expect(calories({ kind: 'run', weightKg: 0, movingS: 600, distanceM: 1000 })).toBe(0);
  });

  it('bici: más rápido, más calorías; la de montaña y la de ruta, más que la eléctrica; subir suma', () => {
    const road25 = calories({ kind: 'roadBike', weightKg: 70, movingS: 3600, distanceM: 25_000 });
    const road15 = calories({ kind: 'roadBike', weightKg: 70, movingS: 3600, distanceM: 15_000 });
    expect(road25).toBeGreaterThan(road15);
    expect(road25).toBeGreaterThan(650); // MET 10 × 70 kg × 1 h
    const e = calories({ kind: 'ebike', weightKg: 70, movingS: 3600, distanceM: 25_000 });
    expect(e).toBeLessThan(road25);
    const climb = calories({ kind: 'roadBike', weightKg: 70, movingS: 3600, distanceM: 25_000, ascentM: 600 });
    // 70 kg × 9,81 × 600 m / (4184 × 0,22) ≈ 447 kcal de trabajo de subida
    expect(climb - road25).toBeGreaterThan(400);
    expect(climb - road25).toBeLessThan(500);
    expect(calories({ kind: 'mtb', weightKg: 70, movingS: 3600, distanceM: 12_000 })).toBeGreaterThanOrEqual(595);
  });

  it('remo, elíptica y escalador: por MET e intensidad', () => {
    expect(calories({ kind: 'kayak', weightKg: 70, movingS: 3600, distanceM: 5000 })).toBe(350); // 5 MET
    expect(calories({ kind: 'rafting', weightKg: 80, movingS: 7200, distanceM: 9000 })).toBe(800); // 5 MET
    const mod = calories({ kind: 'elliptical', weightKg: 70, movingS: 3600, distanceM: 0 });
    const hard = calories({ kind: 'elliptical', weightKg: 70, movingS: 3600, distanceM: 0, intensity: 'vigorous' });
    expect(mod).toBe(350);
    expect(hard).toBeGreaterThan(mod);
    expect(calories({ kind: 'stairClimber', weightKg: 70, movingS: 1800, distanceM: 0 })).toBe(315); // 9 MET × 70 × 0,5 h
  });
});

describe('estadísticas de lo grabado', () => {
  // Una caminata hacia el sur a 1,5 m/s: un punto cada 15 s (≈ 22,5 m); ~111 m por cada 0,001°.
  const walk = (n: number, startT = 1_000_000, startLat = -41): TrackPoint[] =>
    Array.from({ length: n }, (_, i) => [startLat - i * 0.0002, -71, 800 + i * 0.5, startT + i * 15] as TrackPoint);

  it('tiempo, distancia, desnivel, ritmo y parciales por kilómetro', () => {
    const seg = walk(101); // 100 pasos de 22,24 m ≈ 2,2 km en 1500 s
    const s = analyzeRecording([seg]);
    expect(s.totalS).toBe(1500);
    expect(s.movingS).toBe(1500);
    expect(s.distanceM).toBeGreaterThan(2200);
    expect(s.distanceM).toBeLessThan(2250);
    expect(s.avgSpeedKmh).toBeCloseTo(5.4, 0);
    expect(s.paceSPerKm).toBeGreaterThan(640);
    expect(s.paceSPerKm).toBeLessThan(680);
    expect(s.splitsS).toHaveLength(2);
    expect(s.splitsS[0]).toBeGreaterThan(660);
    expect(s.splitsS[0]).toBeLessThan(690);
    expect(s.maxSpeedKmh).toBeGreaterThan(5);
    // Una subida pareja de 50 m: el alisado de la altura achata un poco los extremos, pero no la pierde.
    expect(s.ascentM).toBeGreaterThanOrEqual(44);
    expect(s.ascentM).toBeLessThanOrEqual(50);
  });

  it('las paradas no cuentan como movimiento ni las pausas como tiempo', () => {
    const first = walk(21, 1_000_000); // 300 s caminando
    // Parada de 10 minutos en el mismo lugar: un punto igual al último 600 s después.
    const last = first.at(-1)!;
    const stop: TrackPoint[] = [[last[0], last[1], last[2], (last[3] as number) + 600]];
    const second = walk(21, 1_000_000 + 900, last[0] - 0.0002);
    const s = analyzeRecording([[...first, ...stop, ...second]]);
    expect(s.totalS).toBe(1200);
    expect(s.movingS).toBe(600);
    // Dos tramos (una pausa): el tiempo entre ellos no suma.
    const apart = analyzeRecording([first, walk(21, 2_000_000)]);
    expect(apart.totalS).toBe(600);
    expect(apart.movingS).toBe(600);
  });

  it('un salto del GPS no cuenta, y sin horas no hay ritmo', () => {
    const jump: TrackPoint[] = [
      [-41, -71, null, 100],
      [-40, -71, null, 110], // 111 km en 10 s
      [-40.0002, -71, null, 125],
    ];
    expect(analyzeRecording([jump]).maxSpeedKmh).toBeLessThan(10);
    const noTime = analyzeRecording([[[-41, -71, null], [-41.001, -71, null]]]);
    expect(noTime.movingS).toBe(0);
    expect(noTime.paceSPerKm).toBe(0);
    expect(noTime.distanceM).toBeGreaterThan(100);
  });
});

describe('formatos', () => {
  it('ritmo y reloj', () => {
    expect(formatPace(332)).toBe('5:32');
    expect(formatPace(0)).toBe('—');
    expect(formatClock(3909)).toBe('1:05:09');
    expect(formatClock(2712)).toBe('45:12');
  });
});

describe('historial y salidas', () => {
  const w = (id: string, startedAt: string, over: Partial<Workout> = {}): Workout => ({ id, kind: 'walk', name: id, startedAt, source: 'gps', trackId: null, totalS: 3600, movingS: 3500, distanceM: 5000, ascentM: 100, descentM: 80, minEle: 800, maxEle: 900, avgSpeedKmh: 5, paceSPerKm: 720, maxSpeedKmh: 7, splitsS: [], calories: 250, weightKg: 70, packKg: null, inclinePct: null, intensity: null, avgHr: null, maxHr: null, notes: '', outingId: null, createdAt: startedAt, updatedAt: startedAt, ...over }) as unknown as Workout;

  it('totales: suma y toma la altura más alta y la más baja', () => {
    const t = totalsOf([w('a', '2026-11-02T10:00:00'), w('b', '2026-11-03T10:00:00', { maxEle: 1200, minEle: 700, distanceM: 3000 })]);
    expect(t).toMatchObject({ count: 2, totalS: 7200, distanceM: 8000, ascentM: 200, calories: 500, maxEle: 1200, minEle: 700 });
    expect(totalsOf([]).maxEle).toBeNull();
  });

  it('semanas: de lunes a domingo, la más nueva primero', () => {
    expect(weekStart(new Date('2026-11-08T12:00:00'))).toBe('2026-11-02'); // domingo
    expect(weekStart(new Date('2026-11-09T00:30:00'))).toBe('2026-11-09'); // lunes
    const weeks = byWeek([w('a', '2026-11-02T10:00:00'), w('b', '2026-11-08T20:00:00'), w('c', '2026-11-09T07:00:00')]);
    expect(weeks.map((x) => x.start)).toEqual(['2026-11-09', '2026-11-02']);
    expect(weeks[1]!.workouts.map((x) => x.id)).toEqual(['b', 'a']);
    expect(weeks[1]!.totals.distanceM).toBe(10_000);
  });

  it('salida: sus actividades en orden, con totales juntos', () => {
    const list = [w('baja', '2026-11-08T15:00:00', { outingId: 'o1' }), w('sube', '2026-11-08T08:00:00', { outingId: 'o1', ascentM: 900 }), w('otra', '2026-11-08T09:00:00', { outingId: 'o2' })];
    expect(inOuting(list, 'o1').map((x) => x.id)).toEqual(['sube', 'baja']);
    expect(totalsOf(inOuting(list, 'o1')).ascentM).toBe(1000);
  });

  it('récords y recálculo de calorías con otro peso', () => {
    const r = recordsOf([w('a', '2026-11-02T10:00:00'), w('b', '2026-11-03T10:00:00', { distanceM: 12_000, ascentM: 900 })]);
    expect(r).toMatchObject({ longestM: 12_000, mostAscentM: 900 });
    expect(recordsOf([])).toEqual({ longestM: null, mostAscentM: null, longestS: null });
    const base = w('x', '2026-11-02T10:00:00', { calories: 0, weightKg: null });
    expect(recalculated(base, null, null).calories).toBe(0);
    expect(recalculated(base, 70, null).calories).toBeGreaterThan(200);
    expect(recalculated(base, 90, null).calories).toBeGreaterThan(recalculated(base, 70, null).calories);
  });
});

describe('compartir una salida', () => {
  // Una caminata hacia el sur: un punto cada ~22 m (0,0002°).
  const line = (n: number, lat0 = -41): TrackPoint[] => Array.from({ length: n }, (_, i) => [lat0 - i * 0.0002, -71, 1000 + i, 1_000_000 + i * 15] as TrackPoint);
  const meters = (seg: TrackPoint[]) => (seg.length - 1) * 22.24;

  it('recorta el inicio y el final (la casa) sin tocar el medio', () => {
    const seg = line(101); // 2,2 km
    const [cut] = trimEnds([seg], 300);
    expect(cut!.length).toBeLessThan(seg.length);
    // 300 m son ~14 puntos de cada lado.
    expect(meters(cut!)).toBeGreaterThan(2224 - 2 * 330);
    expect(meters(cut!)).toBeLessThan(2224 - 2 * 280);
    expect(cut![0]![0]).toBeLessThan(seg[0]![0] - 0.002);
    expect(trimEnds([seg], 0)).toEqual([seg]);
  });

  it('un recorrido corto o en tramos: se recorta de tramo en tramo, y si es muy corto no queda nada', () => {
    expect(trimEnds([line(10)], 300)).toEqual([]); // 200 m
    const a = line(30); // 650 m
    const b = line(30, -42); // 650 m
    const out = trimEnds([a, b], 300);
    expect(out).toHaveLength(2);
    expect(meters(out[0]!)).toBeLessThan(meters(a) - 250);
    expect(meters(out[1]!)).toBeLessThan(meters(b) - 250);
  });

  it('el contenido: totales, tipos, día, perfil y tope de puntos; nunca notas ni calorías si no hay', () => {
    const outing = { id: 'o1', name: 'Salida al Platita', notes: 'mi casa está en la calle…', createdAt: '2026-11-08T10:00:00', updatedAt: '2026-11-08T10:00:00' } as never;
    const mk = (id: string, started: string, track: string | null, over: Partial<Workout> = {}) =>
      ({ id, kind: 'trek', name: id, startedAt: started, source: 'gps', trackId: track, totalS: 3600, movingS: 3500, distanceM: 2000, ascentM: 300, descentM: 100, minEle: 1000, maxEle: 1100, calories: 0, outingId: 'o1', ...over }) as unknown as Workout;
    const big = line(2000, -30); // 44 km en 2000 puntos: pasa el tope
    const tracks = new Map([['t1', { segments: [big] }], ['t2', { segments: [line(101)] }]]) as never;
    const all = [mk('b', '2026-11-08T14:00:00', 't2', { kind: 'walk' }), mk('a', '2026-11-08T08:00:00', 't1')];
    const p = buildSharePayload(outing, all, tracks, 'es', 300);
    expect(p).toMatchObject({ name: 'Salida al Platita', lang: 'es', date: '2026-11-08', activities: 2, distanceM: 4000, totalS: 7200, ascentM: 600, calories: null });
    expect(p.kinds.sort()).toEqual(['trek', 'walk']);
    expect(p.route.flat().length).toBeLessThanOrEqual(1200);
    expect(p.profile.length).toBeLessThanOrEqual(301);
    expect(p.profile[0]![0]).toBe(0);
    expect(JSON.stringify(p)).not.toContain('mi casa');
    expect('notes' in p).toBe(false);
    // Sin recorte: el recorrido empieza donde empezó.
    const whole = buildSharePayload(outing, [all[1]!], new Map([['t1', { segments: [line(101)] }]]) as never, 'en', 0);
    expect(whole.route[0]![0]).toEqual([-41, -71]);
    expect(whole.lang).toBe('en');
  });
});

describe('GPX y TCX', () => {
  const seg: [number, number, number | null, number?][] = [
    [-34.6, -58.4, 10, 1_700_000_000],
    [-34.601, -58.4, 12, 1_700_000_060],
    [-34.602, -58.4, null, 1_700_000_120],
  ];
  const act = { name: 'Salida <1> & "2"', kind: 'run' as const, startedAt: '2023-11-14T22:13:20.000Z', segments: [seg] };

  it('exporta a GPX y se vuelve a leer igual (altura y hora incluidas, nombre escapado)', () => {
    const back = parseActivityFile(toGpx(act), 'x.gpx');
    expect(back.name).toBe(act.name);
    expect(back.kind).toBe('run');
    expect(back.segments[0]).toEqual(seg);
    expect(back.startedAt).toBe('2023-11-14T22:13:20.000Z');
  });

  it('exporta a TCX y se vuelve a leer: deporte, puntos con hora y altura', () => {
    const back = parseActivityFile(toTcx(act, { totalS: 120, distanceM: 222, calories: 15 }), 'x.tcx');
    expect(back.kind).toBe('run');
    expect(back.segments[0]).toEqual(seg);
  });

  it('un TCX sin posiciones (cinta) no tiene recorrido', () => {
    const tcx = '<TrainingCenterDatabase><Activities><Activity Sport="Running"><Lap><Track><Trackpoint><Time>2024-01-01T10:00:00Z</Time></Trackpoint><Trackpoint><Time>2024-01-01T10:00:01Z</Time></Trackpoint></Track></Lap></Activity></Activities></TrainingCenterDatabase>';
    expect(() => parseActivityFile(tcx)).toThrow(GpxError);
  });

  it('reconoce deportes de otras apps y deja null los desconocidos', () => {
    expect(kindFromSport('Biking')).toBe('roadBike');
    expect(kindFromSport('Hiking')).toBe('trek');
    expect(kindFromSport('MountainBikeRide')).toBe('mtb');
    expect(kindFromSport('Golf')).toBeNull();
  });

  it('importar arma la actividad con ritmo y calorías', () => {
    const { track, workout } = activityFromFile(parseActivityFile(toGpx(act)), 'run', 70);
    expect(workout.source).toBe('gps');
    expect(workout.trackId).toBe(track.id);
    expect(workout.totalS).toBe(120);
    expect(workout.calories).toBeGreaterThan(0);
  });
});

describe('objetivos semanales', () => {
  const week = totalsOf([]);
  it('sin objetivos no hay nada que mostrar; los que están en 0 no cuentan', () => {
    expect(goalProgress(week, { distanceKm: 0, minutes: 0, sessions: 0 })).toEqual([]);
    expect(goalProgress(week, { distanceKm: 10, minutes: 0, sessions: 0 })).toHaveLength(1);
  });
  it('mide el avance y marca cuando se cumple (sin pasar de 1)', () => {
    const w = { ...week, count: 3, distanceM: 12_000, totalS: 1800 };
    const [d, m, s] = goalProgress(w, { distanceKm: 20, minutes: 30, sessions: 2 });
    expect(d).toMatchObject({ key: 'distanceKm', fraction: 0.6, reached: false });
    expect(m).toMatchObject({ key: 'minutes', fraction: 1, reached: true });
    expect(s).toMatchObject({ key: 'sessions', fraction: 1, reached: true });
  });
});

describe('peso e IMC', () => {
  const e = (day: string, kg: number, updatedAt = day): WeightEntry => ({ id: day + kg, createdAt: day, updatedAt, day, kg }) as WeightEntry;
  it('parsea pesos válidos con coma o punto y rechaza lo absurdo', () => {
    expect(parseKg('72,5')).toBe(72.5);
    expect(parseKg(' 80.04 ')).toBe(80);
    expect(parseKg('5')).toBeNull();
    expect(parseKg('abc')).toBeNull();
    expect(parseKg('500')).toBeNull();
  });
  it('resume: actual, cambio desde el primero y en 30 días', () => {
    const list = sortedWeights([e('2026-11-01', 78), e('2026-09-01', 82), e('2026-10-01', 80)]);
    const s = summarize(list, new Date('2026-11-08T12:00:00'));
    expect(s.current).toBe(78);
    expect(s.sinceStart).toBe(-4);
    expect(s.last30).toBe(-2); // el de hace 30 días o más: 1 de octubre (80)
    expect(summarize([], new Date()).current).toBeNull();
  });
  it('IMC y categorías de la OMS', () => {
    expect(bmi(80, 180)).toBe(24.7);
    expect(bmi(null, 180)).toBeNull();
    expect(bmi(80, 20)).toBeNull();
    expect(bmiCategory(18.4)).toBe('low');
    expect(bmiCategory(24.9)).toBe('normal');
    expect(bmiCategory(25)).toBe('overweight');
    expect(bmiCategory(30)).toBe('obese');
  });
});

describe('equipo', () => {
  const g = { id: 'g1', name: 'Zapatillas', kinds: ['run', 'walk'], startKm: 100, retireKm: 600 } as unknown as unknown as Gear;
  const w = (id: string, gearId: string | null, distanceM: number) => ({ id, gearId, distanceM }) as Workout;
  it('suma los km iniciales y los de las actividades donde se usó', () => {
    expect(gearKm(g, [w('a', 'g1', 10_000), w('b', 'g1', 5_500), w('c', null, 40_000), w('d', 'otro', 9_000)])).toBe(115.5);
  });
  it('desgaste: sin vida útil no avisa; al 90 % ya avisa; al 100 % está gastado', () => {
    expect(wear({ ...g, retireKm: 0 }, []).fraction).toBeNull();
    expect(wear(g, [w('a', 'g1', 440_000)])).toMatchObject({ km: 540, nearEnd: true, worn: false });
    expect(wear(g, [w('a', 'g1', 600_000)])).toMatchObject({ worn: true, fraction: 1 });
  });
  it('ofrece el equipo según la actividad y deja afuera lo retirado', () => {
    const bici = { id: 'g2', name: 'Bici', kinds: ['mtb'], startKm: 0, retireKm: 0 } as unknown as unknown as Gear;
    const todo = { id: 'g3', name: 'Casco', kinds: [], startKm: 0, retireKm: 0 } as unknown as unknown as Gear;
    const viejo = { ...g, id: 'g4', retired: true } as unknown as unknown as Gear;
    expect(gearFor('run', [g, bici, todo, viejo]).map((x) => x.id)).toEqual(['g3', 'g1']);
    expect(gearFor('mtb', [g, bici, todo]).map((x) => x.id)).toEqual(['g2', 'g3']);
  });
  it('km de un artículo del Inventario vinculado (null si no hay ninguno)', () => {
    const linked = { ...g, inventoryItemId: 'item1' } as unknown as unknown as Gear;
    expect(kmForInventoryItem('item1', [linked], [w('a', 'g1', 20_000)])).toBe(120);
    expect(kmForInventoryItem('item2', [linked], [])).toBeNull();
  });
});

describe('intervalos', () => {
  const plan = { warmupS: 60, workS: 30, restS: 15, repeats: 3, cooldownS: 60 };
  const at = (p: typeof plan | (typeof plan & { workM: number }), s: number, m = 0, from: RunState = START_STATE) => advance(p, from, s, m);
  it('arma las etapas en orden y no pone descanso después de la última repetición', () => {
    expect(phases(plan).map((p) => `${p.kind}${p.round ?? ''}`)).toEqual(['warmup', 'work1', 'rest1', 'work2', 'rest2', 'work3', 'cooldown']);
    expect(planDurationS(plan)).toBe(60 + 30 * 3 + 15 * 2 + 60);
  });
  it('sin entrada en calor ni vuelta a la calma, salta esas etapas', () => {
    expect(phases({ ...plan, warmupS: 0, cooldownS: 0 })).toHaveLength(5);
  });
  it('por tiempo: dice la etapa y cuánto falta, y pasa a la siguiente en el borde', () => {
    expect(at(plan, 0)).toMatchObject({ phase: { kind: 'warmup' }, remaining: 60, unit: 's', done: false });
    expect(at(plan, 59.5).remaining).toBe(1);
    expect(at(plan, 60)).toMatchObject({ state: { index: 1 }, remaining: 30 });
    // Un salto grande (la app estuvo en segundo plano) pasa varias etapas de una vez: 60+30+15 = 105 empieza el trabajo 2.
    expect(at(plan, 105)).toMatchObject({ state: { index: 3 }, remaining: 30 });
    expect(at(plan, planDurationS(plan))).toMatchObject({ done: true, phase: null });
  });
  it('por distancia: el trabajo termina al recorrer los metros, vaya rápido o lento', () => {
    const track = { warmupS: 0, workS: 0, workM: 400, restS: 90, repeats: 2, cooldownS: 0 };
    expect(phases(track).map((p) => `${p.kind}${p.distanceM ?? ''}`)).toEqual(['work400', 'rest', 'work400']);
    expect(usesDistance(track)).toBe(true);
    expect(usesDistance(plan)).toBe(false);
    const r1 = at(track, 30, 150);
    expect(r1).toMatchObject({ phase: { kind: 'work' }, remaining: 250, unit: 'm' });
    // A los 400 m empieza el descanso de 90 s, que cuenta desde ese momento (110 s de la sesión).
    const r2 = at(track, 110, 400, r1.state);
    expect(r2).toMatchObject({ phase: { kind: 'rest' }, remaining: 90, unit: 's', state: { index: 1, startedS: 110, startedM: 400 } });
    const r3 = at(track, 150, 450, r2.state);
    expect(r3.remaining).toBe(50);
    const r4 = at(track, 200, 450, r3.state);
    expect(r4).toMatchObject({ phase: { kind: 'work' }, remaining: 400, unit: 'm' });
    expect(at(track, 400, 850, r4.state).done).toBe(true);
  });
  it('lee tiempos y valida planes (también los de distancia)', () => {
    expect(parseClock('1:30')).toBe(90);
    expect(parseClock('90')).toBe(90);
    expect(parseClock('1:75')).toBeNull();
    expect(parseClock('')).toBeNull();
    expect(validPlan(plan)).toBe(true);
    expect(validPlan({ ...plan, repeats: 0 })).toBe(false);
    expect(validPlan({ ...plan, workS: 2 })).toBe(false);
    expect(validPlan({ ...plan, workS: 0, workM: 400 } as typeof plan)).toBe(true);
    expect(validPlan({ ...plan, workS: 0, workM: 10 } as typeof plan)).toBe(false);
    expect(describePlan({ ...plan, warmupS: 0, cooldownS: 0 }, (s) => `${s}s`)).toBe('3 × 30s / 15s');
    expect(describePlan({ warmupS: 0, workS: 0, workM: 400, restS: 90, repeats: 8, cooldownS: 0 }, (s) => `${s}s`)).toBe('8 × 400 m / 90s');
  });
});

describe('zonas privadas', () => {
  // Una calle de oeste a este: un punto cada ~11 m sobre el mismo paralelo, desde la casa.
  const street: TrackPoint[] = Array.from({ length: 100 }, (_, i) => [-41, -71 + i * 0.0001, 100]);
  const home = { lat: -41, lon: -71, radiusM: 200 };
  it('saca los puntos dentro del radio y deja el resto', () => {
    const out = removeZones([street], [home]);
    expect(out).toHaveLength(1);
    const first = out[0]![0]!;
    expect(first[1]).toBeGreaterThan(-71 + 0.002); // ~200 m al este de la casa
    for (const p of out.flat()) expect(distanceMeters({ lat: p[0], lon: p[1] }, home)).toBeGreaterThan(200);
  });
  it('si la zona está en el medio, parte el recorrido en dos y no deja una línea que la cruce', () => {
    const mid = { lat: -41, lon: -71 + 50 * 0.0001, radiusM: 100 };
    const out = removeZones([street], [mid]);
    expect(out).toHaveLength(2);
    expect(out[0]!.at(-1)![1]).toBeLessThan(mid.lon);
    expect(out[1]![0]![1]).toBeGreaterThan(mid.lon);
  });
  it('un salto del GPS de un lado al otro de la zona también corta', () => {
    const jump: TrackPoint[] = [[-41, -71.01, null], [-41, -70.99, null], [-41, -70.98, null]];
    expect(removeZones([jump], [{ lat: -41, lon: -71, radiusM: 100 }])).toEqual([[jump[1]!, jump[2]!]]);
  });
  it('sin zonas no cambia nada; el payload usa las zonas', () => {
    expect(removeZones([street], [])).toEqual([street]);
    const workout = { id: 'w', outingId: 'o', trackId: 't', startedAt: '2026-11-01T10:00:00Z', kind: 'walk', distanceM: 1000, totalS: 600, movingS: 600, ascentM: 0, descentM: 0, calories: 0, maxEle: null, minEle: null } as unknown as Workout;
    const track = { id: 't', segments: [street] } as unknown as Track;
    const withZone = buildSharePayload({ id: 'o', name: 'x', createdAt: '2026-11-01' } as unknown as Outing, [workout], new Map([['t', track]]), 'es', 0, [home]);
    const without = buildSharePayload({ id: 'o', name: 'x', createdAt: '2026-11-01' } as unknown as Outing, [workout], new Map([['t', track]]), 'es', 0, []);
    expect(without.route.flat().length).toBeGreaterThan(withZone.route.flat().length);
    expect(withZone.distanceM).toBe(1000); // los totales no se recalculan
  });
});

describe('seguimiento en vivo: qué se manda', () => {
  const walk = (n: number, lon = -71): TrackPoint[] => Array.from({ length: n }, (_, i) => [-41, lon + i * 0.0001, 100, 1_800_000_000 + i * 10] as TrackPoint);
  it('el primer envío lleva todo y abre un tramo; el siguiente solo lo nuevo, sin abrir otro', () => {
    const seg = walk(5);
    const first = buildChunks([seg], { seg: 0, pt: 0 }, [], 1_800_000_100);
    expect(first.chunks).toHaveLength(1);
    expect(first.chunks[0]).toMatchObject({ newSegment: true });
    expect(first.chunks[0]!.points).toHaveLength(5);
    expect(first.next).toEqual({ seg: 0, pt: 5 });
    const more = [...seg, ...walk(3, -70.9)];
    const second = buildChunks([more], first.next, [], 1_800_000_200);
    expect(second.chunks).toHaveLength(1);
    expect(second.chunks[0]).toMatchObject({ newSegment: false });
    expect(second.chunks[0]!.points).toHaveLength(3);
    // Sin nada nuevo no manda trozos.
    expect(buildChunks([more], second.next, [], 1_800_000_300).chunks).toEqual([]);
  });
  it('un punto solo también se manda (la última posición importa)', () => {
    const seg = walk(3);
    const r = buildChunks([seg], { seg: 0, pt: 2 }, [], 0);
    expect(r.chunks).toHaveLength(1);
    expect(r.chunks[0]!.points).toHaveLength(1);
    expect(r.chunks[0]!.newSegment).toBe(false);
  });
  it('un corte (tramo nuevo) abre tramo en el servidor', () => {
    const a = walk(3);
    const b = walk(2, -70.5);
    const r = buildChunks([a, b], { seg: 0, pt: 3 }, [], 0);
    expect(r.chunks).toHaveLength(1);
    expect(r.chunks[0]).toMatchObject({ newSegment: true });
    expect(r.next).toEqual({ seg: 1, pt: 2 });
  });
  it('las zonas privadas no se mandan y cortan el tramo', () => {
    const seg = walk(60); // ~660 m hacia el este
    const zone = { lat: -41, lon: -71 + 30 * 0.0001, radiusM: 100 };
    const r = buildChunks([seg], { seg: 0, pt: 0 }, [zone], 0);
    expect(r.chunks.length).toBeGreaterThanOrEqual(2);
    for (const c of r.chunks) for (const p of c.points) expect(distanceMeters({ lat: p[0], lon: p[1] }, zone)).toBeGreaterThan(100);
    expect(r.chunks.slice(1).every((c) => c.newSegment)).toBe(true);
    // Todo dentro de la zona: no se manda nada, pero se avanza.
    const inside = buildChunks([walk(5)], { seg: 0, pt: 0 }, [{ lat: -41, lon: -71, radiusM: 500 }], 0);
    expect(inside.chunks).toEqual([]);
    expect(inside.next).toEqual({ seg: 0, pt: 5 });
  });
  it('si entre el último punto mandado y el nuevo hay una zona, no los une', () => {
    const seg: TrackPoint[] = [[-41, -71.01, null, 1], [-41, -70.99, null, 2]];
    const r = buildChunks([seg], { seg: 0, pt: 1 }, [{ lat: -41, lon: -71, radiusM: 100 }], 0);
    expect(r.chunks).toHaveLength(1);
    expect(r.chunks[0]).toMatchObject({ newSegment: true });
  });
});

describe('vueltas', () => {
  it('pasa de marcas acumuladas a vueltas sueltas, con ritmo, y marca la más rápida y la más lenta', () => {
    const rows = lapRows([
      { elapsedS: 300, distanceM: 1000 },
      { elapsedS: 570, distanceM: 2000 }, // 270 s: la más rápida
      { elapsedS: 900, distanceM: 3000 }, // 330 s: la más lenta
    ]);
    expect(rows.map((r) => r.timeS)).toEqual([300, 270, 330]);
    expect(rows.map((r) => r.distanceM)).toEqual([1000, 1000, 1000]);
    expect(Math.round(rows[1]!.paceSPerKm)).toBe(270);
    expect(fastestSlowest(rows)).toEqual({ fastest: 2, slowest: 3 });
    expect(fastestSlowest(rows.slice(0, 1))).toBeNull();
    expect(lapRows(undefined)).toEqual([]);
  });
  it('una vuelta sin distancia no tiene ritmo', () => {
    expect(lapRows([{ elapsedS: 60, distanceM: 0 }])[0]!.paceSPerKm).toBe(0);
  });
});

describe('herramientas de entrenamiento', () => {
  it('lee y muestra duraciones', () => {
    expect(parseDuration('1:05:30')).toBe(3930);
    expect(parseDuration('25:10')).toBe(1510);
    expect(parseDuration('90')).toBe(90);
    expect(parseDuration('1:75')).toBeNull();
    expect(parseDuration('abc')).toBeNull();
    expect(parseDuration('')).toBeNull();
    expect(formatDuration(3930)).toBe('1:05:30');
    expect(formatDuration(1510)).toBe('25:10');
  });
  it('ritmo y velocidad de 10 km en 55:00', () => {
    const r = paceOf(10, 3300)!;
    expect(r.paceSPerKm).toBe(330);
    expect(r.speedKmh).toBeCloseTo(10.909, 2);
    expect(paceOf(0, 100)).toBeNull();
    expect(timeAtPace(21.0975, 330)).toBeCloseTo(6962.2, 0);
  });
  it('Riegel: de 10 km en 55:00 estima el medio maratón en poco más de 2 h', () => {
    const half = riegel(10, 3300, 21.0975)!;
    expect(half).toBeGreaterThan(7200); // más de 2 h
    expect(half).toBeLessThan(7500);
    expect(riegel(10, 3300, 10)).toBeCloseTo(3300, 5);
    expect(riegel(0, 3300, 10)).toBeNull();
  });
  it('zonas de pulso: por porcentaje del máximo y por reserva (Karvonen)', () => {
    expect(maxHrFromAge(40)).toBe(180);
    expect(maxHrFromAge(5)).toBeNull();
    const byMax = hrZones(180)!;
    expect(byMax).toHaveLength(5);
    expect(byMax[0]).toMatchObject({ n: 1, fromBpm: 90, toBpm: 108 });
    expect(byMax[4]).toMatchObject({ n: 5, fromBpm: 162, toBpm: 180 });
    const kar = hrZones(180, 60)!; // reserva 120: zona 1 desde 60 + 0,5×120 = 120
    expect(kar[0]).toMatchObject({ fromBpm: 120, toBpm: 132 });
    expect(kar[4]!.toBpm).toBe(180);
    expect(hrZones(50)).toBeNull();
    expect(hrZones(180, 190)![0]!.fromBpm).toBe(90); // un reposo que no sirve se ignora
  });
  it('cronómetro: formato con centésimas y parciales de vuelta', () => {
    expect(formatStopwatch(0)).toBe('0:00.00');
    expect(formatStopwatch(65_370)).toBe('1:05.37');
    expect(formatStopwatch(3_723_400)).toBe('1:02:03.40');
    expect(stopwatchLaps([30_000, 75_000])).toEqual([
      { n: 1, splitMs: 30_000, totalMs: 30_000 },
      { n: 2, splitMs: 45_000, totalMs: 75_000 },
    ]);
  });
  it('el cronómetro y el temporizador calculan con la hora del reloj', () => {
    expect(elapsedMs({ startedAt: 1000, accumulatedMs: 500 }, 4000)).toBe(3500);
    expect(elapsedMs({ startedAt: null, accumulatedMs: 500 }, 4000)).toBe(500);
    expect(timerLeftMs({ endsAt: 10_000, leftMs: 0 }, 4000)).toBe(6000);
    expect(timerLeftMs({ endsAt: 10_000, leftMs: 0 }, 12_000)).toBe(0);
    expect(timerLeftMs({ endsAt: null, leftMs: 2500 }, 4000)).toBe(2500);
  });
});

describe('respiración al correr', () => {
  const p = (id: 'p32' | 'p22' | 'p21' | 'p11') => patternById(id);
  it('respiraciones por minuto según la cadencia y el patrón', () => {
    expect(breathing(170, p('p32'))).toEqual({ stepsPerBreath: 5, breathsPerMin: 34 });
    expect(breathing(180, p('p22'))).toEqual({ stepsPerBreath: 4, breathsPerMin: 45 });
    expect(breathing(180, p('p21'))).toEqual({ stepsPerBreath: 3, breathsPerMin: 60 });
    expect(breathing(170, p('p11'))).toEqual({ stepsPerBreath: 2, breathsPerMin: 85 });
  });
  it('sugiere el patrón según el movimiento y el esfuerzo (caminando se respira más lento)', () => {
    expect(PATTERN_FOR.run).toEqual({ easy: 'p32', moderate: 'p22', hard: 'p21', max: 'p11' });
    expect(PATTERN_FOR.walk.easy).toBe('p33');
    expect(breathing(110, patternById('p33'))).toEqual({ stepsPerBreath: 6, breathsPerMin: 18.3 });
  });
  it('caminata, trote y correr: rangos ordenados, atajos dentro del rango y arranque en el rango', () => {
    expect(CADENCE_CATEGORIES.map((c) => c.id)).toEqual(['walk', 'jog', 'run']);
    for (const c of CADENCE_CATEGORIES) {
      expect(c.from).toBeLessThan(c.to);
      expect(c.start).toBeGreaterThanOrEqual(c.from);
      expect(c.start).toBeLessThanOrEqual(c.to);
      for (const p of c.presets) expect(p >= c.from && p <= c.to, `${c.id}: ${p}`).toBe(true);
    }
    // La caminata es bastante más lenta que correr.
    expect(cadenceInfo('walk').to).toBeLessThan(cadenceInfo('jog').from);
  });
  it('3:2 inhala tres pasos y exhala dos; el primero de cada fase lleva el acento', () => {
    const seq = Array.from({ length: 10 }, (_, i) => breathPhaseAt(i, p('p32')));
    expect(seq.map((x) => x.phase[0]).join('')).toBe('iiieeiiiee');
    expect(seq.filter((x) => x.first).map((x, i) => x.phase + i)).toEqual(['inhale0', 'exhale1', 'inhale2', 'exhale3']);
    expect(breathPhaseAt(-1, p('p32'))).toEqual({ phase: 'exhale', first: false });
  });
});

describe('temporizador: ajustar con las flechas', () => {
  it('suma y resta con límites de 1 s a 3 h', () => {
    expect(clampTimer(0)).toBe(1);
    expect(clampTimer(-50)).toBe(1);
    expect(clampTimer(300)).toBe(300);
    expect(clampTimer(99_999)).toBe(TIMER_MAX_S);
    useTimer.getState().set(300);
    useTimer.getState().adjust(60);
    expect(useTimer.getState().totalS).toBe(360);
    useTimer.getState().adjust(-5);
    expect(useTimer.getState().totalS).toBe(355);
    expect(timerLeftMs(useTimer.getState())).toBe(355_000);
    useTimer.getState().adjust(-10_000);
    expect(useTimer.getState().totalS).toBe(1);
    // Corriendo, no se puede cambiar.
    useTimer.getState().set(120);
    useTimer.getState().start();
    useTimer.getState().adjust(60);
    expect(useTimer.getState().totalS).toBe(120);
    useTimer.getState().reset();
  });
});
