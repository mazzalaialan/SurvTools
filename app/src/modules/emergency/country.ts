import { requestPersistence } from '@/core/storage/persist';
import { useEffect } from 'react';
import { useSettings, type Country } from '@/core/settings/settings';
import { loadEmergencyData, loadParksCL, loadParksFile, type EmergencyData } from './data';
import { prefetchServices } from './services';
import { countryFiles } from './countryDownload';
import { loadOfficialTides } from '@/modules/navigation/officialTides';
import { downloadVegetationCL, loadEcoregions } from '@/modules/ecoregions/ecoregions';
import { downloadGeologyPack } from '@/modules/layers/geology';
import { CountryDataError, DATA_CACHE as CACHE, loadDataFile, refreshStored } from './dataFile';
export { CountryDataError } from './dataFile';
import { sectorFiles } from './sectors';
import { loadOfficialRepeaters } from './officialRepeaters';
import { loadPlaceFinder, placeFinder, type PlaceFinder, type PlacesData } from './places';

/**
 * Datos sin conexión del país elegido. Los de Argentina vienen con la app; los
 * de Chile y Uruguay son un paquete aparte (tools/country-data) que no va en la
 * descarga inicial: se baja la primera vez que se elige ese país y queda
 * guardado en el dispositivo (Cache Storage), así funciona sin conexión.
 */

export interface CountryData {
  emergency: EmergencyData;
  places: PlaceFinder;
}

interface CountryPackage extends EmergencyData, PlacesData {
  country: Country;
  generatedAt: string;
}


const packageUrl = (country: Country) => `${import.meta.env.BASE_URL}data/${country}.json`;


/** Junta los paquetes de varios sectores de Brasil en uno: los estados y las localidades se suman (los índices de estado se corren) y las fuentes se unen. */
export function mergePackages(parts: CountryPackage[]): CountryPackage {
  const provinces: string[] = [];
  const places: PlacesData['places'] = [];
  for (const p of parts) {
    const offset = provinces.length;
    provinces.push(...p.provinces);
    for (const [name, prov, lat, lon, rank] of p.places) places.push([name, prov + offset, lat, lon, rank]);
  }
  // Más relevantes primero, como en cada archivo.
  places.sort((a, b) => b[4] - a[4]);
  const joinSource = (k: keyof CountryPackage['sources']) => [...new Set(parts.map((p) => p.sources?.[k]).filter(Boolean))].join(' ');
  return {
    country: 'BR',
    generatedAt: parts.map((p) => p.generatedAt).sort().at(-1) ?? '',
    ...(parts.length > 0 && parts.every((p) => p.osm) ? { osm: true } : {}),
    sources: { fire: joinSource('fire'), police: joinSource('police'), health: joinSource('health'), radio: joinSource('radio') },
    fire: parts.flatMap((p) => p.fire),
    police: parts.flatMap((p) => p.police),
    health: parts.flatMap((p) => p.health),
    radio: parts.flatMap((p) => p.radio),
    provinces,
    places,
  };
}

/** Brasil: los paquetes de los sectores elegidos (si no se eligió ninguno, no hay datos: `CountryDataError`). */
async function loadBrazilPackage(): Promise<CountryPackage> {
  const ids = useSettings.getState().settings.brSectors;
  if (ids.length === 0) throw new CountryDataError();
  return mergePackages(await Promise.all(ids.map((id) => loadDataFile<CountryPackage>(`BR-${id}.json`))));
}

const loadPackage = (country: Country) => (country === 'BR' ? loadBrazilPackage() : loadDataFile<CountryPackage>(`${country}.json`));

const loaded = new Map<string, Promise<CountryData>>();

/** Olvida lo que quedó en memoria del país (después de borrar sus datos del dispositivo). */
export const forgetLoadedCountry = (country: Country): void => void loaded.delete(country);

/** La clave de la carga: Brasil lleva los sectores elegidos, así al cambiar la elección se vuelve a armar. */
const loadKey = (country: Country) => (country === 'BR' ? `BR:${useSettings.getState().settings.brSectors.join(',')}` : country);

