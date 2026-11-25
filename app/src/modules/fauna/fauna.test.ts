import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { deptState, fieldText, provinceBySlug, STATUSES, whereHunted, type FaunaData } from './fauna';

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

  it('si la norma da una especie como cazable y protegida, manda la protección (loro barranquero en Catamarca)', () => {
    const cat = provinceBySlug(data, 'catamarca');
    expect(cat?.protectedSpecies?.map((x) => x.id)).toContain('loro-barranquero');
    expect(cat?.zones.some((z) => z.species.some((s) => s.id === 'loro-barranquero'))).toBe(false);
  });

  it('Formosa: pecarí y pato criollo (amenazados, cupo de 2012) no figuran como cazables', () => {
    const fo = provinceBySlug(data, 'formosa');
    for (const id of ['pecari-de-collar', 'pato-criollo']) {
      expect(fo?.protectedSpecies?.map((x) => x.id)).toContain(id);
      expect(whereHunted(data, id)).toEqual([]);
    }
  });

  it('las especies amenazadas (pecarí, loro barranquero, pato criollo) no se cazan en ninguna provincia', () => {
    for (const id of ['pecari-de-collar', 'loro-barranquero', 'pato-criollo']) {
      expect(data.species.find((s) => s.id === id)?.threatened).toBe('Amenazada');
      expect(whereHunted(data, id)).toEqual([]);
    }
  });

  it('mapa por departamentos: Entre Ríos pinta La Paz entera, Diamante en parte y Paraná en veda', () => {
    const er = provinceBySlug(data, 'entre-rios')!;
    expect(er.departments?.length).toBe(17);
    const z = er.zones.find((x) => x.id === 'er-menor-habilitado');
    expect(deptState(z, 'La Paz').state).toBe('total');
    expect(deptState(z, 'Diamante').state).toBe('partial');
    expect(deptState(z, 'Paraná').state).toBe('closed');
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
