/**
 * Lo que cambia según la plataforma en las notificaciones. `notifications.ts` (qué se activa, el servidor, los borrados pendientes) habla con
 * esta interfaz y no con el navegador. Hoy hay una sola implementación, la web (service worker, Web Push y Periodic Background Sync); en la
 * app nativa va a haber otra (Firebase Cloud Messaging y notificaciones locales de Capacitor, ver docs/PENDIENTES.md, «App nativa»).
 */
export interface NotificationBackend {
  /** ¿Este dispositivo puede mostrar notificaciones? */
  supported(): boolean;
  /** Pide el permiso; `true` si quedó concedido. */
  requestPermission(): Promise<boolean>;
  /** Registra el aviso diario sin servidor; `true` si quedó activo (el navegador puede negarlo). */
  registerDaily(): Promise<boolean>;
  unregisterDaily(): Promise<void>;
  /**
   * Lo que el servidor necesita para mandar un push a este dispositivo (en la web, la suscripción de Web Push; en la nativa, el token de
   * FCM). `null` si el dispositivo no tiene push. La clave pública VAPID solo la usa la implementación web.
   */
  subscribePush(vapidPublicKey: string): Promise<unknown | null>;
  unsubscribePush(): Promise<void>;
  /** Muestra una notificación desde la propia app (prueba y avisos locales). */
  showLocal(title: string, body: string): Promise<void>;
}

const PERIODIC_SYNC_TAG = 'vikarg-alerts';
const PERIODIC_MIN_INTERVAL_MS = 12 * 3_600_000;

interface PeriodicSyncManager {
  register(tag: string, options: { minInterval: number }): Promise<void>;
  unregister(tag: string): Promise<void>;
}

const periodicSync = (reg: ServiceWorkerRegistration) => (reg as ServiceWorkerRegistration & { periodicSync?: PeriodicSyncManager }).periodicSync;

function base64UrlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/**
 * La implementación web. Todo pasa por el service worker, que en un navegador recién abierto o con la máquina cargada puede tardar unos
 * segundos en estar listo: se espera a `serviceWorker.ready` (no hay plazo propio) y quien llama decide cuánto esperar.
 */
export const webBackend: NotificationBackend = {
  supported: () => typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator,
  async requestPermission() {
    return (await Notification.requestPermission()) === 'granted';
  },
  async registerDaily() {
    const sync = periodicSync(await navigator.serviceWorker.ready);
    if (!sync) return false;
    try {
      await sync.register(PERIODIC_SYNC_TAG, { minInterval: PERIODIC_MIN_INTERVAL_MS });
      return true;
    } catch {
      // Chrome solo lo concede a apps instaladas y con uso frecuente.
      return false;
    }
  },
  async unregisterDaily() {
    await periodicSync(await navigator.serviceWorker.ready)?.unregister(PERIODIC_SYNC_TAG).catch(() => undefined);
  },
  async subscribePush(vapidPublicKey) {
    const reg = await navigator.serviceWorker.ready;
    if (!reg.pushManager) return null;
    // Si había una suscripción de otro servidor, sus claves no sirven: se renueva.
    await (await reg.pushManager.getSubscription())?.unsubscribe();
    const subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(vapidPublicKey) });
    return subscription.toJSON();
  },
  async unsubscribePush() {
    const reg = await navigator.serviceWorker.ready;
    await (await reg.pushManager?.getSubscription())?.unsubscribe();
  },
  async showLocal(title, body) {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, { body, icon: 'brand/icon-192.png' });
  },
};

let current: NotificationBackend = webBackend;

/** La implementación vigente (la web, salvo que se haya cambiado). */
export const notificationBackend = (): NotificationBackend => current;

/** Cambia la implementación: la app nativa pone la suya al arrancar y las pruebas, una falsa. Devuelve la anterior. */
export function setNotificationBackend(next: NotificationBackend): NotificationBackend {
  const previous = current;
  current = next;
  return previous;
}
