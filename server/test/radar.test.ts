import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { encodePng } from '../src/rain/map.ts';
import {
  RADARS,
  RADAR_FRAMES,
  RADAR_USER_AGENT,
  createRadarStore,
  frameStamp,
  radarBounds,
  radarTick,
  refreshRadar,
  stampToUtcMs,
  stateOf,
  validRadarPng,
} from '../src/radar/sinarame.ts';
import { radarRoutes } from '../src/routes/radar.ts';

const png = encodePng(512, 512, new Uint8Array(512 * 512 * 4));
const bahia = RADARS.find((r) => r.id === 'RMA10')!;
/** 2026-11-19 13:10 UTC = 10:10 en la Argentina. */
const NOW = Date.UTC(2026, 10, 19, 13, 10, 0);

describe('radares argentinos (SINARAME)', () => {
  it('los límites salen de la misma cuenta que el visor (240 km alrededor del radar)', () => {
    const b = radarBounds(bahia);
    assert.ok(Math.abs(b.north - (bahia.lat + 240 / 110.574)) < 1e-9);
    assert.ok(Math.abs(b.south - (bahia.lat - 240 / 110.574)) < 1e-9);
    // En latitud −38,7 un grado de longitud es más corto: el ancho en grados es mayor que el alto.
    assert.ok(b.east - b.west > b.north - b.south);
    assert.equal(RADARS.length, 19);
    assert.equal(new Set(RADARS.map((r) => r.id)).size, 19);
  });

  it('el nombre del archivo lleva la hora argentina (UTC−3) en pasos de 10 minutos', () => {
    assert.equal(frameStamp(NOW), '20261119101000');
    assert.equal(frameStamp(NOW + 4 * 60_000), '20261119101000');
    assert.equal(frameStamp(NOW - 10 * 60_000), '20261119100000');
    // Cruce de día: 01:05 UTC es 22:05 del día anterior en la Argentina.
    assert.equal(frameStamp(Date.UTC(2026, 10, 19, 1, 5)), '20261118220000');
    assert.equal(stampToUtcMs('20261119101000'), NOW);
    assert.equal(stampToUtcMs('20261319101000'), null);
    assert.equal(stampToUtcMs('basura'), null);
  });

  it('solo acepta PNG de 512×512 (una página de error con código 200 no sirve)', () => {
    assert.equal(validRadarPng(png), true);
    assert.equal(validRadarPng(Buffer.from('<html>error</html>'.repeat(20))), false);
    assert.equal(validRadarPng(encodePng(64, 64, new Uint8Array(64 * 64 * 4))), false);
  });

  it('baja las imágenes que hay, se salta las que faltan, se identifica y no repite lo ya bajado', async () => {
    const asked: string[] = [];
    let ua = '';
    const have = new Set(['20261119101000', '20261119100000', '20261119094000']);
    const fetchFn = (async (url: string, init?: RequestInit) => {
      asked.push(url);
      ua = String((init?.headers as Record<string, string>)['user-agent']);
      const stamp = /(\d{14})\.png$/.exec(url)![1]!;
      return have.has(stamp) ? new Response(new Uint8Array(png), { status: 200 }) : new Response('no', { status: 404 });
    }) as typeof fetch;
    const store = createRadarStore();
    const got = await refreshRadar(store, bahia, { fetchFn, now: () => NOW, pauseMs: 0, base: 'https://radar.example' });
    assert.equal(got, 3);
    assert.equal(ua, RADAR_USER_AGENT);
    assert.deepEqual(stateOf(store, 'RMA10').frames.map((f) => f.stamp), ['20261119094000', '20261119100000', '20261119101000']);
    assert.ok(asked[0]!.startsWith('https://radar.example/cache/RMA10/'));
    // Segunda vuelta, 10 minutos después: solo busca lo nuevo y se corta al llegar a lo que ya tiene.
    have.add('20261119102000');
    asked.length = 0;
    assert.equal(await refreshRadar(store, bahia, { fetchFn, now: () => NOW + 10 * 60_000, pauseMs: 0 }), 1);
    assert.equal(asked.length, 1, "pide solo la imagen nueva y se corta al llegar a la que ya tiene");
    assert.equal(stateOf(store, 'RMA10').frames.at(-1)!.stamp, '20261119102000');
  });

  it('se queda con las últimas 12', async () => {
    const fetchFn = (async () => new Response(new Uint8Array(png), { status: 200 })) as typeof fetch;
    const store = createRadarStore();
    await refreshRadar(store, bahia, { fetchFn, now: () => NOW, pauseMs: 0 });
    const frames = stateOf(store, 'RMA10').frames;
    assert.equal(frames.length, RADAR_FRAMES);
    assert.equal(frames.at(-1)!.stamp, '20261119101000');
    assert.ok(frames[0]!.at < frames.at(-1)!.at);
  });

  it('ante un 403, 429 o error del servicio espera (5 minutos, el doble cada vez) sin insistir', async () => {
    let calls = 0;
    const fetchFn = (async () => {
      calls++;
      return new Response('no', { status: 429 });
    }) as typeof fetch;
    const store = createRadarStore();
    assert.equal(await refreshRadar(store, bahia, { fetchFn, now: () => NOW, pauseMs: 0 }), 0);
    assert.equal(calls, 1);
    assert.equal(store.backoffUntil, NOW + 5 * 60_000);
    // Dentro de la espera no pide nada.
    assert.equal(await refreshRadar(store, bahia, { fetchFn, now: () => NOW + 60_000, pauseMs: 0 }), 0);
    assert.equal(calls, 1);
    // Pasada la espera, vuelve a fallar y la espera se duplica.
    await refreshRadar(store, bahia, { fetchFn, now: () => NOW + 6 * 60_000, pauseMs: 0 });
    assert.equal(store.backoffUntil, NOW + 6 * 60_000 + 10 * 60_000);
  });

  it('la tarea actualiza siempre los 19 radares (sin que nadie los pida) y no más seguido que lo configurado', async () => {
    const asked = new Set<string>();
    const fetchFn = (async (url: string) => {
      asked.add(/cache\/(RMA\d+)\//.exec(url)![1]!);
      return new Response(new Uint8Array(png), { status: 200 });
    }) as typeof fetch;
    const store = createRadarStore();
    await radarTick(store, { fetchFn, now: () => NOW, pauseMs: 0 });
    assert.equal(asked.size, 19);
    asked.clear();
    // Cinco minutos después, con refresco de 10: no pregunta de nuevo.
    await radarTick(store, { fetchFn, now: () => NOW + 5 * 60_000, pauseMs: 0, refreshMs: 10 * 60_000 });
    assert.equal(asked.size, 0);
  });

  it('con atraso configurado no busca la imagen que todavía no puede existir', async () => {
    const urls: string[] = [];
    const fetchFn = (async (url: string) => {
      urls.push(url);
      return new Response('', { status: 404 });
    }) as typeof fetch;
    await refreshRadar(createRadarStore(), bahia, { fetchFn, now: () => NOW, pauseMs: 0, lagMs: 15 * 60_000 });
    // NOW = 10:10 (hora argentina): sin atraso empezaría en 10:10; con 15 minutos de atraso, en 09:50.
    assert.match(urls[0]!, /20261119095000\.png$/);
  });

  it('las rutas listan los radares, piden las imágenes de los elegidos y sirven cada PNG', async () => {
    const store = createRadarStore();
    const app = Fastify();
    radarRoutes(app, store);
    const state = stateOf(store, 'RMA10');
    state.frames.push({ stamp: '20261119101000', at: NOW, png });

    const all = (await app.inject('/api/radar')).json() as { enabled: boolean; radars: { id: string; frames: unknown[]; bounds: object }[]; attribution: string };
    assert.equal(all.enabled, true);
    assert.equal(all.radars.length, 19);
    assert.match(all.attribution, /SINARAME/);
    assert.ok(all.radars.every((r) => r.frames.length === 0), 'sin ids no se listan imágenes');

    const one = (await app.inject('/api/radar?ids=rma10,RMA999')).json() as typeof all;
    const r = one.radars.find((x) => x.id === 'RMA10')! as { frames: { at: string; url: string }[] };
    assert.deepEqual(r.frames, [{ at: new Date(NOW).toISOString(), url: '/api/radar/RMA10/20261119101000.png?v=2.0' }]);

    const img = await app.inject('/api/radar/RMA10/20261119101000.png');
    assert.equal(img.statusCode, 200);
    assert.equal(img.headers['content-type'], 'image/png');
    assert.match(String(img.headers['cache-control']), /immutable/);
    assert.equal((await app.inject('/api/radar/RMA10/20260101000000.png')).statusCode, 404);
    assert.equal((await app.inject('/api/radar/RMA999/20261119101000.png')).statusCode, 404);
    assert.equal((await app.inject('/api/radar/RMA10/..%2Fx.png')).statusCode, 404);
    await app.close();
  });

  it('apagado (RADAR_SINARAME=false) no lista radares ni sirve imágenes', async () => {
    const store = createRadarStore();
    stateOf(store, 'RMA10').frames.push({ stamp: '20261119101000', at: NOW, png });
    const app = Fastify();
    radarRoutes(app, store, false);
    assert.equal(((await app.inject('/api/radar?ids=RMA10')).json() as { enabled: boolean }).enabled, false);
    assert.equal((await app.inject('/api/radar/RMA10/20261119101000.png')).statusCode, 404);
    await app.close();
  });
});
