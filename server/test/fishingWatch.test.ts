import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { getSetting, openDb } from '../src/db.ts';
import { keywordLines, nextSeasonUrls, runFishingWatch, watchDue } from '../src/fishing/watch.ts';

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
  const now = new Date('2027-10-01T12:00:00Z');
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
  const now = new Date('2027-10-01T12:00:00Z');
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
  const r = await runFishingWatch(db, { send: async (s) => void sent.push(s) }, () => undefined, fakeFetch({ [DOCS[0]!.url]: 503 }), new Date('2027-10-01T12:00:00Z'), DOCS);
  assert.deepEqual(r.failed, ['Reglamento']);
  assert.equal(sent.length, 0);
});

test('pesca: no revisa durante la vigencia, recién unos días antes de que termine', async () => {
  assert.equal(watchDue(new Date('2026-12-01T00:00:00Z')), false);
  assert.equal(watchDue(new Date('2027-09-20T00:00:00Z')), true);
  assert.equal(watchDue(new Date('2027-11-15T00:00:00Z')), true);
  const db = openDb(':memory:');
  let calls = 0;
  const r = await runFishingWatch(db, null, () => undefined, (async () => (calls++, new Response('x'))) as typeof fetch, new Date('2026-12-01T12:00:00Z'), DOCS);
  assert.equal(calls, 0);
  assert.equal(r.checked, 0);
});

test('pesca: cada documento se revisa según su propia vigencia', async () => {
  const db = openDb(':memory:');
  const docs = [
    { label: 'Común', url: 'https://example.org/comun.pdf' },
    { label: 'Santa Cruz', url: 'https://example.org/sc.pdf', validUntil: '2027-09-30' },
  ];
  const seen: string[] = [];
  const f = (async (url: string | URL) => (seen.push(String(url)), new Response('x'))) as typeof fetch;
  // Mediados de agosto de 2027: ya toca Santa Cruz (45 días antes del 30/09), todavía no el reglamento común (31/10).
  await runFishingWatch(db, null, () => undefined, f, new Date('2027-08-20T12:00:00Z'), docs);
  assert.deepEqual(seen, ['https://example.org/sc.pdf']);
});

test('pesca: vencida la norma sin la nueva, avisa una sola vez y deja guardada la última revisión', async () => {
  const db = openDb(':memory:');
  const sent: string[] = [];
  const docs = [{ label: 'Santa Cruz', url: 'https://example.org/sc.pdf', validUntil: '2027-09-30' }];
  const f = (async () => new Response('x')) as typeof fetch;
  let r = await runFishingWatch(db, { send: async (_s, t) => void sent.push(t) }, () => undefined, f, new Date('2027-10-05T12:00:00Z'), docs);
  assert.deepEqual(r.expired, ['Santa Cruz']);
  r = await runFishingWatch(db, { send: async (_s, t) => void sent.push(t) }, () => undefined, f, new Date('2027-10-06T12:00:00Z'), docs);
  assert.deepEqual(r.expired, []);
  assert.equal(sent.filter((t) => /Venció/.test(t)).length, 1);
  assert.match(getSetting(db, 'fishing-watch:last') ?? '', /"checked":1/);
});

test('pesca: en un sitio que cambia mucho, solo cuentan las líneas de pesca', () => {
  const a = keywordLines('<p>Noticia del lunes</p><p>Veda de pesca en el río Salí</p>', ['pesca', 'veda']);
  const b = keywordLines('<p>Otra noticia del martes</p><p>Veda de pesca en el río Salí</p>', ['pesca', 'veda']);
  assert.equal(a, b);
  assert.equal(a, 'Veda de pesca en el río Salí');
});
