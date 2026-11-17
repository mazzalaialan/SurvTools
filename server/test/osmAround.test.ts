import { copyFileSync, mkdtempSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import Fastify from 'fastify';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { openAroundIndex } from '../src/osm/around.ts';
import { osmRoutes } from '../src/routes/osm.ts';

const cellOf = (lat: number, lon: number) => Math.floor((lat + 90) * 50) * 20000 + Math.floor((lon + 180) * 50);
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

/** Una base como la que arma tools/osm-index, con unas pocas filas cerca de Bariloche (-41.1335, -71.3103). */
function makeDb(): string {
  const dir = mkdtempSync(join(tmpdir(), 'osm-'));
  dirs.push(dir);
  const path = join(dir, 'around.sqlite');
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE road (cell INTEGER, lat REAL, lon REAL, name TEXT, ref TEXT, hw TEXT);
    CREATE TABLE num (cell INTEGER, lat REAL, lon REAL, street TEXT, number TEXT);
    CREATE TABLE mile (cell INTEGER, lat REAL, lon REAL, km TEXT, ref TEXT);
    CREATE TABLE place (cell INTEGER, lat REAL, lon REAL, cat TEXT, osm TEXT, tags TEXT);
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
    INSERT INTO meta VALUES ('builtAt', '2026-11-17T00:00:00.000Z');`);
  const road = db.prepare('INSERT INTO road VALUES (?, ?, ?, ?, ?, ?)');
  const num = db.prepare('INSERT INTO num VALUES (?, ?, ?, ?, ?)');
  const mile = db.prepare('INSERT INTO mile VALUES (?, ?, ?, ?, ?)');
  road.run(cellOf(-41.1336, -71.3104), -41.1336, -71.3104, 'Moreno', null, 'residential'); // a ~15 m
  road.run(cellOf(-41.1400, -71.3104), -41.14, -71.3104, 'Lejos', null, 'residential'); // a ~700 m: fuera de los 120 m
  road.run(cellOf(-41.1355, -71.311), -41.1355, -71.311, null, 'RN 40', 'trunk'); // ruta a ~230 m: dentro de los 400 m
  num.run(cellOf(-41.13355, -71.3103), -41.13355, -71.3103, 'Moreno', '248'); // a ~6 m
  num.run(cellOf(-41.1345, -71.3103), -41.1345, -71.3103, 'Moreno', '300'); // a ~105 m: fuera de los 80 m
  mile.run(cellOf(-41.14, -71.31), -41.14, -71.31, '1990', 'RN 40'); // a ~740 m
  const place = db.prepare('INSERT INTO place VALUES (?, ?, ?, ?, ?, ?)');
  place.run(cellOf(-41.1340, -71.3100), -41.134, -71.31, 'core', 'n11', JSON.stringify({ amenity: 'police', name: 'Comisaría 28' })); // ~120 m
  place.run(cellOf(-41.2, -71.35), -41.2, -71.35, 'core', 'w12', JSON.stringify({ amenity: 'hospital', name: 'Hospital Zonal' })); // ~8 km
  place.run(cellOf(-41.135, -71.31), -41.135, -71.31, 'fuel', 'n13', JSON.stringify({ amenity: 'fuel', brand: 'YPF' })); // ~200 m
  place.run(cellOf(-41.45, -71.3), -41.45, -71.3, 'core', 'n14', JSON.stringify({ amenity: 'police', name: 'Lejana' })); // ~35 km
  db.close();
  return path;
}

describe('base propia: lugares de «Buscar cercanos»', () => {
  it('trae lo de emergencias a menos del radio, ordenado por cercanía, con el tipo de OpenStreetMap', () => {
    const idx = openAroundIndex(makeDb())!;
    const r = idx.nearby(-41.1335, -71.3103, 10_000, null)!;
    assert.deepEqual(r.elements.map((e) => e.tags.name), ['Comisaría 28', 'Hospital Zonal']);
    assert.equal(r.elements[1]!.type, 'way');
    assert.equal(r.elements[1]!.id, 12);
    // Sin pedir la categoría, el combustible no viene; con ella, sí.
    assert.equal(r.elements.some((e) => e.tags.amenity === 'fuel'), false);
    assert.equal(idx.nearby(-41.1335, -71.3103, 10_000, 'fuel')!.elements.some((e) => e.tags.amenity === 'fuel'), true);
    // El radio manda: a 50 km aparece lo lejano.
    assert.equal(idx.nearby(-41.1335, -71.3103, 50_000, null)!.elements.length, 3);
    idx.close();
  });
  it('la ruta valida los datos y responde 503 sin base', async () => {
    const app = Fastify();
    osmRoutes(app, openAroundIndex(makeDb()));
    const ok = await app.inject({ url: '/api/osm/nearby?lat=-41.1335&lon=-71.3103&radius=10000' });
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.json().elements.length, 2);
    assert.equal((await app.inject({ url: '/api/osm/nearby?lat=x&lon=1' })).statusCode, 400);
    const none = Fastify();
    osmRoutes(none, null);
    assert.equal((await none.inject({ url: '/api/osm/nearby?lat=-41&lon=-71' })).statusCode, 503);
  });
});

describe('base propia de calles y números', () => {
  it('da lo que hay a cada distancia, con el mismo formato que usa la app', () => {
    const idx = openAroundIndex(makeDb())!;
    const r = idx.around(-41.1335, -71.3103)!;
    assert.equal(r.builtAt, '2026-11-17T00:00:00.000Z');
    const names = r.elements.filter((e) => e.tags.name).map((e) => e.tags.name);
    assert.deepEqual(names, ['Moreno']);
    assert.equal(r.elements.find((e) => e.tags.ref === 'RN 40')?.tags.highway, 'trunk');
    const nums = r.elements.filter((e) => e.tags['addr:housenumber']);
    assert.deepEqual(nums.map((e) => e.tags['addr:housenumber']), ['248']);
    assert.equal(nums[0]!.tags['addr:street'], 'Moreno');
    const ms = r.elements.find((e) => e.tags.highway === 'milestone');
    assert.equal(ms?.tags.distance, '1990');
    idx.close();
  });
  it('lejos de todo no devuelve nada, y sin base no hay índice', () => {
    const idx = openAroundIndex(makeDb())!;
    assert.deepEqual(idx.around(-34.6, -58.38)!.elements, []);
    idx.close();
    assert.equal(openAroundIndex(null), null);
    // Con ruta y sin archivo, el índice existe pero no da nada (503).
    assert.equal(openAroundIndex('/no/existe.sqlite')!.around(0, 0), null);
  });
  it('abre la base cuando aparece y la vuelve a abrir cuando cambia el archivo, sin reiniciar', () => {
    const dir = mkdtempSync(join(tmpdir(), 'osm-'));
    dirs.push(dir);
    const target = join(dir, 'around.sqlite');
    const idx = openAroundIndex(target)!;
    assert.equal(idx.around(-41.1335, -71.3103), null);
    copyFileSync(makeDb(), target);
    assert.ok(idx.around(-41.1335, -71.3103)!.elements.length > 0);
    // Un archivo nuevo (el armado mensual) reemplaza al anterior: se ve lo nuevo.
    const db = new DatabaseSync(target);
    db.exec("DELETE FROM road; DELETE FROM num; DELETE FROM mile;");
    db.close();
    utimesSync(target, new Date(), new Date(Date.now() + 5000));
    assert.equal(idx.around(-41.1335, -71.3103)!.elements.length, 0);
    idx.close();
  });
  it('la ruta responde 200 con la base, 400 con coordenadas inválidas y 503 sin base', async () => {
    const withDb = Fastify();
    osmRoutes(withDb, openAroundIndex(makeDb()));
    const ok = await withDb.inject({ url: '/api/osm/around?lat=-41.1335&lon=-71.3103' });
    assert.equal(ok.statusCode, 200);
    assert.ok(ok.json().elements.length > 0);
    assert.equal((await withDb.inject({ url: '/api/osm/around?lat=abc&lon=1' })).statusCode, 400);
    const without = Fastify();
    osmRoutes(without, null);
    assert.equal((await without.inject({ url: '/api/osm/around?lat=-41&lon=-71' })).statusCode, 503);
  });
});
