import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Download, Map as MapIcon, MapPin } from 'lucide-react';
import { useSettings } from '@/core/settings/settings';
import { prefetchCountry } from './country';
import { downloadSector } from './countryDelete';
import { declineDownload, downloadSectorFor, lastDetectedLocation, refreshOffer, useCountryNotices } from './countryAutomation';
import { formatBytes } from './countryDownload';

/**
 * Avisos arriba de la app cuando se detecta que estás en otro país: ofrecer cambiar el país de la app y, si no hay Wi-Fi seguro,
 * preguntar antes de bajar sus datos (con el peso).
 */
export function CountryNotices() {
  const { t, i18n } = useTranslation();
  const { offer, ask, mapOffer } = useCountryNotices();
  const mapDismissed = useSettings((s) => s.settings.mapOfferDismissed);
  const navigate = useNavigate();
  const country = useSettings((s) => s.settings.country);
  const dismissed = useSettings((s) => s.settings.countryOfferDismissed);
  const update = useSettings((s) => s.update);
  const [busy, setBusy] = useState(false);
  const name = (c: string) => t(`country.${c}`);

  if (!offer && !ask && !mapOffer) return null;
  return (
    <div className="rain-notices" role="status" data-testid="country-notices">
      {offer && (
        <div className="rain-notice country-notice" data-testid="country-offer">
          <MapPin size={20} aria-hidden />
          <span className="update-text">
            <strong>{t('countryOffer.title', { country: name(offer) })}</strong>
            <span className="hint">{t('countryOffer.hint', { country: name(offer), current: name(country) })}</span>
          </span>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => {
              // Cambiar el país baja su paquete (useCountryPrefetch); Brasil se baja por sector: el de donde estás.
              void update({ country: offer }).then(() => {
                refreshOffer();
                const at = lastDetectedLocation();
                if (offer === 'BR' && at) void downloadSectorFor(at).catch(() => undefined);
              });
            }}
            data-testid="country-offer-change"
          >
            {t('countryOffer.change')}
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => {
              void update({ countryOfferDismissed: [...dismissed, offer] }).then(refreshOffer);
            }}
            data-testid="country-offer-no"
          >
            {t('countryOffer.no')}
          </button>
        </div>
      )}
      {mapOffer && (
        <div className="rain-notice country-notice" data-testid="map-offer">
          <MapIcon size={20} aria-hidden />
          <span className="update-text">
            <strong>{t('mapOffer.title', { country: name(mapOffer.country) })}</strong>
            <span className="hint">{t('mapOffer.hint')}</span>
          </span>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => {
              useCountryNotices.setState({ mapOffer: null });
              navigate(`/orientation/maps?bajar=${mapOffer.lat.toFixed(4)},${mapOffer.lon.toFixed(4)}`);
            }}
            data-testid="map-offer-yes"
          >
            {t('mapOffer.yes')}
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => {
              useCountryNotices.setState({ mapOffer: null });
              void update({ mapOfferDismissed: [...mapDismissed, mapOffer.country] });
            }}
            data-testid="map-offer-no"
          >
            {t('mapOffer.no')}
          </button>
        </div>
      )}
      {ask && (
        <div className="rain-notice country-notice" data-testid="country-download-ask">
          <Download size={20} aria-hidden />
          <span className="update-text">
            <strong>
              {t('countryDownload.title', {
                countries: ask.sector ? `${name('BR')} · ${t(`country.sector.${ask.sector}`)}` : ask.countries.map(name).join(', '),
                size: formatBytes(ask.bytes, i18n.language),
              })}
            </strong>
            <span className="hint">{t('countryDownload.hint')}</span>
          </span>
          <button
            className="btn btn-primary"
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void (ask.sector ? downloadSector(ask.sector) : Promise.all(ask.countries.map(prefetchCountry))).finally(() => {
                setBusy(false);
                useCountryNotices.setState({ ask: null });
              });
            }}
            data-testid="country-download-yes"
          >
            {busy ? t('countryDownload.busy') : t('countryDownload.yes')}
          </button>
          <button
            className="btn"
            type="button"
            disabled={busy}
            onClick={() => {
              declineDownload(ask.countries, ask.sector);
              useCountryNotices.setState({ ask: null });
            }}
            data-testid="country-download-no"
          >
            {t('countryDownload.no')}
          </button>
        </div>
      )}
    </div>
  );
}
