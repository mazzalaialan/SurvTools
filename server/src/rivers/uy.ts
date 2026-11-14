/**
 * Niveles de ríos de Uruguay desde el servidor, de dos fuentes públicas sin licencia declarada (se citan, con la fecha de cada lectura):
 *  - CARU (Comisión Administradora del Río Uruguay): HTML de alturas de los puertos del río Uruguay y de sus estaciones automáticas, en un
 *    servidor viejo por HTTP sin TLS (por eso solo el servidor puede leerlo: una PWA https no puede pedir http). Alturas sobre el cero local.
 *  - DINAGUA (Observatorio Hidrológico): la API que usa su visualizador público (`/api/niveles-y-caudales`), con los niveles de ~60 estaciones
 *    de las últimas 24 horas (Río Negro, Yí, Santa Lucía, Cuareim, Laguna Merín…). No manda CORS para otros sitios web: solo el servidor.
 * Ninguna da umbrales de alerta: solo el nivel, su variación y cuándo se midió.
 */
export interface UyStation {
  id: string;
  name: string;
  source: 'CARU' | 'DINAGUA';
  /** Quien mide, según la fuente (UTE, CTM, OSE, Prefectura…). */
  provider: string;
  lat: number;
  lon: number;
  /** Nivel en metros sobre el cero de la estación. */
  level: number;
  /** Cuándo se midió (ISO, con la hora de Uruguay) y cuánto cambió el nivel (m) respecto de la lectura anterior o de hace ~24 h. */
  at: string;
  change: number | null;
  trend: 'rising' | 'falling' | 'steady' | null;
}

export interface UyLevels {
  fetchedAt: number;
  stations: UyStation[];
  /** Qué fuentes se pudieron leer esta vez. */
  sources: { caru: boolean; dinagua: boolean };
}

export const CARU_URL = 'http://190.0.152.194:8080/alturas/web/user/alturas';
export const DINAGUA_URL = 'https://www.ambiente.gub.uy/dinagua-obh/api/niveles-y-caudales';
const UA = 'VikArg-Survival-Tools/1.0';
/** Uruguay es UTC−3 todo el año. */
const OFFSET = '-03:00';

/** Los puertos y estaciones de CARU del lado uruguayo y Salto Grande (los del lado argentino ya salen del INA): coordenadas aproximadas. */
const CARU_PLACES: Record<string, [number, number]> = {
  'bella union': [-30.26, -57.6],
  salto: [-31.39, -57.96],
  'salto grande aguas arriba': [-31.28, -57.94],
  'salto grande aguas abajo': [-31.28, -57.94],
  paysandu: [-32.32, -58.08],
  'fray bentos': [-33.12, -58.3],
  'nueva palmira': [-33.88, -58.42],
};
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const clean = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** «14/11/2026 - 12:00» → ISO con hora de Uruguay. */
function caruDate(s: string): string | null {
  const m = /(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d{2}):(\d{2})/.exec(s);
  return m ? `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00${OFFSET}` : null;
}

