import type { PackState } from './countryDownload';

/** Cuadro del dibujo en metros Mercator (el mapa entero). */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Lo que se está mirando: el centro (en el mismo sistema que el cuadro) y cuánto se acercó (1 = el mapa entero). */
export interface View {
  cx: number;
  cy: number;
  zoom: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 14;

/** El rectángulo del dibujo que se ve con esa vista (mantiene la proporción del mapa entero). */
export function viewRect(box: Box, v: View): Box {
  const w = box.w / v.zoom;
  const h = box.h / v.zoom;
  return { x: v.cx - w / 2, y: v.cy - h / 2, w, h };
}

/** Acota el acercamiento y no deja que la vista se salga del mapa. */
export function clampView(box: Box, v: View): View {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom));
  const halfW = box.w / zoom / 2;
  const halfH = box.h / zoom / 2;
  return {
    zoom,
    cx: Math.min(box.x + box.w - halfW, Math.max(box.x + halfW, v.cx)),
    cy: Math.min(box.y + box.h - halfH, Math.max(box.y + halfH, v.cy)),
  };
}

/** Acerca o aleja `factor` veces dejando quieto el punto (fx, fy) del mapa: lo que está bajo el dedo o el cursor no se corre. */
export function zoomAround(box: Box, v: View, factor: number, fx: number, fy: number): View {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor));
  const k = v.zoom / zoom;
  return clampView(box, { zoom, cx: fx + (v.cx - fx) * k, cy: fy + (v.cy - fy) * k });
}

/** Corre la vista `dx`, `dy` (en unidades del mapa). */
export function panView(box: Box, v: View, dx: number, dy: number): View {
  return clampView(box, { ...v, cx: v.cx + dx, cy: v.cy + dy });
}

export const FULL_VIEW = (box: Box): View => ({ cx: box.x + box.w / 2, cy: box.y + box.h / 2, zoom: 1 });

/** Qué hace tocar un país: el primer toque lo marca; el siguiente lo baja o actualiza si hace falta; y con los datos al día, lo pone como el país activo. */
export type TapAction = 'mark' | 'download' | 'update' | 'use' | 'none';

export function tapAction(o: { marked: string | null; tapped: string; state: PackState | undefined; isCurrent: boolean; busy: boolean }): TapAction {
  if (o.marked !== o.tapped) return 'mark';
  if (o.busy) return 'none';
  if (o.state === 'missing') return 'download';
  if (o.state === 'outdated') return 'update';
  if (o.state === 'ready' && !o.isCurrent) return 'use';
  return 'none';
}

/**
 * Vista de un pellizco: el punto del mapa que estaba bajo el medio de los dos dedos al empezar (`anchor`) queda bajo el medio de los dedos
 * ahora (`mid`, en píxeles de pantalla), con el acercamiento `zoom`. Se calcula siempre desde el punto de partida (sin acumular cambios), así
 * no se corre ni "baila" aunque lleguen varios eventos seguidos. `rect` es el tamaño del dibujo en pantalla (el mapa se centra si sobra lugar).
 */
export function viewForPinch(
  box: Box,
  rect: { left: number; top: number; width: number; height: number },
  anchor: { x: number; y: number },
  mid: { x: number; y: number },
  zoom: number,
): View {
  const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
  const w = box.w / z;
  const h = box.h / z;
  const scale = Math.min(rect.width / w, rect.height / h);
  const offX = (rect.width - w * scale) / 2;
  const offY = (rect.height - h * scale) / 2;
  const x0 = anchor.x - (mid.x - rect.left - offX) / scale;
  const y0 = anchor.y - (mid.y - rect.top - offY) / scale;
  return clampView(box, { zoom: z, cx: x0 + w / 2, cy: y0 + h / 2 });
}
