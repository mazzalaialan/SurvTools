import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '@/core/settings/settings';
import type { PickedPlace } from '@/modules/waypoints/PlacePicker';
import { usePlaceCountries } from '@/modules/emergency/usePlaceCountry';
import { BrLoadingError, brState, fetchBrLevels, loadSavedBr, nearestBr, OLD_READING_HOURS, readingAgeHours, saveBr, type BrLevels, type BrState } from './brazilRivers';

const TREND_CLASS = { rising: 'river-alert', falling: 'river-low', steady: 'river-ok' } as const;
const STATE_CLASS: Record<BrState, string> = { flood: 'river-evac', alert: 'river-alert', attention: 'river-alert', normal: 'river-ok' };
/** Si el servidor todavía está en su primera ronda, se vuelve a preguntar cada tanto. */
const RETRY_MS = 30_000;

/** Niveles de los ríos de Brasil (telemetría de la ANA) cerca del lugar elegido, en Brasil o a menos de 50 km de su frontera. */
export function BrazilRiversCard({ place }: { place: PickedPlace | null }) {
  const { t, i18n } = useTranslation();
  const server = useSettings((s) => s.settings.serverUrl)?.trim() || null;
  const { country, near } = usePlaceCountries(place);
  const relevant = country === 'BR' || near.includes('BR');
  const [levels, setLevels] = useState<BrLevels | null>(() => loadSavedBr());
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'warming' | 'error'>('idle');
  useEffect(() => {
    if (!relevant || !server) return;
    if (!navigator.onLine) {
      setState('error');
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () => {
      setState('loading');
      fetchBrLevels(server).then(
        (l) => {
          if (cancelled) return;
          saveBr(l);
          setLevels(l);
          setState('ok');
        },
        (err: unknown) => {
          if (cancelled) return;
          if (err instanceof BrLoadingError) {
            setState('warming');
            timer = setTimeout(load, RETRY_MS);
          } else setState('error');
        },
      );
    };
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [relevant, server]);

  const list = useMemo(() => (levels && place ? nearestBr(levels.stations, place.lat, place.lon) : []), [levels, place?.lat, place?.lon]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!relevant) return null;
  const m2 = new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cmFmt = new Intl.NumberFormat(i18n.language, { signDisplay: 'always', maximumFractionDigits: 0 });
  const km = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 0 });
  const q = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 0 });
  const when = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
  const at = (iso: string) => when.format(new Date(iso));
  const meters = (cm: number | null) => (cm === null ? '—' : m2.format(cm / 100));
  return (
    <section className="card stack" aria-labelledby="brr-title" data-testid="br-rivers-card">
      <h2 id="brr-title" className="section-title" style={{ margin: 0 }}>
        {t('navigation.brRivers.title')}
      </h2>
      <p className="hint" style={{ margin: 0 }}>
        {t('navigation.brRivers.intro')}
      </p>
      {!server && !levels && (
        <p className="hint" data-testid="brr-needs-server">
          {t('navigation.brRivers.needsServer')}
        </p>
      )}
      {state === 'loading' && !levels && <p className="hint">{t('navigation.brRivers.loading')}</p>}
      {state === 'warming' && !levels && (
        <p className="hint" data-testid="brr-warming">
          {t('navigation.brRivers.warming')}
        </p>
      )}
      {state === 'error' && (
        <p className={levels ? 'hint' : 'error'} data-testid="brr-offline">
          {levels ? t('navigation.brRivers.offlineSaved', { when: new Date(levels.fetchedAt).toLocaleString(i18n.language) }) : t('navigation.brRivers.error')}
        </p>
      )}
      {levels && list.length === 0 && (
        <p className="hint" data-testid="brr-none">
          {t('navigation.brRivers.none')}
        </p>
      )}
      <ul className="list" data-testid="brr-list">
        {list.map(({ station: s, km: dist }) => {
          const old = readingAgeHours(s.at) > OLD_READING_HOURS;
          const st = old ? null : brState(s.level, s.thresholds);
          const th = s.thresholds;
          return (
            <li key={s.code} className="list-row river-row" data-testid={`brr-${s.code}`}>
              <span className="list-main">
                <span className="list-title">
                  {s.name} <span className="hint">· {s.river}</span>
                </span>
                <span className="list-sub">
                  {s.muni} · {t('navigation.brRivers.distance', { km: km.format(dist) })} · {old ? t('navigation.brRivers.old', { when: at(s.at) }) : t('navigation.brRivers.reading', { when: at(s.at) })}
                </span>
                {s.flow !== null && !old && <span className="list-sub">{t('navigation.brRivers.flow', { q: q.format(s.flow) })}</span>}
                <span className="list-sub" data-testid={`brr-th-${s.code}`}>
                  {th && (th.attention !== null || th.alert !== null || th.flood !== null)
                    ? t('navigation.brRivers.thresholds', { a: meters(th.attention), b: meters(th.alert), c: meters(th.flood) })
                    : t('navigation.brRivers.noThresholds')}
                </span>
              </span>
              <span className="list-end river-level">
                <strong>{meters(s.level)} m</strong>
                {st && (
                  <span className={`chip-state ${STATE_CLASS[st]}`} data-testid={`brr-state-${s.code}`}>
                    {t(`navigation.brRivers.state.${st}`)}
                  </span>
                )}
                {s.trend && !old && <span className={`chip-state ${TREND_CLASS[s.trend]}`}>{t(`navigation.bolivia.trend.${s.trend}`)}</span>}
                {s.changeCm !== null && s.changeHours !== null && !old && (
                  <span className="hint">{t('navigation.brRivers.change', { cm: cmFmt.format(s.changeCm), h: Math.round(s.changeHours) })}</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="hint" style={{ margin: 0 }}>
        {t('navigation.brRivers.reference')}
      </p>
      <p className="hint" style={{ margin: 0 }} data-testid="brr-source">
        {t('navigation.brRivers.source')}{' '}
        <a href="https://www.gov.br/ana/pt-br" target="_blank" rel="noreferrer">
          ANA
        </a>{' '}
        ·{' '}
        <a href="https://rigeo.sgb.gov.br/server/api/core/bitstreams/54adf121-0c5a-4453-ab98-db1f062c590e/content" target="_blank" rel="noreferrer">
          SGB/CPRM
        </a>
      </p>
    </section>
  );
}
