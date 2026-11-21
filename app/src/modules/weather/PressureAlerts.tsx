import { useTranslation } from 'react-i18next';
import { useBarometer } from '@/core/sensors/useBarometer';
import { useSettings } from '@/core/settings/settings';
import { usePressureWatch } from './pressureWatch';

/**
 * La casilla de activar y desactivar los avisos por la presión, con el estado y las aclaraciones. Se usa en Clima y en Ajustes → Notificaciones (es el mismo
 * ajuste). Solo aparece en teléfonos con barómetro.
 */
export function PressureAlertsControl() {
  const { t } = useTranslation();
  const { available } = useBarometer(false);
  const enabled = useSettings((s) => s.settings.pressureAlerts);
  const update = useSettings((s) => s.update);
  const { trend, lastHPa } = usePressureWatch();
  if (!available) return null;
  const change = trend.changeHpa === null ? null : `${trend.changeHpa > 0 ? '+' : '−'}${Math.abs(trend.changeHpa).toFixed(1)}`;
  return (
    <div className="stack" style={{ gap: 4 }} data-testid="pressure-alerts">
      <label className="check">
        <input type="checkbox" checked={enabled} onChange={(e) => void update({ pressureAlerts: e.target.checked })} />
        {t('pressureAlerts.enable')}
      </label>
      {enabled && (
        <p className="hint" style={{ margin: 0 }} data-testid="pressure-status">
          {lastHPa !== null && `${lastHPa.toFixed(1)} hPa · `}
          {t(`pressureAlerts.state.${trend.state}`, { change })}
        </p>
      )}
      <p className="hint" style={{ margin: 0 }}>{t('pressureAlerts.how')}</p>
      <p className="hint" style={{ margin: 0 }}>{t('pressureAlerts.limits')}</p>
    </div>
  );
}

/** Sección de Clima (dentro de «Configurar avisos»). */
export function PressureAlerts() {
  const { t } = useTranslation();
  const { available } = useBarometer(false);
  if (!available) return null;
  return (
    <section className="card stack" aria-labelledby="pressure-alerts-title">
      <h2 id="pressure-alerts-title" className="section-title" style={{ margin: 0 }}>
        {t('pressureAlerts.title')}
      </h2>
      <PressureAlertsControl />
    </section>
  );
}
