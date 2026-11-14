import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FORECAST_MODELS, fetchForecasts, parseRun, summarize, type StationForecast } from './forecast';
import type { RiversData } from './rivers';

const rivers = JSON.parse(readFileSync(new URL('../../../public/data/rivers-AR.json', import.meta.url), 'utf8')) as RiversData;
const T0 = Date.parse('2026-11-13T03:00:00Z');
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

// Una corrida como la de tabprono_central: una serie por estación, tres líneas por fecha.
const run = (values: number[], lo = -0.3, hi = 0.4) => [
  {
    forecast_date: iso(T0),
    series: [
      {
        estacion_id: 34,
        pronosticos: values.flatMap((v, i) => [
          { timestart: iso(T0 + i * DAY), valor: v, qualifier: 'medio' },
          { timestart: iso(T0 + i * DAY), valor: v + lo, qualifier: 'inferior' },
          { timestart: iso(T0 + i * DAY), valor: v + hi, qualifier: 'superior' },
        ]),
      },
    ],
  },
];

describe('pronóstico de ríos del INA', () => {
  it('lee la línea principal y la banda de cada estación', () => {
    const m = FORECAST_MODELS[0]!;
    const out = parseRun(run([3, 3.5, 4]), m, T0);
    const f = out.get(34)!;
    expect(f.cal).toBe(289);
    expect(f.points).toHaveLength(3);
    expect(f.points[1]).toEqual({ t: T0 + DAY, main: 3.5, lo: 3.2, hi: 3.9 });
    expect(f.issued).toBe(T0);
  });

  it('adelgaza los modelos horarios a un punto cada 3 horas y conserva el último', () => {
    const m = FORECAST_MODELS.find((x) => x.cal === 432)!;
    const raw = [{ forecast_date: iso(T0), series: [{ estacion_id: 52, pronosticos: Array.from({ length: 49 }, (_, i) => ({ timestart: iso(T0 + i * 3_600_000), valor: 1 + i / 100, qualifier: 'main' })) }] }];
    const f = parseRun(raw, m, T0).get(52)!;
    expect(f.points.length).toBe(17); // 0, 3, 6 … 48 h
    expect(f.points[f.points.length - 1]!.t).toBe(T0 + 48 * 3_600_000);
    expect(f.points[0]!.lo).toBeNull();
  });

  it('descarta valores vacíos y corridas sin datos', () => {
    const m = FORECAST_MODELS[0]!;
    expect(parseRun([], m).size).toBe(0);
    const raw = run([3, 3.5]);
    raw[0]!.series[0]!.pronosticos.push({ timestart: iso(T0 + 5 * DAY), valor: null as unknown as number, qualifier: 'medio' });
    expect(parseRun(raw, m, T0).get(34)!.points).toHaveLength(2);
  });

  it('el resumen dice el máximo y cuándo llega a un umbral, o solo la banda lo alcanza', () => {
    const f = parseRun(run([3.0, 3.2, 3.4, 3.1]), FORECAST_MODELS[0]!, T0).get(34)!;
    const s = summarize(f, { alert: 3.3, evac: 3.9, low: 0.2 }, T0)!;
    expect(s.peak).toEqual({ t: T0 + 2 * DAY, v: 3.4 });
    expect(s.first).toEqual({ kind: 'alert', t: T0 + 2 * DAY, band: false });
    // Con umbral más alto, solo la banda superior (+0,4) llega.
    const b = summarize(f, { alert: 3.7, evac: null, low: null }, T0)!;
    expect(b.first).toEqual({ kind: 'alert', t: T0 + 2 * DAY, band: true });
    expect(summarize(f, { alert: 9, evac: 9, low: null }, T0)!.first).toBeNull();
    // Aguas bajas por la banda inferior.
    expect(summarize(f, { alert: null, evac: null, low: 2.8 }, T0)!.first).toMatchObject({ kind: 'low', band: true });
  });

  it('si la línea principal llega a un nivel, se informa ese aunque la banda llegue antes a otro más grave', () => {
    // Alerta 3,3 (la principal llega el día 2) y evacuación 3,7 (la banda alta, +0,4, ya llega el día 2: 3,4 + 0,4 = 3,8).
    const f = parseRun(run([3.0, 3.2, 3.4, 3.1]), FORECAST_MODELS[0]!, T0).get(34)!;
    const s = summarize(f, { alert: 3.3, evac: 3.7, low: null }, T0)!;
    expect(s.first).toEqual({ kind: 'alert', t: T0 + 2 * DAY, band: false });
  });

  it('solo mira hacia adelante: lo ya pasado no cuenta', () => {
    const f = parseRun(run([5, 3, 3.1, 3.2]), FORECAST_MODELS[0]!, T0).get(34)!;
    const s = summarize(f, { alert: 4, evac: null, low: null }, T0 + 1.5 * DAY)!;
    expect(s.peak.v).toBe(3.2);
    expect(s.first).toBeNull();
  });

  it('pide solo los modelos que necesitan las estaciones y elige el mejor disponible', async () => {
    const urls: string[] = [];
    const fake = (async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify(url.includes('/289/') ? run([3, 3.5]) : []));
    }) as unknown as typeof fetch;
    const rosario = rivers.stations.find((s) => s.name === 'Rosario')!;
    const out = await fetchForecasts([rosario], fake);
    expect(urls).toEqual(['https://alerta.ina.gob.ar/a5/sim/calibrados/289/corridas?includeProno=true']);
    expect(out.get(34)?.cal).toBe(289);
    const sinPron = rivers.stations.find((s) => !s.forecast)!;
    expect((await fetchForecasts([sinPron], fake)).size).toBe(0);
  });

  it('el modelo del Delta usa su propia banda (error_band_01 a error_band_99) y cubre Campana y Zárate', () => {
    const m = FORECAST_MODELS.find((x) => x.cal === 489)!;
    const raw = [{ forecast_date: iso(T0), series: [{ estacion_id: 41, pronosticos: [0, 1].flatMap((i) => [
      { timestart: iso(T0 + i * DAY), valor: 1 + i, qualifier: 'main' },
      { timestart: iso(T0 + i * DAY), valor: 0.5 + i, qualifier: 'error_band_01' },
      { timestart: iso(T0 + i * DAY), valor: 1.6 + i, qualifier: 'error_band_99' },
    ]) }] }];
    expect(parseRun(raw, m, T0).get(41)!.points[1]).toEqual({ t: T0 + DAY, main: 2, lo: 1.5, hi: 2.6 });
    const names = rivers.stations.filter((s) => s.forecast?.includes(489)).map((s) => s.name);
    expect(names).toEqual(expect.arrayContaining(['Campana', 'Paraná Las Palmas - Zárate']));
  });

  it('el catálogo marca las estaciones con pronóstico con modelos que la app conoce', () => {
    const withF = rivers.stations.filter((s) => s.forecast);
    expect(withF.length).toBeGreaterThanOrEqual(15);
    const known = new Set(FORECAST_MODELS.map((m) => m.cal));
    for (const s of withF) for (const c of s.forecast!) expect(known.has(c)).toBe(true);
    expect(rivers.stations.find((s) => s.name === 'San Fernando')!.forecast).toEqual([432]);
  });
});

export type { StationForecast };
