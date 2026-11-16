import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { loadConfig } from '../src/config.ts';
import { fetchPyLevels, parseDmh, type PyCatalogStation, type PyLevels } from '../src/rivers/py.ts';
import { riversRoutes } from '../src/routes/rivers.ts';

// Tabla real de la DMH (15-nov-2026) y el catálogo de estaciones con coordenadas de la app.
const html = readFileSync(new URL('./fixtures/py-dmh-convencional.sample.html', import.meta.url), 'utf8');
const catalog = (JSON.parse(readFileSync(new URL('../../app/public/data/rivers-PY.json', import.meta.url), 'utf8')) as { stations: PyCatalogStation[] }).stations;

describe('niveles de ríos de Paraguay: DMH', () => {
  it('lee el nivel, la fecha, la variación y el mínimo y máximo históricos de cada estación del catálogo', () => {
    const r = parseDmh(html, catalog);
    assert.ok(r.length >= 20, `solo ${r.length} estaciones`);
    const asu = r.find((s) => s.name === 'Asunción')!;
    assert.equal(asu.code, '2000086218');
    assert.equal(asu.river, 'Paraguay');
    assert.equal(asu.level, 1.81);
    assert.equal(asu.date, '2026-11-15');
    assert.equal(asu.changeCm, -4);
    assert.equal(asu.trend, 'falling');
    assert.deepEqual(asu.max, { level: 9.01, date: '1983-05-29' });
    assert.ok(asu.lat < -25 && asu.lon < -57);
    const cde = r.find((s) => s.name === 'Ciudad del Este')!;
    assert.equal(cde.level, 21.4);
    assert.equal(cde.trend, 'falling');
    assert.equal(r.find((s) => s.name === 'Encarnación')!.trend, 'rising');
  });

  it('una estación sin movimiento queda estable y una fuera del catálogo se descarta', () => {
    const r = parseDmh(html, catalog);
    assert.equal(r.find((s) => s.name === 'Puerto Murtinho (Brasil)')!.trend, 'steady');
    assert.equal(r.some((s) => /Ladario/.test(s.name)), false);
  });

  it('una página que cambió de formato no da estaciones', () => {
    assert.deepEqual(parseDmh('<html>mantenimiento</html>', catalog), []);
    assert.deepEqual(parseDmh(html.replace(/vermas_convencional/g, 'otro'), catalog), []);
  });

  it('fetchPyLevels falla si la tabla trae muy pocas estaciones conocidas', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response('<html>mantenimiento</html>')) as typeof fetch;
    try {
      await assert.rejects(fetchPyLevels(catalog, 1), /cambió de formato/);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('GET /api/rivers/py', () => {
  const levels: PyLevels = { fetchedAt: 1_000, stations: parseDmh(html, catalog) };

  async function build(py: () => Promise<PyLevels>, now: () => number) {
    const app = Fastify();
    const config = { ...loadConfig({}), appDir: new URL('../../app/public', import.meta.url).pathname };
    riversRoutes(app, config, undefined, now, undefined, undefined, py);
    await app.ready();
    return app;
  }

  it('devuelve las estaciones, guarda 2 horas y, si falla, entrega lo último marcado como viejo', async () => {
    let t = 1_000;
    let calls = 0;
    let fail = false;
    const app = await build(async () => {
      calls++;
      if (fail) throw new Error('DMH caída');
      return { ...levels, fetchedAt: t };
    }, () => t);
    const first = (await app.inject('/api/rivers/py')).json() as PyLevels & { stale: boolean };
    assert.equal(first.stale, false);
    assert.ok(first.stations.length >= 20);
    await app.inject('/api/rivers/py');
    assert.equal(calls, 1); // guardado
    t += 3 * 3_600_000;
    fail = true;
    const old = (await app.inject('/api/rivers/py')).json() as { stale: boolean };
    assert.equal(old.stale, true);
    t += 4 * 86_400_000;
    assert.equal((await app.inject('/api/rivers/py')).statusCode, 503);
  });
});
