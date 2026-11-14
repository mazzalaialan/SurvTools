import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { openDb } from '../src/db.ts';

const dir = mkdtempSync(join(tmpdir(), 'packs-'));
writeFileSync(join(dir, 'UY.json'), JSON.stringify({ country: 'UY', generatedAt: '2026-12-01' }));
writeFileSync(join(dir, 'secreto.json'), '{"x":1}');
writeFileSync(join(dir, 'BO.json'), JSON.stringify({ country: 'BO' })); // sin fecha
after(() => rmSync(dir, { recursive: true, force: true }));

const app = () => buildApp({ ...loadConfig({}), dataPacksDir: dir }, openDb(':memory:'), { publicKey: 'k', send: async () => true }, false);

describe('paquetes de datos regenerados (GET /api/data/:file)', () => {
  it('sirve los archivos de la lista, sin cache', async () => {
    const a = await app();
    const res = await a.inject({ method: 'GET', url: '/api/data/UY.json' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().generatedAt, '2026-12-01');
    assert.equal(res.headers['cache-control'], 'no-cache');
  });
  it('404 si todavía no se generó o si no está en la lista (nada de rutas arbitrarias)', async () => {
    const a = await app();
    assert.equal((await a.inject({ method: 'GET', url: '/api/data/CL.json' })).statusCode, 404);
    assert.equal((await a.inject({ method: 'GET', url: '/api/data/secreto.json' })).statusCode, 404);
    assert.equal((await a.inject({ method: 'GET', url: '/api/data/..%2Fdb.sqlite' })).statusCode, 404);
  });

  it('el índice dice la fecha y el peso de cada paquete que tiene, sin los que no están en la lista', async () => {
    const a = await app();
    const res = await a.inject({ method: 'GET', url: '/api/data/index.json' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['cache-control'], 'no-cache');
    const { files } = res.json() as { files: Record<string, { date: string; bytes: number }> };
    assert.deepEqual(Object.keys(files).sort(), ['BO.json', 'UY.json']);
    assert.equal(files['UY.json']!.date, '2026-12-01');
    assert.equal(files['UY.json']!.bytes, JSON.stringify({ country: 'UY', generatedAt: '2026-12-01' }).length);
    assert.equal(files['BO.json']!.date, ''); // sin fecha
    assert.equal(files['BO.json']!.bytes > 0, true);
  });
  it('el índice se actualiza cuando se regenera un paquete', async () => {
    const a = await app();
    writeFileSync(join(dir, 'UY.json'), JSON.stringify({ country: 'UY', generatedAt: '2027-01-15', extra: 'más datos' }));
    const { files } = (await a.inject({ method: 'GET', url: '/api/data/index.json' })).json() as { files: Record<string, { date: string }> };
    assert.equal(files['UY.json']!.date, '2027-01-15');
  });
  it('sin carpeta de paquetes el índice no existe', async () => {
    const b = await buildApp({ ...loadConfig({}), dataPacksDir: null }, openDb(':memory:'), { publicKey: 'k', send: async () => true }, false);
    assert.equal((await b.inject({ method: 'GET', url: '/api/data/index.json' })).statusCode, 404);
  });
});
