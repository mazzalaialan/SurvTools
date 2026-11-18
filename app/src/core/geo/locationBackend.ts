/**
 * De dónde salen las posiciones de una grabación. En la web (navegador, también instalada como PWA) es `navigator.geolocation`, que se
 * detiene con la pantalla apagada. En la app nativa (Capacitor) es un servicio en primer plano con un registro nativo que sigue grabando con
 * el WebView suspendido (`nativeLocation.ts`). La grabación (`tracks/recorder.ts`) solo habla con esta interfaz.
 * Ver docs/PENDIENTES.md, «App nativa».
 */

/** Una posición, igual en las dos plataformas. */
export interface Fix {
  lat: number;
  lon: number;
  /** Precisión horizontal en metros. */
  accuracy: number;
  altitude: number | null;
  /** m/s. */
  speed: number | null;
  /** Grados desde el norte. */
  heading: number | null;
  /** Hora de la medición (ms). */
  timestamp: number;
}

export type LocationErrorCode = 'denied' | 'timeout' | 'unavailable' | 'unsupported';

/** Los textos de la notificación fija que Android exige mientras se graba con la pantalla apagada. */
export interface ForegroundText {
  title: string;
  message: string;
}

export interface RecordingLocationBackend {
  /** ¿Sigue grabando con la pantalla apagada? Si no, la grabación marca un corte al apagarla (ver `recorder.ts`). */
  readonly background: boolean;
  supported(): boolean;
  /** Empieza a entregar posiciones, en orden y sin repetir. */
  start(onFix: (fix: Fix) => void, onError: (code: LocationErrorCode) => void, text: ForegroundText): Promise<void>;
  /** Entrega lo que quedaba pendiente y deja de grabar. */
  stop(): Promise<void>;
  /** Entrega ahora lo que se grabó mientras la app no lo recibía (al volver a la app). */
  flush?(): Promise<void>;
  /** Puntos que quedaron en el dispositivo de una grabación que se cortó (la app se cerró): se piden al reabrir. */
  recover?(onFix: (fix: Fix) => void): Promise<number>;
}

/** Posición del navegador → `Fix`. */
export function fixFromBrowser(p: GeolocationPosition): Fix {
  const finite = (n: number | null) => (n !== null && Number.isFinite(n) ? n : null);
  return {
    lat: p.coords.latitude,
    lon: p.coords.longitude,
    accuracy: p.coords.accuracy,
    altitude: finite(p.coords.altitude),
    speed: finite(p.coords.speed),
    heading: finite(p.coords.heading),
    timestamp: p.timestamp,
  };
}

let watchId: number | null = null;

export const webLocation: RecordingLocationBackend = {
  background: false,
  supported: () => typeof navigator !== 'undefined' && 'geolocation' in navigator,
  async start(onFix, onError) {
    if (!this.supported()) {
      onError('unsupported');
      return;
    }
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = navigator.geolocation.watchPosition(
      (p) => onFix(fixFromBrowser(p)),
      (e) => onError(e.code === e.PERMISSION_DENIED ? 'denied' : e.code === e.TIMEOUT ? 'timeout' : 'unavailable'),
      // Sin posiciones guardadas: al seguir tras una pausa, la última sería la de donde se pausó.
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 },
    );
  },
  async stop() {
    if (watchId !== null && typeof navigator !== 'undefined') navigator.geolocation.clearWatch(watchId);
    watchId = null;
  },
};

let current: RecordingLocationBackend = webLocation;

/** La implementación vigente (la web, salvo que la app nativa ponga la suya al arrancar). */
export const recordingLocation = (): RecordingLocationBackend => current;

/** Cambia la implementación (la app nativa al arrancar; las pruebas, una falsa). Devuelve la anterior. */
export function setRecordingLocation(next: RecordingLocationBackend): RecordingLocationBackend {
  const previous = current;
  current = next;
  return previous;
}
