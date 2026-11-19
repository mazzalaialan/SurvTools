import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { openDb, type Db } from '../src/db.ts';
import type { PushPayload, PushSender, PushSubscriptionJson } from '../src/push.ts';
import { runScheduler } from '../src/scheduler.ts';
import { generateCode, normalizeCode } from '../src/routes/transfers.ts';
import { announce, parseAnnouncement } from '../src/announce.ts';

class FakePush implements PushSender {
  publicKey = 'test-public-key';
  sent: { subscription: PushSubscriptionJson; payload: PushPayload }[] = [];
  gone = false;
  async send(subscription: PushSubscriptionJson, payload: PushPayload) {
    if (this.gone) return false;
    this.sent.push({ subscription, payload });
    return true;
  }
}

const subscription = { endpoint: 'https://push.example.com/abc', keys: { p256dh: 'p', auth: 'a' } };
const prefs = { timezone: 'America/Argentina/Buenos_Aires', notifyHour: 9, language: 'es' };

let db: Db;
let push: FakePush;
let app: FastifyInstance;

async function register() {
  const res = await app.inject({ method: 'POST', url: '/api/devices', payload: { subscription, ...prefs } });
  assert.equal(res.statusCode, 201);
  return res.json() as { deviceId: string; token: string };
}

function putAlerts(deviceId: string, token: string, alerts: unknown[]) {
  return app.inject({
    method: 'PUT',
    url: `/api/devices/${deviceId}`,
    headers: { authorization: `Bearer ${token}` },
    payload: { alerts },
  });
}

/** 10:00 en Buenos Aires (UTC−3) = 13:00 UTC. */
const at = (day: string, hourBA = 10) => new Date(`${day}T${String(hourBA + 3).padStart(2, '0')}:00:00Z`);

