import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { buildCells, fetchFires, fixedSites, parseCsv, FIRE_REGION, FIRE_REGION_CORE, FIXED_DAYS, FIXED_DAYS_OUTSIDE, type Detection, type FiresData } from '../src/fires/firms.ts';
import { buildInpeCells, cellKey, fetchInpeRows, parseInpeCsv, titleCase } from '../src/fires/inpe.ts';
import { firesRoutes } from '../src/routes/fires.ts';

const sample = readFileSync(new URL('./fixtures/firms-sample.csv', import.meta.url), 'utf8');
const brasil = readFileSync(new URL('./fixtures/firms-brasil-sample.csv', import.meta.url), 'utf8');
const inpeSample = readFileSync(new URL('./fixtures/inpe-diario-sample.csv', import.meta.url), 'utf8');
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
      { lat: 20, lon: -60, at: at(10), confidence: 2, frp: 5 }, // al norte de la región
      { lat: -30, lon: -20, at: at(10), confidence: 2, frp: 5 }, // al este (en el océano)
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
    const firmsUrls = urls.filter((u) => u.includes('firms.modaps'));
    assert.equal(firmsUrls.length, 2);
    assert.equal(both.total, 24); // 12 por archivo: con Brasil adentro, la fila de Minas Gerais (-42,5°) también entra
    assert.equal(both.hidden, 0);
    assert.ok(firmsUrls.every((u) => u.endsWith('_7d.csv')));
    const oneDown = (async (url: string) => (url.includes('noaa-21') ? new Response('x', { status: 500 }) : new Response(sample))) as unknown as typeof fetch;
    assert.deepEqual((await fetchFires(NOW, oneDown)).sources, ['NOAA-20']);
    await assert.rejects(fetchFires(NOW, (async () => new Response('x', { status: 500 })) as unknown as typeof fetch));
    await assert.rejects(fetchFires(NOW, (async () => new Response('<html>')) as unknown as typeof fetch));
  });
});

describe('focos de calor: cobertura de todo Brasil', () => {
  const NOW_BR = Date.parse('2026-11-18T20:00:00Z');
  it('la región cubre todo Brasil: costa del noreste (Paraíba -35°), Amapá (+2°) y Maranhão; los extremos del país están adentro', () => {
    const r = buildCells(parseCsv(brasil), NOW_BR);
    assert.equal(r.total, 15);
    assert.ok(r.cells.some((c) => c[1] > -36 && c[1] < -35)); // Paraíba, en la costa del noreste (al este de -52°, afuera de la región vieja)
    assert.ok(r.cells.some((c) => c[0] > 2 && c[1] > -51)); // Amapá
    // Ponta do Seixas (7,15°S 34,79°O, el punto más al este), Monte Caburaí (5,27°N 60,2°O, el más al norte) y Arroio Chuí (33,75°S 53,4°O, el más al sur).
    const d = (lat: number, lon: number): Detection => ({ lat, lon, at: NOW_BR - 3_600_000, confidence: 2, frp: 1 });
    const edge = buildCells([d(-7.15, -34.79), d(5.27, -60.2), d(-33.75, -53.4), d(-9.97, -73.8)], NOW_BR);
    assert.equal(edge.total, 4);
    assert.ok(FIRE_REGION[2] > -34.79 && FIRE_REGION[3] > 5.27 && FIRE_REGION[1] < -33.75 && FIRE_REGION[0] < -73.99);
  });

  it('para la región original da exactamente lo mismo que antes (otra región solo agrega celdas)', () => {
    const d = parseCsv(sample).concat(parseCsv(brasil));
    const all = buildCells(d, Date.parse('2026-11-13T12:00:00Z'));
    const core = buildCells(d, Date.parse('2026-11-13T12:00:00Z'), FIRE_REGION_CORE);
    const [w, s, e, n] = FIRE_REGION_CORE;
    assert.deepEqual(all.cells.filter((c) => c[1] >= w && c[1] <= e && c[0] >= s && c[0] <= n), core.cells);
  });

  it('fuera de la región original una fuente fija necesita las 8 fechas; adentro siguen siendo 6', () => {
    const day = 86_400_000;
    const site = (lat: number, lon: number, days: number): Detection[] => Array.from({ length: days }, (_, i) => ({ lat, lon, at: NOW_BR - i * day - 3_600_000, confidence: 1, frp: 3 }));
    assert.equal(FIXED_DAYS_OUTSIDE, 8);
    // Amapá (Calçoene): una quema de pastura que dura 7 días NO se oculta; una antorcha de 8 días sí.
    assert.equal(fixedSites(site(2.28, -50.77, 7)).size, 0);
    assert.ok(fixedSites(site(2.28, -50.77, 8)).size > 0);
    const r = buildCells([...site(2.28, -50.77, 7), ...site(-3.1, -43.2, 8)], NOW_BR);
    assert.equal(r.hidden, 1);
    assert.equal(r.total, 1); // la de Amapá de hoy
    // En la región original no cambia: 6 fechas alcanzan.
    assert.ok(fixedSites(site(-38.74, -68.84, 6)).size > 0);
  });
});

