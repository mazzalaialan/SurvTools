import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '@/core/settings/settings';
import type { PickedPlace } from '@/modules/waypoints/PlacePicker';
import { usePlaceCountries } from '@/modules/emergency/usePlaceCountry';
import { fetchPyLevels, loadSavedPy, nearestPy, readingAgeDays, savePy, type PyLevels } from './paraguayRivers';

const TREND_CLASS = { rising: 'river-alert', falling: 'river-low', steady: 'river-ok' } as const;
/** Una lectura de más de 5 días se marca como vieja (hay estaciones sin datos nuevos desde hace meses). */
const OLD_DAYS = 5;

/** Niveles de los ríos de Paraguay (DMH) cerca del lugar elegido, en Paraguay o a menos de 50 km de su frontera. */
export function ParaguayRiversCard({ place }: { place: PickedPlace | null }) {
  const { t, i18n } = useTranslation();
  const server = useSettings((s) => s.settings.serverUrl)?.trim() || null;
  const { country, near } = usePlaceCountries(place);
  const relevant = country === 'PY' || near.includes('PY');
  const [levels, setLevels] = useState<PyLevels | null>(() => loadSavedPy());
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  useEffect(() => {
    if (!relevant || !server) return;
    if (!navigator.onLine) {
      setState('error');
      return;
    }
    let cancelled = false;
    setState('loading');
    fetchPyLevels(server).then(
      (l) => {
        if (cancelled) return;
        savePy(l);
        setLevels(l);
        setState('ok');
      },
      () => !cancelled && setState('error'),
    );
    return () => {
      cancelled = true;
    };
  }, [relevant, server]);

  const list = useMemo(() => (levels && place ? nearestPy(levels.stations, place.lat, place.lon) : []), [levels, place?.lat, place?.lon]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!relevant) return null;
  const m2 = new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cmFmt = new Intl.NumberFormat(i18n.language, { signDisplay: 'always', maximumFractionDigits: 0 });
  const km = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 0 });
  const day = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const on = (date: string) => day.format(new Date(`${date}T00:00:00Z`));
  return (
    <section className="card stack" aria-labelledby="pyr-title" data-testid="py-rivers-card">
      <h2 id="pyr-title" className="section-title" style={{ margin: 0 }}>
        {t('navigation.pyRivers.title')}
      </h2>
      <p className="hint" style={{ margin: 0 }}>
        {t('navigation.pyRivers.intro')}
      </p>
      {!server && !levels && (
        <p className="hint" data-testid="pyr-needs-server">
          {t('navigation.pyRivers.needsServer')}
        </p>
      )}
      {state === 'loading' && !levels && <p className="hint">{t('navigation.pyRivers.loading')}</p>}
      {state === 'error' && (
        <p className={levels ? 'hint' : 'error'} data-testid="pyr-offline">
          {levels ? t('navigation.pyRivers.offlineSaved', { when: new Date(levels.fetchedAt).toLocaleString(i18n.language) }) : t('navigation.pyRivers.error')}
        </p>
      )}
      {levels && list.length === 0 && (
        <p className="hint" data-testid="pyr-none">
          {t('navigation.pyRivers.none')}
        </p>
      )}
      <ul className="list" data-testid="pyr-list">
        {list.map(({ station: s, km: dist }) => {
          const old = readingAgeDays(s.date) > OLD_DAYS;
          return (
            <li key={s.code} className="list-row river-row" data-testid={`pyr-${s.code}`}>
              <span className="list-main">
                <span className="list-title">
                  {s.name} <span className="hint">· {s.river}</span>
                </span>
                <span className="list-sub">
                  {t('navigation.pyRivers.distance', { km: km.format(dist) })} · {old ? t('navigation.pyRivers.old', { date: on(s.date) }) : t('navigation.pyRivers.reading', { date: on(s.date) })}
                  {s.approx ? ` · ${t('navigation.pyRivers.approx')}` : ''}
                </span>
                {s.max && (
                  <span className="list-sub">
                    {t('navigation.pyRivers.history', { max: m2.format(s.max.level), maxDate: on(s.max.date), min: s.min ? m2.format(s.min.level) : '—' })}
                  </span>
                )}
              </span>
              <span className="list-end river-level">
                <strong>{m2.format(s.level)} m</strong>
                {s.trend && !old && <span className={`chip-state ${TREND_CLASS[s.trend]}`}>{t(`navigation.bolivia.trend.${s.trend}`)}</span>}
                {s.changeCm !== null && !old && (
                  <span className="hint">
                    {cmFmt.format(s.changeCm)} cm {t('navigation.pyRivers.perDay')}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="hint" style={{ margin: 0 }}>
        {t('navigation.pyRivers.reference')}
      </p>
      <p className="hint" style={{ margin: 0 }} data-testid="pyr-source">
        {t('navigation.pyRivers.source')}
      </p>
    </section>
  );
}