describe('servidor', () => {
  beforeEach(async () => {
    db = openDb(':memory:');
    push = new FakePush();
    app = await buildApp({ ...loadConfig({}), transferMaxBytes: 1024 }, db, push, false);
  });

  it('health expone la clave pública VAPID', async () => {
    const res = await app.inject('/api/health');
    assert.equal(res.json().vapidPublicKey, 'test-public-key');
  });

  it('rechaza zonas horarias inválidas', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/devices', payload: { subscription, ...prefs, timezone: 'Marte/Olimpo' } });
    assert.equal(res.statusCode, 400);
  });

  it('exige el token del dispositivo y guarda solo su hash', async () => {
    const { deviceId, token } = await register();
    assert.equal((await putAlerts(deviceId, 'otro-token', [])).statusCode, 401);
    assert.equal((await putAlerts(deviceId, token, [])).statusCode, 204);
    const row = db.prepare('SELECT token_hash FROM devices').get() as { token_hash: string };
    assert.notEqual(row.token_hash, token);
  });

  it('notifica una vez por día, solo lo nuevo, en la hora local elegida', async () => {
    const { deviceId, token } = await register();
    await putAlerts(deviceId, token, [
      { lotId: 'l1', itemName: 'Atún', kind: 'expiry', dueDate: '2026-11-30', notifyFrom: '2026-10-31' },
      { lotId: 'l2', itemName: 'Agua', kind: 'expiry', dueDate: '2027-03-01', notifyFrom: '2027-01-30' },
    ]);

    await runScheduler(db, push, at('2026-11-02', 8)); // antes de las 9: nada
    assert.equal(push.sent.length, 0);

    await runScheduler(db, push, at('2026-11-02'));
    assert.equal(push.sent.length, 1);
    assert.deepEqual(push.sent[0]!.payload, { type: 'alerts', alerts: [{ itemName: 'Atún', kind: 'expiry', dueDate: '2026-11-30' }] });

    await runScheduler(db, push, at('2026-11-02', 15)); // mismo día: no repite
    await runScheduler(db, push, at('2026-11-03')); // día siguiente sin novedades: no repite
    assert.equal(push.sent.length, 1);

    await runScheduler(db, push, at('2026-11-30')); // vence hoy: vuelve a avisar
    assert.equal(push.sent.length, 2);
  });

  it('acepta faltantes de recomendaciones y rechaza tipos desconocidos', async () => {
    const { deviceId, token } = await register();
    const shortage = { lotId: 'rec:r1', itemName: 'Agua (faltan 108 L)', kind: 'shortage', dueDate: null, notifyFrom: '2026-11-01' };
    assert.equal((await putAlerts(deviceId, token, [shortage])).statusCode, 204);
    await runScheduler(db, push, at('2026-11-02'));
    assert.deepEqual(push.sent[0]!.payload, { type: 'alerts', alerts: [{ itemName: 'Agua (faltan 108 L)', kind: 'shortage', dueDate: null }] });
    assert.equal((await putAlerts(deviceId, token, [{ ...shortage, lotId: 'min:m1', kind: 'minStock' }])).statusCode, 204);
    assert.equal((await putAlerts(deviceId, token, [{ ...shortage, kind: 'otro' }])).statusCode, 400);
  });

  it('eliminar mi cuenta: borra el dispositivo y todo lo suyo, solo con su token', async () => {
    const { deviceId, token } = await register();
    const other = await register();
    for (const d of [deviceId, other.deviceId]) {
      db.prepare('INSERT INTO alerts (device_id, lot_id, item_name, kind, due_date, notify_from) VALUES (?, ?, ?, ?, ?, ?)').run(d, 'l1', 'Atún', 'expiry', '2026-11-30', '2026-10-31');
      db.prepare('INSERT INTO stock_places (device_id, place_id, label, lat, lon) VALUES (?, ?, ?, ?, ?)').run(d, 'p1', 'Casa', -34.6, -58.4);
      db.prepare('INSERT INTO hazard_notices (device_id, place_id, event_key, level, notified_at) VALUES (?, ?, ?, ?, ?)').run(d, 'here', 'eq:1', 1, 0);
      db.prepare('INSERT INTO official_notices (device_id, family, alert_key, severity, expires_at, notified_at) VALUES (?, ?, ?, ?, ?, ?)').run(d, 'smn', 'k', 1, 0, 0);
    }
    // Sin el token del dispositivo no se borra nada.
    const wrong = await app.inject({ method: 'DELETE', url: `/api/devices/${deviceId}`, headers: { authorization: `Bearer ${other.token}` } });
    assert.equal(wrong.statusCode, 401);

    const res = await app.inject({ method: 'DELETE', url: `/api/devices/${deviceId}`, headers: { authorization: `Bearer ${token}` } });
    assert.equal(res.statusCode, 204);
    // Toda tabla con datos de un dispositivo (también las que se agreguen) tiene que quedar sin filas de este y con las del otro.
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[])
      .map((t) => t.name)
      .filter((name) => (db.prepare(`PRAGMA table_info(${name})`).all() as { name: string }[]).some((c) => c.name === 'device_id'));
    assert.ok(tables.length >= 7, `tablas con device_id: ${tables.join(', ')}`);
    for (const name of tables) {
      assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM ${name} WHERE device_id = ?`).get(deviceId) as { n: number }).n, 0, name);
    }
    for (const name of ['alerts', 'stock_places', 'hazard_notices', 'official_notices']) {
      assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM ${name} WHERE device_id = ?`).get(other.deviceId) as { n: number }).n, 1, name);
    }
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM devices WHERE id = ?').get(deviceId) as { n: number }).n, 0);
    // Repetirlo ya no encuentra el dispositivo: la app lo toma como borrado.
    const again = await app.inject({ method: 'DELETE', url: `/api/devices/${deviceId}`, headers: { authorization: `Bearer ${token}` } });
    assert.equal(again.statusCode, 401);
  });

  it('borra el dispositivo si la suscripción ya no existe', async () => {
    const { deviceId, token } = await register();
    await putAlerts(deviceId, token, [{ lotId: 'l1', itemName: 'Atún', kind: 'expiry', dueDate: '2026-11-30', notifyFrom: '2026-10-31' }]);
    push.gone = true;
    const result = await runScheduler(db, push, at('2026-11-02'));
    assert.equal(result.removed, 1);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM devices').get() as { n: number }).n, 0);
  });

  it('transfiere un archivo una sola vez', async () => {
    const data = Buffer.from([1, 2, 3, 250]);
    const up = await app.inject({ method: 'POST', url: '/api/transfers', headers: { 'content-type': 'application/octet-stream' }, payload: data });
    assert.equal(up.statusCode, 201);
    const { code } = up.json() as { code: string };
    assert.match(code, /^[A-Z2-9]{8}$/);

    const typed = `${code.slice(0, 4).toLowerCase()}-${code.slice(4)}`; // como lo tipea un usuario
    const down = await app.inject(`/api/transfers/${typed}`);
    assert.equal(down.statusCode, 200);
    assert.deepEqual(down.rawPayload, data);
    assert.equal((await app.inject(`/api/transfers/${code}`)).statusCode, 404);
  });

  it('rechaza archivos más grandes que el límite', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/transfers',
      headers: { 'content-type': 'application/octet-stream' },
      payload: Buffer.alloc(2048),
    });
    assert.equal(res.statusCode, 413);
  });

  it('bloquea a quien prueba muchos códigos', async () => {
    let last = 0;
    for (let i = 0; i < 21; i++) last = (await app.inject(`/api/transfers/${generateCode()}`)).statusCode;
    assert.equal(last, 429);
  });

  it('anuncia una actualización una sola vez, salvo a quien lo apagó', async () => {
    const on = await register();
    const off = await register();
    const put = await app.inject({ method: 'PUT', url: `/api/devices/${off.deviceId}`, headers: { authorization: `Bearer ${off.token}` }, payload: { updates: false, alerts: [] } });
    assert.equal(put.statusCode, 204);
    // Registrado con los avisos apagados desde el principio.
    await app.inject({ method: 'POST', url: '/api/devices', payload: { subscription, ...prefs, updates: false } });
    const a = { version: '0.23.0', title: { es: 'VikArg 0.23', en: 'VikArg 0.23' }, body: { es: 'Novedades', en: 'News' } };

    assert.deepEqual(await announce(db, push, a, { dryRun: true }), { devices: 1, delivered: 0, removed: 0, failed: 0, errors: [], already: false });
    assert.equal(push.sent.length, 0);
    const r = await announce(db, push, a);
    assert.equal(r.delivered, 1);
    assert.deepEqual(push.sent[0]!.payload, { type: 'update', update: a });
    // La misma versión no se vuelve a mandar (salvo con force).
    assert.equal((await announce(db, push, a)).already, true);
    assert.equal(push.sent.length, 1);
    await announce(db, push, a, { force: true });
    assert.equal(push.sent.length, 2);
    // Una suscripción que ya no existe se borra.
    push.gone = true;
    assert.equal((await announce(db, push, { ...a, version: '0.24.0' })).removed, 1);
    assert.equal(db.prepare('SELECT 1 FROM devices WHERE id = ?').get(on.deviceId), undefined);
  });

  it('al anunciar, un dispositivo que falla deja el motivo y no corta a los demás', async () => {
    await register();
    await register();
    const a = { version: '0.25.0', title: { es: 'VikArg 0.25', en: 'VikArg 0.25' }, body: { es: 'Novedades', en: 'News' } };
    let n = 0;
    const flaky = {
      ...push,
      async send() {
        if (n++ === 0) throw new Error('fcm-not-configured');
        return true;
      },
    };
    const r = await announce(db, flaky as unknown as typeof push, a);
    assert.equal(r.delivered, 1);
    assert.equal(r.failed, 1);
    assert.deepEqual(r.errors, ['fcm-not-configured']);
  });

  it('valida los argumentos del anuncio', () => {
    const base = ['--version', '0.23.0', '--title-es', 'T', '--body-es', 'B', '--title-en', 'T', '--body-en', 'B'];
    assert.equal(parseAnnouncement(base).announcement.version, '0.23.0');
    assert.throws(() => parseAnnouncement(base.slice(0, 8)), /--body-en/);
    assert.throws(() => parseAnnouncement(['--version', 'v1', ...base.slice(2)]), /0\.23\.0/);
    assert.throws(() => parseAnnouncement([...base.slice(0, 2), '--title-es', 'x'.repeat(81), ...base.slice(4)]), /largo/);
  });

  it('normaliza códigos tipeados', () => {
    assert.equal(normalizeCode(' abcd-efgh '), 'ABCDEFGH');
  });
});