const NOW_BR_2 = Date.parse('2026-11-18T20:00:00Z');
describe('INPE Queimadas: enriquecimiento de las celdas de Brasil', () => {
  it('lee el CSV real del INPE: -999 y los vacíos (el de hoy aún sin riesgo) son «sin dato»; nombres en minúscula con la UF', () => {
    const rows = parseInpeCsv(inpeSample);
    assert.equal(rows.length, 19);
    assert.ok(rows.some((r) => r.risk === null && r.dry === null && r.place === 'Uruará-PA')); // fila de hoy (GOES-19), vacía
    const contagem = rows.find((r) => r.place === 'Contagem-MG')!;
    assert.equal(contagem.risk, null); // -999.0
    assert.equal(contagem.dry, 0);
    assert.equal(rows.find((r) => r.place === 'Marcação-PB')!.dry, null); // -999
    const calc = rows.find((r) => r.place === 'Calçoene-AP')!;
    assert.deepEqual([calc.risk, calc.dry, calc.biome], [0.38, 2, 'Amazônia']);
    assert.equal(titleCase('MOJUÍ DOS CAMPOS'), 'Mojuí dos Campos');
    assert.equal(titleCase("SANT'ANA DO LIVRAMENTO"), "Sant'Ana do Livramento");
    assert.deepEqual(parseInpeCsv(''), []);
    assert.deepEqual(parseInpeCsv('<html>captcha</html>'), []);
  });

  it('agrupa por celda de 0,1° (la misma clave que FIRMS): riesgo y días máximos, bioma y municipio más frecuentes', () => {
    const cells = buildInpeCells(parseInpeCsv(inpeSample));
    const k = cellKey(2.2779, -50.7687);
    assert.equal(k, '2.25,-50.75');
    assert.deepEqual(cells[k], [0.4, 2, 'Amazônia', 'Calçoene-AP']);
    assert.deepEqual(cells[cellKey(-19.96, -44.05)]!.slice(0, 1), [null]); // solo -999: sin riesgo
    // `only` deja solo las celdas que FIRMS muestra.
    assert.deepEqual(Object.keys(buildInpeCells(parseInpeCsv(inpeSample), new Set([k]))), [k]);
  });

  it('las claves coinciden con las celdas de FIRMS (lat y lon del centro)', () => {
    const r = buildCells(parseCsv(brasil), NOW_BR_2);
    for (const c of r.cells) assert.equal(cellKey(c[0], c[1]), `${c[0]},${c[1]}`);
  });

  it('fetchFires suma lo del INPE a las celdas de Brasil; si el INPE falla o cambia de formato, queda FIRMS solo', async () => {
    const f = (async (url: string) => (url.includes('noaa-20') ? new Response(brasil) : new Response('x', { status: 500 }))) as unknown as typeof fetch;
    const withInpe = await fetchFires(NOW_BR_2, f, async () => parseInpeCsv(inpeSample));
    assert.equal(withInpe.total, 15);
    const amapa = withInpe.cells.find((c) => c[0] === 2.25)!;
    assert.deepEqual(withInpe.inpe![`${amapa[0]},${amapa[1]}`], [0.4, 2, 'Amazônia', 'Calçoene-AP']);
    assert.ok(Object.keys(withInpe.inpe!).length <= withInpe.cells.length);
    const sinInpe = await fetchFires(NOW_BR_2, f, async () => Promise.reject(new Error('INPE caído')));
    assert.equal(sinInpe.inpe, undefined);
    assert.equal(sinInpe.total, 15);
    assert.equal((await fetchFires(NOW_BR_2, f, async () => [])).inpe, undefined);
  });

  it('fetchInpeRows pide hoy y ayer (UTC) de a uno; sin riesgo en ninguno, suma anteayer; sin respuesta no falla', async () => {
    const urls: string[] = [];
    const today = inpeSample.split('\n').filter((l, i) => i === 0 || l.includes('GOES-19')).join('\n');
    const f = (async (url: string) => (urls.push(url), new Response(today))) as unknown as typeof fetch;
    const rows = await fetchInpeRows(Date.parse('2026-11-19T02:00:00Z'), f);
    assert.deepEqual(urls.map((u) => u.slice(-12)), ['20261119.csv', '20261118.csv', '20261117.csv']); // ninguna con riesgo: pidió anteayer
    assert.ok(rows.every((r) => r.risk === null));
    assert.ok(urls.every((u) => u.startsWith('https://dataserver-coids.inpe.br/queimadas/queimadas/focos/csv/diario/Brasil/focos_diario_br_')));
    // Con el de ayer completo no pide más, y la segunda vez sale del caché.
    urls.length = 0;
    const g = (async (url: string) => (urls.push(url), new Response(inpeSample))) as unknown as typeof fetch;
    const now = Date.parse('2026-11-19T20:00:00Z');
    assert.ok((await fetchInpeRows(now, g)).some((r) => r.risk !== null));
    assert.equal(urls.length, 2);
    await fetchInpeRows(now + 60_000, g);
    assert.equal(urls.length, 2);
    const down = (async () => new Response('x', { status: 503 })) as unknown as typeof fetch;
    assert.deepEqual(await fetchInpeRows(now, down), []);
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
