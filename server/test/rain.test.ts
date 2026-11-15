import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { openDb, type Db } from '../src/db.ts';
import type { PushPayload, PushSender, PushSubscriptionJson } from '../src/push.ts';
import { rainOutlook, type RainOutlook } from '../src/rain/outlook.ts';
import { openMeteoSource, type RainPoint, type RainSource } from '../src/rain/source.ts';
import { checkObservedRain } from '../src/rain/noaaWatch.ts';
import { runRainWatch } from '../src/rain/watch.ts';

class FakePush implements PushSender {
  publicKey = 'k';
  sent: PushPayload[] = [];
  gone = false;
  async send(_s: PushSubscriptionJson, payload: PushPayload) {
    if (this.gone) return false;
    this.sent.push(payload);
    return true;
  }
}

/** Fuente de prueba: lo que devuelve se cambia entre pasadas. */
class FakeSource implements RainSource {
  name = 'fake';
  outlook: RainOutlook | null = { state: 'dry' };
  asked: RainPoint[][] = [];
  async outlooks(points: RainPoint[]) {
    this.asked.push(points);
    return points.map(() => this.outlook);
  }
}

const subscription = { endpoint: 'https://push.example.com/abc', keys: { p256dh: 'p', auth: 'a' } };
const prefs = { timezone: 'America/Argentina/Buenos_Aires', notifyHour: 9, language: 'es' };
const NOW = new Date('2026-11-03T15:00:00Z');

let db: Db;
let push: FakePush;
let source: FakeSource;
let app: FastifyInstance;

async function register() {
  const res = await app.inject({ method: 'POST', url: '/api/devices', payload: { subscription, ...prefs } });
  return res.json() as { deviceId: string; token: string };
}

function putPlaces(deviceId: string, token: string, places: unknown[]) {
  return app.inject({ method: 'PUT', url: `/api/devices/${deviceId}/rain`, headers: { authorization: `Bearer ${token}` }, payload: { places } });
}

const refugio = { id: 'w1', label: 'Refugio', lat: -41.16789, lon: -71.43421 };

