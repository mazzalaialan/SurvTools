import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { openDb } from '../src/db.ts';
import type { PushPayload, PushSender, PushSubscriptionJson } from '../src/push.ts';
import type { BrCatalogStation, BrLevels, BrStation } from '../src/rivers/br.ts';
import { brRiverLevels, brRiverStations } from '../src/rivers/brWatch.ts';
import { riverState, runRiverWatch, stationsToWatch } from '../src/rivers/watch.ts';

class FakePush implements PushSender {
  publicKey = 'k';
  sent: PushPayload[] = [];
  async send(_s: PushSubscriptionJson, payload: PushPayload) {
    this.sent.push(payload);
    return true;
  }
}

const sub = JSON.stringify({ endpoint: 'https://push.example.com/x', keys: { p256dh: 'p', auth: 'a' } });
const now = new Date('2026-11-14T18:00:00Z');
// Uruguaiana: atención 650, alerta 750, inundación 850 cm.
const cat: BrCatalogStation[] = [
  { code: '77150000', name: 'Uruguaiana', river: 'Uruguai', muni: 'Uruguaiana-RS', lat: -29.7547, lon: -57.0858, basin: 'uruguai', thresholds: { attention: 650, alert: 750, flood: 850 } },
  { code: '99999999', name: 'Sin cotas', river: 'X', muni: 'Y-RS', lat: -29.7547, lon: -57.0858, basin: 'uruguai', thresholds: null },
];
const stations = brRiverStations(cat);
const levels = (cm: number, hoursAgo = 1): BrLevels => ({
  fetchedAt: now.getTime(),
  failed: [],
  stations: [{ ...cat[0]!, level: cm, at: new Date(now.getTime() - hoursAgo * 3_600_000).toISOString().replace('Z', '+00:00'), flow: null, changeCm: null, changeHours: null, trend: null } as BrStation],
});

function setup(lat = -29.76, lon = -57.09, hazards = 1) {
  const db = openDb(':memory:');
  db.prepare(`INSERT INTO devices (id, token_hash, subscription, timezone, notify_hour, language, hazards, created_at, updated_at) VALUES ('d', 'h', ?, 'America/Sao_Paulo', 9, 'pt', ?, '', '')`).run(sub, hazards);
  db.prepare(`INSERT INTO rain_places (device_id, place_id, label, lat, lon) VALUES ('d', 'w1', 'Casa', ?, ?)`).run(lat, lon);
  return db;
}

describe('avisos de ríos de Brasil (ANA + SGB)', () => {
  it('pasa las cotas de cm a metros y deja afuera las estaciones sin cotas', () => {
    assert.equal(stations.length, 1);
    assert.deepEqual([stations[0]!.attention, stations[0]!.alert, stations[0]!.evac], [6.5, 7.5, 8.5]);
    assert.equal(brRiverLevels(levels(700)).get(77150000)!.level, 7);
  });

  it('estado por umbral: atención, alerta, inundación y normal', () => {
    const s = stations[0]!;
    assert.equal(riverState(6, s), 'normal');
    assert.equal(riverState(6.6, s), 'attention');
    assert.equal(riverState(7.6, s), 'alert');
    assert.equal(riverState(8.6, s), 'evac');
  });

  it('avisa cada escalón una sola vez y marca la fuente y el umbral', async () => {
    const db = setup();
    const push = new FakePush();
    assert.equal((await runRiverWatch(db, push, stations, brRiverLevels(levels(660)), now)).sent, 1);
    const r = push.sent[0]!.river!;
    assert.deepEqual([r.state, r.source, r.threshold, r.level, r.station, r.label], ['attention', 'ANA', 6.5, 6.6, 'Uruguaiana', 'Casa']);
    assert.equal((await runRiverWatch(db, push, stations, brRiverLevels(levels(670)), now)).sent, 0);
    assert.equal((await runRiverWatch(db, push, stations, brRiverLevels(levels(760)), now)).sent, 1);
    assert.equal(push.sent[1]!.river!.state, 'alert');
    assert.equal((await runRiverWatch(db, push, stations, brRiverLevels(levels(860)), now)).sent, 1);
    assert.equal(push.sent[2]!.river!.state, 'evac');
    // Baja a alerta: ya se avisó la inundación.
    assert.equal((await runRiverWatch(db, push, stations, brRiverLevels(levels(760)), now)).sent, 0);
    // Vuelve a lo normal y sube otra vez: avisa de nuevo.
    assert.equal((await runRiverWatch(db, push, stations, brRiverLevels(levels(500)), now)).sent, 0);
    assert.equal((await runRiverWatch(db, push, stations, brRiverLevels(levels(660)), now)).sent, 1);
  });

  it('no se cruza con las claves de Argentina y solo avisa a lugares a menos de 5 km', async () => {
    const db = setup();
    const push = new FakePush();
    await runRiverWatch(db, push, stations, brRiverLevels(levels(760)), now);
    const keys = (db.prepare('SELECT event_key FROM hazard_notices').all() as { event_key: string }[]).map((k) => k.event_key);
    assert.deepEqual(keys, ['river:br:77150000']);
    const far = setup(-29.9, -57.09); // ~16 km
    assert.deepEqual(stationsToWatch(far, stations, now), []);
    assert.equal((await runRiverWatch(far, new FakePush(), stations, brRiverLevels(levels(900)), now)).sent, 0);
  });

  it('lectura vieja o dispositivo con avisos apagados: nada', async () => {
    const push = new FakePush();
    assert.equal((await runRiverWatch(setup(), push, stations, brRiverLevels(levels(900, 13)), now)).sent, 0);
    assert.equal((await runRiverWatch(setup(undefined, undefined, 0), push, stations, brRiverLevels(levels(900)), now)).sent, 0);
  });
});
