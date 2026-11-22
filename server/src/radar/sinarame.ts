/**
 * Radares meteorológicos argentinos (SINARAME, Subsecretaría de Recursos Hídricos, con el SMN): las imágenes que muestra su visor público.
 *
 * Cómo se publican (investigado el 2026-11-19, ver docs/FUENTES-DE-DATOS.md): cada radar deja un PNG de 512×512, transparente donde no hay eco,
 * cada 10 minutos en `/cache/<radar>/AAAAMMDDHHMMSS.png` del propio visor, con la HORA LOCAL ARGENTINA (UTC−3, sin horario de verano) en el nombre.
 * La imagen cubre un cuadrado de 240 km de radio alrededor del radar (los mismos límites que calcula el visor). Llegan con ~20 minutos de atraso.
 * Es un archivo estático común (nginx, sin desafío anti-bot). El SMN autorizó por escrito (2026-11-11) usar sus datos bajo CC BY 4.0: hay que
 * mostrar la atribución. Datos orientativos, no oficiales.
 *
 * Cómo se consulta (cortesía con un servicio público): solo mientras alguien mira el radar, de a un pedido por vez y con una pausa entre
 * pedidos, con un identificador propio, y con espera creciente si contesta 403, 429 o un error de servidor.
 */
import { encodePng } from '../rain/map.ts';
import { cleanRadarImage } from './clean.ts';
import { decodePng } from './pixels.ts';
export const RADAR_RANGE_KM = 240;
export const RADAR_FRAMES = 12;
export const RADAR_STEP_MS = 10 * 60_000;
/** Cuántos pasos de 10 minutos hacia atrás se prueban al buscar imágenes (2 horas y media). */
export const RADAR_LOOKBACK_STEPS = 15;
export const RADAR_USER_AGENT = 'VikArg-radar/1.0 (+contacto.vikarg@gmail.com)';
export const RADAR_DEFAULT_BASE = 'https://radares.hidricosargentina.gob.ar';
export const RADAR_ATTRIBUTION = 'Sistema Nacional de Radares Meteorológicos (SINARAME), Subsecretaría de Recursos Hídricos, y Servicio Meteorológico Nacional (CC BY 4.0)';
const MAX_PNG_BYTES = 300_000;

