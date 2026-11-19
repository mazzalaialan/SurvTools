import { currentPlatform } from '@/core/platform';
import { db } from '@/core/db/db';
import { useSettings } from '@/core/settings/settings';
import { testNotification } from './format';
import { notificationBackend } from './backend';
import { readNotificationState, updateNotificationState, type PushRegistration } from './state';

/**
 * Notificaciones (ARQUITECTURA §6.3), en tres niveles que se suman:
 * 1. Panel de alertas al abrir la app (siempre, ver Inicio).
 * 2. Aviso diario sin servidor: Periodic Background Sync del service worker.
 * 3. Push desde el servidor propio, si hay uno configurado.
 */

export class ServerError extends Error {
  constructor(public readonly code: 'unreachable' | 'invalid-response' | 'push-unsupported' | 'push-ios' | 'permission-denied' | 'insecure') {
    super(code);
    this.name = 'ServerError';
  }
}

export function normalizeServerUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/**
 * La dirección del servidor tiene que ser https://: con http el código del
 * dispositivo viaja en claro y cualquiera en la red puede leerlo. Se acepta
 * http solo para pruebas en tu propia máquina o red local (localhost, 127.x,
 * ::1 y las redes privadas 10.x, 172.16–31.x y 192.168.x).
 */
export function isAcceptableServerUrl(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return false;
  }
  if (u.protocol === 'https:') return true;
  if (u.protocol !== 'http:') return false;
  const h = u.hostname.replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h === '::1' || h.endsWith('.localhost')) return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export interface ServerInfo {
  version: string;
  vapidPublicKey: string;
  /** El servidor tiene Firebase (FCM) configurado: puede mandar avisos a la app nativa. */
  fcm: boolean;
}

export async function checkServer(serverUrl: string): Promise<ServerInfo> {
  if (!isAcceptableServerUrl(serverUrl)) throw new ServerError('insecure');
  let res: Response;
  try {
    res = await fetch(`${normalizeServerUrl(serverUrl)}/api/health`, { signal: AbortSignal.timeout(8000) });
  } catch {
    throw new ServerError('unreachable');
  }
  const body = (await res.json().catch(() => null)) as ({ ok?: boolean } & Partial<ServerInfo>) | null;
  if (!res.ok || !body?.ok || !body.vapidPublicKey) throw new ServerError('invalid-response');
  return { version: body.version ?? '?', vapidPublicKey: body.vapidPublicKey, fcm: body.fcm === true };
}

function prefs() {
  const { language, notifyHour, updateNotices, hazardNotices } = useSettings.getState().settings;
  return { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, notifyHour, language, updates: updateNotices, hazards: hazardNotices };
}

async function registerPush(serverUrl: string): Promise<PushRegistration> {
  const info = await checkServer(serverUrl);
  // En la web es la suscripción de Web Push; en la app nativa, lo que necesite el servidor para ese dispositivo (ver backend.ts).
  const subscription = await notificationBackend().subscribePush(info);
  // iPhone nativo: los avisos del servidor todavía no existen (ver nativeBackend.ts); no es «un navegador sin soporte».
  if (!subscription) throw new ServerError(currentPlatform() === 'ios' ? 'push-ios' : 'push-unsupported');
  const res = await fetch(`${normalizeServerUrl(serverUrl)}/api/devices`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subscription, ...prefs() }),
  });
  if (!res.ok) throw new ServerError('invalid-response');
  const { deviceId, token } = (await res.json()) as { deviceId: string; token: string };
  return { serverUrl: normalizeServerUrl(serverUrl), deviceId, token };
}

/**
 * Pide al servidor que borre la cuenta del dispositivo y todos sus datos.
 * `true` si quedó borrada (o el servidor ya no la conocía); `false` si no se
 * pudo confirmar (sin conexión, servidor caído).
 */
async function deleteRegistration(push: PushRegistration): Promise<boolean> {
  const res = await fetch(`${push.serverUrl}/api/devices/${push.deviceId}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${push.token}` },
  }).catch(() => null);
  return !!res && (res.ok || res.status === 401);
}

/**
 * Apagar las notificaciones (o cambiar de servidor) elimina la cuenta del
 * servidor. Si no se puede confirmar, queda pendiente y se reintenta: si no,
 * la app se olvidaría de la cuenta y sus datos quedarían en el servidor.
 */
async function unregisterPush(push: PushRegistration): Promise<void> {
  if (!(await deleteRegistration(push))) {
    const { pendingDeletes } = await readNotificationState();
    if (!pendingDeletes.some((p) => p.deviceId === push.deviceId)) await updateNotificationState({ pendingDeletes: [...pendingDeletes, push] });
  }
  await notificationBackend().unsubscribePush();
}

let retrying: Promise<number> | null = null;

/** Reintenta los borrados pendientes; devuelve cuántos siguen sin confirmar. */
export function retryPendingDeletes(): Promise<number> {
  retrying ??= (async () => {
    const { pendingDeletes } = await readNotificationState();
    if (!pendingDeletes.length) return 0;
    const left: PushRegistration[] = [];
    for (const p of pendingDeletes) if (!(await deleteRegistration(p))) left.push(p);
    // Se relee por si mientras tanto se agregó otro.
    const now = (await readNotificationState()).pendingDeletes;
    const done = new Set(pendingDeletes.filter((p) => !left.includes(p)).map((p) => p.deviceId));
    const next = now.filter((p) => !done.has(p.deviceId));
    await updateNotificationState({ pendingDeletes: next });
    return next.length;
  })().finally(() => (retrying = null));
  return retrying;
}

