import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { covers, parseCap } from '../src/official/cap.ts';
import { capLinks, createOfficialCache, fetchOfficial } from '../src/official/sources.ts';

// Respuestas reales del INMET (apiprevmet3.inmet.gov.br, 2026-11-19), recortadas: listas de áreas y municipios acortadas.
const fixture = (name: string) => readFileSync(new URL(`./fixtures/official/${name}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-11-19T18:30:00Z');
const BASE = 'https://apiprevmet3.inmet.gov.br/avisos/rss/';

describe('INMET (Brasil)', () => {
  it('RSS: un enlace por aviso, sin el del canal ni los avisos ya terminados', () => {
    const links = capLinks('INMET', fixture('inmet-rss.xml'), NOW);
    assert.deepEqual(links, [`${BASE}56459`, `${BASE}56458`, `${BASE}56457`]); // 56320 terminó el 9/11
    // Sin filtrar por fecha (atrás en el tiempo) entran los cuatro.
    assert.equal(capLinks('INMET', fixture('inmet-rss.xml'), Date.parse('2026-11-08T00:00:00Z')).length, 4);
  });

  it('CAP: aviso de tormenta en portugués, con vigencia, severidad y un polígono', () => {
    const [a, ...rest] = parseCap(fixture('inmet-cap-56459.xml'), 'INMET', 'https://avisos.inmet.gov.br');
    assert.equal(rest.length, 0);
    assert.equal(a!.source, 'INMET');
    assert.equal(a!.key, 'INMET:urn:oid:2.49.0.0.76.0.2026.28735.1:0');
    assert.equal(a!.senderName, 'Instituto Nacional de Meteorologia');
    assert.equal(a!.event, 'Tempestade');
    assert.equal(a!.severity, 'Moderate');
    assert.equal(a!.onset, '2026-11-22T09:33:00-03:00');
    assert.equal(a!.expires, '2026-11-22T23:59:00-03:00');
    assert.equal(a!.web, 'https://avisos.inmet.gov.br/56459');
    assert.match(a!.description, /granizo/);
    assert.match(a!.instruction, /Defesa Civil \(telefone 199\)/);
    assert.equal(a!.areas.length, 1);
    assert.equal(a!.areas[0]!.polygons[0]!.length, 142);
    assert.match(a!.areas[0]!.desc, /^Aviso para as áreas: Centro Goiano/);
  });

  it('CAP cancelado (msgType Cancel): no da alerta', () => {
    assert.equal(parseCap(fixture('inmet-cap-56400.xml'), 'INMET').length, 0);
  });

  it('cae o no cae en un lugar (el polígono del aviso)', () => {
    const [a] = parseCap(fixture('inmet-cap-56459.xml'), 'INMET');
    assert.ok(covers(a!, -16.68, -49.25)); // Goiânia
    assert.ok(covers(a!, -30.03, -51.22)); // Porto Alegre
    assert.ok(covers(a!, -25.54, -54.59)); // Foz do Iguaçu
    assert.ok(!covers(a!, -3.73, -38.52)); // Fortaleza (CE no figura en el aviso)
    assert.ok(!covers(a!, -29.75, -57.09)); // Uruguaiana
    assert.ok(!covers(a!, -34.6, -58.4)); // Buenos Aires
  });

  it('baja el RSS y solo los CAP vigentes, una vez cada uno', async () => {
    const calls: string[] = [];
    const fake = (async (url: string) => {
      calls.push(url);
      return new Response(url.endsWith('/rss') ? fixture('inmet-rss.xml') : fixture('inmet-cap-56459.xml'), { status: 200 });
    }) as unknown as typeof fetch;
    const cache = createOfficialCache();
    assert.equal((await fetchOfficial('INMET', cache, NOW, fake)).length, 3);
    assert.equal(calls.length, 4); // RSS + 3 CAP
    await fetchOfficial('INMET', cache, NOW, fake);
    assert.equal(calls.length, 5); // solo el RSS
    // Pasada la vigencia (23/11), no queda ninguna.
    assert.equal((await fetchOfficial('INMET', cache, Date.parse('2026-11-23T12:00:00Z'), fake)).length, 0);
  });
});
