import { describe, expect, it } from 'vitest';
import type { Location } from '@/core/model/types';
import { locationWaypoint, placeWaypointOf } from './locations';

const loc = (id: string, parentId: string | null, waypointId: string | null) => ({ id, parentId, waypointId, depth: parentId ? 2 : 1, name: id, notes: '', kitType: null }) as unknown as Location;

describe('lugar de un cantero o corral desde su ubicación', () => {
  const byId = new Map([loc('campo', null, 'wp-campo'), loc('fondo', 'campo', null), loc('galpon', 'campo', 'wp-galpon')].map((l) => [l.id, l]));
  it('usa el waypoint propio; si no, el de la ubicación; si no, el del padre', () => {
    expect(placeWaypointOf({ waypointId: 'propio', locationId: 'fondo' }, byId)).toBe('propio');
    expect(placeWaypointOf({ waypointId: null, locationId: 'galpon' }, byId)).toBe('wp-galpon');
    expect(placeWaypointOf({ waypointId: null, locationId: 'fondo' }, byId)).toBe('wp-campo');
    expect(locationWaypoint(null, byId)).toBeNull();
    expect(locationWaypoint('borrada', byId)).toBeNull();
  });
});
