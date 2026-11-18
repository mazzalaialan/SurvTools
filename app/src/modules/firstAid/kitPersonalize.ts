import type { MedicalProfile } from '@/core/model/types';
import { CATALOG, GROUPS, type BuiltLine } from './kitTemplates';

/**
 * Personaliza un botiquín con los datos de las fichas médicas elegidas (alergias, edad, condiciones y medicación). Todo se calcula en el
 * dispositivo; solo se agregan artículos o categorías (nunca dosis) y el motivo se muestra en pantalla, sin guardarse en el botiquín.
 */
export interface PersonFacts {
  name: string;
  ageYears: number | null;
  allergies: string;
  conditions: string;
  hasMedication: boolean;
}

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const has = (text: string, words: string[]) => words.some((w) => strip(text).includes(w));

/** Reacciones que pueden ser anafilaxia: el médico decide si hace falta un autoinyector; la app lo sugiere con ese aviso. */
const SEVERE_ALLERGY = ['anafil', 'grave', 'sever', 'shock', 'abeja', 'avispa', 'himenopter', 'mani', 'cacahuate', 'nuez', 'nueces', 'frutos secos', 'marisco', 'pescado'];
const DIABETES = ['diabet'];
const RESPIRATORY = ['asma', 'bronqui', 'epoc', 'respirator'];
const HEART = ['cardi', 'hipertens', 'presion alta', 'arritmia', 'infarto', 'marcapaso', 'coronari'];

export function ageYears(birthDate: string | null, today: Date): number | null {
  if (!birthDate) return null;
  const b = new Date(`${birthDate}T12:00:00Z`);
  if (Number.isNaN(b.getTime())) return null;
  let age = today.getUTCFullYear() - b.getUTCFullYear();
  const m = today.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && today.getUTCDate() < b.getUTCDate())) age--;
  return age;
}

export function factsOf(p: MedicalProfile, today: Date = new Date()): PersonFacts {
  return {
    name: p.name,
    ageYears: ageYears(p.birthDate, today),
    allergies: p.allergies ?? '',
    conditions: p.conditions ?? '',
    hasMedication: (p.medications ?? []).some((m) => m.name.trim() !== ''),
  };
}

export interface Extra {
  id: string;
  qty: number;
  kind: string;
  names: string[];
}

/** Qué se agrega o se refuerza según las personas elegidas. */
export function personalize(people: PersonFacts[]): Extra[] {
  const out: Extra[] = [];
  const add = (kind: string, who: PersonFacts[], items: [string, number][]) => {
    if (!who.length) return;
    for (const [id, qty] of items) out.push({ id, qty, kind, names: who.map((p) => p.name) });
  };
  const withAllergy = people.filter((p) => p.allergies.trim() !== '');
  const severe = withAllergy.filter((p) => has(p.allergies, SEVERE_ALLERGY));
  add('severeAllergy', severe, [['epinephrine', Math.min(8, 2 * severe.length)], ['antihistamine', 1]]);
  add('allergy', withAllergy.filter((p) => !severe.includes(p)), [['antihistamine', 1]]);
  add('child', people.filter((p) => p.ageYears !== null && p.ageYears < 12), [['oral_syringe', 1], ['thermometer', 1]]);
  add('older', people.filter((p) => p.ageYears !== null && p.ageYears >= 65), [['bp_monitor', 1], ['pill_organizer', 1], ['thermometer', 1]]);
  const diabetic = people.filter((p) => has(p.conditions, DIABETES));
  add('diabetes', diabetic, [['sugar', Math.min(6, 2 * diabetic.length)], ['glucometer', Math.min(3, diabetic.length)]]);
  const respiratory = people.filter((p) => has(p.conditions, RESPIRATORY));
  add('asthma', respiratory, [['inhaler', Math.min(6, respiratory.length)]]);
  const heart = people.filter((p) => has(p.conditions, HEART));
  add('heart', heart, [['bp_monitor', 1], ['med_card', Math.min(4, heart.length)]]);
  const meds = people.filter((p) => p.hasMedication);
  add('meds', meds, [['personal_meds', Math.min(8, meds.length)]]);
  return out;
}

/** Suma lo personalizado a la lista de la plantilla: si el artículo ya estaba, se queda con la mayor cantidad y suma el motivo. */
export function applyExtras(lines: BuiltLine[], extras: Extra[]): BuiltLine[] {
  const byId = new Map(lines.map((l) => [l.id, { ...l, why: [...(l.why ?? [])] }]));
  for (const e of extras) {
    const item = CATALOG[e.id];
    if (!item) continue;
    const line = byId.get(e.id) ?? { id: e.id, item, qty: 0, why: [] };
    line.qty = Math.max(line.qty, e.qty);
    const found = line.why!.find((w) => w.kind === e.kind);
    if (found) found.names = [...new Set([...found.names, ...e.names])];
    else line.why!.push({ kind: e.kind, names: e.names });
    byId.set(e.id, line);
  }
  return [...byId.values()].sort((a, b) => GROUPS.indexOf(a.item.group) - GROUPS.indexOf(b.item.group) || a.item.name.es.localeCompare(b.item.name.es, 'es'));
}
