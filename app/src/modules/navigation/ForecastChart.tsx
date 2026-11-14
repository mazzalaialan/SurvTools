import type { StationForecast } from './forecast';

const DAY_MS = 86_400_000;

/**
 * Pronóstico de altura de una estación: línea principal, banda (de menos a más), líneas punteadas de los niveles de la estación
 * (aguas bajas, alerta, evacuación) y la marca de «ahora». Sin dependencias: un SVG.
 */
export function ForecastChart({
  forecast,
  levels,
  now,
  label,
  locale,
  testId = 'forecast-chart',
}: {
  forecast: StationForecast;
  levels: { alert: number | null; evac: number | null; low: number | null };
  now: number;
  label: string;
  locale: string;
  testId?: string;
}) {
  const W = 600;
  const H = 190;
  const pad = { l: 40, r: 8, t: 10, b: 22 };
  const pts = forecast.points;
  const t0 = pts[0]!.t;
  const t1 = pts[pts.length - 1]!.t;
  const values = pts.flatMap((p) => [p.main, p.lo ?? p.main, p.hi ?? p.main]);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  // Un nivel de la estación entra al gráfico si está cerca de lo pronosticado (a menos de medio rango): así se ve cuánto falta.
  const span = Math.max(hi - lo, 0.4);
  const near = [levels.low, levels.alert, levels.evac].filter((v): v is number => v !== null && v >= lo - span * 0.6 && v <= hi + span * 0.6);
  lo = Math.min(lo, ...near);
  hi = Math.max(hi, ...near);
  const margin = (hi - lo) * 0.08 || 0.1;
  lo -= margin;
  hi += margin;
  const x = (ms: number) => pad.l + ((ms - t0) / (t1 - t0 || 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo || 1)) * (H - pad.t - pad.b);
  const line = (sel: (p: StationForecast['points'][number]) => number) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(sel(p)).toFixed(1)}`).join('');
  const hasBand = pts.some((p) => p.lo !== null && p.hi !== null);
  const band = hasBand
    ? `${pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.hi ?? p.main).toFixed(1)}`).join('')}${[...pts].reverse().map((p) => `L${x(p.t).toFixed(1)} ${y(p.lo ?? p.main).toFixed(1)}`).join('')}Z`
    : '';
  const days: number[] = [];
  const first = new Date(t0);
  first.setHours(24, 0, 0, 0);
  for (let d = first.getTime(); d <= t1; d += DAY_MS) days.push(d);
  // Hasta ~8 marcas en el eje: un pronóstico de días marca cada día; uno de semanas o meses, cada tantos días, con el mes.
  const every = Math.max(1, Math.ceil(days.length / 8));
  const long = (t1 - t0) / DAY_MS > 14;
  const fmt = (v: number) => v.toFixed(1);
  const marks: { v: number; cls: string }[] = [
    ...(levels.evac !== null && near.includes(levels.evac) ? [{ v: levels.evac, cls: 'fc-evac' }] : []),
    ...(levels.alert !== null && near.includes(levels.alert) ? [{ v: levels.alert, cls: 'fc-alert' }] : []),
    ...(levels.low !== null && near.includes(levels.low) ? [{ v: levels.low, cls: 'fc-low' }] : []),
  ];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="fc-chart" role="img" aria-label={label} data-testid={testId}>
      {[lo + margin, hi - margin].map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="tide-grid" />
          <text x={pad.l - 4} y={y(v) + 4} textAnchor="end" className="tide-axis">
            {fmt(v)}
          </text>
        </g>
      ))}
      {days.map((d, i) =>
        i % every ? null : (
          <g key={d}>
            <line x1={x(d)} x2={x(d)} y1={pad.t} y2={H - pad.b} className="tide-day" />
            <text x={x(d) + 3} y={H - 6} className="tide-axis">
              {new Date(d).toLocaleDateString(locale, long ? { day: 'numeric', month: 'short' } : { weekday: 'short', day: 'numeric' })}
            </text>
          </g>
        ),
      )}
      {marks.map((m) => (
        <line key={m.cls} x1={pad.l} x2={W - pad.r} y1={y(m.v)} y2={y(m.v)} className={`fc-level ${m.cls}`} data-testid={`${testId}-${m.cls}`} />
      ))}
      {hasBand && <path d={band} className="fc-band" data-testid={`${testId}-band`} />}
      <path d={line((p) => p.main)} className="fc-line" />
      {now >= t0 && now <= t1 && <line x1={x(now)} x2={x(now)} y1={pad.t} y2={H - pad.b} className="tide-now" />}
    </svg>
  );
}
