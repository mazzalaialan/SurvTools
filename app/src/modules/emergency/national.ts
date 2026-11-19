import type { ContactKind } from '@/core/model/types';
import type { Country } from '@/core/settings/settings';

/**
 * Números de emergencia por país. El texto de cada uno está en los idiomas
 * (`emergency.national.<id>`).
 *
 * - Argentina: argentina.gob.ar/tema/emergencias, Centro Nacional de
 *   Intoxicaciones, Red de Toxicología y Hospital de Quemados de la Ciudad de
 *   Buenos Aires, Línea de Salud Mental del Ministerio de Salud.
 * - Chile: SAMU, Bomberos, Carabineros, PDI y Armada; CITUC (Centro de
 *   Información Toxicológica UC); *4141 del Ministerio de Salud.
 * - Uruguay: 911 (todas las emergencias), Bomberos, Prefectura; CIAT (Hospital
 *   de Clínicas); Línea Vida (ASSE) y la línea de violencia doméstica (Inmujeres).
 * - Perú: lista oficial de gob.pe/547 (Presidencia del Consejo de Ministros).
 *   La Policía de Alta Montaña (USAM, Yungay) sale de guías de montaña: sin confirmar.
 * - Bolivia: 110 (policía) y 119 (bomberos) figuran en el sitio oficial de la
 *   Policía Boliviana (policia.bo, leído el 2026-11-11); el 118 (ambulancia) sale
 *   de guías de viaje de otros gobiernos (Canadá, República Checa): sin confirmar.
 *   Familia Segura: línea de apoyo psicológico de UNICEF Bolivia.
 * - Paraguay (consultado el 2026-11-16): el 911 (Policía y sistema nacional de emergencias, Ley 4739) lo traen la Embajada de Alemania y la
 *   ley; el 132 (Bomberos Voluntarios) y el 141 (SEME del Ministerio de Salud) salen de los sitios oficiales del CBVP y del MSPBS (el 132
 *   tuvo fallas técnicas en 2025: ver la nota del país); el de la SEN (Defensa Civil) de sen.gov.py/contacto. Sin confirmar en fuente oficial:
 *   CNTox (solo una nota de prensa), la línea 155 de salud mental (prensa y la Agencia IP), el 137 (violencia) y el 147 (niñez).
 *
 * - Brasil (consultado el 2026-11-19): los números salen de la lista de la Anatel (190 Policía Militar, 191 Policía Rodoviária Federal, 192 SAMU,
 *   193 Bomberos, 197 Policía Civil, 199 Defensa Civil, 188 CVV, 180 Atención a la Mujer); el 112 es solo celular y llega a la Policía Militar.
 *   Toxicología: Disque-Intoxicação 0800 722 6001 (Anvisa; las notas se contradicen sobre cuántas unidades tiene la red). Cruz Vermelha Brasileira:
 *   sin teléfono nacional vigente, no se carga.
 *
 * Los `unconfirmed` se muestran con esa aclaración y un enlace para avisar si no andan.
 */
export interface NationalNumber {
  id: string;
  number: string;
  kind: ContactKind;
  /** Sin fuente oficial: se muestra con una aclaración y un enlace para reportarlo. */
  unconfirmed?: boolean;
}

