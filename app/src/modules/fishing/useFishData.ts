import { useEffect, useState } from 'react';
import { useSettings } from '@/core/settings/settings';
import { FISH_COUNTRIES, hasFishData, loadFishData, type FishData } from './fishing';
import { useCountryPackStore } from '@/modules/emergency/useCountryPacks';

export type FishDataState =
  | { status: 'loading' }
  /** El país todavía no tiene datos de pesca. */
  | { status: 'none' }
  /** Hay datos, pero no están en el dispositivo y no hay conexión para bajarlos. */
  | { status: 'missing' }
  /** El paquete de pesca (descarga aparte) todavía no se bajó: se ofrece bajarlo. */
  | { status: 'notDownloaded' }
  | { status: 'ready'; data: FishData };

/** Datos de pesca del país elegido en Ajustes. */
export function useFishData(): FishDataState {
  const country = useSettings((s) => s.settings.country);
  const [state, setState] = useState<FishDataState>({ status: 'loading' });
  // Se vuelve a leer cuando termina de bajarse o se borra el paquete (desde Ajustes o desde la sección).
  const fishVersion = useCountryPackStore((s) => (s.busyFish ? -1 : JSON.stringify(s.fish[country] ?? null)));
  useEffect(() => {
    if (!FISH_COUNTRIES.includes(country)) {
      setState({ status: 'none' });
      return;
    }
    let alive = true;
    setState({ status: 'loading' });
    // El paquete de pesca es una descarga aparte: si no está guardado, no se baja solo; la pantalla ofrece bajarlo.
    void hasFishData(country).then(async (stored) => {
      if (!stored) {
        if (alive) setState({ status: 'notDownloaded' });
        return;
      }
      const data = await loadFishData(country);
      if (alive) setState(data ? { status: 'ready', data } : { status: 'missing' });
    });
    return () => {
      alive = false;
    };
  }, [country, fishVersion]);
  return state;
}
