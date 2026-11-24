import { useState } from 'react';
import { useZonePlace } from '@/modules/garden/status';
import { zoneNear, type FishData } from './fishing';

const KEY = 'vikarg.fishing.zone';
/** Valor del selector para ver todas las zonas juntas. */
export const ALL = 'all';
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
export function useFishZone(data: FishData): { zone: string | null; picked: string | null; auto: string | null; manual: boolean; setZone: (z: string | null) => void } {
  const place = useZonePlace(false);
  const [chosen, setChosen] = useState<string | null>(read);
  const zones = data.zones ?? [];
  const auto = place ? zoneNear(data, [place.lon, place.lat]) : null;
  const valid = (z: string | null) => (z && (z === ALL || zones.some((x) => x.id === z)) ? z : null);
  const manual = !!valid(chosen);
  const picked = valid(chosen) ?? valid(auto) ?? zones[0]?.id ?? null;
  // «Todas»: sin filtro de zona (null para las búsquedas).
  const zone = picked === ALL ? null : picked;
  const setZone = (z: string | null) => {
    try {
      if (z) localStorage.setItem(KEY, z);
      else localStorage.removeItem(KEY);
    } catch {
      /* sin almacenamiento: vale para esta pantalla */
    }
    setChosen(z);
  };
  return { zone, picked, auto, manual, setZone };
}
