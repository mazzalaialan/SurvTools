import { useEffect, useMemo, useState } from 'react';
import type { Feature, FeatureCollection } from 'geojson';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { X } from 'lucide-react';
import { useSettings } from '@/core/settings/settings';
import { MapView, type ViewState } from '@/modules/maps/MapView';
import { outlineFeatures } from '@/modules/maps/outline';
import { loadGeoData } from '@/modules/weathermap/geo';
import { FullscreenStage } from '@/ui/FullscreenStage';
import { sectorsWithSpecies, speciesById, speciesName, type FishData, type FishSector } from './fishing';
import { FISH_STYLES, FishDataGate, MAX_FISH, SectorSeasonBadge } from './parts';
import { useFishData } from './useFishData';

const NONE: never[] = [];
/** Color de los tramos en «Todos» (neutro: cada tramo lleva el número de especies). */
const ALL_COLOR = '#5b6b7a';

type Bounds = [number, number, number, number];

function boundsOf(sectors: FishSector[]): Bounds | undefined {
  const pts = sectors.flatMap((s) => (s.geometry.type === 'LineString' ? s.geometry.coordinates : s.geometry.coordinates.flat()));
  if (!pts.length) return undefined;
  const lons = pts.map((p) => p[0]);
  const lats = pts.map((p) => p[1]);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}

const feature = (s: FishSector, props: Record<string, unknown>): Feature => ({ type: 'Feature', id: s.id, properties: { id: s.id, ...props }, geometry: s.geometry as Feature['geometry'] });

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
  const [outline, setOutline] = useState<FeatureCollection | null>(null);
  useEffect(() => {
    void loadGeoData().then((geo) => setOutline(outlineFeatures(geo)));
  }, []);

  const chosen = (params.get('fish') ?? '').split(',').filter((id) => id && speciesById(data, id)).slice(0, MAX_FISH);
  const focus = data.sectors.find((s) => s.id === params.get('sector'));
  const [picked, setPicked] = useState<string[]>(focus ? [focus.id] : []);
  const [listOpen, setListOpen] = useState(false);

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
  const shown = useMemo(() => (chosen.length ? [...new Set(chosen.flatMap((id) => sectorsWithSpecies(data, id)))] : data.sectors), [data, chosen.join(',')]);
  const fc = useMemo<FeatureCollection>(() => {
    if (!chosen.length) return { type: 'FeatureCollection', features: data.sectors.map((s) => feature(s, { color: ALL_COLOR, dash: 'solid', label: String(s.species.length) })) };
    return {
      type: 'FeatureCollection',
      features: chosen.flatMap((id, i) => sectorsWithSpecies(data, id).map((s) => feature(s, { color: FISH_STYLES[i]!.color, dash: FISH_STYLES[i]!.dash }))),
    };
  }, [data, chosen.join(',')]);

  const [start] = useState<{ view: ViewState; bounds?: Bounds }>(() => {
    const b = boundsOf(focus ? [focus] : shown) ?? [-72, -46, -66, -36];
    return { view: { lat: (b[1] + b[3]) / 2, lon: (b[0] + b[2]) / 2, zoom: 7 }, bounds: b };
  });

  const pickedSectors = picked.map((id) => data.sectors.find((s) => s.id === id)).filter((s): s is FishSector => !!s);
  const title = chosen.length === 1 ? speciesName(speciesById(data, chosen[0]!)!, lang) : null;

  return (
    <FullscreenStage className="maps-stage fish-map" data-testid="fish-map">
      <MapView
        initial={start.view}
        initialBounds={start.bounds}
        layers={{ ...layers, ecoregions: false, geology: false, slope: false }}
        showMine={false}
        waypoints={NONE}
        routes={NONE}
        tracks={NONE}
        showTracks={false}
        here={null}
        zones={NONE}
        preview={null}
        outline={outline}
        flyTo={null}
        fishing={fc}
        onMove={() => undefined}
        onWaypoint={() => undefined}
        onFishingPick={(ids) => {
          setPicked(ids);
          setListOpen(false);
        }}
        onPick={() => setPicked([])}
      />
      <div className="fish-chips" role="group" aria-label={t('fishing.chooseFish')} data-testid="fish-chips">
        <button type="button" className="chip" aria-pressed={!chosen.length} onClick={() => setChosen([])}>
          {t('fishing.all')}
        </button>
        {data.species.map((sp) => {
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
      <div className="card fish-sheet" data-testid="fish-sheet">
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
            <div className="fish-sheet-head">
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
            {!chosen.length && <p className="muted small">{t('fishing.tapHint')}</p>}
          </>
        )}
      </div>
    </FullscreenStage>
  );
}
