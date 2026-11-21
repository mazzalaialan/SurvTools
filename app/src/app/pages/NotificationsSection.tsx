import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { OfficialWeatherNotice } from '@/ui/OfficialWeatherNotice';
import { Collapsible } from '@/ui/Collapsible';
import { Bell, BellOff, Send } from 'lucide-react';
import {
  ServerError,
  disableNotifications,
  enableNotifications,
  sendTestNotification,
  syncPushAlerts,
  type EnableResult,
} from '@/core/notifications/notifications';
import { readNotificationState, type NotificationState } from '@/core/notifications/state';
import { useSettings } from '@/core/settings/settings';
import { notificationBackend } from '@/core/notifications/backend';
import { PressureAlertsControl } from '@/modules/weather/PressureAlerts';

const HOURS = Array.from({ length: 24 }, (_, h) => h);

/** `showServer`: la dirección del servidor solo se muestra si se abrió «Conexiones» (7 toques a la versión): es configuración interna. */
export function NotificationsSection({ showServer = false }: { showServer?: boolean }) {
  const { t } = useTranslation();
  const { notificationsEnabled, notifyHour, serverUrl, serverLocation, updateNotices, hazardNotices } = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  const [state, setState] = useState<NotificationState | null>(null);
  const [result, setResult] = useState<EnableResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testSent, setTestSent] = useState<'server' | 'local' | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const supported = notificationBackend().supported();
  const denied = supported && notificationBackend().permission() === 'denied';

  useEffect(() => {
    void readNotificationState().then(setState);
  }, [notificationsEnabled, result]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setTestSent(null);
    try {
      await action();
    } catch (err) {
      if (!(err instanceof ServerError)) throw err;
      setError(t(`notifications.error.${err.code}`));
    } finally {
      setBusy(false);
    }
  }

  if (!supported) {
    return (
      <section className="card stack">
        <h2 className="section-title" style={{ marginTop: 0 }}>{t('notifications.title')}</h2>
        <p className="hint">{t('notifications.unsupported')}</p>
      </section>
    );
  }

  return (
    <Collapsible
      id="notifications"
      title={t('notifications.title')}
      summary={notificationsEnabled ? t('notifications.summaryOn', { hour: `${String(notifyHour).padStart(2, '0')}:00` }) : t('notifications.summaryOff')}
    >
      <p className="hint">{t('notifications.intro')}</p>

      {notificationsEnabled ? (
        <>
          <ul className="status-list">
            <li>{state?.push ? (showServer ? t('notifications.pushOn', { server: state.push.serverUrl }) : t('notifications.pushOnShort')) : serverUrl ? t('notifications.pushPending') : t('notifications.localOnly')}</li>
            {result && !result.localDaily && !result.push && <li>{t('notifications.inAppOnly')}</li>}
            {result?.pushError && <li className="error">{t(`notifications.error.${result.pushError.code}`)}</li>}
          </ul>
          <div className="field">
            <label htmlFor="notify-hour">{t('notifications.hour')}</label>
            <select
              id="notify-hour"
              className="select"
              value={notifyHour}
              onChange={(e) => void update({ notifyHour: Number(e.target.value) }).then(syncPushAlerts)}
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}:00
                </option>
              ))}
            </select>
            <p className="hint">{t('notifications.hourHint')}</p>
          </div>
          {state?.push && (
            <div className="stack" style={{ gap: 4 }}>
              <label className="check">
                <input type="checkbox" checked={serverLocation} onChange={(e) => void update({ serverLocation: e.target.checked })} />
                {t('notifications.serverLocation')}
              </label>
              <p className="hint" style={{ margin: 0 }} data-testid="server-location-hint">{t('notifications.serverLocationHint')}</p>
              <label className="check">
                <input type="checkbox" checked={hazardNotices} onChange={(e) => void update({ hazardNotices: e.target.checked }).then(syncPushAlerts)} />
                {t('notifications.hazards')}
              </label>
              <p className="hint" style={{ margin: 0 }}>{t('notifications.hazardsHint')}</p>
              <OfficialWeatherNotice />
              <label className="check">
                <input type="checkbox" checked={updateNotices} onChange={(e) => void update({ updateNotices: e.target.checked }).then(syncPushAlerts)} />
                {t('notifications.updates')}
              </label>
              <p className="hint" style={{ margin: 0 }}>{t('notifications.updatesHint')}</p>
            </div>
          )}
          {state?.push && (
            <p className="hint" style={{ margin: 0 }} data-testid="disable-deletes">
              {t('notifications.disableDeletes')}
            </p>
          )}
          <div className="row-end">
            <button className="btn btn-danger-outline" type="button" disabled={busy} onClick={() => void run(async () => { setDeletePending(await disableNotifications()); setResult(null); })}>
              <BellOff size={18} /> {t('notifications.disable')}
            </button>
            <button className="btn" type="button" disabled={busy} onClick={() => void run(async () => setTestSent(await sendTestNotification()))}>
              <Send size={18} /> {t('notifications.test')}
            </button>
          </div>
        </>
      ) : (
        <button className="btn btn-primary" type="button" disabled={busy || denied} onClick={() => void run(async () => setResult(await enableNotifications()))}>
          <Bell size={18} /> {t('notifications.enable')}
        </button>
      )}
      {/* Aviso local por la presión del barómetro (solo teléfonos que lo tienen): el mismo ajuste que en Clima. */}
      <PressureAlertsControl />
      {testSent && notificationsEnabled && (
        <p className="hint" role="status" data-testid="test-sent">
          {t(testSent === 'server' ? 'notifications.testSentServer' : 'notifications.testSentLocal')}
        </p>
      )}
      {deletePending && !notificationsEnabled && (
        <p className="hint" role="status" data-testid="delete-pending">
          {t('notifications.deletePending')}
        </p>
      )}
      {denied && <p className="error">{t('notifications.error.permission-denied')}</p>}
      {error && !denied && <p className="error" role="alert">{error}</p>}
    </Collapsible>
  );
}
