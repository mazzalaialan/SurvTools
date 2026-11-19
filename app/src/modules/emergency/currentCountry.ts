import { useSettings, type Country } from '@/core/settings/settings';

/**
 * El país que usa la app: el elegido en Ajustes (el «país actual»). De él salen los números de emergencia, la guía de primeros auxilios, la tarjeta
 * de emergencia, la radio, los paquetes que se bajan para usar sin conexión y la vista inicial del mapa del clima. NO se mira el GPS ni la última
 * ubicación conocida: ese dato puede tardar en actualizarse o ser incorrecto. Si el GPS detecta que estás en otro país, la app pregunta si querés
 * cambiarlo (ver `countryAutomation.ts`) y, si decís que sí, lo cambia y baja su paquete.
 *
 * Lo que tiene un lugar para elegir (GPS o waypoint: lugares cercanos, clima, navegación, huerta…) usa el país de ESE lugar (`usePlaceCountries`).
 */
export function useCountry(): Country {
  return useSettings((s) => s.settings.country);
}
