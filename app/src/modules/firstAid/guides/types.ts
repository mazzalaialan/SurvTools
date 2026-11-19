import type { Country, FirstAidEnv } from '@/core/settings/settings';

/** Texto en los dos idiomas de la app (la guía es contenido, no interfaz: vive junto). */
export interface L {
  es: string;
  en: string;
}

/** A quién llamar desde un paso (número en `CALLS`). */
export type CallKey = 'emergency' | 'same' | 'fire' | 'poison' | 'poisonKids' | 'burns';

export interface Step {
  text: L;
  /** Solo en ese entorno; sin `env`, vale para los dos. */
  env?: FirstAidEnv;
  /** "No hacer": se muestra resaltado. */
  dont?: boolean;
}

export interface Option {
  label: L;
  /** Otro paso del mismo tema, `topic:<id>` para pasar a otra guía o `topic:<id>#<paso>` a un paso de otra. */
  next: string;
}

export interface GuideNode {
  title: L;
  steps: Step[];
  /** Botones para llamar (en zona agreste se suma "Mi ubicación" para dar las coordenadas). */
  calls?: CallKey[];
  question?: L;
  options?: Option[];
}

export interface Topic {
  id: string;
  title: L;
  /** Para encontrarlo buscando ("yarará", "infarto"…). */
  keywords: L;
  start: string;
  nodes: Record<string, GuideNode>;
}

/** Números de cada país (los que no existen allí no se muestran: Uruguay atiende todo por el 911). */
export const CALLS: Record<Country, Partial<Record<CallKey, string>>> = {
  AR: { emergency: '911', same: '107', fire: '100', poison: '0800-333-0160', poisonKids: '0800-444-8694', burns: '011 4923-4082' },
  CL: { emergency: '133', same: '131', fire: '132', poison: '+56 2 2635 3800' },
  UY: { emergency: '911', fire: '104', poison: '1722' },
  // Bolivia: sin lista oficial (ver emergency/national.ts); sin centro toxicológico nacional.
  BO: { emergency: '110', same: '118', fire: '119' },
  // Perú: el SAMU (106) no llega a todas las regiones.
  PE: { emergency: '105', same: '106', fire: '116', poison: '+51 1 328 7700' },
  // Paraguay: el 911 atiende emergencias y policía; el SEME (141) es la ambulancia del Ministerio de Salud; el teléfono del CNTox no está confirmado en fuente oficial (ver emergency/national.ts).
  PY: { emergency: '911', same: '141', fire: '132' },
  // Brasil: 190 Policía Militar, 192 SAMU (ambulancia), 193 Bomberos; Disque-Intoxicação de la Anvisa (lista de la Anatel, 2026-11-19).
  BR: { emergency: '190', same: '192', fire: '193', poison: '0800 722 6001' },
};

/** Nombre del centro toxicológico de cada país, para el texto de la guía. */
const POISON_NAME: Record<Country, L> = {
  AR: { es: 'Centro Nacional de Intoxicaciones', en: 'the National Poison Center' },
  CL: { es: 'CITUC (centro toxicológico)', en: 'CITUC (poison center)' },
  UY: { es: 'CIAT (centro toxicológico)', en: 'CIAT (poison center)' },
  BO: { es: 'el centro toxicológico de tu departamento (CIATOX)', en: 'your department’s poison center (CIATOX)' },
  PE: { es: 'CICOTOX (centro toxicológico de la Universidad de San Marcos)', en: 'CICOTOX (San Marcos University poison center)' },
  PY: { es: 'el Centro Nacional de Toxicología (CNTox, Ministerio de Salud)', en: 'the National Toxicology Center (CNTox, Ministry of Health)' },
  BR: { es: 'el Disque-Intoxicação (Anvisa, red de centros de información toxicológica)', en: 'Disque-Intoxicação (Anvisa, network of poison information centers)' },
};

/**
 * Completa el texto de la guía con los números del país: {same} (ambulancia),
 * {emergency}, {fire}, {medical} ("107 o al 911", o uno solo si es el mismo) y
 * {poison} (nombre del centro toxicológico).
 */
export function fillGuideText(text: string, country: Country, lang: 'es' | 'en'): string {
  const calls = CALLS[country];
  const emergency = calls.emergency ?? '911';
  const same = calls.same ?? emergency;
  const medical = same === emergency ? same : `${same} ${lang === 'es' ? 'o al' : 'or'} ${emergency}`;
  return text
    .replaceAll('{medical}', medical)
    .replaceAll('{same}', same)
    .replaceAll('{emergency}', emergency)
    .replaceAll('{fire}', calls.fire ?? emergency)
    .replaceAll('{poison}', POISON_NAME[country][lang]);
}
