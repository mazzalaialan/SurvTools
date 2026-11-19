import { useEffect } from 'react';
import { create } from 'zustand';
import { COUNTRIES, useSettings, type BrSector, type Country } from '@/core/settings/settings';
import { downloadCountryPack } from './country';
import { deleteCountryPack, deleteSector, downloadSector } from './countryDelete';
import { countryPackState, sectorPackState, type PackState } from './countryDownload';
import { BR_SECTOR_IDS } from './sectors';

export interface Pack {
  state: PackState;
  bytes: number;
}

/** Un sector de Brasil: además de lo que falta bajar, cuánto pesa entero (lo que se baja o se libera al borrarlo). */
export interface SectorPack extends Pack {
  total: number;
}

interface PacksState {
  packs: Partial<Record<Country, Pack>>;
  sectors: Partial<Record<BrSector, SectorPack>>;
  busy: Country | null;
  busySector: BrSector | null;
  check: (force?: boolean) => Promise<void>;
  download: (c: Country) => Promise<void>;
  downloadSector: (id: BrSector) => Promise<void>;
  remove: (c: Country) => Promise<void>;
  removeSector: (id: BrSector) => Promise<void>;
}

/** Un solo estado para todos los que lo muestran (el selector de Ajustes y el mapa de países): si uno baja un país, el otro se entera. */
export const useCountryPackStore = create<PacksState>((set, get) => ({
  packs: {},
  sectors: {},
  busy: null,
  busySector: null,
  async check(force = false) {
    for (const c of COUNTRIES) {
      // Brasil se baja por sectores: sin ninguno elegido no hay nada bajado.
      const p = c === 'BR' && useSettings.getState().settings.brSectors.length === 0 ? { state: 'missing' as PackState, bytes: 0 } : await countryPackState(c, force).catch(() => null);
      if (p) set((prev) => ({ packs: { ...prev.packs, [c]: { state: p.state, bytes: p.bytes } } }));
    }
    for (const id of BR_SECTOR_IDS) {
      const p = await sectorPackState(id, force).catch(() => null);
      if (p) set((prev) => ({ sectors: { ...prev.sectors, [id]: { state: p.state, bytes: p.bytes, total: p.total } } }));
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
  async downloadSector(id) {
    set({ busySector: id });
    try {
      await downloadSector(id);
    } finally {
      set({ busySector: null });
      void get().check(true);
    }
  },
  async remove(c) {
    set({ busy: c });
    try {
      await deleteCountryPack(c);
    } finally {
      set({ busy: null });
      void get().check(true);
    }
  },
  async removeSector(id) {
    set({ busySector: id });
    try {
      await deleteSector(id);
    } finally {
      set({ busySector: null });
      void get().check(true);
    }
  },
}));

/**
 * Estado del paquete de datos sin conexión de cada país (al día, hay una versión nueva o falta) y de cada sector de Brasil, y la descarga y el
 * borrado de uno. Se revisa al abrir y cuando vuelve la conexión.
 */
export function useCountryPacks() {
  const store = useCountryPackStore();
  const { check } = store;
  useEffect(() => {
    void check();
    const again = () => void check(true);
    window.addEventListener('online', again);
    return () => window.removeEventListener('online', again);
  }, [check]);
  return store;
}
