import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Radio, Share2, Trash2 } from 'lucide-react';
import { useSettings } from '@/core/settings/settings';
import { CopyButton } from '@/modules/emergency/parts';
import { useRecorder } from '@/modules/tracks/recorder';
import { createLive, endLive, LIVE_DURATIONS_MIN, LiveError } from './liveShare';

const label = (min: number) => (min < 60 ? `${min} min` : `${min / 60} h`);

/**
 * Compartir la ubicación en vivo con la familia: un enlace que vence (15 min a
 * 24 h) y se corta al terminar la sesión. Apagado por defecto y opcional.
 */
export function LiveShareCard() {
  const { t, i18n } = useTranslation();
  const serverUrl = useSettings((s) => s.settings.serverUrl);
  const live = useSettings((s) => s.settings.liveShare);
  const update = useSettings((s) => s.update);
  const track = useRecorder((s) => s.track);
  const [minutes, setMinutes] = useState<number>(240);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (!track) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createLive(serverUrl, { name: track.name, lang: i18n.language.startsWith('en') ? 'en' : 'es', kind: track.activity ?? '', durationMin: minutes });
      await update({ liveShare: { id: created.id, url: created.url, token: created.token, expiresAt: created.expiresAt, name: track.name, sentSeg: 0, sentPt: 0, lastSentAt: null, failing: false } });
    } catch (err) {
      setError(t(`liveShare.error.${err instanceof LiveError ? err.code : 'failed'}`));
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    if (!live) return;
    setBusy(true);
    await endLive(serverUrl, live.id, live.token);
    await update({ liveShare: null });
    setBusy(false);
  }

  const time = (ms: number) => new Date(ms).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });

  return (
    <section className="card stack" aria-labelledby="live-share" data-testid="live-share">
      <h2 id="live-share" className="section-title" style={{ margin: 0 }}>
        <Radio size={18} aria-hidden /> {t('liveShare.title')}
      </h2>
      {live ? (
        <>
          <p className="hint" style={{ margin: 0 }}>{t('liveShare.active')}</p>
          <div className="input-group">
            <input className="input" readOnly value={live.url} aria-label={t('liveShare.link')} data-testid="live-share-url" onFocus={(e) => e.currentTarget.select()} />
            <CopyButton text={live.url} label={t('liveShare.copy')} />
            {'share' in navigator && (
              <button className="btn" type="button" onClick={() => void navigator.share({ title: live.name, url: live.url }).catch(() => undefined)} aria-label={t('liveShare.send')} title={t('liveShare.send')}>
                <Share2 size={20} />
              </button>
            )}
          </div>
          <p className="hint" style={{ margin: 0 }} data-testid="live-share-status">
            {t('liveShare.expires', { time: time(Date.parse(live.expiresAt)) })}
            {' · '}
            {live.failing ? t('liveShare.failing') : live.lastSentAt ? t('liveShare.lastSent', { time: time(live.lastSentAt) }) : t('liveShare.notSent')}
          </p>
          <div className="row-end">
            <button className="btn btn-danger-outline" type="button" disabled={busy} onClick={() => void stop()} data-testid="live-share-stop">
              <Trash2 size={18} /> {t('liveShare.stop')}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="hint" style={{ margin: 0 }}>{t(track?.vehicle ? 'liveShare.introDrive' : 'liveShare.intro')}</p>
          <p className="hint" style={{ margin: 0 }}>{t('liveShare.privacy')}</p>
          <div className="field">
            <label htmlFor="live-minutes">{t('liveShare.duration')}</label>
            <select id="live-minutes" className="select" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
              {LIVE_DURATIONS_MIN.map((m) => (
                <option key={m} value={m}>
                  {label(m)}
                </option>
              ))}
            </select>
          </div>
          {!serverUrl ? (
            <p className="hint" style={{ margin: 0 }}>
              {t('outings.share.noServer')} <Link to="/settings">{t('settings.title')}</Link>
            </p>
          ) : (
            <div className="row-end">
              <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void start()} data-testid="live-share-start">
                {t('liveShare.start')}
              </button>
            </div>
          )}
          {error && <p className="error" role="alert">{error}</p>}
          <p className="hint" style={{ margin: 0 }}>{t('liveShare.webLimit')}</p>
        </>
      )}
    </section>
  );
}
