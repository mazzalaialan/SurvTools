import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { loadConfig } from '../src/config.ts';
import { fetchBrLevels, parseAnaRows, summarize, type BrCatalogStation, type BrLevels } from '../src/rivers/br.ts';
import { riversRoutes } from '../src/routes/rivers.ts';

// Respuestas reales de la telemetría de la ANA (19-nov-2026, recortadas): Uruguaiana con datos cada 15 minutos e Itaqui, que ese día traía
// las filas más nuevas con `<Nivel />` vacío (el último nivel era de dos días antes).
const uru = readFileSync(new URL('./fixtures/ana-uruguaiana.sample.xml', import.meta.url), 'utf8');
const itaqui = readFileSync(new URL('./fixtures/ana-itaqui-sin-nivel.sample.xml', import.meta.url), 'utf8');
const catalog = (JSON.parse(readFileSync(new URL('../../app/public/data/rivers-BR.json', import.meta.url), 'utf8')) as { stations: BrCatalogStation[] }).stations;
const NOW = Date.parse('2026-11-19T20:45:00Z'); // 17:45 en Brasilia

describe('catálogo de ríos de Brasil', () => {
  it('trae las 33 estaciones, 24 con cotas, con coordenadas en el sur y cotas en orden', () => {
    assert.equal(catalog.length, 33);
    assert.equal(catalog.filter((s) => s.thresholds).length, 24);
    assert.equal(new Set(catalog.map((s) => s.code)).size, 33);
    for (const s of catalog) {
      assert.ok(s.lat < -17 && s.lat > -34 && s.lon < -48 && s.lon > -58, s.name);
      const t = s.thresholds;
      if (t?.attention != null && t.alert != null) assert.ok(t.attention < t.alert, s.name);
      if (t?.alert != null && t.flood != null) assert.ok(t.alert < t.flood, s.name);
    }
    assert.deepEqual(catalog.find((s) => s.code === '77150000')!.thresholds, { attention: 650, alert: 750, flood: 850 });
    assert.equal(catalog.find((s) => s.code === '65992500')!.thresholds, null); // Iguazú: sin cotas oficiales
  });
});

describe('telemetría de la ANA: lectura', () => {
  it('Uruguaiana: último nivel, caudal, hora de Brasilia y tendencia a la baja', () => {
    const s = summarize(parseAnaRows(uru, NOW))!;
    assert.equal(s.level, 556.3);
    assert.equal(s.flow, 6666.76);
    assert.equal(s.at, '2026-11-19T16:30:00-03:00');
    assert.equal(s.trend, 'falling');
    assert.ok(s.changeCm! < -5 && s.changeHours! >= 3 && s.changeHours! <= 14);
  });

  it('Itaqui: las filas nuevas sin nivel se saltean y queda el último nivel real (vieja, de dos días antes)', () => {
    const rows = parseAnaRows(itaqui, NOW);
    assert.equal(rows[0]!.level, null);
    const s = summarize(rows)!;
    assert.equal(s.level, 606);
    assert.equal(s.at, '2026-11-17T17:00:00-03:00');
  });

  it('descarta valores absurdos (-9999), horas futuras y filas sin hora; sin ningún nivel válido no hay lectura', () => {
    // Fila inventada para la prueba: el -9999 no aparece en las respuestas guardadas.
    const row = (when: string, nivel: string) => `<DadosHidrometereologicos><DataHora>${when} </DataHora><Vazao>-9999</Vazao><Nivel>${nivel}</Nivel><Chuva /></DadosHidrometereologicos>`;
    const xml = row('2026-11-19 17:00:00', '-9999.00') + row('2026-11-19 17:15:00', '99999') + row('2026-11-25 10:00:00', '300') + '<DadosHidrometereologicos><Nivel>300</Nivel></DadosHidrometereologicos>';
    const rows = parseAnaRows(xml, NOW);
    assert.equal(rows.length, 2);
    assert.ok(rows.every((r) => r.level === null && r.flow === null));
    assert.equal(summarize(rows), null);
    assert.deepEqual(parseAnaRows('<html>mantenimiento</html>', NOW), []);
  });

  it('sin una lectura 3 a 14 horas antes no hay tendencia (estación con pocos datos)', () => {
    const xml = uru.split('</DadosHidrometereologicos>').slice(0, 3).join('</DadosHidrometereologicos>') + '</DadosHidrometereologicos></DocumentElement></DataTable>';
    const s = summarize(parseAnaRows(xml, NOW))!;
    assert.equal(s.trend, null);
    assert.equal(s.changeCm, null);
  });
});

