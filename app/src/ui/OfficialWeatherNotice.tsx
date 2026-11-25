import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '@/core/settings/settings';

/**
 * Aclaración pedida por el SMN: en Argentina, las alertas meteorológicas y
 * los avisos oficiales a la población son competencia exclusiva del SMN; la
 * app usa datos meteorológicos solo como información orientativa.
 * En Brasil la aclaración es la equivalente con el INMET y la Defesa Civil (las alertas del INMET se reproducen como informativas).
 */
export function OfficialWeatherNotice() {
  const { t } = useTranslation();
  const country = useSettings((s) => s.settings.country);
  const brazil = country === 'BR';
  return (
    <p className="notice-unofficial" role="note" data-testid="official-weather-notice">
      <AlertTriangle size={18} aria-hidden className="notice-unofficial-icon" />
      <span>
      {t(brazil ? 'legal.br' : 'legal.smn')}{' '}
      <a href={brazil ? 'https://alertas2.inmet.gov.br' : 'https://www.smn.gob.ar/alertas'} target="_blank" rel="noreferrer">
        {t(brazil ? 'legal.brLink' : 'legal.smnLink')}
      </a>
      </span>
    </p>
  );
}
