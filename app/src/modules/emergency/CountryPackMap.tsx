import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDownToLine, Check, Loader2, Minus, Plus, RefreshCw, Scan } from 'lucide-react';
import { COUNTRIES, useSettings, type Country } from '@/core/settings/settings';
import { Dialog } from '@/ui/Dialog';
import { toMercator } from '@/modules/weathermap/projection';
import { loadGeoData, type GeoData } from '@/modules/weathermap/geo';
import { formatBytes, type PackState } from './countryDownload';
import { FULL_VIEW, MAX_ZOOM, MIN_ZOOM, panView, tapAction, viewForPinch, viewRect, zoomAround, type View } from './countryMapView';
import { useCountryPacks } from './useCountryPacks';

/** Lo que se ve del mapa: toda América del Sur, de la costa del Pacífico al cabo Branco (Brasil), y de La Guajira (Colombia) a Tierra del Fuego. */
const BOUNDS = { west: -82, east: -34, south: -57, north: 13 };

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

/** Lo que hay que moverse (en píxeles) para que un toque pase a ser arrastre. */
const DRAG_PX = 8;

/**
 * Mapa de los países para bajar sus datos sin conexión: cada país pintado según su estado (verde con tilde si está al día, ámbar con ↻ si hay una
 * versión nueva, gris con ⬇ si falta), igual que el selector de Ajustes. Se toca en tres pasos: el primer toque marca el país, el segundo lo baja
 * o lo actualiza si hace falta y el siguiente lo pone como tu país. Se puede acercar (pellizco, rueda o los botones + y −) y arrastrar para
 * moverse. Usa el mapa base que ya trae la app (el del mapa del clima): funciona sin conexión.
 */
