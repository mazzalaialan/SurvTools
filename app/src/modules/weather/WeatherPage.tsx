import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { OfficialWeatherNotice } from '@/ui/OfficialWeatherNotice';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, Droplets, Gauge, Minus, RefreshCw, TriangleAlert, Wind } from 'lucide-react';
import { cardinalOf } from '@/core/geo/geo';
import { notificationBackend } from '@/core/notifications/backend';
import { readNotificationState } from '@/core/notifications/state';
import { useSettings } from '@/core/settings/settings';
import type { UnitSystem } from '@/core/units/units';
import { usePlacePicker } from '@/modules/waypoints/PlacePicker';
import { useWaypoints } from '@/modules/waypoints/store';
import { cachedForecast, placeKey, storeForecast } from './cache';
import { RAIN_MM_PER_SLOT, rainOutlook, type RainSlot } from './nowcast';
import { HERE_ID, useRainWatch } from './rainWatch';
import { fetchForecast, HOURLY_DETAIL_DAYS, mmToInch, placeNow, RELIABLE_DAYS, skyOf, warningsOf, WeatherError, type Forecast } from './forecast';
import { pressureLevel } from './levels';
import { DayHoursDialog, DayList, DayPeriodsDialog, HourStripItem, Lvl, SkyIcon, useUnits, WindArrow, type Units } from './parts';

/**
 * Con conexión, un pronóstico más viejo que esto se vuelve a descargar (al
 * abrir la pantalla y mientras está abierta): la lluvia de las próximas 2 horas
 * cambia rápido.
 */
const STALE_MS = 15 * 60_000;

