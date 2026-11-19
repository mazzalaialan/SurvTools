import { useEffect } from 'react';
import { create } from 'zustand';

/**
 * De dónde salen los ángulos del celular, igual en Android, en iPhone y en la PWA.
 * - Chrome (Android, y su WebView): `deviceorientationabsolute`, con `alpha` respecto del norte magnético.
 * - iPhone (Safari, la PWA y la app nativa): no existe ese evento. Se usa `deviceorientation`, cuyo `alpha` NO es absoluto, pero trae
 *   `webkitCompassHeading` (rumbo magnético, en el sentido de las agujas del reloj, que ya compensa la inclinación: es hacia donde apunta la parte
 *   de arriba si el celular está acostado y hacia donde mira la cámara si está parado). Con eso se arma un `alpha` absoluto: `360 − rumbo`, que es lo
 *   que espera `orientationFrom` (heading.ts). SIN PROBAR en un iPhone real: ver docs/PENDIENTES.md.
 * - iPhone además pide un permiso (`DeviceOrientationEvent.requestPermission`) y solo se puede pedir desde un toque de la persona.
 */
export interface AbsoluteAngles {
  alpha: number;
  beta: number;
  gamma: number;
}

type IosEvent = DeviceOrientationEvent & { webkitCompassHeading?: number };
type IosEventCtor = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> };

/** ¿Este dispositivo pide permiso para leer los sensores de movimiento? (iPhone con iOS 13 o más) */
export function needsSensorPermission(): boolean {
  return typeof DeviceOrientationEvent !== 'undefined' && typeof (DeviceOrientationEvent as IosEventCtor).requestPermission === 'function';
}

/** ¿El WebView puede dar la orientación? (en iPhone no se sabe hasta tener el permiso: alcanza con que exista la forma de pedirlo) */
export function hasOrientationSensor(): boolean {
  return 'ondeviceorientationabsolute' in window || needsSensorPermission();
}

/** Los ángulos absolutos de un evento, o `null` si no sirven (iPhone sin brújula calibrada todavía). */
export function absoluteAngles(e: IosEvent): AbsoluteAngles | null {
  if (e.beta === null || e.gamma === null) return null;
  if (e.type === 'deviceorientationabsolute' || e.absolute === true) return e.alpha === null ? null : { alpha: e.alpha, beta: e.beta, gamma: e.gamma };
  const heading = e.webkitCompassHeading;
  if (typeof heading !== 'number' || !Number.isFinite(heading) || heading < 0) return null;
  return { alpha: (360 - heading) % 360, beta: e.beta, gamma: e.gamma };
}

/** Rotación de la pantalla (0 vertical, 90 o 270 horizontal). Safari de iPhone no tiene `screen.orientation` en todas las versiones. */
export function screenAngle(): number {
  const angle = screen.orientation?.angle;
  if (typeof angle === 'number') return angle;
  const legacy = (window as unknown as { orientation?: unknown }).orientation;
  return typeof legacy === 'number' ? (legacy + 360) % 360 : 0;
}

/** Escucha los ángulos absolutos. Devuelve la función que deja de escuchar. */
export function subscribeOrientation(handler: (angles: AbsoluteAngles) => void): () => void {
  const absolute = 'ondeviceorientationabsolute' in window;
  const name = absolute ? 'deviceorientationabsolute' : 'deviceorientation';
  const listener = (e: Event) => {
    const angles = absoluteAngles(e as IosEvent);
    if (angles) handler(angles);
  };
  window.addEventListener(name, listener);
  return () => window.removeEventListener(name, listener);
}

export type SensorPermission = 'unneeded' | 'prompt' | 'granted' | 'denied';

interface PermissionState {
  state: SensorPermission;
  /** Pide el permiso. Tiene que llamarse desde un toque de la persona. */
  request: () => Promise<SensorPermission>;
}

export const useSensorPermission = create<PermissionState>((set, get) => ({
  state: needsSensorPermission() ? 'prompt' : 'unneeded',
  async request() {
    if (!needsSensorPermission() || get().state === 'granted') return get().state;
    try {
      const result = await (DeviceOrientationEvent as IosEventCtor).requestPermission!();
      set({ state: result === 'granted' ? 'granted' : 'denied' });
    } catch {
      set({ state: 'denied' });
    }
    return get().state;
  },
}));

/**
 * Mientras `active`, si el dispositivo pide permiso y todavía no se dio, el PRÓXIMO toque en cualquier parte de la pantalla lo pide (iOS solo deja
 * pedirlo desde un toque). Así cada pantalla que usa los sensores anda sin tener que armar su propio botón.
 */
export function useSensorPermissionOnTap(active: boolean): SensorPermission {
  const state = useSensorPermission((s) => s.state);
  useEffect(() => {
    if (!active || state !== 'prompt') return;
    const ask = () => void useSensorPermission.getState().request();
    document.addEventListener('click', ask, { capture: true, once: true });
    return () => document.removeEventListener('click', ask, { capture: true });
  }, [active, state]);
  return state;
}
