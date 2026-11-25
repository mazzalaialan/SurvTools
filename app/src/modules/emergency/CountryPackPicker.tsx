import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDownToLine, Check, ChevronDown, ChevronUp, Fish, Loader2, Map as MapIcon, MapPin, PawPrint, RefreshCw, Trash2 } from 'lucide-react';
import { CONTINENTS, useSettings, type BrSector, type Country } from '@/core/settings/settings';
import { confirmAction } from '@/ui/confirm';
import { filesToDelete } from './countryDelete';
import { formatBytes, fileBytes } from './countryDownload';
import { CountryPackMap } from './CountryPackMap';
import { BR_SECTORS } from './sectors';
import { useCountryPacks } from './useCountryPacks';

/**
 * Selector de país compartido (docs/DISENO.md, «Selector de país»). Dos modos con el mismo diseño y el mismo orden (continentes y, dentro de cada
 * uno, alfabético):
 * - `manage` (Ajustes): lista de filas con el estado del paquete, descarga, borrado, sectores de Brasil y mapa.
 * - `choose` (Emergencias y guía de primeros auxilios): solo elegir el país actual, en grilla de dos columnas; Brasil se elige directo
 *   (la descarga la sigue haciendo `useCountryPrefetch`, como antes).
 *
 * Selector de país de Ajustes: a cada país le agrega el estado de su paquete de datos sin conexión (tilde verde si está bajado y al
 * día, ícono de actualización si hay una copia más nueva, ícono de descarga si falta) con un botón para bajarlo sin elegirlo y otro para
 * borrarlo (no el del país activo). Elegir el país también lo baja (ver `useCountryPrefetch`). Brasil es enorme: se baja y se borra por
 * SECTOR (las cinco macrorregiones del IBGE), con una lista debajo.
 */
