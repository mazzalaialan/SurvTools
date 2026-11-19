import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decodePng } from '../src/radar/pixels.ts';
import { RADARS, createRadarStore, frameStamp, radarBounds, stateOf, type RadarSite } from '../src/radar/sinarame.ts';
import { encodePng } from '../src/rain/map.ts';
import type { RainOutlook } from '../src/rain/outlook.ts';
import { echoWithin, radarVerdict, radarsCovering, vetoRadiusKm, withRadarCheck } from '../src/rain/radarCheck.ts';
import type { RainSource } from '../src/rain/source.ts';

const bahia = RADARS.find((r) => r.id === 'RMA10')!;
/** 2026-11-19 13:10 UTC. La última imagen tiene ~25 minutos de atraso. */
const NOW = Date.UTC(2026, 10, 19, 13, 10, 0);
/** A ~33 km al norte del radar de Bahía Blanca. */
const HERE = { lat: bahia.lat + 0.3, lon: bahia.lon };

/** Imagen transparente con, si se pide, un puñado de píxeles de eco en esa posición. */
function frame(radar: RadarSite, echo?: { lat: number; lon: number }): Buffer {
  const rgba = new Uint8Array(512 * 512 * 4);
  if (echo) {
    const b = radarBounds(radar);
    const x = Math.round(((echo.lon - b.west) / (b.east - b.west)) * 512);
    const y = Math.round(((b.north - echo.lat) / (b.north - b.south)) * 512);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) rgba.set([52, 160, 34, 255], ((y + dy) * 512 + x + dx) * 4);
  }
  return encodePng(512, 512, rgba);
}

function storeWith(radar: RadarSite, pngs: Buffer[], newestAgeMin = 25) {
  const store = createRadarStore();
  const state = stateOf(store, radar.id);
  pngs.forEach((png, i) => {
    const at = NOW - (newestAgeMin + (pngs.length - 1 - i) * 10) * 60_000;
    state.frames.push({ stamp: frameStamp(at), at, png });
  });
  state.checkedAt = NOW;
  return store;
}

describe('lectura de las imágenes del radar', () => {
  it('decodifica un PNG RGBA y rechaza lo que no es un PNG', () => {
    const img = decodePng(frame(bahia, HERE))!;
    assert.equal(img.width, 512);
    assert.equal(img.data.length, 512 * 512 * 4);
    assert.equal(decodePng(Buffer.from('no soy un png')), null);
  });

  it('encuentra el eco dentro del radio y no el de afuera', () => {
    const img = decodePng(frame(bahia, { lat: HERE.lat + 0.1, lon: HERE.lon }))!; // ~11 km del lugar
    assert.equal(echoWithin(img, bahia, HERE.lat, HERE.lon, 25), true);
    assert.equal(echoWithin(img, bahia, HERE.lat, HERE.lon, 5), false);
    // Un punto fuera del cuadrado de la imagen no se puede juzgar.
    assert.equal(echoWithin(img, bahia, bahia.lat + 5, bahia.lon, 25), null);
  });

  it('sabe qué radares cubren un lugar (hasta 150 km)', () => {
    assert.equal(radarsCovering(HERE.lat, HERE.lon)[0]!.id, 'RMA10');
    assert.deepEqual(radarsCovering(-54.8, -68.3), []); // Ushuaia
    assert.deepEqual(radarsCovering(-25.3, -57.6), []); // Asunción
  });
});

