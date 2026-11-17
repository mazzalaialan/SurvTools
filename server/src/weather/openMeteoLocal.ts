/**
 * Copia propia de Open-Meteo (contenedor `openmeteo` del compose, con los datos de la región bajados del bucket público).
 * - `localWeatherFetch`: un `fetch` que prueba primero la copia propia y, si no responde o no tiene el dato, usa el servicio público.
 * - `checkLocalAnswer`: decide si lo que contestó la copia propia sirve o conviene pedirlo al público (hueco de datos o fechas fuera de lo que se baja).
 */

export interface LocalWeatherConfig {
  /** Dirección interna de la copia propia (por ejemplo http://openmeteo:8080); null = apagada. */
  localUrl: string | null;
  /** Cuántos años de historial (ERA5) se mantienen: el actual y los anteriores hasta completar esta cantidad. */
  archiveYears: number;
}

/** Primer día del historial que tiene la copia propia. */
export function archiveFrom(now: Date, years: number): string {
  return `${now.getUTCFullYear() - (years - 1)}-01-01`;
}

type Json = Record<string, unknown>;

/** Series (sin la hora) de un bloque de la respuesta. */
function seriesOf(block: unknown): unknown[][] {
  if (!block || typeof block !== 'object') return [];
  return Object.entries(block as Json)
    .filter(([k, v]) => k !== 'time' && k !== 'interval' && Array.isArray(v))
    .map(([, v]) => v as unknown[]);
}

/**
 * `ok`: la respuesta de la copia propia se puede usar. Falso si alguna serie pedida vino toda vacía (la copia propia no tiene esa
 * variable o ese lugar) o, en el historial, si hay huecos (fechas anteriores a lo que se baja).
 */
export function checkLocalAnswer(kind: 'forecast' | 'archive' | 'marine', body: unknown): boolean {
  const items = Array.isArray(body) ? body : [body];
  if (!items.length) return false;
  for (const item of items) {
    if (!item || typeof item !== 'object') return false;
    const it = item as Json;
    for (const sec of ['current', 'hourly', 'daily', 'minutely_15']) {
      const block = it[sec];
      if (sec === 'current' && block && typeof block === 'object') {
        // `current` trae valores sueltos, no listas.
        for (const [k, v] of Object.entries(block as Json)) if (k !== 'time' && k !== 'interval' && v === null) return false;
        continue;
      }
      for (const s of seriesOf(block)) {
        if (!s.length) continue;
        const nulls = s.filter((v) => v === null).length;
        if (nulls === s.length) return false;
        if (kind === 'archive' && nulls > 0) return false;
      }
    }
  }
  return true;
}

/** Pedido de historial anterior a lo que se baja: ni se prueba la copia propia. */
export function archiveOutOfRange(search: URLSearchParams, from: string): boolean {
  const start = search.get('start_date');
  return !!start && start < from;
}

/** `fetch` con la copia propia primero, para las consultas de este servidor (avisos de lluvia y de la huerta). */
export function localWeatherFetch(publicBase: string, cfg: LocalWeatherConfig, fetchImpl: typeof fetch = fetch): typeof fetch {
  const pub = publicBase.replace(/\/+$/, '');
  const local = cfg.localUrl?.replace(/\/+$/, '') ?? null;
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : null;
    if (local && url && url.startsWith(`${pub}/`)) {
      try {
        const res = await fetchImpl(`${local}${url.slice(pub.length)}`, init);
        if (res.ok) {
          const kind = url.includes('/v1/marine') ? 'marine' : url.includes('/v1/archive') ? 'archive' : 'forecast';
          const body = await res.clone().json();
          if (checkLocalAnswer(kind, body)) return res;
        }
      } catch {
        // Sin respuesta de la copia propia: se pide al público.
      }
    }
    return fetchImpl(input, init);
  }) as typeof fetch;
}
