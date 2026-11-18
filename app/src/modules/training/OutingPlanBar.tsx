import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { CircleCheck, TriangleAlert } from 'lucide-react';
import { activeOuting, formatLeft } from './outingPlan';
import { useTraining } from './store';
import { canShowLocal, notificationBackend } from '@/core/notifications/backend';

/** Cada cuánto se repite la notificación con la hora límite vencida. */
const RENOTIFY_MS = 15 * 60_000;

async function notify(title: string, body: string, id: string) {
  if (!canShowLocal()) return;
  try {
    await notificationBackend().showLocal({ title, body, tag: `outing-plan-${id}`, url: `#/training/outings/${id}` });
  } catch {
    // Sin notificaciones: queda la barra.
  }
}

/**
 * Aviso de arriba mientras una salida con hora límite está en curso: cuánto falta,
 * "estoy bien" a un toque y, pasada la hora, una alerta (también como notificación
 * si la app sigue abierta). Con la app cerrada no avisa: eso lo hará el servidor.
 */
export function OutingPlanBar() {
  const { t } = useTranslation();
  const outings = useTraining((s) => s.outings);
  const saveOuting = useTraining((s) => s.saveOuting);
  const [now, setNow] = useState(() => new Date());
  const notified = useRef(new Map<string, number>());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const active = activeOuting(outings.values(), now);
  const key = active ? `${active.outing.id}:${active.status.state}` : null;
  useEffect(() => {
    if (!active || (active.status.state !== 'dueSoon' && active.status.state !== 'overdue')) return;
    const last = notified.current.get(key!) ?? 0;
    if (Date.now() - last < (active.status.state === 'overdue' ? RENOTIFY_MS : Number.MAX_SAFE_INTEGER)) return;
    notified.current.set(key!, Date.now());
    const time = formatLeft(active.status.minutesLeft!);
    void notify(
      t(active.status.state === 'overdue' ? 'outingPlan.notify.overdueTitle' : 'outingPlan.notify.soonTitle', { name: active.outing.name }),
      t(active.status.state === 'overdue' ? 'outingPlan.notify.overdueBody' : 'outingPlan.notify.soonBody', { time }),
      active.outing.id,
    );
  });

  if (!active) return null;
  const { outing, status } = active;
  const overdue = status.state === 'overdue';
  const plan = outing.plan!;
  return (
    <section className={`plan-bar${overdue ? ' plan-overdue' : ''}`} role={overdue ? 'alert' : 'status'} aria-label={t('outingPlan.bar')} data-testid="plan-bar">
      {overdue && <TriangleAlert size={20} aria-hidden />}
      <span className="plan-info">
        <strong>{outing.name}</strong>
        <span>{overdue ? t('outingPlan.status.overdue', { time: formatLeft(status.minutesLeft!) }) : t('outingPlan.status.left', { time: formatLeft(status.minutesLeft!) })}</span>
      </span>
      <button className="btn" type="button" onClick={() => void saveOuting({ ...outing, plan: { ...plan, checkIns: [...plan.checkIns, { at: new Date().toISOString(), note: '' }] } })} data-testid="plan-bar-checkin">
        <CircleCheck size={18} aria-hidden /> {t('outingPlan.checkIn')}
      </button>
      <Link className="btn" to={`/training/outings/${outing.id}`}>
        {t('outingPlan.open')}
      </Link>
    </section>
  );
}
