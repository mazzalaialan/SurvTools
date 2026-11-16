import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from 'maplibre-gl';
import { ATTRIBUTION, DEM_MAX_ZOOM, VECTOR_MAX_ZOOM } from './tiles';

/**
 * Estilo propio sobre el esquema OpenMapTiles: pocos elementos y bien
 * contrastados (caminos, senderos, agua, relieve y nombres), con los colores
 * del tema activo para que el rojo nocturno y el ahorro de batería también
 * apliquen al mapa.
 */

export interface MapColors {
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  info: string;
  ok: string;
  warn: string;
  danger: string;
  slopeAvalanche: string;
  steep: string;
  extreme: string;
  /** Límites: países de un color y provincias de otro. */
  country: string;
  province: string;
}

export function themeColors(): MapColors {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string) => s.getPropertyValue(name).trim() || '#888';
  return {
    bg: v('--bg'),
    surface: v('--surface'),
    surface2: v('--surface-2'),
    border: v('--border'),
    text: v('--text'),
    muted: v('--text-muted'),
    accent: v('--accent'),
    info: v('--info'),
    ok: v('--ok'),
    warn: v('--warn'),
    danger: v('--danger'),
    slopeAvalanche: v('--slope-avalanche'),
    steep: v('--slope-steep'),
    extreme: v('--slope-extreme'),
    country: v('--map-country'),
    province: v('--map-province'),
  };
}

export interface MapLayersOn {
  hillshade: boolean;
  contours: boolean;
  slope: boolean;
  /** Línea de nieve: la pendiente se pinta desde esta altura (m). */
  slopeMin?: number;
  /** Orientaciones de sotavento que se rayan: de los últimos días y el habitual (ver wind.ts). */
  slopeLee?: number[];
  slopeLeeUsual?: number[];
  /** Sotavento para marcar posibles cornisas (vacío = apagado). */
  slopeCornice?: number[];
  terrain3d: boolean;
  ecoregions?: boolean;
  geology?: boolean;
}

/** Teselas de la capa de pendiente para una línea de nieve y un sotavento. */
/** La pendiente se pinta hasta el zoom máximo del mapa: más allá de la elevación (12) se interpola (slope.ts). */
export const SLOPE_MAX_ZOOM = 17;

export const slopeTiles = (min = 0, lee: number[] = [], usual: number[] = [], cornice: number[] = []) => [
  `vkslope://{z}/{x}/{y}?min=${Math.round(min)}${lee.length ? `&lee=${lee.join(',')}` : ''}${usual.length ? `&usual=${usual.join(',')}` : ''}${cornice.length ? `&cor=${cornice.join(',')}` : ''}`,
];

/** Relieve en 3D: un poco exagerado para que se lean las pendientes. */
export const TERRAIN = { source: 'terrain', exaggeration: 1.3 } as const;
/** Inclinación al pasar a 3D, y la máxima permitida. */
export const PITCH_3D = 60;
export const MAX_PITCH_3D = 75;

const NAME: ExpressionSpecification = ['coalesce', ['get', 'name:es'], ['get', 'name'], ['get', 'name:latin']];
const FONT = ['Noto Sans Regular'];
const FONT_BOLD = ['Noto Sans Bold'];

