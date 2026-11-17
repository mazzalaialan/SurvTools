import { useSettings } from '@/core/settings/settings';

/**
 * Clima de Open-Meteo con dos caminos: primero el servidor propio (`/api/om/...`, que lee la copia local de Open-Meteo) y, si no
 * responde o no tiene ese dato, el servicio público de siempre. Solo toca las direcciones públicas de Open-Meteo: si alguien puso
 * su propia dirección de clima en Ajustes, se respeta y va directo ahí.
 */
const PUBLIC_HOST = /^(api|archive-api|marine-api)\.open-meteo\.com$/;
const OWN_TIMEOUT_MS = 8000;
/** Tras una falla de red o del servidor, no se vuelve a probar el propio por un rato (se va directo al público). */
const BACKOFF_MS = 5 * 60_000;

let ownDownUntil = 0;

/** Solo para las pruebas. */
export function resetOmBackoff(): void {
  ownDownUntil = 0;
}

/** Se usa como `fetch`: mismos argumentos. */
export function omFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return omFetchWith(input, init ?? {}, useSettings.getState().settings.serverUrl, Date.now());
}

export async function omFetchWith(input: RequestInfo | URL, init: RequestInit, serverUrl: string | undefined, now: number): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : null;
  if (url === null) return fetch(input, init);
  const own = ownUrl(url, serverUrl);
  if (own && now >= ownDownUntil) {
    try {
      const signal = init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(OWN_TIMEOUT_MS)]) : AbortSignal.timeout(OWN_TIMEOUT_MS);
      const res = await fetch(own, { ...init, signal });
      if (res.ok) return res;
      // 404 = «ese dato no está en la copia propia» (otra fecha u otra variable): se pide al público sin dar por caído al propio.
      if (res.status !== 404) ownDownUntil = now + BACKOFF_MS;
    } catch {
      if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      ownDownUntil = now + BACKOFF_MS;
    }
  }
  return fetch(url, init);
}

/** La dirección equivalente en el servidor propio, o null si no corresponde usarlo. */
export function ownUrl(url: string, serverUrl: string | undefined): string | null {
  const base = serverUrl?.trim().replace(/\/+$/, '');
  if (!base) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (!PUBLIC_HOST.test(u.hostname) || !u.pathname.startsWith('/v1/')) return null;
  return `${base}/api/om${u.pathname}${u.search}`;
}
