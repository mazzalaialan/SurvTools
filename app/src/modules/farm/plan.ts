import plan from './farm-plan-AR.json';

/**
 * Etapa 2 de Granja (docs/GRANJA.md): cuántos animales hacen falta para N personas y qué tareas tocan cada mes.
 * Los números salen de tools/farm-data (calculadora.json y calendario.json), cada uno con su fuente; lo que no tiene fuente no se usa.
 * Es una cuenta orientativa para cría familiar (no intensiva): se muestra siempre con sus supuestos.
 */

export interface PlanNum {
  value: number;
  unit?: string;
  source?: { org?: string; url?: string; date?: string };
  confidence?: string;
}
interface PlanSpecies {
  product: 'huevos' | 'carne' | 'leche' | 'miel' | 'lana';
  perYear?: PlanNum;
  meatYield?: PlanNum;
  cycleDays?: PlanNum;
  note?: string;
}
export interface FarmTask {
  species: string[];
  months: number[];
  regions: string[] | null;
  provinces?: string[];
  text: { es: string; en?: string; pt?: string };
  kind: 'obligatorio' | 'recomendado';
  source?: { org?: string; url?: string; date?: string };
  confidence?: string;
}
export interface Stress {
  heat?: PlanNum;
  cold?: PlanNum;
  heatNote?: string;
  heatDo?: string;
  coldDo?: string;
}
export interface Urgent {
  sign: string;
  todo: string;
  level: 'ya' | 'hoy' | 'senasa';
  confidence?: string;
  source?: { org?: string; url?: string; date?: string };
}
interface PlanData {
  date: string;
  stress?: Record<string, Stress>;
  urgent?: Record<string, Urgent[]>;
  senasa?: string;
  consumption: Record<string, PlanNum | undefined>;
  species: Record<string, PlanSpecies>;
  tasks: FarmTask[];
}
export const farmPlan = plan as PlanData;

export type Product = 'eggs' | 'meat' | 'honey';

/**
 * Lo que da un animal por año, en la unidad del consumo (huevos o kg de carne o de miel), y qué representa «un animal» en la cuenta.
 * Cada caso explica la conversión: en las de ciclo único el dato es por animal terminado, y se cuentan animales por año.
 */
export interface Yield {
  species: string;
  product: Product;
  /** Huevos, o kg de carne o de miel, por cada «unidad» de abajo. */
  perUnit: number;
  /** Qué se cuenta: reproductora o colmena que se mantiene todo el año («keep»), o animal que se cría y se faena en el año («raise»). */
  unit: 'keep' | 'raise';
  sources: PlanNum[];
}

export function yields(data: PlanData = farmPlan): Yield[] {
  const out: Yield[] = [];
  for (const [id, s] of Object.entries(data.species)) {
    const y = s.perYear;
    if (!y) continue;
    if (s.product === 'huevos') out.push({ species: id, product: 'eggs', perUnit: y.value, unit: 'keep', sources: [y] });
    else if (s.product === 'miel') out.push({ species: id, product: 'honey', perUnit: y.value, unit: 'keep', sources: [y] });
    else if (s.product === 'carne') {
      // Conejo: kg de carne por coneja reproductora por año (ya es carne). Peces: kg por pez en un año de engorde.
      if (id === 'conejo') out.push({ species: id, product: 'meat', perUnit: y.value, unit: 'keep', sources: [y] });
      else if (id === 'peces-estanque') out.push({ species: id, product: 'meat', perUnit: y.value, unit: 'raise', sources: [y] });
      // Oveja y cabra: kg de carcasa por cordero o cabrito faenado (ya es carne).
      else if (id === 'oveja' || id === 'cabra') out.push({ species: id, product: 'meat', perUnit: y.value, unit: 'raise', sources: [y] });
      // Peso vivo por animal terminado: solo si hay rendimiento con fuente (pavo); el pato no tiene y queda afuera.
      else if (s.meatYield) out.push({ species: id, product: 'meat', perUnit: (y.value * s.meatYield.value) / 100, unit: 'raise', sources: [y, s.meatYield] });
    }
  }
  return out;
}

/** Consumo anual por persona de cada producto, con su fuente (GAPA para huevos; consumo aparente del MAGyP para carne y miel). */
export function yearlyNeed(product: Product, data: PlanData = farmPlan): PlanNum | undefined {
  const c = data.consumption;
  if (product === 'eggs') {
    const w = c.huevos_por_persona_por_semana;
    return w && { ...w, value: w.value * 52 };
  }
  if (product === 'meat') return c.carne_kg_por_persona_por_anio;
  return c.miel_kg_por_persona_por_anio;
}

/**
 * Cuántos animales hacen falta para que `people` personas cubran el `share` (0 a 1) de su consumo anual de ese producto con esa
 * especie. Se redondea para arriba (y al menos 1): son animales enteros.
 */
export function animalsFor(y: Yield, people: number, share: number, data: PlanData = farmPlan): number {
  const need = yearlyNeed(y.product, data);
  if (!need || people <= 0 || share <= 0 || y.perUnit <= 0) return 0;
  return Math.max(1, Math.ceil((need.value * people * share) / y.perUnit));
}

/** Tareas de un mes (1 a 12) para las especies elegidas y la región (o todas si no hay región); primero las obligatorias. */
export function tasksFor(month: number, species: string[] | null, region: string | null, data: PlanData = farmPlan): FarmTask[] {
  return data.tasks
    .filter((t) => t.months.includes(month) && (!species || t.species.some((s) => species.includes(s))) && (!region || !t.regions || t.regions.includes(region)))
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'obligatorio' ? -1 : 1));
}

/** Regiones que nombra el calendario (para elegir), en orden. */
export const REGIONS = ['pampeana', 'NEA', 'NOA', 'Cuyo', 'Patagonia'] as const;

/** Región de cada provincia (las del calendario), para preseleccionarla con la provincia del lugar. */
export const PROVINCE_REGION: Record<string, (typeof REGIONS)[number]> = {
  'Buenos Aires': 'pampeana', 'Ciudad de Buenos Aires': 'pampeana', Córdoba: 'pampeana', 'Entre Ríos': 'pampeana', 'La Pampa': 'pampeana', 'Santa Fe': 'pampeana',
  Chaco: 'NEA', Corrientes: 'NEA', Formosa: 'NEA', Misiones: 'NEA',
  Catamarca: 'NOA', Jujuy: 'NOA', 'La Rioja': 'NOA', Salta: 'NOA', 'Santiago del Estero': 'NOA', Tucumán: 'NOA',
  Mendoza: 'Cuyo', 'San Juan': 'Cuyo', 'San Luis': 'Cuyo',
  Chubut: 'Patagonia', Neuquén: 'Patagonia', 'Río Negro': 'Patagonia', 'Santa Cruz': 'Patagonia', 'Tierra del Fuego': 'Patagonia',
};
