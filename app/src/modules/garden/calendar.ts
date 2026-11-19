import { CROP_BY_ID, CROPS, type Crop } from './crops';
import type { Country, GardenZone } from '@/core/settings/settings';

/**
 * Calendario de siembra por zona (ARQUITECTURA §10.1). Meses en que se
 * siembra directo (S), se hace almácigo (A) y se trasplanta (T). La cosecha se
 * calcula con los días a cosecha de cada ficha, salvo donde la fuente la da
 * aparte (perennes y ajo).
 *
 * Fuentes: Pampeana, Planificador ProHuerta (INTA 2012) y Manual de cultivos
 * para la huerta orgánica familiar (Goites, INTA 2008), controlado con el
 * Calendario de siembra para La Pampa (INTA EEA Anguil). Patagonia norte,
 * Calendario de cultivo a campo para el norte de la Patagonia (INTA EEA Alto
 * Valle) y del Valle Inferior del río Negro (INTA EEA Valle Inferior). Cuyo,
 * temporadas de Mendoza (INTA AER Rivadavia) sobre el calendario de Alto Valle.
 * Zanahoria y lechuga de Patagonia norte, ampliadas con el Calendario de siembra otoño-invierno
 * y primavera-verano del Valle Inferior (Cecchini y Guerrero, INTA EEA Valle Inferior, 2023;
 * repositorio.inta.gob.ar/handle/20.500.12123/14512, CC BY-NC-SA: solo se toman los meses).
 * NOA, Calendario de huerta agroecológica de La Rioja (INTA EEA La Rioja).
 * Patagonia sur y andina, Planificador de huerta del sur de Santa Cruz (INTA
 * EEA Santa Cruz). NEA: sin cartilla regional; estimado.
 * Valles de Bolivia: Manual para el cultivo de hortalizas, Valle Central de
 * Tarija (Organización Esperanza Bolivia y Louvain Coopération, 2016). No es
 * una fuente oficial y sus cuadros son gráficos: los meses se leyeron a ojo
 * (±1 mes). Las filas "Siembra" van como siembra directa; donde el cuadro solo
 * tiene "Cultivo" (la planta en el campo), siembra o trasplante son los
 * primeros tres meses de esa franja. Cosecha: la de los cuadros.
 * Trópico y Yungas de Bolivia: cuadro de siembra de «Construyamos nuestra huerta
 * familiar» (proyecto Jatun Sacha, con apoyo de UNODC): una sola fuente, no oficial,
 * que no distingue siembra directa de almácigo (se carga todo como siembra) ni los
 * Yungas del trópico. La cosecha se calcula con los días a cosecha de cada ficha.
 */

export const ZONES = ['pampeana', 'nea', 'noa', 'cuyo', 'patagoniaNorte', 'patagoniaSur', 'vallesBolivia', 'tropicoBolivia', 'sierraPeru'] as const;
export type Zone = (typeof ZONES)[number];
// El tipo de Ajustes tiene que coincidir con esta lista.
const _sameZones: Zone extends GardenZone ? (GardenZone extends Zone ? true : never) : never = true;
void _sameZones;

/** Zonas sin cartilla del INTA: el calendario es una estimación. */
export const ESTIMATED_ZONES: ReadonlySet<Zone> = new Set(['nea', 'vallesBolivia', 'tropicoBolivia', 'sierraPeru']);

export interface ZoneEntry {
  /** Siembra directa. */
  S?: string;
  /** Almácigo (o vasito protegido). */
  A?: string;
  /** Trasplante. */
  T?: string;
  /** Cosecha, cuando la fuente la da y no conviene calcularla. */
  H?: string;
  /** En esta zona va bajo cubierta (invernadero o túnel). */
  cover?: boolean;
}

type ZoneTable = Record<string, ZoneEntry>;

