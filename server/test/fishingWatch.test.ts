import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { openDb } from '../src/db.ts';
import { nextSeasonUrls, runFishingWatch } from '../src/fishing/watch.ts';

const DOCS = [{ label: 'Reglamento', url: 'https://example.org/reglamento.pdf' }];

function fakeFetch(bodies: Record<string, string | number>) {
  return (async (url: string | URL, init?: RequestInit) => {
    const b = bodies[String(url)];
    if (b === undefined || typeof b === 'number') return new Response(null, { status: typeof b === 'number' ? b : 404 });
    return new Response(init?.method === 'HEAD' ? null : b, { status: 200 });
  }) as typeof fetch;
}

test('pesca: avisa solo cuando cambia el reglamento (la primera vez guarda la huella)', async () => {
  const db = openDb(':memory:');
  const sent: string[] = [];
  const notifier = { send: async (s: string, t: string) => void sent.push(`${s}\n${t}`) };
  const now = new Date('2026-12-01T12:00:00Z');
  let r = await runFishingWatch(db, notifier, () => undefined, fakeFetch({ [DOCS[0]!.url]: 'versión 1' }), now, DOCS);
  assert.deepEqual([r.checked, r.changed.length], [1, 0]);
  assert.equal(sent.length, 0);
  r = await runFishingWatch(db, notifier, () => undefined, fakeFetch({ [DOCS[0]!.url]: 'versión 1' }), now, DOCS);
  assert.equal(sent.length, 0);
  r = await runFishingWatch(db, notifier, () => undefined, fakeFetch({ [DOCS[0]!.url]: 'versión 2' }), now, DOCS);
  assert.deepEqual(r.changed, ['Reglamento']);
  assert.equal(sent.length, 1);
  assert.match(sent[0]!, /Cambió: Reglamento/);
});

test('pesca: avisa una sola vez cuando aparece el reglamento de la temporada siguiente', async () => {
  const db = openDb(':memory:');
  const sent: string[] = [];
  const notifier = { send: async (s: string) => void sent.push(s) };
  const now = new Date('2026-12-01T12:00:00Z');
  const next = nextSeasonUrls(now)[0]!;
  assert.match(next.url, /2027-28/);
  const bodies = { [DOCS[0]!.url]: 'v1', [next.url]: 'nuevo' };
  let r = await runFishingWatch(db, notifier, () => undefined, fakeFetch(bodies), now, DOCS);
  assert.deepEqual(r.found, [next.label]);
  r = await runFishingWatch(db, notifier, () => undefined, fakeFetch(bodies), now, DOCS);
  assert.deepEqual(r.found, []);
  assert.equal(sent.length, 1);
});

test('pesca: una página caída no rompe la revisión ni avisa', async () => {
  const db = openDb(':memory:');
  const sent: string[] = [];
  const r = await runFishingWatch(db, { send: async (s) => void sent.push(s) }, () => undefined, fakeFetch({ [DOCS[0]!.url]: 503 }), new Date('2026-12-01T12:00:00Z'), DOCS);
  assert.deepEqual(r.failed, ['Reglamento']);
  assert.equal(sent.length, 0);
});
