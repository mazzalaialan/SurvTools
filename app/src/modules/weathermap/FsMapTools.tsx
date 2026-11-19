import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Layers, ListChecks, X } from 'lucide-react';
import type { WeatherMapLayers, WeatherMapValue } from '@/core/settings/settings';
import { quickRows, type QuickOptions } from './quickReference';

interface Props {
  /** Las capas guardadas (lo que marcan los botones). */
  layers: WeatherMapLayers;
  /** Las capas que de verdad se están dibujando (algunas dependen del servidor o de una fuente): para la tabla. */
  effective: WeatherMapLayers;
  keys: (keyof WeatherMapLayers)[];
  noServer: (key: keyof WeatherMapLayers) => boolean;
  setLayer: (key: keyof WeatherMapLayers, on: boolean) => void;
  zoneValue: WeatherMapValue;
  values: WeatherMapValue[];
  setZoneValue: (v: WeatherMapValue) => void;
  /** La tabla de referencia a la vista (se recuerda); se oculta con su cruz o con su botón. */
  quickRef: boolean;
  setQuickRef: (on: boolean) => void;
  options: QuickOptions;
}

/**
 * Pantalla completa del mapa del clima: el menú de capas para prender y apagar la información sin salir, y una tabla de referencia rápida con los
 * colores y las marcas de las capas prendidas. La tabla se puede ocultar (y volver a mostrar con el botón «Referencia»). Va abajo a la izquierda,
 * arriba de la barra del tiempo, para no tapar la hora del mapa (arriba) ni los botones de zoom (a la derecha).
 */
export function FsMapTools({ layers, effective, keys, noServer, setLayer, zoneValue, values, setZoneValue, quickRef, setQuickRef, options }: Props) {
  const { t } = useTranslation();
  const [menu, setMenu] = useState(false);
  const rows = quickRows(effective, options);
  const showTable = quickRef && rows.length > 0;
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

  return (
    <div className="wmap-fs-tools" onPointerDown={stop} onWheel={stop} data-testid="wmap-fs-tools">
      {showTable && (
        <section className="wmap-quick" aria-label={t('weatherMap.quick.title')} data-testid="quick-ref">
          <header className="wmap-quick-head">
            <strong>{t('weatherMap.quick.title')}</strong>
            <button className="icon-btn" type="button" onClick={() => setQuickRef(false)} aria-label={t('weatherMap.quick.hide')} title={t('weatherMap.quick.hide')} data-testid="quick-ref-close">
              <X size={16} aria-hidden />
            </button>
          </header>
          <table>
            <tbody>
              {rows.map((r) => (
                <tr key={r.layer} data-testid={`quick-row-${r.layer}`}>
                  <th scope="row">{t(`weatherMap.layer.${r.layer}`)}</th>
                  <td>
                    {r.entries.map((e) => (
                      <span key={e.text} className="wmap-quick-entry">
                        <i className="wmap-quick-swatch" style={{ background: e.swatch }} aria-hidden />
                        {t(`weatherMap.quick.${e.text}`, e.vars)}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {menu && (
        <div className="wmap-fs-menu" role="group" aria-label={t('weatherMap.layers')} data-testid="wmap-fs-menu">
          <div className="chips">
            {keys.map((key) => {
              const off = noServer(key);
              return (
                <button
                  key={key}
                  type="button"
                  className="chip"
                  aria-pressed={layers[key] && !off}
                  disabled={off}
                  title={off ? t('weatherMap.needsServer') : undefined}
                  onClick={() => setLayer(key, !layers[key])}
                  data-testid={`wmap-fs-layer-${key}`}
                >
                  {t(`weatherMap.layer.${key}`)}
                </button>
              );
            })}
          </div>
          {layers.regionWeather && (
            <div className="chips" role="group" aria-label={t('weatherMap.zoneValue')}>
              {values.map((v) => (
                <button key={v} type="button" className="chip" aria-pressed={zoneValue === v} onClick={() => setZoneValue(v)} data-testid={`wmap-fs-value-${v}`}>
                  {t(`weatherMap.value.${v}`)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="wmap-fs-buttons">
        <button className="btn" type="button" onClick={() => setMenu((m) => !m)} aria-expanded={menu} data-testid="wmap-fs-layers-btn">
          <Layers size={18} aria-hidden /> {t('weatherMap.quick.layers')}
        </button>
        <button className="btn" type="button" onClick={() => setQuickRef(!quickRef)} aria-pressed={quickRef} data-testid="wmap-fs-quick-btn">
          <ListChecks size={18} aria-hidden /> {t('weatherMap.quick.button')}
        </button>
      </div>
    </div>
  );
}
