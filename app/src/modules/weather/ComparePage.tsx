import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import { useSettings } from '@/core/settings/settings';
import { usePlacePicker } from '@/modules/waypoints/PlacePicker';
import { cachedCompare, placeKey, storeCompare } from './cache';
import { agreementOf, cellColor, compareKey, sourceOf, WET_MM, compareDays, consensus, daySummaries, fetchCompare, gridSteps, gridValue, MODELS, VARS, widestDay, type Compare, type CompareVar } from './compare';
import { WeatherError } from './forecast';
import { toFahrenheit, kmhToMph, mmToInch } from './forecast';
import { useUnits, WindArrow, type Units } from './parts';

/**
 * «Comparación de pronósticos»: qué dice cada modelo meteorológico para el mismo lugar (el GPS, un waypoint o coordenadas, como en Clima).
 * El Clima común usa la mezcla que arma Open-Meteo; acá se ven los modelos por separado para saber si coinciden o discrepan.
 * Lo consultado queda guardado para verlo sin conexión.
 */
const STALE_MS = 30 * 60_000;

/** Colores y trazos distintos por modelo (el trazo ayuda a quien no distingue colores). */
const STYLE: Record<string, { color: string; dash?: string }> = {
  ecmwf_ifs025: { color: '#2563eb' },
  gfs_global: { color: '#dc2626', dash: '6 3' },
  icon_global: { color: '#16a34a', dash: '2 3' },
  meteofrance_arpege_world: { color: '#d97706', dash: '8 3 2 3' },
  ukmo_global_deterministic_10km: { color: '#9333ea', dash: '10 4' },
  jma_gsm: { color: '#0891b2', dash: '3 3' },
};

const W = 600;
const H = 220;
const PAD = { l: 44, r: 10, t: 10, b: 26 };

/** De cada modelo, los valores por hora que se dibujan: la lluvia, acumulada (así se ve quién anticipa más agua). */
function plotted(c: Compare, id: string, v: CompareVar): (number | null)[] | null {
  const s = c.series[id]?.[sourceOf(v)];
  if (!s) return null;
  if (v !== 'precipitation') return s;
  let acc = 0;
  return s.map((x) => (x === null ? null : (acc += x)));
}

