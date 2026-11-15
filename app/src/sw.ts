/// <reference lib="webworker" />
import { createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { db } from '@/core/db/db';
import {
  alertsNotification,
  gardenNotification,
  lightningNotification,
  rainNotification,
  testNotification,
  updateNotification,
  hazardNotification,
  officialNotification,
  type OfficialPush,
  riverNotification,
  volcanoNotification,
  type VolcanoPush,
  type AlertSummary,
  type GardenPush,
  type HazardPush,
  type LightningPush,
  type RainPush,
  type RiverPush,
  type UpdatePush,
} from '@/core/notifications/format';
import { selectNotifiable } from '@/core/notifications/notifiable';
import { readNotificationState, updateNotificationState } from '@/core/notifications/state';
import type { Settings } from '@/core/settings/settings';
import { today } from '@/modules/inventory/domain/dates';

declare const self: ServiceWorkerGlobalScope;

export const PERIODIC_SYNC_TAG = 'vikarg-alerts';
const ICON = 'brand/icon-192.png';
const ALERTS_URL = '#/inventory/alerts';

// ---------- Offline ----------

precacheAndRoute(self.__WB_MANIFEST);

// Libros bajados de la biblioteca: solo desde el dispositivo (se registran antes que la navegación,
// porque el visor abre cada capítulo como página).
const LIBRARY_CACHE = 'vikarg-library-books';
const LIBRARY_PREFIX = new URL('library/books/', self.registration.scope).pathname;
registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.startsWith(LIBRARY_PREFIX),
  async ({ url }) =>
    (await caches.match(url.origin + url.pathname, { cacheName: LIBRARY_CACHE })) ??
    new Response('Este libro no está en el dispositivo.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } }),
);

registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

// Elevación de los mapas offline: primero lo descargado por zona (curvas de nivel sin conexión).
const MAP_CACHE = 'vikarg-maps';
registerRoute(
  ({ url }) => url.hostname === 's3.amazonaws.com' && url.pathname.startsWith('/elevation-tiles-prod/'),
  async ({ request }) => (await caches.match(request.url, { cacheName: MAP_CACHE })) ?? fetch(request),
);

// La app pide activar la versión nueva cuando el usuario toca "Actualizar".
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

// Al activarse toma las pestañas abiertas: en la primera visita la página no queda sin
// service worker hasta recargar (lo necesitan el lector de libros y los mapas sin conexión).
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// ---------- Notificaciones ----------

async function language(): Promise<'es' | 'en'> {
  const settings = (await db.settings.get('app'))?.value as Partial<Settings> | undefined;
  return settings?.language === 'en' ? 'en' : 'es';
}

async function show(title: string, body: string, url = ALERTS_URL) {
  await self.registration.showNotification(title, { body, icon: ICON, badge: ICON, tag: 'vikarg-alerts', data: { url } });
}

/** Push del servidor propio: el contenido llega cifrado de punta a punta. */
self.addEventListener('push', (event) => {
  const payload = (event.data?.json() ?? {}) as { type?: string; alerts?: AlertSummary[]; rain?: RainPush; lightning?: LightningPush; update?: UpdatePush; hazard?: HazardPush; garden?: GardenPush; official?: OfficialPush; volcano?: VolcanoPush; river?: RiverPush; outing?: { outingId: string; title: string; body: string } };
  event.waitUntil(
    (async () => {
      const lang = await language();
      if (payload.type === 'rain' && payload.rain) {
        // Misma etiqueta que el aviso de la app abierta: si ya avisó, lo reemplaza sin volver a sonar.
        const { title, body } = rainNotification(payload.rain, lang);
        const tag = `rain-${payload.rain.placeId}`;
        const data = { url: '#/weather/forecast', state: payload.rain.state, startsAt: payload.rain.startsAt ?? null };
        if (payload.rain.clear) {
          // Dejó de llover: se saca el aviso. El navegador exige mostrar algo por cada push: se muestra y se cierra enseguida, sin sonar.
          await self.registration.showNotification(title, { icon: ICON, badge: ICON, tag, silent: true, data });
          for (const n of await self.registration.getNotifications({ tag })) n.close();
        } else {
          // «Va a llover» → «Está lloviendo»: misma etiqueta, lo reemplaza sin volver a sonar.
          await self.registration.showNotification(title, { body, icon: ICON, badge: ICON, tag, silent: payload.rain.update === true, data });
        }
      } else if (payload.type === 'lightning' && payload.lightning) {
        const { title, body } = lightningNotification(payload.lightning, lang);
        await self.registration.showNotification(title, {
          body,
          icon: ICON,
          badge: ICON,
          tag: `lightning-${payload.lightning.placeId}`,
          // Que vibre aunque haya otro aviso igual en la barra: es urgente.
          renotify: true,
          vibrate: [300, 150, 300, 150, 300],
          data: { url: '#/weather/forecast' },
        } as NotificationOptions);
      } else if (payload.type === 'hazard' && payload.hazard) {
        const { title, body } = hazardNotification(payload.hazard, lang);
        const urgent = payload.hazard.tsunami || payload.hazard.level === 'Red' || (payload.hazard.magnitude ?? 0) >= 6;
        await self.registration.showNotification(title, {
          body,
          icon: ICON,
          badge: ICON,
          tag: `hazard-${payload.hazard.placeId}-${payload.hazard.kind}`,
          renotify: true,
          ...(urgent ? { vibrate: [500, 200, 500, 200, 500], requireInteraction: true } : {}),
          data: { url: '#/weather/map' },
        } as NotificationOptions);
      } else if (payload.type === 'official' && payload.official) {
        const o = payload.official;
        const { title, body } = officialNotification(o, lang);
        const urgent = o.severity === 'Severe' || o.severity === 'Extreme';
        await self.registration.showNotification(title, {
          body,
          icon: ICON,
          badge: ICON,
          // Una por alerta: una renovación con otro identificador reemplaza la anterior del mismo fenómeno.
          tag: `official-${o.source}-${o.event}`,
          renotify: urgent,
          ...(urgent ? { vibrate: [500, 200, 500, 200, 500], requireInteraction: true } : {}),
          data: { url: '#/weather/map' },
        } as NotificationOptions);
      } else if (payload.type === 'volcano' && payload.volcano) {
        const v = payload.volcano;
        const { title, body } = volcanoNotification(v, lang);
        const urgent = v.level !== 'yellow';
        await self.registration.showNotification(title, {
          body,
          icon: ICON,
          badge: ICON,
          tag: `volcano-${v.name}`,
          renotify: true,
          ...(urgent ? { vibrate: [500, 200, 500, 200, 500], requireInteraction: true } : {}),
          data: { url: '#/weather/map' },
        } as NotificationOptions);
      } else if (payload.type === 'river' && payload.river) {
        const r = payload.river;
        const { title, body } = riverNotification(r, lang);
        // El aviso anticipado (pronóstico) no es tan urgente como el nivel ya alcanzado: sin vibración larga ni quedarse fija.
        const urgent = r.state !== 'low' && !r.forecast;
        await self.registration.showNotification(title, {
          body,
          icon: ICON,
          badge: ICON,
          tag: r.forecast ? `river-fc-${r.station}` : `river-${r.station}`,
          renotify: true,
          ...(urgent ? { vibrate: [500, 200, 500, 200, 500], requireInteraction: true } : {}),
          data: { url: '#/weather/navigation' },
        } as NotificationOptions);
      } else if (payload.type === 'garden' && payload.garden) {
        const g = payload.garden;
        const { title, body } = gardenNotification(g, lang);
        await self.registration.showNotification(title, {
          body,
          icon: ICON,
          badge: ICON,
          // Una sola notificación por lugar (helada o riego) y una para las tareas.
          tag: g.kind === 'tasks' ? 'garden-tasks' : `garden-${g.kind}-${g.placeId}`,
          ...(g.kind === 'frost' ? { renotify: true, vibrate: [300, 150, 300] } : {}),
          data: { url: '#/garden/beds' },
        } as NotificationOptions);
      } else if (payload.type === 'outing' && payload.outing) {
        // Pasó la hora límite de regreso de una salida: el texto ya viene escrito por la app en su idioma.
        const o = payload.outing;
        await self.registration.showNotification(o.title, {
          body: o.body,
          icon: ICON,
          badge: ICON,
          tag: 'outing-plan',
          renotify: true,
          requireInteraction: true,
          vibrate: [500, 200, 500, 200, 500],
          data: { url: `#/training/outings/${encodeURIComponent(o.outingId)}` },
        } as NotificationOptions);
      } else if (payload.type === 'update' && payload.update) {
        // Al abrir la app, el service worker baja la versión nueva (y la app ofrece actualizar).
        const { title, body } = updateNotification(payload.update, lang);
        await self.registration.showNotification(title, { body, icon: ICON, badge: ICON, tag: 'vikarg-update', data: { url: '' } });
      } else if (payload.type === 'alerts' && payload.alerts?.length) {
        const { title, body } = alertsNotification(payload.alerts, lang, today());
        await show(title, body);
      } else {
        const { title, body } = testNotification(lang);
        await show(title, body, '');
      }
    })(),
  );
});

/**
 * Aviso diario sin servidor (Periodic Background Sync, Chrome en Android).
 * Lee el índice de alertas en claro: no necesita desbloquear la bóveda.
 */
async function checkLocalAlerts() {
  const state = await readNotificationState();
  // Con servidor configurado avisa el servidor: evita notificaciones duplicadas.
  if (state.push) return;
  const day = today();
  if (state.lastLocalNotifiedDay === day) return;
  const pending = selectNotifiable(await db.alertIndex.toArray(), day, state.lastLocalNotifiedDay);
  if (pending.length > 0) {
    const { title, body } = alertsNotification(pending, await language(), day);
    await show(title, body);
  }
  await updateNotificationState({ lastLocalNotifiedDay: day });
}

interface PeriodicSyncEvent extends ExtendableEvent {
  tag: string;
}

self.addEventListener('periodicsync' as keyof ServiceWorkerGlobalScopeEventMap, (event) => {
  const e = event as unknown as PeriodicSyncEvent;
  if (e.tag === PERIODIC_SYNC_TAG) e.waitUntil(checkLocalAlerts());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data as { url?: string } | undefined)?.url ?? '', self.registration.scope).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = windows[0];
      if (existing) {
        await existing.navigate(target);
        return existing.focus();
      }
      return self.clients.openWindow(target);
    })(),
  );
});
