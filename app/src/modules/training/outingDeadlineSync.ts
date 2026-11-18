import { useEffect } from 'react';
import { i18n } from '@/core/i18n/i18n';
import { readNotificationState, updateNotificationState } from '@/core/notifications/state';
import { useSettings } from '@/core/settings/settings';
import { activeOuting } from './outingPlan';
import { useTraining } from './store';

/**
 * Le avisa al servidor propio (si hay uno registrado en Notificaciones) la hora
 * límite de regreso de la salida en curso, para que el servidor avise al
 * dispositivo si pasa la hora con la app cerrada. Solo viajan la hora, el
 * nombre de la salida (para el título del aviso) y el texto ya escrito; nunca
 * integrantes, contactos ni el plan B. Al cerrar la salida se borra.
 */

/** Qué mandamos la última vez, para no repetir el pedido si no cambió nada. */
let lastSent: string | null = null;

export async function syncOutingDeadline(outings: ReturnType<typeof useTraining.getState>['outings']): Promise<void> {
  const { push } = await readNotificationState();
  if (!push || !navigator.onLine) return;
  const active = activeOuting(outings.values(), new Date());
  const plan = active?.outing.plan;
  const base = `${push.serverUrl}/api/devices/${push.deviceId}/deadline`;
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${push.token}` };
  let res: Response | null;
  if (active && plan?.returnBy) {
    const body = {
      outingId: active.outing.id,
      returnBy: plan.returnBy,
      title: String(i18n.t('outingPlan.notify.overdueTitle', { name: active.outing.name })).slice(0, 120),
      body: String(i18n.t('outingPlan.notify.overdueServerBody')).slice(0, 300),
    };
    const key = `${push.deviceId}|${body.outingId}|${body.returnBy}|${body.title}`;
    if (key === lastSent) return;
    res = await fetch(base, { method: 'PUT', headers, body: JSON.stringify(body) }).catch(() => null);
    if (res?.ok) lastSent = key;
  } else {
    // Sin salida en curso: se borra lo que pueda haber quedado en el servidor (una sola vez por arranque).
    if (lastSent === 'none') return;
    // Sin cuerpo no se manda `content-type: application/json`: el servidor rechaza con 400 un JSON vacío.
    res = await fetch(base, { method: 'DELETE', headers: { authorization: headers.authorization } }).catch(() => null);
    if (res?.ok) lastSent = 'none';
  }
  // 401: el servidor ya no conoce este dispositivo: hay que volver a activar las notificaciones.
  if (res?.status === 401) await updateNotificationState({ push: null });
}

/** Se monta una vez en la app desbloqueada. */
export function useOutingDeadlineSync(): void {
  const outings = useTraining((s) => s.outings);
  const notificationsEnabled = useSettings((s) => s.settings.notificationsEnabled);
  const language = useSettings((s) => s.settings.language);
  useEffect(() => {
    const timer = setTimeout(() => void syncOutingDeadline(outings), 2000);
    return () => clearTimeout(timer);
  }, [outings, notificationsEnabled, language]);
}