export function CountryPackPicker({ mode = 'manage' }: { mode?: 'manage' | 'choose' }) {
  const manage = mode === 'manage';
  const { t, i18n } = useTranslation();
  const country = useSettings((s) => s.settings.country);
  const update = useSettings((s) => s.update);
  const { packs, sectors, fish, busyFish, fauna, busyFauna, busy, busySector, download, downloadSector, downloadFish, downloadFauna, remove, removeFish, removeFauna, removeSector } = useCountryPacks();
  const [mapOpen, setMapOpen] = useState(false);
  /** Los sectores de Brasil se muestran al tocar Brasil (y se esconden al volver a tocarlo). */
  const [brOpen, setBrOpen] = useState(false);
  /**
   * Los continentes son desplegables y arrancan CERRADOS (decisión del usuario): con muchos países y continentes la lista ocuparía demasiado.
   * El país actual se ve siempre arriba («País actual») y el continente que lo contiene lleva una marca de ubicación mientras está cerrado.
   */
  const continentOfCountry = CONTINENTS.find((ct) => ct.countries.includes(country))?.id;
  const [openContinents, setOpenContinents] = useState<Set<string>>(() => new Set());
  const toggleContinent = (id: string) =>
    setOpenContinents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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
    <div className="field country-picker" data-area="country-picker" data-mode={mode}>
      {manage && (
        <>
          <label id="country-pack-label">{t('country.label')}</label>
          <div>
            <button className="btn" type="button" onClick={() => setMapOpen(true)} data-testid="country-pack-map-open">
              <MapIcon size={18} aria-hidden /> {t('country.map.open')}
            </button>
          </div>
        </>
      )}
      {/* El país actual siempre a la vista, aunque todos los continentes estén cerrados. */}
      <p className="country-current" data-testid="country-current">
        <MapPin size={18} aria-hidden />
        <span className="country-current-label">{t('country.map.legendMain')}</span>
        <strong>{t(`country.${country}`)}</strong>
      </p>
      {CONTINENTS.map((continent) => (
        <fieldset key={continent.id} className="country-continent" data-testid={`country-continent-${continent.id}`}>
          <legend>
            <button
              type="button"
              className="country-continent-toggle"
              data-testid={`country-continent-toggle-${continent.id}`}
              aria-expanded={openContinents.has(continent.id)}
              aria-controls={`country-continent-list-${continent.id}`}
              onClick={() => toggleContinent(continent.id)}
            >
              <span>{t(`country.continent.${continent.id}`)}</span>
              {continent.id === continentOfCountry && !openContinents.has(continent.id) && <MapPin size={16} aria-hidden className="country-continent-here" />}
              <span className="country-continent-count">{t('country.continent.count', { count: continent.countries.length })}</span>
              {openContinents.has(continent.id) ? <ChevronUp size={18} aria-hidden /> : <ChevronDown size={18} aria-hidden />}
            </button>
          </legend>
          {openContinents.has(continent.id) && (
          <div className="country-pack" id={`country-continent-list-${continent.id}`} role="group" aria-label={`${t('country.label')} · ${t(`country.continent.${continent.id}`)}`}>
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
                  <Fragment key={c}>
                  <div className="country-pack-item" data-testid={`country-pack-${c}`} data-state={state ?? 'unknown'}>
                    <span className="country-pack-main">
                    <button
                      type="button"
                      className="country-pack-select"
                      aria-pressed={country === c}
                      onClick={() => {
                        void update({ country: c });
                        // Brasil se baja por sectores (con el control de al lado): elegirlo no baja nada.
                        if (manage && c !== 'BR' && state !== 'ready') void download(c);
                      }}
                    >
                      {/* Marca de «país actual» con ícono y texto (aria-hidden: el nombre accesible sigue siendo solo el país): no depende del color. */}
                      {country === c && <MapPin size={18} aria-hidden className="country-pack-now-icon" />}
                      <span className="country-pack-name">{name}</span>
                    </button>
                    {/* La leyenda va fuera del botón (superpuesta a su derecha) para no cambiar su texto ni su nombre accesible. */}
                    {manage && country === c && <span className="country-pack-now" aria-hidden>{t('country.map.legendMain')}</span>}
                    </span>
                    {manage && c === 'BR' ? (
                      // Brasil es un botón como los demás (lo marca como país actual); sus sectores se despliegan con este control, al costado.
                      <button
                        type="button"
                        className="country-pack-icon country-pack-toggle"
                        data-testid="country-sectors-toggle-BR"
                        aria-expanded={brOpen}
                        aria-controls="country-sectors-BR"
                        aria-label={t('country.sector.toggle', { country: name })}
                        title={t('country.sector.toggle', { country: name })}
                        onClick={() => setBrOpen(!brOpen)}
                      >
                        {brOpen ? <ChevronUp size={18} aria-hidden /> : <ChevronDown size={18} aria-hidden />}
                        <span className="country-pack-size">{t('country.sector.zones')}</span>
                      </button>
                    ) : !manage ? null : busy === c ? (
                      <span className="country-pack-icon" role="img" aria-label={t('country.pack.downloading', { country: name })} title={t('country.pack.downloading', { country: name })}>
                        <Loader2 size={16} className="spin" aria-hidden />
                      </span>
                    ) : state === 'ready' ? (
                      <span className="country-pack-icon country-pack-ready" role="img" aria-label={t('country.pack.ready', { country: name })} title={t('country.pack.ready', { country: name })}>
                        <Check size={16} aria-hidden />
                        {sizeText && <span className="country-pack-size">{sizeText}</span>}
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
                    {manage && canDelete && busy !== c ? deleteButton(name, bytesToFree, () => remove(c), `country-pack-del-${c}`) : null}
                    {/* Pesca: descarga aparte, con un pez (tramos, vedas, permisos y fichas de los peces). */}
                    {manage && fish[c] && (() => {
                      const f = fish[c]!;
                      const fishName = t('country.pack.fishName', { country: name });
                      const fishSize = formatBytes(f.state === 'missing' ? f.total : f.bytes || f.total, i18n.language);
                      if (busyFish === c)
                        return (
                          <span className="country-pack-icon country-pack-fish" role="img" aria-label={t('country.pack.downloading', { country: fishName })} title={t('country.pack.downloading', { country: fishName })}>
                            <Loader2 size={16} className="spin" aria-hidden />
                          </span>
                        );
                      if (f.state === 'ready')
                        return (
                          <button
                            type="button"
                            className="country-pack-icon country-pack-fish country-pack-ready"
                            data-testid={`country-fish-del-${c}`}
                            aria-label={`${t('country.pack.ready', { country: fishName })}. ${t('country.pack.delete', { country: fishName })}`}
                            title={`${t('country.pack.ready', { country: fishName })}. ${t('country.pack.delete', { country: fishName })}`}
                            onClick={() => void askRemove(fishName, f.total, () => removeFish(c))}
                          >
                            <Fish size={16} aria-hidden />
                            <Check size={14} aria-hidden />
                          </button>
                        );
                      return (
                        <button
                          type="button"
                          className="country-pack-icon country-pack-fish country-pack-get"
                          data-testid={`country-fish-get-${c}`}
                          aria-label={`${t(f.state === 'outdated' ? 'country.pack.update' : 'country.pack.download', { country: fishName })} (${fishSize})`}
                          title={`${t(f.state === 'outdated' ? 'country.pack.update' : 'country.pack.download', { country: fishName })} (${fishSize})`}
                          onClick={() => void downloadFish(c)}
                        >
                          <Fish size={16} aria-hidden />
                          {f.state === 'outdated' ? <RefreshCw size={14} aria-hidden /> : <ArrowDownToLine size={14} aria-hidden />}
                          <span className="country-pack-size">{fishSize}</span>
                        </button>
                      );
                    })()}
                    {/* Fauna: descarga aparte, con una huella (caza por provincia y fichas de especies). */}
                    {manage && fauna[c] && (() => {
                      const f = fauna[c]!;
                      const faunaName = t('country.pack.faunaName', { country: name });
                      const faunaSize = formatBytes(f.state === 'missing' ? f.total : f.bytes || f.total, i18n.language);
                      if (busyFauna === c)
                        return (
                          <span className="country-pack-icon country-pack-fish country-pack-fauna" role="img" aria-label={t('country.pack.downloading', { country: faunaName })} title={t('country.pack.downloading', { country: faunaName })}>
                            <Loader2 size={16} className="spin" aria-hidden />
                          </span>
                        );
                      if (f.state === 'ready')
                        return (
                          <button
                            type="button"
                            className="country-pack-icon country-pack-fish country-pack-fauna country-pack-ready"
                            data-testid={`country-fauna-del-${c}`}
                            aria-label={`${t('country.pack.ready', { country: faunaName })}. ${t('country.pack.delete', { country: faunaName })}`}
                            title={`${t('country.pack.ready', { country: faunaName })}. ${t('country.pack.delete', { country: faunaName })}`}
                            onClick={() => void askRemove(faunaName, f.total, () => removeFauna(c))}
                          >
                            <PawPrint size={16} aria-hidden />
                            <Check size={14} aria-hidden />
                          </button>
                        );
                      return (
                        <button
                          type="button"
                          className="country-pack-icon country-pack-fish country-pack-fauna country-pack-get"
                          data-testid={`country-fauna-get-${c}`}
                          aria-label={`${t(f.state === 'outdated' ? 'country.pack.update' : 'country.pack.download', { country: faunaName })} (${faunaSize})`}
                          title={`${t(f.state === 'outdated' ? 'country.pack.update' : 'country.pack.download', { country: faunaName })} (${faunaSize})`}
                          onClick={() => void downloadFauna(c)}
                        >
                          <PawPrint size={16} aria-hidden />
                          {f.state === 'outdated' ? <RefreshCw size={14} aria-hidden /> : <ArrowDownToLine size={14} aria-hidden />}
                          <span className="country-pack-size">{faunaSize}</span>
                        </button>
                      );
                    })()}
                  </div>
                  {/* Los sectores de Brasil van pegados a la fila de Brasil, sangrados, para que se entienda a qué país pertenecen. */}
          {manage && c === 'BR' && brOpen && (
            <div className="country-sectors" id="country-sectors-BR" data-testid="country-sectors-BR">
              <p className="hint">
                {t('country.sector.hint')}
              </p>
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
                      <span className="country-pack-select country-sector-name">
                        {name}
                      </span>
                      {busySector === id ? (
                        <span className="country-pack-icon" role="img" aria-label={t('country.pack.downloading', { country: label })}>
                          <Loader2 size={16} className="spin" aria-hidden />
                        </span>
                      ) : state === 'ready' ? (
                        <span className="country-pack-icon country-pack-ready" role="img" aria-label={t('country.pack.ready', { country: label })} title={t('country.pack.ready', { country: label })}>
                          <Check size={16} aria-hidden />
                          {totalText && <span className="country-pack-size">{totalText}</span>}
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
                  </Fragment>
                );
              })}
          </div>
          )}
        </fieldset>
      ))}
      {manage && mapOpen && <CountryPackMap onClose={() => setMapOpen(false)} />}
    </div>
  );
}
