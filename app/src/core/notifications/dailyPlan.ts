import { addDays } from '@/modules/inventory/domain/dates';
import { alertsNotification, type AlertSummary } from './format';
import { selectNotifiable, type NotifiableAlert } from './notifiable';

/** Cuántos días por delante se dejan programados: la app los renueva cada vez que se abre o cambia el inventario. */
export const PLAN_DAYS = 14;

export interface PlannedNotice {
  day: string;
  /** Momento en que suena (ms desde 1970). */
  at: number;
  title: string;
  body: string;
}

/**
 * Aviso diario sin servidor de la app nativa: como Android no deja correr código de la app a una hora fija sin permisos especiales, se
 * deja programado de antemano lo que va a avisar cada uno de los próximos días, con la misma regla que el service worker y el servidor
 * (`selectNotifiable`: solo lo nuevo desde el último aviso o lo que vence ese día). `last` avanza día a día como si cada aviso ya se
 * hubiera dado. Hoy solo se programa si la hora elegida todavía no pasó.
 */
export function planDailyNotices(
  alerts: (NotifiableAlert & AlertSummary)[],
  today: string,
  now: number,
  hour: number,
  last: string | null,
  lang: 'es' | 'en',
): PlannedNotice[] {
  const plan: PlannedNotice[] = [];
  for (let i = 0; i < PLAN_DAYS; i++) {
    const day = addDays(today, i);
    const [y, m, d] = day.split('-').map(Number);
    const at = new Date(y!, m! - 1, d!, hour, 0, 0).getTime();
    if (at <= now) continue;
    const pending = selectNotifiable(alerts, day, last);
    if (!pending.length) continue;
    const { title, body } = alertsNotification(pending, lang, day);
    plan.push({ day, at, title, body });
    last = day;
  }
  return plan;
}

/** El último día en que ya sonó un aviso de un plan anterior (para no repetir lo ya avisado al volver a programar). */
export function lastFired(plan: { day: string; at: number }[], now: number, last: string | null): string | null {
  for (const p of plan) if (p.at <= now && (last === null || p.day > last)) last = p.day;
  return last;
}
