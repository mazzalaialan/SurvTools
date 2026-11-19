/**
 * Niveles de los ríos de Brasil desde el servidor: telemetría de la Agência Nacional de Águas e Saneamento Básico (ANA),
 * `http://telemetriaws1.ana.gov.br/ServiceANA.asmx/DadosHidrometeorologicos` (XML por HTTP, sin clave ni CORS; registros cada 15 minutos o
 * dos veces por día según la estación, con `Nivel` en cm, `Vazao` en m³/s y `Chuva` en mm, en hora de Brasilia). Sin licencia declarada: se
 * cita a la ANA y al SGB/CPRM, que pone las cotas de referencia (catálogo app/public/data/rivers-BR.json, tools/river-data/brasil.mjs).
 *
 * Se pide una estación por vez, con una pausa entre pedidos y un identificador propio. Ante 403, 429 o 5xx se espera y se reintenta una vez; si
 * sigue mal, se corta la ronda y las estaciones que faltan quedan con su último dato bueno (cada una lleva la hora de su lectura).
 * La fuente es de otro servidor del Estado y a veces trae filas sin nivel (`<Nivel />`), con -9999 o atrasadas: se descartan.
 */
export interface BrThresholds {
  /** Cotas de referencia en cm (SGB/CPRM, tabla de 2023); alguna puede faltar. */
  attention: number | null;
  alert: number | null;
  flood: number | null;
}

export interface BrCatalogStation {
  code: string;
  name: string;
  river: string;
  muni: string;
  lat: number;
  lon: number;
  basin: string;
  thresholds: BrThresholds | null;
}

export interface BrStation extends BrCatalogStation {
  /** Nivel en cm sobre el cero de la escala y momento de la lectura (ISO con la hora de Brasilia). */
  level: number;
  at: string;
  /** Caudal en m³/s de esa misma lectura, si lo trae. */
  flow: number | null;
  /** Variación en cm contra la lectura de unas 6 horas antes (o la más cercana entre 3 y 14 horas) y las horas reales de esa ventana. */
  changeCm: number | null;
  changeHours: number | null;
  trend: 'rising' | 'falling' | 'steady' | null;
}

export interface BrLevels {
  fetchedAt: number;
  stations: BrStation[];
  /** Códigos que en esta ronda no se pudieron actualizar (quedan con su dato anterior si lo había). */
  failed: string[];
}

export interface BrRow {
  /** Milisegundos desde 1970. */
  t: number;
  level: number | null;
  flow: number | null;
}

export const ANA_URL = 'http://telemetriaws1.ana.gov.br/ServiceANA.asmx/DadosHidrometeorologicos';
const UA = 'VikArg-Prepping-Tools/1.0';
const TIMEOUT_MS = 30_000;
/** Un nivel fuera de este rango (cm) es un error de la fuente (-9999 y parecidos). */
const LEVEL_MIN = -500;
const LEVEL_MAX = 4_000;
const FLOW_MAX = 500_000;
/** Cuánto se mira hacia atrás: algunas estaciones quedan días sin nivel (Itaqui). */
const WINDOW_DAYS = 2;
/** Variación mínima, en cm, para decir que sube o baja. */
const STEADY_CM = 5;
const BRT = '-03:00';

const num = (s: string | undefined): number | null => {
  if (s === undefined || s.trim() === '') return null;
  const n = Number(s.trim());
  return Number.isFinite(n) ? n : null;
};

/** De la respuesta XML de una estación: las filas con su hora (más nuevas primero, como las manda la ANA). Descarta las de hora inválida o futura. */
export function parseAnaRows(xml: string, now = Date.now()): BrRow[] {
  const rows: BrRow[] = [];
  for (const m of xml.matchAll(/<DadosHidrometereologicos\b[\s\S]*?<\/DadosHidrometereologicos>/g)) {
    const block = m[0];
    const when = /<DataHora>\s*(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)\s*<\/DataHora>/.exec(block);
    if (!when) continue;
    const t = Date.parse(`${when[1]}T${when[2]!.length === 5 ? `${when[2]}:00` : when[2]}${BRT}`);
    if (!Number.isFinite(t) || t > now + 3_600_000) continue;
    let level = num(/<Nivel>([^<]*)<\/Nivel>/.exec(block)?.[1]);
    if (level !== null && (level < LEVEL_MIN || level > LEVEL_MAX)) level = null;
    let flow = num(/<Vazao>([^<]*)<\/Vazao>/.exec(block)?.[1]);
    if (flow !== null && (flow < 0 || flow > FLOW_MAX)) flow = null;
    rows.push({ t, level, flow });
  }
  return rows.sort((a, b) => b.t - a.t);
}

