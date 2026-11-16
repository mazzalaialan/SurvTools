import { circleBounds } from './tiles';
import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import { TRACK_PALETTE } from './trackSelect';
import 'maplibre-gl/dist/maplibre-gl.css';
import { angleDiff } from '@/core/sensors/heading';
import { useEffectiveTheme } from '@/core/settings/theme';
import { setupProtocols } from './protocols';
import { buildStyle, MAX_PITCH_3D, PITCH_3D, slopeTiles, TERRAIN, themeColors, type MapColors, type MapLayersOn } from './style';

export interface MapPoint {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Color del punto según el tema (p. ej. policía en azul, bomberos en rojo); sin esto, el de acento. */
  tone?: 'info' | 'danger' | 'ok' | 'warn';
}

export interface MapCircle {
  id: string;
  name: string;
  lat: number;
  lon: number;
  radiusKm: number;
}

export interface ViewState {
  lat: number;
  lon: number;
  zoom: number;
}

interface Props {
  initial: ViewState;
  /** Encuadre inicial [oeste, sur, este, norte]: si está, manda sobre el centro y el zoom de `initial`. */
  initialBounds?: [number, number, number, number];
  layers: MapLayersOn;
  showMine: boolean;
  waypoints: MapPoint[];
  routes: { id: string; name: string; points: [number, number][] }[];
  /** Tracks importados (GPX): recorrido y sus puntos, aparte de lo propio. */
  tracks: MapTrack[];
  showTracks: boolean;
  here: { lat: number; lon: number; accuracy: number } | null;
  zones: MapCircle[];
  preview: MapCircle | null;
  /** Contorno de la región (sin conexión y fuera de las zonas, al menos se ve dónde estás). */
  outline: FeatureCollection | null;
  /** Ecorregiones (capa opcional): un polígono por ecorregión con su color y nombre. */
  ecoregions?: FeatureCollection | null;
  /** Geología (capa opcional): unidades de SEGEMAR pintadas por edad. */
  geology?: FeatureCollection | null;
  /** Cambia cuando se importa o borra un mapa: se vuelven a pedir las teselas. */
  tilesVersion?: number;
  /** Cambia `key` para mover la vista. */
  flyTo: (ViewState & { key: number }) | null;
  /** Vista que sigue tu posición (y gira con el rumbo, si hay) o libre. */
  follow?: boolean;
  /** Rumbo geográfico hacia donde mirás, para girar el mapa al seguirte. */
  heading?: number | null;
  /** Moviste el mapa con la mano: se deja de seguir. */
  onFollowBreak?: () => void;
  /** Parte ya recorrida del track que se está siguiendo, en [lon, lat]. */
  done?: [number, number][] | null;
  /** Recorrido que se está grabando, en tramos de [lon, lat]. */
  recorded?: [number, number][][] | null;
  /** Rectas de los cortes (pantalla apagada) de lo grabado y de los tracks a la vista, en [lon, lat]: van en otro color y punteadas. */
  gapLines?: [number, number][][];
  onMove: (view: ViewState) => void;
  onWaypoint: (id: string) => void;
  /** Herramienta activa: el toque en el mapa marca un punto (y no abre waypoints). */
  tool?: 'measure' | 'target' | null;
  /** Puntos de la medición, en [lon, lat]. */
  measure?: [number, number][];
  /** Línea desde el origen hasta el punto marcado, en [lon, lat]. */
  target?: { from: [number, number]; to: [number, number] | null } | null;
  onMapClick?: (p: { lat: number; lon: number }) => void;
  /** Toque en el mapa sin herramienta activa (por ejemplo para ver la ecorregión de ese punto). */
  onPick?: (p: { lat: number; lon: number }) => void;
  /** Clic derecho (o mantener apretado): menú con las herramientas en ese punto (x, y dentro del mapa). */
  onContextMenu?: (p: { lat: number; lon: number }, x: number, y: number, width: number, height: number) => void;
  /** Se movió el mapa: se cierra el menú. */
  onMoveStart?: () => void;
}

