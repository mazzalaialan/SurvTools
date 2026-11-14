import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '@/core/settings/settings';
import type { PickedPlace } from '@/modules/waypoints/PlacePicker';
import { usePlaceCountries } from '@/modules/emergency/usePlaceCountry';
import { ageDays, fetchBoExtras, fetchBoLevels, loadBoCatalog, loadSavedBo, loadSavedBoExtras, nearestBo, OLD_READING_DAYS, saveBo, saveBoExtras, type BoCatalog, type BoExtras, type BoLevels } from './bolivia';
import { distanceMeters } from '@/core/geo/geo';

const TREND_CLASS = { rising: 'river-alert', falling: 'river-low', steady: 'river-ok' } as const;

/** Niveles de los ríos y del lago Titicaca de Bolivia (SENAMHI) cerca del lugar elegido, en Bolivia o a menos de 50 km de su frontera. */
export function BoliviaRiversCard({ place }: { place: PickedPlace | null }) {
  const { t, i18n } = useTranslation();
  const server = useSettings((s) => s.settings.serverUrl)?.trim() || null;
  const { country, near } = usePlaceCountries(place);
  const relevant = country === 'BO' || near.includes('BO');
  const [catalog, setCatalog] = useState<BoCatalog | null>(null);
  const [levels, setLevels] = useState<BoLevels | null>(() => loadSavedBo());
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  useEffect(() => {
    if (relevant) void loadBoCatalog().then(setCatalog, () => undefined);
  }, [relevant]);
  useEffect(() => {
    if (!relevant || !server) return;
    if (!navigator.onLine) {
      setState('error');
      return;
    }
    let cancelled = false;
    setState('loading');
    fetchBoLevels(server).then(
      (l) => {
        if (cancelled) return;
        saveBo(l);
        setLevels(l);
        setState('ok');
      },
      () => !cancelled && setState('error'),
    );
    return () => {
      cancelled = true;
    };
  }, [relevant, server]);

  // Resumen del pronóstico hidrológico y boletín del lago: otro endpoint del servidor, aparte de los niveles.
  const [extras, setExtras] = useState<BoExtras | null>(() => loadSavedBoExtras());
  useEffect(() => {
    if (!relevant || !server || !navigator.onLine) return;
    let cancelled = false;
    fetchBoExtras(server).then(
      (e) => {
        if (cancelled) return;
        saveBoExtras(e);
        setExtras(e);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [relevant, server]);

  const list = useMemo(() => (levels && catalog && place ? nearestBo(levels, catalog, place.lat, place.lon) : []), [levels, catalog, place?.lat, place?.lon]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!relevant) return null;
  const n0 = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 0 });
  const sf = new Intl.NumberFormat(i18n.language, { signDisplay: 'always', maximumFractionDigits: 0 });
  const km = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 0 });
  const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' });
  return (
    <section className="card stack" aria-labelledby="bo-title" data-testid="bo-card">
      <h2 id="bo-title" className="section-title" style={{ margin: 0 }}>
        {t('navigation.bolivia.title')}
      </h2>
      <p className="hint" style={{ margin: 0 }}>
        {t('navigation.bolivia.intro')}
      </p>
      {!server && !levels && (
        <p className="hint" data-testid="bo-needs-server">
          {t('navigation.bolivia.needsServer')}
        </p>
      )}
      {state === 'loading' && !levels && <p className="hint">{t('navigation.bolivia.loading')}</p>}
      {state === 'error' && (
        <p className={levels ? 'hint' : 'error'} data-testid="bo-offline">
          {levels ? t('navigation.bolivia.offlineSaved', { date: day(levels.reportDate) }) : t('navigation.bolivia.error')}
        </p>
      )}
      {levels?.stale && state !== 'error' && (
        <p className="hint" data-testid="bo-stale">
          {t('navigation.bolivia.stale', { date: day(levels.reportDate) })}
        </p>
      )}
      {levels && (
        <p style={{ margin: 0 }} data-testid="bo-report">
          {t('navigation.bolivia.report', { date: day(levels.reportDate) })}
        </p>
      )}
      {extras?.forecast && (
        <div className="stack" style={{ gap: 4 }} data-testid="bo-forecast">
          <h3 className="section-title" style={{ margin: 0, fontSize: '1rem' }}>
            {t('navigation.bolivia.forecast.title')}
          </h3>
          <p className="hint" style={{ margin: 0 }}>
            {t('navigation.bolivia.forecast.issued', { date: day(extras.forecast.issuedOn), period: extras.forecast.period })}
          </p>
          <p style={{ margin: 0 }} data-testid="bo-forecast-note">
            {extras.forecast.note}
          </p>
          {extras.forecast.trend && extras.forecast.spans && (
            <p style={{ margin: 0 }} data-testid="bo-forecast-spans">
              {t(`navigation.bolivia.forecast.${extras.forecast.trend}`)}: {extras.forecast.spans}
            </p>
          )}
          <p className="hint" style={{ margin: 0 }}>
            {t('navigation.bolivia.forecast.note')}{' '}
            <a href={extras.forecast.url} target="_blank" rel="noreferrer">
              {t('navigation.bolivia.forecast.open')}
            </a>
          </p>
        </div>
      )}
      {extras?.lake && catalog && place && (() => {
        const huatajata = catalog.stations.find((s) => s.name === 'HUATAJATA');
        if (!huatajata || distanceMeters({ lat: place.lat, lon: place.lon }, huatajata) / 1000 > 200) return null;
        const l = extras.lake;
        const m2 = new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const m3 = new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
        return (
          <div className="stack" style={{ gap: 4 }} data-testid="bo-lake">
            <h3 className="section-title" style={{ margin: 0, fontSize: '1rem' }}>
              {t('navigation.bolivia.lake.title')}
            </h3>
            <p style={{ margin: 0 }}>
              {t('navigation.bolivia.lake.level', { m: m2.format(l.levelM), abs: m3.format(l.absoluteM), date: day(l.date) })}
              {l.weekCm !== null ? ` · ${t(l.weekCm === 0 ? 'navigation.bolivia.lake.steady' : l.weekCm > 0 ? 'navigation.bolivia.lake.up' : 'navigation.bolivia.lake.down', { cm: Math.abs(l.weekCm) })}` : ''}
              {l.vsAverageM !== null && Math.abs(l.vsAverageM) >= 0.01 ? ` · ${t(l.vsAverageM < 0 ? 'navigation.bolivia.lake.below' : 'navigation.bolivia.lake.above', { m: m2.format(Math.abs(l.vsAverageM)) })}` : ''}
            </p>
            <p className="hint" style={{ margin: 0 }}>
              {t('navigation.bolivia.lake.note')}{' '}
              <a href={l.url} target="_blank" rel="noreferrer">
                {t('navigation.bolivia.lake.open')}
              </a>
            </p>
          </div>
        );
      })()}
      {levels && catalog && list.length === 0 && (
        <p className="hint" data-testid="bo-none">
          {t('navigation.bolivia.none')}
        </p>
      )}
      <ul className="list" data-testid="bo-list">
        {list.map(({ reading: r, station: s, km: dist }) => {
          const old = levels ? ageDays(r.lastDate, levels.reportDate) > OLD_READING_DAYS : false;
          return (
            <li key={`${r.station}-${r.river}`} className="list-row river-row" data-testid={`bo-${r.station.replace(/\s+/g, '-')}-${r.river.replace(/\s+/g, '-')}`}>
              <span className="list-main">
                <span className="list-title">
                  {r.station} <span className="hint">· {r.river}</span>
                </span>
                <span className="list-sub">
                  {t('navigation.bolivia.distance', { km: km.format(dist) })}
                  {s.approx ? ` · ${t('navigation.bolivia.approx')}` : ''}
                </span>
                <span className={old ? 'error list-sub' : 'list-sub'} data-testid={old ? 'bo-old' : undefined}>
                  {t('navigation.bolivia.measured', { date: day(r.lastDate) })}
                  {old ? ` · ${t('navigation.bolivia.old')}` : ''}
                </span>
                {r.zeroCm !== null && <span className="list-sub">{t('navigation.bolivia.zero', { cm: n0.format(r.zeroCm) })}</span>}
              </span>
              <span className="list-end river-level">
                <strong>{n0.format(r.lastCm)} cm</strong>
                <span className={`chip-state ${TREND_CLASS[r.trend]}`}>{t(`navigation.bolivia.trend.${r.trend}`)}</span>
                <span className="hint">
                  {sf.format(r.lastCm - r.prevCm)} cm {t('navigation.bolivia.sinceBefore')}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="hint" style={{ margin: 0 }}>
        {t('navigation.bolivia.reference')}
      </p>
      <p className="hint" style={{ margin: 0 }} data-testid="bo-source">
        {t('navigation.bolivia.source')}
      </p>
    </section>
  );
}
