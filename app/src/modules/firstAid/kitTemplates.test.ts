import { describe, expect, it } from 'vitest';
import { CATALOG, GROUPS, LEVELS, SCENARIOS, buildList, matchesCatalog } from './kitTemplates';

describe('plantillas de botiquín', () => {
  it('todo lo que citan los escenarios existe en el catálogo, y todo artículo tiene grupo, nota y los dos idiomas', () => {
    for (const sc of SCENARIOS) for (const [id] of sc.lines) expect(CATALOG[id], `${sc.id}: ${id}`).toBeDefined();
    for (const [id, it] of Object.entries(CATALOG)) {
      expect(GROUPS, id).toContain(it.group);
      expect(it.name.es.length, id).toBeGreaterThan(2);
      expect(it.name.en.length, id).toBeGreaterThan(2);
      expect(it.note.es.length, id).toBeGreaterThan(5);
      expect(it.note.en.length, id).toBeGreaterThan(5);
    }
  });

  it('no hay dosis en ningún texto: los medicamentos son categorías', () => {
    const dose = /\b\d+(?:[.,]\d+)?\s?(mg|mcg|µg|ml|mL|g|ui|ui\/|gotas|comprimidos|cada\s+\d+\s*h)\b/i;
    for (const [id, it] of Object.entries(CATALOG)) {
      for (const t of [it.name.es, it.name.en, it.note.es, it.note.en, it.caution?.es ?? '', it.caution?.en ?? '']) expect(t, id).not.toMatch(dose);
    }
  });

  it('todo medicamento pide consultar al médico o farmacéutico', () => {
    for (const [id, it] of Object.entries(CATALOG)) {
      if (!it.medication) continue;
      expect(`${it.note.es} ${it.note.en}`, id).toMatch(/médico|farmacéutico|doctor|pharmacist/i);
    }
  });

  it('lo que requiere entrenamiento solo aparece desde el nivel Avanzado', () => {
    for (const sc of SCENARIOS) {
      const individual = buildList(sc.id, 'individual', sc.people, sc.days).map((l) => l.id);
      for (const id of individual) expect(CATALOG[id]!.trained ?? false, `${sc.id}: ${id}`).toBe(false);
    }
  });

  it('cada escenario devuelve una lista y el nivel avanzado nunca tiene menos que el individual', () => {
    for (const sc of SCENARIOS) {
      const ind = buildList(sc.id, 'individual', 1, 1);
      const adv = buildList(sc.id, 'advanced', 1, 1);
      expect(ind.length, sc.id).toBeGreaterThan(3);
      expect(adv.length, sc.id).toBeGreaterThanOrEqual(ind.length);
    }
  });

  it('las cantidades crecen con las personas y, en las salidas, con los días', () => {
    const one = buildList('trek', 'individual', 1, 1);
    const four = buildList('trek', 'individual', 4, 1);
    const longer = buildList('trek', 'individual', 1, 7);
    const qty = (l: ReturnType<typeof buildList>, id: string) => l.find((x) => x.id === id)?.qty ?? 0;
    expect(qty(four, 'gloves')).toBeGreaterThan(qty(one, 'gloves'));
    expect(qty(longer, 'ors')).toBeGreaterThan(qty(one, 'ors'));
    // En casa los días no cuentan.
    expect(buildList('home', 'individual', 2, 1)).toEqual(buildList('home', 'individual', 2, 30));
  });

  it('un artículo repetido en varios conjuntos se suma una sola vez', () => {
    const l = buildList('car', 'advanced', 1, 1);
    expect(new Set(l.map((x) => x.id)).size).toBe(l.length);
    expect(l.find((x) => x.id === 'tourniquet')!.qty).toBe(2);
  });

  it('un escenario desconocido da una lista vacía', () => expect(buildList('nada', 'individual', 1, 1)).toEqual([]));

  it('reconoce los artículos que la persona ya cargó con otro nombre', () => {
    expect(matchesCatalog('tourniquet', 'torniquete cat')).toBe(true);
    expect(matchesCatalog('hemostatic', 'gasa hemostática')).toBe(true);
    expect(matchesCatalog('pressure_bandage', 'vendaje de emergencia / vendaje israelí')).toBe(true);
    expect(matchesCatalog('tourniquet', 'gasa hemostática')).toBe(false);
    expect(matchesCatalog('sterile_dressing', 'apósitos estériles')).toBe(true);
  });

  it('los niveles son tres', () => expect(LEVELS).toHaveLength(3));
});

import { unitFor } from './kitTemplates';
describe('unidad en singular', () => {
  it('con 1 se dice «par», «rollo», «unidad»; con más, el plural; lo que no se conoce queda igual', () => {
    expect(unitFor(1, 'pares')).toBe('par');
    expect(unitFor(1, 'unidades')).toBe('unidad');
    expect(unitFor(1, 'units')).toBe('unit');
    expect(unitFor(2, 'pares')).toBe('pares');
    expect(unitFor(1, 'latas')).toBe('latas');
  });
});
