import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowUp,
  ChevronRight,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  Eye,
  Mountain,
  Snowflake,
  Sun,
  Thermometer,
  Wind,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { cardinalOf } from '@/core/geo/geo';
import type { UnitSystem } from '@/core/units/units';
import { Dialog } from '@/ui/Dialog';
import {
  FOG_VISIBILITY_M,
  kmhToMph,
  metersToFeet,
  metersToMiles,
  mmToInch,
  periodSummaries,
  skyOf,
  stormRisk,
  toFahrenheit,
  type Forecast,
  type PeriodSummary,
  type Sky,
} from './forecast';
import { humidityLevel, tempLevel, windLevel } from './levels';

/**
 * Piezas del pronóstico. Cada dato lleva un ícono o una sigla (ST, HR, r.)
 * para que se entienda qué es sin leer la leyenda.
 */

const SKY_ICON: Record<Sky, LucideIcon> = {
  clear: Sun,
  partly: CloudSun,
  cloudy: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
};

export function SkyIcon({ code, size = 24 }: { code: number; size?: number }) {
  const { t } = useTranslation();
  const sky = skyOf(code);
  const Icon = SKY_ICON[sky];
  return <Icon size={size} aria-label={t(`weather.sky.${sky}`)} role="img" className="sky-icon" />;
}

export function useUnits(system: UnitSystem, locale: string) {
  const n0 = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const n1 = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const n2 = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const imperial = system === 'imperial';
  return {
    temp: (c: number) => `${n0.format(imperial ? toFahrenheit(c) : c)}°`,
    wind: (kmh: number) => (imperial ? `${n0.format(kmhToMph(kmh))} mph` : `${n0.format(kmh)} km/h`),
    /** Solo el número (la unidad va en la leyenda, para que entre en cada hora). */
    windValue: (kmh: number) => n0.format(imperial ? kmhToMph(kmh) : kmh),
    windUnit: imperial ? 'mph' : 'km/h',
    // En pulgadas un milímetro son 0,04: con un decimal se veía «0 in».
    rain: (mm: number) => (imperial ? `${n2.format(mmToInch(mm))} in` : `${n1.format(mm)} mm`),
    snow: (cm: number) => (imperial ? `${n1.format(mmToInch(cm * 10))} in` : `${n1.format(cm)} cm`),
    visibility: (m: number) =>
      imperial ? `${n1.format(metersToMiles(m))} mi` : m < 1000 ? `${n0.format(Math.round(m / 50) * 50)} m` : `${n0.format(m / 1000)} km`,
    altitude: (m: number) => (imperial ? `${n0.format(Math.round(metersToFeet(m) / 100) * 100)} ft` : `${n0.format(Math.round(m / 50) * 50)} m`),
  };
}

export type Units = ReturnType<typeof useUnits>;

/** Flecha hacia donde sopla el viento (el dato viene como "de dónde viene"). */
export function WindArrow({ from, size = 16 }: { from: number; size?: number }) {
  const { t } = useTranslation();
  return (
    <ArrowUp
      size={size}
      className="wind-arrow"
      style={{ transform: `rotate(${(from + 180) % 360}deg)` }}
      role="img"
      aria-label={t('weather.windFrom', { dir: t(`geo.cardinal.${cardinalOf(from)}`) })}
    />
  );
}

const LEVELS = { temp: tempLevel, wind: windLevel, humidity: humidityLevel };

/**
 * Valor con el color de su nivel (`kind` dice qué escala; las ráfagas usan la del viento).
 * Lo normal queda sin color; si hay color, el nombre del nivel va en el tooltip y para el lector.
 */