const PAMPEANA: ZoneTable = {
  acelga: { S: '2-6,8-12' },
  achicoria: { S: '2-4,8-10', A: '2-4,8-9' },
  ajo: { S: '3-5', H: '11-12' },
  albahaca: { A: '8', S: '9-11', T: '10-11' },
  apio: { A: '9-3', T: '11-5' },
  arveja: { S: '3-8' },
  batata: { A: '7-8', T: '10-11' },
  berenjena: { A: '7-10', T: '10-12' },
  brocoli: { A: '2-4,9-10', T: '4-5,11' },
  coliflor: { A: '2-4,9-10', T: '4-6,11-12' },
  cebolla: { A: '2-4', T: '5-7' },
  verdeo: { S: '2-5,8-11', A: '2-4,8-9' },
  chaucha: { S: '9-12,2' },
  choclo: { S: '9-1' },
  cilantro: { S: '2-4,8-10' },
  escarola: { S: '2-4,8-10', A: '2-4,8-9' },
  esparrago: { A: '8-9', T: '7-8', H: '9-11' },
  espinaca: { S: '2-8' },
  frutilla: { T: '3-5', H: '10-12' },
  haba: { S: '3-6' },
  hinojo: { S: '1-4', A: '1-3' },
  lechuga: { S: '2-12', A: '2-11' },
  melon: { A: '8', S: '9-10' },
  papa: { S: '8-9,1-2' },
  pepino: { A: '8', S: '9-11' },
  perejil: { S: '2-3,9-10' },
  pimiento: { A: '7-9', T: '10-11' },
  puerro: { A: '2-5,8-9', T: '5-7,10-11' },
  rabanito: { S: '2-6,9-12' },
  radicheta: { S: '2-5,8-10' },
  remolacha: { S: '3-6,8-12' },
  repollo: { A: '2-4,9-11', T: '4-6,11-12' },
  rucula: { S: '2-5,8-10' },
  sandia: { A: '8', S: '9-10' },
  tomate: { A: '7-10', T: '9-11' },
  zanahoria: { S: '1-12' },
  zapallo: { A: '8', S: '9-11' },
  zapallito: { A: '8', S: '9-1' },
};

const PATAGONIA_NORTE: ZoneTable = {
  acelga: { S: '8-11,2-3' },
  achicoria: { S: '2-4,8-11' },
  ajo: { S: '3-5', H: '11-12' },
  albahaca: { A: '9', T: '10-12' },
  apio: { A: '8-9', T: '10-12' },
  arveja: { S: '4-5,8' },
  batata: { A: '8-9', T: '10-11' },
  berenjena: { A: '8-9', T: '10-11' },
  brocoli: { A: '8-9,12', T: '10,1-2' },
  coliflor: { A: '8-9,12', T: '10,1' },
  cebolla: { A: '6-7', T: '9-10' },
  verdeo: { S: '2-4,8-10' },
  chaucha: { S: '10-12,1' },
  choclo: { S: '10-12' },
  cilantro: { S: '2-3,8-11' },
  escarola: { S: '2-4,8-11' },
  esparrago: { A: '9-10', T: '8-9', H: '10-12' },
  espinaca: { S: '2-4,8' },
  frutilla: { T: '3-4', H: '11-1' },
  haba: { S: '3-5,8' },
  hinojo: { S: '1-3' },
  lechuga: { S: '8-5', A: '8-5' },
  melon: { S: '10-11' },
  papa: { S: '10-11' },
  pepino: { S: '10-12' },
  perejil: { S: '2-3,8-11' },
  pimiento: { A: '8-9', T: '10-11' },
  puerro: { A: '2,8-9', T: '3-4,10-11' },
  rabanito: { S: '2-5,8-11' },
  radicheta: { S: '2-4,8-10' },
  remolacha: { S: '8-11,2-4' },
  repollo: { A: '8-9,1-2', T: '10-11,3-4' },
  rucula: { S: '2-5,8' },
  sandia: { S: '10-11' },
  tomate: { A: '8-9', T: '10-11' },
  zanahoria: { S: '8-3' },
  zapallo: { S: '10-11' },
  zapallito: { S: '10-12,1' },
};

