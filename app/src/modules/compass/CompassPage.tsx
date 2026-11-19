import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useCapabilities, useCapability } from '@/core/capabilities/capabilities';
import { useWakeLock } from '@/core/power/useWakeLock';
import { useGeolocation } from '@/core/geo/useGeolocation';
import { useCompassAccuracy } from '@/core/sensors/compassAccuracy';
import { useSensorPermission } from '@/core/sensors/orientationSource';
import { useHeading } from '@/core/sensors/useHeading';
import { useSettings, type NorthReference } from '@/core/settings/settings';
import { useFormatBearing } from '@/modules/waypoints/components';
import { Segmented } from '@/ui/Segmented';
import { CalibrationDrawing } from './CalibrationDrawing';
import { CompassRose } from './CompassRose';

export function CompassPage() {
  const { t, i18n } = useTranslation();
  const hasGps = useCapability('geolocation');
  const { fix } = useGeolocation(hasGps);
  const caps = useCapabilities((s) => s.caps);
  const heading = useHeading(fix);
  const accuracy = useCompassAccuracy(!!heading);
  const permission = useSensorPermission((s) => s.state);
  // Con la brújula a la vista la pantalla no se apaga sola.
  useWakeLock(!!heading);
  const formatBearing = useFormatBearing();
  const reference = useSettings((s) => s.settings.northReference);
  const update = useSettings((s) => s.update);

  return (
    <div className="stack compass-page">
      <h1 className="page-title">{t('modules.compass.title')}</h1>

      {heading ? (
        <>
          <p className="compass-readout" data-testid="compass-heading" aria-live="off">
            {formatBearing(heading.heading)}
          </p>
          {/* App nativa: Android informa cuán calibrada está la brújula; si no lo está, se avisa con lo que hay que hacer. */}
          {accuracy && (accuracy === 'low' || accuracy === 'unreliable' ? (
            <div className="warning-box stack" role="status" data-testid="compass-accuracy" data-level={accuracy}>
              <span>{t(`compass.accuracy.${accuracy}`)}</span>
              <CalibrationDrawing />
            </div>
          ) : (
            <p className="hint" style={{ textAlign: 'center' }} data-testid="compass-accuracy" data-level={accuracy}>{t(`compass.accuracy.${accuracy}`)}</p>
          ))}
          <CompassRose heading={heading.heading} />
          <p className="hint" style={{ textAlign: 'center' }}>
            {heading.mode === 'upright' ? t('compass.upright') : t('compass.flat')}
          </p>
        </>
      ) : permission === 'prompt' ? (
        // iPhone: iOS pide permiso para leer los sensores y solo deja pedirlo desde un toque.
        <button className="btn btn-primary" type="button" onClick={() => void useSensorPermission.getState().request()} data-testid="compass-enable">
          {t('compass.enableSensors')}
        </button>
      ) : permission === 'denied' ? (
        <p className="warning-box" role="alert" data-testid="compass-denied">{t('compass.sensorsDenied')}</p>
      ) : caps && !caps.orientation ? (
        // Una PC no tiene el sensor: no se espera para siempre.
        <p className="empty" data-testid="compass-none">{t('compass.noSensor')}</p>
      ) : (
        <p className="empty">{t('compass.waiting')}</p>
      )}

      {/* Lo que casi nadie cambia (norte verdadero o magnético, declinación, calibrar) queda plegado debajo de la brújula. */}
      <details className="card more-options" data-testid="compass-advanced">
        <summary>{t('compass.advanced')}</summary>
        <div className="stack" style={{ marginTop: 12 }}>
        <Segmented<NorthReference>
          label={t('compass.reference')}
          value={reference}
          options={[
            { value: 'true', label: t('compass.trueNorth') },
            { value: 'magnetic', label: t('compass.magneticNorth') },
          ]}
          onChange={(v) => void update({ northReference: v })}
        />
        <p className="hint" data-testid="declination">
          {heading?.declination != null
            ? t('compass.declination', {
                value: new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.abs(heading.declination)),
                dir: heading.declination < 0 ? t('geo.cardinal.W') : t('geo.cardinal.E'),
              })
            : t('compass.noDeclination')}
        </p>
        <p className="hint">
          <Link to="/orientation/declination">{t('compass.moreDeclination')}</Link>
        </p>
        <p className="hint">{t('compass.calibrate')}</p>
        <CalibrationDrawing />
        <ol className="hint calib-steps" data-testid="calibration-steps">
          <li>{t('compass.calibStep1')}</li>
          <li>{t('compass.calibStep2')}</li>
          <li>{t('compass.calibStep3')}</li>
        </ol>
        </div>
      </details>
    </div>
  );
}