export function WeatherPage() {
  const { t, i18n } = useTranslation();
  const { place, picker } = usePlacePicker();
  const base = useSettings((s) => s.settings.weatherUrl);
  const system = useSettings((s) => s.settings.units);
  const u = useUnits(system, i18n.language);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<WeatherError['code'] | null>(null);
  const [selectedDay, setSelectedDay] = useState<{ date: string; index: number } | null>(null);
  const longDayFmt = new Intl.DateTimeFormat(i18n.language, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

  const lat = place?.lat ?? null;
  const lon = place?.lon ?? null;
  const alt = place?.alt ?? null;
  const key = lat === null || lon === null ? null : placeKey(lat, lon);

  const refresh = useCallback(async () => {
    if (lat === null || lon === null || !key) return;
    setLoading(true);
    setError(null);
    try {
      const fresh = await fetchForecast(base, lat, lon, new Date(), alt);
      await storeForecast(key, fresh);
      setForecast(fresh);
    } catch (e) {
      setError(e instanceof WeatherError ? e.code : 'unreachable');
    } finally {
      setLoading(false);
    }
    // Depende de la celda del lugar (`key`), no de cada metro que se mueve el GPS.
  }, [key, base, alt]);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    setForecast(null);
    setError(null);
    void cachedForecast(key).then((cached) => {
      if (cancelled) return;
      setForecast(cached);
      const stale = !cached || Date.now() - Date.parse(cached.fetchedAt) > STALE_MS;
      if (stale && navigator.onLine) void refresh();
      else if (!cached && !navigator.onLine) setError('offline');
    });
    return () => {
      cancelled = true;
    };
  }, [key, refresh]);

  // El reloj avanza aunque el pronóstico sea el mismo: cada minuto se recalcula "ahora"
  // y, si el pronóstico quedó viejo y hay conexión, se descarga de nuevo.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (forecast && !loading && navigator.onLine && now.getTime() - Date.parse(forecast.fetchedAt) > STALE_MS) void refresh();
    // Solo al avanzar el reloj.
  }, [now]);

  const nowLocal = forecast ? placeNow(forecast.timezone, now) : '';
  const ago = forecast ? relativeAgo(forecast.fetchedAt, i18n.language) : null;
  const dayFmt = new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
  const dayLabel = (iso: string, i: number) => (i === 0 ? t('weather.today') : dayFmt.format(new Date(`${iso}T12:00:00Z`)));
  // Desde la hora en curso: a las 2:40 la primera es la de las 2:00.
  const hours = forecast ? forecast.hourly.filter((h) => h.time >= nowLocal.slice(0, 13)).slice(0, 24) : [];
  // Los avisos se calculan sobre los días confiables; la tendencia lejana generaría falsas alarmas.
  const warnings = forecast ? warningsOf(forecast.daily.slice(0, RELIABLE_DAYS)) : [];

  return (
    <div className="stack">
      <h1 className="page-title">{t('modules.weather.title')}</h1>
      {picker}

      {key && (
        <div className="weather-status">
          <span className="hint" data-testid="weather-updated">
            {loading ? t('weather.loading') : ago ? t('weather.updated', { ago }) : null}
          </span>
          <button className="btn" type="button" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw size={18} /> {t('weather.refresh')}
          </button>
        </div>
      )}
      {error && (
        <p className={forecast ? 'hint' : 'error'} role="status">
          {t(`weather.error.${error}`)}
          {forecast && ` ${t('weather.showingCached')}`}
        </p>
      )}

      {!place ? (
        <p className="empty" data-testid="weather-need-place">{t('weather.needPlace')}</p>
      ) : !forecast ? null : (
        <>
          <CurrentConditions current={forecast.current} u={u} />

          {forecast.minutely15 && forecast.minutely15.length > 0 && (
            <NextRain now={nowLocal} slots={forecast.minutely15} system={system} />
          )}

          {warnings.length > 0 && (
            <section className="card stack weather-warnings" aria-labelledby="warn-title">
              <h2 id="warn-title" className="section-title" style={{ margin: 0 }}>
                <TriangleAlert size={18} aria-hidden /> {t('weather.warningsTitle')}
              </h2>
              <ul className="list">
                {warnings.map((w) => (
                  <li key={`${w.kind}-${w.date}`} className="list-row">
                    <span className="list-main">
                      <span className="list-title">{t(`weather.warning.${w.kind}`, { value: w.kind === 'frost' || w.kind === 'heat' ? u.temp(w.value) : w.kind === 'gusts' ? u.wind(w.value) : w.kind === 'heavyRain' ? u.rain(w.value) : Math.round(w.value) })}</span>
                    </span>
                    <span className="list-sub">{dayLabel(w.date, forecast.daily.findIndex((d) => d.date === w.date))}</span>
                  </li>
                ))}
              </ul>
              <p className="hint" style={{ margin: 0 }}>{t('weather.warningsNote')}</p>
            </section>
          )}

          <section className="card stack" aria-labelledby="hours-title">
            <h2 id="hours-title" className="section-title" style={{ margin: 0 }}>{t('weather.next24')}</h2>
            <p className="hint hour-legend" style={{ margin: 0 }}>
              <Droplets size={14} aria-hidden /> {t('weather.legendRain')} · <Wind size={14} aria-hidden /> {t('weather.legendWind', { unit: u.windUnit })}
            </p>
            <ol className="hour-strip">
              {hours.map((h) => (
                <HourStripItem key={h.time} h={h} u={u} />
              ))}
            </ol>
          </section>

          <section className="card stack" aria-labelledby="days-title">
            <h2 id="days-title" className="section-title" style={{ margin: 0 }}>{t('weather.nextDays', { count: Math.min(RELIABLE_DAYS, forecast.daily.length) })}</h2>
            <p className="hint" style={{ margin: 0 }}>{t('weather.tapDay')}</p>
            <DayList days={forecast.daily.slice(0, RELIABLE_DAYS)} offset={0} dayLabel={dayLabel} u={u} onSelect={(date, index) => setSelectedDay({ date, index })} />
            {forecast.daily.length > RELIABLE_DAYS && (
              <>
                <h3 className="section-title trend-title" style={{ margin: '8px 0 0' }}>{t('weather.trend', { from: RELIABLE_DAYS + 1, to: forecast.daily.length })}</h3>
                <p className="hint" style={{ margin: 0 }}>{t('weather.trendHint')}</p>
                <DayList days={forecast.daily.slice(RELIABLE_DAYS)} offset={RELIABLE_DAYS} dayLabel={dayLabel} u={u} trend />
              </>
            )}
          </section>
          {selectedDay &&
            (() => {
              // Días 1 a 3: hora por hora; 4 a 7: por períodos del día.
              const Detail = selectedDay.index < HOURLY_DETAIL_DAYS ? DayHoursDialog : DayPeriodsDialog;
              return (
                <Detail
                  title={longDayFmt.format(new Date(`${selectedDay.date}T12:00:00Z`))}
                  hours={forecast.hourly.filter((h) => h.time.startsWith(selectedDay.date))}
                  u={u}
                  onClose={() => setSelectedDay(null)}
                />
              );
            })()}
          <p className="hint">{t('weather.source', { place: place.label })}</p>
        </>
      )}

      {/* Se configura una vez: queda plegado para que la pantalla muestre primero el pronóstico. */}
      <details className="more-options" data-testid="weather-alerts">
        <summary>{t('rainAlerts.foldTitle')}</summary>
        <RainAlertsSettings />
      </details>
      <OfficialWeatherNotice />
    </div>
  );
}

