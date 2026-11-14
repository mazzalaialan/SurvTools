import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { openDb } from '../src/db.ts';
import type { PushPayload, PushSender, PushSubscriptionJson } from '../src/push.ts';
import { crossings, fetchForecasts, parseRun, stationsBySeries, FORECAST_MODELS, type StationForecast } from '../src/rivers/forecast.ts';
import { runRiverForecastWatch, type RiverLevel, type RiverStation } from '../src/rivers/watch.ts';

class FakePush implements PushSender {
  publicKey = 'k';
  sent: PushPayload[] = [];
  async send(_s: PushSubscriptionJson, payload: PushPayload) {
    this.sent.push(payload);
    return true;
  }
}

const sub = JSON.stringify({ endpoint: 'https://push.example.com/x', keys: { p256dh: 'p', auth: 'a' } });
const now = new Date('2026-11-14T15:00:00Z');
const DAY = 86_400_000;
// Rosario (estación 34, serie 34): alerta 5,00 m, evacuación 5,25 m, aguas bajas 1,64 m; pronóstico del modelo 289.
const rosario: RiverStation = { id: 34, name: 'Rosario', river: 'Paraná inferior', lat: -32.9433, lon: -60.6308, alert: 5, evac: 5.25, low: 1.64, series: 34, forecast: [289] };
const fc = (values: number[]): Map<number, StationForecast> =>
  new Map([[34, { stationId: 34, cal: 289, issued: now.getTime(), points: values.map((value, i) => ({ t: now.getTime() + i * DAY, value })) }]]);
const lvl = (level: number): Map<number, RiverLevel> => new Map([[34, { level, at: new Date(now.getTime() - 30 * 60_000).toISOString() }]]);

function setup(lat = -32.95, lon = -60.64) {
  const db = openDb(':memory:');
  db.prepare(`INSERT INTO devices (id, token_hash, subscription, timezone, notify_hour, language, hazards, created_at, updated_at) VALUES ('d', 'h', ?, 'America/Argentina/Buenos_Aires', 9, 'es', 1, '', '')`).run(sub);
  db.prepare(`INSERT INTO rain_places (device_id, place_id, label, lat, lon) VALUES ('d', 'w1', 'Muelle', ?, ?)`).run(lat, lon);
  return db;
}

describe('pronóstico del INA para avisar', () => {
  it('lee la línea principal de una corrida y descarta la banda', () => {
    const m = FORECAST_MODELS[0]!;
    const raw = [{ forecast_date: now.toISOString(), series: [{ estacion_id: 34, pronosticos: [
      { timestart: now.toISOString(), valor: 4, qualifier: 'medio' },
      { timestart: now.toISOString(), valor: 3.7, qualifier: 'inferior' },
      { timestart: new Date(now.getTime() + DAY).toISOString(), valor: 4.5, qualifier: 'medio' },
      { timestart: new Date(now.getTime() + DAY).toISOString(), valor: 4.9, qualifier: 'superior' },
    ] }] }];
    const f = parseRun(raw, m).get(34)!;
    assert.deepEqual(f.points.map((p) => p.value), [4, 4.5]);
    assert.equal(parseRun([], m).size, 0);
  });

  it('la API real: con includeProno=true las series no traen estacion_id; se une por series_id con la corrida liviana', async () => {
    const urls: string[] = [];
    const t = (d: number) => new Date(now.getTime() + d * DAY).toISOString();
    const fake = (async (url: string) => {
      urls.push(url);
      const full = url.endsWith('true');
      const series = full
        ? [{ series_id: 1540, pronosticos: [0, 1].flatMap((i) => [{ timestart: t(i), valor: 5 + i, qualifier: 'medio' }, { timestart: t(i), valor: 4, qualifier: 'inferior' }]) }]
        : [{ series_id: 1540, var_id: 2, estacion_id: 34, pronosticos: [] }, { series_id: 99, var_id: 4, estacion_id: 34, pronosticos: [] }];
      return new Response(JSON.stringify([{ forecast_date: now.toISOString(), series }]));
    }) as unknown as typeof fetch;
    const out = await fetchForecasts([rosario], fake);
    assert.deepEqual(urls.sort(), ['https://alerta.ina.gob.ar/a5/sim/calibrados/289/corridas?includeProno=false', 'https://alerta.ina.gob.ar/a5/sim/calibrados/289/corridas?includeProno=true']);
    assert.deepEqual(out.get(34)!.points.map((p) => p.value), [5, 6]);
    // Sin el mapa no se sabe de quién es la serie.
    assert.equal(parseRun([{ forecast_date: now.toISOString(), series: [{ series_id: 1540, pronosticos: [{ timestart: t(0), valor: 1, qualifier: 'medio' }, { timestart: t(1), valor: 2, qualifier: 'medio' }] }] }], FORECAST_MODELS[0]!).size, 0);
    assert.deepEqual([...stationsBySeries([{ forecast_date: '', series: [{ series_id: 1, var_id: 2, estacion_id: 34, pronosticos: [] }, { series_id: 2, var_id: 4, estacion_id: 34, pronosticos: [] }] }])], [[1, 34]]);
  });

  it('los cruces: la crecida más grave y la bajante, solo hacia adelante y dentro de 7 días', () => {
    const c = crossings(fc([4.5, 5.1, 5.3, 4.0]).get(34)!, rosario, now.getTime());
    assert.equal(c.high?.kind, 'evac'); // llega a 5,30 ≥ 5,25 el día 2
    assert.equal(c.high?.t, now.getTime() + 2 * DAY);
    assert.equal(c.low, null);
    assert.equal(crossings(fc([4.5, 4.6]).get(34)!, rosario, now.getTime()).high, null);
    assert.equal(crossings(fc([4.5, 1.5]).get(34)!, rosario, now.getTime()).low?.kind, 'low');
    // Más allá de 7 días no avisa.
    assert.equal(crossings(fc([4, 4, 4, 4, 4, 4, 4, 4, 4, 5.5]).get(34)!, rosario, now.getTime()).high, null);
  });
});