/** Cuyo: como Alto Valle (valle irrigado con heladas), con las temporadas de Mendoza: almácigos de verano en julio y agosto. */
const CUYO: ZoneTable = {
  ...PATAGONIA_NORTE,
  albahaca: { A: '8-9', T: '10-11' },
  berenjena: { A: '7-8', T: '9-11' },
  pimiento: { A: '7-8', T: '9-11' },
  tomate: { A: '7-8', T: '9-11' },
  batata: { A: '7-8', T: '10-11' },
  choclo: { S: '9-12' },
  chaucha: { S: '9-12,1' },
  melon: { S: '9-11' },
  sandia: { S: '9-11' },
  pepino: { S: '9-12' },
  zapallo: { S: '9-11' },
  zapallito: { S: '9-12,1' },
  papa: { S: '8-10,1-2' },
  frutilla: { T: '3-4', H: '10-12' },
  esparrago: { A: '8-9', T: '7-8', H: '9-11' },
};

/** NOA (La Rioja): otoño-invierno se siembra en febrero y marzo; primavera-verano, almácigos en julio y siembra en agosto y septiembre. */
const NOA: ZoneTable = {
  acelga: { S: '2-11' },
  achicoria: { A: '2-4', T: '4-5' },
  ajo: { S: '2-4', H: '10-11' },
  albahaca: { A: '7-8', S: '9-11', T: '9-10' },
  apio: { A: '2-3,8-9', T: '4-5,10' },
  arveja: { S: '3-5' },
  batata: { A: '7', T: '9-10' },
  berenjena: { A: '7', T: '8-10' },
  brocoli: { A: '2-3', T: '4-5' },
  coliflor: { A: '2-3', T: '4-5' },
  cebolla: { A: '2-4', T: '5-6' },
  verdeo: { S: '2-4,8-10' },
  chaucha: { S: '8-10,1-2' },
  choclo: { S: '8-11' },
  cilantro: { S: '2-4,8-9' },
  escarola: { A: '2-4', T: '4-5' },
  esparrago: { A: '8', T: '7', H: '8-10' },
  espinaca: { S: '2-5' },
  frutilla: { T: '3-5', H: '8-11' },
  haba: { S: '3-5' },
  hinojo: { S: '2-4' },
  lechuga: { S: '2-11', A: '2-10' },
  melon: { S: '8-10' },
  papa: { S: '7-8,1-2' },
  pepino: { S: '8-10' },
  perejil: { S: '2-4,8-9' },
  pimiento: { A: '7', T: '8-10' },
  puerro: { A: '2-3', T: '4-6' },
  rabanito: { S: '2-11' },
  radicheta: { S: '2-5' },
  remolacha: { S: '2-4,8-9' },
  repollo: { A: '2-3', T: '4-5' },
  rucula: { S: '2-5,8-9' },
  sandia: { S: '8-10' },
  tomate: { A: '7', T: '8-9' },
  zanahoria: { S: '2-4,8-9' },
  zapallo: { S: '8-10' },
  zapallito: { S: '8-10,1-2' },
};

/**
 * NEA (estimado): clima subtropical, heladas suaves y verano muy caluroso y
 * húmedo. Las hojas se hacen en otoño e invierno; las de fruto, temprano en
 * primavera y una segunda vez al final del verano.
 */
