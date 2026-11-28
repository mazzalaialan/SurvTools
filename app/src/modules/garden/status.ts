import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGeolocation } from '@/core/geo/useGeolocation';
import type { GardenBed, Planting } from '@/core/model/types';
import { useSettings } from '@/core/settings/settings';
import { usePlaceCountry } from '@/modules/emergency/usePlaceCountry';
import { today as todayIso } from '@/modules/inventory/domain/dates';
import { useWaypoints } from '@/modules/waypoints/store';
import { useInventory } from '@/modules/inventory/store';
import { withPlaces } from '@/modules/inventory/domain/locations';
import { useRainWatch } from '@/modules/weather/rainWatch';
import { ZONES, zoneFor, type Zone } from './calendar';
import { dueTasks, frostRisk, greenhousePlantings, outdoorPlantings, waterBalance, type FrostRisk, type GardenTask, type PlantedEntry, type WaterBalance } from './logic';
import { useGarden } from './store';
import { cachedGardenWeather, fetchGardenWeather, GARDEN_WEATHER_STALE_MS, storeGardenWeather, weatherKey, type GardenWeather } from './weather';

export interface GardenPlace {
  lat: number;
  lon: number;
  /** Nombre del waypoint, o `null` = ubicación actual. */
  label: string | null;
}

/**
 * Lugar para sugerir la zona del calendario (solo define la región): el
 * waypoint del primer cantero que tenga uno, si no el lugar del clima; si no,
 * el GPS (solo si `useGps`) o la última ubicación conocida. No se usa para la
 * helada ni el riego: esos salen solo del waypoint de cada cantero.
 */
export function useZonePlace(useGps = false): GardenPlace | null {
  const placeWaypointId = useSettings((s) => s.settings.placeWaypointId);
  const waypoints = useWaypoints((s) => s.waypoints);
  const rawBeds = useGarden((s) => s.beds);
  const locations = useInventory((s) => s.locations);
  const beds = useMemo(() => withPlaces(rawBeds, locations), [rawBeds, locations]);
  const bedWp = [...beds.values()]
    .sort((x, y) => x.order - y.order)
    .map((b) => (b.waypointId ? waypoints.get(b.waypointId) : undefined))
    .find((w) => !!w);
  const wp = bedWp ?? (placeWaypointId ? waypoints.get(placeWaypointId) : undefined) ?? null;
  const { fix } = useGeolocation(useGps && !wp);
  const lastHere = useRainWatch((s) => s.lastHere);
  if (wp) return { lat: wp.lat, lon: wp.lon, label: wp.name };
  if (fix) return { lat: fix.lat, lon: fix.lon, label: null };
  if (lastHere) return { lat: lastHere.lat, lon: lastHere.lon, label: null };
  return null;
}

/** Zona elegida a mano o, si no, la sugerida por el lugar (sin lugar: Pampeana). */
export function useGardenZone(place: GardenPlace | null): { zone: Zone; suggested: Zone | null; manual: boolean } {
  const chosen = useSettings((s) => s.settings.gardenZone);
  // El país es el del propio lugar (la huerta de casa sigue siendo de casa aunque estés de viaje en otro país).
  const country = usePlaceCountry(place);
  const suggested = place ? zoneFor(place.lat, place.lon, country) : null;
  const manual = chosen !== null && (ZONES as readonly string[]).includes(chosen);
  return { zone: manual ? (chosen as Zone) : (suggested ?? 'pampeana'), suggested, manual };
}

/** Un lugar con canteros al aire libre: los waypoints de esos canteros a menos de ~1 km (un solo aviso por lugar). */
export interface PlaceGroup {
  /** Celda de ~1 km ("lat,lon" con dos decimales). */
  key: string;
  place: GardenPlace;
  beds: GardenBed[];
  outdoor: PlantedEntry[];
  /** Lo plantado en invernaderos de ese lugar: solo para el riego (sin lluvia ni helada). */
  greenhouse: PlantedEntry[];
}

/**
 * Agrupa lo plantado al aire libre por lugar: los canteros cuyos waypoints
 * caen en la misma celda de ~1 km son un solo lugar (los de casa dan un solo
 * aviso aunque cada uno tenga su waypoint). Los canteros sin waypoint (o con
 * uno que se borró) quedan aparte: sin lugar no hay helada ni lluvia que
 * calcular.
 */
export function placeGroups(
  beds: Map<string, GardenBed>,
  plantings: Iterable<Planting>,
  waypointPlace: (id: string) => GardenPlace | null,
): { groups: PlaceGroup[]; unplaced: GardenBed[]; unplacedGreenhouse: GardenBed[] } {
  const groups = new Map<string, PlaceGroup>();
  const names = new Map<string, Set<string>>();
  const unplaced = new Set<GardenBed>();
  const unplacedGreenhouse = new Set<GardenBed>();
  const list = [...plantings];
  const entries = [...outdoorPlantings(beds, list).map((o) => ({ o, inside: false })), ...greenhousePlantings(beds, list).map((o) => ({ o, inside: true }))];
  for (const { o, inside } of entries) {
    // Un almácigo de afuera trae su propio lugar; lo demás, el del cantero.
    const bed = o.planting.bedId ? beds.get(o.planting.bedId) : undefined;
    const wpId = o.waypointId ?? bed?.waypointId ?? null;
    const place = wpId ? waypointPlace(wpId) : null;
    if (!place) {
      // El aviso "sin lugar" es por la helada y la lluvia: un invernadero sin waypoint no se marca (solo pierde el aviso de riego).
      if (bed) (inside ? unplacedGreenhouse : unplaced).add(bed);
      continue;
    }
    const key = weatherKey(place.lat, place.lon);
    const g = groups.get(key) ?? { key, place: { ...place }, beds: [], outdoor: [], greenhouse: [] };
    if (bed && !g.beds.includes(bed)) g.beds.push(bed);
    (inside ? g.greenhouse : g.outdoor).push(o);
    groups.set(key, g);
    names.set(key, (names.get(key) ?? new Set()).add(place.label ?? ''));
  }
  for (const g of groups.values()) g.place.label = [...(names.get(g.key) ?? [])].filter(Boolean).sort().join(', ');
  return { groups: [...groups.values()], unplaced: [...unplaced], unplacedGreenhouse: [...unplacedGreenhouse] };
}

