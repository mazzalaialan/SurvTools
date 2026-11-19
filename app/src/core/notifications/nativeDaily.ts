import { LocalNotifications } from '@capacitor/local-notifications';
import { db } from '@/core/db/db';
import { useSettings } from '@/core/settings/settings';
import { today } from '@/modules/inventory/domain/dates';
import { lastFired, planDailyNotices, PLAN_DAYS } from './dailyPlan';
import { readNotificationState, updateNotificationState } from './state';

/** Números reservados para los avisos diarios programados (los de `idForTag` llegan a 2.000.000.000). */
const BASE_ID = 2_100_000_000;
const ROUTE = '#/inventory/alerts';

/** Saca los avisos diarios programados que todavía no sonaron. */
export async function cancelDaily(): Promise<void> {
  await LocalNotifications.cancel({ notifications: Array.from({ length: PLAN_DAYS }, (_, i) => ({ id: BASE_ID + i })) }).catch(() => undefined);
}

/**
 * Vuelve a programar los avisos diarios (sin servidor) de los próximos días con el inventario actual. Con servidor configurado avisa el
 * servidor, así que no se programa nada (evita duplicados). Se llama al activar las notificaciones, al abrir la app y al cambiar las alertas.
 */
export async function refreshNativeDaily(): Promise<boolean> {
  const { notificationsEnabled, notifyHour, language } = useSettings.getState().settings;
  const state = await readNotificationState();
  const now = Date.now();
  // Lo que ya sonó del plan anterior cuenta como avisado.
  const last = lastFired(state.localPlan, now, state.lastLocalNotifiedDay);
  await cancelDaily();
  if (!notificationsEnabled || state.push) {
    await updateNotificationState({ localPlan: [], lastLocalNotifiedDay: last });
    return false;
  }
  const alerts = await db.alertIndex.toArray();
  const plan = planDailyNotices(alerts, today(), now, notifyHour, last, language);
  if (plan.length) {
    await LocalNotifications.schedule({
      notifications: plan.map((p, i) => ({
        id: BASE_ID + i,
        title: p.title,
        body: p.body,
        schedule: { at: new Date(p.at), allowWhileIdle: true },
        extra: { url: ROUTE, tag: 'vikarg-alerts' },
      })),
    });
  }
  await updateNotificationState({ localPlan: plan.map(({ day, at }) => ({ day, at })), lastLocalNotifiedDay: last });
  return true;
}
