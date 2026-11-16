import { describe, expect, it } from 'vitest';
import { overlapWithZones } from './overlap';
import { planZone } from './tiles';
import type { MapZone } from './store';

const zone = (lat: number, lon: number, radiusKm: number, maxZoom = 10): MapZone => ({ id: 'z', name: 'Z', lat, lon, radiusKm, maxZoom, bytes: 0, failed: 0, createdAt: '2026-11-16' });

describe('cuánto de una zona nueva ya está descargado', () => {
  it('sin zonas, nada; la misma zona, todo', () => {
    const plan = planZone(-40, -71.4, 10, 10);
    expect(overlapWithZones([], plan).fraction).toBe(0);
    const same = overlapWithZones([zone(-40, -71.4, 10)], plan);
    expect(same.fraction).toBe(1);
    expect(same.newBytes).toBe(0);
  });
  it('una zona vecina que se pisa a medias da una fracción intermedia', () => {
    // Con detalle fino (zoom 14, teselas de ~2 km) una zona corrida 8 km se pisa solo en parte.
    const plan = planZone(-40, -71.3, 10, 14);
    const o = overlapWithZones([zone(-40, -71.4, 10, 14)], plan);
    expect(o.fraction).toBeGreaterThan(0.3);
    expect(o.fraction).toBeLessThan(1);
    expect(o.newTiles).toBeGreaterThan(0);
  });
  it('con el mismo detalle fino, una zona lejana casi no cuenta (comparten solo las teselas de zoom bajo)', () => {
    const o = overlapWithZones([zone(-34.6, -58.4, 10, 14)], planZone(-40, -71.4, 10, 14));
    expect(o.fraction).toBeLessThan(0.5);
    expect(o.newTiles).toBeGreaterThan(0);
  });
});
