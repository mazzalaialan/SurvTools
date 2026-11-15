import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '@/core/settings/settings';
import type { PickedPlace } from '@/modules/waypoints/PlacePicker';
import { fetchIocLevels, iocNear, loadIocCatalog, loadSavedIoc, measuredSeries, saveIoc, type IocCatalog, type IocLevels } from './ioc';
import { sourceEnabled } from './sources';
import { ForecastChart } from './ForecastChart';
import { fetchForecasts, loadSavedForecasts, saveForecasts, summarize, type StationForecast } from './forecast';
import { loadRivers, type RiverStation } from './rivers';
import { fetchSurge, loadSavedSurge, nearSurgePoints, saveSurge, surgeAt, surgeSummary, type SurgeForecast } from './surge';
import { distanceMeters } from '@/core/geo/geo';
import { isEstuary, loadTides, nearestStations, NEAR_KM, tideCurve, tideExtremes, tideLevelAt, type TidesData } from './tides';

const DAY_MS = 86_400_000;
const DAYS = 3;

/** Gráfico de la marea de los próximos días, con la línea de «ahora» y los días marcados. */
function TideChart({ curve, now, label, locale, measured, adjusted }: { curve: { time: Date; level: number }[]; now: Date; label: string; locale: string; measured?: { time: Date; level: number }[]; adjusted?: { time: Date; level: number }[] }) {
  const W = 600;
  const H = 170;
  const pad = { l: 38, r: 8, t: 10, b: 22 };
  const t0 = curve[0]!.time.getTime();
  const t1 = curve[curve.length - 1]!.time.getTime();
  const seen = measured?.filter((p) => p.time.getTime() >= t0 && p.time.getTime() <= t1) ?? [];
  const levels = [...curve, ...seen, ...(adjusted ?? [])].map((p) => p.level);
  const lo = Math.floor(Math.min(...levels) * 2) / 2;
  const hi = Math.ceil(Math.max(...levels) * 2) / 2;
  const x = (ms: number) => pad.l + ((ms - t0) / (t1 - t0)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo || 1)) * (H - pad.t - pad.b);
  const path = curve.map((p, i) => `${i ? 'L' : 'M'}${x(p.time.getTime()).toFixed(1)} ${y(p.level).toFixed(1)}`).join('');
  const area = `${path}L${x(t1).toFixed(1)} ${y(lo).toFixed(1)}L${x(t0).toFixed(1)} ${y(lo).toFixed(1)}Z`;
  const midnights: Date[] = [];
  for (let d = new Date(t0); d.getTime() <= t1; d = new Date(d.getTime() + DAY_MS)) midnights.push(d);
  // Mínimo, máximo y el nivel medio (0) si cae dentro del gráfico.
  const ticks = lo < 0 && hi > 0 ? [lo, 0, hi] : [lo, hi];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="tide-chart" role="img" aria-label={label} data-testid="tide-chart">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="tide-grid" />
          <text x={pad.l - 4} y={y(v) + 4} textAnchor="end" className="tide-axis">
            {v.toFixed(1)}
          </text>
        </g>
      ))}
      <path d={area} className="tide-area" />
      <path d={path} className="tide-line" />
      {adjusted && adjusted.length > 1 && <path d={adjusted.map((p, i) => `${i ? 'L' : 'M'}${x(p.time.getTime()).toFixed(1)} ${y(p.level).toFixed(1)}`).join('')} className="tide-surge" data-testid="tide-surge-line" />}
      {seen.length > 1 && <path d={seen.map((p, i) => `${i ? 'L' : 'M'}${x(p.time.getTime()).toFixed(1)} ${y(p.level).toFixed(1)}`).join('')} className="tide-measured" data-testid="tide-measured-line" />}
      {midnights.map((d) => (
        <g key={d.getTime()}>
          <line x1={x(d.getTime())} x2={x(d.getTime())} y1={pad.t} y2={H - pad.b} className="tide-day" />
          <text x={x(d.getTime()) + 4} y={H - 6} className="tide-axis">
            {d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric' })}
          </text>
        </g>
      ))}
      {now.getTime() >= t0 && now.getTime() <= t1 && <line x1={x(now.getTime())} x2={x(now.getTime())} y1={pad.t} y2={H - pad.b} className="tide-now" />}
    </svg>
  );
}