export interface MapTrack {
  id: string;
  name: string;
  /** Posición en la lista de los que se ven (da el color cuando hay varios a la vez). */
  index?: number;
  /** Segmentos en [lon, lat]. */
  lines: [number, number][][];
  points: { name: string; lon: number; lat: number }[];
}

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

/** Círculo geodésico aproximado (64 lados) para dibujar una zona. */
export function circlePolygon(lat: number, lon: number, radiusKm: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * 2 * Math.PI;
    out.push([lon + (radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.sin(a), lat + (radiusKm / 111.32) * Math.cos(a)]);
  }
  return out;
}

/** El cuadrado que de verdad se baja (lado de 2 × el radio): es el rectángulo de teselas de `circleBounds`, no el círculo. */
export function squarePolygon(lat: number, lon: number, halfKm: number): [number, number][] {
  const b = circleBounds(lat, lon, halfKm);
  return [[b.west, b.north], [b.east, b.north], [b.east, b.south], [b.west, b.south], [b.west, b.north]];
}

const circlesGeo = (circles: MapCircle[]): FeatureCollection => ({
  type: 'FeatureCollection',
  features: circles.map((c) => ({ type: 'Feature', properties: { id: c.id, name: c.name }, geometry: { type: 'Polygon', coordinates: [squarePolygon(c.lat, c.lon, c.radiusKm)] } })),
});

function data(p: Props) {
  return {
    'mine-waypoints': {
      type: 'FeatureCollection',
      features: p.waypoints.map((w) => ({ type: 'Feature', properties: { id: w.id, name: w.name, tone: w.tone ?? '' }, geometry: { type: 'Point', coordinates: [w.lon, w.lat] } })),
    } as FeatureCollection,
    'mine-routes': {
      type: 'FeatureCollection',
      features: p.routes.filter((r) => r.points.length > 1).map((r) => ({ type: 'Feature', properties: { id: r.id, name: r.name }, geometry: { type: 'LineString', coordinates: r.points } })),
    } as FeatureCollection,
    'track-lines': {
      type: 'FeatureCollection',
      features: p.tracks.map((t) => ({ type: 'Feature', properties: { id: t.id, name: t.name, i: t.index ?? 0 }, geometry: { type: 'MultiLineString', coordinates: t.lines } })),
    } as FeatureCollection,
    'track-points': {
      type: 'FeatureCollection',
      features: p.tracks.flatMap((t) => t.points.map((w) => ({ type: 'Feature', properties: { track: t.id, name: w.name }, geometry: { type: 'Point', coordinates: [w.lon, w.lat] } }))),
    } as FeatureCollection,
    'track-done': (p.done && p.done.length > 1
      ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: p.done } }] }
      : EMPTY) as FeatureCollection,
    'track-rec': (p.recorded?.some((s) => s.length > 1)
      ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: p.recorded.filter((s) => s.length > 1) } }] }
      : EMPTY) as FeatureCollection,
    'track-gaps': (p.gapLines?.length
      ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: p.gapLines } }] }
      : EMPTY) as FeatureCollection,
    here: (p.here
      ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { accuracy: p.here.accuracy }, geometry: { type: 'Point', coordinates: [p.here.lon, p.here.lat] } }] }
      : EMPTY) as FeatureCollection,
    zones: circlesGeo(p.zones),
    preview: circlesGeo(p.preview ? [p.preview] : []),
    outline: p.outline ?? EMPTY,
    ecoregions: p.ecoregions ?? EMPTY,
    geology: p.geology ?? EMPTY,
    'measure-line': (p.measure && p.measure.length > 1
      ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: p.measure } }] }
      : EMPTY) as FeatureCollection,
    'measure-points': {
      type: 'FeatureCollection',
      features: (p.measure ?? []).map((c, i) => ({ type: 'Feature', properties: { n: String(i + 1) }, geometry: { type: 'Point', coordinates: c } })),
    } as FeatureCollection,
    'target-line': (p.target
      ? {
          type: 'FeatureCollection',
          features: [
            ...(p.target.to
              ? [
                  { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [p.target.from, p.target.to] } },
                  { type: 'Feature', properties: { end: 'to' }, geometry: { type: 'Point', coordinates: p.target.to } },
                ]
              : []),
            { type: 'Feature', properties: { end: 'from' }, geometry: { type: 'Point', coordinates: p.target.from } },
          ],
        }
      : EMPTY) as FeatureCollection,
  };
}

