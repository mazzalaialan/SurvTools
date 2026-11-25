import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fieldText, provinceBySlug, STATUSES, whereHunted, type FaunaData } from './fauna';

const data = JSON.parse(readFileSync(new URL('../../../public/data/fauna-AR.json', import.meta.url), 'utf8')) as FaunaData;

describe('datos de fauna', () => {
  it('trae las 23 provincias, cada una con un estado que el mapa sabe pintar', () => {
    expect(data.provinces).toHaveLength(23);
    for (const p of data.provinces) expect(STATUSES).toContain(p.status);
  });

  it('Entre Ríos sale judicializada (naranja en el mapa) y con aviso', () => {
    const er = provinceBySlug(data, 'entre-rios');
    expect(er?.status).toBe('judicializada');
    expect(er?.warning).toMatch(/judicializada/);
  });

  it('cada ficha tiene nombre y cada especie cazable aparece en alguna zona', () => {
    for (const sp of data.species) expect(sp.nombre.es).toBeTruthy();
    expect(whereHunted(data, 'jabali').length).toBeGreaterThan(3);
  });

  it('fieldText acepta texto o un objeto de textos', () => {
    expect(fieldText('a')).toEqual([{ text: 'a' }]);
    expect(fieldText({ canto: 'b', x: 1 })).toEqual([{ label: 'canto', text: 'b' }]);
    expect(fieldText(null)).toEqual([]);
  });
});