const NEA: ZoneTable = {
  acelga: { S: '3-9' },
  achicoria: { A: '3-6', T: '4-7' },
  ajo: { S: '3-4', H: '9-10' },
  albahaca: { A: '7-8', S: '8-11', T: '9-10' },
  apio: { A: '2-4', T: '4-6' },
  arveja: { S: '4-6' },
  batata: { A: '7-8', T: '9-11' },
  berenjena: { A: '6-7', T: '8-9' },
  brocoli: { A: '2-4', T: '4-6' },
  coliflor: { A: '2-4', T: '4-6' },
  cebolla: { A: '3-4', T: '5-6' },
  verdeo: { S: '3-8' },
  chaucha: { S: '8-10,2-4' },
  choclo: { S: '8-11,1-2' },
  cilantro: { S: '3-8' },
  escarola: { A: '3-6', T: '4-7' },
  espinaca: { S: '4-7' },
  frutilla: { T: '3-5', H: '7-10' },
  haba: { S: '4-6' },
  hinojo: { S: '3-5' },
  lechuga: { S: '3-9', A: '2-8' },
  melon: { S: '8-10' },
  papa: { S: '6-8' },
  pepino: { S: '8-10,2-3' },
  perejil: { S: '3-8' },
  pimiento: { A: '6-7', T: '8-9' },
  puerro: { A: '3-5', T: '5-7' },
  rabanito: { S: '3-9' },
  radicheta: { S: '3-8' },
  remolacha: { S: '3-8' },
  repollo: { A: '2-4', T: '4-6' },
  rucula: { S: '3-8' },
  sandia: { S: '8-10' },
  tomate: { A: '6-7,1', T: '8-9,2-3' },
  zanahoria: { S: '3-8' },
  zapallo: { S: '8-10' },
  zapallito: { S: '8-10,2-3' },
};

/** Patagonia sur y andina (sur de Santa Cruz). Lo que no figura no se recomienda al aire libre. */
const PATAGONIA_SUR: ZoneTable = {
  acelga: { S: '8-3' },
  ajo: { S: '4', H: '1-2' },
  albahaca: { A: '8', T: '11', cover: true },
  apio: { A: '10-11', T: '12' },
  arveja: { S: '10-11' },
  brocoli: { A: '9', T: '11' },
  coliflor: { A: '9', T: '11' },
  verdeo: { A: '9', T: '10-11' },
  espinaca: { S: '9-1' },
  frutilla: { T: '9-12', H: '12-3' },
  haba: { S: '10-11' },
  lechuga: { S: '9-12', A: '9-11' },
  papa: { S: '10' },
  pepino: { A: '8', T: '11', cover: true },
  perejil: { S: '9-3' },
  pimiento: { A: '8', T: '10-11', cover: true },
  puerro: { A: '9', T: '11' },
  rabanito: { S: '2-4,9-12' },
  radicheta: { S: '9-12' },
  remolacha: { S: '11' },
  repollo: { A: '9', T: '11' },
  rucula: { S: '9-10' },
  tomate: { A: '8', T: '10-11', cover: true },
  zanahoria: { S: '11' },
  zapallito: { S: '11-12' },
};

/** Estimado a partir del manual de la ONG de Tarija (ver arriba): sin cartilla oficial. */
const VALLES_BOLIVIA: ZoneTable = {
  esparrago: { A: '8-10', T: '11-1', H: '9-12' },
  puerro: { A: '2-6', T: '5-7', H: '9-12' },
  lechuga: { S: '1-12', A: '3-12', H: '1-12' },
  brocoli: { A: '2-4', T: '3-5', H: '6-10' },
  coliflor: { A: '2-5', T: '3-5', H: '6-10' },
  repollo: { A: '2-4', T: '3-5', H: '6-11' },
  rabanito: { S: '3-4,8-12', H: '9-1,4-5' },
  rucula: { S: '7-1', H: '9-3' },
  tomate: { A: '7-10', T: '9-11', H: '11-4' },
  pimiento: { A: '7-10', T: '9-11', H: '12-4' },
  berenjena: { A: '7-10', T: '9-11', H: '12-4' },
  zapallito: { S: '9-12', H: '11-2' },
  pepino: { S: '9-12', H: '12-4' },
  melon: { S: '9-12', H: '1-4' },
  sandia: { S: '9-12', H: '12-3' },
  apio: { A: '2-6', T: '5-7', H: '9-12' },
  perejil: { S: '3-5', H: '6-8' },
  chaucha: { S: '9-11', H: '11-4' },
  acelga: { A: '2-6', T: '5-7', H: '9-12' },
  remolacha: { S: '4-6', H: '7-11' },
};