function format(v: CompareVar, x: number, u: Units, locale: string): string {
  if (v === 'temperature_2m' || v === 'temperature_min') return u.temp(x);
  if (v === 'precipitation') return u.rain(x);
  if (v === 'wind_speed_10m') return u.wind(x);
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(x)} %`;
}

const formatDay = (v: CompareVar, x: number, u: Units, locale: string): string => format(v, x, u, locale);

function Chart({ c, v, enabled, u, locale, label }: { c: Compare; v: CompareVar; enabled: string[]; u: Units; locale: string; label: string }) {
  const n = c.time.length;
  const lines = enabled.flatMap((id) => {
    const s = plotted(c, id, v);
    return s ? [{ id, s }] : [];
  });
  const all = lines.flatMap((l) => l.s.filter((x): x is number => x !== null));
  if (!all.length) return null;
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  if (v === 'cloud_cover' || v === 'relative_humidity_2m') [lo, hi] = [0, 100];
  if (v === 'precipitation') lo = 0;
  if (hi - lo < 1e-6) hi = lo + 1;
  const x = (i: number) => PAD.l + (i / Math.max(1, n - 1)) * (W - PAD.l - PAD.r);
  const y = (val: number) => PAD.t + (1 - (val - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const ticks = [0, 1, 2, 3].map((k) => lo + ((hi - lo) * k) / 3);
  const dayStarts = c.time.flatMap((t, i) => (t.slice(11, 13) === '00' ? [i] : []));
  const dayFmt = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="cmp-chart" role="img" aria-label={label} data-testid="compare-chart">
      {ticks.map((tv) => (
        <g key={tv}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(tv)} y2={y(tv)} stroke="currentColor" strokeOpacity={0.12} />
          <text x={PAD.l - 6} y={y(tv) + 4} textAnchor="end" fontSize={11} fill="currentColor" fillOpacity={0.7}>
            {format(v, tv, u, locale)}
          </text>
        </g>
      ))}
      {dayStarts.map((i) => (
        <g key={i}>
          <line x1={x(i)} x2={x(i)} y1={PAD.t} y2={H - PAD.b} stroke="currentColor" strokeOpacity={0.15} />
          <text x={x(i) + 3} y={H - 8} fontSize={11} fill="currentColor" fillOpacity={0.7}>
            {dayFmt.format(new Date(`${c.time[i]!.slice(0, 10)}T12:00:00Z`))}
          </text>
        </g>
      ))}
      {lines.map(({ id, s }) => {
        // Un tramo por cada corrida de valores (el modelo que no llega a los últimos días corta la línea).
        const parts: string[] = [];
        let cur = '';
        s.forEach((val, i) => {
          if (val === null) {
            if (cur) parts.push(cur);
            cur = '';
          } else cur += `${cur ? 'L' : 'M'}${x(i).toFixed(1)},${y(val).toFixed(1)}`;
        });
        if (cur) parts.push(cur);
        const st = STYLE[id]!;
        return <path key={id} d={parts.join('')} fill="none" stroke={st.color} strokeWidth={2} strokeDasharray={st.dash} strokeLinejoin="round" data-testid={`compare-line-${id}`} />;
      })}
    </svg>
  );
}

// ---------- Resumen al estilo Windguru ----------

const BLOCKS: CompareVar[] = ['temperature_2m', 'precipitation', 'wind_speed_10m', 'cloud_cover'];

/** El número que va en la celda, en la unidad elegida (la unidad se dice en el título del bloque). */
function cellText(v: CompareVar, x: number, imperial: boolean): string {
  if (v === 'temperature_2m' || v === 'temperature_min') return String(Math.round(imperial ? toFahrenheit(x) : x));
  if (v === 'wind_speed_10m') return String(Math.round(imperial ? kmhToMph(x) : x));
  if (v === 'precipitation') {
    const m = imperial ? mmToInch(x) : x;
    if (x < 0.05) return '';
    return imperial ? m.toFixed(2) : m < 10 ? m.toFixed(1) : String(Math.round(m));
  }
  return String(Math.round(x));
}

function unitOf(v: CompareVar, u: Units, imperial: boolean): string {
  if (v === 'temperature_2m' || v === 'temperature_min') return imperial ? '°F' : '°C';
  if (v === 'precipitation') return imperial ? 'in / 3 h' : 'mm / 3 h';
  if (v === 'wind_speed_10m') return u.windUnit;
  return '%';
}

function Grid({ c, v, imperial, u, locale }: { c: Compare; v: CompareVar; imperial: boolean; u: Units; locale: string }) {
  const { t } = useTranslation();
  const steps = gridSteps(c);
  const days = [...new Set(steps.map((i) => c.time[i]!.slice(0, 10)))].map((date) => ({ date, count: steps.filter((i) => c.time[i]!.startsWith(date)).length }));
  const dayFmt = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
  const rows = [{ id: '_median', label: t('compare.consensus') }, ...MODELS.filter((m) => c.series[m.id]?.[sourceOf(v)]).map((m) => ({ id: m.id, label: m.label }))];
  const cell = (id: string, i: number) => {
    const x = id === '_median' ? consensus(c, v, i) : gridValue(c, id, v, i);
    if (x === null) return <td key={i} className="cmp-cell cmp-cell-empty">·</td>;
    const col = cellColor(v, x);
    const dir = v === 'wind_speed_10m' ? (id === '_median' ? consensus(c, 'wind_direction_10m', i) : gridValue(c, id, 'wind_direction_10m', i)) : null;
    return (
      <td key={i} className="cmp-cell" style={{ background: col.bg, color: col.fg }}>
        {cellText(v, x, imperial)}
        {dir !== null && <WindArrow from={dir} size={10} />}
      </td>
    );
  };
  return (
    <section className="card stack" aria-labelledby={`cmp-grid-${v}`}>
      <h2 id={`cmp-grid-${v}`} className="section-title" style={{ margin: 0 }}>
        {t(v === 'temperature_2m' ? 'compare.vars.temperature' : `compare.vars.${v}`)} <span className="hint">({unitOf(v, u, imperial)})</span>
      </h2>
      <div className="cmp-scroll">
        <table className="cmp-grid" data-testid={`compare-grid-${v}`}>
          <thead>
            <tr>
              <th scope="col" className="cmp-model" />
              {days.map((d) => (
                <th key={d.date} scope="colgroup" colSpan={d.count} className="cmp-day">{dayFmt.format(new Date(`${d.date}T12:00:00Z`))}</th>
              ))}
            </tr>
            <tr>
              <th scope="col" className="cmp-model" />
              {steps.map((i) => (
                <th key={i} scope="col" className="cmp-hour">{c.time[i]!.slice(11, 13)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.id === '_median' ? 'cmp-median' : undefined}>
                <th scope="row" className="cmp-model">{r.label}</th>
                {steps.map((i) => cell(r.id, i))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SummaryTab({ c, u, imperial, locale }: { c: Compare; u: Units; imperial: boolean; locale: string }) {
  const { t } = useTranslation();
  const days = useMemo(() => daySummaries(c), [c]);
  const dayFmt = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
  return (
    <>
      <section className="card stack" aria-labelledby="cmp-read-title">
        <h2 id="cmp-read-title" className="section-title" style={{ margin: 0 }}>{t('compare.readTitle')}</h2>
        <ul className="cmp-read" data-testid="compare-read">
          {days.map((d) => {
            const wet = d.models > 0 ? (d.rainModels === 0 ? 'dry' : d.rainModels === d.models ? 'wet' : d.rainModels * 2 >= d.models ? 'likely' : 'maybe') : null;
            return (
              <li key={d.date} data-testid={`compare-read-${d.date}`}>
                <strong>{dayFmt.format(new Date(`${d.date}T12:00:00Z`))}</strong>
                <span>
                  {d.tempMax !== null && d.tempMin !== null ? t('compare.readTemp', { min: u.temp(d.tempMin), max: u.temp(d.tempMax) }) : null}
                  {d.windMax !== null && ` · ${t('compare.readWind', { wind: u.wind(d.windMax) })}`}
                </span>
                {d.models < d.total && <span className="hint">{t('compare.fewModels', { n: d.models, total: d.total })}</span>}
                {wet && (
                  <span className={`cmp-rain cmp-rain-${wet}`}>
                    {t(`compare.rain.${wet}`, { n: d.rainModels, total: d.models })}
                    {wet !== 'dry' && d.rain !== null && d.rain >= WET_MM && ` · ${t('compare.readRain', { rain: u.rain(d.rain) })}`}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        <p className="hint" style={{ margin: 0 }}>{t('compare.readHint')}</p>
      </section>
      {BLOCKS.map((v) => (
        <Grid key={v} c={c} v={v} imperial={imperial} u={u} locale={locale} />
      ))}
      <p className="hint" style={{ margin: 0 }}>{t('compare.gridHint')}</p>
    </>
  );
}

export function ComparePage() {
  const { t, i18n } = useTranslation();
  const { place, picker } = usePlacePicker();
  const base = useSettings((s) => s.settings.weatherUrl);
  const system = useSettings((s) => s.settings.units);
  const u = useUnits(system, i18n.language);
  const imperial = system === 'imperial';
  const [data, setData] = useState<Compare | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<WeatherError['code'] | null>(null);
  const [v, setV] = useState<CompareVar>('temperature_2m');
  const [off, setOff] = useState<string[]>([]);
  const [tab, setTab] = useState<'summary' | 'detail'>('summary');

  const lat = place?.lat ?? null;
  const lon = place?.lon ?? null;
  const alt = place?.alt ?? null;
  const key = lat === null || lon === null ? null : compareKey(placeKey(lat, lon));
  const where = useRef({ lat, lon, alt });
  /** Número de la última consulta: una respuesta que llega tarde (de otro lugar) no pisa a la actual. */
  const requestNo = useRef(0);
  where.current = { lat, lon, alt };

  const load = useCallback(
    async (force = false) => {
      const { lat, lon, alt } = where.current;
      if (lat === null || lon === null || !key) return;
      const mine = ++requestNo.current;
      setError(null);
      const cached = await cachedCompare(key);
      if (mine !== requestNo.current) return;
      if (cached) {
        setData(cached);
        if (!force && Date.now() - Date.parse(cached.fetchedAt) < STALE_MS) {
          setLoading(false);
          return;
        }
      } else setData(null);
      if (!navigator.onLine) {
        if (!cached) setError('offline');
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const fresh = await fetchCompare(base, lat, lon, alt);
        await storeCompare(key, fresh);
        if (mine === requestNo.current) setData(fresh);
      } catch (e) {
        if (mine === requestNo.current) setError(e instanceof WeatherError ? e.code : 'unreachable');
      } finally {
        if (mine === requestNo.current) setLoading(false);
      }
    },
    [key, base],
  );
  useEffect(() => {
    void load();
  }, [load]);

  const present = useMemo(() => (data ? MODELS.filter((m) => data.series[m.id]?.[sourceOf(v)]) : []), [data, v]);
  const enabled = present.map((m) => m.id).filter((id) => !off.includes(id));
  /** La temperatura compara las máximas y las mínimas de cada día; lo demás, un solo valor por día. */
  const kinds: CompareVar[] = v === 'temperature_2m' ? ['temperature_2m', 'temperature_min'] : [v];
  const daysBy = useMemo(() => (data ? kinds.map((k) => compareDays(data, k, enabled)) : []), [data, v, enabled.join(',')]);
  const rows = daysBy[0] ?? [];
  const dayFmt = new Intl.DateTimeFormat(i18n.language, { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const dayAt = (d: string) => new Date(`${d}T12:00:00Z`);

  return (
    <div className="stack">
      <h1 className="page-title">{t('modules.weatherCompare.title')}</h1>
      {picker}
      <p className="hint" style={{ margin: 0 }}>{t('compare.intro')}</p>

      {key && (
        <div className="weather-status">
          <span className="hint" data-testid="compare-status">{loading ? t('weather.loading') : data ? t('compare.updated', { time: new Date(data.fetchedAt).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' }) }) : null}</span>
          <button className="btn" type="button" onClick={() => void load(true)} disabled={loading}>
            <RefreshCw size={18} /> {t('weather.refresh')}
          </button>
        </div>
      )}
      {error && (
        <p className={data ? 'hint' : 'error'} role="status" data-testid="compare-error">
          {t(`compare.error.${error}`)}
          {data && ` ${t('weather.showingCached')}`}
        </p>
      )}

      {data && (
        <div className="chips" role="group" aria-label={t('compare.tabsLabel')}>
          {(['summary', 'detail'] as const).map((k) => (
            <button key={k} type="button" className="chip" aria-pressed={tab === k} onClick={() => setTab(k)} data-testid={`compare-tab-${k}`}>
              {t(`compare.tabs.${k}`)}
            </button>
          ))}
        </div>
      )}
      {data && tab === 'summary' && <SummaryTab c={data} u={u} imperial={imperial} locale={i18n.language} />}

      {data && tab === 'detail' && (
        <>
          <div className="chips" role="group" aria-label={t('compare.variable')}>
            {VARS.map((x) => (
              <button key={x} type="button" className="chip" aria-pressed={v === x} onClick={() => setV(x)} data-testid={`compare-var-${x}`}>
                {t(`compare.vars.${x}`)}
              </button>
            ))}
          </div>

          <section className="card stack" aria-label={t('compare.models')}>
            <div className="chips" role="group" aria-label={t('compare.models')}>
              {present.map((m) => {
                const st = STYLE[m.id]!;
                const on = !off.includes(m.id);
                return (
                  <button key={m.id} type="button" className="chip" aria-pressed={on} onClick={() => setOff((o) => (on ? [...o, m.id] : o.filter((i) => i !== m.id)))} data-testid={`compare-model-${m.id}`} title={m.by}>
                    <svg width="22" height="8" aria-hidden="true"><line x1="0" x2="22" y1="4" y2="4" stroke={st.color} strokeWidth={3} strokeDasharray={st.dash} /></svg> {m.label}
                  </button>
                );
              })}
            </div>
            <Chart c={data} v={v} enabled={enabled} u={u} locale={i18n.language} label={t('compare.chartLabel', { variable: t(`compare.vars.${v}`) })} />
            {v === 'precipitation' && <p className="hint" style={{ margin: 0 }}>{t('compare.accumulated')}</p>}
          </section>

          {kinds.map((k, i) => {
            const worst = widestDay(daysBy[i] ?? []);
            const level = worst ? agreementOf(k, worst.spread) : null;
            if (!worst || !level || !worst.core) return null;
            return (
              <p key={k} className={level === 'low' ? 'error' : 'hint'} data-testid={`compare-summary-${k}`} style={{ margin: 0 }}>
                {v === 'temperature_2m' && <strong>{t(`compare.kind.${k}`)}: </strong>}
                {t(`compare.summary.${level}`, { day: dayFmt.format(dayAt(worst.date)), from: formatDay(k, worst.core[0], u, i18n.language), to: formatDay(k, worst.core[1], u, i18n.language) })}
                {worst.outliers.length > 0 &&
                  ` ${t('compare.outliers', { models: worst.outliers.map((id) => MODELS.find((m) => m.id === id)?.label).join(', '), values: worst.outliers.map((id) => formatDay(k, worst.byModel[id]!, u, i18n.language)).join(', ') })}`}
              </p>
            );
          })}

          <section className="card stack" aria-labelledby="cmp-days-title">
            <h2 id="cmp-days-title" className="section-title" style={{ margin: 0 }}>{t('compare.byDay')}</h2>
            <div className="cmp-scroll">
              <table className="cmp-table" data-testid="compare-table">
                <thead>
                  <tr>
                    <th scope="col">{t('compare.day')}</th>
                    {present.filter((m) => !off.includes(m.id)).map((m) => (
                      <th key={m.id} scope="col" style={{ color: STYLE[m.id]!.color }}>{m.label}</th>
                    ))}
                    <th scope="col">{t('compare.difference')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d, r) => (
                    <tr key={d.date}>
                      <th scope="row">{new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: 'numeric', timeZone: 'UTC' }).format(dayAt(d.date))}</th>
                      {present.filter((m) => !off.includes(m.id)).map((m) => {
                        const vals = daysBy.map((ds) => ds[r]!.byModel[m.id]);
                        // Temperatura: mínima / máxima; si falta alguna, el modelo no llega a ese día.
                        if (vals.some((x) => x === null || x === undefined)) return <td key={m.id} className="cmp-na">–</td>;
                        const text = v === 'temperature_2m' ? `${format('temperature_min', vals[1]!, u, i18n.language)} / ${format(v, vals[0]!, u, i18n.language)}` : format(v, vals[0]!, u, i18n.language);
                        return <td key={m.id}>{text}</td>;
                      })}
                      <td>
                        {kinds.map((k, i) => {
                          const level = agreementOf(k, daysBy[i]![r]!.spread);
                          return (
                            <div key={k} className={`cmp-agree cmp-agree-${level ?? 'none'}`}>
                              {v === 'temperature_2m' && `${t(`compare.kindShort.${k}`)}: `}
                              {level ? t(`compare.agree.${level}`) : '–'}
                            </div>
                          );
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="hint" style={{ margin: 0 }}>{t(`compare.dayHint.${v}`)}</p>
          </section>

          <section className="card stack">
            <h2 className="section-title" style={{ margin: 0 }}>{t('compare.aboutTitle')}</h2>
            <ul className="hint" style={{ margin: 0, paddingLeft: '1.2rem' }}>
              {MODELS.map((m) => (
                <li key={m.id}>{t('compare.modelLine', { label: m.label, by: m.by, days: m.days })}</li>
              ))}
            </ul>
            <p className="hint" style={{ margin: 0 }}>{t('compare.note', { elevation: data.elevation === null ? '–' : imperial ? `${Math.round(data.elevation * 3.28084)} ft` : `${Math.round(data.elevation)} m` })}</p>
          </section>
        </>
      )}
    </div>
  );
}
