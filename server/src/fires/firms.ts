/**
 * Focos de calor (anomalías térmicas) de NASA FIRMS: las listas públicas de las últimas 24 horas de los satélites VIIRS NOAA-20 y
 * NOAA-21 para América del Sur, sin clave (https://firms.modaps.eosdis.nasa.gov/active_fire/). Cada detección trae su confianza
 * (baja, nominal, alta), su potencia radiativa (FRP, MW) y la hora de la pasada. El servidor baja los últimos 7 días (≈10 MB), muestra
 * solo las últimas 24 horas de América del Sur (Brasil incluido; ver `FIRE_REGION`), agrupadas en celdas de 0,1° (~11 km) para que lleguen livianas al teléfono
 * (`GET /api/fires`, routes/fires.ts), y usa los 7 días para reconocer las fuentes fijas: antorchas de gas, industria.
 * En Brasil se enriquecen con riesgo, días sin lluvia, bioma y municipio del INPE (inpe.ts). Datos abiertos de la NASA (hay que citar a NASA FIRMS). Una anomalía térmica no es siempre un incendio.
 */
import { buildInpeCells, cellKey, fetchInpeRows, type InpeCell, type InpeRow } from './inpe.ts';

export type FireConfidence = 0 | 1 | 2; // baja, nominal, alta

/** Una celda de 0,1°: [lat, lon (centro), detecciones, de alta confianza, nominales, FRP total (MW), minutos desde la más reciente]. */
export type FireCell = [number, number, number, number, number, number, number];

export interface FiresData {
  /** Instante (ms) del que se bajó y cuándo cubre (la detección más reciente, ms). */
  fetchedAt: number;
  newestAt: number;
  /** Cuántas detecciones de las últimas 24 h hay en total en la región (las que se muestran, sin agrupar). */
  total: number;
  /** Detecciones de las últimas 24 h que se ocultaron por ser de una fuente fija (ver `FIXED_DAYS`). */
  hidden: number;
  sources: string[];
  cells: FireCell[];
  /** Solo Brasil: por celda («lat,lon» del centro) lo que aporta el INPE y FIRMS no (ver inpe.ts). Opcional: si el INPE no responde, no viene. */
  inpe?: Record<string, InpeCell>;
}

/** La región original de la app (Argentina, Chile, Uruguay, Bolivia y Perú, con un poco de vecinos): [oeste, sur, este, norte]. Ahí todo sigue igual. */
export const FIRE_REGION_CORE: [number, number, number, number] = [-83, -57, -52, 0.5];
/** Toda América del Sur continental (incluye todo Brasil: la costa del noreste, Roraima y Amapá): [oeste, sur, este, norte]. */
export const FIRE_REGION: [number, number, number, number] = [-83, -57, -33, 13];
const inCore = (lat: number, lon: number) => lon >= FIRE_REGION_CORE[0] && lon <= FIRE_REGION_CORE[2] && lat >= FIRE_REGION_CORE[1] && lat <= FIRE_REGION_CORE[3];

const BASE = 'https://firms.modaps.eosdis.nasa.gov/data/active_fire';
/** Los últimos 7 días de cada satélite: 24 h para mostrar y 7 días para reconocer lo que se repite en el mismo lugar. */
export const FIRE_FILES = [
  { name: 'NOAA-20', url: `${BASE}/noaa-20-viirs-c2/csv/J1_VIIRS_C2_South_America_7d.csv` },
  { name: 'NOAA-21', url: `${BASE}/noaa-21-viirs-c2/csv/J2_VIIRS_C2_South_America_7d.csv` },
];

/** Se muestra la última pasada de las últimas 24 horas. */
export const WINDOW_MS = 24 * 3_600_000;
/**
 * Una fuente fija (antorcha de gas o petróleo, fundición, acería) aparece en el mismo lugar casi todos los días: con detecciones en al
 * menos 6 fechas distintas de las últimas 8 (7 días y la de hoy), en un cuadro de ~1 km con sus vecinos. De esos lugares se ocultan las
 * detecciones de confianza baja y nominal; las de alta confianza se muestran siempre, así un incendio largo no se esconde.
 */
