import { describe, expect, it } from 'vitest';
import type { WeatherMapLayers } from '@/core/settings/settings';
import { quickRows } from './quickReference';

const OFF: WeatherMapLayers = {
  rings: false, satellite: false, radar: false, regionWeather: false, official: false, earthquakes: false, hazards: false, fires: false, volcanoes: false,
  waypoints: false, satRain: false, lightning: false, rivers: false, tides: false, waves: false,
};
const opts = { zoneValue: 'temp' as const, windUnit: 'km/h', firmsFires: false, satNoaa: false };

describe('tabla de referencia rápida del mapa del clima', () => {
  it('sin capas prendidas no hay filas', () => {
    expect(quickRows(OFF, opts)).toEqual([]);
  });

  it('solo explica las capas prendidas y en el orden del menú', () => {
    const rows = quickRows({ ...OFF, earthquakes: true, official: true, radar: true }, opts);
    expect(rows.map((r) => r.layer)).toEqual(['official', 'radar', 'earthquakes']);
    expect(rows[0]!.entries.map((e) => e.text)).toEqual(['official.minor', 'official.severe', 'official.extreme']);
    expect(rows[2]!.entries).toHaveLength(3);
  });

  it('el clima por zona explica el valor elegido y lleva la unidad del viento', () => {
    expect(quickRows({ ...OFF, regionWeather: true }, { ...opts, zoneValue: 'wind' })[0]!.entries[0]).toMatchObject({ text: 'zone.wind', vars: { unit: 'km/h' } });
    expect(quickRows({ ...OFF, regionWeather: true }, { ...opts, zoneValue: 'rain' })[0]!.entries[0]!.text).toBe('zone.rain');
  });

  it('los focos de calor tienen tres niveles con confianza de NASA y uno solo con el respaldo; el satélite cambia de fuente', () => {
    expect(quickRows({ ...OFF, fires: true }, { ...opts, firmsFires: true })[0]!.entries.map((e) => e.text)).toEqual(['fire.high', 'fire.nominal', 'fire.low']);
    expect(quickRows({ ...OFF, fires: true }, opts)[0]!.entries.map((e) => e.text)).toEqual(['fire.group']);
    expect(quickRows({ ...OFF, satellite: true }, { ...opts, satNoaa: true })[0]!.entries[0]!.text).toBe('satellite.noaa');
    expect(quickRows({ ...OFF, satellite: true }, opts)[0]!.entries[0]!.text).toBe('satellite.gibs');
  });

  it('cada capa prendida de las que tienen leyenda aparece una vez', () => {
    const all = { ...OFF, satellite: true, radar: true, regionWeather: true, official: true, earthquakes: true, hazards: true, fires: true, volcanoes: true, satRain: true, lightning: true, rivers: true, tides: true, waves: true };
    const rows = quickRows(all, opts);
    expect(new Set(rows.map((r) => r.layer)).size).toBe(rows.length);
    expect(rows).toHaveLength(13);
    // Los puntos propios (waypoints) no llevan colores que explicar.
    expect(rows.some((r) => r.layer === 'waypoints')).toBe(false);
  });
});
