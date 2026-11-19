import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDownToLine, Check, Loader2, Map as MapIcon, RefreshCw } from 'lucide-react';
import { CONTINENTS, useSettings } from '@/core/settings/settings';
import { formatBytes } from './countryDownload';
import { CountryPackMap } from './CountryPackMap';
import { useCountryPacks } from './useCountryPacks';

/**
 * Selector de país de Ajustes: a cada país le agrega el estado de su paquete de datos sin conexión (tilde verde si está bajado y al
 * día, ícono de actualización si hay una copia más nueva, ícono de descarga si falta) con un botón para bajarlo sin elegirlo. Elegir
 * el país también lo baja (ver `useCountryPrefetch`).
 */
export function CountryPackPicker() {
  const { t, i18n } = useTranslation();
  const country = useSettings((s) => s.settings.country);
  const update = useSettings((s) => s.update);
  const { packs, busy, download } = useCountryPacks();
  const [mapOpen, setMapOpen] = useState(false);

  return (
    <div className="field">
      <label id="country-pack-label">{t('country.label')}</label>
      <div>
        <button className="btn" type="button" onClick={() => setMapOpen(true)} data-testid="country-pack-map-open">
          <MapIcon size={18} aria-hidden /> {t('country.map.open')}
        </button>
      </div>
      {CONTINENTS.map((continent) => (
        <fieldset key={continent.id} className="country-continent" data-testid={`country-continent-${continent.id}`}>
          <legend>{t(`country.continent.${continent.id}`)}</legend>
          <div className="country-pack" role="group" aria-label={t(`country.continent.${continent.id}`)}>
            {[...continent.countries]
              .sort((a, b) => t(`country.${a}`).localeCompare(t(`country.${b}`), i18n.language))
              .map((c) => {
              const pack = packs[c];
              const state = pack?.state;
              const sizeText = pack && pack.bytes ? formatBytes(pack.bytes, i18n.language) : '';
              const size = sizeText ? ` (${sizeText})` : '';
              const name = t(`country.${c}`);
              return (
                <div key={c} className="country-pack-item" data-testid={`country-pack-${c}`} data-state={state ?? 'unknown'}>
                  <button
                    type="button"
                    className="country-pack-select"
                    aria-pressed={country === c}
                    onClick={() => {
                      void update({ country: c });
                      if (state !== 'ready') void download(c);
                    }}
                  >
                    {name}
                  </button>
                  {busy === c ? (
                    <span className="country-pack-icon" role="img" aria-label={t('country.pack.downloading', { country: name })} title={t('country.pack.downloading', { country: name })}>
                      <Loader2 size={16} className="spin" aria-hidden />
                    </span>
                  ) : state === 'ready' ? (
                    <span className="country-pack-icon country-pack-ready" role="img" aria-label={t('country.pack.ready', { country: name })} title={t('country.pack.ready', { country: name })}>
                      <Check size={16} aria-hidden />
                    </span>
                  ) : state ? (
                    <button
                      type="button"
                      className="country-pack-icon country-pack-get"
                      data-testid={`country-pack-get-${c}`}
                      aria-label={t(state === 'outdated' ? 'country.pack.update' : 'country.pack.download', { country: name }) + size}
                      title={t(state === 'outdated' ? 'country.pack.update' : 'country.pack.download', { country: name }) + size}
                      onClick={() => void download(c)}
                    >
                      {state === 'outdated' ? <RefreshCw size={16} aria-hidden /> : <ArrowDownToLine size={16} aria-hidden />}
                      {sizeText && (
                        <span className="country-pack-size" data-testid={`country-pack-size-${c}`}>
                          {sizeText}
                        </span>
                      )}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}
      {mapOpen && <CountryPackMap onClose={() => setMapOpen(false)} />}
    </div>
  );
}
