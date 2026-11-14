import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '@/core/settings/settings';
import type { PickedPlace } from '@/modules/waypoints/PlacePicker';
import { usePlaceCountries } from '@/modules/emergency/usePlaceCountry';
import { fetchUyLevels, loadSavedUy, nearestUy, saveUy, type UyLevels } from './uruguayRivers';

const TREND_CLASS = { rising: 'river-alert', falling: 'river-low', steady: 'river-ok' } as const;

/** Niveles de ríos de Uruguay (CARU y DINAGUA) cerca del lugar elegido, en Uruguay o a menos de 50 km de su frontera. */
export function UruguayRiversCard({ place }: { place: PickedPlace | null }) {
  const { t, i18n } = useTranslation();
  const server = useSettings((s) => s.settings.serverUrl)?.trim() || null;
  const { country, near } = usePlaceCountries(place);
  const relevant = country === 'UY' || near.includes('UY');
  const [levels, setLevels] = useState<UyLevels | null>(() => loadSavedUy());
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  useEffect(() => {
    if (!relevant || !server) return;
    if (!navigator.onLine) {
      setState('error');
      return;
    }
    let cancelled = false;
    setState('loading');
    fetchUyLevels(server).then(
      (l) => {
        if (cancelled) return;
        saveUy(l);
        setLevels(l);
        setState('ok');
      },
      () => !cancelled && setState('error'),
    );
    return () => {
      cancelled = true;
    };
  }, [relevant, server]);

  const list = useMemo(() => (levels && place ? nearestUy(levels.stations, place.lat, place.lon) : []), [levels, place?.lat, place?.lon]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!relevant) return null;
  const m2 = new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sf = new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'always' });
  const km = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 0 });
  const ago = (iso: string) => {
    const h = (Date.now() - Date.parse(iso)) / 3_600_000;
    if (h < 1) return t('navigation.rivers.agoMinutes', { n: Math.max(1, Math.round(h * 60)) });
    if (h < 48) return t('navigation.rivers.agoHours', { n: Math.round(h) });
    return t('navigation.rivers.agoDays', { n: Math.round(h / 24) });
  };
  return (
    <section className="card stack" aria-labelledby="uyr-title" data-testid="uy-rivers-card">
      <h2 id="uyr-title" className="section-title" style={{ margin: 0 }}>
        {t('navigation.uyRivers.title')}
      </h2>
      <p className="hint" style={{ margin: 0 }}>
        {t('navigation.uyRivers.intro')}
      </p>
      {!server && !levels && (
        <p className="hint" data-testid="uyr-needs-server">
          {t('navigation.uyRivers.needsServer')}
        </p>
      )}
      {state === 'loading' && !levels && <p className="hint">{t('navigation.uyRivers.loading')}</p>}
      {state === 'error' && (
        <p className={levels ? 'hint' : 'error'} data-testid="uyr-offline">
          {levels ? t('navigation.uyRivers.offlineSaved', { when: new Date(levels.fetchedAt).toLocaleString(i18n.language) }) : t('navigation.uyRivers.error')}
        </p>
      )}
      {levels && list.length === 0 && (
        <p className="hint" data-testid="uyr-none">
          {t('navigation.uyRivers.none')}
        </p>
      )}
      <ul className="list" data-testid="uyr-list">
        {list.map(({ station: s, km: dist }) => (
          <li key={s.id} className="list-row river-row" data-testid={`uyr-${s.id}`}>
            <span className="list-main">
              <span className="list-title">
                {s.name} <span className="hint">· {s.source}</span>
              </span>
              <span className="list-sub">
                {t('navigation.uyRivers.distance', { km: km.format(dist) })} · {t('navigation.rivers.measured', { ago: ago(s.at) })} · {s.provider}
              </span>
            </span>
            <span className="list-end river-level">
              <strong>{m2.format(s.level)} m</strong>
              {s.trend && <span className={`chip-state ${TREND_CLASS[s.trend]}`}>{t(`navigation.bolivia.trend.${s.trend === 'steady' ? 'steady' : s.trend === 'rising' ? 'rising' : 'falling'}`)}</span>}
              {s.change !== null && (
                <span className="hint">
                  {sf.format(s.change)} m {t('navigation.uyRivers.sinceBefore')}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <p className="hint" style={{ margin: 0 }}>
        {t('navigation.uyRivers.reference')}
      </p>
      <p className="hint" style={{ margin: 0 }} data-testid="uyr-source">
        {t('navigation.uyRivers.source')}
      </p>
    </section>
  );
}
