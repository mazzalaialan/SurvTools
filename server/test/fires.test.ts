import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { buildCells, fetchFires, fixedSites, parseCsv, FIXED_DAYS, type Detection, type FiresData } from '../src/fires/firms.ts';
import { firesRoutes } from '../src/routes/fires.ts';

const sample = readFileSync(new URL('./fixtures/firms-sample.csv', import.meta.url), 'utf8');
const NOW = Date.parse('2026-11-14T00:00:00Z');

describe('focos de calor de FIRMS', () => {
  it('lee las detecciones con su confianza, su potencia y su hora (UTC)', () => {
    const d = parseCsv(sample);
    assert.equal(d.length, 12);
    assert.equal(d.filter((x) => x.confidence === 2).length, 3);
    assert.equal(d.filter((x) => x.confidence === 0).length, 2);
    assert.ok(d.every((x) => Number.isFinite(x.at) && x.frp >= 0));
    const first = parseCsv('latitude,longitude,acq_date,acq_time,confidence,frp\n-38.5,-68.5,2026-11-13,0438,nominal,1.5\n')[0]!;
    assert.deepEqual(first, { lat: -38.5, lon: -68.5, at: Date.parse('2026-11-13T04:38:00Z'), confidence: 1, frp: 1.5 });
    // La hora sin cero a la izquierda («438») también se lee.
    assert.equal(parseCsv('latitude,longitude,acq_date,acq_time,confidence,frp\n-1,-60,2026-11-13,438,high,2\n')[0]!.at, Date.parse('2026-11-13T04:38:00Z'));
  });

  it('un archivo con otro formato, o filas rotas, no da detecciones', () => {
    assert.deepEqual(parseCsv(''), []);
    assert.deepEqual(parseCsv('<html>error</html>'), []);
    assert.deepEqual(parseCsv('latitude,longitude,acq_date,acq_time,confidence,frp\nx,y,2026-11-13,0438,nominal,1\n-1,-60,2026-11-13,0438,rara,1\n'), []);
  });

  it('agrupa en celdas de 0,1° con el conteo por confianza, la potencia y lo reciente, y descarta lo de fuera de la región', () => {
    const at = (min: number) => NOW - min * 60_000;
    const d: Detection[] = [
      { lat: -26.52, lon: -60.61, at: at(300), confidence: 1, frp: 2 },
      { lat: -26.55, lon: -60.64, at: at(120), confidence: 2, frp: 10.4 },
      { lat: -26.58, lon: -60.75, at: at(500), confidence: 0, frp: 1 }, // otra celda (al oeste)
      { lat: 10, lon: -60, at: at(10), confidence: 2, frp: 5 }, // al norte de la región
      { lat: -30, lon: -40, at: at(10), confidence: 2, frp: 5 }, // al este
    ];
    const r = buildCells(d, NOW);
    assert.equal(r.total, 3);
    assert.equal(r.newestAt, at(120));
    const cell = r.cells.find((c) => c[2] === 2)!;
    assert.deepEqual(cell, [-26.55, -60.65, 2, 1, 1, 12, 120]);
    assert.equal(r.cells.length, 2);
    assert.equal(r.cells.reduce((n, c) => n + c[2], 0), 3);
  });

  it('solo se muestran las últimas 24 horas de la región', () => {
    const at = (h: number) => NOW - h * 3_600_000;
    const d: Detection[] = [
      { lat: -26.5, lon: -60.6, at: at(2), confidence: 1, frp: 1 },
      { lat: -26.5, lon: -60.6, at: at(30), confidence: 1, frp: 1 }, // de hace más de un día
      { lat: -26.5, lon: -60.6, at: at(-5), confidence: 1, frp: 1 }, // del futuro: descartada
    ];
    assert.equal(buildCells(d, NOW).total, 1);
  });

  it('reconoce una fuente fija por repetirse en 6 o más fechas, con sus vecinos, y oculta solo lo no alto de las últimas 24 h', () => {
    const day = 86_400_000;
    const flare = (i: number, jitter = 0): Detection => ({ lat: -38.74 + jitter, lon: -68.84, at: NOW - i * day - 3_600_000, confidence: 1, frp: 3 });
    // Una antorcha: una detección por día durante 7 días (la de hoy incluida), una de ellas desplazada un cuadro (~1 km) hacia el norte.
    const week = Array.from({ length: 7 }, (_, i) => flare(i, i === 3 ? 0.01 : 0));
    const highToday: Detection = { lat: -38.74, lon: -68.84, at: NOW - 2 * 3_600_000, confidence: 2, frp: 40 };
    const lone: Detection = { lat: -30.0, lon: -65.0, at: NOW - 3_600_000, confidence: 1, frp: 2 };
    const sites = fixedSites([...week, lone]);
    assert.ok(sites.has('-3874,-6884'));
    assert.equal(sites.has('-3000,-6500'), false);
    const r = buildCells([...week, highToday, lone], NOW);
    assert.equal(r.hidden, 1); // la nominal de hoy de la antorcha
    assert.equal(r.total, 2); // la de alta confianza y la aislada
    assert.deepEqual(r.cells.find((c) => c[0] === -38.75)!.slice(2, 5), [1, 1, 0]); // 1 detección, 1 alta, 0 nominales
    // Con 5 fechas no alcanza (FIXED_DAYS = 6).
    assert.equal(FIXED_DAYS, 6);
    assert.equal(fixedSites(week.slice(0, 5)).size, 0);
  });

  it('baja los dos satélites, y si uno falla usa el otro; si fallan los dos, error', async () => {
    const urls: string[] = [];
    const ok = (async (url: string) => (urls.push(url), new Response(sample))) as unknown as typeof fetch;
    const both = await fetchFires(NOW, ok);
    assert.deepEqual(both.sources, ['NOAA-20', 'NOAA-21']);
    assert.equal(urls.length, 2);
    assert.equal(both.total, 22); // 11 de la región por archivo (la fila del este queda afuera)
    assert.equal(both.hidden, 0);
    assert.ok(urls.every((u) => u.endsWith('_7d.csv')));
    const oneDown = (async (url: string) => (url.includes('noaa-21') ? new Response('x', { status: 500 }) : new Response(sample))) as unknown as typeof fetch;
    assert.deepEqual((await fetchFires(NOW, oneDown)).sources, ['NOAA-20']);
    await assert.rejects(fetchFires(NOW, (async () => new Response('x', { status: 500 })) as unknown as typeof fetch));
    await assert.rejects(fetchFires(NOW, (async () => new Response('<html>')) as unknown as typeof fetch));
  });
});