export function buildStyle(c: MapColors, contoursUrl: string, layers: MapLayersOn): StyleSpecification {
  const roadWidth = (base: number): ExpressionSpecification => ['interpolate', ['exponential', 1.6], ['zoom'], 8, base * 0.4, 14, base * 2, 18, base * 6];
  const road = (id: string, classes: string[], color: string, width: number, minzoom = 5): LayerSpecification => ({
    id,
    type: 'line',
    source: 'osm',
    'source-layer': 'transportation',
    minzoom,
    filter: ['in', ['get', 'class'], ['literal', classes]],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': color, 'line-width': roadWidth(width) },
  });
  const visible = (on: boolean) => (on ? 'visible' : 'none');

  return {
    version: 8,
    glyphs: 'vkglyph://{fontstack}/{range}',
    sources: {
      osm: { type: 'vector', tiles: ['vktile://{z}/{x}/{y}'], maxzoom: VECTOR_MAX_ZOOM, attribution: ATTRIBUTION },
      dem: { type: 'raster-dem', tiles: ['vkdem://{z}/{x}/{y}'], tileSize: 256, encoding: 'terrarium', maxzoom: DEM_MAX_ZOOM },
      // Las mismas teselas de altura, en otra fuente: MapLibre pide no compartirla entre el sombreado y el 3D.
      terrain: { type: 'raster-dem', tiles: ['vkdem://{z}/{x}/{y}'], tileSize: 256, encoding: 'terrarium', maxzoom: DEM_MAX_ZOOM },
      contours: { type: 'vector', tiles: [contoursUrl], maxzoom: 15 },
      // Pendiente pintada con los colores del inclinómetro (ver slope.ts y protocols.ts).
      slope: { type: 'raster', tiles: slopeTiles(layers.slopeMin, layers.slopeLee, layers.slopeLeeUsual, layers.slopeCornice), tileSize: 256, maxzoom: SLOPE_MAX_ZOOM },
    },
    ...(layers.terrain3d ? { terrain: TERRAIN } : {}),
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': c.surface } },
      {
        id: 'landcover-wood',
        type: 'fill',
        source: 'osm',
        'source-layer': 'landcover',
        filter: ['in', ['get', 'class'], ['literal', ['wood', 'forest']]],
        paint: { 'fill-color': c.ok, 'fill-opacity': 0.12 },
      },
      {
        id: 'landuse-urban',
        type: 'fill',
        source: 'osm',
        'source-layer': 'landuse',
        filter: ['in', ['get', 'class'], ['literal', ['residential', 'commercial', 'industrial']]],
        paint: { 'fill-color': c.surface2, 'fill-opacity': 0.7 },
      },
      { id: 'park', type: 'fill', source: 'osm', 'source-layer': 'park', paint: { 'fill-color': c.ok, 'fill-opacity': 0.08 } },
      {
        id: 'hillshade',
        type: 'hillshade',
        source: 'dem',
        layout: { visibility: visible(layers.hillshade) },
        paint: { 'hillshade-shadow-color': c.bg, 'hillshade-highlight-color': c.text, 'hillshade-accent-color': c.bg, 'hillshade-exaggeration': 0.35 },
      },
      {
        id: 'slope',
        type: 'raster',
        source: 'slope',
        // Sin suavizar al acercar: se ve dónde termina cada zona.
        layout: { visibility: visible(layers.slope) },
        paint: { 'raster-opacity': 0.6, 'raster-resampling': 'nearest' },
      },
      { id: 'water', type: 'fill', source: 'osm', 'source-layer': 'water', paint: { 'fill-color': c.info, 'fill-opacity': 0.45 } },
      {
        id: 'waterway',
        type: 'line',
        source: 'osm',
        'source-layer': 'waterway',
        paint: { 'line-color': c.info, 'line-opacity': 0.8, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 14, 2] },
      },
      {
        id: 'contour-lines',
        type: 'line',
        source: 'contours',
        'source-layer': 'contours',
        layout: { visibility: visible(layers.contours) },
        paint: { 'line-color': c.warn, 'line-opacity': ['match', ['get', 'level'], 1, 0.7, 0.35], 'line-width': ['match', ['get', 'level'], 1, 1.1, 0.5] },
      },
      {
        id: 'contour-labels',
        type: 'symbol',
        source: 'contours',
        'source-layer': 'contours',
        filter: ['>', ['get', 'level'], 0],
        layout: {
          visibility: visible(layers.contours),
          'symbol-placement': 'line',
          'text-field': ['concat', ['number-format', ['get', 'ele'], {}], ' m'],
          'text-font': FONT,
          'text-size': 10,
        },
        paint: { 'text-color': c.warn, 'text-halo-color': c.surface, 'text-halo-width': 1.5 },
      },
      { id: 'building', type: 'fill', source: 'osm', 'source-layer': 'building', minzoom: 13, paint: { 'fill-color': c.surface2, 'fill-outline-color': c.border } },
      // Senderos y huellas: lo más importante para moverse a pie, en el color de acento y punteado.
      {
        id: 'path',
        type: 'line',
        source: 'osm',
        'source-layer': 'transportation',
        minzoom: 11,
        filter: ['in', ['get', 'class'], ['literal', ['path', 'track']]],
        layout: { 'line-cap': 'round' },
        paint: { 'line-color': c.accent, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.8, 16, 2.5], 'line-dasharray': [2, 1.5] },
      },
      road('road-minor', ['minor', 'service'], c.muted, 0.6, 11),
      road('road-secondary', ['secondary', 'tertiary'], c.text, 0.9, 8),
      road('road-primary', ['primary', 'trunk', 'motorway'], c.warn, 1.3, 5),
      {
        id: 'rail',
        type: 'line',
        source: 'osm',
        'source-layer': 'transportation',
        filter: ['==', ['get', 'class'], 'rail'],
        paint: { 'line-color': c.muted, 'line-width': 1, 'line-dasharray': [3, 3] },
      },
      {
        id: 'boundary',
        type: 'line',
        source: 'osm',
        'source-layer': 'boundary',
        // Países (nivel 2) en línea llena de un color; provincias en guiones de otro.
        filter: ['all', ['>', ['coalesce', ['get', 'admin_level'], 99], 2], ['<=', ['coalesce', ['get', 'admin_level'], 99], 4]],
        paint: { 'line-color': c.province, 'line-opacity': 0.8, 'line-width': 0.9, 'line-dasharray': [4, 2] },
      },
      {
        id: 'boundary-country',
        type: 'line',
        source: 'osm',
        'source-layer': 'boundary',
        // Sin los límites marítimos (aguas territoriales), que no son una frontera en tierra.
        filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['coalesce', ['get', 'maritime'], 0], 1]],
        paint: { 'line-color': c.country, 'line-opacity': 0.9, 'line-width': 1.8 },
      },
      {
        id: 'water-name',
        type: 'symbol',
        source: 'osm',
        'source-layer': 'water_name',
        layout: { 'text-field': NAME, 'text-font': ['Noto Sans Italic'], 'text-size': 12 },
        paint: { 'text-color': c.info, 'text-halo-color': c.surface, 'text-halo-width': 1.5 },
      },
      {
        id: 'road-name',
        type: 'symbol',
        source: 'osm',
        'source-layer': 'transportation_name',
        minzoom: 12,
        layout: { 'symbol-placement': 'line', 'text-field': NAME, 'text-font': FONT, 'text-size': 11 },
        paint: { 'text-color': c.text, 'text-halo-color': c.surface, 'text-halo-width': 1.5 },
      },
      {
        id: 'peak',
        type: 'symbol',
        source: 'osm',
        'source-layer': 'mountain_peak',
        minzoom: 9,
        layout: {
          'text-field': ['concat', '▲ ', NAME, ['case', ['has', 'ele'], ['concat', '\n', ['to-string', ['get', 'ele']], ' m'], '']],
          'text-font': FONT,
          'text-size': 11,
        },
        paint: { 'text-color': c.text, 'text-halo-color': c.surface, 'text-halo-width': 1.5 },
      },
      {
        id: 'place',
        type: 'symbol',
        source: 'osm',
        'source-layer': 'place',
        filter: ['in', ['get', 'class'], ['literal', ['city', 'town', 'village', 'hamlet', 'state', 'country']]],
        layout: {
          'text-field': NAME,
          'text-font': ['match', ['get', 'class'], ['city', 'state', 'country'], ['literal', FONT_BOLD], ['literal', FONT]],
          'text-size': ['match', ['get', 'class'], 'country', 15, 'city', 15, 'state', 13, 'town', 13, 11],
        },
        paint: { 'text-color': c.text, 'text-halo-color': c.surface, 'text-halo-width': 2 },
      },
    ],
  };
}
