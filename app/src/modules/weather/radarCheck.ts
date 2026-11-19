import type { RainOutlook } from './nowcast';

/**
 * Doble chequeo de un aviso de lluvia con el radar argentino (SINARAME), a través del servidor propio (`GET /api/radar/check`).
 * El radar solo sirve para descartar: devuelve `true` únicamente si el servidor dice «sin eco» (hay radar que cubre el lugar, con imágenes
 * recientes, y no ve nada cerca). Sin servidor, sin conexión, sin cobertura o ante cualquier error, devuelve `false` y sigue valiendo el
 * pronóstico, como siempre. Misma lógica que el servidor (server/src/rain/radarCheck.ts) para los avisos con la app cerrada.
 */

/** Coordenadas redondeadas a ~1 km, como las que ya se mandan al servidor para los avisos. */
const coarse = (x: number) => (Math.round(x * 100) / 100).toFixed(2);

export async function radarSaysDry(serverUrl: string, lat: number, lon: number, outlook: RainOutlook): Promise<boolean> {
  if (outlook.state === 'dry' || !serverUrl.trim()) return false;
  const params = new URLSearchParams({ lat: coarse(lat), lon: coarse(lon), state: outlook.state, minutes: String(outlook.state === 'soon' ? outlook.inMinutes : 0) });
  try {
    const res = await fetch(`${serverUrl.replace(/\/+$/, '')}/api/radar/check?${params}`, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return false;
    return ((await res.json()) as { verdict?: unknown }).verdict === 'clear';
  } catch {
    return false;
  }
}