describe('veredicto del radar', () => {
  it('«sin eco» con dos imágenes recientes seguidas y vacías', () => {
    assert.equal(radarVerdict(storeWith(bahia, [frame(bahia), frame(bahia)]), HERE.lat, HERE.lon, 25, NOW), 'clear');
  });

  it('con eco cerca en cualquiera de las dos imágenes, es «eco»', () => {
    const echo = { lat: HERE.lat + 0.05, lon: HERE.lon };
    assert.equal(radarVerdict(storeWith(bahia, [frame(bahia, echo), frame(bahia)]), HERE.lat, HERE.lon, 25, NOW), 'echo');
    assert.equal(radarVerdict(storeWith(bahia, [frame(bahia), frame(bahia, echo)]), HERE.lat, HERE.lon, 25, NOW), 'echo');
  });

  it('un eco lejano (fuera del radio) no impide el «sin eco»', () => {
    const far = { lat: HERE.lat + 0.6, lon: HERE.lon }; // ~66 km
    assert.equal(radarVerdict(storeWith(bahia, [frame(bahia, far), frame(bahia, far)]), HERE.lat, HERE.lon, 25, NOW), 'clear');
  });

  it('sin certeza («desconocido»): imágenes viejas, una sola imagen, sin imágenes o sin cobertura', () => {
    assert.equal(radarVerdict(storeWith(bahia, [frame(bahia), frame(bahia)], 60), HERE.lat, HERE.lon, 25, NOW), 'unknown');
    assert.equal(radarVerdict(storeWith(bahia, [frame(bahia)]), HERE.lat, HERE.lon, 25, NOW), 'unknown');
    assert.equal(radarVerdict(createRadarStore(), HERE.lat, HERE.lon, 25, NOW), 'unknown');
    assert.equal(radarVerdict(storeWith(bahia, [frame(bahia), frame(bahia)]), -25.3, -57.6, 25, NOW), 'unknown');
    // Una imagen dañada no cuenta como «sin eco».
    assert.equal(radarVerdict(storeWith(bahia, [Buffer.from('roto'), Buffer.from('roto')]), HERE.lat, HERE.lon, 25, NOW), 'unknown');
  });
});

describe('doble chequeo de los avisos', () => {
  const raining: RainOutlook = { state: 'raining', mm: 1, peakMmH: 4 };
  const soon = (inMinutes: number): RainOutlook => ({ state: 'soon', inMinutes, startsAt: '2026-11-19T14:00', mm: 1, peakMmH: 4 });
  const source = (o: RainOutlook | null): RainSource => ({ name: 'prueba', outlooks: async (pts) => pts.map(() => o) });
  const deps = (store: ReturnType<typeof createRadarStore>, fetchFn: typeof fetch = async () => { throw new Error('sin red'); }) => ({
    store,
    fetchOpts: { fetchFn, pauseMs: 0 },
    now: () => NOW,
  });

  it('descarta «está lloviendo» y «va a llover» si el radar no ve nada cerca', async () => {
    const clear = storeWith(bahia, [frame(bahia), frame(bahia)]);
    const checked = withRadarCheck(source(raining), deps(clear));
    assert.deepEqual(await checked.outlooks([HERE]), [{ state: 'dry' }]);
    assert.deepEqual(await withRadarCheck(source(soon(30)), deps(clear)).outlooks([HERE]), [{ state: 'dry' }]);
    assert.equal(checked.vetoed(), 1);
  });

  it('con eco cerca, o sin cobertura, o con imágenes viejas, queda el aviso de siempre', async () => {
    const echo = storeWith(bahia, [frame(bahia, HERE), frame(bahia, HERE)]);
    assert.deepEqual(await withRadarCheck(source(raining), deps(echo)).outlooks([HERE]), [raining]);
    const clear = storeWith(bahia, [frame(bahia), frame(bahia)]);
    assert.deepEqual(await withRadarCheck(source(raining), deps(clear)).outlooks([{ lat: -25.3, lon: -57.6 }]), [raining]);
    const old = storeWith(bahia, [frame(bahia), frame(bahia)], 90);
    assert.deepEqual(await withRadarCheck(source(raining), deps(old)).outlooks([HERE]), [raining]);
  });

  it('un «va a llover» para dentro de más de una hora no se toca (el radar no ve el futuro)', async () => {
    const clear = storeWith(bahia, [frame(bahia), frame(bahia)]);
    assert.deepEqual(await withRadarCheck(source(soon(90)), deps(clear)).outlooks([HERE]), [soon(90)]);
    assert.equal(vetoRadiusKm(soon(90)), null);
    assert.equal(vetoRadiusKm({ state: 'dry' }), null);
  });

  it('si el servicio de radares falla, queda la lógica actual', async () => {
    const store = createRadarStore(); // sin imágenes y con ganas de buscarlas
    const checked = withRadarCheck(source(raining), deps(store));
    assert.deepEqual(await checked.outlooks([HERE]), [raining]);
    assert.equal(checked.vetoed(), 0);
  });

  it('con pronóstico seco o sin dato no se le pregunta nada al servicio de radares', async () => {
    let calls = 0;
    const fetchFn = (async () => {
      calls++;
      return new Response('', { status: 404 });
    }) as typeof fetch;
    const store = createRadarStore();
    assert.deepEqual(await withRadarCheck(source({ state: 'dry' }), deps(store, fetchFn)).outlooks([HERE]), [{ state: 'dry' }]);
    assert.deepEqual(await withRadarCheck(source(null), deps(store, fetchFn)).outlooks([HERE]), [null]);
    assert.equal(calls, 0);
  });

  it('pide imágenes al servicio solo para el radar que cubre el lugar', async () => {
    const urls: string[] = [];
    const fetchFn = (async (u: string) => {
      urls.push(String(u));
      return new Response('', { status: 404 });
    }) as typeof fetch;
    await withRadarCheck(source(raining), deps(createRadarStore(), fetchFn)).outlooks([HERE]);
    assert.ok(urls.length > 0);
    assert.ok(urls.every((u) => u.includes('/RMA10/')));
  });
});

