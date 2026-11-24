import { useSettings, type BrSector, type Country } from '@/core/settings/settings';
import { forgetLoadedCountry, prefetchCountry } from './country';
import { deletableFiles, fishFiles } from './countryDownload';
import { forgetLoadedParks } from './data';
import { forgetDataFile, loadDataFile, refreshStored } from './dataFile';
import { forgetLoadedFish } from '@/modules/fishing/fishing';
import { sectorFiles } from './sectors';
import { forgetLoadedService, SERVICE_CATEGORIES } from './services';

/**
 * Borrar del dispositivo los datos sin conexión de un país o de un sector de Brasil, para liberar espacio. Lo que usa otro país (las
 * ecorregiones, los parques de Chile que también usa Argentina) no se toca. Lo que ya viene con la app (Argentina) se puede volver a bajar.
 */

/** Los archivos de este país que hay en el dispositivo, para decir cuánto se libera. */
export const filesToDelete = (country: Country): string[] => (country === 'BR' ? useSettings.getState().settings.brSectors.flatMap(sectorFiles) : deletableFiles(country));

async function forget(files: string[]): Promise<void> {
  for (const f of files) await forgetDataFile(f).catch(() => undefined);
  for (const f of files) forgetLoadedService(f);
}

/** Borra los datos del país. Con Brasil, los de todos los sectores elegidos (y deja la elección vacía). */
export async function deleteCountryPack(country: Country): Promise<void> {
  const files = filesToDelete(country);
  if (country === 'BR') await useSettings.getState().update({ brSectors: [] });
  await forget(files);
  forgetLoadedCountry(country);
  forgetLoadedParks(country);
  for (const c of SERVICE_CATEGORIES) forgetLoadedService(`${c}-${country}.json`);
}

/** Baja un sector de Brasil (lo suma a la elección) y deja al día lo que ya había de él. */
export async function downloadSector(id: BrSector): Promise<void> {
  const { brSectors: current, brSectorsDeclined: declined } = useSettings.getState().settings;
  // Bajarlo a mano lo saca de los «no volver a bajar solo».
  await useSettings.getState().update({ brSectors: current.includes(id) ? current : [...current, id], brSectorsDeclined: declined.filter((s) => s !== id) });
  await prefetchCountry('BR');
  await refreshStored(sectorFiles(id), true).catch(() => 0);
}

/** Borra un sector de Brasil y lo saca de la elección. */
export async function deleteSector(id: BrSector): Promise<void> {
  const { brSectors: current, brSectorsDeclined: declined } = useSettings.getState().settings;
  // Si se borra a propósito, la detección por ubicación no lo vuelve a bajar sola.
  await useSettings.getState().update({ brSectors: current.filter((s) => s !== id), brSectorsDeclined: declined.includes(id) ? declined : [...declined, id] });
  await forget(sectorFiles(id));
}

/** Baja (o actualiza) el paquete de pesca del país: es aparte de los datos generales (botón con un pez en Ajustes). */
export async function downloadFishPack(country: Country): Promise<void> {
  for (const f of fishFiles(country)) await loadDataFile(f);
  await refreshStored(fishFiles(country), true).catch(() => 0);
  forgetLoadedFish();
}

/** Borra el paquete de pesca del país. */
export async function deleteFishPack(country: Country): Promise<void> {
  await forget(fishFiles(country));
  forgetLoadedFish();
}
