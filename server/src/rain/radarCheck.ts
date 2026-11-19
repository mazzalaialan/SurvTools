import { decodePng, type Rgba } from '../radar/pixels.ts';
import { RADARS, RADAR_RANGE_KM, radarBounds, stateOf, type RadarSite, type RadarStore } from '../radar/sinarame.ts';
import type { RainOutlook } from './outlook.ts';
import type { RainSource } from './source.ts';

/**
 * Doble chequeo de los avisos de lluvia con el radar argentino (SINARAME).
 *
 * El radar solo sirve para DESCARTAR un aviso, nunca para crear uno ni para confirmarlo: si en la zona hay cobertura de radar, las imágenes
 * son recientes y no hay ningún eco cerca del lugar, el aviso no corresponde y no se manda. En cualquier otro caso (sin radar que cubra el
 * lugar, imágenes viejas o faltantes, el servicio no responde, imagen que no se puede leer) manda la lógica de siempre (pronóstico + satélite).
 *
 * Cualquier píxel no transparente cuenta como eco, por débil que sea: no se conoce la escala exacta en dBZ de las imágenes (ver
 * docs/FUENTES-DE-DATOS.md), así que ante la duda el aviso se conserva.
 */

/** Más lejos que esto del radar el haz está muy alto y no ve la lluvia baja: no se usa para descartar. */
export const RADAR_CHECK_COVER_KM = 150;
/** Imagen más vieja que esto (ya descontado el atraso de ~20 minutos del servicio): no sirve para decir «ahora no llueve». */
export const RADAR_CHECK_MAX_AGE_MS = 40 * 60_000;
/** La anterior a la última también tiene que ser reciente: se piden dos imágenes sin eco seguidas. */
export const RADAR_CHECK_PREV_MAX_AGE_MS = 70 * 60_000;
/** Radio sin eco para descartar un «está lloviendo»: la imagen tiene ~20 minutos de atraso y la lluvia se mueve unos 60 km/h. */
export const RADAR_CHECK_RAINING_KM = 25;
/** Un «va a llover» se descarta solo si empieza dentro de este tiempo (más allá el radar no dice nada). */
export const RADAR_CHECK_SOON_MAX_MIN = 60;

export type RadarVerdict = 'clear' | 'echo' | 'unknown';

const KM_PER_DEG = 111.32;

