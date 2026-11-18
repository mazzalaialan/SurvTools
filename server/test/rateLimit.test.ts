import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { loadConfig } from '../src/config.ts';
import { openDb } from '../src/db.ts';
import { createRateLimiter, registerRateLimits, rulesFor } from '../src/rateLimit.ts';
import { transferRoutes } from '../src/routes/transfers.ts';

const config = (env: Record<string, string> = {}) => loadConfig({ DATA_DIR: ':memory:', ...env });

describe('límite de pedidos por IP', () => {
  it('cuenta por ventana: pasado el límite devuelve cuánto esperar y, vencida la ventana, vuelve a dejar pasar', () => {
    let now = 1_000_000;
    const l = createRateLimiter(() => now);
    assert.equal(l.hit('a', 2, 60_000), null);
    assert.equal(l.hit('a', 2, 60_000), null);
    assert.equal(l.hit('a', 2, 60_000), 60);
    now += 30_000;
    assert.equal(l.hit('a', 2, 60_000), 30);
    // Otra clave (otra IP u otro endpoint) no se ve afectada.
    assert.equal(l.hit('b', 2, 60_000), null);
    now += 31_000;
    assert.equal(l.hit('a', 2, 60_000), null);
  });

  it('limpia las ventanas vencidas para no crecer sin límite', () => {
    let now = 0;
    const l = createRateLimiter(() => now);
    for (let i = 0; i < 10_001; i++) l.hit(`ip${i}`, 5, 1000);
    now += 2000;
    l.hit('nueva', 5, 1000);
    assert.ok(l.size() < 10_001);
  });

  it('las reglas cubren el clima propio, las alturas de calle, la base de calles y la subida de backups, y nada más', () => {
    const rules = rulesFor(config());
    const hit = (method: string, path: string) => rules.find((r) => r.match(method, path))?.name ?? null;
    assert.equal(hit('GET', '/api/om/v1/forecast'), 'om');
    assert.equal(hit('GET', '/api/address/ar'), 'address');
    assert.equal(hit('GET', '/api/osm/around'), 'osm');
    assert.equal(hit('GET', '/api/osm/nearby'), 'osm');
    assert.equal(hit('POST', '/api/transfers'), 'transfer-upload');
    assert.equal(hit('GET', '/api/transfers/ABC'), null);
    assert.equal(hit('GET', '/api/health'), null);
    assert.equal(hit('GET', '/api/tides/shn'), null);
  });

  it('en el servidor: se pasa del límite → 429 con Retry-After; otra IP sigue pasando; los demás endpoints no cuentan', async () => {
    const app = Fastify({ trustProxy: true });
    registerRateLimits(app, config({ RATE_OM_PER_MIN: '2' }));
    app.get('/api/om/v1/forecast', async () => ({ ok: true }));
    app.get('/api/health', async () => ({ ok: true }));
    const get = (url: string, ip = '1.1.1.1') => app.inject({ url, remoteAddress: ip });
    assert.equal((await get('/api/om/v1/forecast?a=1')).statusCode, 200);
    assert.equal((await get('/api/om/v1/forecast?a=2')).statusCode, 200);
    const third = await get('/api/om/v1/forecast?a=3');
    assert.equal(third.statusCode, 429);
    assert.ok(Number(third.headers['retry-after']) >= 1);
    assert.deepEqual(JSON.parse(third.body), { error: 'too-many-requests' });
    assert.equal((await get('/api/om/v1/forecast', '2.2.2.2')).statusCode, 200);
    for (let i = 0; i < 10; i++) assert.equal((await get('/api/health')).statusCode, 200);
  });

  it('con límite 0 no se limita', async () => {
    const app = Fastify();
    registerRateLimits(app, config({ RATE_OM_PER_MIN: '0' }));
    app.get('/api/om/v1/forecast', async () => ({ ok: true }));
    for (let i = 0; i < 20; i++) assert.equal((await app.inject('/api/om/v1/forecast')).statusCode, 200);
  });
});

describe('subida de backups de transferencia', () => {
  const upload = (app: ReturnType<typeof Fastify>, size: number, ip = '1.1.1.1') =>
    app.inject({ method: 'POST', url: '/api/transfers', remoteAddress: ip, headers: { 'content-type': 'application/octet-stream' }, payload: Buffer.alloc(size, 1) });

  it('limita las subidas por hora y por IP', async () => {
    const cfg = config({ RATE_TRANSFER_UPLOADS_PER_HOUR: '2' });
    const app = Fastify({ trustProxy: true });
    registerRateLimits(app, cfg);
    transferRoutes(app, openDb(':memory:'), cfg);
    assert.equal((await upload(app, 10)).statusCode, 201);
    assert.equal((await upload(app, 10)).statusCode, 201);
    assert.equal((await upload(app, 10)).statusCode, 429);
    assert.equal((await upload(app, 10, '9.9.9.9')).statusCode, 201);
  });

  it('el servidor no guarda más que su tope total de transferencias: 503 cuando no entra', async () => {
    const cfg = config({ TRANSFER_STORE_MAX_MB: '1' });
    const app = Fastify();
    transferRoutes(app, openDb(':memory:'), cfg);
    assert.equal((await upload(app, 600 * 1024)).statusCode, 201);
    const second = await upload(app, 600 * 1024);
    assert.equal(second.statusCode, 503);
    assert.deepEqual(JSON.parse(second.body), { error: 'storage-full' });
    // Uno más chico todavía entra.
    assert.equal((await upload(app, 100 * 1024)).statusCode, 201);
  });
});
