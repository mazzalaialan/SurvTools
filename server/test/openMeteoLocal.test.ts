import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { archiveFrom, checkLocalAnswer, localWeatherFetch } from '../src/weather/openMeteoLocal.ts';
import { omRoutes } from '../src/routes/om.ts';

const forecast = (temp: (number | null)[]) => ({ hourly: { time: temp.map((_, i) => `t${i}`), temperature_2m: temp } });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('checkLocalAnswer', () => {
  it('acepta una respuesta completa', () => assert.equal(checkLocalAnswer('forecast', forecast([20, 21])), true));
  it('rechaza una serie toda vacía (variable que la copia no tiene)', () => assert.equal(checkLocalAnswer('forecast', forecast([null, null])), false));
  it('en el pronóstico tolera huecos sueltos (la probabilidad de lluvia no llega a los 16 días)', () => assert.equal(checkLocalAnswer('forecast', forecast([20, null])), true));
  it('en el historial rechaza cualquier hueco (fechas que la copia no tiene)', () => assert.equal(checkLocalAnswer('archive', forecast([20, null])), false));
  it('mira cada lugar cuando son varios', () => assert.equal(checkLocalAnswer('forecast', [forecast([1]), forecast([null])]), false));
  it('rechaza un valor actual vacío', () => assert.equal(checkLocalAnswer('forecast', { current: { time: 'x', temperature_2m: null } }), false));
});

describe('archiveFrom', () => {
  it('con 5 años en 2026 empieza en 2022', () => assert.equal(archiveFrom(new Date('2026-11-17T00:00:00Z'), 5), '2022-01-01'));
});

describe('GET /api/om/v1/:kind', () => {
  const cfg = { localUrl: 'http://openmeteo:8080', archiveYears: 5 };
  const now = () => new Date('2026-11-17T00:00:00Z');
  async function app(fetchImpl: typeof fetch, c = cfg) {
    const a = Fastify();
    omRoutes(a, c, fetchImpl, now);
    return a;
  }

  it('devuelve lo que contesta la copia propia', async () => {
    const urls: string[] = [];
    const a = await app(async (u) => (urls.push(String(u)), json(forecast([20]))));
    const r = await a.inject('/api/om/v1/forecast?latitude=-34&longitude=-58&hourly=temperature_2m');
    assert.equal(r.statusCode, 200);
    assert.equal(urls[0], 'http://openmeteo:8080/v1/forecast?latitude=-34&longitude=-58&hourly=temperature_2m');
  });
  it('sin copia propia responde 503', async () => {
    const a = await app(async () => json({}), { localUrl: null, archiveYears: 5 });
    assert.equal((await a.inject('/api/om/v1/forecast?latitude=1&longitude=1')).statusCode, 503);
  });
  it('si la copia propia no contesta, 503', async () => {
    const a = await app(async () => {
      throw new Error('caída');
    });
    assert.equal((await a.inject('/api/om/v1/forecast?latitude=1&longitude=1')).statusCode, 503);
  });
  it('historial anterior a lo que se baja: 404 sin consultar la copia', async () => {
    let called = false;
    const a = await app(async () => ((called = true), json(forecast([1]))));
    const r = await a.inject('/api/om/v1/archive?latitude=1&longitude=1&start_date=2021-12-31&end_date=2022-01-02');
    assert.equal(r.statusCode, 404);
    assert.equal(called, false);
  });
  it('dato vacío: 404', async () => {
    const a = await app(async () => json(forecast([null, null])));
    assert.equal((await a.inject('/api/om/v1/forecast?latitude=1&longitude=1')).statusCode, 404);
  });
  it('ruta desconocida: 404', async () => {
    const a = await app(async () => json({}));
    assert.equal((await a.inject('/api/om/v1/ensemble?latitude=1')).statusCode, 404);
  });
});

describe('localWeatherFetch', () => {
  const cfg = { localUrl: 'http://openmeteo:8080', archiveYears: 5 };
  it('prueba primero la copia propia', async () => {
    const urls: string[] = [];
    const f = localWeatherFetch('https://api.open-meteo.com', cfg, async (u) => (urls.push(String(u)), json(forecast([20]))));
    const res = await f('https://api.open-meteo.com/v1/forecast?a=1');
    assert.equal(res.ok, true);
    assert.deepEqual(urls, ['http://openmeteo:8080/v1/forecast?a=1']);
  });
  it('si la copia propia cae o viene vacía, usa el servicio público', async () => {
    const urls: string[] = [];
    const f = localWeatherFetch('https://api.open-meteo.com', cfg, async (u) => {
      urls.push(String(u));
      if (String(u).startsWith('http://openmeteo')) return json(forecast([null]));
      return json(forecast([5]));
    });
    const res = await f('https://api.open-meteo.com/v1/forecast?a=1');
    assert.equal(((await res.json()) as ReturnType<typeof forecast>).hourly.temperature_2m[0], 5);
    assert.equal(urls.length, 2);
  });
  it('sin copia propia configurada va directo al público', async () => {
    const urls: string[] = [];
    const f = localWeatherFetch('https://api.open-meteo.com', { localUrl: null, archiveYears: 5 }, async (u) => (urls.push(String(u)), json(forecast([1]))));
    await f('https://api.open-meteo.com/v1/forecast?a=1');
    assert.deepEqual(urls, ['https://api.open-meteo.com/v1/forecast?a=1']);
  });
});
