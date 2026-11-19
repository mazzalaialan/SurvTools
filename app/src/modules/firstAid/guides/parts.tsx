import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, LocateFixed, Trees } from 'lucide-react';
import { currentPosition } from '@/core/geo/useGeolocation';
import { useSettings, type FirstAidEnv } from '@/core/settings/settings';
import { useCountry } from '@/modules/emergency/currentCountry';
import { estimateHelp, WILD_MINUTES, type HelpEstimate } from './detect';

/** Idioma del contenido de la guía. */
export function useLang(): 'es' | 'en' {
  const { i18n } = useTranslation();
  return i18n.language.startsWith('en') ? 'en' : 'es';
}

/**
 * Ciudad (la ayuda llega en minutos) o zona agreste (puede tardar horas). Se
 * elige a mano o se detecta con la ubicación; queda guardado.
 */
export function EnvSwitch() {
  const { t, i18n } = useTranslation();
  const env = useSettings((s) => s.settings.firstAidEnv);
  const country = useCountry();
  const update = useSettings((s) => s.update);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<HelpEstimate | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function detect() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      let fix: { lat: number; lon: number };
      try {
        fix = await currentPosition();
      } catch {
        setError(t('guides.detect.noLocation'));
        return;
      }
      let help: HelpEstimate | null;
      try {
        help = await estimateHelp(fix.lat, fix.lon, country);
      } catch {
        // Chile o Uruguay sin el paquete descargado y sin conexión.
        setError(t('emergency.packageMissing', { country: t(`country.${country}`) }));
        return;
      }
      if (!help) {
        setError(t('guides.detect.nothing'));
        return;
      }
      setResult(help);
      await update({ firstAidEnv: help.env });
    } finally {
      setBusy(false);
    }
  }

  const option = (value: FirstAidEnv, Icon: typeof Trees) => (
    <button
      type="button"
      className="chip guide-env"
      aria-pressed={env === value}
      onClick={() => {
        setResult(null);
        void update({ firstAidEnv: value });
      }}
    >
      <Icon size={16} aria-hidden /> {t(`guides.env.${value}`)}
    </button>
  );
  const km = (n: number) => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: n < 10 ? 1 : 0 }).format(n);

  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="chips" role="group" aria-label={t('guides.env.label')}>
        {option('city', Building2)}
        {option('wild', Trees)}
        <button type="button" className="chip guide-env" onClick={() => void detect()} disabled={busy}>
          <LocateFixed size={16} aria-hidden /> {busy ? t('guides.detect.busy') : t('guides.detect.button')}
        </button>
      </div>
      {result && (
        <p className="hint" role="status" data-testid="guide-detect" style={{ margin: 0 }}>
          {t('guides.detect.result', {
            what: t(`guides.detect.kind.${result.kind}`, { name: result.name }),
            km: km(result.km),
            minutes: result.minutes,
            env: t(`guides.env.${result.env}`),
            limit: WILD_MINUTES,
          })}
        </p>
      )}
      {error && (
        <p className="hint" role="status" style={{ margin: 0 }}>
          {error}
        </p>
      )}
      <p className="hint" style={{ margin: 0 }}>{t(`guides.env.${env}Hint`)}</p>
    </div>
  );
}