/** Lluvia de las próximas 2 horas, en barras de 15 minutos. */
function NextRain({ now, slots, system }: { now: string; slots: RainSlot[]; system: UnitSystem }) {
  const { t, i18n } = useTranslation();
  // Desde el cuarto de hora en curso (a las 2:40, desde las 2:30): lo pasado no se muestra.
  const quarter = `${now.slice(0, 14)}${String(Math.floor(Number(now.slice(14, 16)) / 15) * 15).padStart(2, '0')}`;
  const visible = slots.filter((s) => s.time >= quarter);
  if (visible.length === 0) return null;
  const outlook = rainOutlook({ now, slots });
  const mm = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 });
  const amount = (v: number) => (system === 'imperial' ? `${mm.format(mmToInch(v))} in` : `${mm.format(v)} mm`);
  const max = Math.max(1, ...visible.map((s) => s.mm));
  return (
    <section className="card stack" aria-labelledby="next-rain-title">
      <h2 id="next-rain-title" className="section-title" style={{ margin: 0 }}>{t('rainAlerts.nextTitle')}</h2>
      <p className="sky-big" data-testid="next-rain">
        {outlook.state === 'dry'
          ? t('rainAlerts.dry')
          : outlook.state === 'raining'
            ? t('rainAlerts.raining', { amount: amount(outlook.mm) })
            : t('rainAlerts.soon', { minutes: outlook.inMinutes, amount: amount(outlook.mm) })}
      </p>
      <ol className="rain-bars" aria-hidden>
        {visible.map((s) => (
          <li key={s.time}>
            <span className="rain-bar" style={{ height: `${Math.max(2, (s.mm / max) * 100)}%` }} data-wet={s.mm >= RAIN_MM_PER_SLOT} />
            <span className="hint">{s.time.slice(11, 16)}</span>
          </li>
        ))}
      </ol>
      <p className="hint" style={{ margin: 0 }}>{t('rainAlerts.modelNote')}</p>
    </section>
  );
}

