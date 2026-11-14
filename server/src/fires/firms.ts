/**
 * Focos de calor (anomalías térmicas) de NASA FIRMS: las listas públicas de las últimas 24 horas de los satélites VIIRS NOAA-20 y
 * NOAA-21 para América del Sur, sin clave (https://firms.modaps.eosdis.nasa.gov/active_fire/). Cada detección trae su confianza
 * (baja, nominal, alta), su potencia radiativa (FRP, MW) y la hora de la pasada. El servidor las baja (≈2 MB), se queda con la región
 * de la app y las agrupa en celdas de 0,1° (~11 km) para que lleguen livianas al teléfono: `GET /api/fires` (routes/fires.ts).
 * Datos abiertos de la NASA (hay que citar a NASA FIRMS). Una anomalía térmica no es siempre un incendio.
 */
export type FireConfidence = 0 | 1 | 2; // baja, nominal, alta

/** Una celda de 0,1°: [lat, lon (centro), detecciones, de alta confianza, nominales, FRP total (MW), minutos desde la más reciente]. */
export type FireCell = [number, number, number, number, number, number, number];

export interface FiresData {
  /** Instante (ms) del que se bajó y cuándo cubre (la detección más reciente, ms). */
  fetchedAt: number;
  newestAt: number;
  /** Cuántas detecciones hay en total en la región (sin agrupar). */
  total: number;
  sources: string[];
  cells: FireCell[];
}

/** La región que importa a la app (Argentina, Chile, Uruguay, Bolivia y Perú, con un poco de vecinos): [oeste, sur, este, norte]. */
export const FIRE_REGION: [number, number, number, number] = [-83, -57, -52, 0.5];

const BASE = 'https://firms.modaps.eosdis.nasa.gov/data/active_fire';
export const FIRE_FILES = [
  { name: 'NOAA-20', url: `${BASE}/noaa-20-viirs-c2/csv/J1_VIIRS_C2_South_America_24h.csv` },
  { name: 'NOAA-21', url: `${BASE}/noaa-21-viirs-c2/csv/J2_VIIRS_C2_South_America_24h.csv` },
];

export interface Detection {
  lat: number;
  lon: number;
  /** Instante de la pasada (ms UTC). */
  at: number;
  confidence: FireConfidence;
  frp: number;
}

const CONF: Record<string, FireConfidence> = { l: 0, low: 0, n: 1, nominal: 1, h: 2, high: 2 };

/** De un CSV de FIRMS (sin comillas), las detecciones válidas. Si cambia el encabezado y faltan columnas, devuelve vacío. */
export function parseCsv(text: string): Detection[] {
  const lines = text.split(/\r?\n/);
  const header = (lines[0] ?? '').split(',').map((h) => h.trim());
  const col = (n: string) => header.indexOf(n);
  const [iLat, iLon, iDate, iTime, iConf, iFrp] = ['latitude', 'longitude', 'acq_date', 'acq_time', 'confidence', 'frp'].map(col);
  if ([iLat, iLon, iDate, iTime, iConf].some((i) => i! < 0)) return [];
  const out: Detection[] = [];
  for (const line of lines.slice(1)) {
    if (!line) continue;
    const f = line.split(',');
    const lat = Number(f[iLat!]);
    const lon = Number(f[iLon!]);
    const time = (f[iTime!] ?? '').padStart(4, '0');
    const at = Date.parse(`${f[iDate!]}T${time.slice(0, 2)}:${time.slice(2)}:00Z`);
    const confidence = CONF[(f[iConf!] ?? '').trim().toLowerCase()];
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(at) || confidence === undefined) continue;
    out.push({ lat, lon, at, confidence, frp: Math.max(0, Number(f[iFrp!]) || 0) });
  }
  return out;
}

/** Agrupa en celdas de 0,1°, solo dentro de la región. */
export function buildCells(detections: Detection[], now: number, region = FIRE_REGION): { cells: FireCell[]; total: number; newestAt: number } {
  const [w, s, e, n] = region;
  const cells = new Map<string, { lat: number; lon: number; n: number; high: number; nominal: number; frp: number; newest: number }>();
  let total = 0;
  let newestAt = 0;
  for (const d of detections) {
    if (d.lon < w || d.lon > e || d.lat < s || d.lat > n) continue;
    total++;
    newestAt = Math.max(newestAt, d.at);
    const la = Math.floor(d.lat * 10);
    const lo = Math.floor(d.lon * 10);
    const key = `${la},${lo}`;
    const c = cells.get(key) ?? { lat: (la + 0.5) / 10, lon: (lo + 0.5) / 10, n: 0, high: 0, nominal: 0, frp: 0, newest: 0 };
    c.n++;
    if (d.confidence === 2) c.high++;
    else if (d.confidence === 1) c.nominal++;
    c.frp += d.frp;
    c.newest = Math.max(c.newest, d.at);
    cells.set(key, c);
  }
  return {
    total,
    newestAt,
    cells: [...cells.values()]
      .map<FireCell>((c) => [Number(c.lat.toFixed(2)), Number(c.lon.toFixed(2)), c.n, c.high, c.nominal, Math.round(c.frp), Math.max(0, Math.round((now - c.newest) / 60_000))])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]),
  };
}

const UA = 'VikArg-Survival-Tools/1.0';

/** Baja las listas de los satélites (los que fallen se omiten) y arma las celdas; falla si no se pudo bajar ninguna. */
export async function fetchFires(now = Date.now(), fetcher: typeof fetch = fetch): Promise<FiresData> {
  const all: Detection[] = [];
  const sources: string[] = [];
  await Promise.all(
    FIRE_FILES.map(async (f) => {
      try {
        const res = await fetcher(f.url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(60_000) });
        if (!res.ok) throw new Error(`FIRMS ${res.status}`);
        const rows = parseCsv(await res.text());
        all.push(...rows);
        if (rows.length) sources.push(f.name);
      } catch {
        /* un satélite que falla no tira al otro */
      }
    }),
  );
  if (!sources.length) throw new Error('FIRMS no respondió o cambió de formato');
  const { cells, total, newestAt } = buildCells(all, now);
  return { fetchedAt: now, newestAt, total, sources: sources.sort(), cells };
}
