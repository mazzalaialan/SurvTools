import { useEffect, useMemo, useRef, useState } from 'react';
import type { Feature, FeatureCollection } from 'geojson';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronUp, Layers, Loader2, Locate, X } from 'lucide-react';
import { useGeolocation } from '@/core/geo/useGeolocation';
import { useSettings } from '@/core/settings/settings';
import { MapView, type ViewState } from '@/modules/maps/MapView';
import { outlineFeatures } from '@/modules/maps/outline';
import { loadGeoData } from '@/modules/weathermap/geo';
import { FullscreenStage } from '@/ui/FullscreenStage';
import { sectorsInZone, sectorsWithSpecies, speciesById, speciesInZone, speciesName, zoneName, matchesHabitat, type FishData, type FishSector } from './fishing';
import { useFishZone } from './useFishZone';
import { FISH_STYLES, FishDataGate, HabitatPicker, MAX_FISH, SectorSeasonBadge, useHabitatFilter, ZonePicker } from './parts';
import { useFishData } from './useFishData';

const FISH_LAYERS_KEY = 'vikarg.fishing.layers';
const NONE: never[] = [];
/** Color de los tramos en «Todos» (neutro: cada tramo lleva el número de especies). */
const ALL_COLOR = '#7f97ad';
/** Pesca prohibida: rojo, y punteado para que se distinga también en el tema rojo. */
const FORBIDDEN_COLOR = '#c62828';

type Bounds = [number, number, number, number];

/** Todos los puntos [lon, lat] de una geometría, sea línea, polígono o varios (MultiPolygon de los lagos con islas o en partes). */
function pointsOf(g: FishSector['geometry']): [number, number][] {
  const out: [number, number][] = [];
  const walk = (x: unknown): void => {
    if (Array.isArray(x) && typeof x[0] === 'number') out.push(x as [number, number]);
    else if (Array.isArray(x)) x.forEach(walk);
  };
  walk(g.coordinates);
  return out;
}

function boundsOf(sectors: FishSector[]): Bounds | undefined {
  const pts = sectors.flatMap((s) => pointsOf(s.geometry));
  if (!pts.length) return undefined;
  const lons = pts.map((p) => p[0]);
  const lats = pts.map((p) => p[1]);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}

const feature = (s: FishSector, props: Record<string, unknown>): Feature => ({ type: 'Feature', id: s.id, properties: { id: s.id, ...props }, geometry: s.geometry as Feature['geometry'] });

const rad = (d: number) => (d * Math.PI) / 180;
/** Distancia aproximada en metros (equirrectangular). */
const meters = (a: [number, number], b: [number, number]) => rad(Math.hypot((a[0] - b[0]) * Math.cos(rad((a[1] + b[1]) / 2)), a[1] - b[1])) * 6_371_000;
const lengthOf = (l: [number, number][]) => l.reduce((n, c, i) => (i ? n + meters(l[i - 1]!, c) : 0), 0);

/** Une en cadenas largas los pedazos de un río que comparten un extremo (en OSM un río son muchos tramos cortos). */
function chains(lines: [number, number][][]): [number, number][][] {
  const key = (c: [number, number]) => `${c[0]},${c[1]}`;
  const pool = lines.filter((l) => l.length > 1).map((l) => [...l]);
  const out: [number, number][][] = [];
  while (pool.length) {
    let cur = pool.pop()!;
    for (let grew = true; grew; ) {
      grew = false;
      for (let i = 0; i < pool.length; i++) {
        const l = pool[i]!;
        const [h, t] = [key(cur[0]!), key(cur[cur.length - 1]!)];
        const [lh, lt] = [key(l[0]!), key(l[l.length - 1]!)];
        if (t === lh) cur = [...cur, ...l.slice(1)];
        else if (t === lt) cur = [...cur, ...[...l].reverse().slice(1)];
        else if (h === lt) cur = [...l, ...cur.slice(1)];
        else if (h === lh) cur = [...[...l].reverse(), ...cur.slice(1)];
        else continue;
        pool.splice(i, 1);
        grew = true;
        break;
      }
    }
    out.push(cur);
  }
  return out;
}

/**
 * Un punto adentro del lago para escribir el nombre: el promedio de los vértices si cae adentro; si no (lagos con forma de L o de
 * media luna), el medio del tramo más ancho de una línea horizontal que cruza el lago.
 */