/** Datos del país (una sola carga por sesión). Lanza `CountryDataError` si no hay paquete ni conexión. */
export function loadCountryData(country: Country): Promise<CountryData> {
  const key = loadKey(country);
  let pending = loaded.get(key);
  if (!pending) {
    pending =
      country === 'AR'
        ? Promise.all([loadEmergencyData(), loadPlaceFinder()]).then(([emergency, places]) => ({ emergency, places }))
        : loadPackage(country).then((pkg) => ({ emergency: pkg, places: placeFinder(pkg) }));
    // Si falla (sin conexión y sin paquete), se reintenta la próxima vez.
    pending.catch(() => loaded.delete(key));
    loaded.set(key, pending);
  }
  return pending;
}

/**
 * Baja el paquete del país elegido en segundo plano apenas hay conexión, para
 * que esté sin conexión cuando haga falta (no espera a abrir una pantalla).
 */
export function useCountryPrefetch(): void {
  const country = useSettings((s) => s.settings.country);
  useEffect(() => {
    const fetchIt = () => void prefetchCountry(country);
    if (navigator.onLine) fetchIt();
    window.addEventListener('online', fetchIt);
    return () => window.removeEventListener('online', fetchIt);
  }, [country]);
}

/** Baja todo lo del país que se usa sin conexión: el paquete, los servicios, las repetidoras oficiales, los parques y las ecorregiones. Falla en silencio. */
export async function prefetchCountry(country: Country): Promise<void> {
  // Que el navegador no borre los datos del país si se queda sin espacio.
  void requestPersistence();
  const quiet = (p: Promise<unknown>) => p.catch(() => undefined);
  await Promise.all([
    country !== 'AR' ? quiet(loadCountryData(country)) : undefined,
    // Ecorregiones (un archivo para todos los países, ~0,8 MB).
    quiet(loadEcoregions()),
    // Geología del país (base nacional; cada país tiene la suya, ver layers/geology.ts).
    quiet(downloadGeologyPack(country)),
    // Tablas de marea oficiales (Argentina y Uruguay).
    country === 'AR' || country === 'UY' ? quiet(loadOfficialTides()) : undefined,
    // Pisos de vegetación de Chile.
    country === 'CL' ? quiet(downloadVegetationCL()) : undefined,
    // Servicios del país (estaciones, farmacias, agua, refugios…; también Argentina: van aparte para no agrandar la descarga inicial).
    quiet(prefetchServices(country)),
    // Repetidoras oficiales de Chile: también con Argentina (en la cordillera se está cerca).
    quiet(loadOfficialRepeaters(country)),
    // Áreas protegidas de Chile (CONAF): también con Argentina, por la cordillera.
    country === 'AR' || country === 'CL' ? quiet(loadParksCL()) : undefined,
    // Bolivia, Perú, Paraguay, Uruguay y Brasil: las suyas (SERNAP, SERNANP, CNUC, OpenStreetMap).
    country === 'BO' || country === 'PE' || country === 'PY' || country === 'UY' || country === 'BR' ? quiet(loadParksFile(country)) : undefined,
  ]);
}

/** ¿Ya está guardado el paquete del país? (Argentina siempre). */
export async function hasCountryData(country: Country): Promise<boolean> {
  if (country === 'AR') return true;
  if (!('caches' in globalThis)) return false;
  // Brasil: alcanza con que esté guardado el paquete de algún sector elegido.
  if (country === 'BR') {
    const cache = await caches.open(CACHE);
    const ids = useSettings.getState().settings.brSectors;
    return (await Promise.all(ids.map((id) => cache.match(`${import.meta.env.BASE_URL}data/${sectorFiles(id)[0]}`)))).some(Boolean);
  }
  return !!(await (await caches.open(CACHE)).match(packageUrl(country)));
}

/** Baja lo que falta del país y actualiza lo que quedó viejo (para el botón de descarga de Ajustes, sin elegir el país). */
export async function downloadCountryPack(country: Country): Promise<void> {
  await prefetchCountry(country);
  await refreshStored(countryFiles(country), true).catch(() => 0);
}