describe('fetchBrLevels', () => {
  const two = catalog.filter((s) => s.code === '77150000' || s.code === '75900000');
  const noWait = { pauseMs: 0, backoffMs: 0, sleep: async () => undefined };

  async function withFetch<T>(handler: (url: string) => Response, fn: () => Promise<T>): Promise<T> {
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string) => handler(String(url))) as typeof fetch;
    try {
      return await fn();
    } finally {
      globalThis.fetch = original;
    }
  }

  it('pide cada estación con su código y ventana de fechas, y arma el resultado', async () => {
    const urls: string[] = [];
    const r = await withFetch(
      (url) => {
        urls.push(url);
        return new Response(url.includes('77150000') ? uru : itaqui);
      },
      () => fetchBrLevels(two, NOW, null, noWait),
    );
    assert.equal(urls.length, 2);
    assert.match(urls.find((u) => u.includes('77150000'))!, /codEstacao=77150000&dataInicio=2026-11-17&dataFim=2026-11-19$/);
    assert.equal(r.stations.length, 2);
    assert.deepEqual(r.failed, []);
    assert.equal(r.stations.find((s) => s.code === '75900000')!.level, 606);
  });

  it('ante 429 espera y reintenta una vez; si sigue, corta la ronda y conserva el último dato bueno', async () => {
    const first = await withFetch(() => new Response(uru), () => fetchBrLevels(two.slice(0, 1), NOW, null, noWait));
    const sleeps: number[] = [];
    let calls = 0;
    const r = await withFetch(
      () => {
        calls++;
        return new Response('slow down', { status: 429 });
      },
      () => fetchBrLevels(two, NOW + 1000, first, { ...noWait, backoffMs: 5, sleep: async (ms) => void sleeps.push(ms) }),
    );
    assert.equal(calls, 2); // un reintento y se corta: la segunda estación ni se pide
    assert.deepEqual(r.failed.sort(), ['75900000', '77150000']);
    assert.equal(r.stations.length, 1);
    assert.equal(r.stations[0]!.level, 556.3);
    assert.equal(r.stations[0]!.at, '2026-11-19T16:30:00-03:00'); // la hora es la de la lectura vieja, no la de ahora
    assert.ok(sleeps.includes(5));
  });

  it('una estación que falla con 404 no corta la ronda', async () => {
    const r = await withFetch((url) => (url.includes('77150000') ? new Response('no', { status: 404 }) : new Response(itaqui)), () => fetchBrLevels(two, NOW, null, noWait));
    assert.deepEqual(r.failed, ['77150000']);
    assert.equal(r.stations.length, 1);
  });

  it('si no sale ninguna estación, falla', async () => {
    await withFetch(() => new Response('<html>mantenimiento</html>'), async () => {
      await assert.rejects(fetchBrLevels(two, NOW, null, noWait), /ninguna estación/);
    });
  });
});

describe('GET /api/rivers/br', () => {
  const sample = async (fetchedAt: number): Promise<BrLevels> => fetchBrLevels(catalog.slice(0, 1), fetchedAt, null, { pauseMs: 0, sleep: async () => undefined });
  async function build(br: (c: BrCatalogStation[], p: BrLevels | null) => Promise<BrLevels>, now: () => number, firstWait = 50) {
    const app = Fastify();
    const config = { ...loadConfig({}), appDir: new URL('../../app/public', import.meta.url).pathname };
    riversRoutes(app, config, undefined, now, undefined, undefined, undefined, br, firstWait);
    await app.ready();
    return app;
  }

  it('devuelve lo guardado, actualiza por detrás pasados 30 minutos y, si falla, entrega lo último marcado como viejo', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response(uru)) as typeof fetch;
    try {
      let t = Date.parse('2026-11-19T20:45:00Z');
      let calls = 0;
      let fail = false;
      const app = await build(async () => {
        calls++;
        if (fail) throw new Error('ANA caída');
        return sample(t);
      }, () => t);
      const first = (await app.inject('/api/rivers/br')).json() as BrLevels & { stale: boolean };
      assert.equal(first.stale, false);
      assert.equal(first.stations.length, 1);
      await app.inject('/api/rivers/br');
      assert.equal(calls, 1);
      t += 40 * 60_000; // vencida: responde con lo guardado (viejo) y dispara la actualización
      const second = (await app.inject('/api/rivers/br')).json() as { stale: boolean };
      assert.equal(second.stale, true);
      await new Promise((r) => setTimeout(r, 20));
      assert.equal(calls, 2);
      assert.equal(((await app.inject('/api/rivers/br')).json() as { stale: boolean }).stale, false);
      fail = true;
      t += 2 * 3_600_000;
      assert.equal(((await app.inject('/api/rivers/br')).json() as { stale: boolean }).stale, true);
      t += 4 * 86_400_000;
      assert.equal((await app.inject('/api/rivers/br')).statusCode, 503);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('sin nada guardado y con la ronda lenta responde 503 «loading» y la ronda sigue sola', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response(uru)) as typeof fetch;
    try {
      const levels = await sample(NOW);
      let release: () => void = () => undefined;
      const gate = new Promise<void>((r) => (release = r));
      const app = await build(async () => {
        await gate;
        return levels;
      }, () => NOW);
      const slow = await app.inject('/api/rivers/br');
      assert.equal(slow.statusCode, 503);
      assert.deepEqual(slow.json(), { error: 'loading' });
      release();
      await new Promise((r) => setTimeout(r, 20));
      const ok = (await app.inject('/api/rivers/br')).json() as { stations: unknown[] };
      assert.equal(ok.stations.length, 1);
    } finally {
      globalThis.fetch = original;
    }
  });
});
