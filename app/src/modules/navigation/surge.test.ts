import { describe, expect, it } from 'vitest';
import { fetchSurge, nearSurgePoints, parseSurge, surgeAt, surgeSummary } from './surge';

const T0 = Date.parse('2026-11-15T06:00:00Z');
const H = 3_600_000;
/** Como la API real: la liviana trae estacion_id y var_id sin datos; la completa, los datos con solo series_id. */
const meta = [
  { forecast_date: '2026-11-15T06:00:00.000Z', series: [
    { series_id: 6047, estacion_id: 1831, var_id: 36, pronosticos: [] },
    { series_id: 6048, estacion_id: 1832, var_id: 36, pronosticos: [] },
    { series_id: 6060, estacion_id: 1831, var_id: 2, pronosticos: [] },
  ] },
];
const serie = (id: number, vals: number[]) => ({ series_id: id, pronosticos: vals.map((v, i) => ({ timestart: new Date(T0 + i * H).toISOString(), valor: v, qualifier: 'main' })) });
const full = [{ forecast_date: '2026-11-15T06:00:00.000Z', series: [serie(6047, [-0.2, 0, 0.2, 0.4]), serie(6048, [-0.4, 0, 0.2, 0.2]), serie(6060, [1.2, 1.1, 1.0, 0.9])] }];

describe('sobreelevación meteorológica del INA', () => {
  it('promedia los puntos de la variable 36 y deja afuera la altura total (variable 2)', () => {
    const s = parseSurge(meta, full, T0)!;
    expect(s.points).toHaveLength(4);
    expect(s.points.map((p) => +p.v.toFixed(2))).toEqual([-0.3, 0, 0.2, 0.3]);
    expect(s.issued).toBe(T0);
    expect(parseSurge([], full)).toBeNull();
    expect(parseSurge(meta, [])).toBeNull();
  });

  it('interpola entre horas y no inventa fuera del período', () => {
    const s = parseSurge(meta, full, T0)!;
    expect(surgeAt(s, T0 + H / 2)).toBeCloseTo(-0.15, 5);
    expect(surgeAt(s, T0 - 1)).toBeNull();
    expect(surgeAt(s, T0 + 4 * H)).toBeNull();
  });

  it('resume lo que viene: ahora, máxima y mínima (sin contar lo ya pasado)', () => {
    const s = parseSurge(meta, full, T0)!;
    const sum = surgeSummary(s, T0 + 2 * H)!;
    expect(sum.now).toBeCloseTo(0.2, 5);
    expect(sum.max).toMatchObject({ t: T0 + 3 * H });
    expect(sum.min.t).toBe(T0 + 1 * H); // la hora de atrás todavía cuenta como «ahora»
    expect(surgeSummary(s, T0 + 10 * H)).toBeNull();
  });

  it('solo vale cerca de los puntos del modelo (Delta y costa norte)', () => {
    expect(nearSurgePoints(-34.6, -58.4)).toBe(true); // Buenos Aires
    expect(nearSurgePoints(-34.46, -57.84)).toBe(true); // Colonia
    expect(nearSurgePoints(-34.9, -54.95)).toBe(false); // Punta del Este
    expect(nearSurgePoints(-38, -57.5)).toBe(false); // Mar del Plata
  });

  it('pide las dos variantes y devuelve la sobreelevación', async () => {
    const urls: string[] = [];
    const fake = (async (url: string) => {
      urls.push(String(url));
      return { ok: true, json: async () => (String(url).includes('includeProno=true') ? full : meta) };
    }) as unknown as typeof fetch;
    const s = await fetchSurge(fake);
    expect(urls.sort()).toEqual(['https://alerta.ina.gob.ar/a5/sim/calibrados/308/corridas?includeProno=false', 'https://alerta.ina.gob.ar/a5/sim/calibrados/308/corridas?includeProno=true']);
    expect(s?.points).toHaveLength(4);
  });
});
