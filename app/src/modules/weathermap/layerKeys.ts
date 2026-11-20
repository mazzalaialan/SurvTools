import type { WeatherMapLayers } from '@/core/settings/settings';

/**
 * Las capas del mapa del clima en el orden en que se muestran, tanto en las tarjetas de abajo del mapa como en el menú de pantalla completa: los círculos de
 * distancia (10, 20 y 30 km alrededor tuyo) van primero y vienen marcados; los rayos, justo después del radar de lluvia.
 */
export const LAYER_KEYS: (keyof WeatherMapLayers)[] = [
  'rings',
  'official',
  'satellite',
  'satRain',
  'radar',
  'lightning',
  'regionWeather',
  'earthquakes',
  'hazards',
  'fires',
  'volcanoes',
  'rivers',
  'tides',
  'waves',
  'waypoints',
];