export const FIXED_DAYS = 6;
/**
 * Fuera de la región original (Brasil, Venezuela, Guayanas) se pide repetirse en las 8 fechas. Con 6 se ocultaban quemas agrícolas y de pastura
 * que duran días en el mismo lugar (Amapá, Marajó, Xingú: decenas de «sitios fijos» en 0,5°, medido el 2026-11-19: 401 de 4.352 detecciones no
 * altas cerca de focos brasileños); con 8 se siguen ocultando las antorchas, que no faltan ningún día, y bajan a 116.
 */
export const FIXED_DAYS_OUTSIDE = 8;

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

/** Lugares (cuadros de 0,01° ≈ 1 km, con sus 8 vecinos) con detecciones en `minDays` fechas distintas o más. */
export function fixedSites(detections: Detection[], region = FIRE_REGION, minDays = FIXED_DAYS, minDaysOutside = FIXED_DAYS_OUTSIDE): Set<string> {
  const [w, s, e, n] = region;
  const days = new Map<string, Set<string>>();
  for (const d of detections) {
    if (d.lon < w || d.lon > e || d.lat < s || d.lat > n) continue;
    const key = `${Math.round(d.lat * 100)},${Math.round(d.lon * 100)}`;
    const set = days.get(key) ?? new Set<string>();
    set.add(new Date(d.at).toISOString().slice(0, 10));
    days.set(key, set);
  }
  const fixed = new Set<string>();
  for (const key of days.keys()) {
    const [la, lo] = key.split(',').map(Number) as [number, number];
    const union = new Set<string>();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const day of days.get(`${la! + dy},${lo! + dx}`) ?? []) union.add(day);
    if (union.size >= (inCore(la! / 100, lo! / 100) ? minDays : Math.max(minDays, minDaysOutside))) fixed.add(key);
  }
  return fixed;
}

/** Agrupa en celdas de 0,1° las detecciones de las últimas 24 h dentro de la región, sin las no altas de las fuentes fijas. */
export function buildCells(detections: Detection[], now: number, region = FIRE_REGION): { cells: FireCell[]; total: number; hidden: number; newestAt: number } {
  const [w, s, e, n] = region;
  const fixed = fixedSites(detections, region);
  let hidden = 0;
  const cells = new Map<string, { lat: number; lon: number; n: number; high: number; nominal: number; frp: number; newest: number }>();
  let total = 0;
  let newestAt = 0;
  for (const d of detections) {
    if (d.lon < w || d.lon > e || d.lat < s || d.lat > n || now - d.at > WINDOW_MS || d.at > now + 3_600_000) continue;
    if (d.confidence < 2 && fixed.has(`${Math.round(d.lat * 100)},${Math.round(d.lon * 100)}`)) {
      hidden++;
      continue;
    }
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
    hidden,
    newestAt,
    cells: [...cells.values()]
      .map<FireCell>((c) => [Number(c.lat.toFixed(2)), Number(c.lon.toFixed(2)), c.n, c.high, c.nominal, Math.round(c.frp), Math.max(0, Math.round((now - c.newest) / 60_000))])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]),
  };
}

const UA = 'VikArg-Survival-Tools/1.0';

/** Baja las listas de los satélites (los que fallen se omiten) y arma las celdas; falla si no se pudo bajar ninguna. */
export async function fetchFires(now = Date.now(), fetcher: typeof fetch = fetch, inpe: (now: number) => Promise<InpeRow[]> = (n) => fetchInpeRows(n, fetcher)): Promise<FiresData> {
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
  const { cells, total, hidden, newestAt } = buildCells(all, now);
  const out: FiresData = { fetchedAt: now, newestAt, total, hidden, sources: sources.sort(), cells };
  // El INPE es un complemento: si no responde (o falla algo), la capa sigue con FIRMS solo.
  try {
    const only = new Set(cells.map((c) => cellKey(c[0], c[1])));
    const enriched = buildInpeCells(await inpe(now), only);
    if (Object.keys(enriched).length) out.inpe = enriched;
  } catch {
    /* sin INPE */
  }
  return out;
}