describe('GET /api/radar/check (la app abierta)', () => {
  async function app(store: ReturnType<typeof createRadarStore>, enabled = true) {
    const { default: Fastify } = await import('fastify');
    const { radarRoutes } = await import('../src/routes/radar.ts');
    const a = Fastify();
    radarRoutes(a, store, () => undefined, enabled, { store, fetchOpts: { fetchFn: async () => new Response('', { status: 404 }), pauseMs: 0 }, now: () => NOW });
    return a;
  }
  const url = (state: string, extra = '') => `/api/radar/check?lat=${HERE.lat}&lon=${HERE.lon}&state=${state}${extra}`;

  it('dice «clear» si el radar no ve nada, «echo» si ve, y «unknown» sin datos', async () => {
    const clear = await app(storeWith(bahia, [frame(bahia), frame(bahia)]));
    assert.deepEqual((await clear.inject(url('raining'))).json(), { verdict: 'clear' });
    assert.deepEqual((await clear.inject(url('soon', '&minutes=30'))).json(), { verdict: 'clear' });
    assert.deepEqual((await clear.inject(url('soon', '&minutes=120'))).json(), { verdict: 'unknown' });
    const echo = await app(storeWith(bahia, [frame(bahia, HERE), frame(bahia, HERE)]));
    assert.deepEqual((await echo.inject(url('raining'))).json(), { verdict: 'echo' });
    const empty = await app(createRadarStore());
    assert.deepEqual((await empty.inject(url('raining'))).json(), { verdict: 'unknown' });
  });

  it('rechaza pedidos mal formados y, con el radar apagado, no descarta nada', async () => {
    const a = await app(storeWith(bahia, [frame(bahia), frame(bahia)]));
    assert.equal((await a.inject('/api/radar/check?lat=abc&lon=1&state=raining')).statusCode, 400);
    assert.equal((await a.inject(url('hail'))).statusCode, 400);
    const off = await app(storeWith(bahia, [frame(bahia), frame(bahia)]), false);
    assert.deepEqual((await off.inject(url('raining'))).json(), { verdict: 'unknown' });
  });
});