describe('avisos de lluvia', () => {
  beforeEach(async () => {
    db = openDb(':memory:');
    push = new FakePush();
    source = new FakeSource();
    app = await buildApp(loadConfig({}), db, push, false);
  });

  it('exige el token y guarda los lugares redondeados a ~1 km', async () => {
    const { deviceId, token } = await register();
    assert.equal((await putPlaces(deviceId, 'otro', [refugio])).statusCode, 401);
    assert.equal((await putPlaces(deviceId, token, [refugio])).statusCode, 204);
    const row = db.prepare('SELECT label, lat, lon FROM rain_places').get() as { label: string; lat: number; lon: number };
    assert.deepEqual({ ...row }, { label: 'Refugio', lat: -41.17, lon: -71.43 });
    assert.equal((await putPlaces(deviceId, token, [{ ...refugio, lat: 120 }])).statusCode, 400);
  });

  it('avisa una vez por episodio: no se repite si el pronóstico va y viene; sí si se intensifica o después de 3 horas secas', async () => {
    const { deviceId, token } = await register();
    await putPlaces(deviceId, token, [refugio]);

    await runRainWatch(db, push, source, NOW);
    assert.equal(push.sent.length, 0);

    source.outlook = { state: 'soon', inMinutes: 45, startsAt: '2026-11-03T15:45', mm: 3.14, peakMmH: 2 };
    await runRainWatch(db, push, source, NOW);
    assert.deepEqual(push.sent[0], {
      type: 'rain',
      rain: { placeId: 'w1', label: 'Refugio', state: 'soon', inMinutes: 45, mm: 3.1, fixAt: null, startsAt: NOW.getTime() + 45 * 60_000 },
    });

    // Empezó a llover: el aviso de «va a llover» se reemplaza (misma etiqueta, sin sonar) por «está lloviendo»; no es un aviso nuevo.
    source.outlook = { state: 'raining', mm: 5, peakMmH: 2 };
    await runRainWatch(db, push, source, NOW);
    assert.equal(push.sent.length, 2);
    assert.deepEqual((push.sent[1] as { rain: unknown }).rain, { placeId: 'w1', label: 'Refugio', state: 'raining', inMinutes: 0, mm: 5, fixAt: null, update: true });
    await runRainWatch(db, push, source, NOW); // ya está avisado: nada más
    assert.equal(push.sent.length, 2);

    // Mandar la lista de nuevo (p. ej. al abrir la app) no reinicia el episodio.
    await putPlaces(deviceId, token, [refugio]);
    await runRainWatch(db, push, source, NOW);
    assert.equal(push.sent.length, 2);

    source.outlook = null; // la fuente no respondió: no cambia nada
    await runRainWatch(db, push, source, NOW);
    const at = (min: number) => new Date(NOW.getTime() + min * 60_000);
    // Un rato seco (menos de 20 min) y vuelve la lluvia: es el mismo episodio, no se saca el aviso ni se repite.
    source.outlook = { state: 'dry' };
    await runRainWatch(db, push, source, at(15));
    source.outlook = { state: 'raining', mm: 2, peakMmH: 2 };
    await runRainWatch(db, push, source, at(30));
    assert.equal(push.sent.length, 2);

    // Se intensifica (de débil a fuerte): un aviso más, marcado como "se intensifica"; igual de fuerte, no.
    source.outlook = { state: 'raining', mm: 6, peakMmH: 12 };
    await runRainWatch(db, push, source, at(45));
    assert.equal(push.sent.length, 3);
    assert.equal((push.sent[2] as { rain: { stronger?: boolean } }).rain.stronger, true);
    await runRainWatch(db, push, source, at(60));
    assert.equal(push.sent.length, 3);

    // Para de llover: a los 20 minutos secos seguidos se saca el aviso (un solo «clear»); antes, no.
    source.outlook = { state: 'dry' };
    await runRainWatch(db, push, source, at(75));
    await runRainWatch(db, push, source, at(75 + 15));
    assert.equal(push.sent.length, 3);
    await runRainWatch(db, push, source, at(75 + 20));
    assert.equal(push.sent.length, 4);
    assert.deepEqual((push.sent[3] as { rain: unknown }).rain, { placeId: 'w1', label: 'Refugio', state: 'raining', inMinutes: 0, mm: 0, fixAt: null, clear: true });
    await runRainWatch(db, push, source, at(75 + 60)); // ya se sacó: nada más
    assert.equal(push.sent.length, 4);

    // Después de sacarlo, una lluvia nueva es un aviso nuevo.
    source.outlook = { state: 'soon', inMinutes: 30, startsAt: '2026-11-03T20:00', mm: 2, peakMmH: 2 };
    await runRainWatch(db, push, source, at(75 + 90));
    assert.equal(push.sent.length, 5);
    assert.equal((push.sent[4] as { rain: { state: string; startsAt: number } }).rain.state, 'soon');
    assert.equal((push.sent[4] as { rain: { startsAt: number } }).rain.startsAt, at(75 + 90).getTime() + 30 * 60_000);

    // Seco 3 horas seguidas: el episodio termina del todo; la próxima lluvia se avisa de nuevo y sin «se intensifica».
    source.outlook = { state: 'dry' };
    await runRainWatch(db, push, source, at(400));
    await runRainWatch(db, push, source, at(400 + 180));
    const before = push.sent.length;
    source.outlook = { state: 'raining', mm: 2, peakMmH: 2 };
    await runRainWatch(db, push, source, at(400 + 195));
    assert.equal(push.sent.length, before + 1);
    assert.equal((push.sent.at(-1) as { rain: { stronger?: boolean } }).rain.stronger, undefined);
  });

  it('consulta una sola vez los lugares repetidos', async () => {
    const a = await register();
    const b = await register();
    await putPlaces(a.deviceId, a.token, [refugio]);
    await putPlaces(b.deviceId, b.token, [{ ...refugio, id: 'otro', lat: -41.1702 }]);
    source.outlook = { state: 'raining', mm: 1, peakMmH: 2 };
    const result = await runRainWatch(db, push, source, NOW);
    assert.equal(source.asked[0]!.length, 1);
    assert.equal(result.sent, 2);
  });

  it('"donde estoy" no usa una ubicación demasiado vieja', async () => {
    const { deviceId, token } = await register();
    const here = { id: 'here', label: null, lat: -34.6, lon: -58.38 };
    await putPlaces(deviceId, token, [{ ...here, fixAt: '2026-11-01T10:00:00.000Z' }]);
    source.outlook = { state: 'raining', mm: 1, peakMmH: 2 };
    await runRainWatch(db, push, source, NOW);
    assert.equal(push.sent.length, 0);

    await putPlaces(deviceId, token, [{ ...here, fixAt: '2026-11-03T12:00:00.000Z' }]);
    await runRainWatch(db, push, source, NOW);
    assert.equal(push.sent[0]!.rain!.label, null);
    assert.equal(push.sent[0]!.rain!.fixAt, '2026-11-03T12:00:00.000Z');

    // Al abrir la app, antes del GPS: se conserva la ubicación anterior y su episodio.
    await app.inject({
      method: 'PUT',
      url: `/api/devices/${deviceId}/rain`,
      headers: { authorization: `Bearer ${token}` },
      payload: { places: [refugio], keepHere: true },
    });
    const ids = (db.prepare('SELECT place_id, notified FROM rain_places ORDER BY place_id').all() as { place_id: string; notified: number }[]).map((r) => `${r.place_id}:${r.notified}`);
    assert.deepEqual(ids, ['here:1', 'w1:0']);
  });

  it('una lista vacía apaga los avisos, y se borran con el dispositivo', async () => {
    const { deviceId, token } = await register();
    await putPlaces(deviceId, token, [refugio]);
    await putPlaces(deviceId, token, []);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM rain_places').get() as { n: number }).n, 0);

    await putPlaces(deviceId, token, [refugio]);
    source.outlook = { state: 'raining', mm: 1, peakMmH: 2 };
    push.gone = true;
    const result = await runRainWatch(db, push, source, NOW);
    assert.equal(result.removed, 1);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM rain_places').get() as { n: number }).n, 0);
  });

  it('pide a Open-Meteo varios puntos juntos y entiende un punto o varios', async () => {
    const urls: string[] = [];
    const location = (mm: number) => ({
      current: { time: '2026-11-03T15:00' },
      minutely_15: { time: ['2026-11-03T15:00', '2026-11-03T15:15', '2026-11-03T15:30'], precipitation: [0, mm, mm] },
    });
    const fake = (async (url: string) => {
      urls.push(url);
      const n = new URL(url).searchParams.get('latitude')!.split(',').length;
      const body = n === 1 ? location(1) : [location(0), location(1)];
      return new Response(JSON.stringify(body), { status: 200 });
    }) as typeof fetch;
    const om = openMeteoSource('https://api.open-meteo.com/', fake);

    const two = await om.outlooks([{ lat: -34.6, lon: -58.4 }, { lat: -41.17, lon: -71.43 }]);
    assert.deepEqual(two, [{ state: 'dry' }, { state: 'soon', inMinutes: 15, startsAt: '2026-11-03T15:15', mm: 2, peakMmH: 4 }]);
    assert.match(urls[0]!, /^https:\/\/api\.open-meteo\.com\/v1\/forecast\?latitude=-34\.60%2C-41\.17&/);
    assert.equal((await om.outlooks([{ lat: 0, lon: 0 }]))[0]!.state, 'soon');

    const down = openMeteoSource('https://x', (async () => new Response('', { status: 500 })) as unknown as typeof fetch);
    assert.deepEqual(await down.outlooks([{ lat: 0, lon: 0 }]), [null]);
  });

  it('el pronóstico ignora lloviznas mínimas', () => {
    const slots = [
      { time: '2026-11-03T15:00', mm: 0.1 },
      { time: '2026-11-03T15:15', mm: 0.1 },
    ];
    assert.deepEqual(rainOutlook({ now: '2026-11-03T15:00', slots }), { state: 'dry' });
  });

  it('revisa si NOAA publica la lluvia estimada de reemplazo', async () => {
    let prefixes = ['ABI-L2-CMIPF/', 'ABI-L2-RRQPEF/', 'GLM-L2-LCFA/'];
    let todayFiles = '';
    const fake = (async (url: string) => {
      if (url.includes('delimiter=/')) return new Response(prefixes.map((p) => `<CommonPrefixes><Prefix>${p}</Prefix></CommonPrefixes>`).join(''));
      return new Response(todayFiles);
    }) as typeof fetch;
    const now = new Date('2026-11-04T12:00:00Z');
    assert.deepEqual(await checkObservedRain(now, fake), []);
    todayFiles = '<Key>ABI-L2-RRQPEF/2026/308/12/x.nc</Key>';
    assert.deepEqual(await checkObservedRain(now, fake), ['ABI-L2-RRQPEF/']);
    todayFiles = '';
    prefixes = [...prefixes, 'ABI-L2-FLDK-RRQPE-AWIPS/'];
    assert.deepEqual(await checkObservedRain(now, fake), ['ABI-L2-FLDK-RRQPE-AWIPS/']);
    const health = (await app.inject('/api/health')).json() as { observedRain: { available: string[] } };
    assert.deepEqual(health.observedRain.available, []);
  });
});
