import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/core/settings/settings';
import { LAYER_KEYS } from './layerKeys';
import { quickRows } from './quickReference';

describe('orden y valores de las capas del mapa del clima', () => {
  it('los círculos de distancia van primero y los rayos justo después del radar de lluvia', () => {
    expect(LAYER_KEYS[0]).toBe('rings');
    expect(LAYER_KEYS.indexOf('lightning')).toBe(LAYER_KEYS.indexOf('radar') + 1);
  });

  it('están todas las capas, una sola vez', () => {
    expect([...LAYER_KEYS].sort()).toEqual(Object.keys(DEFAULT_SETTINGS.weatherMapLayers).sort());
    expect(new Set(LAYER_KEYS).size).toBe(LAYER_KEYS.length);
  });

  it('los círculos vienen marcados por defecto, también para quien ya tenía preferencias guardadas', () => {
    expect(DEFAULT_SETTINGS.weatherMapLayers.rings).toBe(true);
    // Al cargar, lo guardado se mezcla con los valores por defecto: una capa nueva aparece con su valor.
    const stored = { satellite: false } as Partial<typeof DEFAULT_SETTINGS.weatherMapLayers>;
    expect({ ...DEFAULT_SETTINGS.weatherMapLayers, ...stored }.rings).toBe(true);
  });

  it('la tabla de referencia también pone los círculos primero y los rayos después del radar, y los rayos ya no incluyen los círculos', () => {
    const on = { ...DEFAULT_SETTINGS.weatherMapLayers, official: false, satellite: false, satRain: false, radar: true, lightning: true, regionWeather: false, earthquakes: false, hazards: false, fires: false, volcanoes: false, rivers: false, tides: false, waves: false, waypoints: false };
    const rows = quickRows(on, { zoneValue: 'temp', windUnit: 'km/h', firmsFires: false, satNoaa: false });
    expect(rows.map((r) => r.layer)).toEqual(['rings', 'radar', 'lightning']);
    expect(rows[2]!.entries.map((e) => e.text)).toEqual(['lightning.flash']);
  });
});
