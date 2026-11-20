import { describe, expect, it, vi } from 'vitest';

let answer: () => Promise<unknown> = async () => ({});
vi.mock('@capgo/background-geolocation', () => ({ BackgroundGeolocation: { checkPermissions: () => answer() } }));
const { backgroundLocationGranted } = await import('./nativeBackgroundLocationProbe');

describe('backgroundLocationGranted', () => {

  it('sí con el permiso de ubicación, aunque no tenga el de «todo el tiempo» (la app no lo usa)', async () => {
    answer = async () => ({ location: 'granted', backgroundLocation: 'denied' });
    expect(await backgroundLocationGranted()).toBe(true);
    answer = async () => ({ location: 'granted' });
    expect(await backgroundLocationGranted()).toBe(true);
  });

  it('no sin el permiso de ubicación', async () => {
    answer = async () => ({ location: 'denied', backgroundLocation: 'granted' });
    expect(await backgroundLocationGranted()).toBe(false);
    answer = async () => ({ location: 'prompt' });
    expect(await backgroundLocationGranted()).toBe(false);
  });

  it('no si no se puede leer', async () => {
    answer = async () => {
      throw new Error('x');
    };
    expect(await backgroundLocationGranted()).toBe(false);
  });
});