describe('GET /api/fires', () => {
  const data = (fetchedAt: number): FiresData => ({ fetchedAt, newestAt: fetchedAt, total: 1, hidden: 0, sources: ['NOAA-20'], cells: [[-26.55, -60.65, 1, 1, 0, 3, 5]] });
  it('baja una vez y guarda 30 minutos; si falla devuelve la última buena como vieja, y 503 si no hay', async () => {
    const clock = { t: 1_000_000 };
    let calls = 0;
    let fail = false;
    const app = Fastify();
    firesRoutes(app, { fetch: async (n) => (calls++, fail ? Promise.reject(new Error('FIRMS 500')) : data(n)) }, () => clock.t);
    fail = true;
    assert.equal((await app.inject({ method: 'GET', url: '/api/fires' })).statusCode, 503);
    fail = false;
    const a = await app.inject({ method: 'GET', url: '/api/fires' });
    assert.equal(a.statusCode, 200);
    assert.equal(a.json().stale, false);
    assert.equal(a.headers['cache-control'], 'no-store');
    clock.t += 20 * 60_000;
    await app.inject({ method: 'GET', url: '/api/fires' });
    assert.equal(calls, 2);
    clock.t += 15 * 60_000;
    fail = true;
    const stale = await app.inject({ method: 'GET', url: '/api/fires' });
    assert.equal(stale.json().stale, true);
    clock.t += 7 * 3_600_000;
    assert.equal((await app.inject({ method: 'GET', url: '/api/fires' })).statusCode, 503);
  });
});
