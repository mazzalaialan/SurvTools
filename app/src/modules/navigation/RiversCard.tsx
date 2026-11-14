import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PickedPlace } from '@/modules/waypoints/PlacePicker';
import { ForecastChart } from './ForecastChart';
import { fetchForecasts, loadSavedForecasts, saveForecasts, summarize, type StationForecast } from './forecast';
import {
  FLOW_STORE,
  OLD_FLOW_DAYS,
  fetchReadings,
  loadRivers,
  loadSavedReadings,
  nearestRivers,
  riverState,
  saveReadings,
  type RiverReading,
  type RiversData,
  type RiverState,
} from './rivers';

const STATE_CLASS: Record<RiverState, string> = { evac: 'river-evac', alert: 'river-alert', low: 'river-low', normal: 'river-ok' };

/** Niveles de los ríos de Argentina cerca del lugar elegido (INA), con sus umbrales de alerta. */
export function RiversCard({ place }: { place: PickedPlace | null }) {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<RiversData | null>(null);
  const [failed, setFailed] = useState(false);
  const [readings, setReadings] = useState<Map<number, RiverReading>>(() => loadSavedReadings());
  const [live, setLive] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [forecasts, setForecasts] = useState<Map<number, StationForecast>>(() => loadSavedForecasts());
  const [flows, setFlows] = useState<Map<number, RiverReading>>(() => loadSavedReadings(FLOW_STORE));
  const [openForecast, setOpenForecast] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    void loadRivers().then(setData, () => setFailed(true));
  }, []);

  const near = useMemo(() => (data && place ? nearestRivers(data.stations, place.lat, place.lon) : []), [data, place?.lat, place?.lon]); // eslint-disable-line react-hooks/exhaustive-deps
  const key = near.map((n) => n.station.series).join(',');
  // Con conexión se piden los niveles al INA; sin conexión (o si falla) quedan los últimos guardados.
  useEffect(() => {
    if (!near.length) return;
    if (!navigator.onLine) {
      setLive('error');
      return;
    }
    let cancelled = false;
    setLive('loading');
    fetchReadings(near.map((n) => n.station.series)).then(
      (fresh) => {
        if (cancelled) return;
        saveReadings(fresh);
        setReadings((prev) => new Map([...prev, ...fresh]));
        setLive('ok');
      },
      () => !cancelled && setLive('error'),
    );
    return () => {
      cancelled = true;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pronóstico de altura del INA de las estaciones cercanas que lo tienen; sin conexión quedan los últimos guardados.
  useEffect(() => {
    const withF = near.map((n) => n.station).filter((s) => s.forecast?.length);
    if (!withF.length || !navigator.onLine) return;
    let cancelled = false;
    void fetchForecasts(withF).then((fresh) => {
      if (cancelled || !fresh.size) return;
      saveForecasts(fresh);
      setForecasts((prev) => new Map([...prev, ...fresh]));
    });
    return () => {
      cancelled = true;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Caudal medio diario (m³/s) de las estaciones cercanas que lo tienen al día.
  useEffect(() => {
    const series = near.map((n) => n.station.flow).filter((f): f is number => f !== undefined);
    if (!series.length || !navigator.onLine) return;
    let cancelled = false;
    void fetchReadings(series).then(
      (fresh) => {
        if (cancelled || !fresh.size) return;
        saveReadings(fresh, FLOW_STORE);
        setFlows((prev) => new Map([...prev, ...fresh]));
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const flowFmt = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 0 });
  const flowSigned = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 0, signDisplay: 'always' });
  const nf = new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const whenFmt = (ms: number) => new Date(ms).toLocaleString(i18n.language, { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const sf = new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'always' });
  const km = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 0 });
  const ago = (iso: string) => {
    const h = (Date.now() - Date.parse(iso)) / 3_600_000;
    if (h < 1) return t('navigation.rivers.agoMinutes', { n: Math.max(1, Math.round(h * 60)) });
    if (h < 48) return t('navigation.rivers.agoHours', { n: Math.round(h) });
    return t('navigation.rivers.agoDays', { n: Math.round(h / 24) });
  };

  return (
    <section className="card stack" aria-labelledby="rivers-title" data-testid="rivers-card">
      <h2 id="rivers-title" className="section-title" style={{ margin: 0 }}>
        {t('navigation.rivers.title')}
      </h2>
      <p className="hint" style={{ margin: 0 }}>
        {t('navigation.rivers.intro')}
      </p>
      {failed && <p className="error">{t('navigation.rivers.unavailable')}</p>}
      {data && place && near.length === 0 && (
        <p className="hint" data-testid="rivers-none">
          {t('navigation.rivers.none')}
        </p>
      )}
      {live === 'error' && near.length > 0 && (
        <p className="hint" data-testid="rivers-offline">
          {t('navigation.rivers.offline')}
        </p>
      )}
      <ul className="list" data-testid="rivers-list">
        {near.map(({ station: s, km: dist }) => {
          const r = readings.get(s.series);
          const state = r ? riverState(r.level, s) : null;
          const fc = s.forecast?.length ? forecasts.get(s.id) : undefined;
          const sum = fc ? summarize(fc, s, now) : null;
          const flow = s.flow !== undefined ? flows.get(s.flow) : undefined;
          const flowOld = flow ? (now - Date.parse(flow.at)) / 86_400_000 > OLD_FLOW_DAYS : false;
          const threshold = (kind: 'evac' | 'alert' | 'low') => nf.format(s[kind] ?? 0);
          return (
            <li key={s.id} className="list-row river-row" data-testid={`river-${s.id}`}>
              <span className="list-main">
                <span className="list-title">
                  {s.name} <span className="hint">· {s.river}</span>
                </span>
                <span className="list-sub">
                  {t('navigation.rivers.distance', { km: km.format(dist) })}
                  {r ? ` · ${t('navigation.rivers.measured', { ago: ago(r.at) })}` : ''}
                </span>
                <span className="list-sub">
                  {[
                    s.alert !== null && t('navigation.rivers.thresholdAlert', { m: nf.format(s.alert) }),
                    s.evac !== null && t('navigation.rivers.thresholdEvac', { m: nf.format(s.evac) }),
                    s.low !== null && t('navigation.rivers.thresholdLow', { m: nf.format(s.low) }),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                {flow && (
                  <span className="list-sub" data-testid={`river-flow-${s.id}`}>
                    {t('navigation.rivers.flow', { q: flowFmt.format(flow.level), date: new Date(flow.at).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' }) })}
                    {flow.change !== null && Math.abs(flow.change) >= 1 ? ` · ${t('navigation.rivers.flowChange', { d: flowSigned.format(flow.change) })}` : ''}
                    {flowOld ? ` · ${t('navigation.rivers.flowOld')}` : ''}
                  </span>
                )}
                {s.forecast?.length ? (
                  <span className="river-forecast" data-testid={`river-forecast-${s.id}`}>
                    {fc && sum ? (
                      <>
                        <span className="hint">
                          {t('navigation.rivers.forecast.peak', { max: nf.format(sum.peak.v), maxAt: whenFmt(sum.peak.t), min: nf.format(sum.trough.v), minAt: whenFmt(sum.trough.t) })}{' '}
                          {sum.first
                            ? t(sum.first.band ? 'navigation.rivers.forecast.reachBand' : 'navigation.rivers.forecast.reach', {
                                what: t(`navigation.rivers.forecast.what.${sum.first.kind}`),
                                m: threshold(sum.first.kind),
                                when: whenFmt(sum.first.t),
                              })
                            : t('navigation.rivers.forecast.none')}
                        </span>
                        <button type="button" className="btn" aria-expanded={openForecast === s.id} onClick={() => setOpenForecast(openForecast === s.id ? null : s.id)}>
                          {t(openForecast === s.id ? 'navigation.rivers.forecast.hide' : 'navigation.rivers.forecast.show')}
                        </button>
                        {openForecast === s.id && (
                          <>
                            <ForecastChart forecast={fc} levels={s} now={now} label={t('navigation.rivers.forecast.chartLabel', { name: s.name })} locale={i18n.language} testId={`forecast-chart-${s.id}`} />
                            <span className="hint">
                              {t('navigation.rivers.forecast.issued', { date: whenFmt(fc.issued) })} {t('navigation.rivers.forecast.legend')}
                            </span>
                          </>
                        )}
                      </>
                    ) : (
                      <span className="hint">{t('navigation.rivers.forecast.loading')}</span>
                    )}
                  </span>
                ) : null}
              </span>
              <span className="list-end river-level">
                {r && state ? (
                  <>
                    <strong>{nf.format(r.level)} m</strong>
                    <span className={`chip-state ${STATE_CLASS[state]}`} data-testid={`river-state-${s.id}`}>
                      {t(`navigation.rivers.state.${state}`)}
                    </span>
                    {r.change !== null && (
                      <span className="hint">
                        {sf.format(r.change)} m {t('navigation.rivers.perDay')}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="hint">{live === 'loading' ? t('navigation.rivers.loading') : t('navigation.rivers.noReading')}</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {near.length > 0 && (
        <>
          <p className="hint" style={{ margin: 0 }}>
            {t('navigation.rivers.reference')}
          </p>
          <p className="hint" style={{ margin: 0 }} data-testid="rivers-source">
            {t('navigation.rivers.source', { source: data?.source ?? 'INA' })}
          </p>
          <p className="hint" style={{ margin: 0 }}>
            {t('navigation.rivers.alerts')}
          </p>
          {near.some((n) => n.station.forecast?.length) && (
            <p className="hint" style={{ margin: 0 }}>
              {t('navigation.rivers.forecast.disclaimer')}
            </p>
          )}
        </>
      )}
    </section>
  );
}
