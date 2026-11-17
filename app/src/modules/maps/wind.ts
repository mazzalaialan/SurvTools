import { omFetch } from '@/modules/weather/omFetch';
/**
 * Carga de nieve por viento para la capa de avalanchas: el viento levanta la
 * nieve de las laderas expuestas (barlovento) y la deposita del otro lado del
 * filo (sotavento), donde se forman placas y cornisas. Se marcan con un
 * rayado las laderas que miran hacia donde sopló el viento.
 *
 * - Reciente: viento a 700 hPa (unos 3000 m, representa mejor los filos que
 *   el de 10 m) y nevada hora por hora de Open-Meteo, en los últimos 3 días.
 * - Habitual: de dónde sopla en los días con nieve, con 5 años del histórico
 *   (reanálisis ERA5 de Open-Meteo), calculado una vez al bajar cada zona.
 * - Sin nada: viento del oeste, el más común con nieve en los Andes.
 *
 * Es orientativo: el modelo no ve cómo los valles desvían el viento.
 */

/** Por debajo de esto (m/s, a 700 hPa) el viento casi no mueve nieve. */
export const TRANSPORT_MS = 5;
/** Por encima, la nieve se vuela y se carga más lejos: no se cuenta más. */
const MAX_MS = 25;
/** Nieve nueva en la ventana (cm) para que haya qué transportar. */
const SNOW_CM = 0.5;
/** Mínimo de "horas de transporte" (velocidad · horas / 5) para considerar carga. */
const MIN_LOAD = 6;
/** Un rumbo cuenta si tiene al menos esta parte del total. */
const SHARE = 0.25;
/** Una ladera es de sotavento si mira a menos de esto de hacia donde sopla el viento. */
export const LEE_SPREAD_DEG = 60;
/** Viento habitual si no hay ningún dato: del oeste. */
export const DEFAULT_FROM = [270];

const sector = (deg: number) => Math.round((((deg % 360) + 360) % 360) / 45) % 8;

/** Rumbos (de dónde sopla, cada 45°) con una parte importante del peso. */
function mainSectors(weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return [];
  return weights.flatMap((w, i) => (w / total >= SHARE ? [i * 45] : []));
}

/**
 * Viento que cargó nieve en una ventana de horas: de dónde sopló (rumbos de
 * 45°), o `[]` si no hubo carga. `null` si faltan los datos.
 */
export function windLoadFrom(dir: (number | null)[], speed: (number | null)[], snow: (number | null)[]): number[] | null {
  if (dir.length === 0 || dir.length !== speed.length || dir.length !== snow.length) return null;
  if (!dir.some((d) => typeof d === 'number')) return null;
  const weights = new Array<number>(8).fill(0);
  let snowSoFar = 0;
  let load = 0;
  for (let h = 0; h < dir.length; h++) {
    snowSoFar += snow[h] ?? 0;
    const s = speed[h];
    const d = dir[h];
    if (snowSoFar < SNOW_CM || typeof s !== 'number' || typeof d !== 'number' || s < TRANSPORT_MS) continue;
    const w = Math.min(s, MAX_MS) / TRANSPORT_MS;
    weights[sector(d)]! += w;
    load += w;
  }
  return load < MIN_LOAD ? [] : mainSectors(weights);
}

/** Viento habitual con nieve, de los datos diarios del histórico: rumbos, o `null` si no alcanza. */
export function prevailingFrom(dir: (number | null)[], speedMax: (number | null)[], snow: (number | null)[]): number[] | null {
  const weights = new Array<number>(8).fill(0);
  let days = 0;
  for (let i = 0; i < dir.length; i++) {
    // El día que nieva y el siguiente (la nieve suelta se mueve después).
    const snowy = (snow[i] ?? 0) > 0 || (i > 0 && (snow[i - 1] ?? 0) > 0);
    const s = speedMax[i];
    const d = dir[i];
    if (!snowy || typeof s !== 'number' || typeof d !== 'number' || s < 3) continue;
    weights[sector(d)]! += Math.min(s, MAX_MS);
    days++;
  }
  return days < 10 ? null : mainSectors(weights);
}

/** Hacia dónde miran las laderas de sotavento de esos vientos. */
export const leeAspects = (from: number[]) => from.map((d) => (d + 180) % 360);

/** ¿La orientación `aspect` (hacia dónde mira la ladera) queda a sotavento? */
export function isLee(aspect: number, lee: number[]): boolean {
  return lee.some((l) => {
    const diff = Math.abs(((aspect - l + 540) % 360) - 180);
    return diff <= LEE_SPREAD_DEG;
  });
}

// ---------- Habitual: histórico de Open-Meteo ----------

export interface PrevailingWind {
  /** Rumbos de donde sopla con nieve; [] si casi no nieva ahí. */
  from: number[];
  /** Cuándo se calculó. */
  at: number;
}

/** El histórico está en otro servidor de Open-Meteo; si es uno propio, en el mismo. */
export function archiveBase(base: string): string {
  const b = base.replace(/\/+$/, '');
  return b.replace('://api.open-meteo.com', '://archive-api.open-meteo.com');
}

/** Cinco años de datos diarios (~50 KB), hasta el año pasado. */
export async function fetchPrevailing(base: string, lat: number, lon: number, now = new Date()): Promise<PrevailingWind> {
  const last = now.getUTCFullYear() - 1;
  const params = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lon.toFixed(3),
    start_date: `${last - 4}-01-01`,
    end_date: `${last}-12-31`,
    daily: 'wind_direction_10m_dominant,wind_speed_10m_max,snowfall_sum',
    wind_speed_unit: 'ms',
    timezone: 'GMT',
  });
  const res = await omFetch(`${archiveBase(base)}/v1/archive?${params}`, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error('prevailing');
  const data = (await res.json()) as {
    daily?: { time?: string[]; wind_direction_10m_dominant?: (number | null)[]; wind_speed_10m_max?: (number | null)[]; snowfall_sum?: (number | null)[] };
  };
  const d = data.daily;
  if (!d?.time?.length) throw new Error('prevailing');
  // Sin días con nieve suficientes queda vacío (no se vuelve a pedir; se usa el del oeste).
  const from = prevailingFrom(d.wind_direction_10m_dominant ?? [], d.wind_speed_10m_max ?? [], d.snowfall_sum ?? []) ?? [];
  return { from, at: now.getTime() };
}

// ---------- Para mostrar ----------

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
const POINTS_EN = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** "O y SO" (o en inglés "W and SW"). */
export function compassList(degs: number[], lang: string): string {
  const names = degs.map((d) => (lang.startsWith('es') ? POINTS : POINTS_EN)[sector(d)]!);
  return new Intl.ListFormat(lang, { type: 'conjunction' }).format(names);
}
