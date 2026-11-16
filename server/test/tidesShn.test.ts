import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { parseShn, type ShnForecast } from '../src/tides/shn.ts';
import { tidesRoutes } from '../src/routes/tides.ts';

// Página real del SHN del 16-nov-2026 (pronóstico mareológico del Río de la Plata).
const html = readFileSync(new URL('./fixtures/shn-pronostico.sample.html', import.meta.url), 'utf8');

describe('pronóstico mareológico del SHN', () => {
  const f = parseShn(html, 1_000);
  it('lee la emisión, su validez y los textos de corrección', () => {
    assert.equal(f.issuedOn, '2026-11-16');
    assert.equal(f.validFrom, '2026-11-16T14:00:00-03:00');
    assert.equal(f.validTo, '2026-11-17T03:00:00-03:00');
    assert.equal(f.notes.length, 2);
    assert.match(f.notes[0]!, /VEINTE CENTIMETROS POR DEBAJO/i);
  });
  it('arrastra el nombre del puerto a las filas que lo dejan vacío y separa pleamar de bajamar', () => {
    const ids = f.stations.map((s) => s.id);
    assert.deepEqual(ids, ['la-plata', 'buenos-aires', 'san-fernando', 'punta-indio']);
    const ba = f.stations.find((s) => s.id === 'buenos-aires')!;
    assert.equal(ba.section, 'interior');
    assert.ok(ba.events.length >= 2);
    assert.deepEqual(ba.events.map((e) => e.type), ['low', 'high', 'low']);
    assert.deepEqual(ba.events[0], { type: 'low', at: '2026-11-16T18:30:00-03:00', height: 0.35 });
    assert.deepEqual(ba.events[1], { type: 'high', at: '2026-11-17T01:00:00-03:00', height: 1.1 });
    assert.deepEqual(ba.events[2], { type: 'low', at: '2026-11-17T08:30:00-03:00', height: 0.5 });
    const pi = f.stations.find((s) => s.id === 'punta-indio')!;
    assert.equal(pi.section, 'exterior');
    assert.ok(pi.events.every((e) => Number.isFinite(e.height)));
  });
  it('todos los extremos quedan en orden y con alturas razonables', () => {
    for (const s of f.stations) {
      assert.ok(Number.isFinite(s.lat) && Number.isFinite(s.lon));
      for (let i = 1; i < s.events.length; i++) assert.ok(s.events[i - 1]!.at <= s.events[i]!.at);
      assert.ok(s.events.every((e) => e.height > -1 && e.height < 5));
    }
  });
  it('si la página cambia de formato falla en vez de mostrar algo dudoso', () => {
    assert.throws(() => parseShn('<html><body>mantenimiento</body></html>'), /fecha de emisión/);
    assert.throws(() => parseShn(html.replace(/PLEAMAR|BAJAMAR/g, 'MAREA')), /cambió de formato/);
    assert.throws(() => parseShn(html.replace(/VALIDO DESDE/g, 'VALIDEZ')), /ventana de validez/);
  });
});

describe('GET /api/tides/shn', () => {
  const sample = parseShn(html, 0);
  it('guarda una hora, y si el SHN cae devuelve lo último marcado como viejo; sin copia da 502', async () => {
    let t = 5_000_000;
    let calls = 0;
    let fail = false;
    const app = Fastify();
    tidesRoutes(app, async () => {
      calls++;
      if (fail) throw new Error('caído');
      return { ...sample, fetchedAt: t } as ShnForecast;
    }, () => t);
    const a = await app.inject('/api/tides/shn');
    assert.equal(a.statusCode, 200);
    assert.equal((a.json() as { stale: boolean }).stale, false);
    await app.inject('/api/tides/shn');
    assert.equal(calls, 1);
    fail = true;
    t += 2 * 3_600_000;
    const stale = await app.inject('/api/tides/shn');
    assert.equal(stale.statusCode, 200);
    assert.equal((stale.json() as { stale: boolean }).stale, true);
    t += 30 * 3_600_000;
    assert.equal((await app.inject('/api/tides/shn')).statusCode, 502);
  });
});