/**
 * Capas de áreas (ecorregiones y geología): se agregan recién cuando se prende cada una (con sus fuentes de datos), no al crear el mapa:
 * el mapa de seguimiento y el 3D, que corren sin placa de video en las pruebas y en teléfonos modestos, no cargan capas que no se usan.
 */
function ensureAreaLayers(map: MlMap, c: MapColors, p: Props) {
  const d = data(p);
  if (p.layers.ecoregions && !map.getLayer('ecoregion-fill')) {
    if (!map.getSource('ecoregions')) map.addSource('ecoregions', { type: 'geojson', data: d.ecoregions });
    // Ecorregiones: relleno suave con el color de cada una, borde fino y el nombre (debajo de caminos y rótulos del mapa base).
    map.addLayer({ id: 'ecoregion-fill', type: 'fill', source: 'ecoregions', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.3 } }, 'landcover-wood');
    map.addLayer({ id: 'ecoregion-line', type: 'line', source: 'ecoregions', paint: { 'line-color': ['get', 'color'], 'line-width': 1.2, 'line-opacity': 0.8 } }, 'landcover-wood');
    map.addLayer({
      id: 'ecoregion-names',
      type: 'symbol',
      source: 'ecoregions',
      minzoom: 4,
      layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Italic'], 'text-size': 12, 'symbol-placement': 'point', 'text-max-width': 8 },
      paint: { 'text-color': c.text, 'text-halo-color': c.surface, 'text-halo-width': 2, 'text-opacity': 0.85 },
    });
  }
  if (p.layers.geology && !map.getLayer('geology-fill')) {
    if (!map.getSource('geology')) map.addSource('geology', { type: 'geojson', data: d.geology });
    // Geología: relleno por edad de la roca y borde fino (en el mismo lugar que las ecorregiones: nunca se prenden las dos a la vez).
    map.addLayer({ id: 'geology-fill', type: 'fill', source: 'geology', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.5 } }, 'landcover-wood');
    map.addLayer({ id: 'geology-line', type: 'line', source: 'geology', paint: { 'line-color': '#5d4037', 'line-width': 0.6, 'line-opacity': 0.5 } }, 'landcover-wood');
  }
}

