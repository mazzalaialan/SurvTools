import { describe, expect, it } from 'vitest';
import { hereIsDuplicate } from './samePlace';

describe('aviso de lluvia: «donde estoy» y un waypoint cercano', () => {
  const casa = { lat: -34.6, lon: -58.38 };
  it('a menos de 10 km avisa solo el waypoint', () => {
    expect(hereIsDuplicate({ lat: -34.62, lon: -58.4 }, [casa])).toBe(true);
  });
  it('a más de 10 km avisan los dos', () => {
    expect(hereIsDuplicate({ lat: -34.8, lon: -58.38 }, [casa])).toBe(false);
  });
  it('sin waypoints con aviso, «donde estoy» avisa', () => {
    expect(hereIsDuplicate(casa, [])).toBe(false);
  });
});
