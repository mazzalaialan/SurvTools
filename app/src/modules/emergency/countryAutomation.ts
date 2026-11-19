import { useEffect } from 'react';
import { create } from 'zustand';
import { onLocation } from '@/core/geo/locationEvents';
import { useSettings, type BrSector, type Country } from '@/core/settings/settings';
import { distanceMeters } from '@/core/geo/geo';
import { useMapZones } from '@/modules/maps/store';
import { loadBorders } from './borders';
import { countryFiles, downloadsSilently, networkInfo, sectorPackState } from './countryDownload';
import { downloadSector } from './countryDelete';
import { sectorAt } from './sectors';
import { refreshStored } from './dataFile';
import { createCountryDetector, type DetectedCountries } from './countryDetector';

/**
 * Qué pasa cuando se detecta que estás en otro país (ver `countryDetector.ts`):
 *  1. se guarda el país detectado y los vecinos a menos de 50 km (solo para saber si hay que preguntar: NINGUNA pantalla usa el país detectado, todas
 *     usan el país elegido en Ajustes; el GPS puede tardar en actualizarse o ser incorrecto);
 *  2. se ofrece cambiar el país de la app («Estás en Perú: ¿usar Perú en la app?»); «No, gracias» se recuerda por país. Si se acepta, el país se
 *     cambia y se baja su paquete (`useCountryPrefetch`; en Brasil, el sector donde estás, ver `downloadSectorFor`);
 *  3. NO se baja nada de un país que no elegiste. En Brasil, ya elegido, se baja el sector donde estás parado.
 * Solo reacciona a eventos de ubicación (un punto del GPS, un lugar elegido): no pide el GPS ni corre en segundo plano.
 */

interface NoticesState {
  /** País que se ofrece usar en la app. */
  offer: Country | null;
  /** Descarga pendiente de confirmar (datos móviles o conexión desconocida). */
  ask: { countries: Country[]; bytes: number; /** Brasil: el sector que se ofrece bajar (el de donde estás). */ sector?: BrSector } | null;
  /** Oferta de bajar mapas sin conexión del lugar donde llegaste. */
  mapOffer: { country: Country; lat: number; lon: number } | null;
}

export const useCountryNotices = create<NoticesState>(() => ({ offer: null, ask: null, mapOffer: null }));

/** Las descargas que se dijo «Ahora no» en esta sesión (para no insistir con la misma). */
const declined = new Set<string>();
export const declineDownload = (countries: Country[], sector?: BrSector) => declined.add(sector ? `BR:${sector}` : countries.join(','));

/** ¿Hay que ofrecer cambiar el país? Si el detectado es otro, no se dijo «No, gracias» y todavía no es el de la app. */
export function offerFor(detected: Country | null, home: Country, dismissed: Country[]): Country | null {
  return detected && detected !== home && !dismissed.includes(detected) ? detected : null;
}

export function refreshOffer(): void {
  const s = useSettings.getState().settings;
  useCountryNotices.setState({ offer: offerFor(s.detectedCountry, s.country, s.countryOfferDismissed) });
}

/**
 * ¿Hay que ofrecer bajar mapas del lugar? Si estás en un país que no es el de la app, no dijiste «No, gracias» para él,
 * hay conexión (si no, no se podría bajar) y ninguna zona ya bajada cubre el punto.
 */
export function mapOfferFor(
  detected: Country,
  home: Country,
  dismissed: Country[],
  zones: { lat: number; lon: number; radiusKm: number }[],
  at: { lat: number; lon: number },
  online: boolean,
): { country: Country; lat: number; lon: number } | null {
  if (!online || detected === home || dismissed.includes(detected)) return null;
  if (zones.some((z) => distanceMeters(z, at) <= z.radiusKm * 1000)) return null;
  return { country: detected, lat: at.lat, lon: at.lon };
}

/**
 * ¿Hay que bajar el sector de Brasil donde estás? Si todavía no lo tenés, no lo borraste a mano (en ese caso no se vuelve a bajar solo) y no
 * dijiste «Ahora no» en esta sesión.
 */
export function sectorToDownload(sector: BrSector | null, selected: BrSector[], deleted: BrSector[], declinedNow: Set<string> = declined): BrSector | null {
  if (!sector || selected.includes(sector) || deleted.includes(sector) || declinedNow.has(`BR:${sector}`)) return null;
  return sector;
}

/**
 * Estás en Brasil: baja el sector donde estás parado (las cinco macrorregiones del IBGE). Con Wi-Fi sin avisar; con datos móviles o conexión
 * desconocida, preguntando antes (igual que con los países). Los estados salen del mapa base, que viene con la app.
 */
export async function downloadSectorFor(at: { lat: number; lon: number }): Promise<void> {
  if (!navigator.onLine) return;
  const geo = await import('@/modules/weathermap/geo').then((m) => m.loadGeoData());
  const s = useSettings.getState().settings;
  const sector = sectorToDownload(sectorAt(geo.regions, at.lat, at.lon), s.brSectors, s.brSectorsDeclined);
  if (!sector) return;
  if (downloadsSilently(networkInfo())) {
    await downloadSector(sector);
    return;
  }
  const info = await sectorPackState(sector);
  useCountryNotices.setState({ ask: { countries: ['BR'], bytes: info.total, sector } });
}

/**
 * Actualiza lo que ya está guardado de estos países: baja solo los archivos que cambiaron (compara los índices, ver `refreshStored`),
 * como mucho cada 12 horas. Con Wi-Fi sin avisar; con datos móviles o conexión desconocida no baja a escondidas (los archivos que se
 * usan igual se actualizan al abrirlos, con la misma comparación).
 */
export async function updateStored(countries: Country[]): Promise<number> {
  if (!navigator.onLine || !downloadsSilently(networkInfo())) return 0;
  return refreshStored(countries.flatMap(countryFiles));
}

async function onDetected(d: DetectedCountries, at: { lat: number; lon: number }): Promise<void> {
  await useSettings.getState().update({ detectedCountry: d.country, detectedNear: d.near });
  refreshOffer();
  const s = useSettings.getState().settings;
  useCountryNotices.setState({ mapOffer: mapOfferFor(d.country, s.country, s.mapOfferDismissed, useMapZones.getState().zones, at, navigator.onLine) });
  lastDetectedAt = at;
  // Brasil se baja por sector: con Brasil elegido, el de donde estás. (Si todavía no lo elegiste, se pregunta si querés cambiar y el sector se baja al aceptar.)
  if (d.country === 'BR' && s.country === 'BR') await downloadSectorFor(at).catch(() => undefined);
}

/** La última ubicación con la que se detectó el país (para bajar el sector de Brasil al aceptar el cambio de país). */
let lastDetectedAt: { lat: number; lon: number } | null = null;
export const lastDetectedLocation = (): { lat: number; lon: number } | null => lastDetectedAt;

/** Se monta una vez en la app: engancha la detección a los eventos de ubicación. */
export function useCountryAutomation(): void {
  useEffect(() => {
    refreshOffer();
    // Al abrir la app: lo guardado del país elegido se actualiza si cambió (solo Wi-Fi, una vez cada 12 horas).
    void updateStored([useSettings.getState().settings.country]).catch(() => undefined);
    const detector = createCountryDetector({
      load: loadBorders,
      current: () => {
        const s = useSettings.getState().settings;
        return s.detectedCountry ? { country: s.detectedCountry, near: s.detectedNear } : null;
      },
      onChange: (d, at) => void onDetected(d, at),
    });
    const off = onLocation(detector.note);
    return () => {
      off();
      detector.cancel();
    };
  }, []);
}
