import { BackgroundGeolocation, type Location, type LocationLogEntry } from '@capgo/background-geolocation';
import { Capacitor } from '@capacitor/core';
import { setRecordingLocation, type Fix, type LocationErrorCode, type RecordingLocationBackend } from './locationBackend';

/**
 * Grabación de la ubicación en la app nativa de Android con `@capgo/background-geolocation` (MPL-2.0): un servicio en primer plano de tipo
 * ubicación (con la notificación fija que Android exige) que sigue andando con la pantalla apagada.
 *
 * El callback del plugin solo corre mientras el WebView está vivo, y con la pantalla apagada Android lo suspende. Por eso la fuente de
 * verdad es el REGISTRO NATIVO del plugin (`locationLog`), que se escribe desde código nativo, sobrevive a la suspensión del WebView y a un
 * reinicio: cada posición se lee de ahí, en orden y sin repetir (por su `id`, que solo sube), y el callback solo avisa que hay novedades.
 * El registro se vacía apenas se pasó a la grabación de la app (que sí va cifrada): queda guardado en el dispositivo (sin copia de seguridad)
 * solo el rato que dura la grabación.
 */

const PAGE = 500;
/** Cada cuánto se lee el registro mientras la app está a la vista (además de al llegar una posición y al volver a la app). */
const POLL_MS = 5_000;

export function fixFromLocation(l: Location): Fix {
  return {
    lat: l.latitude,
    lon: l.longitude,
    accuracy: l.accuracy,
    altitude: l.altitude,
    speed: l.speed,
    heading: l.bearing,
    timestamp: l.time ?? Date.now(),
  };
}

export function errorCode(error: { code?: string; message?: string } | undefined): LocationErrorCode {
  const text = `${error?.code ?? ''} ${error?.message ?? ''}`.toLowerCase();
  return /auth|permission|denied/.test(text) ? 'denied' : 'unavailable';
}

/** Último `id` entregado en esta ejecución. Lo ya entregado se borra del registro, así que tras un reinicio se parte de 0 y solo queda lo pendiente. */
let lastId = 0;
let sink: ((fix: Fix) => void) | null = null;
let timer: ReturnType<typeof setInterval> | undefined;
let draining: Promise<number> | null = null;
let active = false;
let visibilityBound = false;

/** Lee del registro nativo lo que todavía no se entregó y lo entrega en orden. Devuelve cuántos puntos entregó. */
async function drain(to: (fix: Fix) => void): Promise<number> {
  let delivered = 0;
  for (;;) {
    const { entries } = await BackgroundGeolocation.getLocationLog({ afterId: lastId, limit: PAGE });
    for (const e of entries as LocationLogEntry[]) {
      if (e.id <= lastId) continue;
      lastId = e.id;
      to(fixFromLocation(e));
      delivered++;
    }
    if (entries.length < PAGE) break;
  }
  if (delivered) {
    // Ya están en la grabación de la app: no hace falta que sigan en el registro nativo.
    await BackgroundGeolocation.clearLocationLog({ upToId: lastId }).catch(() => undefined);
  }
  return delivered;
}

/** Una sola lectura a la vez: si ya hay una en curso, se espera esa. */
function drainOnce(to: (fix: Fix) => void): Promise<number> {
  draining ??= drain(to).finally(() => {
    draining = null;
  });
  return draining;
}

function bindVisibility() {
  if (visibilityBound || typeof document === 'undefined') return;
  visibilityBound = true;
  // Al volver a la app se lee lo que se grabó con la pantalla apagada.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && active && sink) void drainOnce(sink).catch(() => undefined);
  });
}

export const nativeLocation: RecordingLocationBackend = {
  background: true,
  supported: () => Capacitor.isNativePlatform(),
  async start(onFix, onError, text) {
    sink = onFix;
    active = true;
    lastId = 0;
    bindVisibility();
    // Registro limpio: lo que pudiera haber de una grabación anterior ya se recuperó (`recover`) o no sirve.
    await BackgroundGeolocation.clearLocationLog().catch(() => undefined);
    try {
      await BackgroundGeolocation.start(
        {
          backgroundTitle: text.title,
          backgroundMessage: text.message,
          requestPermissions: true,
          stale: false,
          distanceFilter: 0,
          locationLog: true,
          locationLogMaxEntries: 50_000,
        },
        (position, error) => {
          if (error) onError(errorCode(error));
          else if (position && sink) void drainOnce(sink).catch(() => undefined);
        },
      );
    } catch (e) {
      active = false;
      onError(errorCode(e as { message?: string }));
      return;
    }
    clearInterval(timer);
    timer = setInterval(() => {
      if (sink && document.visibilityState === 'visible') void drainOnce(sink).catch(() => undefined);
    }, POLL_MS);
  },
  async stop() {
    clearInterval(timer);
    timer = undefined;
    // Lo último que quedó en el registro se entrega antes de cortar.
    if (sink) await drainOnce(sink).catch(() => undefined);
    active = false;
    await BackgroundGeolocation.stop().catch(() => undefined);
    sink = null;
  },
  async flush() {
    if (sink) await drainOnce(sink).catch(() => undefined);
  },
  async recover(onFix) {
    return drainOnce(onFix).catch(() => 0);
  },
};

/** Se llama una vez al arrancar la app nativa: la grabación pasa a usar el servicio en primer plano. */
export function startNativeLocation(): void {
  setRecordingLocation(nativeLocation);
}
