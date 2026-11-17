import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { alturaAt, GEOREF, MAX_DISTANCE_M, type FetchJson } from '../src/address/georef.ts';
import { addressRoutes } from '../src/routes/address.ts';

/** Georef simulado: una calle recta de este a oeste, de la altura 1601 a la 2699, a 0,0001° (≈ 9 m) por cada 10 de altura. */
function fakeGeoref(): { fetchJson: FetchJson; calls: string[] } {
  const calls: string[] = [];
  const point = (h: number) => ({ lat: -34.5775, lon: -58.64 + (h - 1601) * 0.00001 });
  const fetchJson: FetchJson = async (url, init) => {
    calls.push(init ? `POST ${url} (${(init.body as { direcciones: unknown[] }).direcciones.length})` : url);
    if (url.startsWith(`${GEOREF}/ubicacion`)) return { ubicacion: { departamento: { id: '06408' }, provincia: { id: '06' } } };
    if (url.startsWith(`${GEOREF}/calles`)) {
      return { calles: [{ nombre: 'PUEYRREDON', altura: { inicio: { derecha: 1601, izquierda: 1602 }, fin: { derecha: 2699, izquierda: 2700 } } }] };
    }
    const body = init!.body as { direcciones: { direccion: string }[] };
    return {
      resultados: body.direcciones.map((q) => {
        const h = Number(q.direccion.split(' ').at(-1));
        return { direcciones: [{ altura: { valor: h }, calle: { nombre: 'PUEYRREDON' }, nomenclatura: `PUEYRREDON ${h}, Hurlingham, Buenos Aires`, ubicacion: point(h) }] };
      }),
    };
  };
  return { fetchJson, calls };
}

describe('altura de calle con Georef (Argentina)', () => {
  it('recupera la altura de una posición con una consulta masiva por pasada', async () => {
    const { fetchJson, calls } = fakeGeoref();
    // La posición de la altura 1745.
    const r = await alturaAt(-34.5775, -58.64 + (1745 - 1601) * 0.00001, 'Pueyrredon', fetchJson);
    assert.ok(r);
    assert.equal(r.street, 'PUEYRREDON');
    assert.ok(Math.abs(r.number - 1745) <= 1, `salió ${r.number}`);
    assert.ok(r.distance <= 2);
    // ubicación + calles + 2 pasadas masivas (no una consulta por altura).
    assert.equal(calls.length, 4);
    assert.ok(calls.filter((c) => c.startsWith('POST')).length <= 2);
  });
  it('con un error de GPS de unos 40 m da una altura cercana', async () => {
    const { fetchJson } = fakeGeoref();
    const r = await alturaAt(-34.5775, -58.64 + (1745 - 1601) * 0.00001 + 0.00045, 'Pueyrredon', fetchJson);
    assert.ok(r && Math.abs(r.number - 1745) <= 60);
  });
  it('si el punto más cercano queda lejos, no inventa una altura', async () => {
    const { fetchJson } = fakeGeoref();
    assert.equal(await alturaAt(-34.5775 + (MAX_DISTANCE_M + 80) / 111_000, -58.6375, 'Pueyrredon', fetchJson), null);
    assert.equal(await alturaAt(-34.5775, -58.6375, '   ', fetchJson), null);
  });
  it('la ruta valida los datos, devuelve el resultado, lo guarda y responde 502 si Georef no responde', async () => {
    const { fetchJson, calls } = fakeGeoref();
    const app = Fastify();
    addressRoutes(app, fetchJson);
    const url = `/api/address/ar?lat=-34.5775&lon=${-58.64 + 144 * 0.00001}&street=Pueyrredon`;
    const a = await app.inject({ url });
    assert.equal(a.statusCode, 200);
    assert.equal(a.json().found, true);
    const n = calls.length;
    assert.equal((await app.inject({ url })).json().found, true);
    assert.equal(calls.length, n, 'la segunda vez sale de la memoria');
    assert.equal((await app.inject({ url: '/api/address/ar?lat=x&lon=1&street=a' })).statusCode, 400);
    const down = Fastify();
    addressRoutes(down, async () => { throw new Error('sin red'); });
    assert.equal((await down.inject({ url })).statusCode, 502);
  });
});