export function Lvl({
  kind,
  value,
  children,
  className,
  testId,
}: {
  kind: keyof typeof LEVELS;
  value: number;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  const { t } = useTranslation();
  const level = LEVELS[kind](value);
  const label = t(`weather.level.${kind}.${level.key}`);
  return (
    <span className={className ? `lvl ${className}` : 'lvl'} data-scale={level.color ?? undefined} title={label} data-testid={testId}>
      {children}
      {level.color !== null && <span className="sr-only"> ({label})</span>}
    </span>
  );
}

type Hour = Forecast['hourly'][number];

/** Hora en la tira de las próximas 24 h: lo esencial. */
export function HourStripItem({ h, u }: { h: Hour; u: Units }) {
  const { t } = useTranslation();
  return (
    <li data-testid="hour">
      <span className="hint">{h.time.slice(11, 16)}</span>
      <SkyIcon code={h.code} />
      <strong>
        <Lvl kind="temp" value={h.temperature}>{u.temp(h.temperature)}</Lvl>
      </strong>
      {/* Todas las columnas tienen las mismas filas: si no hay dato va "–", para que el viento de una hora
          quede a la misma altura que el de otra con lluvia. */}
      {h.apparent !== null ? (
        <Lvl kind="temp" value={h.apparent} className="hour-meta">
          {t('weather.feelsShort', { temp: u.temp(h.apparent) })}
        </Lvl>
      ) : (
        <Empty />
      )}
      <RainChance h={h} />
      {h.precipitation !== null && h.precipitation > 0 ? (
        <span className="hour-meta hour-wet">
          <CloudRain size={12} aria-hidden /> {u.rain(h.precipitation)}
        </span>
      ) : (
        <Empty />
      )}
      <WindValue h={h} u={u} />
      {h.windGusts !== null ? (
        <Lvl kind="wind" value={h.windGusts} className="hint hour-gust">
          {t('weather.gustShort', { value: u.windValue(h.windGusts) })}
        </Lvl>
      ) : (
        <Empty />
      )}
    </li>
  );
}

function Empty() {
  return (
    <span className="hour-meta hour-empty" aria-hidden>
      –
    </span>
  );
}

function RainChance({ h }: { h: Hour }) {
  const { t } = useTranslation();
  return (
    <span className="hour-rain" data-wet={(h.precipProbability ?? 0) > 0} aria-label={t('weather.rainChance', { pct: h.precipProbability ?? 0 })}>
      <Droplets size={13} aria-hidden />
      {h.precipProbability ?? 0}%
    </span>
  );
}

function WindValue({ h, u }: { h: Hour; u: Units }) {
  const { t } = useTranslation();
  return (
    <span
      className="hour-wind lvl"
      data-scale={windLevel(h.windSpeed).color ?? undefined}
      aria-label={t('weather.windAria', { speed: u.windValue(h.windSpeed), gusts: h.windGusts === null ? '—' : u.windValue(h.windGusts), unit: u.windUnit })}
    >
      {h.windDirection !== null && <WindArrow from={h.windDirection} size={14} />}
      {u.windValue(h.windSpeed)}
    </span>
  );
}

/** Una hora con todos los datos (detalle de un día). */
function HourDetailRow({ h, u }: { h: Hour; u: Units }) {
  const { t } = useTranslation();
  const fog = h.visibility !== null && h.visibility < FOG_VISIBILITY_M;
  const risk = h.cape === null ? null : stormRisk(h.cape);
  return (
    <li className="hour-row" data-testid="hour-detail">
      <span className="hour-row-time">{h.time.slice(11, 16)}</span>
      <SkyIcon code={h.code} size={26} />
      <div className="hour-row-facts">
        <span className="fact">
          <Thermometer size={14} aria-hidden />{' '}
          <strong>
            <Lvl kind="temp" value={h.temperature}>{u.temp(h.temperature)}</Lvl>
          </strong>
          {h.apparent !== null && (
            <>
              {' · '}
              <Lvl kind="temp" value={h.apparent}>{t('weather.feelsShort', { temp: u.temp(h.apparent) })}</Lvl>
            </>
          )}
        </span>
        <span className="fact">
          <RainChance h={h} />
          {h.precipitation !== null && h.precipitation > 0 && <> · {u.rain(h.precipitation)}</>}
        </span>
        {h.snowfall !== null && h.snowfall > 0 && (
          <span className="fact" aria-label={t('weather.snowAria', { value: u.snow(h.snowfall) })}>
            <Snowflake size={14} aria-hidden /> {u.snow(h.snowfall)}
          </span>
        )}
        <span className="fact">
          <Wind size={14} aria-hidden /> <WindValue h={h} u={u} /> {u.windUnit}
          {h.windGusts !== null && (
            <>
              {' · '}
              <Lvl kind="wind" value={h.windGusts}>{t('weather.gustShort', { value: u.windValue(h.windGusts) })}</Lvl>
            </>
          )}
        </span>
        {h.cloudCover !== null && (
          <span className="fact" aria-label={t('weather.cloudAria', { pct: Math.round(h.cloudCover) })}>
            <Cloud size={14} aria-hidden /> {Math.round(h.cloudCover)}%
          </span>
        )}
        {h.visibility !== null && (
          <span className="fact" data-fog={fog} aria-label={t('weather.visibilityAria', { value: u.visibility(h.visibility) })}>
            <Eye size={14} aria-hidden /> {u.visibility(h.visibility)}
            {fog && <> · {t('weather.fog')}</>}
          </span>
        )}
        {h.humidity !== null && (
          <Lvl kind="humidity" value={h.humidity} className="fact">
            {t('weather.humidityShort', { pct: Math.round(h.humidity) })}
          </Lvl>
        )}
        {risk && (
          <span className="fact" data-risk={risk} aria-label={t('weather.stormAria', { risk: t(`weather.stormRisk.${risk}`) })}>
            <Zap size={14} aria-hidden /> {t(`weather.stormRisk.${risk}`)}
          </span>
        )}
        {h.freezingLevel !== null && (
          <span className="fact" aria-label={t('weather.freezingAria', { value: u.altitude(h.freezingLevel) })}>
            <Mountain size={14} aria-hidden /> {t('weather.freezingShort', { value: u.altitude(h.freezingLevel) })}
          </span>
        )}
      </div>
    </li>
  );
}

/** Leyenda de íconos y siglas del detalle por hora. */
function Legend({ u }: { u: Units }) {
  const { t } = useTranslation();
  const items: [LucideIcon | null, string][] = [
    [Thermometer, t('weather.legend.temp')],
    [Droplets, t('weather.legend.rain')],
    [Snowflake, t('weather.legend.snow')],
    [Wind, t('weather.legend.wind', { unit: u.windUnit })],
    [Cloud, t('weather.legend.cloud')],
    [Eye, t('weather.legend.visibility')],
    [null, t('weather.legend.humidity')],
    [Zap, t('weather.legend.storm')],
    [Mountain, t('weather.legend.freezing')],
  ];
  return (
    <details className="weather-legend">
      <summary>{t('weather.legend.title')}</summary>
      <ul>
        {items.map(([Icon, text]) => (
          <li key={text}>
            {Icon ? <Icon size={14} aria-hidden /> : null} {text}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Detalle hora por hora de un día. */
export function DayHoursDialog({ title, hours, u, onClose }: { title: string; hours: Hour[]; u: Units; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Dialog title={title} onClose={onClose}>
      <Legend u={u} />
      {hours.length === 0 ? (
        <p className="hint">{t('weather.noHours')}</p>
      ) : (
        <ol className="hour-rows">
          {hours.map((h) => (
            <HourDetailRow key={h.time} h={h} u={u} />
          ))}
        </ol>
      )}
    </Dialog>
  );
}

/** Un período del día (madrugada, mañana, tarde, noche) resumido. */
function PeriodRow({ p, u }: { p: PeriodSummary; u: Units }) {
  const { t } = useTranslation();
  const fog = p.visibility !== null && p.visibility < FOG_VISIBILITY_M;
  const risk = p.cape === null ? null : stormRisk(p.cape);
  return (
    <li className="hour-row period-row" data-testid="period">
      <span className="hour-row-time">{t(`weather.period.${p.period}`)}</span>
      <SkyIcon code={p.code} size={26} />
      <div className="hour-row-facts">
        <span className="fact">
          <Thermometer size={14} aria-hidden />{' '}
          <strong>
            <Lvl kind="temp" value={p.min}>{u.temp(p.min)}</Lvl> / <Lvl kind="temp" value={p.max}>{u.temp(p.max)}</Lvl>
          </strong>
        </span>
        <span className="fact" aria-label={t('weather.rainChance', { pct: p.precipProbability ?? 0 })}>
          <Droplets size={14} aria-hidden /> {p.precipProbability ?? 0}%{p.precipitation > 0 && <> · {u.rain(p.precipitation)}</>}
        </span>
        {p.snowfall > 0 && (
          <span className="fact" aria-label={t('weather.snowAria', { value: u.snow(p.snowfall) })}>
            <Snowflake size={14} aria-hidden /> {u.snow(p.snowfall)}
          </span>
        )}
        <span className="fact">
          <Wind size={14} aria-hidden />{' '}
          <Lvl kind="wind" value={p.windSpeed}>
            {p.windDirection !== null && <WindArrow from={p.windDirection} size={14} />}
            {u.wind(p.windSpeed)}
          </Lvl>
          {p.windGusts !== null && (
            <>
              {' · '}
              <Lvl kind="wind" value={p.windGusts}>{t('weather.gustShort', { value: u.windValue(p.windGusts) })}</Lvl>
            </>
          )}
        </span>
        {fog && (
          <span className="fact" data-fog="true" aria-label={t('weather.visibilityAria', { value: u.visibility(p.visibility!) })}>
            <Eye size={14} aria-hidden /> {t('weather.fog')}
          </span>
        )}
        {risk && risk !== 'low' && (
          <span className="fact" data-risk={risk} aria-label={t('weather.stormAria', { risk: t(`weather.stormRisk.${risk}`) })}>
            <Zap size={14} aria-hidden /> {t(`weather.stormRisk.${risk}`)}
          </span>
        )}
        {p.freezingLevel !== null && (
          <span className="fact" aria-label={t('weather.freezingAria', { value: u.altitude(p.freezingLevel) })}>
            <Mountain size={14} aria-hidden /> {t('weather.freezingShort', { value: u.altitude(p.freezingLevel) })}
          </span>
        )}
      </div>
    </li>
  );
}

/** Detalle de un día por períodos (días 4 a 7: el detalle por hora sería falsa precisión). */
export function DayPeriodsDialog({ title, hours, u, onClose }: { title: string; hours: Hour[]; u: Units; onClose: () => void }) {
  const { t } = useTranslation();
  const periods = periodSummaries(hours);
  return (
    <Dialog title={title} onClose={onClose}>
      <p className="hint" style={{ margin: 0 }}>{t('weather.periodsHint')}</p>
      <Legend u={u} />
      {periods.length === 0 ? (
        <p className="hint">{t('weather.noHours')}</p>
      ) : (
        <ol className="hour-rows">
          {periods.map((p) => (
            <PeriodRow key={p.period} p={p} u={u} />
          ))}
        </ol>
      )}
    </Dialog>
  );
}

/**
 * Lista de días. Los que tienen detalle (por hora o por períodos) se pueden
 * tocar; los de tendencia (8 a 16) no.
 */
export function DayList({
  days,
  offset,
  dayLabel,
  u,
  onSelect,
  trend = false,
}: {
  days: Forecast['daily'];
  offset: number;
  dayLabel: (iso: string, i: number) => string;
  u: Units;
  onSelect?: (date: string, index: number) => void;
  trend?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <ul className="list" data-trend={trend}>
      {days.map((d, i) => {
        const body = (
          <>
            <span className="day-name">{dayLabel(d.date, i + offset)}</span>
            <SkyIcon code={d.code} />
            <span className="list-main">
              <span className="list-title">
                <Lvl kind="temp" value={d.min}>{u.temp(d.min)}</Lvl> / <Lvl kind="temp" value={d.max}>{u.temp(d.max)}</Lvl>
              </span>
              <span className="list-sub">
                <Droplets size={13} aria-hidden /> {d.precipitation > 0 ? u.rain(d.precipitation) : t('weather.noRain')}
                {d.precipProbability !== null && d.precipProbability > 0 && ` (${d.precipProbability}%)`}
              </span>
              <span className="list-sub">
                <Lvl kind="wind" value={d.windMax}>
                  {d.windDirection != null && <WindArrow from={d.windDirection} size={13} />}{' '}
                  {t('weather.windDayWind', { speed: u.wind(d.windMax) })}
                </Lvl>
                {' · '}
                <Lvl kind="wind" value={d.gustMax}>{t('weather.gusts', { value: u.wind(d.gustMax) })}</Lvl>
              </span>
            </span>
          </>
        );
        return (
          <li key={d.date}>
            {onSelect ? (
              <button className="list-row day-row" type="button" data-testid="day" onClick={() => onSelect(d.date, i + offset)}>
                {body}
                <ChevronRight size={18} aria-hidden />
              </button>
            ) : (
              <div className="list-row day-row" data-testid={trend ? 'trend-day' : 'day'}>
                {body}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
