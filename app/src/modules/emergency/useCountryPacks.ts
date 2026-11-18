import { useEffect } from 'react';
import { create } from 'zustand';
import { COUNTRIES, type Country } from '@/core/settings/settings';
import { downloadCountryPack } from './country';
import { countryPackState, type PackState } from './countryDownload';

export interface Pack {
  state: PackState;
  bytes: number;
}

interface PacksState {
  packs: Partial<Record<Country, Pack>>;
  busy: Country | null;
  check: (force?: boolean) => Promise<void>;
  download: (c: Country) => Promise<void>;
}

/** Un solo estado para todos los que lo muestran (el selector de Ajustes y el mapa de países): si uno baja un país, el otro se entera. */
export const useCountryPackStore = create<PacksState>((set, get) => ({
  packs: {},
  busy: null,
  async check(force = false) {
    for (const c of COUNTRIES) {
      const p = await countryPackState(c, force).catch(() => null);
      if (p) set((prev) => ({ packs: { ...prev.packs, [c]: { state: p.state, bytes: p.bytes } } }));
    }
  },
  async download(c) {
    set({ busy: c });
    try {
      await downloadCountryPack(c);
    } finally {
      set({ busy: null });
      void get().check(true);
    }
  },
}));

/**
 * Estado del paquete de datos sin conexión de cada país (al día, hay una versión nueva o falta) y la descarga de uno. Se revisa al abrir y
 * cuando vuelve la conexión.
 */
export function useCountryPacks() {
  const { packs, busy, check, download } = useCountryPackStore();
  useEffect(() => {
    void check();
    const again = () => void check(true);
    window.addEventListener('online', again);
    return () => window.removeEventListener('online', again);
  }, [check]);
  return { packs, busy, download, check };
}
