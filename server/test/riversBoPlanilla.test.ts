import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { parsePlanilla, type PlanillaItem } from '../src/rivers/boPlanilla.ts';

// La planilla real del 13-11-2026 (textos con posición, extraídos con unpdf): 9 páginas, ~80 filas.
const pages = JSON.parse(readFileSync(new URL('./fixtures/bo-planilla-items.sample.json', import.meta.url), 'utf8')) as PlanillaItem[][];

describe('planilla del pronóstico hidrológico de Bolivia', () => {
  const planilla = parsePlanilla(pages, '2026-11-13', 'https://x/p.pdf')!;
  const by = (station: string) => planilla.rows.filter((r) => r.station === station);

  it('lee todas las filas de las 9 páginas con su amenaza', () => {
    assert.ok(planilla);
    assert.equal(planilla.rows.length, 80);
    const count = (t: string) => planilla.rows.filter((r) => r.threat === t).length;
    assert.equal(count('orange'), 25);
    assert.equal(count('yellow'), 55);
    assert.equal(count('red'), 0);
    assert.equal(planilla.issuedOn, '2026-11-13');
  });

  it('une las celdas partidas en varias líneas: estación, río y período', () => {
    const gumucio = planilla.rows.find((r) => r.station === 'Puente Gumucio');
    assert.ok(gumucio);
    assert.equal(gumucio.river, 'Espiritu Santo');
    assert.equal(gumucio.threat, 'orange');
    assert.equal(gumucio.trend, 'rises');
    assert.equal(gumucio.period, '14 al 16, 17 al 19, 20 al 23, 23 al 25, 25 al 27 noviembre');
    const loro = planilla.rows.find((r) => r.station === 'Pico de loro');
    assert.ok(loro);
    assert.equal(loro.period, '13 al 15, 18 al 20, 21 al 23, 24 al 25, 25 al 28 noviembre');
  });

  it('cuánto falta para el desborde, con su unidad según la tabla (caudal en m³/s, nivel en metros) o sin dato', () => {
    const corani = planilla.rows.find((r) => r.station === 'Corani');
    assert.deepEqual({ v: corani?.untilOverflow, u: corani?.unit }, { v: 218.69, u: 'm3s' });
    const abra = planilla.rows.find((r) => r.station === 'Abra' && r.river === 'Rocha');
    assert.deepEqual({ v: abra?.untilOverflow, u: abra?.unit }, { v: null, u: null }); // «-»
    assert.ok(planilla.rows.every((r) => r.unit === null || r.untilOverflow !== null));
  });

  it('una fila de cada tabla: ninguna sale vacía ni mezclada con la vecina', () => {
    for (const r of planilla.rows) {
      assert.ok(r.station.length > 1 && r.station.length < 40, r.station);
      assert.ok(r.period.length > 5, `${r.station}: ${r.period}`);
      assert.ok(r.river.length < 40, `${r.station}: ${r.river}`);
    }
    assert.ok(by('Corani').length >= 1);
  });

  it('si no se reconoce el formato, null y no datos dudosos', () => {
    assert.equal(parsePlanilla([], '2026-11-13'), null);
    assert.equal(parsePlanilla([[['Amenaza', 244, 600], ['Naranja', 247, 560]]], '2026-11-13'), null);
  });
});
