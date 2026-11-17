import { omFetch } from '@/modules/weather/omFetch';
/**
 * Oleaje y viento para quien navega o rema: pronóstico de Open-Meteo Marine (olas y oleaje, modelo de Météo-France, ECMWF, NOAA y
 * DWD) y viento del pronóstico común. Es un modelo, no una medición, con celdas de ~9 km: no cubre ríos ni lagos (da vacío) y no sirve
 * para navegar cerca de la costa. Se pide solo con conexión y queda guardado para verlo sin conexión.
 */
export interface WavePoint {
  /** Instante (ms UTC). */
  time: number;
  /** Altura significativa de las olas (m) y período (s); null si el modelo no cubre el punto. */
  waveHeight: number | null;
  wavePeriod: number | null;
  waveDirection: number | null;
  swellHeight: number | null;
  swellPeriod: number | null;
  /** Viento a 10 m y ráfagas (km/h) y de dónde sopla (°). */
  windKmh: number | null;
  gustKmh: number | null;
  windDirection: number | null;
}

export interface WaveForecast {
  /** Punto del modelo (celda más cercana). */
  lat: number;
  lon: number;
  /** Cuándo se pidió (ms UTC). */
  fetchedAt: number;
  points: WavePoint[];
}

const HOURLY_MARINE = 'wave_height,wave_period,wave_direction,swell_wave_height,swell_wave_period';
const HOURLY_WIND = 'wind_speed_10m,wind_gusts_10m,wind_direction_10m';

/** El pronóstico marino está en otro servidor de Open-Meteo; si la base es un servidor propio, en el mismo. */
export function marineBase(base: string): string {
  return base.replace(/\/+$/, '').replace('://api.open-meteo.com', '://marine-api.open-meteo.com');
}

export function marineUrl(base: string, lat: number, lon: number, days = 3): string {
  const q = `latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&hourly=${HOURLY_MARINE}&forecast_days=${days}&timeformat=unixtime`;
  return `${marineBase(base)}/v1/marine?${q}`;
}

export function windUrl(base: string, lat: number, lon: number, days = 3): string {
  const q = `latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&hourly=${HOURLY_WIND}&wind_speed_unit=kmh&forecast_days=${days}&timeformat=unixtime`;
  return `${base.replace(/\/+$/, '')}/v1/forecast?${q}`;
}

type Hourly = Record<string, (number | null)[] | undefined> & { time?: number[] };
const at = (h: Hourly, key: string, i: number): number | null => {
  const v = h[key]?.[i];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

/** Junta las dos respuestas en una lista por hora (el viento puede faltar). */
export function parseForecast(marine: { latitude?: number; longitude?: number; hourly?: Hourly }, wind: { hourly?: Hourly } | null, fetchedAt = Date.now()): WaveForecast | null {
  const m = marine.hourly;
  if (!m?.time?.length) return null;
  const w = wind?.hourly;
  const windAt = new Map<number, number>((w?.time ?? []).map((t, i) => [t, i]));
  const points = m.time.map<WavePoint>((t, i) => {
    const j = windAt.get(t);
    return {
      time: t * 1000,
      waveHeight: at(m, 'wave_height', i),
      wavePeriod: at(m, 'wave_period', i),
      waveDirection: at(m, 'wave_direction', i),
      swellHeight: at(m, 'swell_wave_height', i),
      swellPeriod: at(m, 'swell_wave_period', i),
      windKmh: j === undefined || !w ? null : at(w, 'wind_speed_10m', j),
      gustKmh: j === undefined || !w ? null : at(w, 'wind_gusts_10m', j),
      windDirection: j === undefined || !w ? null : at(w, 'wind_direction_10m', j),
    };
  });
  return { lat: marine.latitude ?? 0, lon: marine.longitude ?? 0, fetchedAt, points };
}

/** ¿El modelo marino cubre el punto? Ríos, lagos y tierra adentro devuelven todo vacío. */
export const hasWaves = (f: WaveForecast): boolean => f.points.some((p) => p.waveHeight !== null);

/** El punto de la lista más cercano a un instante. */
export function pointAt(f: WaveForecast, time: number): WavePoint | null {
  let best: WavePoint | null = null;
  for (const p of f.points) if (!best || Math.abs(p.time - time) < Math.abs(best.time - time)) best = p;
  return best;
}

/** Estado del mar según la escala Douglas, por altura significativa de las olas (m). */
export type SeaState = 'calm' | 'smooth' | 'slight' | 'moderate' | 'rough' | 'veryRough' | 'high' | 'veryHigh' | 'phenomenal';
export function seaState(heightM: number): SeaState {
  if (heightM < 0.1) return 'calm';
  if (heightM < 0.5) return 'smooth';
  if (heightM < 1.25) return 'slight';
  if (heightM < 2.5) return 'moderate';
  if (heightM < 4) return 'rough';
  if (heightM < 6) return 'veryRough';
  if (heightM < 9) return 'high';
  if (heightM < 14) return 'veryHigh';
  return 'phenomenal';
}

/** Punto cardinal (de 8) de un rumbo en grados. */
export function compass8(deg: number): 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW' {
  return (['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const)[Math.round((((deg % 360) + 360) % 360) / 45) % 8]!;
}

export const knots = (kmh: number): number => kmh / 1.852;

export async function fetchForecast(base: string, lat: number, lon: number): Promise<WaveForecast | null> {
  const get = async (url: string) => {
    const res = await omFetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
    return res.json();
  };
  const [marine, wind] = await Promise.all([get(marineUrl(base, lat, lon)), get(windUrl(base, lat, lon)).catch(() => null)]);
  return parseForecast(marine, wind);
}

const STORE = 'vikarg.waves.last';
/** Último pronóstico guardado (uno solo, el del último lugar mirado) para verlo sin conexión. */
export function loadSavedForecast(): { lat: number; lon: number; forecast: WaveForecast } | null {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as { lat: number; lon: number; forecast: WaveForecast }) : null;
  } catch {
    return null;
  }
}
export function saveForecast(lat: number, lon: number, forecast: WaveForecast): void {
  try {
    localStorage.setItem(STORE, JSON.stringify({ lat, lon, forecast }));
  } catch {
    /* sin almacenamiento: se ve igual con conexión */
  }
}