export function CountryPackMap({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const current = useSettings((s) => s.settings.country);
  const update = useSettings((s) => s.update);
  const { packs, busy, download } = useCountryPacks();
  const [geo, setGeo] = useState<GeoData | null>(null);
  /** El país marcado con el primer toque (`null`: todavía ninguno; el panel muestra el país activo). */
  const [marked, setMarked] = useState<Country | null>(null);
  const selected = marked ?? current;
  const [view, setView] = useState<View>(() => FULL_VIEW(box));
  const viewRef = useRef(view);
  /** Cambia la vista y la deja anotada AL INSTANTE: los dos dedos mandan eventos seguidos, antes de que la pantalla se vuelva a dibujar. */
  const applyView = useCallback((v: View) => {
    viewRef.current = v;
    setView(v);
  }, []);
  const svgRef = useRef<SVGSVGElement>(null);
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
  const sel = packs[selected];

  /** Lo que pasa al tocar un país: marcarlo, bajarlo o actualizarlo, o ponerlo como el país activo. */
  function tap(c: Country) {
    const action = tapAction({ marked, tapped: c, state: packs[c]?.state, isCurrent: current === c, busy: busy !== null });
    if (action === 'mark') setMarked(c);
    else if (action === 'download' || action === 'update') void download(c);
    else if (action === 'use') void update({ country: c });
  }
  const onKey = (c: Country) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      tap(c);
    }
  };

  // ---- Zoom y desplazamiento ----
  /** Pasa un punto de la pantalla a coordenadas del mapa (la vista puede tener franjas vacías a los lados) y da los píxeles por unidad. */
  const toMap = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    const vr = viewRect(box, viewRef.current);
    const scale = Math.min(rect.width / vr.w, rect.height / vr.h);
    const offX = (rect.width - vr.w * scale) / 2;
    const offY = (rect.height - vr.h * scale) / 2;
    return { x: vr.x + (clientX - rect.left - offX) / scale, y: vr.y + (clientY - rect.top - offY) / scale, scale };
  }, []);
  const zoomBy = useCallback(
    (factor: number, clientX?: number, clientY?: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const p = toMap(clientX ?? rect.left + rect.width / 2, clientY ?? rect.top + rect.height / 2);
      applyView(zoomAround(box, viewRef.current, factor, p.x, p.y));
    },
    [toMap, applyView],
  );
  // La rueda del mouse acerca el mapa (no puede ser un `onWheel` de React: ese es pasivo y no deja frenar el desplazamiento de la página).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [zoomBy, paths]);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ startX: 0, startY: 0, moved: false, pinch: null as null | { dist: number; zoom: number; anchor: { x: number; y: number } } });
  /** Lo que sigue a un arrastre o a un pellizco no es un toque: el clic que Android manda al soltar se descarta. */
  const swallowClick = useRef(false);
  const middle = () => {
    const [a, b] = [...pointers.current.values()];
    return { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), mid: { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 } };
  };

  function down(e: ReactPointerEvent<SVGSVGElement>) {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      gesture.current = { startX: e.clientX, startY: e.clientY, moved: false, pinch: null };
    } else if (pointers.current.size === 2) {
      // Empieza un pellizco: se anota qué punto del mapa está bajo el medio de los dedos, que tiene que quedarse ahí. Se toman los dos dedos para
      // que sigan llegando los eventos aunque salgan del dibujo.
      for (const id of pointers.current.keys()) e.currentTarget.setPointerCapture(id);
      const { dist, mid } = middle();
      const p = toMap(mid.x, mid.y);
      gesture.current.pinch = { dist: Math.max(dist, 1), zoom: viewRef.current.zoom, anchor: { x: p.x, y: p.y } };
      gesture.current.moved = true;
      swallowClick.current = true;
    }
  }
  function move(e: ReactPointerEvent<SVGSVGElement>) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const now = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, now);
    const g = gesture.current;
    if (pointers.current.size >= 2) {
      if (!g.pinch) return;
      const { dist, mid } = middle();
      const rect = svgRef.current!.getBoundingClientRect();
      applyView(viewForPinch(box, rect, g.pinch.anchor, mid, g.pinch.zoom * (dist / g.pinch.dist)));
      swallowClick.current = true;
      return;
    }
    if (!g.moved && Math.hypot(now.x - g.startX, now.y - g.startY) < DRAG_PX) return;
    if (!g.moved) {
      g.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    swallowClick.current = true;
    const { scale } = toMap(now.x, now.y);
    applyView(panView(box, viewRef.current, -(now.x - prev.x) / scale, -(now.y - prev.y) / scale));
  }
  function up(e: ReactPointerEvent<SVGSVGElement>) {
    pointers.current.delete(e.pointerId);
    gesture.current.pinch = null;
    if (pointers.current.size === 0) window.setTimeout(() => (swallowClick.current = false), 60);
  }

  /** Qué hace el próximo toque sobre el país marcado (para avisarlo en el panel). */
  const nextHint = (() => {
    if (busy === selected) return t('country.map.hint.busy');
    if (marked !== selected) return t('country.map.hint.mark');
    const a = tapAction({ marked, tapped: selected, state: sel?.state, isCurrent: current === selected, busy: busy !== null });
    return a === 'download' ? t('country.map.hint.download') : a === 'update' ? t('country.map.hint.update') : a === 'use' ? t('country.map.hint.use') : t('country.map.hint.done');
  })();

  const vr = viewRect(box, view);
  /** Letras e íconos con el mismo tamaño en pantalla sin importar el acercamiento. */
  const labelScale = U / 10 / view.zoom;

  return (
    <Dialog title={t('country.map.title')} onClose={onClose}>
      <p className="hint" style={{ margin: 0 }}>{t('country.map.hintTap')}</p>
      <div className="country-map-wrap">
        <svg
          ref={svgRef}
          className="country-map"
          viewBox={`${vr.x} ${vr.y} ${vr.w} ${vr.h}`}
          style={{ aspectRatio: `${box.w} / ${box.h}` }}
          role="group"
          aria-label={t('country.map.title')}
          data-testid="country-map"
          data-zoom={view.zoom.toFixed(2)}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onClickCapture={(e) => {
            if (swallowClick.current) {
              e.stopPropagation();
              e.preventDefault();
            }
          }}
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
                  className={`country-map-country${selected === c ? ' is-selected' : ''}${current === c ? ' is-current' : ''}`}
                  data-current={current === c ? 'true' : 'false'}
                  data-state={state}
                  data-testid={`country-map-${c}`}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected === c}
                  aria-label={`${nameOf(c)}${current === c ? ` (${t('country.map.mainShort')})` : ''}: ${stateText(c)}`}
                  onClick={() => tap(c)}
                  onKeyDown={onKey(c)}
                >
                  <path d={paths.own[c] ?? ''} vectorEffect="non-scaling-stroke" />
                  {at && (
                    <g transform={`translate(${at.x} ${-at.y}) scale(${labelScale})`}>
                      <text y={-30} fontSize={46} textAnchor="middle" className="country-map-name">
                        {current === c ? `★ ${nameOf(c)}` : nameOf(c)}
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
          {/* Tu país: un halo del color de acento alrededor del contorno, en una capa por ENCIMA de todos los países (si no, los vecinos lo tapan);
              el color de adentro dice si los datos están al día. */}
          {paths?.own[current] && (
            <path d={paths.own[current]} className="country-map-halo" data-testid="country-map-halo" data-country={current} vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        <div className="country-map-zoom" role="group" aria-label={t('country.map.zoom')}>
          <button className="icon-btn" type="button" onClick={() => zoomBy(1.6)} aria-label={t('country.map.zoomIn')} data-testid="country-map-zoom-in" disabled={view.zoom >= MAX_ZOOM}>
            <Plus size={20} aria-hidden />
          </button>
          <button className="icon-btn" type="button" onClick={() => zoomBy(1 / 1.6)} aria-label={t('country.map.zoomOut')} data-testid="country-map-zoom-out" disabled={view.zoom <= MIN_ZOOM}>
            <Minus size={20} aria-hidden />
          </button>
          <button className="icon-btn" type="button" onClick={() => applyView(FULL_VIEW(box))} aria-label={t('country.map.zoomAll')} data-testid="country-map-zoom-all" disabled={view.zoom === 1}>
            <Scan size={20} aria-hidden />
          </button>
        </div>
      </div>

      <ul className="country-map-legend" aria-label={t('country.map.legend')}>
        <li><span className="country-map-key" data-state="ready">✓</span> {t('country.map.state.ready')}</li>
        <li><span className="country-map-key" data-state="outdated">↻</span> {t('country.map.state.outdated')}</li>
        <li><span className="country-map-key" data-state="missing">⬇</span> {t('country.map.state.missing')}</li>
        <li><span className="country-map-key country-map-key-main">★</span> {t('country.map.legendMain')}</li>
      </ul>

      <div className="card stack country-map-panel" data-testid="country-map-panel" aria-live="polite">
        <strong>{current === selected ? `★ ${nameOf(selected)}` : nameOf(selected)}</strong>
        <p style={{ margin: 0 }} data-testid="country-map-state">
          {stateText(selected)}
          {sel && sel.state !== 'ready' && sizeOf(selected) ? ` · ${sizeOf(selected)}` : ''}
        </p>
        <p className="hint" style={{ margin: 0 }} data-testid="country-map-next">{nextHint}</p>
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