/** De la página de alturas de CARU: los puertos (con «Estado» y «Registro anterior») y las estaciones automáticas, solo las ubicables. */
export function parseCaru(html: string): UyStation[] {
  const out: UyStation[] = [];
  const seen = new Set<string>();
  for (const row of html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => clean(c[1]!));
    const link = /href="\/alturas\/web\/user\/(altura|estacion)\/(\d+)(?:\/\d+)?"/i.exec(row);
    if (cells.length < 7 || !link) continue;
    const name = cells[0]!;
    const place = CARU_PLACES[norm(name)];
    const at = caruDate(cells[1]!);
    const level = Number(cells[2]!.replace(',', '.'));
    if (!place || !at || !Number.isFinite(level)) continue;
    const prev = Number(cells[6]!.replace(',', '.'));
    const state = /crece/i.test(cells[5]!) ? 'rising' : /baja/i.test(cells[5]!) ? 'falling' : /estacionado/i.test(cells[5]!) ? 'steady' : null;
    const id = `caru-${link[1]!.toLowerCase()}-${link[2]}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name: link[1]!.toLowerCase() === 'estacion' ? `${name} (automática)` : name,
      source: 'CARU',
      provider: link[1]!.toLowerCase() === 'estacion' ? 'CARU y CTM' : 'Prefectura',
      lat: place[0],
      lon: place[1],
      level,
      at,
      change: Number.isFinite(prev) ? Number((level - prev).toFixed(3)) : null,
      trend: state,
    });
  }
  return out;
}

interface DinaguaSeries {
  estacion?: { stationName?: string; lat?: string; lon?: string };
  proveedor?: string;
  locationId?: string;
  units?: string;
  events?: { date?: string; time?: string; value?: string }[];
}

/** Uruguay: [oeste, sur, este, norte]. */
const URUGUAY: [number, number, number, number] = [-58.6, -35.1, -53.0, -30.0];
/** Una estación sin lectura de las últimas 48 horas no se muestra. */
const MAX_AGE_MS = 48 * 3_600_000;

const title = (s: string) => s.toLowerCase().replace(/(^|[\s(.])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase()).replace(/\b(De|Del|La|Las|Los|Y)\b/g, (w) => w.toLowerCase()).replace(/\b(Ii|Iii|Iv)\b/g, (w) => w.toUpperCase());

/** De la respuesta de DINAGUA: las estaciones de nivel de Uruguay con lecturas de las últimas 48 horas (UTE, DINAGUA, CTM, OSE). */
export function parseDinagua(json: unknown, now = Date.now()): UyStation[] {
  const rows = (json as { nivelRioTabla?: DinaguaSeries[] } | null)?.nivelRioTabla;
  if (!Array.isArray(rows)) return [];
  const [w, s, e, n] = URUGUAY;
  const out: UyStation[] = [];
  for (const r of rows) {
    const lat = Number(r.estacion?.lat);
    const lon = Number(r.estacion?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lon < w || lon > e || lat < s || lat > n || r.units !== 'm') continue;
    if (!['UTE', 'DINAGUA', 'CTM', 'OSE'].includes(r.proveedor ?? '')) continue;
    const events = (r.events ?? []).flatMap((ev) => {
      const t = Date.parse(`${ev.date}T${ev.time}${OFFSET}`);
      const v = Number(ev.value);
      return Number.isFinite(t) && Number.isFinite(v) ? [{ t, v }] : [];
    });
    events.sort((a, b) => a.t - b.t);
    const last = events[events.length - 1];
    if (!last || now - last.t > MAX_AGE_MS) continue;
    // Variación: contra la lectura más vieja que tenga al menos 6 horas de distancia (las de 24 h traen de 7 a 19 puntos).
    const first = events[0]!;
    const span = last.t - first.t;
    const change = span >= 6 * 3_600_000 ? Number((last.v - first.v).toFixed(3)) : null;
    const name = title((r.estacion?.stationName ?? '').replace(/\s*\(RHT\)\s*$/i, '').trim());
    if (!name) continue;
    out.push({
      id: `dinagua-${r.proveedor}-${r.locationId ?? name}`,
      name,
      source: 'DINAGUA',
      provider: r.proveedor!,
      lat,
      lon,
      level: last.v,
      at: new Date(last.t).toISOString(),
      change,
      trend: change === null ? null : Math.abs(change) < 0.03 ? 'steady' : change > 0 ? 'rising' : 'falling',
    });
  }
  return out;
}

async function get(url: string, accept: string): Promise<Response> {
  const res = await fetch(url, { headers: { 'user-agent': UA, accept }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

export interface UySources {
  caruUrl?: string;
  dinaguaUrl?: string;
}

/** Lee las dos fuentes (cada una puede fallar sin tirar a la otra); falla si ninguna da estaciones. */
export async function fetchUyLevels(now = Date.now(), urls: UySources = {}): Promise<UyLevels> {
  const [caru, dinagua] = await Promise.all([
    get(urls.caruUrl ?? CARU_URL, 'text/html').then(async (r) => parseCaru(await r.text()), () => [] as UyStation[]),
    get(urls.dinaguaUrl ?? DINAGUA_URL, 'application/json').then(async (r) => parseDinagua(await r.json(), now), () => [] as UyStation[]),
  ]);
  if (!caru.length && !dinagua.length) throw new Error('CARU y DINAGUA no respondieron o cambiaron de formato');
  return { fetchedAt: now, stations: [...caru, ...dinagua], sources: { caru: caru.length > 0, dinagua: dinagua.length > 0 } };
}