describe('aviso anticipado de crecida', () => {
  it('avisa una vez cuando el pronóstico llega a la alerta y el río hoy está normal, y no repite', async () => {
    const db = setup();
    const push = new FakePush();
    const r1 = await runRiverForecastWatch(db, push, [rosario], fc([4.4, 4.7, 5.1, 4.9]), lvl(4.4), now);
    assert.equal(r1.sent, 1);
    const river = push.sent[0]!.river!;
    assert.equal(push.sent[0]!.type, 'river');
    assert.equal(river.forecast, true);
    assert.equal(river.state, 'alert');
    assert.equal(river.threshold, 5);
    assert.equal(river.level, 5.1);
    assert.equal(river.at, new Date(now.getTime() + 2 * DAY).toISOString());
    assert.equal(river.station, 'Rosario');
    // Mismo pronóstico en la siguiente vuelta: no repite.
    assert.equal((await runRiverForecastWatch(db, push, [rosario], fc([4.4, 4.7, 5.1, 4.9]), lvl(4.5), now)).sent, 0);
    // Si el pronóstico agrega la evacuación, es más grave: avisa de nuevo.
    assert.equal((await runRiverForecastWatch(db, push, [rosario], fc([4.4, 4.7, 5.1, 5.4]), lvl(4.5), now)).sent, 1);
    assert.equal(push.sent[1]!.river!.state, 'evac');
  });

  it('cuando el pronóstico deja de cruzar se olvida lo avisado y otro pronóstico futuro avisa de nuevo', async () => {
    const db = setup();
    const push = new FakePush();
    await runRiverForecastWatch(db, push, [rosario], fc([4.4, 5.1]), lvl(4.4), now);
    await runRiverForecastWatch(db, push, [rosario], fc([4.4, 4.5]), lvl(4.4), now);
    assert.equal((await runRiverForecastWatch(db, push, [rosario], fc([4.4, 5.2]), lvl(4.4), now)).sent, 1);
    assert.equal(push.sent.length, 2);
  });

  it('si el río ya está en alerta no avisa la alerta (lo hace el aviso en vivo), pero sí que llegará a evacuación', async () => {
    const db = setup();
    const push = new FakePush();
    assert.equal((await runRiverForecastWatch(db, push, [rosario], fc([5.1, 5.2]), lvl(5.1), now)).sent, 0);
    const r = await runRiverForecastWatch(db, push, [rosario], fc([5.1, 5.4]), lvl(5.1), now);
    assert.equal(r.sent, 1);
    assert.equal(push.sent[0]!.river!.state, 'evac');
  });

  it('avisa de aguas bajas pronosticadas con otra clave que la crecida', async () => {
    const db = setup();
    const push = new FakePush();
    const r = await runRiverForecastWatch(db, push, [rosario], fc([2.0, 1.8, 1.5]), lvl(2.0), now);
    assert.equal(r.sent, 1);
    assert.equal(push.sent[0]!.river!.state, 'low');
    assert.equal(push.sent[0]!.river!.forecast, true);
  });

  it('no avisa si el lugar está a más de 5 km de la estación', async () => {
    const db = setup(-33.2, -60.64);
    const push = new FakePush();
    assert.equal((await runRiverForecastWatch(db, push, [rosario], fc([4.4, 5.3]), lvl(4.4), now)).sent, 0);
  });
});
