/**
 * Focos de calor del INPE (Programa Queimadas, Brasil): se usan SOLO para enriquecer las celdas de FIRMS de Brasil con lo que FIRMS no trae:
 * riesgo de fuego, días sin lluvia, bioma, municipio y estado. Sus detecciones NO se suman como focos (incluyen los mismos satélites VIIRS: se
 * duplicarían). Fuente: CSV diario `focos_diario_br_AAAAMMDD.csv` de https://dataserver-coids.inpe.br/queimadas/queimadas/focos/csv/ (sin clave,
 * sin licencia declarada: se usa con crédito al INPE). Medido el 2026-11-19: el de ayer pesa ~2 MB (13.000 filas) y tiene riesgo y días sin
 * lluvia; el de hoy (~0,6 MB) los trae VACÍOS hasta que el INPE lo cierra (~12:00 UTC del día siguiente), por eso el riesgo sale del último
 * archivo que lo tenga. `-999` es «sin dato». Los de `10min/` no traen riesgo ni municipio: no sirven. Si el INPE no responde, la capa sigue con FIRMS solo.
 */
export interface InpeRow {
  lat: number;
  lon: number;
  /** Riesgo de fuego observado (0 a 1) y días sin lluvia; null si el INPE no los trae. */
  risk: number | null;
  dry: number | null;
  biome: string;
  /** «Municipio-UF», ya con mayúsculas y minúsculas. */
  place: string;
}

/** Por celda de 0,1° (clave «lat,lon» del centro, igual a la de `FireCell`): [riesgo máximo, días sin lluvia máximos, bioma, «Municipio-UF»]. */
export type InpeCell = [number | null, number | null, string, string];

const BASE = 'https://dataserver-coids.inpe.br/queimadas/queimadas/focos/csv/diario/Brasil';
const UA = 'VikArg-Survival-Tools/1.0';

const UF: Record<string, string> = {
  ACRE: 'AC', ALAGOAS: 'AL', 'AMAPÁ': 'AP', AMAZONAS: 'AM', BAHIA: 'BA', 'CEARÁ': 'CE', 'DISTRITO FEDERAL': 'DF', 'ESPÍRITO SANTO': 'ES', 'GOIÁS': 'GO',
  'MARANHÃO': 'MA', 'MATO GROSSO': 'MT', 'MATO GROSSO DO SUL': 'MS', 'MINAS GERAIS': 'MG', 'PARÁ': 'PA', 'PARAÍBA': 'PB', 'PARANÁ': 'PR', PERNAMBUCO: 'PE',
  'PIAUÍ': 'PI', 'RIO DE JANEIRO': 'RJ', 'RIO GRANDE DO NORTE': 'RN', 'RIO GRANDE DO SUL': 'RS', 'RONDÔNIA': 'RO', RORAIMA: 'RR', 'SANTA CATARINA': 'SC',
  'SÃO PAULO': 'SP', SERGIPE: 'SE', TOCANTINS: 'TO',
};
const SMALL = new Set(['de', 'da', 'do', 'dos', 'das', 'e']);

