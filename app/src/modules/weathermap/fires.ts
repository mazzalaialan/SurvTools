import { useEffect, useState } from 'react';

/**
 * Focos de calor de NASA FIRMS desde el servidor propio (`GET /api/fires`, ver server/src/fires/firms.ts): celdas de 0,1° con la cantidad
 * de detecciones por confianza (VIIRS NOAA-20 y NOAA-21, últimas 24 h). La app las agrupa según el zoom y marca con llama solo las de alta
 * confianza. Sin servidor sigue la capa de imagen de la NASA (GIBS), sin confianza. Una anomalía térmica no es siempre un incendio.
 */
/** [lat, lon (centro de la celda), detecciones, de alta confianza, nominales, FRP total (MW), minutos desde la más reciente (al bajarlo)]. */
export type FireCell = [number, number, number, number, number, number, number];

export interface FiresData {
  fetchedAt: number;
  newestAt: number;
  total: number;
  /** Detecciones de las últimas 24 h que el servidor ocultó por ser de una fuente fija (antorcha de gas, industria). Con servidores viejos no viene. */
  hidden?: number;
  sources: string[];
  cells: FireCell[];
  stale?: boolean;
}

export async function fetchFires(server: string, fetcher: typeof fetch = fetch): Promise<FiresData> {
  const res = await fetcher(`${server.replace(/\/+$/, '')}/api/fires`, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`servidor ${res.status}`);
  const data = (await res.json()) as FiresData;
  if (!Array.isArray(data.cells)) throw new Error('respuesta inesperada');
  return data;
}

/** Solo la alta confianza: cada celda queda con sus detecciones de alta confianza y nada más (la potencia queda la de toda la celda). */
export function onlyHigh(cells: FireCell[]): FireCell[] {
  return cells.filter((c) => c[3] > 0).map<FireCell>(([lat, lon, , high, , frp, newest]) => [lat, lon, high, high, 0, frp, newest]);
}

/** Un grupo de celdas cercanas en pantalla. */
export interface FireCluster {
  lat: number;
  lon: number;
  /** Detecciones en total y por confianza (las que no son altas ni nominales son bajas). */
  n: number;
  high: number;
  nominal: number;
  low: number;
  frp: number;
  /** Minutos desde la detección más reciente, contados al momento de bajar los datos. */
  newestMin: number;
}

/**
 * Junta las celdas que caen en la misma casilla de `cellPx` píxeles de pantalla: lejos del zoom son miles de celdas y se amontonan; así
 * queda una marca por casilla (la de más confianza manda). `project` pasa lat/lon a píxeles.
 */
export function clusterFires(cells: FireCell[], project: (lat: number, lon: number) => { x: number; y: number }, cellPx: number, bounds?: { width: number; height: number }): FireCluster[] {
  const buckets = new Map<number, { sl: number; so: number; w: number; n: number; high: number; nominal: number; frp: number; newest: number }>();
  for (const [lat, lon, n, high, nominal, frp, newest] of cells) {
    const p = project(lat, lon);
    if (bounds && (p.x < -cellPx || p.y < -cellPx || p.x > bounds.width + cellPx || p.y > bounds.height + cellPx)) continue;
    const key = Math.floor(p.y / cellPx) * 100_000 + Math.floor(p.x / cellPx);
    const b = buckets.get(key) ?? { sl: 0, so: 0, w: 0, n: 0, high: 0, nominal: 0, frp: 0, newest: Infinity };
    // El centro del grupo se inclina hacia donde hay más detecciones de alta confianza.
    const weight = n + high * 3;
    b.sl += lat * weight;
    b.so += lon * weight;
    b.w += weight;
    b.n += n;
    b.high += high;
    b.nominal += nominal;
    b.frp += frp;
    b.newest = Math.min(b.newest, newest);
    buckets.set(key, b);
  }
  return [...buckets.values()].map((b) => ({ lat: b.sl / b.w, lon: b.so / b.w, n: b.n, high: b.high, nominal: b.nominal, low: Math.max(0, b.n - b.high - b.nominal), frp: b.frp, newestMin: b.newest }));
}

/** Cómo se dibuja un grupo: llama (hay alta confianza), punto naranja (nominal) o punto amarillo chico (solo baja confianza). */
export function fireLevel(c: Pick<FireCluster, 'high' | 'nominal'>): 'flame' | 'orange' | 'low' {
  return c.high > 0 ? 'flame' : c.nominal > 0 ? 'orange' : 'low';
}

const REFRESH_MS = 30 * 60_000;

/** Carga los focos del servidor propio con la capa prendida (cada 30 minutos); sin conexión queda lo último guardado. `failed`: no se pudo y no hay nada guardado. */
export function useFires(on: boolean, serverUrl: string | null | undefined, online: boolean): { data: FiresData | null; failed: boolean } {
  const [data, setData] = useState<FiresData | null>(() => loadSavedFires());
  const [failed, setFailed] = useState(false);
  const server = serverUrl?.trim() || null;
  useEffect(() => {
    if (!on || !server || !online) return;
    let cancelled = false;
    const load = () =>
      void fetchFires(server).then(
        (d) => {
          if (cancelled) return;
          saveFires(d);
          setData(d);
          setFailed(false);
        },
        () => !cancelled && setFailed(true),
      );
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [on, server, online]);
  return { data: on ? data : null, failed };
}

const STORE = 'vikarg.fires.last';
export function loadSavedFires(): FiresData | null {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as FiresData) : null;
  } catch {
    return null;
  }
}
export function saveFires(d: FiresData): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(d));
  } catch {
    /* sin lugar (son unos cientos de KB): se ve igual con conexión */
  }
}