/** Distancia en km (aproximada, de sobra para 150 km). */
function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dy = (aLat - bLat) * 110.574;
  const dx = (aLon - bLon) * KM_PER_DEG * Math.cos((((aLat + bLat) / 2) * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

/** Los radares que cubren un punto, del más cercano al más lejano. */
export function radarsCovering(lat: number, lon: number, maxKm = RADAR_CHECK_COVER_KM): RadarSite[] {
  return RADARS.map((r) => ({ r, d: distanceKm(lat, lon, r.lat, r.lon) }))
    .filter((x) => x.d <= maxKm)
    .sort((a, b) => a.d - b.d)
    .map((x) => x.r);
}

/** ¿Hay algún píxel no transparente a menos de `radiusKm` del punto? `null` si el punto cae fuera de la imagen. */
export function echoWithin(img: Rgba, radar: Pick<RadarSite, 'lat' | 'lon'>, lat: number, lon: number, radiusKm: number): boolean | null {
  const b = radarBounds(radar);
  const cx = ((lon - b.west) / (b.east - b.west)) * img.width;
  const cy = ((b.north - lat) / (b.north - b.south)) * img.height;
  if (cx < 0 || cy < 0 || cx >= img.width || cy >= img.height) return null;
  const kmPerPx = (2 * RADAR_RANGE_KM) / img.width;
  const r = radiusKm / kmPerPx;
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(img.width - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(img.height - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > r * r) continue;
      if (img.data[(y * img.width + x) * 4 + 3]! > 0) return true;
    }
  }
  return false;
}

const decoded = new WeakMap<Buffer, Rgba | null>();
function pixelsOf(png: Buffer): Rgba | null {
  if (!decoded.has(png)) decoded.set(png, decodePng(png));
  return decoded.get(png) ?? null;
}

/**
 * Qué dice el radar sobre un lugar, con las imágenes que ya hay en memoria. `echo` si algún radar que lo cubre ve algo cerca; `clear` si al
 * menos uno tiene dos imágenes recientes seguidas sin nada y ninguno ve eco; `unknown` en cualquier otro caso.
 */
export function radarVerdict(store: RadarStore, lat: number, lon: number, radiusKm: number, now = Date.now()): RadarVerdict {
  let clear = false;
  for (const radar of radarsCovering(lat, lon)) {
    const frames = store.radars.get(radar.id)?.frames ?? [];
    const last = frames.at(-1);
    const prev = frames.at(-2);
    if (!last || !prev || now - last.at > RADAR_CHECK_MAX_AGE_MS || now - prev.at > RADAR_CHECK_PREV_MAX_AGE_MS) continue;
    const results = [last, prev].map((f) => {
      const img = pixelsOf(f.png);
      return img ? echoWithin(img, radar, lat, lon, radiusKm) : null;
    });
    if (results.includes(true)) return 'echo';
    if (results.every((r) => r === false)) clear = true;
  }
  return clear ? 'clear' : 'unknown';
}

/** El radio dentro del cual no tiene que haber eco para descartar este aviso, o `null` si el radar no puede descartarlo. */
export function vetoRadiusKm(outlook: RainOutlook): number | null {
  if (outlook.state === 'raining') return RADAR_CHECK_RAINING_KM;
  if (outlook.state === 'soon' && outlook.inMinutes <= RADAR_CHECK_SOON_MAX_MIN) return Math.min(90, 30 + outlook.inMinutes);
  return null;
}

export interface RadarCheckDeps {
  store: RadarStore;
  now?: () => number;
}

/**
 * Marca como «pedidos» los radares que cubren estos lugares, para que la tarea de radares (main.ts, cada minuto) los mantenga al día en
 * segundo plano. No sale a la red: validar un aviso lee solo las imágenes que el servidor ya tiene en memoria, nunca consulta a SINARAME
 * en ese momento.
 */
export function keepRadarsFor(store: RadarStore, points: { lat: number; lon: number }[], now = Date.now()): string[] {
  const ids = [...new Set(points.flatMap((p) => radarsCovering(p.lat, p.lon).map((r) => r.id)))];
  for (const id of ids) stateOf(store, id).requestedAt = now;
  return ids;
}

/** Lo que dice el radar sobre un aviso de un lugar, trayendo antes las imágenes que falten. Sirve a la app abierta (`GET /api/radar/check`). */
export function checkRadar(deps: RadarCheckDeps, lat: number, lon: number, outlook: RainOutlook): { verdict: RadarVerdict; radars: string[] } {
  const now = (deps.now ?? Date.now)();
  // Si todavía no hay imágenes de ese radar (nadie lo pidió antes), la tarea las baja y la próxima consulta ya las encuentra.
  const radars = keepRadarsFor(deps.store, [{ lat, lon }], now);
  const radius = vetoRadiusKm(outlook);
  return { verdict: radius === null ? 'unknown' : radarVerdict(deps.store, lat, lon, radius, now), radars };
}

export interface RadarCheckedSource extends RainSource {
  /** Cuántos avisos descartó el radar desde el arranque. */
  vetoed(): number;
}

/**
 * Envuelve una fuente de lluvia: lo que dice «llueve» o «va a llover» se verifica con el radar y se convierte en «seco» si el radar, con
 * cobertura e imágenes recientes, no ve nada cerca. Solo lee las imágenes que ya están en memoria (las mantiene la tarea de radares).
 */
export function withRadarCheck(source: RainSource, deps: RadarCheckDeps): RadarCheckedSource {
  let vetoed = 0;
  return {
    name: `${source.name}+sinarame`,
    vetoed: () => vetoed,
    async outlooks(points) {
      const outlooks = await source.outlooks(points);
      const toCheck = outlooks.flatMap((o, i) => (o && vetoRadiusKm(o) !== null ? [i] : []));
      if (toCheck.length === 0) return outlooks;
      const now = (deps.now ?? Date.now)();
      return outlooks.map((o, i): RainOutlook | null => {
        const radius = o ? vetoRadiusKm(o) : null;
        if (!o || radius === null) return o;
        if (radarVerdict(deps.store, points[i]!.lat, points[i]!.lon, radius, now) !== 'clear') return o;
        vetoed++;
        return { state: 'dry' };
      });
    },
  };
}
