import { strFromU8, strToU8 } from 'fflate';
import type { FreezingSeries } from './snowline';
import type { PrevailingWind } from './wind';
import { create } from 'zustand';
import { blobStore } from '@/core/db/repository';
import { isUnlocked, onSessionChange } from '@/core/security/session';
import { invalidateLayers, zoneLayerTiles } from '@/modules/layers/zoneLayers';
import { circleBounds, DEM_URL, eachTile, fill, LOCAL_TILE, MAP_CACHE, planZone, removeZoneTiles } from './tiles';

/**
 * Zonas offline descargadas. Solo se guardan sus datos (cifrados, porque
 * revelan lugares); las teselas se recalculan a partir de la zona.
 */
export interface MapZone {
  id: string;
  name: string;
  lat: number;
  lon: number;
  radiusKm: number;
  maxZoom: number;
  bytes: number;
  failed: number;
  createdAt: string;
  /** Isoterma de 0 °C hora por hora, para la línea de nieve sin conexión (ver snowline.ts). */
  freezing?: FreezingSeries;
  /** Viento habitual con nieve (histórico), para el rayado de sotavento sin datos recientes (ver wind.ts). */
  prevailing?: PrevailingWind;
  /** Se bajó con el detalle de geología y de vegetación (teselas del servidor propio, ver modules/layers). */
  layers?: boolean;
}

const BLOB_ID = 'map-zones';

interface ZonesState {
  loaded: boolean;
  zones: MapZone[];
  /** Zonas cuyas teselas no están en este dispositivo (p. ej. después de restaurar un backup). */
  missing: Set<string>;
  load: () => Promise<void>;
  clear: () => void;
  add: (zone: MapZone) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

/** Claves de caché de una zona (mismas que usa la descarga). */
export function zoneKeys(z: Pick<MapZone, 'lat' | 'lon' | 'radiusKm' | 'maxZoom'> & { layers?: boolean }): string[] {
  const plan = planZone(z.lat, z.lon, z.radiusKm, z.maxZoom);
  const layers = z.layers ? zoneLayerTiles(circleBounds(z.lat, z.lon, z.radiusKm)).map((t) => t.key) : [];
  return [...layers, ...[...eachTile(plan.vector)].map((t) => fill(LOCAL_TILE, t.z, t.x, t.y)), ...[...eachTile(plan.dem)].map((t) => fill(DEM_URL, t.z, t.x, t.y))];
}

async function persist(zones: MapZone[]) {
  await blobStore.put(BLOB_ID, strToU8(JSON.stringify(zones)) as Uint8Array<ArrayBuffer>);
}

export const useMapZones = create<ZonesState>((set, get) => ({
  loaded: false,
  zones: [],
  missing: new Set(),

  async load() {
    const bytes = await blobStore.get(BLOB_ID);
    let zones: MapZone[] = [];
    try {
      zones = bytes ? (JSON.parse(strFromU8(bytes)) as MapZone[]) : [];
    } catch {
      zones = [];
    }
    // Una tesela de muestra (la del centro, al zoom máximo) alcanza para saber si la zona está en este dispositivo.
    const missing = new Set<string>();
    if ('caches' in globalThis) {
      const cache = await caches.open(MAP_CACHE);
      for (const z of zones) {
        const keys = zoneKeys({ ...z, radiusKm: 0.01 });
        if (!(await cache.match(keys.find((k) => k.includes(`/tiles/${z.maxZoom}/`)) ?? keys[0]!))) missing.add(z.id);
      }
    }
    set({ loaded: true, zones, missing });
  },

  clear() {
    set({ loaded: false, zones: [], missing: new Set() });
  },

  async add(zone) {
    const zones = [...get().zones.filter((z) => z.id !== zone.id), zone];
    await persist(zones);
    const missing = new Set(get().missing);
    missing.delete(zone.id);
    set({ zones, missing });
  },

  async remove(id) {
    const zone = get().zones.find((z) => z.id === id);
    const zones = get().zones.filter((z) => z.id !== id);
    if (zone && 'caches' in globalThis) await removeZoneTiles(zoneKeys(zone), new Set(zones.flatMap(zoneKeys)));
    await persist(zones);
    invalidateLayers();
    set({ zones });
  },
}));

onSessionChange(() => {
  if (isUnlocked()) {
    if (!useMapZones.getState().loaded) void useMapZones.getState().load();
  } else {
    useMapZones.getState().clear();
  }
});
