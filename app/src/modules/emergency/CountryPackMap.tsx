import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDownToLine, Check, Loader2, RefreshCw } from 'lucide-react';
import { COUNTRIES, useSettings, type Country } from '@/core/settings/settings';
import { Dialog } from '@/ui/Dialog';
import { toMercator } from '@/modules/weathermap/projection';
import { loadGeoData, type GeoData } from '@/modules/weathermap/geo';
import { formatBytes, type PackState } from './countryDownload';
import { useCountryPacks } from './useCountryPacks';

/** Lo que se ve del mapa: de la costa del Pacífico al Atlántico y de Perú a Tierra del Fuego. */
const BOUNDS = { west: -82, east: -50, south: -57, north: 1 };

/** Anillos `[lon, lat, lon, lat, …]` → trazado SVG en metros Mercator (con el eje y invertido, como pide SVG). */
export function ringsPath(rings: number[][]): string {
  return rings
    .map((ring) => {
      let d = '';
      for (let i = 0; i + 1 < ring.length; i += 2) {
        const { x, y } = toMercator(ring[i]!, ring[i + 1]!);
        d += `${i === 0 ? 'M' : 'L'}${Math.round(x)} ${Math.round(-y)}`;
      }
      return `${d}Z`;
    })
    .join('');
}

const box = (() => {
  const a = toMercator(BOUNDS.west, BOUNDS.north);
  const b = toMercator(BOUNDS.east, BOUNDS.south);
  return { x: a.x, y: -a.y, w: b.x - a.x, h: -b.y - -a.y };
})();
/** Una unidad = 1 % del ancho: tamaños de letra y de los íconos en la misma escala del dibujo. */
const U = box.w / 100;

const GLYPH: Record<PackState, string> = { ready: '✓', outdated: '↻', missing: '⬇' };

/**
 * Mapa de los países para bajar sus datos sin conexión: cada país pintado según su estado (verde con tilde si está al día, ámbar con ↻ si hay una
 * versión nueva, gris con ⬇ si falta), igual que el selector de Ajustes. Al tocar un país se ve su estado y el botón para bajarlo o
 * actualizarlo. Usa el mapa base que ya trae la app (el del mapa del clima): funciona sin conexión.
 */
export function CountryPackMap({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const current = useSettings((s) => s.settings.country);
  const update = useSettings((s) => s.update);
  const { packs, busy, download } = useCountryPacks();
  const [geo, setGeo] = useState<GeoData | null>(null);
  const [selected, setSelected] = useState<Country>(current);
  useEffect(() => {
    void loadGeoData().then(setGeo);
  }, []);

  const paths = useMemo(() => {
    if (!geo) return null;
    return {
      neighbors: geo.neighbors.map((n) => ({ code: n.code, d: ringsPath(n.rings) })),
      own: Object.fromEntries(geo.borders.map((b) => [b.code, ringsPath(b.rings)])) as Record<string, string>,
      labels: Object.fromEntries(geo.countries.map((c) => [c.code, { name: c.name, label: c.label }])),
    };
  }, [geo]);

  const nameOf = (c: Country) => t(`country.${c}`);
  const stateText = (c: Country) => (busy === c ? t('country.map.state.busy') : packs[c] ? t(`country.map.state.${packs[c]!.state}`) : t('country.map.state.unknown'));
  const sizeOf = (c: Country) => (packs[c]?.bytes ? formatBytes(packs[c]!.bytes, i18n.language) : '');
  const pick = (c: Country) => () => setSelected(c);
  const onKey = (c: Country) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setSelected(c);
    }
  };
  const sel = packs[selected];

  return (
    <Dialog title={t('country.map.title')} onClose={onClose}>
      <p className="hint" style={{ margin: 0 }}>{t('country.map.hint')}</p>
      <svg
        className="country-map"
        viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
        role="group"
        aria-label={t('country.map.title')}
        data-testid="country-map"
      >
        {paths?.neighbors.map((n) => (
          <path key={n.code} d={n.d} className="country-map-neighbor" vectorEffect="non-scaling-stroke" />
        ))}
        {paths &&
          COUNTRIES.map((c) => {
            const state = busy === c ? 'busy' : (packs[c]?.state ?? 'unknown');
            const lab = paths.labels[c];
            const at = lab ? toMercator(lab.label[0], lab.label[1]) : null;
            return (
              <g
                key={c}
                className={`country-map-country${selected === c ? ' is-selected' : ''}`}
                data-state={state}
                data-testid={`country-map-${c}`}
                role="button"
                tabIndex={0}
                aria-pressed={selected === c}
                aria-label={`${nameOf(c)}: ${stateText(c)}`}
                onClick={pick(c)}
                onKeyDown={onKey(c)}
              >
                <path d={paths.own[c] ?? ''} vectorEffect="non-scaling-stroke" />
                {at && (
                  <g transform={`translate(${at.x} ${-at.y}) scale(${U / 10})`}>
                    <text y={-30} fontSize={46} textAnchor="middle" className="country-map-name">
                      {nameOf(c)}
                    </text>
                    <g transform="translate(0 22)" className="country-map-badge">
                      <circle r={34} />
                      <text fontSize={46} textAnchor="middle" dominantBaseline="central">
                        {state === 'busy' ? '…' : state === 'unknown' ? '' : GLYPH[state]}
                      </text>
                    </g>
                  </g>
                )}
              </g>
            );
          })}
      </svg>

      <ul className="country-map-legend" aria-label={t('country.map.legend')}>
        <li><span className="country-map-key" data-state="ready">✓</span> {t('country.map.state.ready')}</li>
        <li><span className="country-map-key" data-state="outdated">↻</span> {t('country.map.state.outdated')}</li>
        <li><span className="country-map-key" data-state="missing">⬇</span> {t('country.map.state.missing')}</li>
      </ul>

      <div className="card stack country-map-panel" data-testid="country-map-panel" aria-live="polite">
        <strong>{nameOf(selected)}</strong>
        <p style={{ margin: 0 }} data-testid="country-map-state">
          {stateText(selected)}
          {sel && sel.state !== 'ready' && sizeOf(selected) ? ` · ${sizeOf(selected)}` : ''}
        </p>
        <div className="row-end">
          {current !== selected && (
            <button
              className="btn"
              type="button"
              data-testid="country-map-use"
              onClick={() => {
                void update({ country: selected });
                if (sel?.state !== 'ready') void download(selected);
              }}
            >
              {t('country.map.use', { country: nameOf(selected) })}
            </button>
          )}
          {busy === selected ? (
            <span className="hint"><Loader2 size={16} className="spin" aria-hidden /> {t('country.map.state.busy')}</span>
          ) : sel?.state === 'ready' ? (
            <span className="country-pack-ready"><Check size={16} aria-hidden /> {t('country.map.state.ready')}</span>
          ) : sel ? (
            <button className="btn btn-primary" type="button" data-testid="country-map-get" onClick={() => void download(selected)}>
              {sel.state === 'outdated' ? <RefreshCw size={18} aria-hidden /> : <ArrowDownToLine size={18} aria-hidden />}{' '}
              {t(sel.state === 'outdated' ? 'country.map.update' : 'country.map.download', { country: nameOf(selected) })}
            </button>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}
