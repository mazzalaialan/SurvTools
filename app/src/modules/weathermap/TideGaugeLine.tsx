import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '@/core/settings/settings';
import { fetchIocLevels, iocNear, loadIocCatalog, loadSavedIoc, measuredSeries, saveIoc, type IocCatalog, type IocLevels } from '@/modules/navigation/ioc';
import type { TideStation } from '@/modules/navigation/tides';

/**
 * Mareógrafo medido del IOC más cercano a una estación de mareas, en su ficha del mapa: cuánto se separa el agua medida de lo calculado.
 * Se pide al servidor propio (que guarda la clave del IOC) al tocar la estación; sin conexión queda la última lectura guardada.
 */
export function TideGaugeLine({ station }: { station: TideStation }) {
  const { t, i18n } = useTranslation();
  const server = useSettings((s) => s.settings.serverUrl)?.trim() || null;
  const [catalog, setCatalog] = useState<IocCatalog | null>(null);
  const [levels, setLevels] = useState<IocLevels | null>(null);
  useEffect(() => {
    void loadIocCatalog().then(setCatalog, () => undefined);
  }, []);
  const gauge = catalog ? iocNear(catalog.stations, station.lat, station.lon) : null;
  const code = gauge?.station.code ?? null;
  useEffect(() => {
    setLevels(code ? loadSavedIoc(code) : null);
    if (!code || !server || !navigator.onLine) return;
    let cancelled = false;
    fetchIocLevels(server, code).then(
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
  }, [code, server]);
  const measured = levels ? measuredSeries(levels, station) : null;
  if (!gauge || !measured) return null;
  const nf = new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const key = Math.abs(measured.deviation) < 0.05 ? 'navigation.tides.gaugeSame' : measured.deviation > 0 ? 'navigation.tides.gaugeAbove' : 'navigation.tides.gaugeBelow';
  return (
    <p className="hint" style={{ margin: 0 }} data-testid="map-tide-gauge">
      <strong>{t('navigation.tides.gaugeTitle', { name: gauge.station.name })}</strong>{' '}
      {t(key, { value: nf.format(Math.abs(measured.deviation)), time: measured.lastAt.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' }) })}
    </p>
  );
}
