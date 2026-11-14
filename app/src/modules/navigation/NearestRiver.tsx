import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { bearingDeg, distanceMeters } from '@/core/geo/geo';
import { useSettings } from '@/core/settings/settings';
import { RiverForecastLine } from '@/modules/weathermap/RiverForecastLine';
import { boPoints, type RiverPoint } from '@/modules/weathermap/navLayers';
import { fetchBoLevels, loadBoCatalog, loadSavedBo, saveBo, type BoCatalog, type BoLevels } from './bolivia';
import { FLOW_STORE, fetchReadings, loadRivers, loadSavedReadings, OLD_FLOW_DAYS, riverState, saveReadings, type RiverReading, type RiversData, type RiverState } from './rivers';
import { sourceEnabled } from './sources';
import { compass8 } from './waves';

/** Hasta dónde se muestra «el río más cercano» de un waypoint: más lejos, ya no es el río de ese lugar. */
export const NEAREST_RIVER_KM = 30;

const STATE_CLASS: Record<RiverState, string> = { evac: 'river-evac', alert: 'river-alert', low: 'river-low', normal: 'river-ok' };

/**
 * La estación de nivel de río más cercana a un lugar (INA de Argentina o SENAMHI de Bolivia), si está a menos de 30 km, con su último nivel,
 * su estado y el pronóstico si lo hay. Para el detalle de un waypoint. Sin conexión, el último nivel guardado.
 */
export function NearestRiver({ lat, lon }: { lat: number; lon: number }) {
  const { t, i18n } = useTranslation();
  const server = useSettings((s) => s.settings.serverUrl)?.trim() || null;
  const [ina, setIna] = useState<RiversData | null>(null);
  const [bo, setBo] = useState<BoCatalog | null>(null);
  const [readings, setReadings] = useState<Map<number, RiverReading>>(() => loadSavedReadings());
  const [flows, setFlows] = useState<Map<number, RiverReading>>(() => loadSavedReadings(FLOW_STORE));
  const [boLevels, setBoLevels] = useState<BoLevels | null>(() => loadSavedBo());
  useEffect(() => {
    void loadRivers().then(setIna, () => undefined);
    if (sourceEnabled('senamhi-bo')) void loadBoCatalog().then(setBo, () => undefined);
  }, []);

  const near = useMemo(() => {
    const here = { lat, lon };
    const candidates: { km: number; ina?: RiversData['stations'][number]; bo?: RiverPoint }[] = [
      ...(ina?.stations ?? []).map((s) => ({ km: distanceMeters(here, s) / 1000, ina: s })),
      ...(bo && boLevels ? boPoints(bo, boLevels) : []).map((p) => ({ km: distanceMeters(here, p) / 1000, bo: p })),
    ];
    return candidates.filter((c) => c.km <= NEAREST_RIVER_KM).sort((a, b) => a.km - b.km)[0] ?? null;
  }, [lat, lon, ina, bo, boLevels]);

  // Con conexión se pide el nivel de esa estación (una sola serie, o el reporte de Bolivia); sin conexión queda lo guardado.
  const series = near?.ina?.series ?? null;
  const flowSeries = near?.ina?.flow ?? null;
  const isBo = !!near?.bo;
  useEffect(() => {
    if (!navigator.onLine) return;
    let cancelled = false;
    if (series !== null)
      void fetchReadings([series]).then(
        (fresh) => {
          if (cancelled) return;
          saveReadings(fresh);
          setReadings((prev) => new Map([...prev, ...fresh]));
        },
        () => undefined,
      );
    if (flowSeries !== null)
      void fetchReadings([flowSeries]).then(
        (fresh) => {
          if (cancelled || !fresh.size) return;
          saveReadings(fresh, FLOW_STORE);
          setFlows((prev) => new Map([...prev, ...fresh]));
        },
        () => undefined,
      );
    if (isBo && server)
      void fetchBoLevels(server).then(
        (l) => {
          if (cancelled) return;
          saveBo(l);
          setBoLevels(l);
        },
        () => undefined,
      );
    return () => {
      cancelled = true;
    };
  }, [series, flowSeries, isBo, server]);

  if (!near) return null;
  const station = near.ina ?? near.bo!;
  const dir = t(`navigation.waves.compass.${compass8(bearingDeg({ lat, lon }, station))}`);
  const nf = new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const km = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 });
  const ago = (iso: string) => {
    const h = (Date.now() - Date.parse(iso)) / 3_600_000;
    if (h < 1) return t('navigation.rivers.agoMinutes', { n: Math.max(1, Math.round(h * 60)) });
    if (h < 48) return t('navigation.rivers.agoHours', { n: Math.round(h) });
    return t('navigation.rivers.agoDays', { n: Math.round(h / 24) });
  };
  const r = near.ina ? readings.get(near.ina.series) : undefined;
  const flow = near.ina?.flow !== undefined ? flows.get(near.ina.flow) : undefined;
  const state = near.ina && r ? riverState(r.level, near.ina) : null;
  const name = near.ina ? near.ina.name : near.bo!.name;
  const river = near.ina ? near.ina.river : near.bo!.river;
  return (
    <section className="card stack" aria-labelledby="nearest-river-title" data-testid="nearest-river">
      <h2 id="nearest-river-title" className="section-title" style={{ margin: 0 }}>
        {t('navigation.nearestRiver.title')}
      </h2>
      <p style={{ margin: 0 }} data-testid="nearest-river-name">
        <strong>{river ? `${name} · ${river}` : name}</strong> <span className="hint">{t('navigation.nearestRiver.where', { km: km.format(near.km), dir })}</span>
      </p>
      {near.ina &&
        (r && state ? (
          <p style={{ margin: 0 }} data-testid="nearest-river-level">
            <strong>{nf.format(r.level)} m</strong>{' '}
            <span className={`chip-state ${STATE_CLASS[state]}`}>{t(`navigation.rivers.state.${state}`)}</span>{' '}
            <span className="hint">{t('navigation.rivers.measured', { ago: ago(r.at) })}</span>
          </p>
        ) : (
          <p className="hint" style={{ margin: 0 }}>{t('navigation.rivers.noReading')}</p>
        ))}
      {flow && (
        <p className="hint" style={{ margin: 0 }} data-testid="nearest-river-flow">
          {t('navigation.rivers.flow', { q: new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 0 }).format(flow.level), date: new Date(flow.at).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' }) })}
          {(Date.now() - Date.parse(flow.at)) / 86_400_000 > OLD_FLOW_DAYS ? ` · ${t('navigation.rivers.flowOld')}` : ''}
        </p>
      )}
      {near.bo && (
        <p style={{ margin: 0 }} data-testid="nearest-river-level">
          {t('weatherMap.riverBoLevel', { cm: near.bo.level ?? '—', date: near.bo.at ? new Date(near.bo.at).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' }) : '—' })}
        </p>
      )}
      {near.ina?.forecast?.length ? <RiverForecastLine station={near.ina} now={Date.now()} /> : null}
      <Link to={`/weather/navigation?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}`}>{t('weatherMap.navMore')}</Link>
    </section>
  );
}