const iso = (t: number): string => {
  // Hora de Brasilia (UTC-3, sin horario de verano desde 2019) como texto ISO con su desfase.
  const d = new Date(t - 3 * 3_600_000).toISOString().slice(0, 19);
  return `${d}${BRT}`;
};

/** Último nivel válido de las filas y su variación contra unas 6 horas antes. null si ninguna fila trae nivel. */
export function summarize(rows: BrRow[]): Pick<BrStation, 'level' | 'at' | 'flow' | 'changeCm' | 'changeHours' | 'trend'> | null {
  const withLevel = rows.filter((r): r is BrRow & { level: number } => r.level !== null);
  const last = withLevel[0];
  if (!last) return null;
  const HOUR = 3_600_000;
  let ref: (BrRow & { level: number }) | null = null;
  for (const r of withLevel) {
    const h = (last.t - r.t) / HOUR;
    if (h < 3 || h > 14) continue;
    if (!ref || Math.abs(h - 6) < Math.abs((last.t - ref.t) / HOUR - 6)) ref = r;
  }
  const changeCm = ref ? Math.round((last.level - ref.level) * 10) / 10 : null;
  const trend = changeCm === null ? null : changeCm >= STEADY_CM ? 'rising' : changeCm <= -STEADY_CM ? 'falling' : 'steady';
  // El caudal es el de la misma lectura; si esa fila no lo trae, queda sin caudal (no se mezclan horas).
  return { level: last.level, at: iso(last.t), flow: last.flow, changeCm, changeHours: ref ? Math.round(((last.t - ref.t) / HOUR) * 10) / 10 : null, trend };
}

/** Fecha AAAA-MM-DD en hora de Brasilia. */
const brDay = (t: number): string => new Date(t - 3 * 3_600_000).toISOString().slice(0, 10);

export interface FetchBrOptions {
  baseUrl?: string;
  /** Pausa entre pedidos (ms). */
  pauseMs?: number;
  /** Espera antes de reintentar tras 403, 429 o 5xx (ms). */
  backoffMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Pide una estación; devuelve el XML o lanza con el código HTTP. Ante 403/429/5xx espera y reintenta una vez. */
async function fetchStationXml(code: string, now: number, o: Required<FetchBrOptions>): Promise<string> {
  const url = `${o.baseUrl}?codEstacao=${encodeURIComponent(code)}&dataInicio=${brDay(now - WINDOW_DAYS * 86_400_000)}&dataFim=${brDay(now)}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/xml,application/xml' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.ok) return res.text();
    const retryable = res.status === 403 || res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= 1) throw new BlockedError(res.status, retryable);
    await o.sleep(o.backoffMs);
  }
}

class BlockedError extends Error {
  status: number;
  /** 403, 429 o 5xx que siguió después de esperar: se corta la ronda para no insistir. */
  stop: boolean;
  constructor(status: number, stop: boolean) {
    super(`HTTP ${status}`);
    this.status = status;
    this.stop = stop;
  }
}

/**
 * Lee la telemetría de cada estación del catálogo, de a una. `previous` es la lectura anterior: las estaciones que ahora no dan un nivel
 * válido (sin datos, error o ronda cortada) conservan la suya, con su propia hora. Falla si no queda ninguna estación.
 */
export async function fetchBrLevels(catalog: BrCatalogStation[], now = Date.now(), previous: BrLevels | null = null, options: FetchBrOptions = {}): Promise<BrLevels> {
  const o: Required<FetchBrOptions> = { baseUrl: ANA_URL, pauseMs: 1_000, backoffMs: 60_000, sleep: wait, ...options };
  const before = new Map((previous?.stations ?? []).map((s) => [s.code, s]));
  const stations: BrStation[] = [];
  const failed: string[] = [];
  let stopped = false;
  for (const [i, c] of catalog.entries()) {
    let fresh: BrStation | null = null;
    if (!stopped) {
      if (i > 0) await o.sleep(o.pauseMs);
      try {
        const summary = summarize(parseAnaRows(await fetchStationXml(c.code, now, o), now));
        if (summary) fresh = { ...c, ...summary };
      } catch (err) {
        if (err instanceof BlockedError && err.stop) stopped = true;
      }
    }
    if (fresh) stations.push(fresh);
    else {
      failed.push(c.code);
      const old = before.get(c.code);
      if (old) stations.push({ ...c, level: old.level, at: old.at, flow: old.flow, changeCm: old.changeCm, changeHours: old.changeHours, trend: old.trend });
    }
  }
  if (!stations.length) throw new Error('la telemetría de la ANA no dio ninguna estación');
  return { fetchedAt: now, stations, failed };
}