export interface RadarSite {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

/** Los radares que aparecen en el mosaico del visor, con la posición que él mismo usa para ubicar cada imagen. */
export const RADARS: RadarSite[] = [
  { id: 'RMA1', name: 'Córdoba', lat: -31.4413, lon: -64.192 },
  { id: 'RMA2', name: 'Ezeiza', lat: -34.8008, lon: -58.5156 },
  { id: 'RMA3', name: 'Las Lomitas', lat: -24.7303, lon: -60.5514 },
  { id: 'RMA4', name: 'Resistencia', lat: -27.4518, lon: -59.051 },
  { id: 'RMA5', name: 'Bernardo de Irigoyen', lat: -26.2781, lon: -53.6708 },
  { id: 'RMA6', name: 'Mar del Plata', lat: -37.9131, lon: -57.5278 },
  { id: 'RMA7', name: 'Neuquén', lat: -38.8766, lon: -68.1449 },
  { id: 'RMA8', name: 'Mercedes', lat: -29.1959, lon: -58.0448 },
  { id: 'RMA10', name: 'Bahía Blanca', lat: -38.7343, lon: -62.1634 },
  { id: 'RMA11', name: 'Termas de Río Hondo', lat: -27.5026, lon: -64.9058 },
  { id: 'RMA12', name: 'Las Grutas', lat: -40.7722, lon: -65.0761 },
  { id: 'RMA13', name: 'Ituzaingó', lat: -27.6224, lon: -56.8417 },
  { id: 'RMA14', name: 'Bolívar', lat: -36.1892, lon: -61.0702 },
  { id: 'RMA15', name: 'Patquía', lat: -30.0308, lon: -66.8761 },
  { id: 'RMA16', name: 'Villa Reynolds', lat: -33.7183, lon: -65.3755 },
  { id: 'RMA17', name: 'Alejandro Roca', lat: -33.3514, lon: -63.7038 },
  { id: 'RMA18', name: 'Santa Isabel', lat: -36.2235, lon: -66.9363 },
  { id: 'RMA19', name: 'Santa Rosa', lat: -33.2592, lon: -68.0939 },
  { id: 'RMA20', name: 'Las Lajitas', lat: -24.7449, lon: -64.2511 },
];

export interface RadarBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** Los límites de la imagen: la misma cuenta que hace el visor (`calculateBounds` de su radar.js). */
export function radarBounds(r: Pick<RadarSite, 'lat' | 'lon'>, rangeKm = RADAR_RANGE_KM): RadarBounds {
  const dLat = rangeKm / 110.574;
  const dLon = rangeKm / (111.32 * Math.cos((r.lat * Math.PI) / 180));
  return { south: r.lat - dLat, west: r.lon - dLon, north: r.lat + dLat, east: r.lon + dLon };
}

/** `AAAA-MM-DD HH:MM` en hora argentina para un instante en ms (UTC−3 fijo). */
const ART_MS = 3 * 3_600_000;
const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** El nombre de archivo de un instante (redondeado hacia abajo a 10 minutos): `AAAAMMDDHHMMSS` en hora argentina. */
export function frameStamp(utcMs: number): string {
  const d = new Date(Math.floor(utcMs / RADAR_STEP_MS) * RADAR_STEP_MS - ART_MS);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00`;
}

/** El instante (ms UTC) que dice un nombre de archivo, o `null` si no es un nombre válido. */
export function stampToUtcMs(stamp: string): number | null {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(stamp);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number) as [number, number, number, number, number, number];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  return Date.UTC(y, mo - 1, d, h, mi, s) + ART_MS;
}

export interface RadarFrame {
  stamp: string;
  /** Instante de la imagen (ms UTC). */
  at: number;
  png: Buffer;
}

export interface RadarState {
  frames: RadarFrame[];
  /** Última vez que se buscaron imágenes nuevas (ms). */
  checkedAt: number;
}

export interface RadarStore {
  radars: Map<string, RadarState>;
  /** Hasta cuándo no se le pide nada al servicio (ms): se alarga si contesta con error. */
  backoffUntil: number;
  backoffMs: number;
  /** Bytes bajados desde el arranque. */
  bytes: number;
}

export const createRadarStore = (): RadarStore => ({ radars: new Map(), backoffUntil: 0, backoffMs: 0, bytes: 0 });

/** Cada cuánto se buscan imágenes nuevas de un radar que alguien está mirando (sale una imagen cada 10 minutos: no hace falta más seguido). Se cambia con `RADAR_REFRESH_MIN`. */
export const RADAR_REFRESH_MS = 10 * 60_000;
/** Las imágenes tardan ~20 minutos en aparecer: no se busca la que todavía no puede existir (se evitan pedidos que dan 404). */
export const RADAR_LAG_MS = 15 * 60_000;

export function stateOf(store: RadarStore, id: string): RadarState {
  let s = store.radars.get(id);
  if (!s) {
    s = { frames: [], checkedAt: 0 };
    store.radars.set(id, s);
  }
  return s;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Quita el ruido (rayas del sol y clutter del centro, ver `clean.ts`) de la imagen antes de guardarla. Si no se puede leer o algo falla,
 * se devuelve la imagen tal cual: nunca se pierde un cuadro por esto.
 */
export function cleanRadarPng(png: Buffer): Buffer {
  try {
    const img = decodePng(png);
    if (!img) return png;
    const { img: limpia, stats } = cleanRadarImage(img);
    if (stats.rayas + stats.centro === 0) return png;
    return encodePng(limpia.width, limpia.height, limpia.data);
  } catch {
    return png;
  }
}

/** ¿Es un PNG de 512×512 de tamaño razonable? (el servicio devuelve a veces una página de error con código 200). */
export function validRadarPng(buf: Buffer): boolean {
  if (buf.length < 100 || buf.length > MAX_PNG_BYTES) return false;
  if (!buf.subarray(0, 8).equals(PNG_SIGNATURE)) return false;
  return buf.readUInt32BE(16) === 512 && buf.readUInt32BE(20) === 512;
}

export interface RadarFetchOptions {
  base?: string;
  fetchFn?: typeof fetch;
  now?: () => number;
  /** Pausa entre pedidos (ms); 0 en las pruebas. */
  pauseMs?: number;
  /** Cada cuánto se busca de nuevo en un radar mirado (ms). */
  refreshMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Cuánto se descuenta al reloj antes de buscar imágenes (el servicio publica con atraso); 0 por defecto. */
  lagMs?: number;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Una falla del servicio (403, 429, 5xx, red): espera el doble que la vez anterior, de 5 minutos a 1 hora. */
export function registerFailure(store: RadarStore, now: number): void {
  store.backoffMs = Math.min(3_600_000, Math.max(5 * 60_000, store.backoffMs * 2));
  store.backoffUntil = now + store.backoffMs;
}

/**
 * Busca las imágenes nuevas de un radar: prueba los instantes de 10 minutos desde el más reciente hacia atrás, hasta llegar a la que ya se
 * tiene (o hasta `RADAR_LOOKBACK_STEPS` pasos si no se tiene ninguna), baja las que existen (404 = todavía no está o no hubo) y se queda con las
 * últimas `RADAR_FRAMES`. Devuelve cuántas bajó.
 */
export async function refreshRadar(store: RadarStore, radar: RadarSite, opts: RadarFetchOptions = {}): Promise<number> {
  const fetchFn = opts.fetchFn ?? fetch;
  const now = (opts.now ?? Date.now)();
  const sleep = opts.sleep ?? wait;
  const pauseMs = opts.pauseMs ?? 200;
  const base = (opts.base ?? RADAR_DEFAULT_BASE).replace(/\/+$/, '');
  if (now < store.backoffUntil) return 0;
  const state = stateOf(store, radar.id);
  state.checkedAt = now;
  const have = new Set(state.frames.map((f) => f.stamp));
  const newest = state.frames.at(-1)?.stamp ?? null;
  let downloaded = 0;
  for (let i = 0; i < RADAR_LOOKBACK_STEPS; i++) {
    const stamp = frameStamp(now - (opts.lagMs ?? 0) - i * RADAR_STEP_MS);
    // Ya se tiene esta (o una más nueva): lo anterior ya se miró en una vuelta anterior.
    if (have.has(stamp) || (newest !== null && stamp < newest)) break;
    const at = stampToUtcMs(stamp);
    if (at === null) continue;
    let res: Response;
    try {
      res = await fetchFn(`${base}/cache/${radar.id}/${stamp}.png`, { headers: { 'user-agent': RADAR_USER_AGENT, accept: 'image/png' }, signal: AbortSignal.timeout(10_000) });
    } catch {
      registerFailure(store, now);
      break;
    }
    if (res.status === 404) {
      if (pauseMs) await sleep(pauseMs);
      continue;
    }
    if (res.status === 403 || res.status === 429 || res.status >= 500) {
      registerFailure(store, now);
      break;
    }
    if (!res.ok) continue;
    const original = Buffer.from(await res.arrayBuffer());
    if (!validRadarPng(original)) continue;
    const png = cleanRadarPng(original);
    store.backoffMs = 0;
    store.bytes += png.length;
    state.frames.push({ stamp, at, png });
    have.add(stamp);
    downloaded++;
    if (pauseMs) await sleep(pauseMs);
  }
  state.frames.sort((a, b) => a.at - b.at);
  if (state.frames.length > RADAR_FRAMES) state.frames.splice(0, state.frames.length - RADAR_FRAMES);
  return downloaded;
}

/**
 * Vuelta de la tarea: actualiza SIEMPRE los radares cuya última búsqueda ya es vieja (cada 10 minutos), los pida alguien o no: el servidor
 * tiene las imágenes al día para el mapa y para el doble chequeo de los avisos de lluvia. Cada radar baja solo la imagen nueva; el historial
 * (las últimas 12) se completa radar por radar cuando falta, por ejemplo al arrancar. Devuelve las imágenes bajadas.
 */
export async function radarTick(store: RadarStore, opts: RadarFetchOptions = {}): Promise<number> {
  const now = (opts.now ?? Date.now)();
  let total = 0;
  for (const radar of RADARS) {
    const s = store.radars.get(radar.id);
    if (s && now - s.checkedAt < (opts.refreshMs ?? RADAR_REFRESH_MS)) continue;
    total += await refreshRadar(store, radar, opts);
  }
  return total;
}
