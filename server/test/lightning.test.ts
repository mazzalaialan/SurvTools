import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { beforeEach, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { openDb, type Db } from '../src/db.ts';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { glmFeed, parseGlm, startOfKey, type Flash } from '../src/lightning/glm.ts';
import { readGlmPartial } from '../src/satellite/partial.ts';
import { createLightningStore, mapActive } from '../src/lightning/store.ts';
import { hasPlaces, runLightningWatch } from '../src/lightning/watch.ts';
import { distanceKm, withoutDuplicateHere } from '../src/places.ts';
import type { PushPayload, PushSender, PushSubscriptionJson } from '../src/push.ts';
import type { RainPoint, RainSource } from '../src/rain/source.ts';
import { runRainWatch } from '../src/rain/watch.ts';

class FakePush implements PushSender {
  publicKey = 'k';
  sent: PushPayload[] = [];
  async send(_s: PushSubscriptionJson, payload: PushPayload) {
    this.sent.push(payload);
    return true;
  }
}

const subscription = { endpoint: 'https://push.example.com/abc', keys: { p256dh: 'p', auth: 'a' } };
const prefs = { timezone: 'America/Argentina/Buenos_Aires', notifyHour: 9, language: 'es' };
const casa = { id: 'w1', label: 'Casa', lat: -34.578, lon: -58.6307 };
const at = (min: number) => new Date(Date.UTC(2026, 10, 4, 18, min));
/** Un rayo a `km` al norte de Casa. */
const flashNorth = (km: number): Flash => ({ lat: casa.lat + km / 111.2, lon: casa.lon, at: 0 });

let db: Db;
let push: FakePush;
let app: FastifyInstance;

async function deviceWith(places: unknown[]) {
  const reg = (await app.inject({ method: 'POST', url: '/api/devices', payload: { subscription, ...prefs } })).json() as { deviceId: string; token: string };
  const res = await app.inject({ method: 'PUT', url: `/api/devices/${reg.deviceId}/rain`, headers: { authorization: `Bearer ${reg.token}` }, payload: { places } });
  assert.equal(res.statusCode, 204);
  return reg;
}

describe('avisos de rayos', () => {
  beforeEach(async () => {
    db = openDb(':memory:');
    push = new FakePush();
    app = await buildApp(loadConfig({}), db, push, false);
  });

  it('lee un archivo real del GLM: solo rayos de buena calidad en la región', async () => {
    const flashes = await parseGlm(new Uint8Array(await readFile(new URL('./fixtures/glm-sample.nc', import.meta.url))), 123);
    assert.ok(flashes.length > 50);
    assert.ok(flashes.every((f) => f.lat >= -60 && f.lat <= 2 && f.lon >= -84 && f.lon <= -45 && f.at === 123));
    assert.equal(new Date(startOfKey('OR_GLM-L2-LCFA_G19_s20263080211400_e2026_c.nc')!).toISOString(), '2026-11-04T02:11:40.000Z');
  });

  it('avisa con distancia y rumbo, como mucho una vez cada 30 minutos', async () => {
    assert.equal(hasPlaces(db), false);
    await deviceWith([casa]);
    assert.equal(hasPlaces(db), true);

    await runLightningWatch(db, push, [flashNorth(45)], at(0)); // lejos
    assert.equal(push.sent.length, 0);

    await runLightningWatch(db, push, [flashNorth(45), flashNorth(12)], at(1));
    assert.deepEqual(push.sent[0], { type: 'lightning', lightning: { placeId: 'w1', label: 'Casa', distanceKm: 12, bearing: 0, fixAt: null } });

    // Muchos rayos seguidos: no avisa por cada uno.
    for (let m = 2; m <= 10; m++) await runLightningWatch(db, push, [flashNorth(5), flashNorth(6)], at(m));
    assert.equal(push.sent.length, 1);

    // Pasaron 10 minutos y siguen cayendo, pero no se acercó lo suficiente (12 → 4 km): no se insiste.
    await runLightningWatch(db, push, [flashNorth(4)], at(11));
    assert.equal(push.sent.length, 1);

    await runLightningWatch(db, push, [flashNorth(4)], at(31)); // pasaron 30 min y siguen cayendo
    assert.equal(push.sent.length, 2);
    assert.equal(push.sent[1]!.lightning!.distanceKm, 4);

    await runLightningWatch(db, push, [], at(45)); // sin rayos: no avisa
    await runLightningWatch(db, push, [flashNorth(20)], at(50)); // 19 min desde el último
    assert.equal(push.sent.length, 2);
    await runLightningWatch(db, push, [flashNorth(20)], at(65));
    assert.equal(push.sent.length, 3);
  });

  it('si la tormenta se acerca (10 km o más) avisa de nuevo antes de los 30 minutos, pero no antes de 10', async () => {
    await deviceWith([casa]);
    await runLightningWatch(db, push, [flashNorth(28)], at(1));
    assert.equal(push.sent.length, 1);

    await runLightningWatch(db, push, [flashNorth(15)], at(5)); // más cerca, pero hace solo 4 minutos
    assert.equal(push.sent.length, 1);

    await runLightningWatch(db, push, [flashNorth(20)], at(12)); // pasaron 11 min pero se acercó solo 8 km
    assert.equal(push.sent.length, 1);

    await runLightningWatch(db, push, [flashNorth(15)], at(12)); // 13 km más cerca y pasaron 11 minutos: avisa
    assert.equal(push.sent.length, 2);
    assert.equal(push.sent[1]!.lightning!.distanceKm, 15);

    await runLightningWatch(db, push, [flashNorth(3)], at(13)); // se acercó más, pero hace 1 minuto
    assert.equal(push.sent.length, 2);
    await runLightningWatch(db, push, [flashNorth(3)], at(23)); // 12 km más cerca y pasaron 11 minutos: avisa
    assert.equal(push.sent.length, 3);

    // Si se aleja, no avisa hasta que pasen los 30 minutos.
    await runLightningWatch(db, push, [flashNorth(25)], at(40));
    assert.equal(push.sent.length, 3);
    await runLightningWatch(db, push, [flashNorth(25)], at(54));
    assert.equal(push.sent.length, 4);
  });

  it('los topes salen de la configuración', () => {
    const c = loadConfig({ LIGHTNING_NOTIFY_EVERY_MIN: '45', LIGHTNING_APPROACH_KM: '5' });
    assert.equal(c.lightningNotifyEveryMin, 45);
    assert.equal(c.lightningApproachKm, 5);
    const d = loadConfig({});
    assert.equal(d.lightningNotifyEveryMin, 30);
    assert.equal(d.lightningApproachKm, 10);
  });

  it('"donde estoy" cerca de un waypoint con aviso se ignora (lluvia y rayos)', async () => {
    const fixAt = at(0).toISOString();
    await deviceWith([casa, { id: 'here', label: null, lat: -34.6, lon: -58.6, fixAt }]); // a ~4 km
    await runLightningWatch(db, push, [flashNorth(3)], at(1));
    assert.deepEqual(push.sent.map((p) => p.lightning!.placeId), ['w1']);

    const rain: RainSource = { name: 'x', outlooks: async (pts: RainPoint[]) => pts.map(() => ({ state: 'raining' as const, mm: 2, peakMmH: 2 })) };
    push.sent = [];
    await runRainWatch(db, push, rain, at(1));
    assert.deepEqual(push.sent.map((p) => p.rain!.placeId), ['w1']);

    // Lejos del waypoint (~50 km), avisa en los dos.
    await deviceWith([casa, { id: 'here', label: null, lat: -34.15, lon: -58.6, fixAt }]);
    push.sent = [];
    await runLightningWatch(db, push, [flashNorth(1), { lat: -34.15, lon: -58.62, at: 0 }], at(2));
    assert.deepEqual(push.sent.map((p) => p.lightning!.placeId).sort(), ['here', 'w1']);
  });

  it('distancias y la regla de lugares repetidos', () => {
    assert.ok(Math.abs(distanceKm({ lat: -34.6, lon: -58.38 }, { lat: -41.13, lon: -71.31 }) - 1330) < 20);
    const places = [
      { device_id: 'a', place_id: 'here', lat: -34.6, lon: -58.6 },
      { device_id: 'b', place_id: 'w', lat: -34.6, lon: -58.6 }, // de otro dispositivo: no cuenta
    ];
    assert.equal(withoutDuplicateHere(places).length, 2);
  });

  it('el feed baja solo los archivos nuevos, en parcial, y si falla la parcial baja el archivo completo', async () => {
    const sample = await readFile(new URL('./fixtures/glm-sample.nc', import.meta.url));
    const downloads: string[] = [];
    let keys = ['OR_GLM-L2-LCFA_G19_s20263081800000_e_c.nc', 'OR_GLM-L2-LCFA_G19_s20263081800200_e_c.nc'];
    const listing = (url: string) =>
      url.includes('/18/') ? keys.map((k) => `<Contents><Key>GLM-L2-LCFA/2026/308/18/${k}</Key><Size>${sample.length}</Size></Contents>`).join('') : '';
    const fake = (async (url: string) => {
      if (url.includes('list-type=2')) return new Response(listing(url), { status: 200 });
      downloads.push(url.split('/').pop()!);
      return new Response(sample, { status: 200 });
    }) as typeof fetch;
    const partialCalls: string[] = [];
    let partialFails = false;
    const partial = async (url: string, size: number, at: number) => {
      partialCalls.push(url.split('/').pop()!);
      assert.equal(size, sample.length);
      if (partialFails) throw new Error('sin rangos');
      return { flashes: [{ lat: -34, lon: -58, at }], bytes: 1000 };
    };
    const feed = glmFeed({ maxFiles: 3, partial, fetchImpl: fake });
    const now = new Date('2026-11-04T18:00:30Z');
    assert.equal((await feed.poll(now)).length, 2);
    assert.deepEqual(downloads, []);
    assert.equal(partialCalls.length, 2);
    assert.equal((await feed.poll(now)).length, 0); // nada nuevo

    keys = [...keys, 'OR_GLM-L2-LCFA_G19_s20263081800400_e_c.nc'];
    partialFails = true;
    assert.ok((await feed.poll(now)).length > 50); // cae al archivo completo
    assert.deepEqual(downloads, ['OR_GLM-L2-LCFA_G19_s20263081800400_e_c.nc']);
    assert.deepEqual(feed.stats(), { files: 3, bytes: 2000 + sample.length, partialFailures: 1 });
  });

  it('la lectura parcial real (worker y HTTP Range) da los mismos rayos bajando una fracción', async () => {
    const sample = await readFile(new URL('./fixtures/glm-sample.nc', import.meta.url));
    const server = createServer((req, res) => {
      const m = /bytes=(\d+)-(\d+)/.exec(req.headers.range ?? '');
      if (!m) {
        res.writeHead(200).end(sample);
        return;
      }
      const [start, end] = [Number(m[1]), Math.min(Number(m[2]), sample.length - 1)];
      res.writeHead(206, { 'content-range': `bytes ${start}-${end}/${sample.length}` }).end(sample.subarray(start, end + 1));
    });
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
    try {
      const { port } = server.address() as AddressInfo;
      const result = await readGlmPartial(`http://127.0.0.1:${port}/glm.nc`, sample.length, 7);
      assert.deepEqual(result.flashes, await parseGlm(new Uint8Array(sample), 7));
      assert.ok(result.bytes < sample.length * 0.2, `bajó ${result.bytes} de ${sample.length}`);
    } finally {
      server.close();
    }
  });

  it('el mapa pide los rayos recientes, y eso despierta la búsqueda', async () => {
    const store = createLightningStore();
    let woke = 0;
    const map = await buildApp(loadConfig({}), openDb(':memory:'), push, false, { store, wake: () => woke++ });
    store.flashes = [{ lat: -34.12345, lon: -58.98765, at: Date.now() - 30_000 }];
    store.updatedAt = Date.now();
    const res = await map.inject('/api/lightning');
    assert.equal(res.statusCode, 200);
    const body = res.json() as { updatedAt: string; flashes: [number, number, number][] };
    assert.deepEqual(body.flashes.map(([lat, lon]) => [lat, lon]), [[-34.123, -58.988]]);
    assert.ok(body.flashes[0]![2] >= 29 && body.flashes[0]![2] <= 32);
    assert.equal(woke, 1);
    assert.ok(mapActive(store));
    await map.inject('/api/lightning'); // seguido: ya está despierto
    assert.equal(woke, 1);
  });
});
