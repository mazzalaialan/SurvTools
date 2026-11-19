import { useEffect, useMemo, useState } from 'react';
import type { Country } from '@/core/settings/settings';
import { loadBorders, type BordersData } from './borders';
import { useCountry } from './currentCountry';
import { detectCountries } from './countryDetector';

export { NEAR_BORDER_M } from './countryDetector';

/**
 * País del lugar elegido (GPS o a mano), por las fronteras, y los países vecinos a menos de 50 km de su frontera.
 * Las emisoras, los parques y las repetidoras tienen que ser las de ahí y no las del país de Ajustes (con Argentina en Ajustes y
 * un lugar en Perú, salían las radios argentinas); y cerca de una frontera, las de los dos lados (como las frecuencias de montaña).
 * Si el lugar no cae en ningún país que la app conozca, o todavía no cargaron las fronteras, vale el país elegido en Ajustes.
 */
export function usePlaceCountries(place: { lat: number; lon: number } | null): { country: Country; near: Country[] } {
  // Sin lugar (o fuera de los países que la app conoce), vale el país elegido en Ajustes.
  const here = useCountry();
  const [borders, setBorders] = useState<BordersData | null>(null);
  useEffect(() => {
    void loadBorders().then(setBorders, () => undefined);
  }, []);
  return useMemo(() => {
    const d = place && borders ? detectCountries(borders, place.lat, place.lon) : null;
    const country = d?.country ?? here;
    return { country, near: [country, ...(d?.near ?? [])] };
  }, [borders, place?.lat, place?.lon, here]);
}

/** Solo el país del lugar (ver `usePlaceCountries`). */
export const usePlaceCountry = (place: { lat: number; lon: number } | null): Country => usePlaceCountries(place).country;
