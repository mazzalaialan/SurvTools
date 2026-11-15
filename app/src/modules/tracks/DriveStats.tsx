import { useTranslation } from 'react-i18next';
import type { Track } from '@/core/model/types';
import { useSettings } from '@/core/settings/settings';
import { formatClock } from '@/modules/training/stats';

const KM_PER_MILE = 1.609344;

/** Resumen de un recorrido grabado en modo «Conducir»: velocidades y paradas, sin calorías ni ritmo. */
export function DriveStats({ track }: { track: Track }) {
  const { t, i18n } = useTranslation();
  const units = useSettings((s) => s.settings.units);
  const d = track.drive;
  if (!d) return null;
  const imperial = units === 'imperial';
  const nf0 = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 0 });
  const speed = (kmh: number) => (kmh > 0 ? `${nf0.format(imperial ? kmh / KM_PER_MILE : kmh)} ${imperial ? 'mph' : 'km/h'}` : '—');
  const tiles: [string, string][] = [
    [t('drive.vehicleLabel'), t(`drive.vehicle.${track.vehicle ?? 'other'}`)],
    [t('drive.max'), speed(d.maxKmh)],
    [t('drive.avgMoving'), speed(d.avgMovingKmh)],
    [t('drive.avgTotal'), speed(d.avgKmh)],
    [t('drive.moving'), formatClock(d.movingS)],
    [t('drive.stopped'), formatClock(d.stoppedS)],
  ];
  return (
    <dl className="track-stats" data-testid="drive-stats" aria-label={t('drive.summary')}>
      {tiles.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