/** Capas propias encima del estilo base; se vuelven a agregar cada vez que cambia el estilo (tema). */
function addOverlays(map: MlMap, c: MapColors, p: Props) {
  const d = data(p);
  for (const [id, fc] of Object.entries(d)) if (id !== 'ecoregions' && id !== 'geology' && !map.getSource(id)) map.addSource(id, { type: 'geojson', data: fc });
  ensureAreaLayers(map, c, p);
  const mine = p.showMine ? 'visible' : 'none';
  // El contorno va debajo de todo lo dibujado del mapa, pero arriba del fondo.
  // Contorno de referencia (sin teselas): provincias de un color y países de otro, más marcados.
  map.addLayer(
    {
      id: 'outline',
      type: 'line',
      source: 'outline',
      paint: {
        'line-color': ['match', ['get', 'kind'], 'country', c.country, c.province],
        'line-width': ['match', ['get', 'kind'], 'country', 1.6, 0.8],
      },
    },
    'landcover-wood',
  );
  map.addLayer({ id: 'zones-fill', type: 'fill', source: 'zones', paint: { 'fill-color': c.info, 'fill-opacity': 0.07 } });
  map.addLayer({ id: 'zones', type: 'line', source: 'zones', paint: { 'line-color': c.info, 'line-width': 1.5, 'line-dasharray': [3, 2] } });
  map.addLayer({ id: 'preview-fill', type: 'fill', source: 'preview', paint: { 'fill-color': c.accent, 'fill-opacity': 0.12 } });
  map.addLayer({ id: 'preview-line', type: 'line', source: 'preview', paint: { 'line-color': c.accent, 'line-width': 2 } });
  // Tracks importados: en otro color, para no confundirlos con las rutas propias.
  const tracks = p.showTracks ? 'visible' : 'none';
  map.addLayer({ id: 'track-lines', type: 'line', source: 'track-lines', layout: { visibility: tracks, 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['match', ['%', ['to-number', ['get', 'i'], 0], TRACK_PALETTE.length], ...TRACK_PALETTE.slice(1).flatMap((color, k) => [k + 1, color]), c.info] as unknown as string, 'line-width': 3.5, 'line-opacity': 0.9 } });
  map.addLayer({ id: 'track-done', type: 'line', source: 'track-done', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': c.accent, 'line-width': 5 } });
  // Lo que vas grabando: en verde, encima del track que seguís.
  map.addLayer({
    id: 'track-rec',
    type: 'line',
    source: 'track-rec',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': c.ok, 'line-width': 4, 'line-opacity': 0.95 },
  });
  // Los cortes (pantalla apagada): una recta punteada en otro color, para distinguirla de lo medido.
  map.addLayer({
    id: 'track-gaps',
    type: 'line',
    source: 'track-gaps',
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: { 'line-color': c.warn, 'line-width': 4, 'line-dasharray': [1.5, 1.5], 'line-opacity': 0.95 },
  });
  map.addLayer({ id: 'track-points', type: 'circle', source: 'track-points', layout: { visibility: tracks }, paint: { 'circle-radius': 4.5, 'circle-color': c.info, 'circle-stroke-color': c.bg, 'circle-stroke-width': 1.5 } });
  map.addLayer({
    id: 'track-point-names',
    type: 'symbol',
    source: 'track-points',
    minzoom: 12,
    layout: { visibility: tracks, 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 11, 'text-offset': [0, 1], 'text-anchor': 'top' },
    paint: { 'text-color': c.text, 'text-halo-color': c.surface, 'text-halo-width': 2 },
  });
  map.addLayer({ id: 'mine-routes', type: 'line', source: 'mine-routes', layout: { visibility: mine, 'line-cap': 'round' }, paint: { 'line-color': c.accent, 'line-width': 3, 'line-opacity': 0.85 } });
  map.addLayer({
    id: 'mine-waypoints',
    type: 'circle',
    source: 'mine-waypoints',
    layout: { visibility: mine },
    paint: { 'circle-radius': 6, 'circle-color': ['match', ['get', 'tone'], 'info', c.info, 'danger', c.danger, 'ok', c.ok, 'warn', c.warn, c.accent], 'circle-stroke-color': c.bg, 'circle-stroke-width': 2 },
  });
  map.addLayer({
    id: 'mine-waypoint-names',
    type: 'symbol',
    source: 'mine-waypoints',
    layout: { visibility: mine, 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 12, 'text-offset': [0, 1.2], 'text-anchor': 'top' },
    paint: { 'text-color': c.text, 'text-halo-color': c.surface, 'text-halo-width': 2 },
  });
  // Herramientas: medición (línea punteada con puntos numerados) y dirección a un punto.
  map.addLayer({ id: 'measure-line', type: 'line', source: 'measure-line', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': c.warn, 'line-width': 3, 'line-dasharray': [2, 1.5] } });
  map.addLayer({
    id: 'measure-points',
    type: 'circle',
    source: 'measure-points',
    paint: { 'circle-radius': 6, 'circle-color': c.warn, 'circle-stroke-color': c.bg, 'circle-stroke-width': 2, 'circle-pitch-alignment': 'viewport' },
  });
  map.addLayer({
    id: 'measure-numbers',
    type: 'symbol',
    source: 'measure-points',
    layout: { 'text-field': ['get', 'n'], 'text-font': ['Noto Sans Bold'], 'text-size': 11, 'text-offset': [0, -1.3], 'text-allow-overlap': true },
    paint: { 'text-color': c.text, 'text-halo-color': c.surface, 'text-halo-width': 2 },
  });
  map.addLayer({ id: 'target-line', type: 'line', source: 'target-line', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': c.danger, 'line-width': 2.5, 'line-dasharray': [3, 2] } });
  map.addLayer({
    id: 'target-from',
    type: 'circle',
    source: 'target-line',
    filter: ['==', ['get', 'end'], 'from'],
    paint: { 'circle-radius': 6, 'circle-color': c.bg, 'circle-stroke-color': c.danger, 'circle-stroke-width': 3, 'circle-pitch-alignment': 'viewport' },
  });
  map.addLayer({
    id: 'target-point',
    type: 'circle',
    source: 'target-line',
    filter: ['==', ['get', 'end'], 'to'],
    paint: { 'circle-radius': 7, 'circle-color': c.danger, 'circle-stroke-color': c.bg, 'circle-stroke-width': 2, 'circle-pitch-alignment': 'viewport' },
  });
  // Mirando a la pantalla: en 3D no se aplasta con la inclinación.
  map.addLayer({
    id: 'here',
    type: 'circle',
    source: 'here',
    paint: { 'circle-radius': 7, 'circle-color': c.info, 'circle-stroke-color': c.text, 'circle-stroke-width': 2, 'circle-pitch-alignment': 'viewport' },
  });
}

export function MapView(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const theme = useEffectiveTheme();
  const styleReady = useRef(false);
  /** Inclinación a la que se está yendo al pasar a 3D o a plano (el seguimiento la respeta). */
  const pendingPitch = useRef<number | null>(null);

  /** Relieve, inclinación permitida y la inclinación actual según 3D o plano. */
  function syncTerrain(m: MlMap) {
    const on = latest.current.layers.terrain3d;
    m.setTerrain(on ? TERRAIN : null);
    // El relieve ya está puesto (o sacado): no depende de que termine la animación de inclinación,
    // que el seguimiento de posición puede cortar.
    container.current?.setAttribute('data-terrain', on ? 'on' : 'off');
    if (on) m.setMaxPitch(MAX_PITCH_3D);
    const target = on ? (m.getPitch() > 0 ? m.getPitch() : PITCH_3D) : 0;
    if (m.getPitch() === target) {
      if (!on) m.setMaxPitch(0);
      return;
    }
    pendingPitch.current = target;
    m.easeTo({ pitch: target, duration: 500 });
    m.once('moveend', () => {
      pendingPitch.current = null;
      if (!latest.current.layers.terrain3d) m.setMaxPitch(0);
    });
  }

  useEffect(() => {
    const { contoursUrl } = setupProtocols();
    const m = new maplibregl.Map({
      container: container.current!,
      style: buildStyle(themeColors(), contoursUrl, props.layers),
      center: [props.initial.lon, props.initial.lat],
      zoom: props.initial.zoom,
      ...(props.initialBounds && { bounds: props.initialBounds, fitBoundsOptions: { padding: 48, maxZoom: 15 } }),
      attributionControl: { compact: true },
      maxZoom: 17,
      pitch: props.layers.terrain3d ? PITCH_3D : 0,
      maxPitch: props.layers.terrain3d ? MAX_PITCH_3D : 0,
    });
    map.current = m;
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    m.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
    m.on('style.load', () => {
      addOverlays(m, themeColors(), latest.current);
      styleReady.current = true;
      syncTerrain(m);
    });
    // Los créditos arrancan plegados (botón "i"): abiertos tapan la escala y el botón de ubicación en el celular.
    // MapLibre los vuelve a abrir al cambiar de tamaño (pantalla completa): se pliegan de nuevo.
    const foldAttribution = () => container.current?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
    m.once('load', foldAttribution);
    m.on('resize', foldAttribution);
    m.on('moveend', () => {
      // Inclinación y relieve a la vista (para las pruebas y para depurar en el celular).
      container.current?.setAttribute('data-pitch', String(Math.round(m.getPitch())));
      container.current?.setAttribute('data-terrain', m.getTerrain() ? 'on' : 'off');
      const c = m.getCenter();
      latest.current.onMove({ lat: c.lat, lon: c.lng, zoom: m.getZoom() });
    });
    m.on('contextmenu', (e) => {
      e.preventDefault();
      const box = m.getContainer();
      latest.current.onContextMenu?.({ lat: e.lngLat.lat, lon: e.lngLat.lng }, e.point.x, e.point.y, box.clientWidth, box.clientHeight);
    });
    m.on('movestart', () => latest.current.onMoveStart?.());
    // Con una herramienta activa, el toque marca un punto.
    m.on('click', (e) => {
      if (latest.current.tool) latest.current.onMapClick?.({ lat: e.lngLat.lat, lon: e.lngLat.lng });
      else latest.current.onPick?.({ lat: e.lngLat.lat, lon: e.lngLat.lng });
    });
    m.on('click', 'mine-waypoints', (e) => {
      if (latest.current.tool) return;
      const id = e.features?.[0]?.properties?.id as string | undefined;
      if (id) latest.current.onWaypoint(id);
    });
    // Arrastrar o girar con la mano corta el seguimiento (acercar o inclinar, no).
    const breakFollow = (e: { originalEvent?: unknown }) => {
      if (e.originalEvent && latest.current.follow) latest.current.onFollowBreak?.();
    };
    m.on('dragstart', breakFollow);
    m.on('rotatestart', breakFollow);
    m.on('mouseenter', 'mine-waypoints', () => (m.getCanvas().style.cursor = 'pointer'));
    m.on('mouseleave', 'mine-waypoints', () => (m.getCanvas().style.cursor = ''));
    return () => {
      m.remove();
      map.current = null;
    };
    // El mapa se crea una vez; lo demás se actualiza abajo.
  }, []);

  // Cambio de tema: estilo nuevo con los colores nuevos (se leen después de que el tema se aplicó).
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const frame = requestAnimationFrame(() => {
      styleReady.current = false;
      m.setStyle(buildStyle(themeColors(), setupProtocols().contoursUrl, latest.current.layers));
    });
    return () => cancelAnimationFrame(frame);
  }, [theme]);

  useEffect(() => {
    const m = map.current;
    // `isStyleLoaded()` da falso mientras bajan teselas: se usa la carga del estilo en sí.
    if (!m || !styleReady.current) return;
    ensureAreaLayers(m, themeColors(), props);
    for (const id of ['geology-fill', 'geology-line']) if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', props.layers.geology ? 'visible' : 'none');
    for (const id of ['ecoregion-fill', 'ecoregion-line', 'ecoregion-names']) if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', props.layers.ecoregions ? 'visible' : 'none');
    for (const id of ['hillshade']) if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', props.layers.hillshade ? 'visible' : 'none');
    if (m.getLayer('slope')) m.setLayoutProperty('slope', 'visibility', props.layers.slope ? 'visible' : 'none');
    for (const id of ['contour-lines', 'contour-labels']) if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', props.layers.contours ? 'visible' : 'none');
    for (const id of ['mine-routes', 'mine-waypoints', 'mine-waypoint-names']) if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', props.showMine ? 'visible' : 'none');
    for (const id of ['track-lines', 'track-points', 'track-point-names']) if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', props.showTracks ? 'visible' : 'none');
  }, [props.layers.hillshade, props.layers.contours, props.layers.slope, props.layers.ecoregions, props.layers.geology, props.showMine, props.showTracks]);

  // Nueva línea de nieve: se vuelven a pintar las teselas de pendiente.
  useEffect(() => {
    const src = map.current?.getSource('slope') as { setTiles?: (tiles: string[]) => void } | undefined;
    if (styleReady.current) src?.setTiles?.(slopeTiles(props.layers.slopeMin, props.layers.slopeLee, props.layers.slopeLeeUsual, props.layers.slopeCornice));
  }, [props.layers.slopeMin, props.layers.slopeLee?.join(','), props.layers.slopeLeeUsual?.join(','), props.layers.slopeCornice?.join(',')]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    for (const [id, fc] of Object.entries(data(props))) (m.getSource(id) as GeoJSONSource | undefined)?.setData(fc);
    // Puntos grabados a la vista (para las pruebas).
    container.current?.setAttribute('data-recorded', String(props.recorded?.flat().length ?? 0));
    container.current?.setAttribute('data-measure', String(props.measure?.length ?? 0));
    // Rectas de corte y recorridos guardados a la vista (para las pruebas).
    container.current?.setAttribute('data-gap-lines', String(props.gapLines?.length ?? 0));
    container.current?.setAttribute('data-tracks-shown', String(props.tracks.length));
  }, [props.waypoints, props.routes, props.tracks, props.done, props.recorded, props.gapLines, props.here, props.zones, props.preview, props.outline, props.ecoregions, props.geology, props.measure, props.target]);

  useEffect(() => {
    const m = map.current;
    if (!m || !styleReady.current || !props.tilesVersion) return;
    for (const id of ['osm', 'dem', 'terrain', 'slope']) {
      const src = m.getSource(id) as { tiles?: string[]; setTiles?: (tiles: string[]) => void } | undefined;
      if (src?.tiles && src.setTiles) src.setTiles([...src.tiles]);
    }
  }, [props.tilesVersion]);

  // Con una herramienta activa, cursor de mira.
  useEffect(() => {
    const canvas = map.current?.getCanvas();
    if (canvas) canvas.style.cursor = props.tool ? 'crosshair' : '';
  }, [props.tool]);

  useEffect(() => {
    if (props.flyTo) map.current?.flyTo({ center: [props.flyTo.lon, props.flyTo.lat], zoom: props.flyTo.zoom, essential: true });
  }, [props.flyTo?.key]);

  // 3D o plano. Si el estilo todavía carga, se aplica al terminar (en `style.load`).
  useEffect(() => {
    const m = map.current;
    if (m && styleReady.current) syncTerrain(m);
  }, [props.layers.terrain3d]);

  // Seguimiento: el mapa va con tu posición y, si hay brújula, gira para que adelante quede arriba.
  const followed = useRef<{ lat: number; lon: number; bearing: number | null } | null>(null);
  useEffect(() => {
    const m = map.current;
    if (!props.follow) followed.current = null;
    if (!m || !props.follow || !props.here) return;
    const last = followed.current;
    let bearing = last?.bearing ?? null;
    // Pequeños temblores de la brújula no giran el mapa.
    if (props.heading != null && (bearing === null || Math.abs(angleDiff(bearing, props.heading)) > 4)) bearing = props.heading;
    if (last && last.lat === props.here.lat && last.lon === props.here.lon && last.bearing === bearing) return;
    followed.current = { lat: props.here.lat, lon: props.here.lon, bearing };
    m.easeTo({
      center: [props.here.lon, props.here.lat],
      bearing: bearing ?? m.getBearing(),
      zoom: last ? m.getZoom() : Math.max(m.getZoom(), 15),
      // Si se estaba pasando a 3D o a plano, este movimiento termina esa inclinación.
      ...(pendingPitch.current !== null ? { pitch: pendingPitch.current } : {}),
      duration: 500,
      essential: true,
    });
  }, [props.follow, props.here, props.heading]);

  return <div ref={container} className="maps-canvas" data-testid="offline-map" />;
}
