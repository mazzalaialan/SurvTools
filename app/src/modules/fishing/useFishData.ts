import { useEffect, useState } from 'react';
import { useSettings } from '@/core/settings/settings';
import { FISH_COUNTRIES, loadFishData, type FishData } from './fishing';

export type FishDataState =
  | { status: 'loading' }
  /** El país todavía no tiene datos de pesca. */
  | { status: 'none' }
  /** Hay datos, pero no están en el dispositivo y no hay conexión para bajarlos. */
  | { status: 'missing' }
  | { status: 'ready'; data: FishData };

/** Datos de pesca del país elegido en Ajustes. */
export function useFishData(): FishDataState {
  const country = useSettings((s) => s.settings.country);
  const [state, setState] = useState<FishDataState>({ status: 'loading' });
  useEffect(() => {
    if (!FISH_COUNTRIES.includes(country)) {
      setState({ status: 'none' });
      return;
    }
    let alive = true;
    setState({ status: 'loading' });
    void loadFishData(country).then((data) => {
      if (alive) setState(data ? { status: 'ready', data } : { status: 'missing' });
    });
    return () => {
      alive = false;
    };
  }, [country]);
  return state;
}
