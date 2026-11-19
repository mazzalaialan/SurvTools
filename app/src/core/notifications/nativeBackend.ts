import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications } from '@capacitor/push-notifications';
import { setNotificationBackend, type LocalNotification, type NotificationBackend, type ShownNotification } from './backend';
import { useSettings } from '@/core/settings/settings';
import { genericPushNotification, testNotification } from './format';
import { syncPushAlerts } from './notifications';
import { cancelDaily, refreshNativeDaily } from './nativeDaily';

/**
 * Notificaciones en la app nativa (Capacitor): avisos locales con `@capacitor/local-notifications` y push con Firebase Cloud Messaging
 * (`@capacitor/push-notifications`). Reemplaza al backend web (service worker) y se instala al arrancar la app (`startNativeNotifications`).
 * Ver docs/PENDIENTES.md, «App nativa».
 *
 * El aviso diario sin servidor se programa de antemano con avisos locales (nativeDaily.ts). Falta el envío por APNs de iPhone.
 */

/** Un fallo al programar el aviso diario no debe romper nada, pero tiene que quedar a la vista en el registro. */
function logDailyError(err: unknown): false {
  console.error('[avisos] no se pudo programar el aviso diario', err);
  return false;
}

type Permission = 'granted' | 'denied' | 'default';
let permission: Permission = 'default';
const toPermission = (state: string): Permission => (state === 'granted' ? 'granted' : state === 'denied' ? 'denied' : 'default');

/** `NotificationBackend.permission()` es síncrono y el de Capacitor no: se guarda el último valor conocido y se actualiza al pedirlo. */
export async function refreshNativePermission(): Promise<Permission> {
  permission = toPermission((await LocalNotifications.checkPermissions()).display);
  return permission;
}

/** Entero positivo estable a partir de la etiqueta: dos avisos con la misma etiqueta comparten número y el nuevo reemplaza al anterior. */
export function idForTag(tag: string): number {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (Math.imul(h, 31) + tag.charCodeAt(i)) | 0;
  return Math.abs(h) % 2_000_000_000 || 1;
}

const platformName = (): 'android' | 'ios' => (Capacitor.getPlatform() === 'ios' ? 'ios' : 'android');

export const nativeBackend: NotificationBackend = {
  supported: () => Capacitor.isNativePlatform(),
  permission: () => permission,
  async requestPermission() {
    // En Android 13 o más pide POST_NOTIFICATIONS; en versiones anteriores siempre está concedido.
    permission = toPermission((await LocalNotifications.requestPermissions()).display);
    return permission === 'granted';
  },
  // Los avisos diarios se programan de antemano (ver nativeDaily.ts): se arman al activar y se renuevan al abrir la app o cambiar el inventario.
  registerDaily: async () => (await refreshNativeDaily().catch(logDailyError)) || true,
  unregisterDaily: () => cancelDaily(),
  refreshDaily: async () => void (await refreshNativeDaily().catch(logDailyError)),
  async subscribePush({ fcm }) {
    if (!fcm) return null; // el servidor no tiene Firebase configurado
    // iPhone: el plugin entrega el token de APNs, no el de Firebase, y el servidor solo sabe mandar por Firebase. Sin avisos push hasta decidir
    // cómo (ver docs/PENDIENTES.md, «iPhone»); los avisos locales y el aviso diario sí andan.
    if (platformName() === 'ios') return null;
    return new Promise((resolve) => {
      const handles: { remove(): Promise<void> }[] = [];
      const done = (value: unknown) => {
        clearTimeout(timer);
        for (const h of handles) void h.remove();
        resolve(value);
      };
      const timer = setTimeout(() => done(null), 20_000);
      void (async () => {
        try {
          handles.push(await PushNotifications.addListener('registration', (t) => done({ fcm: t.value, platform: platformName() })));
          handles.push(await PushNotifications.addListener('registrationError', () => done(null)));
          await PushNotifications.register();
        } catch {
          done(null);
        }
      })();
    });
  },
  async unsubscribePush() {
    await PushNotifications.unregister().catch(() => undefined);
  },
  async showLocal({ title, body, tag, url, data }: LocalNotification) {
    await LocalNotifications.schedule({
      notifications: [{ id: idForTag(tag ?? `${Date.now()}`), title, body, extra: { url, tag, ...data } }],
    });
  },
  async shownByTag(tag: string): Promise<ShownNotification | null> {
    const id = idForTag(tag);
    const shown = (await LocalNotifications.getDeliveredNotifications()).notifications.find((n) => n.id === id);
    if (!shown) return null;
    return {
      data: (shown as { extra?: unknown }).extra ?? {},
      close: () => void LocalNotifications.removeDeliveredNotifications({ notifications: [shown] }),
    };
  },
};

/** Pantalla que abre un aviso de FCM al tocarlo, según el tipo que viaja en el mensaje (lo demás va a la lista de avisos). */
export function routeForPush(data: { type?: string } | undefined): string {
  return data?.type === 'rain' ? '#/weather/forecast' : '#/inventory/alerts';
}

const open = (url: string) => {
  window.location.hash = url.replace(/^#/, '');
};

let started = false;

/** Se llama una vez al arrancar la app nativa: instala este backend y engancha lo que llega del sistema. */
export async function startNativeNotifications(): Promise<void> {
  if (started) return;
  started = true;
  setNotificationBackend(nativeBackend);
  await refreshNativePermission().catch(() => undefined);
  void refreshNativeDaily().catch(logDailyError);
  // Con la app abierta en pantalla Android NO muestra los avisos de FCM: se los entrega a la app y la app los muestra, en su idioma.
  void PushNotifications.addListener('pushNotificationReceived', (n) => {
    const type = (n.data as { type?: string } | undefined)?.type;
    const lang = useSettings.getState().settings.language;
    const { title, body } = type === 'test' ? testNotification(lang) : genericPushNotification(lang);
    void nativeBackend.showLocal({ title, body, tag: 'vikarg-alerts', url: routeForPush({ type }) });
  });
  // Tocar un aviso de FCM (la app estaba cerrada o en segundo plano): abre la pantalla que corresponde.
  void PushNotifications.addListener('pushNotificationActionPerformed', (a) => open(routeForPush(a.notification.data as { type?: string })));
  // Tocar un aviso local: abre su pantalla.
  void LocalNotifications.addListener('localNotificationActionPerformed', (a) => {
    const url = (a.notification.extra as { url?: string } | undefined)?.url;
    if (url) open(url);
  });
  // Firebase renueva el token de vez en cuando: el servidor tiene que enterarse.
  void PushNotifications.addListener('registration', (t) => void syncPushAlerts({ fcm: t.value, platform: platformName() }));
}
