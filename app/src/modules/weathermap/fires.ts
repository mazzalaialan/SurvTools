import { useEffect, useState } from 'react';

/**
 * Focos de calor de NASA FIRMS desde el servidor propio (`GET /api/fires`, ver server/src/fires/firms.ts): celdas de 0,1° con la cantidad
 * de detecciones por confianza (VIIRS NOAA-20 y NOAA-21, últimas 24 h). La app las agrupa según el zoom y marca con llama solo las de alta
 * confianza. Sin servidor sigue la capa de imagen de la NASA (GIBS), sin confianza. Una anomalía térmica no es siempre un incendio.
 */
/** [lat, lon (centro de la celda), detecciones, de alta confianza, nominales, FRP total (MW), minutos desde la más reciente (al bajarlo)]. */
export type FireCell = [number, number, number, number, number, number, number];

/** Lo que el INPE (solo Brasil) suma a una celda: [riesgo de fuego máximo (0 a 1), días sin lluvia máximos, bioma, «Municipio-UF»]; null = sin dato. */
export type InpeCell = [number | null, number | null, string, string];

export interface FiresData {
  fetchedAt: number;
  newestAt: number;
  total: number;
  /** Detecciones de las últimas 24 h que el servidor ocultó por ser de una fuente fija (antorcha de gas, industria). Con servidores viejos no viene. */
  hidden?: number;
  sources: string[];
  cells: FireCell[];
  /** Solo Brasil y solo si el INPE respondió (servidores viejos no lo traen): por celda («lat,lon» del centro) riesgo, días sin lluvia, bioma y municipio. */
  inpe?: Record<string, InpeCell>;
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
  /** Lo del INPE para las celdas del grupo, si hay (Brasil). */
  inpe?: FireInpe;
}

/** Lo del INPE de un grupo: el riesgo y los días sin lluvia son los máximos; bioma y lugar, los de más detecciones. */
export interface FireInpe {
  risk: number | null;
  dry: number | null;
  biome: string;
  place: string;
  /** Cuántos lugares (municipios) distintos tiene el grupo: con más de uno, `place` es solo el principal. */
  places: number;
}

export type FireRiskLevel = 'min' | 'low' | 'medium' | 'high' | 'critical';

/** Escala oficial del INPE (Programa Queimadas, método de riesgo de fuego v11): mínimo < 0,15; bajo ≤ 0,40; medio ≤ 0,70; alto ≤ 0,95; crítico > 0,95. */
export function fireRiskLevel(risk: number): FireRiskLevel {
  return risk < 0.15 ? 'min' : risk <= 0.4 ? 'low' : risk <= 0.7 ? 'medium' : risk <= 0.95 ? 'high' : 'critical';
}

/** Tamaños de casilla (grados) entre los que se elige según el zoom: cada uno el doble del anterior; el más chico es la celda de FIRMS (0,1°). */
export const FIRE_CELL_DEGREES = [0.1, 0.2, 0.4, 0.8, 1.6, 3.2, 6.4];

/**
 * Qué casilla geográfica usar según el zoom: la más chica que ocupe al menos `minPx` píxeles de pantalla (`pxPerDegree` es lo que mide un
 * grado de longitud en pantalla). Cambia en saltos al hacer zoom y **no cambia al desplazar el mapa**, así los grupos no se rearman al moverlo.
 */
export function fireCellDegrees(pxPerDegree: number, minPx = 22): number {
  return FIRE_CELL_DEGREES.find((d) => d * pxPerDegree >= minPx) ?? FIRE_CELL_DEGREES[FIRE_CELL_DEGREES.length - 1]!;
}

/**
 * Junta las celdas que caen en la misma casilla geográfica de `cellDeg` grados (una grilla fija sobre el mapa, no sobre la pantalla): lejos del
 * zoom son miles de celdas y se amontonan; así queda una marca por casilla (la de más confianza manda) y la misma casilla da el mismo grupo
 * en cualquier posición del mapa. `visible` (opcional) deja solo los grupos que caen en pantalla, decidido sobre el grupo ya armado.
 */
export function clusterFires(cells: FireCell[], cellDeg: number, visible?: (lat: number, lon: number) => boolean, inpe?: Record<string, InpeCell> | null): FireCluster[] {
  type Bucket = { sl: number; so: number; w: number; n: number; high: number; nominal: number; frp: number; newest: number; risk: number | null; dry: number | null; biome: Map<string, number>; place: Map<string, number> };
  const buckets = new Map<string, Bucket>();
  for (const [lat, lon, n, high, nominal, frp, newest] of cells) {
    const key = `${Math.floor(lat / cellDeg)},${Math.floor(lon / cellDeg)}`;
    const b = buckets.get(key) ?? { sl: 0, so: 0, w: 0, n: 0, high: 0, nominal: 0, frp: 0, newest: Infinity, risk: null, dry: null, biome: new Map(), place: new Map() };
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
    const extra = inpe?.[`${lat},${lon}`];
    if (extra) {
      if (extra[0] !== null) b.risk = Math.max(b.risk ?? 0, extra[0]);
      if (extra[1] !== null) b.dry = Math.max(b.dry ?? 0, extra[1]);
      if (extra[2]) b.biome.set(extra[2], (b.biome.get(extra[2]) ?? 0) + n);
      if (extra[3]) b.place.set(extra[3], (b.place.get(extra[3]) ?? 0) + n);
    }
    buckets.set(key, b);
  }
  return [...buckets.values()]
    .map<FireCluster>((b) => {
      const c: FireCluster = { lat: b.sl / b.w, lon: b.so / b.w, n: b.n, high: b.high, nominal: b.nominal, low: Math.max(0, b.n - b.high - b.nominal), frp: b.frp, newestMin: b.newest };
      if (b.risk !== null || b.dry !== null || b.biome.size || b.place.size) c.inpe = { risk: b.risk, dry: b.dry, biome: top(b.biome), place: top(b.place), places: b.place.size };
      return c;
    })
    .filter((c) => !visible || visible(c.lat, c.lon));
}

const RISK_KEY = { min: 'Min', low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' } as const;

/** La línea del detalle: «Riesgo de fuego: crítico · 12 días sin lluvia · Cerrado · Corumbá-MS» (lo que falta se omite). */
export function inpeSummary(inpe: FireInpe, t: (key: string, opts?: Record<string, unknown>) => string): string {
  return [
    inpe.risk !== null && t('weatherMap.fireInpeRisk', { level: t(`weatherMap.fireRisk${RISK_KEY[fireRiskLevel(inpe.risk)]}`) }),
    inpe.dry !== null && t('weatherMap.fireInpeDry', { count: inpe.dry }),
    inpe.biome,
    inpe.place && (inpe.places > 1 ? t('weatherMap.fireInpePlaceMore', { place: inpe.place }) : inpe.place),
  ]
    .filter(Boolean)
    .join(' · ');
}

const top = (m: Map<string, number>): string => [...m.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] ?? '';

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
