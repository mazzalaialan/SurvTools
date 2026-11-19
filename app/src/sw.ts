/// <reference lib="webworker" />
import { PrecacheController, PrecacheRoute } from 'workbox-precaching';
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

// El precache se maneja a mano (en vez de `precacheAndRoute`) para poder DEJAR PARA DESPUÉS la descarga de una versión nueva: la primera
// instalación baja todo sola (sin eso no habría app sin conexión), pero una actualización pregunta antes de bajar (ver `onInstall`).
const precacheProgress = { active: false, total: 0, done: 0, files: 0, filesDone: 0, sizes: {} as Record<string, number> };
const scopePath = new URL(self.registration.scope).pathname;
/** Ruta relativa al scope, como figura en `update-info.json` y en el manifiesto de Workbox. */
const relative = (url: string) => new URL(url, self.registration.scope).pathname.slice(scopePath.length);

const precache = new PrecacheController({
  plugins: [
    {
      // Cuenta cada archivo que termina de bajar durante la actualización confirmada, para la barra de progreso.
      fetchDidSucceed: async ({ request, response }) => {
        if (precacheProgress.active) {
          precacheProgress.filesDone += 1;
          precacheProgress.done += precacheProgress.sizes[relative(request.url)] ?? 0;
          void broadcast({ type: 'UPDATE_PROGRESS', ...progressMessage() });
        }
        return response;
      },
    },
  ],
});
precache.addToCacheList(self.__WB_MANIFEST);
registerRoute(new PrecacheRoute(precache));

type ClientMessage = { type: 'UPDATE_PENDING' | 'UPDATE_PROGRESS'; bytes: number | null; done?: number; files: number; filesDone?: number };
const progressMessage = () => ({ bytes: precacheProgress.total || null, done: precacheProgress.done, files: precacheProgress.files, filesDone: precacheProgress.filesDone });

// Canal entre el service worker nuevo y las páginas abiertas (BroadcastChannel): un worker que todavía se está instalando no recibe de forma
// confiable los `postMessage` de la página, y así tampoco hace falta saber qué pestañas hay.
const updateChannel = new BroadcastChannel('vikarg-update');
async function broadcast(message: ClientMessage): Promise<void> {
  updateChannel.postMessage(message);
}
updateChannel.onmessage = (event: MessageEvent) => {
  const type = (event.data as { type?: string } | undefined)?.type;
  // La página responde a «hay una versión nueva» (si ninguna responde, baja solo), confirma la descarga o pregunta cómo está.
  if (type === 'UPDATE_ACK') for (const resolve of ackResolvers.splice(0)) resolve();
  if (type === 'UPDATE_START') for (const resolve of startResolvers.splice(0)) resolve();
  if (type === 'UPDATE_QUERY') {
    if (awaitingPlan) void broadcast({ type: 'UPDATE_PENDING', bytes: awaitingPlan.bytes, files: awaitingPlan.files });
    else if (precacheProgress.active) void broadcast({ type: 'UPDATE_PROGRESS', ...progressMessage() });
  }
};

/** Qué archivos de la versión nueva todavía no están guardados y cuánto pesan (null si no se pudo saber el peso). */
async function planUpdate(): Promise<{ files: number; bytes: number | null }> {
  const cache = await caches.open(precache.strategy.cacheName);
  const pending: string[] = [];
  for (const [url, key] of precache.getURLsToCacheKeys()) if (!(await cache.match(key))) pending.push(url);
  let sizes: Record<string, number> = {};
  try {
    const res = await fetch(new URL(`update-info.json?v=${Date.now()}`, self.registration.scope), { cache: 'no-store' });
    if (res.ok) sizes = ((await res.json()) as { files?: Record<string, number> }).files ?? {};
  } catch {
    /* sin el archivo de pesos se baja igual: solo no se puede decir cuánto */
  }
  precacheProgress.sizes = sizes;
  // Los pocos archivos sin peso (como el manifiesto) son chicos: el total es «hasta» la suma de los que sí lo tienen. Sin archivo de pesos, no se sabe.
  const known = Object.keys(sizes).length > 0;
  precacheProgress.files = pending.length;
  precacheProgress.total = known ? pending.reduce((n, u) => n + (sizes[relative(u)] ?? 0), 0) : 0;
  return { files: pending.length, bytes: known ? precacheProgress.total : null };
}

/** La actualización que está esperando la confirmación (para volver a avisar si la página se recarga mientras tanto). */
let awaitingPlan: { files: number; bytes: number | null } | null = null;
let ackResolvers: (() => void)[] = [];
let startResolvers: (() => void)[] = [];
const waitFor = (list: 'ack' | 'start', ms?: number) =>
  new Promise<boolean>((resolve) => {
    const done = () => resolve(true);
    (list === 'ack' ? ackResolvers : startResolvers).push(done);
    if (ms) setTimeout(() => resolve(false), ms);
  });

/**
 * Instalación de la versión nueva. Primera instalación: baja todo. Actualización: si hay algo para bajar, le avisa a la página y ESPERA a que
 * la persona confirme (la versión vieja sigue funcionando; mientras el worker espera en «installing» no se puede activar a medias). Si ninguna
 * página responde (una versión vieja de la app que no sabe preguntar), baja todo solo como siempre.
 */
async function onInstall(event: ExtendableEvent): Promise<unknown> {
  const isUpdate = !!self.registration.active;
  if (!isUpdate) return precache.install(event);
  let plan: { files: number; bytes: number | null };
  try {
    plan = await planUpdate();
  } catch {
    return precache.install(event);
  }
  if (plan.files === 0) return precache.install(event);
  // La espera de la respuesta se arma antes de avisar, para no perder una respuesta rápida.
  const answered = waitFor('ack', 4000);
  await broadcast({ type: 'UPDATE_PENDING', bytes: plan.bytes, files: plan.files });
  if (!(await answered)) return precache.install(event);
  awaitingPlan = plan;
  await waitFor('start');
  awaitingPlan = null;
  precacheProgress.active = true;
  await broadcast({ type: 'UPDATE_PROGRESS', ...progressMessage() });
  try {
    return await precache.install(event);
  } finally {
    precacheProgress.active = false;
  }
}
self.addEventListener('install', (event) => event.waitUntil(onInstall(event)));
// Al activarse se borra lo viejo del precache (solo entonces: antes la versión vieja lo necesita).
self.addEventListener('activate', (event) => event.waitUntil(precache.activate(event)));

registerRoute(new NavigationRoute(precache.createHandlerBoundToURL('index.html')));

// La app pide activar la versión nueva cuando el usuario toca "Actualizar".
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

// Al activarse toma las pestañas abiertas: en la primera visita la página no queda sin
// service worker hasta recargar (lo necesitan el lector de libros y los mapas sin conexión).
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// ---------- Notificaciones ----------

async function language(): Promise<'es' | 'en' | 'pt'> {
  const settings = (await db.settings.get('app'))?.value as Partial<Settings> | undefined;
  return settings?.language === 'en' || settings?.language === 'pt' ? settings.language : 'es';
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
