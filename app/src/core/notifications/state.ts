import { db } from '@/core/db/db';

/**
 * Estado de notificaciones en `meta`, en claro: lo leen el service worker
 * (sin acceso a la clave de datos) y la app.
 */
export interface PushRegistration {
  serverUrl: string;
  deviceId: string;
  /** Credencial del dispositivo ante el servidor; solo habilita a actualizar sus propias alertas. */
  token: string;
}

export interface NotificationState {
  /** Último día en que el aviso local (sin servidor) notificó o revisó. */
  lastLocalNotifiedDay: string | null;
  push: PushRegistration | null;
  /** App nativa: los avisos diarios sin servidor ya programados (día y momento), para saber cuáles ya sonaron. */
  localPlan: { day: string; at: number }[];
  /**
   * Cuentas que hay que borrar del servidor y todavía no lo confirmó (se
   * desactivaron las notificaciones o se cambió de servidor sin conexión).
   * Se reintenta al volver la conexión y al abrir la app.
   */
  pendingDeletes: PushRegistration[];
}

const KEY = 'notifications';
const EMPTY: NotificationState = { lastLocalNotifiedDay: null, push: null, localPlan: [], pendingDeletes: [] };

export async function readNotificationState(): Promise<NotificationState> {
  return { ...EMPTY, ...((await db.meta.get(KEY))?.value as Partial<NotificationState> | undefined) };
}

export async function updateNotificationState(changes: Partial<NotificationState>): Promise<NotificationState> {
  const next = { ...(await readNotificationState()), ...changes };
  await db.meta.put({ key: KEY, value: next });
  return next;
}
