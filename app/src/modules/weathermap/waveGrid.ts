import { marineBase } from '@/modules/navigation/waves';

/**
 * Oleaje en el mapa de alertas y clima: una grilla de puntos de mar frente a las costas de Argentina, Uruguay, Chile y Perú, pedida
 * en una sola consulta a Open-Meteo Marine (acepta varias coordenadas). Es un modelo, no una medición, con celdas de ~9 km: sirve de
 * panorama del mar, no para navegar cerca de la costa. Los puntos que el modelo no cubre (tierra, ríos) vuelven vacíos y no se dibujan.
 */
export interface WaveSpot {
  lat: number;
  lon: number;
  /** Altura significativa (m), período (s) y de dónde vienen las olas (°); el oleaje de fondo, aparte. */
  height: number;
  period: number | null;
  direction: number | null;
  swellHeight: number | null;
  swellPeriod: number | null;
}

export interface WaveGrid {
  /** Cuándo se pidió (ms) y el instante al que corresponde el dato (ms). */
  fetchedAt: number;
  at: number;
  spots: WaveSpot[];
}

/** Puntos de mar a unos 50–150 km de la costa (lat, lon): Atlántico de Uruguay y Argentina, Pacífico de Chile y de Perú. */
export const WAVE_GRID: [number, number][] = [
  // Atlántico: Uruguay y Argentina (de norte a sur) y Malvinas
  [-35.3, -53.2], [-36.8, -55.6], [-38.8, -57.0], [-39.3, -57.8], [-40.8, -61.2], [-42.5, -62.0], [-42.8, -64.6], [-45.0, -64.5],
  [-46.0, -66.0], [-47.9, -65.2], [-50.0, -67.0], [-51.7, -67.0], [-53.8, -66.5], [-54.8, -64.5], [-51.7, -57.8],
  // Pacífico: Chile (de norte a sur)
  [-18.5, -71.0], [-20.2, -70.9], [-22.5, -70.9], [-23.7, -71.0], [-26.0, -71.2], [-27.4, -71.4], [-29.9, -71.7], [-31.9, -72.1],
  [-33.0, -72.2], [-34.5, -72.4], [-36.5, -73.4], [-38.5, -74.0], [-40.0, -74.0], [-42.0, -75.0], [-44.0, -75.5], [-46.5, -76.5],
  [-49.0, -76.5], [-51.5, -76.0], [-54.0, -73.5],
  // Pacífico: Perú (de norte a sur)
  [-3.9, -81.5], [-5.5, -81.4], [-7.0, -80.6], [-9.1, -79.5], [-11.2, -78.2], [-12.2, -77.6], [-13.7, -76.6], [-15.5, -75.9],
  [-17.2, -72.4], [-18.0, -71.8],
];

const CURRENT = 'wave_height,wave_period,wave_direction,swell_wave_height,swell_wave_period';

export function gridUrl(base: string, grid = WAVE_GRID): string {
  const lat = grid.map(([la]) => la.toFixed(2)).join(',');
  const lon = grid.map(([, lo]) => lo.toFixed(2)).join(',');
  return `${marineBase(base)}/v1/marine?latitude=${lat}&longitude=${lon}&current=${CURRENT}&timeformat=unixtime`;
}

interface Cell {
  latitude?: number;
  longitude?: number;
  current?: Record<string, number | null | undefined> & { time?: number };
}

const num = (v: number | null | undefined): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** De la respuesta de varias coordenadas (una lista; con una sola, un objeto): los puntos con altura de ola. */
export function parseGrid(json: unknown, fetchedAt = Date.now()): WaveGrid | null {
  const cells: Cell[] = Array.isArray(json) ? (json as Cell[]) : json && typeof json === 'object' ? [json as Cell] : [];
  const spots: WaveSpot[] = [];
  let at = 0;
  for (const c of cells) {
    const cur = c?.current;
    const height = num(cur?.wave_height);
    if (!cur || height === null || typeof c.latitude !== 'number' || typeof c.longitude !== 'number') continue;
    spots.push({ lat: c.latitude, lon: c.longitude, height, period: num(cur.wave_period), direction: num(cur.wave_direction), swellHeight: num(cur.swell_wave_height), swellPeriod: num(cur.swell_wave_period) });
    if (typeof cur.time === 'number') at = Math.max(at, cur.time * 1000);
  }
  return spots.length ? { fetchedAt, at: at || fetchedAt, spots } : null;
}

export async function fetchWaveGrid(base: string, fetcher: typeof fetch = fetch): Promise<WaveGrid | null> {
  const res = await fetcher(gridUrl(base), { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Open-Meteo Marine ${res.status}`);
  return parseGrid(await res.json());
}

const STORE = 'vikarg.wavegrid.last';
export function loadSavedGrid(): WaveGrid | null {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as WaveGrid) : null;
  } catch {
    return null;
  }
}
export function saveGrid(g: WaveGrid): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(g));
  } catch {
    /* sin almacenamiento: se ve igual con conexión */
  }
}