/** Estimado a partir de un cuadro de siembra de un proyecto de cooperación (ver arriba): una sola fuente, sin validar por el INIAF. */
const TROPICO_BOLIVIA: ZoneTable = {
  rabanito: { S: '1-12' },
  chaucha: { S: '9-1' },
  lechuga: { S: '9-1' },
  repollo: { S: '9-1' },
  brocoli: { S: '10-1' },
  zanahoria: { S: '10-1' },
  coliflor: { S: '10-1' },
  cebolla: { S: '10-1' },
  acelga: { S: '10-3' },
  pepino: { S: '11-12' },
  zapallo: { S: '11-12' },
  sandia: { S: '11-12' },
};

/**
 * Sierra de Perú: meses de siembra del «Calendario agrícola de la sierra» del INIA
 * (publicado en sus redes; leído a mano, sin el documento a la vista): setiembre,
 * quinua, papa, maíz amiláceo, oca y haba; octubre, cañihua, cebada, maíz amiláceo,
 * oca y haba; noviembre, quinua, cañihua, cebada y papa. Es secano (siembra con las
 * primeras lluvias). La cosecha sale del ciclo de cada cultivo (fichas del INIA:
 * quinua 150-200 días, cañihua 140-160, maíz amiláceo 170 en choclo y 210 en grano seco,
 * oca de 7 a 8 meses); la papa lleva la cosecha a mano porque su ficha general es de
 * clima templado y en la sierra el ciclo es de 5 a 7 meses.
 */
const SIERRA_PERU: ZoneTable = {
  quinua: { S: '9,11' },
  papa: { S: '9,11', H: '3-6' },
  'maiz-amilaceo': { S: '9-10' },
  oca: { S: '9-10' },
  haba: { S: '9-10' },
  canihua: { S: '10-11' },
  cebada: { S: '10-11' },
};

export const ZONE_TABLES: Record<Zone, ZoneTable> = {
  pampeana: PAMPEANA,
  nea: NEA,
  noa: NOA,
  cuyo: CUYO,
  patagoniaNorte: PATAGONIA_NORTE,
  patagoniaSur: PATAGONIA_SUR,
  vallesBolivia: VALLES_BOLIVIA,
  tropicoBolivia: TROPICO_BOLIVIA,
  sierraPeru: SIERRA_PERU,
};

/** "8-11,2" → {8,9,10,11,2}; los rangos pueden cruzar el año ("11-2"). Meses 1–12. */
export function parseMonths(spec: string | undefined): Set<number> {
  const out = new Set<number>();
  if (!spec) return out;
  for (const part of spec.split(',')) {
    const [a, b] = part.split('-').map((x) => Number(x.trim()));
    if (!a) continue;
    const end = b ?? a;
    for (let m = a, i = 0; i < 12; i++, m = (m % 12) + 1) {
      out.add(m);
      if (m === end) break;
    }
  }
  return out;
}

const addMonths = (m: number, n: number) => ((((m - 1 + n) % 12) + 12) % 12) + 1;
const daysToMonths = (d: number) => Math.round(d / 30.4);

export interface CropCalendar {
  crop: Crop;
  sow: Set<number>;
  nursery: Set<number>;
  transplant: Set<number>;
  harvest: Set<number>;
  /** Bajo cubierta en esta zona. */
  cover: boolean;
}