function insidePoint(ring: [number, number][]): [number, number] | null {
  if (ring.length < 3) return null;
  const c: [number, number] = [ring.reduce((n, p) => n + p[0], 0) / ring.length, ring.reduce((n, p) => n + p[1], 0) / ring.length];
  const crossings = (y: number) => {
    const xs: number[] = [];
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]!;
      const [xj, yj] = ring[j]!;
      if (yi > y !== yj > y) xs.push(xi + ((y - yi) * (xj - xi)) / (yj - yi));
    }
    return xs.sort((a, b) => a - b);
  };
  const inside = (p: [number, number]) => crossings(p[1]).filter((x) => x < p[0]).length % 2 === 1;
  if (inside(c)) return c;
  const ys = ring.map((p) => p[1]);
  const [lo, hi] = [Math.min(...ys), Math.max(...ys)];
  let best: [number, number] | null = null;
  let width = 0;
  for (let k = 1; k < 20; k++) {
    const y = lo + ((hi - lo) * k) / 20;
    const xs = crossings(y);
    for (let i = 0; i + 1 < xs.length; i += 2)
      if (xs[i + 1]! - xs[i]! > width) {
        width = xs[i + 1]! - xs[i]!;
        best = [(xs[i]! + xs[i + 1]!) / 2, y];
      }
  }
  return best;
}

/**
 * Nombres en el mapa: en los ríos, sobre el mismo dibujo del cauce, con los pedazos de OSM unidos en líneas largas (en pedazos cortos
 * el nombre no entra y el mapa lo descarta). En los lagos, en el centro.
 */
function nameFeatures(sectors: FishSector[]): Feature[] {
  const out: Feature[] = [];
  for (const s of sectors) {
    const g = s.geometry;
    if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
      const ring = g.type === 'Polygon' ? (g.coordinates[0] ?? []) : (g.coordinates[0]?.[0] ?? []);
      const p = insidePoint(ring);
      if (p) out.push({ type: 'Feature', properties: { water: s.water }, geometry: { type: 'Point', coordinates: p } });
      continue;
    }
    const all = chains(g.type === 'LineString' ? [g.coordinates] : g.coordinates);
    // Sobre el mismo dibujo del río (sin suavizar): los pedazos unidos en una sola línea larga, así entra el nombre.
    for (const line of all.filter((l) => lengthOf(l) > 2000)) out.push({ type: 'Feature', properties: { water: s.water, nameLine: 'on' }, geometry: { type: 'LineString', coordinates: line } });
  }
  return out;
}

/** Mapa de pesca: los tramos de los peces elegidos (o todos) y, al tocar, los peces de cada tramo. */
export function FishingMapPage() {
  const state = useFishData();
  return <FishDataGate state={state}>{(data) => <FishingMap data={data} />}</FishDataGate>;
}

