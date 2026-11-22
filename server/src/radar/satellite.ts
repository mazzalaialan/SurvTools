import { decodePng, type Rgba } from './pixels.ts';

/**
 * Confirmación contra el satélite: un eco de radar sin nubes frías encima no es lluvia (clutter de suelo, propagación anómala, insectos,
 * interferencia). Se usa el infrarrojo de GOES‑19 (banda 13, NASA GIBS, el mismo que ya muestra el mapa): donde hay tope frío hay nube
 * con desarrollo vertical; el suelo despejado sale gris oscuro.
 *
 * Es una ayuda opcional: si el satélite no responde, está atrasado o no se puede leer, no se filtra nada (el radar sigue como llegó).
 */

export const GIBS_WMS = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi';
export const SATELLITE_LAYER = 'GOES-East_ABI_Band13_Clean_Infrared';
/** Zona que cubre a los 19 radares argentinos. */
export const SAT_BOUNDS = { west: -73, east: -50, south: -44, north: -21 };
/** Tamaño pedido: ≈ 2 km por píxel. */
export const SAT_SIZE = 1150;
/** Gris (rojo = verde = azul) desde el cual se considera tope frío de nube; los tonos con color (muy fríos) cuentan siempre. */
export const FRIO_GRIS = 160;
/** Se agranda lo frío ~18 km: el satélite llega con ~25 minutos más de atraso que el radar y las tormentas se mueven. */
export const FRIO_DILATA_PX = 8;
const STEP_MS = 10 * 60_000;
/** Cuántos instantes hacia atrás se prueba hasta encontrar una imagen publicada (≈ 2 horas). */
const PROBE_STEPS = 12;
/** Una respuesta sin imagen publicada pesa pocos KB. */
const MIN_PNG_BYTES = 50_000;

export interface SatMask {
  /** Instante de la imagen (ms UTC). */
  at: number;
  /** 1 = hay tope frío a menos de unos 18 km. */
  cold: Uint8Array;
}

export function isoMinute(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16) + ':00Z';
}

export function gibsUrl(timeIso: string): string {
  const { west, east, south, north } = SAT_BOUNDS;
  const q = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.1.1',
    REQUEST: 'GetMap',
    LAYERS: SATELLITE_LAYER,
    STYLES: '',
    SRS: 'EPSG:4326',
    BBOX: `${west},${south},${east},${north}`,
    WIDTH: String(SAT_SIZE),
    HEIGHT: String(SAT_SIZE),
    FORMAT: 'image/png',
    TRANSPARENT: 'FALSE',
    TIME: timeIso,
  });
  return `${GIBS_WMS}?${q}`;
}

/** Del dibujo del satélite al mapa de «hay tope frío», agrandado `FRIO_DILATA_PX` (máximo en un cuadrado, en dos pasadas). */
export function coldMaskOf(img: Rgba): Uint8Array {
  const { width: w, height: h, data } = img;
  const raw = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4]!;
    const g = data[i * 4 + 1]!;
    const b = data[i * 4 + 2]!;
    raw[i] = Math.max(Math.abs(r - g), Math.abs(g - b)) > 12 || r >= FRIO_GRIS ? 1 : 0;
  }
  const k = FRIO_DILATA_PX;
  const tmp = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let last = -1e9;
    // distancia al 1 más cercano a la izquierda y a la derecha
    const izq = new Int32Array(w);
    for (let x = 0; x < w; x++) {
      if (raw[y * w + x]) last = x;
      izq[x] = last;
    }
    let next = 1e9;
    for (let x = w - 1; x >= 0; x--) {
      if (raw[y * w + x]) next = x;
      if (x - izq[x]! <= k || next - x <= k) tmp[y * w + x] = 1;
    }
  }
  const out = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    let last = -1e9;
    const arriba = new Int32Array(h);
    for (let y = 0; y < h; y++) {
      if (tmp[y * w + x]) last = y;
      arriba[y] = last;
    }
    let next = 1e9;
    for (let y = h - 1; y >= 0; y--) {
      if (tmp[y * w + x]) next = y;
      if (y - arriba[y]! <= k || next - y <= k) out[y * w + x] = 1;
    }
  }
  return out;
}

export interface SatelliteSource {
  /** Imagen de satélite más cercana (hacia atrás) a `utcMs`, o `null` si no se puede. */
  maskFor(utcMs: number): Promise<SatMask | null>;
}

/** Cliente de GIBS con memoria: una imagen por instante de 10 minutos, las últimas 14. */
export function createGibsSatellite(fetchFn: typeof fetch = fetch, now: () => number = Date.now): SatelliteSource {
  const cache = new Map<number, SatMask | null>();
  let sinImagenHasta = 0;
  return {
    async maskFor(utcMs: number): Promise<SatMask | null> {
      if (now() < sinImagenHasta) return null;
      // La imagen más nueva que puede existir ronda los 30 minutos de atraso; no se pide lo que seguro no está.
      const tope = Math.min(utcMs, now() - 30 * 60_000);
      const start = Math.floor(tope / STEP_MS) * STEP_MS;
      for (let i = 0; i < PROBE_STEPS; i++) {
        const t = start - i * STEP_MS;
        if (cache.has(t)) {
          const hit = cache.get(t)!;
          if (hit) return hit;
          continue;
        }
        try {
          const res = await fetchFn(gibsUrl(isoMinute(t)), { signal: AbortSignal.timeout(25_000) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.length < MIN_PNG_BYTES) {
            cache.set(t, null);
            continue;
          }
          const img = decodePng(buf);
          if (!img || img.width !== SAT_SIZE) return null;
          const mask: SatMask = { at: t, cold: coldMaskOf(img) };
          cache.set(t, mask);
          for (const k of [...cache.keys()].sort((a, b) => a - b).slice(0, Math.max(0, cache.size - 14))) cache.delete(k);
          return mask;
        } catch {
          sinImagenHasta = now() + 5 * 60_000; // el servicio falla: no se insiste por 5 minutos
          return null;
        }
      }
      return null;
    },
  };
}