export interface EnableResult {
  localDaily: boolean;
  push: boolean;
  /** El servidor estaba configurado pero falló el registro. */
  pushError: ServerError | null;
}

/** Pide permiso y activa los niveles disponibles en este dispositivo. */
export async function enableNotifications(): Promise<EnableResult> {
  const backend = notificationBackend();
  if (!backend.supported()) throw new ServerError('push-unsupported');
  if (!(await backend.requestPermission())) throw new ServerError('permission-denied');
  const localDaily = await backend.registerDaily();

  let push = false;
  let pushError: ServerError | null = null;
  const { serverUrl } = useSettings.getState().settings;
  const state = await readNotificationState();
  if (serverUrl) {
    try {
      if (state.push && state.push.serverUrl !== normalizeServerUrl(serverUrl)) await unregisterPush(state.push);
      const registration = state.push?.serverUrl === normalizeServerUrl(serverUrl) ? state.push : await registerPush(serverUrl);
      await updateNotificationState({ push: registration });
      push = true;
      await syncPushAlerts();
    } catch (err) {
      pushError = err instanceof ServerError ? err : new ServerError('unreachable');
    }
  } else if (state.push) {
    await unregisterPush(state.push);
    await updateNotificationState({ push: null });
  }

  await useSettings.getState().update({ notificationsEnabled: true });
  return { localDaily, push, pushError };
}

/** Devuelve `true` si el borrado de la cuenta en el servidor quedó pendiente (sin conexión). */
export async function disableNotifications(): Promise<boolean> {
  await notificationBackend().unregisterDaily();
  const state = await readNotificationState();
  if (state.push) await unregisterPush(state.push);
  await updateNotificationState({ push: null });
  await useSettings.getState().update({ notificationsEnabled: false });
  return (await readNotificationState()).pendingDeletes.length > 0;
}

/**
 * Eliminar mi cuenta: el servidor borra este dispositivo y todo lo suyo
 * (suscripción, preferencias, vencimientos, lugares de los avisos y avisos ya
 * enviados). A diferencia de apagar las notificaciones, acá el borrado tiene
 * que confirmarse: si el servidor no responde, no se olvida la cuenta, para
 * poder reintentar. Devuelve `false` si este dispositivo no tenía cuenta.
 */
export async function deleteServerAccount(): Promise<boolean> {
  const { push } = await readNotificationState();
  if (!push) {
    // Sin cuenta activa, pero quizás con un borrado pendiente de cuando se apagaron las notificaciones.
    if (!(await readNotificationState()).pendingDeletes.length) return false;
    if (await retryPendingDeletes()) throw new ServerError('unreachable');
    return true;
  }
  const res = await fetch(`${push.serverUrl}/api/devices/${push.deviceId}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${push.token}` },
  }).catch(() => null);
  if (!res) throw new ServerError('unreachable');
  // 401: el servidor ya no conoce este dispositivo (se borró antes o se le cayó la suscripción).
  if (!res.ok && res.status !== 401) throw new ServerError('invalid-response');
  await notificationBackend().unsubscribePush();
  await notificationBackend().unregisterDaily();
  await updateNotificationState({ push: null });
  await useSettings.getState().update({ notificationsEnabled: false });
  return true;
}

/**
 * Manda al servidor el índice de alertas actual (solo nombre, tipo y fechas). Con `subscription`, también la suscripción nueva del
 * dispositivo: el token de FCM de la app nativa cambia de vez en cuando (Firebase lo renueva) y hay que avisarle al servidor.
 */
export async function syncPushAlerts(subscription?: unknown): Promise<void> {
  void notificationBackend().refreshDaily?.();
  const { push } = await readNotificationState();
  if (!push || !navigator.onLine) return;
  const alerts = (await db.alertIndex.toArray()).map(({ lotId, itemName, kind, dueDate, notifyFrom }) => ({
    lotId,
    itemName: itemName.slice(0, 200),
    kind,
    dueDate,
    notifyFrom,
  }));
  const res = await fetch(`${push.serverUrl}/api/devices/${push.deviceId}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${push.token}` },
    body: JSON.stringify({ ...prefs(), alerts, ...(subscription ? { subscription } : {}) }),
  }).catch(() => null);
  // 401: el servidor ya no conoce este dispositivo (p. ej. se reinstaló): hay que volver a activar.
  if (res?.status === 401) await updateNotificationState({ push: null });
}

let syncTimer: ReturnType<typeof setTimeout> | undefined;

/** Se llama cada vez que cambia el índice de alertas; agrupa cambios seguidos en un solo envío. */
export function scheduleAlertSync(): void {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => void syncPushAlerts(), 3000);
}

/** Por dónde salió la prueba: desde el servidor (push) o mostrada por la propia app. */
export async function sendTestNotification(): Promise<'server' | 'local'> {
  const { push } = await readNotificationState();
  if (push) {
    const res = await fetch(`${push.serverUrl}/api/devices/${push.deviceId}/test`, {
      method: 'POST',
      headers: { authorization: `Bearer ${push.token}` },
    }).catch(() => null);
    if (res?.ok) return 'server';
  }
  const { title, body } = testNotification(useSettings.getState().settings.language);
  await notificationBackend().showLocal({ title, body });
  return 'local';
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    void syncPushAlerts();
    void retryPendingDeletes();
  });
  // Al abrir la app, por si quedó algún borrado de cuenta sin confirmar.
  setTimeout(() => void retryPendingDeletes(), 5_000);
}
