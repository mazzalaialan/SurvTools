import type { WeatherMapLayers, WeatherMapValue } from '@/core/settings/settings';

/** Una fila de la tabla de referencia rápida: qué capa es y qué significa cada color o marca. */
export interface QuickEntry {
  /** Fondo CSS de la muestra (color, variable o degradé). */
  swatch: string;
  /** Clave de texto en `weatherMap.quick.*`. */
  text: string;
  vars?: Record<string, string | number>;
}

export interface QuickRow {
  /** La capa a la que pertenece (el nombre sale de `weatherMap.layer.<layer>`). */
  layer: keyof WeatherMapLayers;
  entries: QuickEntry[];
}

const s = (n: number) => `var(--scale-${n})`;
const ramp = (...ns: number[]) => `linear-gradient(90deg, ${ns.map(s).join(', ')})`;

export interface QuickOptions {
  zoneValue: WeatherMapValue;
  windUnit: string;
  /** Focos de calor de NASA FIRMS (con confianza) y no los de respaldo. */
  firmsFires: boolean;
  satNoaa: boolean;
  /** Las capas que dependen de la fuente de oleaje y del servidor ya vienen resueltas en `layers`. */
}

/**
 * Qué colores y marcas explicar, según las capas prendidas: la tabla que se ve sobre el mapa en pantalla completa. Solo datos (los textos
 * están en las traducciones), para poder probarla y para que la tabla nunca muestre una capa apagada.
 */
export function quickRows(layers: WeatherMapLayers, o: QuickOptions): QuickRow[] {
  const rows: QuickRow[] = [];
  const add = (layer: keyof WeatherMapLayers, entries: QuickEntry[]) => rows.push({ layer, entries });
  if (layers.official) {
    add('official', [
      { swatch: s(4), text: 'official.minor' },
      { swatch: s(5), text: 'official.severe' },
      { swatch: s(6), text: 'official.extreme' },
    ]);
  }
  if (layers.regionWeather) {
    add('regionWeather', [{ swatch: ramp(1, 2, 3, 4, 5, 6), text: `zone.${o.zoneValue}`, vars: { unit: o.windUnit } }]);
  }
  if (layers.satellite) add('satellite', [{ swatch: 'linear-gradient(90deg, #8fd0ee, #2a6fd6, #3bd23b, #f2e94e)', text: o.satNoaa ? 'satellite.noaa' : 'satellite.gibs' }]);
  if (layers.satRain) add('satRain', [{ swatch: 'linear-gradient(90deg, #78c8ff, #288cf0, #1ebe50, #fadc28, #fa8c14, #e61e1e)', text: 'satRain' }]);
  if (layers.radar) add('radar', [{ swatch: 'linear-gradient(90deg, #3c6596, #1ea0dc, #1ec850, #fadc28, #e61e1e, #c81eb4, #ffffff)', text: 'radar' }]);
  if (layers.earthquakes) {
    add('earthquakes', [
      { swatch: s(6), text: 'quake.day' },
      { swatch: s(5), text: 'quake.days' },
      { swatch: s(4), text: 'quake.week' },
    ]);
  }
  if (layers.hazards) {
    add('hazards', [
      { swatch: s(3), text: 'hazard.green' },
      { swatch: s(5), text: 'hazard.orange' },
      { swatch: s(6), text: 'hazard.red' },
    ]);
  }
  if (layers.volcanoes) {
    add('volcanoes', [
      { swatch: 'var(--text-muted)', text: 'volcano.old' },
      { swatch: s(5), text: 'volcano.recent' },
    ]);
  }
  if (layers.fires) {
    add('fires', o.firmsFires
      ? [
          { swatch: s(6), text: 'fire.high' },
          { swatch: s(5), text: 'fire.nominal' },
          { swatch: s(4), text: 'fire.low' },
        ]
      : [{ swatch: s(5), text: 'fire.group' }]);
  }
  if (layers.lightning) {
    add('lightning', [
      { swatch: '#ffd400', text: 'lightning.flash' },
      { swatch: 'transparent', text: 'lightning.rings' },
    ]);
  }
  if (layers.rivers) {
    add('rivers', [
      { swatch: s(6), text: 'river.evacuation' },
      { swatch: s(5), text: 'river.alert' },
      { swatch: s(4), text: 'river.low' },
      { swatch: s(2), text: 'river.normal' },
      { swatch: 'var(--text-muted)', text: 'river.none' },
    ]);
  }
  if (layers.tides) add('tides', [{ swatch: 'var(--info)', text: 'tide' }]);
  if (layers.waves) add('waves', [{ swatch: ramp(1, 3, 5, 6), text: 'waves' }]);
  return rows;
}
