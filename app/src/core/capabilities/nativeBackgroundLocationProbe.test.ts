import { describe, expect, it, vi } from 'vitest';

let answer: () => Promise<unknown> = async () => ({});
vi.mock('@capgo/background-geolocation', () => ({ BackgroundGeolocation: { checkPermissions: () => answer() } }));
const { backgroundLocationGranted } = await import('./nativeBackgroundLocationProbe');

describe('backgroundLocationGranted', () => {

  it('sí con el permiso «todo el tiempo»', async () => {
    answer = async () => ({ location: 'granted', backgroundLocation: 'granted' });
    expect(await backgroundLocationGranted()).toBe(true);
    answer = async () => ({ location: 'granted', backgroundLocation: 'always' });
    expect(await backgroundLocationGranted()).toBe(true);
  });

  it('no con «solo mientras se usa», sin permiso o sin el de ubicación', async () => {
    answer = async () => ({ location: 'granted', backgroundLocation: 'when_in_use' });
    expect(await backgroundLocationGranted()).toBe(false);
    answer = async () => ({ location: 'granted', backgroundLocation: 'denied' });
    expect(await backgroundLocationGranted()).toBe(false);
    answer = async () => ({ location: 'denied', backgroundLocation: 'granted' });
    expect(await backgroundLocationGranted()).toBe(false);
    answer = async () => ({ location: 'granted' });
    expect(await backgroundLocationGranted()).toBe(false);
  });

  it('no si no se puede leer', async () => {
    answer = async () => {
      throw new Error('x');
    };
    expect(await backgroundLocationGranted()).toBe(false);
  });
});
