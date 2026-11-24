import { useState } from 'react';
import { useZonePlace } from '@/modules/garden/status';
import { zoneNear, type FishData } from './fishing';

const KEY = 'vikarg.fishing.zone';
const read = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

/**
 * Zona de pesca: la elegida a mano (se recuerda en este dispositivo) o, si no, la del lugar —el waypoint de «tu lugar» o la última
 * ubicación, como la Huerta y Meteorología—. Sin lugar ni elección: la primera zona del paquete.
 */
export function useFishZone(data: FishData): { zone: string | null; auto: string | null; manual: boolean; setZone: (z: string | null) => void } {
  const place = useZonePlace(false);
  const [chosen, setChosen] = useState<string | null>(read);
  const zones = data.zones ?? [];
  const auto = place ? zoneNear(data, [place.lon, place.lat]) : null;
  const valid = (z: string | null) => (z && zones.some((x) => x.id === z) ? z : null);
  const manual = !!valid(chosen);
  const zone = valid(chosen) ?? valid(auto) ?? zones[0]?.id ?? null;
  const setZone = (z: string | null) => {
    try {
      if (z) localStorage.setItem(KEY, z);
      else localStorage.removeItem(KEY);
    } catch {
      /* sin almacenamiento: vale para esta pantalla */
    }
    setChosen(z);
  };
  return { zone, auto, manual, setZone };
}
