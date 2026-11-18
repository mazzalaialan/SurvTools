import { describe, expect, it } from 'vitest';
import type { MedicalProfile } from '@/core/model/types';
import { ageYears, applyExtras, factsOf, personalize, type PersonFacts } from './kitPersonalize';
import { buildList } from './kitTemplates';

const person = (name: string, over: Partial<PersonFacts> = {}): PersonFacts => ({ name, ageYears: 35, allergies: '', conditions: '', hasMedication: false, ...over });
const by = (extras: ReturnType<typeof personalize>, id: string) => extras.filter((e) => e.id === id);

describe('personalizar el botiquín con las fichas médicas', () => {
  it('una alergia que puede ser grave (maní, abeja, anafilaxia) sugiere el autoinyector, dos por persona', () => {
    const e = personalize([person('Ana', { allergies: 'Maní (anafilaxia)' }), person('Luis', { allergies: 'picadura de abeja' })]);
    expect(by(e, 'epinephrine')[0]!.qty).toBe(4);
    expect(by(e, 'epinephrine')[0]!.names).toEqual(['Ana', 'Luis']);
    expect(by(e, 'antihistamine')).toHaveLength(1);
  });

  it('una alergia común (penicilina) solo agrega el antihistamínico, sin autoinyector', () => {
    const e = personalize([person('Ana', { allergies: 'Penicilina' })]);
    expect(by(e, 'epinephrine')).toHaveLength(0);
    expect(by(e, 'antihistamine')[0]!.kind).toBe('allergy');
  });

  it('los chicos (menos de 12) suman la jeringa dosificadora y el termómetro; los mayores de 65, tensiómetro y pastillero', () => {
    const e = personalize([person('Sofi', { ageYears: 6 }), person('Abuela', { ageYears: 78 }), person('Juan', { ageYears: 40 })]);
    expect(by(e, 'oral_syringe')[0]!.names).toEqual(['Sofi']);
    expect(by(e, 'bp_monitor')[0]!.names).toEqual(['Abuela']);
    expect(by(e, 'pill_organizer')).toHaveLength(1);
    expect(by(e, 'thermometer')).toHaveLength(2);
  });

  it('diabetes, asma y problemas cardíacos: azúcar y glucómetro, medicación para el asma «la indicada por tu médico», tensiómetro', () => {
    const e = personalize([person('A', { conditions: 'Diabetes tipo 2' }), person('B', { conditions: 'asma' }), person('C', { conditions: 'Hipertensión' })]);
    expect(by(e, 'sugar')[0]!.qty).toBe(2);
    expect(by(e, 'glucometer')[0]!.names).toEqual(['A']);
    expect(by(e, 'inhaler')[0]!.names).toEqual(['B']);
    expect(by(e, 'bp_monitor')[0]!.names).toEqual(['C']);
  });

  it('con medicación cargada, una «medicación personal» por persona; sin datos no se agrega nada', () => {
    expect(by(personalize([person('A', { hasMedication: true }), person('B', { hasMedication: true })]), 'personal_meds')[0]!.qty).toBe(2);
    expect(personalize([person('Nadie')])).toEqual([]);
    expect(personalize([])).toEqual([]);
  });

  it('suma a la plantilla: si el artículo ya estaba toma la mayor cantidad y agrega el motivo; los nuevos entran ordenados', () => {
    const base = buildList('bleeding', 'individual', 1, 1);
    expect(base.find((l) => l.id === 'epinephrine')).toBeUndefined();
    const lines = applyExtras(base, personalize([person('Ana', { allergies: 'maní', conditions: 'asma' })]));
    const epi = lines.find((l) => l.id === 'epinephrine')!;
    expect(epi.qty).toBe(2);
    expect(epi.why).toEqual([{ kind: 'severeAllergy', names: ['Ana'] }]);
    expect(lines.find((l) => l.id === 'inhaler')).toBeDefined();
    // Lo que ya estaba no pierde cantidad.
    expect(lines.find((l) => l.id === 'tourniquet')!.qty).toBe(base.find((l) => l.id === 'tourniquet')!.qty);
    // Con un escenario que ya lleva antihistamínico, queda con el motivo agregado.
    const home = applyExtras(buildList('home', 'individual', 4, 1), personalize([person('Ana', { allergies: 'Penicilina' })]));
    expect(home.find((l) => l.id === 'antihistamine')!.why!.map((w) => w.kind)).toEqual(['allergy']);
  });

  it('la edad se calcula con el cumpleaños y una fecha mala o vacía da null', () => {
    const today = new Date('2026-11-17T12:00:00Z');
    expect(ageYears('2020-11-18', today)).toBe(5);
    expect(ageYears('2020-11-17', today)).toBe(6);
    expect(ageYears(null, today)).toBeNull();
    expect(ageYears('basura', today)).toBeNull();
  });

  it('de una ficha real toma el nombre, la edad, las alergias, las condiciones y si toma medicación (sin dosis)', () => {
    const p = { name: 'Ana', birthDate: '1990-05-20', allergies: 'Maní', conditions: 'Asma', medications: [{ name: 'Levotiroxina', dose: '50 mcg', schedule: '' }, { name: ' ', dose: '', schedule: '' }] } as MedicalProfile;
    const f = factsOf(p, new Date('2026-11-17T12:00:00Z'));
    expect(f).toEqual({ name: 'Ana', ageYears: 36, allergies: 'Maní', conditions: 'Asma', hasMedication: true });
    expect(JSON.stringify(f)).not.toContain('mcg');
  });
});