/** «BRASIL NOVO» → «Brasil Novo», «MOJUÍ DOS CAMPOS» → «Mojuí dos Campos». */
export function titleCase(name: string): string {
  return name
    .toLowerCase()
    .split(/(\s+|-|')/)
    .map((w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join('');
}

const num = (s: string | undefined): number | null => {
  if (s === undefined || s.trim() === '') return null;
  const n = Number(s);
  return Number.isFinite(n) && n > -900 ? n : null; // -999 = sin dato
};

/** De un CSV diario del INPE, las filas con posición válida. Si cambia el encabezado y faltan columnas, devuelve vacío. */
export function parseInpeCsv(text: string): InpeRow[] {
  const lines = text.split(/\r?\n/);
  const header = (lines[0] ?? '').split(',').map((h) => h.trim());
  const col = (n: string) => header.indexOf(n);
  const [iLat, iLon, iMun, iEst, iDry, iRisk, iBiome] = ['lat', 'lon', 'municipio', 'estado', 'numero_dias_sem_chuva', 'risco_fogo', 'bioma'].map(col);
  if ([iLat, iLon, iMun, iEst, iDry, iRisk, iBiome].some((i) => i! < 0)) return [];
  const out: InpeRow[] = [];
  for (const line of lines.slice(1)) {
    if (!line) continue;
    const f = line.split(',');
    const lat = Number(f[iLat!]);
    const lon = Number(f[iLon!]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const mun = (f[iMun!] ?? '').trim();
    const uf = UF[(f[iEst!] ?? '').trim().toUpperCase()] ?? '';
    const risk = num(f[iRisk!]);
    out.push({ lat, lon, risk: risk === null ? null : Math.min(1, Math.max(0, risk)), dry: num(f[iDry!]), biome: (f[iBiome!] ?? '').trim(), place: mun ? titleCase(mun) + (uf ? `-${uf}` : '') : '' });
  }
  return out;
}

/** Misma clave que usa la app para una celda de FIRMS: centro de la celda de 0,1° con dos decimales. */
export function cellKey(lat: number, lon: number): string {
  return `${Number(((Math.floor(lat * 10) + 0.5) / 10).toFixed(2))},${Number(((Math.floor(lon * 10) + 0.5) / 10).toFixed(2))}`;
}

const mostFrequent = (counts: Map<string, number>): string => [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] ?? '';

/**
 * Agrupa las filas del INPE en las mismas celdas de 0,1° que FIRMS: riesgo y días sin lluvia máximos, y el bioma y el municipio más
 * frecuentes. `only` (las claves de las celdas de FIRMS que se muestran) deja solo las que la app va a usar, así la respuesta no engorda.
 */
export function buildInpeCells(rows: InpeRow[], only?: Set<string>): Record<string, InpeCell> {
  const acc = new Map<string, { risk: number | null; dry: number | null; biome: Map<string, number>; place: Map<string, number> }>();
  for (const r of rows) {
    const key = cellKey(r.lat, r.lon);
    if (only && !only.has(key)) continue;
    const c = acc.get(key) ?? { risk: null, dry: null, biome: new Map(), place: new Map() };
    if (r.risk !== null) c.risk = Math.max(c.risk ?? 0, r.risk);
    if (r.dry !== null) c.dry = Math.max(c.dry ?? 0, r.dry);
    if (r.biome) c.biome.set(r.biome, (c.biome.get(r.biome) ?? 0) + 1);
    if (r.place) c.place.set(r.place, (c.place.get(r.place) ?? 0) + 1);
    acc.set(key, c);
  }
  const out: Record<string, InpeCell> = {};
  for (const [k, c] of acc) out[k] = [c.risk === null ? null : Number(c.risk.toFixed(2)), c.dry === null ? null : Math.round(c.dry), mostFrequent(c.biome), mostFrequent(c.place)];
  return out;
}

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10).replaceAll('-', '');
const DAY = 86_400_000;
/** El de hoy cambia cada 10 minutos; los cerrados casi no cambian. */
const TTL_TODAY = 30 * 60_000;
const TTL_CLOSED = 6 * 3_600_000;
const caches = new WeakMap<typeof fetch, Map<string, { at: number; rows: InpeRow[] }>>();

async function dayRows(day: string, now: number, ttl: number, fetcher: typeof fetch): Promise<InpeRow[]> {
  const cache = caches.get(fetcher) ?? caches.set(fetcher, new Map()).get(fetcher)!;
  const hit = cache.get(day);
  if (hit && now - hit.at < ttl) return hit.rows;
  try {
    const res = await fetcher(`${BASE}/focos_diario_br_${day}.csv`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`INPE ${res.status}`);
    const rows = parseInpeCsv(await res.text());
    cache.set(day, { at: now, rows });
    return rows;
  } catch {
    return hit?.rows ?? []; // sin respuesta: lo último que había, o nada (la capa sigue con FIRMS solo)
  }
}

/**
 * Las filas del INPE de hoy y ayer (UTC, de a un pedido); si ninguna trae riesgo (el de ayer todavía sin cerrar), suma anteayer.
 * Nunca falla: sin respuesta devuelve lo que haya.
 */
export async function fetchInpeRows(now = Date.now(), fetcher: typeof fetch = fetch): Promise<InpeRow[]> {
  const rows = [...(await dayRows(ymd(now), now, TTL_TODAY, fetcher)), ...(await dayRows(ymd(now - DAY), now, TTL_CLOSED, fetcher))];
  if (!rows.some((r) => r.risk !== null)) rows.push(...(await dayRows(ymd(now - 2 * DAY), now, TTL_CLOSED, fetcher)));
  return rows;
}
