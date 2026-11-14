import { useEffect } from 'react';
import { create } from 'zustand';
import { onLocation } from '@/core/geo/locationEvents';
import { useSettings, type Country } from '@/core/settings/settings';
import { distanceMeters } from '@/core/geo/geo';
import { useMapZones } from '@/modules/maps/store';
import { loadBorders } from './borders';
import { prefetchCountry } from './country';
import { countryFiles, downloadsSilently, missingDownload, networkInfo } from './countryDownload';
import { refreshStored } from './dataFile';
import { createCountryDetector, type DetectedCountries } from './countryDetector';

/**
 * Qué pasa cuando se detecta que estás en otro país (ver `countryDetector.ts`):
 *  1. se guarda el país detectado y los vecinos a menos de 50 km (lo usan las pantallas: números de emergencia, radio, cercanos);
 *  2. se ofrece cambiar el país de la app («Estás en Perú: ¿usar Perú en la app?»); «No, gracias» se recuerda por país;
 *  3. se bajan los datos del país y de los vecinos: con Wi-Fi sin avisar; con datos móviles o conexión desconocida, preguntando antes.
 * Solo reacciona a eventos de ubicación (un punto del GPS, un lugar elegido): no pide el GPS ni corre en segundo plano.
 */

interface NoticesState {
  /** País que se ofrece usar en la app. */
  offer: Country | null;
  /** Descarga pendiente de confirmar (datos móviles o conexión desconocida). */
  ask: { countries: Country[]; bytes: number } | null;
  /** Oferta de bajar mapas sin conexión del lugar donde llegaste. */
  mapOffer: { country: Country; lat: number; lon: number } | null;
}

export const useCountryNotices = create<NoticesState>(() => ({ offer: null, ask: null, mapOffer: null }));

/** Las descargas que se dijo «Ahora no» en esta sesión (para no insistir con la misma). */
const declined = new Set<string>();
export const declineDownload = (countries: Country[]) => declined.add(countries.join(','));

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

/** Baja los datos de los países detectados que falten, o pregunta antes si no hay Wi-Fi seguro. */
export async function downloadFor(d: DetectedCountries): Promise<void> {
  if (!navigator.onLine) return;
  const countries = [d.country, ...d.near];
  const missing = await missingDownload(countries);
  if (missing.files.length > 0) {
    if (downloadsSilently(networkInfo())) await Promise.all(countries.map(prefetchCountry));
    else if (!declined.has(countries.join(','))) useCountryNotices.setState({ ask: { countries, bytes: missing.bytes } });
  }
  await updateStored(countries);
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
  await downloadFor(d);
}

/** Se monta una vez en la app: engancha la detección a los eventos de ubicación. */
export function useCountryAutomation(): void {
  useEffect(() => {
    refreshOffer();
    // Al abrir la app: lo guardado del país de la app y del detectado se actualiza si cambió (solo Wi-Fi, una vez cada 12 horas).
    const s = useSettings.getState().settings;
    void updateStored([...new Set([s.country, ...(s.detectedCountry ? [s.detectedCountry, ...s.detectedNear] : [])])]).catch(() => undefined);
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
