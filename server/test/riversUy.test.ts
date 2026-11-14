import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { loadConfig } from '../src/config.ts';
import { fetchUyLevels, parseCaru, parseDinagua, type UyLevels } from '../src/rivers/uy.ts';
import { riversRoutes } from '../src/routes/rivers.ts';

// Muestras reales (recortadas) de CARU (14-nov-2026) y de la API de DINAGUA.
const caruHtml = readFileSync(new URL('./fixtures/caru-alturas.sample.html', import.meta.url), 'utf8');
const dinagua = JSON.parse(readFileSync(new URL('./fixtures/dinagua-niveles.sample.json', import.meta.url), 'utf8')) as unknown;
const NOW = Date.parse('2026-11-14T21:00:00Z');

describe('niveles de ríos de Uruguay: CARU y DINAGUA', () => {
  it('CARU: lee puertos y estaciones automáticas del lado uruguayo, con su hora (UTC−3), el estado y el registro anterior; descarta los argentinos', () => {
    const r = parseCaru(caruHtml);
    const names = r.map((s) => s.name);
    assert.ok(names.includes('Salto'));
    assert.ok(names.includes('Bella Unión'));
    assert.ok(names.includes('Paysandú (automática)'));
    assert.equal(names.includes('Monte Caseros'), false); // lado argentino: ya sale del INA
    const salto = r.find((s) => s.name === 'Salto')!;
    assert.equal(salto.source, 'CARU');
    assert.equal(salto.id, 'caru-altura-29');
    assert.equal(salto.level, 8.89);
    assert.equal(salto.at, '2026-11-13T06:00:00-03:00');
    assert.equal(salto.trend, 'rising');
    assert.equal(salto.change, 0.04);
    assert.ok(salto.lat < -31 && salto.lon < -57.9);
    assert.equal(r.find((s) => s.name === 'Paysandú (automática)')!.provider, 'CARU y CTM');
  });

  it('CARU: una página que cambió de formato no da estaciones', () => {
    assert.deepEqual(parseCaru('<html>mantenimiento</html>'), []);
    assert.deepEqual(parseCaru(caruHtml.replace(/<td>/g, '<th>')), []);
  });

  it('DINAGUA: solo estaciones de Uruguay con lecturas de las últimas 48 h, con el nombre prolijo, la variación de 24 h y la hora de Uruguay', () => {
    const r = parseDinagua(dinagua, NOW);
    const by = (n: string) => r.find((s) => s.name === n);
    assert.ok(by('Paso de los Toros'));
    assert.ok(by('Paso Laguna II')); // numeral romano en mayúsculas
    assert.equal(r.some((s) => /RHT/.test(s.name)), false);
    assert.equal(r.some((s) => s.provider === 'INA' || s.provider === 'ANA'), false); // Argentina y Brasil afuera
    const toros = by('Paso de los Toros')!;
    assert.equal(toros.source, 'DINAGUA');
    assert.equal(toros.level, 7.39);
    assert.ok(typeof toros.change === 'number');
    assert.equal(toros.at, '2026-11-14T13:00:00.000Z'); // 10:00 de Uruguay
    // Con lecturas de hace más de 48 horas, no se muestra.
    assert.equal(parseDinagua(dinagua, NOW + 4 * 86_400_000).length, 0);
    assert.deepEqual(parseDinagua(null), []);
    assert.deepEqual(parseDinagua({ nivelRioTabla: 'x' }), []);
  });

  it('una fuente caída no tira a la otra; si caen las dos, error', async () => {
    const caruUrl = 'http://caru.test/alturas';
    const dinaguaUrl = 'https://dinagua.test/api';
    const mk = (caruOk: boolean, dinaOk: boolean) =>
      (async (url: string) => {
        if (url === caruUrl) return caruOk ? new Response(caruHtml) : new Response('x', { status: 500 });
        return dinaOk ? new Response(JSON.stringify(dinagua)) : new Response('x', { status: 500 });
      }) as unknown as typeof fetch;
    const original = globalThis.fetch;
    try {
      globalThis.fetch = mk(true, true);
      const both = await fetchUyLevels(NOW, { caruUrl, dinaguaUrl });
      assert.deepEqual(both.sources, { caru: true, dinagua: true });
      assert.ok(both.stations.some((s) => s.source === 'CARU') && both.stations.some((s) => s.source === 'DINAGUA'));
      globalThis.fetch = mk(false, true);
      assert.deepEqual((await fetchUyLevels(NOW, { caruUrl, dinaguaUrl })).sources, { caru: false, dinagua: true });
      globalThis.fetch = mk(false, false);
      await assert.rejects(fetchUyLevels(NOW, { caruUrl, dinaguaUrl }));
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('GET /api/rivers/uy', () => {
  const levels = (fetchedAt: number): UyLevels => ({ fetchedAt, stations: [], sources: { caru: true, dinagua: true } });
  it('lee una vez y guarda 2 horas; si falla devuelve lo último bueno como viejo, y 503 si no hay', async () => {
    const clock = { t: 1_000_000 };
    let calls = 0;
    let fail = false;
    const app = Fastify();
    riversRoutes(app, loadConfig({}), { fetch: async () => { throw new Error('no usado'); } }, () => clock.t, async () => { throw new Error('no usado'); }, async () => (calls++, fail ? Promise.reject(new Error('CARU 500')) : levels(clock.t)));
    fail = true;
    assert.equal((await app.inject({ method: 'GET', url: '/api/rivers/uy' })).statusCode, 503);
    fail = false;
    const a = await app.inject({ method: 'GET', url: '/api/rivers/uy' });
    assert.equal(a.statusCode, 200);
    assert.equal(a.json().stale, false);
    assert.equal(a.headers['cache-control'], 'no-store');
    clock.t += 3_600_000;
    await app.inject({ method: 'GET', url: '/api/rivers/uy' });
    assert.equal(calls, 2); // el 503 y este
    clock.t += 2 * 3_600_000;
    fail = true;
    assert.equal((await app.inject({ method: 'GET', url: '/api/rivers/uy' })).json().stale, true);
    clock.t += 4 * 86_400_000;
    assert.equal((await app.inject({ method: 'GET', url: '/api/rivers/uy' })).statusCode, 503);
  });
});
