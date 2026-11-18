import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compactAlerts, COUNT_SEPARATOR, KIT_SEPARATOR, MAX_ROWS } from '../src/alertPayload.ts';
import { runScheduler } from '../src/scheduler.ts';
import { openDb } from '../src/db.ts';

const kitRow = (item: string, kit: string) => ({ itemName: `${item}${KIT_SEPARATOR}${kit}`, kind: 'minStock', dueDate: null });

describe('carga de las alertas por push', () => {
  it('junta los faltantes de un botiquín en una fila con la cantidad y deja el resto igual', () => {
    const out = compactAlerts([kitRow('Gasa', 'Auto'), { itemName: 'Atún', kind: 'expiry', dueDate: '2026-12-01' }, kitRow('Venda', 'Auto'), kitRow('Guantes', 'Auto'), kitRow('Gasa', 'Mochila')]);
    assert.equal(out.length, 3);
    assert.equal(out[0]!.itemName, `Gasa${KIT_SEPARATOR}Auto${COUNT_SEPARATOR}3`);
    assert.equal(out[1]!.itemName, 'Atún');
    assert.equal(out[2]!.itemName, `Gasa${KIT_SEPARATOR}Mochila`);
  });

  it('con 40 faltantes de un botiquín la carga sigue chica (el servicio de push corta en ~4 KB)', () => {
    const many = Array.from({ length: 40 }, (_, i) => kitRow(`Artículo con un nombre bastante largo número ${i}`, 'Botiquín de la mochila de escape'));
    assert.ok(JSON.stringify(many).length > 4096, 'sin compactar se pasaba');
    assert.ok(JSON.stringify(compactAlerts(many)).length < 600);
  });

  it('nunca manda más de MAX_ROWS filas', () => {
    const rows = Array.from({ length: 80 }, (_, i) => ({ itemName: `Artículo ${i}`, kind: 'expiry', dueDate: '2026-12-01' }));
    assert.equal(compactAlerts(rows).length, MAX_ROWS);
  });

  it('un envío que falla (413) no corta la pasada de los demás dispositivos', async () => {
    const db = openDb(':memory:');
    const insertDevice = db.prepare('INSERT INTO devices (id, token_hash, subscription, timezone, notify_hour, language, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const insertAlert = db.prepare('INSERT INTO alerts (device_id, lot_id, item_name, kind, due_date, notify_from) VALUES (?, ?, ?, ?, ?, ?)');
    for (const id of ['a', 'b']) {
      insertDevice.run(id, 'h', JSON.stringify({ endpoint: `https://push/${id}`, keys: { p256dh: 'x', auth: 'y' } }), 'UTC', 0, 'es', '', '');
      insertAlert.run(id, `${id}1`, 'Atún', 'expiry', '2026-12-01', '2026-11-01');
    }
    const sent: string[] = [];
    const push = {
      publicKey: 'k',
      async send(sub: { endpoint: string }) {
        if (sub.endpoint.endsWith('/a')) throw new Error('413');
        sent.push(sub.endpoint);
        return true;
      },
    };
    const result = await runScheduler(db, push as never, new Date('2026-11-17T12:00:00Z'));
    assert.deepEqual(sent, ['https://push/b']);
    assert.equal(result.sent, 1);
    // El que falló no quedó marcado como revisado: se reintenta en la próxima pasada.
    const a = db.prepare('SELECT last_notified_day FROM devices WHERE id = ?').get('a') as { last_notified_day: string | null };
    assert.equal(a.last_notified_day, null);
  });
});
