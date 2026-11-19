import { afterEach, describe, expect, it, vi } from 'vitest';
import { orientationFrom } from './heading';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

const ev = (over: Record<string, unknown>) => ({ type: 'deviceorientation', alpha: 10, beta: 20, gamma: 30, absolute: false, ...over }) as unknown as DeviceOrientationEvent;

describe('absoluteAngles', () => {
  it('Android: el evento absoluto se usa tal cual', async () => {
    const { absoluteAngles } = await import('./orientationSource');
    expect(absoluteAngles(ev({ type: 'deviceorientationabsolute', alpha: 123 }))).toEqual({ alpha: 123, beta: 20, gamma: 30 });
  });
  it('iPhone: el alpha absoluto sale de webkitCompassHeading (360 − rumbo)', async () => {
    const { absoluteAngles } = await import('./orientationSource');
    expect(absoluteAngles(ev({ alpha: 77, webkitCompassHeading: 90 }))).toEqual({ alpha: 270, beta: 20, gamma: 30 });
    expect(absoluteAngles(ev({ webkitCompassHeading: 0 }))!.alpha).toBe(0);
  });
  it('iPhone: acostado el rumbo que se muestra es el de webkitCompassHeading', async () => {
    const { absoluteAngles } = await import('./orientationSource');
    for (const h of [0, 45, 90, 180, 271, 359]) {
      const a = absoluteAngles(ev({ webkitCompassHeading: h, beta: 0, gamma: 0 }))!;
      expect(orientationFrom(a.alpha, a.beta, a.gamma).heading).toBeCloseTo(h % 360, 5);
    }
  });
  it('iPhone: parado, el rumbo es hacia donde mira la cámara', async () => {
    const { absoluteAngles } = await import('./orientationSource');
    for (const h of [10, 120, 250, 330]) {
      const a = absoluteAngles(ev({ webkitCompassHeading: h, beta: 90, gamma: 0 }))!;
      const o = orientationFrom(a.alpha, a.beta, a.gamma);
      expect(o.mode).toBe('upright');
      expect(o.heading).toBeCloseTo(h, 5);
    }
  });
  it('sin brújula todavía (sin webkitCompassHeading ni evento absoluto) no inventa un rumbo', async () => {
    const { absoluteAngles } = await import('./orientationSource');
    expect(absoluteAngles(ev({}))).toBeNull();
    expect(absoluteAngles(ev({ webkitCompassHeading: -1 }))).toBeNull();
    expect(absoluteAngles(ev({ beta: null, webkitCompassHeading: 10 }))).toBeNull();
  });
});

describe('permiso de los sensores', () => {
  it('sin requestPermission (Android, PC) no hace falta pedir nada', async () => {
    vi.stubGlobal('DeviceOrientationEvent', class {});
    const m = await import('./orientationSource');
    expect(m.needsSensorPermission()).toBe(false);
    expect(m.useSensorPermission.getState().state).toBe('unneeded');
    expect(await m.useSensorPermission.getState().request()).toBe('unneeded');
  });
  it('iPhone: arranca pendiente y al aceptar queda concedido', async () => {
    const requestPermission = vi.fn(async () => 'granted' as const);
    vi.stubGlobal('DeviceOrientationEvent', Object.assign(class {}, { requestPermission }));
    const m = await import('./orientationSource');
    expect(m.needsSensorPermission()).toBe(true);
    expect(m.useSensorPermission.getState().state).toBe('prompt');
    expect(await m.useSensorPermission.getState().request()).toBe('granted');
    // Ya concedido: no vuelve a preguntar.
    await m.useSensorPermission.getState().request();
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });
  it('iPhone: si se niega (o falla), queda denegado', async () => {
    vi.stubGlobal('DeviceOrientationEvent', Object.assign(class {}, { requestPermission: vi.fn(async () => 'denied' as const) }));
    const m = await import('./orientationSource');
    expect(await m.useSensorPermission.getState().request()).toBe('denied');
    vi.resetModules();
    vi.stubGlobal('DeviceOrientationEvent', Object.assign(class {}, { requestPermission: vi.fn(async () => { throw new Error('x'); }) }));
    const m2 = await import('./orientationSource');
    expect(await m2.useSensorPermission.getState().request()).toBe('denied');
  });
});

describe('screenAngle', () => {
  it('usa screen.orientation y, si no existe, window.orientation', async () => {
    const { screenAngle } = await import('./orientationSource');
    vi.stubGlobal('screen', { orientation: { angle: 90 } });
    expect(screenAngle()).toBe(90);
    vi.stubGlobal('screen', {});
    vi.stubGlobal('window', { orientation: -90 });
    expect(screenAngle()).toBe(270);
    vi.stubGlobal('window', { orientation: 90 });
    expect(screenAngle()).toBe(90);
    vi.stubGlobal('window', {});
    expect(screenAngle()).toBe(0);
  });
});