/** Dónde avisar si va a llover: mi ubicación y los waypoints marcados. */
function RainAlertsSettings() {
  const { t } = useTranslation();
  const here = useSettings((s) => s.settings.rainAlertsHere);
  const update = useSettings((s) => s.update);
  const waypoints = useWaypoints((s) => s.waypoints);
  const statuses = useRainWatch((s) => s.statuses);
  const watched = [...waypoints.values()].filter((w) => w.rainAlerts);
  // El permiso sale de la capa de notificaciones: en la app nativa `Notification` no existe en el WebView.
  const backend = notificationBackend();
  const permission = backend.supported() ? backend.permission() : 'denied';
  const notificationsEnabled = useSettings((s) => s.settings.notificationsEnabled);
  // Con la app cerrada avisa el servidor: hace falta tenerlo registrado (Ajustes → Notificaciones).
  const [hasServer, setHasServer] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void readNotificationState().then((s) => alive && setHasServer(!!s.push));
    return () => {
      alive = false;
    };
  }, [notificationsEnabled]);

  const statusText = (id: string) => {
    const s = statuses.get(id);
    if (!s) return null;
    if (s.outlook.state === 'dry') return t('rainAlerts.statusDry');
    if (s.outlook.state === 'raining') return t('rainAlerts.statusRaining');
    return t('rainAlerts.statusSoon', { minutes: s.outlook.inMinutes });
  };

  return (
    <section className="card stack" aria-labelledby="rain-alerts-title">
      <h2 id="rain-alerts-title" className="section-title" style={{ margin: 0 }}>{t('rainAlerts.title')}</h2>
      <label className="check">
        <input type="checkbox" checked={here} onChange={(e) => void update({ rainAlertsHere: e.target.checked })} />
        {t('rainAlerts.here')}
      </label>
      {here && statusText(HERE_ID) && <p className="hint" style={{ margin: 0 }}>{statusText(HERE_ID)}</p>}
      {watched.length > 0 ? (
        <ul className="list">
          {watched.map((w) => (
            <li key={w.id}>
              <Link className="list-row" to={`/orientation/waypoints/${w.id}`}>
                <span className="list-main">
                  <span className="list-title">{w.name}</span>
                  {statusText(w.id) && <span className="list-sub">{statusText(w.id)}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint" style={{ margin: 0 }}>{t('rainAlerts.noWaypoints')}</p>
      )}
      {(here || watched.length > 0) && permission !== 'granted' && <p className="hint" style={{ margin: 0 }}>{t('rainAlerts.enableNotifications')}</p>}
      <p className="hint" style={{ margin: 0 }}>{t('rainAlerts.whileOpen')}</p>
      <p className="hint" style={{ margin: 0 }} data-testid="rain-background-hint">
        {hasServer ? t('rainAlerts.backgroundOn') : t('rainAlerts.backgroundNeedsServer')}
      </p>
    </section>
  );
}

function CurrentConditions({ current, u }: { current: Forecast['current']; u: Units }) {
  const { t } = useTranslation();
  const pressure = pressureLevel(current.pressure);
  const dir = cardinalOf(current.windDirection);
  const PressureIcon = pressure.trend === 'up' ? ArrowUp : pressure.trend === 'down' ? ArrowDown : Minus;

  return (
    <section className="card weather-now" aria-label={t('weather.now')}>
      <SkyIcon code={current.code} size={56} />
      <div>
        <p className="weather-temp" data-testid="weather-temp">
          <Lvl kind="temp" value={current.temperature} testId="now-temp">{u.temp(current.temperature)}</Lvl>
        </p>
        <p className="hint" style={{ margin: 0 }}>
          {t(`weather.sky.${skyOf(current.code)}`)} ·{' '}
          <Lvl kind="temp" value={current.apparent}>{t('weather.feelsLike', { temp: u.temp(current.apparent) })}</Lvl>
        </p>
      </div>
      <ul className="weather-facts">
        <li data-testid="now-wind">
          {/* Flecha, velocidad y dirección son un mismo dato: van del mismo color. */}
          <Lvl kind="wind" value={current.windSpeed} testId="now-wind-speed">
            <WindArrow from={current.windDirection} size={18} /> {u.wind(current.windSpeed)} {t(`geo.cardinal.${dir}`)} ({t(`geo.cardinalLong.${dir}`)})
          </Lvl>
          {' · '}
          <Lvl kind="wind" value={current.windGusts} testId="now-gusts">
            {t('weather.gusts', { value: u.wind(current.windGusts) })}
          </Lvl>
        </li>
        <li>
          <Droplets size={16} aria-hidden />{' '}
          <Lvl kind="humidity" value={current.humidity} testId="now-humidity">
            {t('weather.humidity', { pct: Math.round(current.humidity) })}
          </Lvl>
        </li>
        <li>
          <Gauge size={16} aria-hidden />{' '}
          <span className="lvl" data-scale={pressure.color ?? undefined} title={t(`weather.level.pressure.${pressure.key}`)} data-testid="now-pressure">
            <PressureIcon size={16} aria-hidden /> {t('weather.pressure', { hpa: Math.round(current.pressure) })} · {t(`weather.pressureShort.${pressure.key}`)}
          </span>
        </li>
      </ul>
    </section>
  );
}

function relativeAgo(iso: string, locale: string): string {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (minutes < 60) return rtf.format(-minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (hours < 48) return rtf.format(-hours, 'hour');
  return rtf.format(-Math.round(hours / 24), 'day');
}
