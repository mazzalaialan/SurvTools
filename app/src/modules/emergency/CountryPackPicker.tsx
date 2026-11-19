import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDownToLine, Check, ChevronDown, ChevronUp, Loader2, Map as MapIcon, RefreshCw, Trash2 } from 'lucide-react';
import { CONTINENTS, useSettings, type BrSector, type Country } from '@/core/settings/settings';
import { confirmAction } from '@/ui/confirm';
import { filesToDelete } from './countryDelete';
import { formatBytes, fileBytes } from './countryDownload';
import { CountryPackMap } from './CountryPackMap';
import { BR_SECTORS } from './sectors';
import { useCountryPacks } from './useCountryPacks';

/**
 * Selector de país de Ajustes: a cada país le agrega el estado de su paquete de datos sin conexión (tilde verde si está bajado y al
 * día, ícono de actualización si hay una copia más nueva, ícono de descarga si falta) con un botón para bajarlo sin elegirlo y otro para
 * borrarlo (no el del país activo). Elegir el país también lo baja (ver `useCountryPrefetch`). Brasil es enorme: se baja y se borra por
 * SECTOR (las cinco macrorregiones del IBGE), con una lista debajo.
 */
export function CountryPackPicker() {
  const { t, i18n } = useTranslation();
  const country = useSettings((s) => s.settings.country);
  const update = useSettings((s) => s.update);
  const { packs, sectors, busy, busySector, download, downloadSector, remove, removeSector } = useCountryPacks();
  const [mapOpen, setMapOpen] = useState(false);
  /** Los sectores de Brasil se muestran al tocar Brasil (y se esconden al volver a tocarlo). */
  const [brOpen, setBrOpen] = useState(false);

  /** Borrar con confirmación: dice cuánto se libera y que se puede volver a bajar. */
  async function askRemove(name: string, bytes: number, run: () => Promise<void>) {
    const size = bytes ? ` (${formatBytes(bytes, i18n.language)})` : '';
    if (await confirmAction(t('country.pack.confirmDelete', { country: name, size }))) await run();
  }

  const deleteButton = (name: string, bytes: number, run: () => Promise<void>, testId: string) => (
    <button
      type="button"
      className="country-pack-icon country-pack-del"
      data-testid={testId}
      aria-label={t('country.pack.delete', { country: name })}
      title={t('country.pack.delete', { country: name })}
      onClick={() => void askRemove(name, bytes, run)}
    >
      <Trash2 size={16} aria-hidden />
    </button>
  );

  const sectorName = (id: BrSector) => t(`country.sector.${id}`);

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
              .map((c: Country) => {
                const pack = packs[c];
                const state = pack?.state;
                const sizeText = pack && pack.bytes ? formatBytes(pack.bytes, i18n.language) : '';
                const size = sizeText ? ` (${sizeText})` : '';
                const name = t(`country.${c}`);
                const bytesToFree = filesToDelete(c).reduce((n, f) => n + fileBytes(f), 0);
                // Brasil se baja por sectores (abajo); el país activo no se borra (se volvería a bajar solo).
                const canDelete = c !== 'BR' && c !== country && state !== undefined && state !== 'missing' && bytesToFree > 0;
                return (
                  <div key={c} className="country-pack-item" data-testid={`country-pack-${c}`} data-state={state ?? 'unknown'}>
                    <button
                      type="button"
                      className="country-pack-select"
                      aria-pressed={country === c}
                      aria-expanded={c === 'BR' ? brOpen : undefined}
                      aria-controls={c === 'BR' ? 'country-sectors-BR' : undefined}
                      onClick={() => {
                        if (c === 'BR') {
                          // Brasil se baja por sectores: tocarlo muestra (o esconde) sus sectores, sin cambiar tu país (podés querer bajar el sector
                          // pegado a donde vas). Para usarlo como país hay un botón dentro de la lista.
                          setBrOpen(!brOpen);
                          return;
                        }
                        void update({ country: c });
                        if (state !== 'ready') void download(c);
                      }}
                    >
                      {name}
                      {c === 'BR' ? brOpen ? <ChevronUp size={14} aria-hidden style={{ marginLeft: 4 }} /> : <ChevronDown size={14} aria-hidden style={{ marginLeft: 4 }} /> : null}
                    </button>
                    {c === 'BR' ? null : busy === c ? (
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
                    {canDelete && busy !== c ? deleteButton(name, bytesToFree, () => remove(c), `country-pack-del-${c}`) : null}
                  </div>
                );
              })}
          </div>
          {continent.countries.includes('BR') && brOpen && (
            <div className="country-sectors" id="country-sectors-BR" data-testid="country-sectors-BR">
              <p className="hint" style={{ margin: '8px 0 4px' }}>
                {t('country.sector.hint')}
              </p>
              {country !== 'BR' && (
                <div style={{ margin: '0 0 8px' }}>
                  <button className="btn" type="button" data-testid="country-sector-use-BR" onClick={() => void update({ country: 'BR' })}>
                    {t('country.map.use', { country: t('country.BR') })}
                  </button>
                </div>
              )}
              <div className="country-pack" role="group" aria-label={t('country.sector.title')}>
                {BR_SECTORS.map(({ id }) => {
                  const sp = sectors[id];
                  const state = sp?.state;
                  const name = sectorName(id);
                  const label = `${t('country.BR')} · ${name}`;
                  const totalText = sp?.total ? formatBytes(sp.total, i18n.language) : '';
                  const size = totalText ? ` (${totalText})` : '';
                  return (
                    <div key={id} className="country-pack-item" data-testid={`country-sector-${id}`} data-state={state ?? 'unknown'}>
                      <span className="country-pack-select" style={{ cursor: 'default' }}>
                        {name}
                      </span>
                      {busySector === id ? (
                        <span className="country-pack-icon" role="img" aria-label={t('country.pack.downloading', { country: label })}>
                          <Loader2 size={16} className="spin" aria-hidden />
                        </span>
                      ) : state === 'ready' ? (
                        <span className="country-pack-icon country-pack-ready" role="img" aria-label={t('country.pack.ready', { country: label })} title={t('country.pack.ready', { country: label })}>
                          <Check size={16} aria-hidden />
                        </span>
                      ) : state ? (
                        <button
                          type="button"
                          className="country-pack-icon country-pack-get"
                          data-testid={`country-sector-get-${id}`}
                          aria-label={t(state === 'outdated' ? 'country.pack.update' : 'country.pack.download', { country: label }) + size}
                          title={t(state === 'outdated' ? 'country.pack.update' : 'country.pack.download', { country: label }) + size}
                          onClick={() => void downloadSector(id)}
                        >
                          {state === 'outdated' ? <RefreshCw size={16} aria-hidden /> : <ArrowDownToLine size={16} aria-hidden />}
                          {totalText && (
                            <span className="country-pack-size" data-testid={`country-sector-size-${id}`}>
                              {totalText}
                            </span>
                          )}
                        </button>
                      ) : null}
                      {busySector !== id && state && state !== 'missing' ? deleteButton(label, sp?.total ?? 0, () => removeSector(id), `country-sector-del-${id}`) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </fieldset>
      ))}
      {mapOpen && <CountryPackMap onClose={() => setMapOpen(false)} />}
    </div>
  );
}
