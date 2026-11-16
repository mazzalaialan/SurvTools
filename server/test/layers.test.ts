import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { cleanName, coverId, describeCover, toForestTile } from '../src/layers/forest.ts';
import { inArgentina, toGeologyTile } from '../src/layers/segemar.ts';
import { tileBounds, tileOf } from '../src/layers/tiles.ts';
import { layersRoutes, type LayerSources } from '../src/routes/layers.ts';

// Respuestas reales (recortadas) de SEGEMAR y del Ministerio de Ambiente cerca del lago Lolog (16-nov-2026).
const seg = JSON.parse(readFileSync(new URL('./fixtures/segemar-lolog.json', import.meta.url), 'utf8')) as { features: Parameters<typeof toGeologyTile>[1] };
const bap = JSON.parse(readFileSync(new URL('./fixtures/bap-lolog.json', import.meta.url), 'utf8')) as { features: Parameters<typeof toForestTile>[1] };

describe('capas por zona: teselas', () => {
  it('la grilla: el índice sale de la latitud y la longitud', () => {
    const t = tileOf(-40.0, -71.4, 0.4);
    const b = tileBounds(t, 0.4);
    assert.ok(b.west <= -71.4 && -71.4 < b.east && b.south <= -40 && -40 < b.north);
    assert.ok(inArgentina(t));
    assert.ok(!inArgentina(tileOf(0, 0, 0.4)));
  });

  it('geología: arma el diccionario de unidades y los polígonos por índice', () => {
    const t = toGeologyTile({ x: 1, y: 2 }, seg.features);
    assert.ok(t.units.length >= 2, 'varias unidades');
    assert.ok(t.polys.length >= t.units.length);
    for (const p of t.polys) {
      assert.ok(t.units[p.u]);
      for (const ring of p.p) assert.ok(ring.length >= 8 && ring.length % 2 === 0);
    }
    assert.ok(t.units.every((u) => u.name && 'from' in u && 'to' in u));
    // Sin repetir: una unidad con los mismos datos aparece una sola vez.
    assert.equal(new Set(t.units.map((u) => JSON.stringify(u))).size, t.units.length);
  });

  it('bosque: junta por cobertura, arregla «Ñire» y da nombre y color', () => {
    assert.equal(cleanName('ÃƒÆ’Ã¢â‚¬Ëœire'), 'Ñire');
    assert.equal(cleanName('ÃƒÆ’Ã¢â‚¬Ëœire Bajo'), 'Ñire Bajo');
    assert.equal(cleanName('Lenga'), 'Lenga');
    assert.equal(cleanName('Maiten-ÃƒÆ’Ã¢â‚¬Ëœire'), 'Maiten-Ñire');
    assert.equal(describeCover('Lenga Achaparrada').nameEs, 'Lenga achaparrada');
    assert.equal(describeCover('Estepa').nameEs, 'Estepa y pastizal');
    assert.equal(describeCover('mixto Coihue-Cipres').nameEs, 'Bosque mixto');
    assert.equal(describeCover('Coihue-Rauli').nameEs, 'Bosque de coihue, raulí y roble');
    assert.equal(describeCover('Ñire Bajo').nameEs, 'Ñire bajo');
    const t = toForestTile({ x: 1, y: 2 }, bap.features);
    assert.ok(t.ecoregions.length >= 3 && t.ecoregions.length <= 15, 'pocas clases');
    assert.equal(new Set(t.ecoregions.map((e) => e.id)).size, t.ecoregions.length);
    assert.ok(t.ecoregions.every((e) => e.polys.length > 0 && e.color.startsWith('#')));
    assert.ok(!t.ecoregions.some((e) => /Ã/.test(e.name)), 'sin codificación rota');
    assert.equal(coverId('Lenga'), coverId('lenga'));
  });
});

describe('GET /api/layers', () => {
  function build(calls: string[], fail = false) {
    const src: LayerSources = {
      geology: async (x, y) => {
        calls.push(`g${x},${y}`);
        if (fail) throw new Error('caído');
        return toGeologyTile({ x, y }, seg.features);
      },
      forest: async (x, y) => {
        calls.push(`f${x},${y}`);
        return toForestTile({ x, y }, bap.features);
      },
      point: async () => ({ name: 'Complejo Colohuincul', litho: 'Migmatitas', from: 'Devónico', to: 'Carbonífero' }),
    };
    let t = 1_000_000;
    const app = Fastify();
    layersRoutes(app, src, () => t);
    return { app, tick: (ms: number) => (t += ms) };
  }
  const geo = tileOf(-40.0, -71.4, 0.4);
  const forest = tileOf(-40.0, -71.4, 0.25);

  it('devuelve la tesela de geología y la guarda (un solo pedido al servicio)', async () => {
    const calls: string[] = [];
    const { app } = build(calls);
    const a = await app.inject(`/api/layers/geology/${geo.x}/${geo.y}`);
    assert.equal(a.statusCode, 200);
    const body = a.json() as { units: unknown[]; stale: boolean; source: string };
    assert.ok(body.units.length > 1 && body.stale === false && /CC BY 4.0/.test(body.source));
    await app.inject(`/api/layers/geology/${geo.x}/${geo.y}`);
    assert.equal(calls.length, 1);
  });

  it('bosque: solo donde hay capa', async () => {
    const { app } = build([]);
    assert.equal((await app.inject(`/api/layers/forest/${forest.x}/${forest.y}`)).statusCode, 200);
    const far = tileOf(-34.6, -58.4, 0.25);
    assert.equal((await app.inject(`/api/layers/forest/${far.x}/${far.y}`)).statusCode, 404);
    assert.equal((await app.inject('/api/layers/geology/abc/1')).statusCode, 404);
  });

  it('si el servicio cae devuelve la copia vieja marcada, y sin copia da 502', async () => {
    const calls: string[] = [];
    let fail = false;
    const src: LayerSources = {
      geology: async (x, y) => {
        if (fail) throw new Error('caído');
        return toGeologyTile({ x, y }, seg.features);
      },
      forest: async () => assert.fail('no'),
      point: async () => null,
    };
    let t = 5_000_000;
    const app = Fastify();
    layersRoutes(app, src, () => t);
    assert.equal((await app.inject(`/api/layers/geology/${geo.x}/${geo.y}`)).statusCode, 200);
    fail = true;
    t += 8 * 86_400_000; // vencida (7 días) pero dentro de los 60
    const stale = await app.inject(`/api/layers/geology/${geo.x}/${geo.y}`);
    assert.equal(stale.statusCode, 200);
    assert.equal((stale.json() as { stale: boolean }).stale, true);
    const other = tileOf(-41.0, -71.4, 0.4);
    assert.equal((await app.inject(`/api/layers/geology/${other.x}/${other.y}`)).statusCode, 502);
    void calls;
  });

  it('consulta por punto: valida y devuelve la unidad', async () => {
    const { app } = build([]);
    const ok = await app.inject('/api/layers/geology/point?lat=-40.0&lon=-71.4');
    assert.equal((ok.json() as { unit: { name: string } }).unit.name, 'Complejo Colohuincul');
    assert.equal((await app.inject('/api/layers/geology/point?lat=abc&lon=1')).statusCode, 400);
    assert.equal((await app.inject('/api/layers/geology/point?lat=10&lon=10')).json<{ unit: null }>().unit, null);
  });
});