export const NATIONAL_NUMBERS: Record<Country, NationalNumber[]> = {
  AR: [
    { id: 'emergencies', number: '911', kind: 'police' },
    { id: 'same', number: '107', kind: 'medical' },
    { id: 'fire', number: '100', kind: 'fire' },
    { id: 'civilDefense', number: '103', kind: 'civilDefense' },
    { id: 'nautical', number: '106', kind: 'other' },
    { id: 'environmental', number: '105', kind: 'other' },
    { id: 'poison', number: '0800-333-0160', kind: 'medical' },
    { id: 'poisonKids', number: '0800-444-8694', kind: 'medical' },
    { id: 'burns', number: '011 4923-4082', kind: 'hospital' },
    { id: 'mentalHealth', number: '0800-999-0091', kind: 'medical' },
    { id: 'gender', number: '144', kind: 'other' },
  ],
  CL: [
    { id: 'clSamu', number: '131', kind: 'medical' },
    { id: 'clCarabineros', number: '133', kind: 'police' },
    { id: 'clFire', number: '132', kind: 'fire' },
    { id: 'clPdi', number: '134', kind: 'police' },
    { id: 'clMaritime', number: '137', kind: 'other' },
    { id: 'clPoison', number: '+56 2 2635 3800', kind: 'medical' },
    { id: 'clMentalHealth', number: '*4141', kind: 'medical' },
  ],
  UY: [
    { id: 'uyEmergencies', number: '911', kind: 'police' },
    { id: 'uyFire', number: '104', kind: 'fire' },
    { id: 'uyPrefectura', number: '106', kind: 'other' },
    { id: 'uyPoison', number: '1722', kind: 'medical' },
    { id: 'uyMentalHealth', number: '0800 0767', kind: 'medical' },
    { id: 'uyGender', number: '0800 4141', kind: 'other' },
  ],
  BO: [
    { id: 'boPolice', number: '110', kind: 'police' },
    { id: 'boAmbulance', number: '118', kind: 'medical', unconfirmed: true },
    { id: 'boFire', number: '119', kind: 'fire' },
    { id: 'boMentalHealth', number: '800 11 3040', kind: 'medical' },
    { id: 'boGender', number: '800 14 0348', kind: 'other', unconfirmed: true },
  ],
  PE: [
    { id: 'pePolice', number: '105', kind: 'police' },
    { id: 'peSamu', number: '106', kind: 'medical' },
    { id: 'peFire', number: '116', kind: 'fire' },
    { id: 'peCivilDefense', number: '115', kind: 'civilDefense' },
    { id: 'peInfosalud', number: '113', kind: 'medical' },
    { id: 'peRoadPolice', number: '110', kind: 'police' },
    { id: 'peRedCross', number: '01 266 0481', kind: 'medical' },
    { id: 'pePoison', number: '+51 1 328 7700', kind: 'medical' },
    { id: 'peMountain', number: '043 393333 / 043 493333', kind: 'other', unconfirmed: true },
    { id: 'peGender', number: '100', kind: 'other' },
  ],
  PY: [
    { id: 'pyEmergencies', number: '911', kind: 'police' },
    { id: 'pyFire', number: '132', kind: 'fire' },
    { id: 'pySeme', number: '141', kind: 'medical' },
    { id: 'pyCivilDefense', number: '0986 111 001', kind: 'civilDefense' },
    { id: 'pyPoison', number: '021 220 418', kind: 'medical', unconfirmed: true },
    { id: 'pyMentalHealth', number: '155', kind: 'medical', unconfirmed: true },
    { id: 'pyGender', number: '137', kind: 'other', unconfirmed: true },
    { id: 'pyKids', number: '147', kind: 'other', unconfirmed: true },
  ],
  BR: [
    { id: 'brPolice', number: '190', kind: 'police' },
    { id: 'brSamu', number: '192', kind: 'medical' },
    { id: 'brFire', number: '193', kind: 'fire' },
    { id: 'brCivilDefense', number: '199', kind: 'civilDefense' },
    { id: 'brRoadPolice', number: '191', kind: 'police' },
    { id: 'brCivilPolice', number: '197', kind: 'police' },
    { id: 'brPoison', number: '0800 722 6001', kind: 'medical' },
    { id: 'brMentalHealth', number: '188', kind: 'other' },
    { id: 'brWomen', number: '180', kind: 'other' },
  ],
};

/** Número para marcar: solo dígitos, "+" y "*" ("*4141"), y del primero si vienen varios ("0336-5408830/36"). */
export function dialable(phone: string): string {
  const first = phone.split(/[/,;]| o | y /)[0] ?? '';
  return first.replace(/[^\d+*#]/g, '');
}

/** Link a Google Maps: por dirección si la hay (más reconocible), si no por coordenadas. */
export function mapsUrl(address: string, lat: number | null, lon: number | null): string | null {
  const query = address.trim() || (lat !== null && lon !== null ? `${lat.toFixed(6)},${lon.toFixed(6)}` : '');
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
}