/** Clima de cada lugar: lo guardado y, si está viejo y hay conexión, uno nuevo. */
export function useGardenWeather(places: GardenPlace[]): Record<string, GardenWeather> {
  const base = useSettings((s) => s.settings.weatherUrl);
  const [weather, setWeather] = useState<Record<string, GardenWeather>>({});
  const keys = [...new Set(places.map((p) => weatherKey(p.lat, p.lon)))].sort().join('|');
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cached = await cachedGardenWeather().catch(() => ({}) as Record<string, GardenWeather>);
      if (cancelled) return;
      setWeather(cached);
      if (!navigator.onLine || !keys) return;
      for (const key of keys.split('|')) {
        const w = cached[key];
        if (w && Date.now() - Date.parse(w.fetchedAt) < GARDEN_WEATHER_STALE_MS) continue;
        const [lat, lon] = key.split(',').map(Number) as [number, number];
        try {
          const fresh = await fetchGardenWeather(base, lat, lon);
          await storeGardenWeather(fresh);
          if (!cancelled) setWeather((prev) => ({ ...prev, [key]: fresh }));
        } catch {
          // Sin conexión o sin respuesta: queda lo guardado.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [keys, base]);
  return weather;
}

export interface PlaceStatus {
  /** Celda de ~1 km. */
  key: string;
  /** Los waypoints de ese lugar. */
  label: string;
  frost: FrostRisk | null;
  water: WaterBalance | null;
  /** Riego de los canteros en invernadero de ese lugar (sin lluvia, con menos evaporación). */
  greenhouseWater: WaterBalance | null;
}

export interface GardenStatus {
  tasks: GardenTask[];
  places: PlaceStatus[];
  /** Canteros al aire libre con plantas pero sin waypoint: sin avisos de helada ni riego. */
  unplaced: GardenBed[];
  /** Invernaderos con plantas pero sin waypoint: sin aviso de riego (la helada no les corresponde). */
  unplacedGreenhouse: GardenBed[];
}

/** Tareas que corresponden y, por lugar, helada y riego (lo que se muestra en Inicio y en la huerta). */
export function useGardenStatus(): GardenStatus {
  const { beds: rawBeds, plantings, loaded } = useGarden(useShallow((s) => ({ beds: s.beds, plantings: s.plantings, loaded: s.loaded })));
  // El lugar de cada cantero: su waypoint o el de su ubicación del Inventario (o una ubicación padre).
  const locations = useInventory((s) => s.locations);
  const beds = useMemo(() => withPlaces(rawBeds, locations), [rawBeds, locations]);
  const { gardenFrostAlerts, gardenWaterAlerts, gardenWateredAt } = useSettings(
    useShallow((s) => ({ gardenFrostAlerts: s.settings.gardenFrostAlerts, gardenWaterAlerts: s.settings.gardenWaterAlerts, gardenWateredAt: s.settings.gardenWateredAt })),
  );
  const waypoints = useWaypoints((s) => s.waypoints);
  const { groups, unplaced, unplacedGreenhouse } = useMemo(() => {
    if (!loaded) return { groups: [], unplaced: [], unplacedGreenhouse: [] };
    const wpPlace = (id: string) => {
      const w = waypoints.get(id);
      return w ? { lat: w.lat, lon: w.lon, label: w.name } : null;
    };
    return placeGroups(beds, plantings.values(), wpPlace);
  }, [loaded, beds, plantings, waypoints]);
  const weather = useGardenWeather(groups.map((g) => g.place));
  const today = todayIso();
  return useMemo(() => {
    const tasks = loaded ? dueTasks(plantings.values(), today) : [];
    const places = groups.map((g): PlaceStatus => {
      const days = weather[weatherKey(g.place.lat, g.place.lon)]?.days ?? [];
      const watered = gardenWateredAt[g.key];
      return {
        key: g.key,
        label: g.place.label ?? '',
        frost: gardenFrostAlerts ? frostRisk(g.outdoor, days, today) : null,
        water: gardenWaterAlerts && days.length ? waterBalance(g.outdoor, days, today, watered ? todayIso(new Date(watered)) : null) : null,
        greenhouseWater:
          gardenWaterAlerts && days.length ? waterBalance(g.greenhouse, days, today, watered ? todayIso(new Date(watered)) : null, { greenhouse: true }) : null,
      };
    });
    return { tasks, places, unplaced, unplacedGreenhouse };
  }, [loaded, plantings, groups, unplaced, unplacedGreenhouse, weather, today, gardenFrostAlerts, gardenWaterAlerts, gardenWateredAt]);
}

/** Cuántas cosas de la huerta piden atención (para el resumen de Inicio). */
export function gardenAlertCount(s: GardenStatus): number {
  return s.tasks.length + s.places.reduce((n, p) => n + (p.frost ? 1 : 0) + (p.water?.needsWater ? 1 : 0) + (p.greenhouseWater?.needsWater ? 1 : 0), 0);
}