function FishingMap({ data }: { data: FishData }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [params, setParams] = useSearchParams();
  const layers = useSettings((s) => s.settings.mapLayers);
  // Relieve y curvas de nivel: apagados por defecto en el mapa de pesca (tapan los ríos); se prenden en «Capas». Se recuerda en el dispositivo.
  const [extra, setExtra] = useState<{ hillshade: boolean; contours: boolean }>(() => {
    try {
      return { hillshade: false, contours: false, ...JSON.parse(localStorage.getItem(FISH_LAYERS_KEY) ?? '{}') };
    } catch {
      return { hillshade: false, contours: false };
    }
  });
  const toggleExtra = (k: 'hillshade' | 'contours') =>
    setExtra((prev) => {
      const next = { ...prev, [k]: !prev[k] };
      try {
        localStorage.setItem(FISH_LAYERS_KEY, JSON.stringify(next));
      } catch {
        /* sin almacenamiento: queda solo en esta sesión */
      }
      return next;
    });
  const [layersOpen, setLayersOpen] = useState(false);
  const [outline, setOutline] = useState<FeatureCollection | null>(null);
  useEffect(() => {
    void loadGeoData().then((geo) => setOutline(outlineFeatures(geo)));
  }, []);

  const z = useFishZone(data);
  const zoneSectors = useMemo(() => sectorsInZone(data, z.zone), [data, z.zone]);
  const chosen = (params.get('fish') ?? '').split(',').filter((id) => id && speciesById(data, id)).slice(0, MAX_FISH);
  const focus = data.sectors.find((s) => s.id === params.get('sector'));
  const [picked, setPicked] = useState<string[]>(focus ? [focus.id] : []);
  const [listOpen, setListOpen] = useState(false);
  const [zoneOpen, setZoneOpen] = useState(false);
  const [sheetHidden, setSheetHidden] = useState(false);
  // El texto de ayuda («Tocá un tramo…») sale las primeras 3 veces que se abre el mapa; después ya se sabe y ocupa lugar.
  const [showHint] = useState(() => {
    try {
      const n = Number(localStorage.getItem('vikarg.fishing.hintSeen') ?? 0);
      localStorage.setItem('vikarg.fishing.hintSeen', String(n + 1));
      return n < 3;
    } catch {
      return true;
    }
  });

  const setChosen = (ids: string[]) => {
    const next = new URLSearchParams(params);
    if (ids.length) next.set('fish', ids.join(','));
    else next.delete('fish');
    next.delete('sector');
    setParams(next, { replace: true });
    setListOpen(false);
  };
  const toggle = (id: string) => {
    if (chosen.includes(id)) setChosen(chosen.filter((x) => x !== id));
    else if (chosen.length < MAX_FISH) setChosen([...chosen, id]);
  };

  // Con peces elegidos, un color y un trazo por pez; si no, todos los tramos en un color neutro con su número de especies.
  const shown = useMemo(() => (chosen.length ? [...new Set(chosen.flatMap((id) => sectorsWithSpecies(data, id)))] : zoneSectors), [data, chosen.join(','), zoneSectors]);
  const fc = useMemo<FeatureCollection>(() => {
    // En «Todos», los tramos con la pesca prohibida van en rojo (y sin número).
    if (!chosen.length) return { type: 'FeatureCollection', features: [...zoneSectors.map((s) => feature(s, s.closed ? { color: FORBIDDEN_COLOR, dash: 'dot' } : { color: ALL_COLOR, dash: 'solid', label: String(s.species.length) })), ...nameFeatures(data.sectors)] };
    return {
      type: 'FeatureCollection',
      // Con varios peces, cada uno corrido unos píxeles (0, +4, −4, +8): en los tramos que comparten se ven todas las líneas.
      features: [...chosen.flatMap((id, i) => sectorsWithSpecies(data, id).map((s) => feature(s, { color: FISH_STYLES[i]!.color, dash: FISH_STYLES[i]!.dash, offset: chosen.length > 1 ? [0, 4, -4, 8][i] : 0 }))), ...nameFeatures(shown)],
    };
  }, [data, chosen.join(','), zoneSectors, shown]);

  // Al cambiar de zona (o de tramo elegido) el mapa vuela a lo nuevo; si no, los ríos de la zona quedaban fuera de la vista.
  const [fly, setFly] = useState<(ViewState & { key: number }) | null>(null);
  // Mi ubicación: el punto azul en el mapa y el botón para ir a ella (como en el mapa sin conexión).
  const { fix } = useGeolocation();
  const hereLoc = useMemo(() => (fix ? { lat: fix.lat, lon: fix.lon, accuracy: fix.accuracy } : null), [fix]);
  const target = focus ? focus.id : `zone:${z.zone ?? 'all'}`;
  const lastTarget = useRef(target);
  useEffect(() => {
    if (lastTarget.current === target) return;
    lastTarget.current = target;
    const b = boundsOf(focus ? [focus] : zoneSectors);
    if (!b) return;
    const span = Math.max(b[2] - b[0], (b[3] - b[1]) * 1.4, 0.02);
    const v = { lat: (b[1] + b[3]) / 2, lon: (b[0] + b[2]) / 2, zoom: Math.max(3, Math.min(14, Math.log2(360 / span) + 0.6)) };
    setFly({ ...v, key: Date.now() });
    setView(v);
    if (focus) setPicked([focus.id]);
  }, [target]);
  const [start] = useState<{ view: ViewState; bounds?: Bounds }>(() => {
    const b = boundsOf(focus ? [focus] : chosen.length ? shown : zoneSectors) ?? [-72, -46, -66, -36];
    return { view: { lat: (b[1] + b[3]) / 2, lon: (b[0] + b[2]) / 2, zoom: 7 }, bounds: b };
  });

  // Peces de lo que se ve: los que tienen algún tramo dentro del área visible (calculada con el centro y el zoom); los elegidos siempre.
  const [view, setView] = useState<ViewState>(start.view);
  const [habitat, setHabitat] = useHabitatFilter();
  const chipSpecies = useMemo(() => {
    const span = (360 / 2 ** view.zoom) * 2; // ~ 512 px de ancho de mapa
    const box = [view.lon - span, view.lat - span * 0.9, view.lon + span, view.lat + span * 0.9];
    const visible = zoneSectors.filter((s) => {
      const b = boundsOf([s]);
      return b && b[0] <= box[2]! && b[2] >= box[0]! && b[1] <= box[3]! && b[3] >= box[1]!;
    });
    const count = (id: string) => visible.filter((s) => s.species.some((x) => x.id === id)).length;
    const here = data.species.filter((sp) => count(sp.id) > 0).sort((a, b) => speciesName(a, lang).localeCompare(speciesName(b, lang), lang));
    const list = (here.length ? here : speciesInZone(data, z.zone)).filter((sp) => matchesHabitat(sp, habitat));
    return [...chosen.map((id) => speciesById(data, id)!).filter((sp) => !list.includes(sp)), ...list];
  }, [data, view.lat, view.lon, view.zoom, z.zone, chosen.join(','), zoneSectors, habitat]);

  const pickedSectors = picked.map((id) => data.sectors.find((s) => s.id === id)).filter((s): s is FishSector => !!s);
  const title = chosen.length === 1 ? speciesName(speciesById(data, chosen[0]!)!, lang) : null;

  return (
    <FullscreenStage className="maps-stage fish-map" data-testid="fish-map">
      <MapView
        initial={start.view}
        initialBounds={start.bounds}
        layers={{ ...layers, ...extra, terrain3d: false, ecoregions: false, geology: false, slope: false }}
        showMine={false}
        waypoints={NONE}
        routes={NONE}
        tracks={NONE}
        showTracks={false}
        here={hereLoc}
        zones={NONE}
        preview={null}
        outline={outline}
        flyTo={fly}
        fishing={fc}
        onMove={setView}
        onWaypoint={() => undefined}
        onFishingPick={(ids) => {
          setPicked(ids);
          setListOpen(false);
        }}
        onPick={() => setPicked([])}
      />
      <button
        className="icon-btn maps-locate fish-locate"
        type="button"
        data-testid="fish-locate"
        aria-label={fix ? t('maps.goHere') : t('fishing.locating')}
        aria-busy={!fix}
        onClick={() => fix && setFly({ lat: fix.lat, lon: fix.lon, zoom: Math.max(view.zoom, 11), key: Date.now() })}
      >
        {fix ? <Locate size={20} aria-hidden /> : <Loader2 size={20} className="spin" aria-hidden />}
      </button>
      <button className="icon-btn fish-layers-btn" type="button" aria-expanded={layersOpen} aria-label={t('fishing.layers.title')} data-testid="fish-layers" onClick={() => setLayersOpen(!layersOpen)}>
        <Layers size={20} aria-hidden />
      </button>
      {layersOpen && (
        <div className="card fish-layers-panel" data-testid="fish-layers-panel">
          <strong>{t('fishing.layers.title')}</strong>
          {(['hillshade', 'contours'] as const).map((k) => (
            <label key={k} className="check">
              <input type="checkbox" checked={extra[k]} onChange={() => toggleExtra(k)} data-testid={`fish-layer-${k}`} /> {t(`fishing.layers.${k}`)}
            </label>
          ))}
        </div>
      )}
      <div className="fish-chips" role="group" aria-label={t('fishing.chooseFish')} data-testid="fish-chips">
        <button type="button" className="chip" aria-pressed={!chosen.length} onClick={() => setChosen([])}>
          {t('fishing.all')}
        </button>
        {chipSpecies.map((sp) => {
          const i = chosen.indexOf(sp.id);
          const style = i >= 0 ? FISH_STYLES[i] : undefined;
          return (
            <button
              key={sp.id}
              type="button"
              className="chip"
              aria-pressed={i >= 0}
              disabled={i < 0 && chosen.length >= MAX_FISH}
              onClick={() => toggle(sp.id)}
              data-testid={`fish-chip-${sp.id}`}
            >
              {style && <span className={`fish-swatch fish-swatch-${style.dash}`} style={{ color: style.color }} aria-hidden />}
              {speciesName(sp, lang)}
            </button>
          );
        })}
      </div>
      {/* El panel de zona y tramos se puede ocultar para ver el mapa entero; queda un botón chico para volver a mostrarlo. */}
      {sheetHidden && !pickedSectors.length ? (
        <button type="button" className="btn btn-small fish-sheet-show" onClick={() => setSheetHidden(false)} data-testid="fish-sheet-show">
          <ChevronUp size={16} aria-hidden /> {t('fishing.showPanel')}
        </button>
      ) : (
      <div className="card fish-sheet" data-testid="fish-sheet">
        {!pickedSectors.length && (
          <button type="button" className="icon-btn fish-sheet-hide" aria-label={t('fishing.hidePanel')} title={t('fishing.hidePanel')} onClick={() => setSheetHidden(true)} data-testid="fish-sheet-hide">
            <ChevronDown size={20} aria-hidden />
          </button>
        )}
        {/* La zona ocupa lugar sobre el mapa: plegada muestra solo su nombre; se despliega para cambiarla. */}
        {!pickedSectors.length && <HabitatPicker value={habitat} onChange={setHabitat} />}
        {!pickedSectors.length &&
          (zoneOpen ? (
            <div className="fish-zone-open">
              <ZonePicker
                data={data}
                {...z}
                setZone={(v) => {
                  z.setZone(v);
                  setZoneOpen(false);
                }}
              />
              <button className="icon-btn" type="button" aria-label={t('common.close')} onClick={() => setZoneOpen(false)}>
                <X size={20} />
              </button>
            </div>
          ) : null)}
        {pickedSectors.length > 0 ? (
          <>
            <div className="fish-sheet-head">
              <strong>{pickedSectors.length > 1 ? t('fishing.crossing', { count: pickedSectors.length }) : pickedSectors[0]!.water}</strong>
              <button className="icon-btn" type="button" aria-label={t('common.close')} onClick={() => setPicked([])}>
                <X size={20} />
              </button>
            </div>
            <ul className="list fish-sheet-list" data-testid="fish-picked">
              {pickedSectors.map((s) => (
                <li key={s.id}>
                  <Link className="list-row" to={`/fishing/sector/${s.id}`}>
                    <span className="list-main">
                      {pickedSectors.length > 1 && <span className="list-title">{s.water}</span>}
                      <span className="list-sub">{s.name}</span>
                      <span className="list-sub">
                        <SectorSeasonBadge data={data} sector={s} /> ·{' '}
                        {s.species
                          .map((x) => speciesById(data, x.id))
                          .filter((sp) => !!sp)
                          .map((sp) => speciesName(sp, lang))
                          .join(', ')}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            {/* Zona (plegada), cantidad de tramos y «Ver lista» en una sola fila, para que el panel ocupe menos. */}
            <div className="fish-sheet-head">
              {!zoneOpen && (data.zones?.length ?? 0) > 1 && (
                <button type="button" className="btn btn-small fish-zone-toggle" aria-expanded={false} onClick={() => setZoneOpen(true)} data-testid="fish-zone-toggle">
                  {z.zone ? zoneName(data.zones!.find((x) => x.id === z.zone)!, lang) : t('fishing.zone.all')} <ChevronDown size={16} aria-hidden />
                </button>
              )}
              <span data-testid="fish-count">{title ? t('fishing.sectorsWith', { count: shown.length, fish: title }) : t('fishing.sectorsShown', { count: shown.length })}</span>
              <button className="btn" type="button" onClick={() => setListOpen((v) => !v)} aria-expanded={listOpen}>
                {listOpen ? t('common.close') : t('fishing.seeList')}
              </button>
            </div>
            {listOpen && (
              <ul className="list fish-sheet-list">
                {shown.map((s) => (
                  <li key={s.id}>
                    <Link className="list-row" to={`/fishing/sector/${s.id}`}>
                      <span className="list-main">
                        <span className="list-title">{s.water}</span>
                        <span className="list-sub">
                          <SectorSeasonBadge data={data} sector={s} />
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {!chosen.length && showHint && <p className="muted small">{t('fishing.tapHint')}</p>}
          </>
        )}
      </div>
      )}
    </FullscreenStage>
  );
}
