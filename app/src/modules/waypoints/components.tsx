import { useTranslation } from 'react-i18next';
import { gpsErrorText } from '@/core/geo/gpsText';
import { Locate, LocateOff } from 'lucide-react';
import { bearingDeg, cardinalOf, distanceMeters, type LatLon } from '@/core/geo/geo';
import type { GeoError, GeoFix } from '@/core/geo/useGeolocation';
import { useSettings } from '@/core/settings/settings';
import { formatDistance } from '@/core/units/units';

/** Línea de estado del GPS: buscando, error o precisión actual. */
export function GpsStatus({ fix, error }: { fix: GeoFix | null; error: GeoError | null }) {
  const { t, i18n } = useTranslation();
  const units = useSettings((s) => s.settings.units);
  if (error && !fix) {
    return (
      <p className="gps-status gps-error" role="status">
        <LocateOff size={18} aria-hidden /> {gpsErrorText(t, error)}
      </p>
    );
  }
  return (
    <p className="gps-status" role="status">
      <Locate size={18} aria-hidden />
      {fix ? t('gps.accuracy', { value: formatDistance(fix.accuracy, units, i18n.language) }) : t('gps.searching')}
    </p>
  );
}

/** "312° NO" */
export function useFormatBearing() {
  const { t } = useTranslation();
  return (bearing: number) => `${Math.round(bearing) % 360}° ${t(`geo.cardinal.${cardinalOf(bearing)}`)}`;
}

/** "1,2 km · 312° NO" desde la posición actual. */
export function useDistanceLabel() {
  const { i18n } = useTranslation();
  const units = useSettings((s) => s.settings.units);
  const formatBearing = useFormatBearing();
  return (from: LatLon, to: LatLon) =>
    `${formatDistance(distanceMeters(from, to), units, i18n.language)} · ${formatBearing(bearingDeg(from, to))}`;
}
