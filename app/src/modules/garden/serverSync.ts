import { useEffect } from 'react';
import { i18n } from '@/core/i18n/i18n';
import type { GardenBed, Planting, Waypoint } from '@/core/model/types';
import { readNotificationState, updateNotificationState } from '@/core/notifications/state';
import { useSettings, type Settings } from '@/core/settings/settings';
import { today as todayIso } from '@/modules/inventory/domain/dates';
import { useWaypoints } from '@/modules/waypoints/store';
import { useInventory } from '@/modules/inventory/store';
import { withPlaces } from '@/modules/inventory/domain/locations';
import { cropName } from './crops';
import { cropKc, frostThreshold, plantingTasks, readilyAvailableMm } from './logic';
import { placeGroups } from './status';
import { useGarden } from './store';

/**
 * Avisos de la huerta con la app cerrada, desde el servidor propio (si hay uno
 * registrado en Notificaciones). Se le manda un lugar por grupo de canteros a
 * menos de ~1 km (coordenadas redondeadas, el nombre de los waypoints, qué
 * cultivos se queman con cuánto frío, y los datos del riego) y las tareas, ya
 * escritas en el idioma de la app. Nada más de la huerta sale del dispositivo.
 */

export interface GardenServerBody {
  places: {
    id: string;
    label: string | null;
    lat: number;
    lon: number;
    frost: { name: string; threshold: number }[];
    water: { kc: number; thresholdMm: number; wateredOn: string | null } | null;
  }[];
  tasks: { id: string; text: string; date: string }[];
}

const coarse = (x: number) => Math.round(x * 100) / 100;
const MAX_TASKS = 100;

export function gardenServerBody(
  beds: Map<string, GardenBed>,
  plantings: Map<string, Planting>,
  waypoints: Map<string, Waypoint>,
  settings: Pick<Settings, 'gardenFrostAlerts' | 'gardenWaterAlerts' | 'gardenWateredAt'>,
  lang: string,
  t: (key: string, opts?: Record<string, unknown>) => string,
  today = todayIso(),
): GardenServerBody {
  const wpPlace = (id: string) => {
    const w = waypoints.get(id);
    return w ? { lat: w.lat, lon: w.lon, label: w.name } : null;
  };
  const { groups } = placeGroups(beds, plantings.values(), wpPlace);
  const places = groups
    .map((g) => {
      const frost = settings.gardenFrostAlerts
        ? [...new Map(g.outdoor.map((o) => [o.crop.id, o.crop])).values()]
            .map((c) => ({ name: cropName(c, lang), threshold: frostThreshold(c) }))
            .filter((c): c is { name: string; threshold: number } => c.threshold !== null)
        : [];
      const watered = settings.gardenWateredAt[g.key];
      const water = settings.gardenWaterAlerts
        ? {
            kc: Math.max(...g.outdoor.map((o) => cropKc(o.planting, o.crop, today))),
            thresholdMm: Math.min(...g.outdoor.map((o) => readilyAvailableMm(o.crop, o.soil, o.pot))),
            wateredOn: watered ? todayIso(new Date(watered)) : null,
          }
        : null;
      return { id: g.key, label: g.place.label?.slice(0, 300) || null, lat: coarse(g.place.lat), lon: coarse(g.place.lon), frost, water };
    })
    .filter((p) => p.frost.length || p.water);
  const tasks = plantingTasks(plantings.values())
    .slice(0, MAX_TASKS)
    .map((task) => {
      const bed = task.planting.bedId ? beds.get(task.planting.bedId) : undefined;
      const text = t(`garden.tasks.${task.kind}`, { crop: cropName(task.crop, lang) }) + (bed ? ` · ${bed.name}` : '');
      return { id: task.id, text: text.slice(0, 200), date: task.date };
    });
  return { places, tasks };
}

/** Manda la huerta al servidor. Sin servidor registrado no hace nada. */
export async function syncGarden(): Promise<void> {
  const { push } = await readNotificationState();
  const garden = useGarden.getState();
  if (!push || !navigator.onLine || !garden.loaded) return;
  const body = gardenServerBody(withPlaces(garden.beds, useInventory.getState().locations), garden.plantings, useWaypoints.getState().waypoints, useSettings.getState().settings, i18n.language, (k, o) => i18n.t(k, o) as string);
  const res = await fetch(`${push.serverUrl}/api/devices/${push.deviceId}/garden`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${push.token}` },
    body: JSON.stringify(body),
  }).catch(() => null);
  // 401: el servidor ya no conoce este dispositivo: hay que volver a activar las notificaciones.
  if (res?.status === 401) await updateNotificationState({ push: null });
}

/** Se monta una vez en la app desbloqueada: sincroniza cuando cambia algo que importa. */
export function useGardenServerSync() {
  const beds = useGarden((s) => s.beds);
  const plantings = useGarden((s) => s.plantings);
  const waypoints = useWaypoints((s) => s.waypoints);
  const locations = useInventory((s) => s.locations);
  const notificationsEnabled = useSettings((s) => s.settings.notificationsEnabled);
  const frost = useSettings((s) => s.settings.gardenFrostAlerts);
  const water = useSettings((s) => s.settings.gardenWaterAlerts);
  const watered = useSettings((s) => s.settings.gardenWateredAt);
  const language = useSettings((s) => s.settings.language);
  useEffect(() => {
    const timer = setTimeout(() => void syncGarden(), 2000);
    return () => clearTimeout(timer);
  }, [beds, plantings, waypoints, locations, notificationsEnabled, frost, water, watered, language]);
}
