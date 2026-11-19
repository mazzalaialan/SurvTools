import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FeatureCollection } from 'geojson';
import { formatDms, type LatLon } from '@/core/geo/geo';
import { useSettings } from '@/core/settings/settings';
import { useCountry } from '@/modules/emergency/currentCountry';
import { loadGeoData } from '@/modules/weathermap/geo';
import { homeBounds } from '@/modules/weathermap/projection';
import { Dialog } from '@/ui/Dialog';
import { MapView, type ViewState } from './MapView';
import { outlineFeatures } from './outline';

const NONE: never[] = [];

/**
 * Elegir un punto tocando el mapa (los mapas offline; sin conexión ni zonas
 * descargadas, al menos el contorno). Va en su propio archivo: MapLibre se
 * carga recién al abrirlo.
 */
export function MapPointDialog({ initial, onPick, onClose }: { initial: LatLon | null; onPick: (p: LatLon) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const layers = useSettings((s) => s.settings.mapLayers);
  const country = useCountry();
  const [picked, setPicked] = useState<LatLon | null>(initial);
  const [outline, setOutline] = useState<FeatureCollection | null>(null);
  const [start] = useState<ViewState>(() => {
    if (initial) return { lat: initial.lat, lon: initial.lon, zoom: 12 };
    const b = homeBounds(country);
    return { lat: (b.north + b.south) / 2, lon: (b.west + b.east) / 2, zoom: 4 };
  });
  useEffect(() => {
    void loadGeoData().then((geo) => setOutline(outlineFeatures(geo)));
  }, []);
  const marker = useMemo(() => (picked ? [{ id: 'picked', name: '', lat: picked.lat, lon: picked.lon }] : NONE), [picked]);
  return (
    <Dialog
      title={t('mapPick.title')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn-primary" type="button" disabled={!picked} onClick={() => picked && onPick(picked)}>
            {t('mapPick.use')}
          </button>
        </>
      }
    >
      <p className="hint" style={{ margin: 0 }} data-testid="map-pick-hint">
        {picked ? formatDms(picked, t('geo.westLetter')) : t('mapPick.hint')}
      </p>
      <div className="map-pick" data-testid="map-pick">
        <MapView
          initial={start}
          layers={layers}
          showMine
          waypoints={marker}
          routes={NONE}
          tracks={NONE}
          showTracks={false}
          here={null}
          zones={NONE}
          preview={null}
          outline={outline}
          flyTo={null}
          tool="target"
          target={null}
          onMapClick={(p) => setPicked({ lat: Math.round(p.lat * 1e6) / 1e6, lon: Math.round(p.lon * 1e6) / 1e6 })}
          onMove={() => undefined}
          onWaypoint={() => undefined}
        />
      </div>
    </Dialog>
  );
}
