import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Droplets, RefreshCw, Snowflake } from 'lucide-react';
import { useSettings } from '@/core/settings/settings';
import { usePlacePicker } from '@/modules/waypoints/PlacePicker';
import { cachedHistory, historyKey, storeHistory } from './cache';
import { addDays, fetchHistory, FIRST_DAY, HistoryError, localToday, type History, type HistoryDay } from './history';
import { SkyIcon, useUnits, WindArrow } from './parts';

/**
 * «Clima histórico»: qué clima hubo en un lugar (el GPS, un waypoint o coordenadas, como en Clima) en una fecha pasada. Trae 7 días alrededor de
 * la fecha: los de hace más de 5 días, del historial de Open-Meteo (reanálisis ERA5) y los más recientes, de su pronóstico (ver history.ts).
 * Lo consultado queda guardado para verlo sin conexión.
 */
const mean = (xs: (number | null)[]): number | null => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

export function HistoryPage() {
  const { t, i18n } = useTranslation();
  const { place, picker } = usePlacePicker();
  const base = useSettings((s) => s.settings.weatherUrl);
  const system = useSettings((s) => s.settings.units);
  const u = useUnits(system, i18n.language);
  const today = useMemo(() => localToday(), []);
  const [date, setDate] = useState(() => addDays(today, -1));
  const [history, setHistory] = useState<History | null>(null);
  /** El día que se mira dentro de lo ya traído (tocar otro día de la lista no vuelve a pedir nada). */
  const [viewDate, setViewDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<HistoryError['code'] | null>(null);

  const lat = place?.lat ?? null;
  const lon = place?.lon ?? null;
  const alt = place?.alt ?? null;
  const key = lat === null || lon === null ? null : historyKey(lat, lon, date);

  const load = useCallback(
    async (force = false) => {
      if (lat === null || lon === null || !key) return;
      setError(null);
      const cached = await cachedHistory(key);
      if (cached) {
        setHistory(cached);
        setViewDate(cached.date);
        // Un día cerrado del historial no cambia: no se vuelve a pedir salvo que se pida a mano o incluya días recientes.
        const recent = cached.end >= addDays(today, -6);
        if (!force && !recent) return;
      } else {
        setHistory(null);
        setViewDate(null);
      }
      if (!navigator.onLine) {
        if (!cached) setError('offline');
        return;
      }
      setLoading(true);
      try {
        const fresh = await fetchHistory(base, lat, lon, date, today, alt);
        await storeHistory(key, fresh);
        setHistory(fresh);
        setViewDate((v) => (v && fresh.days.some((d) => d.date === v) && cached ? v : fresh.date));
      } catch (e) {
        setError(e instanceof HistoryError ? e.code : 'unreachable');
      } finally {
        setLoading(false);
      }
    },
    [key, base, alt, date, today, lat, lon],
  );
  useEffect(() => {
    void load();
  }, [load]);

  const longFmt = new Intl.DateTimeFormat(i18n.language, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const shortFmt = new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const dayAt = (d: string) => new Date(`${d}T12:00:00Z`);
  const shown: HistoryDay | undefined = history?.days.find((d) => d.date === (viewDate ?? history.date)) ?? history?.days[0];
  const quick = [
    { id: 'yesterday', date: addDays(today, -1) },
    { id: 'week', date: addDays(today, -7) },
    { id: 'month', date: addDays(today, -30) },
    { id: 'year', date: addDays(today, -365) },
  ];

  return (
    <div className="stack">
      <h1 className="page-title">{t('modules.weatherHistory.title')}</h1>
      {picker}

      <section className="card stack" aria-labelledby="hist-date-title">
        <h2 id="hist-date-title" className="section-title" style={{ margin: 0 }}>{t('history.dateTitle')}</h2>
        <div className="field">
          <label htmlFor="hist-date">{t('history.date')}</label>
          <input
            id="hist-date"
            className="input"
            type="date"
            min={FIRST_DAY}
            max={today}
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value > today ? today : e.target.value)}
            data-testid="history-date"
          />
        </div>
        <div className="chips" role="group" aria-label={t('history.quick')}>
          {quick.map((q) => (
            <button key={q.id} type="button" className="chip" aria-pressed={date === q.date} onClick={() => setDate(q.date)} data-testid={`history-quick-${q.id}`}>
              {t(`history.quickItem.${q.id}`)}
            </button>
          ))}
        </div>
        <p className="hint" style={{ margin: 0 }}>{t('history.rangeHint')}</p>
      </section>

      {key && (
        <div className="weather-status">
          <span className="hint" data-testid="history-status">
            {loading ? t('weather.loading') : history ? t('history.range', { from: shortFmt.format(dayAt(history.start)), to: shortFmt.format(dayAt(history.end)) }) : null}
          </span>
          <button className="btn" type="button" onClick={() => void load(true)} disabled={loading}>
            <RefreshCw size={18} /> {t('weather.refresh')}
          </button>
        </div>
      )}
      {error && (
        <p className={history ? 'hint' : 'error'} role="status" data-testid="history-error">
          {t(`history.error.${error}`)}
          {history && ` ${t('weather.showingCached')}`}
        </p>
      )}

      {!place ? (
        <p className="empty">{t('sky.needPlace')}</p>
      ) : !history || !shown ? null : (
        <>
          <section className="card stack" aria-labelledby="hist-day-title" data-testid="history-day">
            <h2 id="hist-day-title" className="section-title" style={{ margin: 0 }}>{longFmt.format(dayAt(shown.date))}</h2>
            <p className="hint" style={{ margin: 0 }}>
              {t(shown.source === 'archive' ? 'history.sourceArchive' : 'history.sourceForecast')}
            </p>
            <div className="hist-summary">
              {shown.code !== null && <SkyIcon code={shown.code} size={40} />}
              <p style={{ margin: 0 }} data-testid="history-temps">
                {shown.min !== null && shown.max !== null ? t('history.temps', { min: u.temp(shown.min), max: u.temp(shown.max) }) : t('history.noData')}
              </p>
            </div>
            <ul className="list" data-testid="history-facts">
              <li className="list-row">
                <span className="list-main">
                  <span className="list-title"><Droplets size={14} aria-hidden /> {shown.precipitation !== null && shown.precipitation > 0 ? u.rain(shown.precipitation) : t('weather.noRain')}</span>
                  {shown.snowfall !== null && shown.snowfall > 0 && (
                    <span className="list-sub"><Snowflake size={13} aria-hidden /> {t('history.snow', { value: u.snow(shown.snowfall) })}</span>
                  )}
                </span>
              </li>
              {shown.windMax !== null && (
                <li className="list-row">
                  <span className="list-main">
                    <span className="list-title">
                      {shown.windDirection !== null && <WindArrow from={shown.windDirection} size={14} />} {t('weather.windDayWind', { speed: u.wind(shown.windMax) })}
                      {shown.gustMax !== null && ` · ${t('weather.gusts', { value: u.wind(shown.gustMax) })}`}
                    </span>
                  </span>
                </li>
              )}
              {mean(shown.hours.map((h) => h.pressure)) !== null && (
                <li className="list-row">
                  <span className="list-main">
                    <span className="list-title">{t('history.pressure', { value: Math.round(mean(shown.hours.map((h) => h.pressure))!) })}</span>
                    {mean(shown.hours.map((h) => h.cloudCover)) !== null && <span className="list-sub">{t('history.clouds', { value: Math.round(mean(shown.hours.map((h) => h.cloudCover))!) })}</span>}
                  </span>
                </li>
              )}
            </ul>
          </section>

          {shown.hours.length > 0 && (
            <section className="card stack" aria-labelledby="hist-hours-title">
              <h2 id="hist-hours-title" className="section-title" style={{ margin: 0 }}>{t('history.hours')}</h2>
              <div className="hist-hours" role="table" aria-label={t('history.hours')} data-testid="history-hours">
                <div className="hist-hours-head" role="row">
                  <span role="columnheader">{t('history.hour')}</span>
                  <span role="columnheader">{t('history.temp')}</span>
                  <span role="columnheader">{t('history.rain')}</span>
                  <span role="columnheader">{t('history.wind')}</span>
                </div>
                {shown.hours.map((h) => (
                  <div key={h.time} className="hist-hours-row" role="row" data-testid="history-hour">
                    <span role="cell">{h.time.slice(11, 16)}</span>
                    <span role="cell">{h.temperature !== null ? u.temp(h.temperature) : '—'}</span>
                    <span role="cell">{h.precipitation !== null && h.precipitation > 0 ? u.rain(h.precipitation) : '—'}</span>
                    <span role="cell">
                      {h.windSpeed !== null ? (
                        <>
                          {h.windDirection !== null && <WindArrow from={h.windDirection} size={12} />} {u.windValue(h.windSpeed)}
                          {h.windGusts !== null && <span className="hint"> ({u.windValue(h.windGusts)})</span>}
                        </>
                      ) : (
                        '—'
                      )}
                    </span>
                  </div>
                ))}
              </div>
              <p className="hint" style={{ margin: 0 }}>{t('history.windUnit', { unit: u.windUnit })}</p>
            </section>
          )}

          <section className="card stack" aria-labelledby="hist-days-title">
            <h2 id="hist-days-title" className="section-title" style={{ margin: 0 }}>{t('history.days')}</h2>
            <ul className="list" data-testid="history-days">
              {history.days.map((d) => (
                <li key={d.date} className="list-row">
                  <button className="list-main zone-go" type="button" aria-pressed={d.date === shown.date} onClick={() => setViewDate(d.date)} data-testid={`history-day-${d.date}`}>
                    <span className="list-title">
                      {shortFmt.format(dayAt(d.date))}
                      {d.code !== null && <> <SkyIcon code={d.code} size={18} /></>}
                    </span>
                    <span className="list-sub">
                      {d.min !== null && d.max !== null ? `${u.temp(d.min)} / ${u.temp(d.max)}` : '—'}
                      {' · '}
                      {d.precipitation !== null && d.precipitation > 0 ? u.rain(d.precipitation) : t('weather.noRain')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <p className="hint" data-testid="history-note">
            {t('history.note', { elevation: history.elevation !== null ? u.altitude(history.elevation) : '—' })}
          </p>
        </>
      )}
    </div>
  );
}
