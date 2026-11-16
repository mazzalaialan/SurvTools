import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/core/settings/settings';
import { withLayer } from './layerExclusion';

const base = DEFAULT_SETTINGS.mapLayers;

describe('capas exclusivas del mapa', () => {
  it('prender una apaga las otras dos', () => {
    const a = withLayer(base, 'slope', true);
    expect(a.slope).toBe(true);
    const b = withLayer(a, 'ecoregions', true);
    expect([b.slope, b.ecoregions, b.geology]).toEqual([false, true, false]);
    const c = withLayer(b, 'geology', true);
    expect([c.slope, c.ecoregions, c.geology]).toEqual([false, false, true]);
  });
  it('apagar no toca las demás y las otras capas son independientes', () => {
    const a = withLayer(withLayer(base, 'ecoregions', true), 'contours', false);
    expect(a.ecoregions).toBe(true);
    expect(a.contours).toBe(false);
    expect(withLayer(a, 'ecoregions', false).ecoregions).toBe(false);
    expect(withLayer(a, 'mine', true).ecoregions).toBe(true);
  });
});
