import type { MapLayers } from '@/core/settings/settings';

/** Capas que pintan el mismo mapa con colores propios: solo una a la vez para que la información no se superponga. */
export const EXCLUSIVE_LAYERS = ['slope', 'ecoregions', 'geology'] as const satisfies readonly (keyof MapLayers)[];

/** Prende o apaga una capa; al prender una de las exclusivas, apaga las otras. */
export function withLayer(layers: MapLayers, key: keyof MapLayers, on: boolean): MapLayers {
  const next = { ...layers, [key]: on };
  if (on && (EXCLUSIVE_LAYERS as readonly string[]).includes(key)) for (const other of EXCLUSIVE_LAYERS) if (other !== key) next[other] = false;
  return next;
}
