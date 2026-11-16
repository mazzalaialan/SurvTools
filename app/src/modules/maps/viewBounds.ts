import type { ViewBox } from '@/modules/layers/geology';

/**
 * Qué parte del mundo hay que darle a las capas de áreas (ecorregiones, geología): lo que se ve más un margen del tamaño de la pantalla a
 * cada lado, así mover el mapa un poco no obliga a rearmar los datos (solo cuando la vista sale del área cargada).
 */
export interface ViewLike {
  lat: number;
  lon: number;
  zoom: number;
}

/** Caja de una pantalla de `width` × `height` píxeles (por defecto, grande: 1400 × 1000), con `margin` pantallas de margen. */
export function viewBounds(v: ViewLike, margin = 0, width = 1400, height = 1000): ViewBox {
  const degPerPx = 360 / (512 * 2 ** v.zoom);
  const halfLon = ((width / 2) * degPerPx) * (1 + 2 * margin);
  const halfLat = ((height / 2) * degPerPx * Math.cos((v.lat * Math.PI) / 180)) * (1 + 2 * margin);
  return [Math.max(-180, v.lon - halfLon), Math.max(-90, v.lat - halfLat), Math.min(180, v.lon + halfLon), Math.min(90, v.lat + halfLat)];
}

export const containsBox = (outer: ViewBox, inner: ViewBox): boolean => inner[0] >= outer[0] && inner[1] >= outer[1] && inner[2] <= outer[2] && inner[3] <= outer[3];

/** El área a cargar para esta vista: la anterior si todavía la contiene (histéresis) o una nueva con margen de una pantalla a cada lado. */
export function nextAreaBox(current: ViewBox | null, v: ViewLike): ViewBox {
  const seen = viewBounds(v, 0);
  return current && containsBox(current, seen) ? current : viewBounds(v, 1);
}