/** San Fernando: la estación del INA con el modelo de la marea del Río de la Plata (viento y caudales), a unos 25 km de Buenos Aires. */
const SAN_FERNANDO_ID = 52;
const SF_MAX_KM = 80;

/** Pronóstico del INA para el estuario: reemplaza el «puede diferir más de 1 m» por una curva con viento y caudales, con su banda. */
function EstuaryForecast({ place, now }: { place: PickedPlace; now: Date }) {
  const { t, i18n } = useTranslation();
  const [station, setStation] = useState<RiverStation | null>(null);
  const [forecast, setForecast] = useState<StationForecast | null>(() => loadSavedForecasts().get(SAN_FERNANDO_ID) ?? null);
  useEffect(() => {
    void loadRivers().then((d) => setStation(d.stations.find((s) => s.id === SAN_FERNANDO_ID) ?? null), () => undefined);
  }, []);
  useEffect(() => {
    if (!station || !navigator.onLine) return;
    let cancelled = false;
    void fetchForecasts([station]).then((m) => {
      const f = m.get(station.id);
      if (cancelled || !f) return;
      saveForecasts(m);
      setForecast(f);
    });
    return () => {
      cancelled = true;
    };
  }, [station]);
  if (!station || !forecast || distanceMeters(place, station) / 1000 > SF_MAX_KM) return null;
  const sum = summarize(forecast, station, now.getTime());
  if (!sum) return null;
  const nf = new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const at = (ms: number) => new Date(ms).toLocaleString(i18n.language, { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const top = forecast.points.find((p) => p.t === sum.peak.t);
  return (
    <div className="stack" style={{ gap: 6 }} data-testid="estuary-forecast">
      <h3 className="section-title" style={{ margin: 0, fontSize: '1rem' }}>
        {t('navigation.tides.sfTitle')}
      </h3>
      <p className="hint" style={{ margin: 0 }}>
        {t('navigation.tides.sfIntro', { name: station.name })}
      </p>
      <ForecastChart forecast={forecast} levels={station} now={now.getTime()} label={t('navigation.tides.sfChart', { name: station.name })} locale={i18n.language} testId="estuary-chart" />
      <p style={{ margin: 0 }} data-testid="estuary-peak">
        {t('navigation.tides.sfPeak', { max: nf.format(sum.peak.v), when: at(sum.peak.t) })}
        {top?.lo != null && top.hi != null ? ` ${t('navigation.tides.sfBand', { lo: nf.format(top.lo), hi: nf.format(top.hi) })}` : ''}
      </p>
      <p className="hint" style={{ margin: 0 }}>
        {t('navigation.tides.sfNote', { date: at(forecast.issued) })}
      </p>
    </div>
  );
}

/**
 * La sobreelevación meteorológica del INA (viento y presión) cerca de Buenos Aires y el Delta: se pide desde el teléfono y, sin conexión,
 * queda la última guardada. Solo hace falta si el lugar está en el estuario y cerca de los puntos del modelo.
 */
function useSurge(place: PickedPlace | null, estuary: boolean): SurgeForecast | null {
  const [surge, setSurge] = useState<SurgeForecast | null>(() => loadSavedSurge());
  const wanted = estuary && !!place && nearSurgePoints(place.lat, place.lon);
  useEffect(() => {
    if (!wanted || !navigator.onLine) return;
    let cancelled = false;
    void fetchSurge().then(
      (s) => {
        if (cancelled || !s) return;
        saveSurge(s);
        setSurge(s);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [wanted]);
  return wanted ? surge : null;
}

/** Mareas sin conexión de la estación más cercana al lugar elegido. */
export function TidesCard({ place }: { place: PickedPlace | null }) {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<TidesData | null>(null);
  const [failed, setFailed] = useState(false);
  const [chosen, setChosen] = useState(0);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    void loadTides().then(setData, () => setFailed(true));
  }, []);
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const near = useMemo(() => (data && place ? nearestStations(data.stations, place.lat, place.lon, 3) : []), [data, place?.lat, place?.lon]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setChosen(0), [place?.lat, place?.lon]);
  const pick = near[chosen] ?? near[0];
  const station = pick?.station;

  // Desde hoy a las 00:00 (hora del teléfono) durante tres días.
  const start = useMemo(() => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [now.getDate()]); // eslint-disable-line react-hooks/exhaustive-deps
  const end = useMemo(() => new Date(start.getTime() + DAYS * DAY_MS), [start]);
  const curve = useMemo(() => (station ? tideCurve(station, start, end) : []), [station, start, end]);
  const extremes = useMemo(() => (station ? tideExtremes(station, new Date(now.getTime() - 3 * 3_600_000), end).filter((e) => e.time.getTime() >= now.getTime() - 3_600_000) : []), [station, now.getHours(), end]); // eslint-disable-line react-hooks/exhaustive-deps
  // Mareógrafo medido (IOC) a menos de 30 km de la estación: lo pide el servidor, que guarda la clave; sin conexión queda el último guardado.
  const server = useSettings((s) => s.settings.serverUrl)?.trim() || null;
  const iocOn = sourceEnabled('ioc');
  const [iocCatalog, setIocCatalog] = useState<IocCatalog | null>(null);
  useEffect(() => {
    if (iocOn) void loadIocCatalog().then(setIocCatalog, () => undefined);
  }, [iocOn]);
  const gauge = useMemo(() => (iocCatalog && station ? iocNear(iocCatalog.stations, station.lat, station.lon) : null), [iocCatalog, station]);
  const gaugeCode = gauge?.station.code ?? null;
  const [levels, setLevels] = useState<IocLevels | null>(null);
  useEffect(() => {
    setLevels(gaugeCode ? loadSavedIoc(gaugeCode) : null);
    if (!gaugeCode || !server || !navigator.onLine) return;
    let cancelled = false;
    fetchIocLevels(server, gaugeCode).then(
      (l) => {
        if (cancelled) return;
        saveIoc(l);
        setLevels(l);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [gaugeCode, server]);
  const measured = useMemo(() => (levels && station ? measuredSeries(levels, station) : null), [levels, station]);
  const estuary = !!station && !!place && isEstuary(station, place.lat, place.lon);
  const surge = useSurge(place, estuary);
  // La marea calculada más la sobreelevación del INA, solo donde el pronóstico la cubre (unos 4 días).
  const adjusted = useMemo(() => (surge ? curve.flatMap((p) => { const v = surgeAt(surge, p.time.getTime()); return v === null ? [] : [{ time: p.time, level: p.level + v }]; }) : []), [surge, curve]);
  const surgeNow = surge ? surgeSummary(surge, now.getTime()) : null;
  const levelNow = station ? tideLevelAt(station, now) : null;
  const levelSoon = station ? tideLevelAt(station, new Date(now.getTime() + 10 * 60_000)) : null;
  const nf = new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'always' });
  const km = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 0 });
  const when = (d: Date) => d.toLocaleString(i18n.language, { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <section className="card stack" aria-labelledby="tides-title" data-testid="tides-card">
      <h2 id="tides-title" className="section-title" style={{ margin: 0 }}>
        {t('navigation.tides.title')}
      </h2>
      <p className="hint" style={{ margin: 0 }}>
        {t('navigation.tides.intro')}
      </p>
      {failed && <p className="error">{t('navigation.tides.unavailable')}</p>}
      {data && place && station && pick && (
        <>
          {near.length > 1 && (
            <div className="chips" role="group" aria-label={t('navigation.tides.stations')} data-testid="tide-stations">
              {near.map((n, i) => (
                <button key={n.station.id} type="button" className="chip" aria-pressed={i === chosen} onClick={() => setChosen(i)}>
                  {n.station.name} · {km.format(n.km)} km
                </button>
              ))}
            </div>
          )}
          <p style={{ margin: 0 }} data-testid="tide-station">
            <strong>{station.name}</strong> ({t(`country.${station.country}`)}) · {t('navigation.tides.distance', { km: km.format(pick.km) })}
          </p>
          {pick.km > NEAR_KM && (
            <p className="error" role="alert" data-testid="tide-far">
              {t('navigation.tides.far', { km: km.format(pick.km) })}
            </p>
          )}
          {isEstuary(station, place.lat, place.lon) && (
            <p className="rain-notice" role="alert" data-testid="tide-estuary" style={{ margin: 0 }}>
              <span className="update-text">
                <strong>{t('navigation.tides.estuaryTitle')}</strong>
                <span className="hint">{t('navigation.tides.estuary')}</span>
              </span>
            </p>
          )}
          {isEstuary(station, place.lat, place.lon) && <EstuaryForecast place={place} now={now} />}
          {station.issues.length > 0 && (
            <p className="hint" data-testid="tide-issues" style={{ margin: 0 }}>
              {t('navigation.tides.issues')}
            </p>
          )}
          {levelNow !== null && levelSoon !== null && (
            <p className="decl-value" data-testid="tide-now">
              {t('navigation.tides.now', { level: nf.format(levelNow), trend: t(levelSoon >= levelNow ? 'navigation.tides.rising' : 'navigation.tides.falling') })}
            </p>
          )}
          {curve.length > 1 && <TideChart curve={curve} now={now} label={t('navigation.tides.chartLabel', { days: DAYS })} locale={i18n.language} measured={measured?.points} adjusted={adjusted} />}
          {surge && surgeNow && adjusted.length > 1 && (
            <div className="stack" style={{ gap: 4 }} data-testid="estuary-surge">
              <p style={{ margin: 0 }}>
                <strong>{t('navigation.tides.surgeTitle')}</strong>{' '}
                {surgeNow.now !== null ? `${t('navigation.tides.surgeNow', { value: nf.format(surgeNow.now) })} · ` : ''}
                {t('navigation.tides.surgeMax', { value: nf.format(surgeNow.max.v), when: when(new Date(surgeNow.max.t)) })} · {t('navigation.tides.surgeMin', { value: nf.format(surgeNow.min.v), when: when(new Date(surgeNow.min.t)) })}
              </p>
              <p className="hint" style={{ margin: 0 }}>
                {t('navigation.tides.surgeNote', { date: when(new Date(surge.issued)) })}
              </p>
            </div>
          )}
          {measured && gauge && (
            <div className="stack" style={{ gap: 4 }} data-testid="tide-gauge">
              <p style={{ margin: 0 }} data-testid="tide-gauge-dev">
                <strong>{t('navigation.tides.gaugeTitle', { name: gauge.station.name })}</strong>{' '}
                {t(Math.abs(measured.deviation) < 0.05 ? 'navigation.tides.gaugeSame' : measured.deviation > 0 ? 'navigation.tides.gaugeAbove' : 'navigation.tides.gaugeBelow', {
                  value: nf.format(Math.abs(measured.deviation)).replace(/^[+-]/, ''),
                  time: measured.lastAt.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' }),
                })}
              </p>
              {measured.rms > 0.4 && (
                <p className="hint" style={{ margin: 0 }} data-testid="tide-gauge-noisy">
                  {t('navigation.tides.gaugeNoisy')}
                </p>
              )}
              <p className="hint" style={{ margin: 0 }}>
                {t('navigation.tides.gaugeNote', { operator: gauge.station.operator || gauge.station.name })}
                {levels?.stale ? ` ${t('navigation.tides.gaugeStale')}` : ''}
              </p>
            </div>
          )}
          <h3 className="section-title" style={{ margin: 0, fontSize: '1rem' }}>
            {t('navigation.tides.next')}
          </h3>
          <ul className="list" data-testid="tide-extremes">
            {extremes.map((e) => (
              <li key={e.time.getTime()} className="list-row">
                <span className="list-main">
                  <span className="list-title">{t(e.high ? 'navigation.tides.high' : 'navigation.tides.low')}</span>
                  <span className="list-sub">{when(e.time)}</span>
                </span>
                <span className="list-end">{nf.format(e.level)} m</span>
              </li>
            ))}
          </ul>
          <p className="hint" style={{ margin: 0 }}>
            {t('navigation.tides.reference')}
          </p>
          <p className="hint" style={{ margin: 0 }} data-testid="tide-source">
            {t('navigation.tides.source', { source: data.source, date: data.generatedAt })}
          </p>
        </>
      )}
    </section>
  );
}
