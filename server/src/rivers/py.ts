/**
 * Niveles de los ríos de Paraguay desde el servidor: la Dirección de Meteorología e Hidrología (DMH) los publica en una tabla HTML
 * (https://www.meteorologia.gov.py/nivel-rio/indexconvencional.php, estaciones convencionales, una lectura por día) hecha por convenio con
 * la Armada, la ANNP, el MADES y el MOPC. No manda CORS ni coordenadas ni río: el servidor la lee y la une al catálogo
 * app/public/data/rivers-PY.json (tools/river-data/paraguay.mjs) por el código de la estación. Sin licencia declarada: se cita a la DMH
 * y se muestra la fecha de cada lectura. No trae niveles de alerta: solo el nivel, la variación y el mínimo y máximo históricos.
 */
export interface PyStation {
  code: string;
  name: string;
  river: string;
  lat: number;
  lon: number;
  /** La ubicación es la del pueblo, no la de la escala. */
  approx: boolean;
  /** Nivel en metros sobre el cero de la escala y fecha de la lectura (AAAA-MM-DD). */
  level: number;
  date: string;
  /** Variación diaria en centímetros. */
  changeCm: number | null;
  trend: 'rising' | 'falling' | 'steady' | null;
  /** Mínimo y máximo históricos (m y fecha AAAA-MM-DD), si los trae. */
  min: { level: number; date: string } | null;
  max: { level: number; date: string } | null;
}

export interface PyLevels {
  fetchedAt: number;
  stations: PyStation[];
}

export interface PyCatalogStation {
  code: string;
  name: string;
  river: string;
  lat: number;
  lon: number;
  approx: boolean;
}

export const DMH_URL = 'https://www.meteorologia.gov.py/nivel-rio/indexconvencional.php';
const UA = 'VikArg-Survival-Tools/1.0';
const TIMEOUT_MS = 30_000;
/** Menos filas que esto es que la tabla cambió de formato: no se muestra nada dudoso. */
const MIN_ROWS = 10;

const clean = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
/** «15-11-2026» → «2026-11-15». */
const isoDate = (s: string): string | null => {
  const m = /(\d{2})-(\d{2})-(\d{4})/.exec(s);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};
/** «0.78 m» → 0.78. */
const meters = (s: string): number | null => {
  const m = /(-?\d+(?:[.,]\d+)?)\s*m\b/i.exec(s);
  return m ? Number(m[1]!.replace(',', '.')) : null;
};
/** «-0.68m --> 16-10-2024» → { level: -0.68, date: '2024-10-16' }. */
const extreme = (s: string): { level: number; date: string } | null => {
  const level = meters(s);
  const date = isoDate(s);
  return level === null || !date ? null : { level, date };
};

/** De la página de la DMH: una lectura por estación convencional, unida al catálogo por código (las que no están en él se descartan). */
export function parseDmh(html: string, catalog: PyCatalogStation[]): PyStation[] {
  const byCode = new Map(catalog.map((c) => [c.code, c]));
  const out: PyStation[] = [];
  for (const row of html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? []) {
    const code = /vermas_convencional\.php\?code=(\d+)/i.exec(row)?.[1];
    const station = code ? byCode.get(code) : undefined;
    if (!station) continue;
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1]!);
    if (cells.length < 6) continue;
    const date = isoDate(clean(cells[1]!));
    const level = meters(clean(cells[2]!));
    if (!date || level === null) continue;
    const cm = /(-?\d+)\s*cm/i.exec(clean(cells[3]!));
    const changeCm = cm ? Number(cm[1]) : null;
    const icon = /fa-arrow-(up|down)/i.exec(cells[3]!)?.[1]?.toLowerCase();
    const trend = changeCm === null ? null : icon === 'up' || changeCm > 0 ? 'rising' : icon === 'down' || changeCm < 0 ? 'falling' : 'steady';
    out.push({ ...station, level, date, changeCm, trend, min: extreme(clean(cells[4]!)), max: extreme(clean(cells[5]!)) });
  }
  return out;
}

/** Lee la tabla de la DMH; falla si cambió de formato (menos de 10 estaciones conocidas). */
export async function fetchPyLevels(catalog: PyCatalogStation[], now = Date.now(), url = DMH_URL): Promise<PyLevels> {
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const stations = parseDmh(await res.text(), catalog);
  if (stations.length < MIN_ROWS) throw new Error(`la tabla de la DMH trajo ${stations.length} estaciones conocidas: cambió de formato`);
  return { fetchedAt: now, stations };
}