/** Meses de cosecha: desde cada siembra (o trasplante) más los días a cosecha, durante los meses que dura. */
export function harvestMonths(crop: Crop, entry: ZoneEntry): Set<number> {
  if (entry.H) return parseMonths(entry.H);
  const out = new Set<number>();
  const starts: number[] = [...parseMonths(entry.S), ...parseMonths(entry.T)];
  // Almácigo sin trasplante indicado: se trasplanta cuando está listo.
  if (!entry.T && entry.A && crop.nurseryDays) {
    for (const m of parseMonths(entry.A)) starts.push(addMonths(m, daysToMonths(crop.nurseryDays[0])));
  }
  for (const m of starts) {
    const from = addMonths(m, daysToMonths(crop.daysToHarvest[0]));
    const span = daysToMonths(crop.daysToHarvest[1] - crop.daysToHarvest[0]) + Math.max(1, Math.round(crop.harvestMonths));
    for (let i = 0; i < Math.min(12, span); i++) out.add(addMonths(from, i));
  }
  return out;
}

export function cropCalendar(zone: Zone, cropId: string): CropCalendar | null {
  const crop = CROP_BY_ID.get(cropId);
  const entry = ZONE_TABLES[zone][cropId];
  if (!crop || !entry) return null;
  return {
    crop,
    sow: parseMonths(entry.S),
    nursery: parseMonths(entry.A),
    transplant: parseMonths(entry.T),
    harvest: harvestMonths(crop, entry),
    cover: entry.cover ?? false,
  };
}

/** Todos los cultivos de la zona (los que no figuran en su cartilla quedan afuera). */
export function zoneCalendar(zone: Zone): CropCalendar[] {
  return CROPS.map((c) => cropCalendar(zone, c.id)).filter((c): c is CropCalendar => c !== null);
}

/** Cultivos que no figuran en la cartilla de la zona. */
export function missingInZone(zone: Zone): Crop[] {
  return CROPS.filter((c) => !ZONE_TABLES[zone][c.id]);
}

export interface MonthPlan {
  sow: CropCalendar[];
  nursery: CropCalendar[];
  transplant: CropCalendar[];
  harvest: CropCalendar[];
}

/** Qué hacer en un mes (1–12). */
export function monthPlan(zone: Zone, month: number): MonthPlan {
  const all = zoneCalendar(zone);
  return {
    sow: all.filter((c) => c.sow.has(month)),
    nursery: all.filter((c) => c.nursery.has(month)),
    transplant: all.filter((c) => c.transplant.has(month)),
    harvest: all.filter((c) => c.harvest.has(month)),
  };
}

/**
 * Zona sugerida para un lugar. Uruguay usa la Pampeana; Paraguay, el NEA; Chile, la zona
 * argentina de clima parecido: el norte, NOA; de Atacama al Biobío, Cuyo; del
 * Biobío al sur, Patagonia sur y andina. Bolivia y Perú no se parecen a
 * ninguna zona argentina (altiplano, selva): sin zona sugerida hasta tener sus
 * calendarios (INIAF, INIA); se elige a mano.
 */
export function zoneFor(lat: number, lon: number, country: Country): Zone | null {
  // Brasil: el ZARC oficial cubre cultivos comerciales, no las hortalizas de huerta: sin zona sugerida (no se inventa), se elige a mano.
  if (country === 'BO' || country === 'PE' || country === 'BR') return null;
  if (country === 'UY') return 'pampeana';
  // Paraguay: subtropical, parecido al NEA argentino (heladas suaves, verano muy caluroso y húmedo); sin calendario propio publicado.
  if (country === 'PY') return 'nea';
  if (country === 'CL') {
    if (lat > -27) return 'noa';
    if (lat > -37.5) return 'cuyo';
    return 'patagoniaSur';
  }
  if (lat < -42) return 'patagoniaSur';
  // Cordillera patagónica (Bariloche, Esquel, San Martín de los Andes): más fría que los valles.
  if (lat < -38.5 && lon < -70.5) return 'patagoniaSur';
  if (lat < -38.5 && lon < -62.5) return 'patagoniaNorte';
  if (lat < -36.5 && lon < -66.5) return 'patagoniaNorte';
  if (lat <= -31 && lon < -66) return 'cuyo';
  if (lat > -31 && lon < -63.5) return 'noa';
  if (lat > -30.5) return 'nea';
  return 'pampeana';
}
