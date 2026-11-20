import { beforeEach, describe, expect, it, vi } from 'vitest';

const checkPermissions = vi.fn();
vi.mock('@capgo/background-geolocation', () => ({ BackgroundGeolocation: { checkPermissions: () => checkPermissions() } }));
const { backgroundLocationGranted } = await import('./nativeBackgroundLocationProbe');

describe('backgroundLocationGranted', () => {
  beforeEach(() => checkPermissions.mockReset());

  it('sí con permiso «todo el tiempo»', async () => {
    checkPermissions.mockResolvedValue({ location: 'granted', backgroundLocation: 'granted' });
    expect(await backgroundLocationGranted()).toBe(true);
    checkPermissions.mockResolvedValue({ location: 'granted', backgroundLocation: 'always' });
    expect(await backgroundLocationGranted()).toBe(true);
  });

  it('no con «solo mientras se usa», sin permiso o sin el de ubicación', async () => {
    checkPermissions.mockResolvedValue({ location: 'granted', backgroundLocation: 'when_in_use' });
    expect(await backgroundLocationGranted()).toBe(false);
    checkPermissions.mockResolvedValue({ location: 'granted', backgroundLocation: 'denied' });
    expect(await backgroundLocationGranted()).toBe(false);
    checkPermissions.mockResolvedValue({ location: 'denied', backgroundLocation: 'granted' });
    expect(await backgroundLocationGranted()).toBe(false);
    checkPermissions.mockResolvedValue({ location: 'granted' });
    expect(await backgroundLocationGranted()).toBe(false);
  });

  it('no si no se puede leer', async () => {
    checkPermissions.mockImplementation(() => Promise.reject(new Error('x')));
    expect(await backgroundLocationGranted()).toBe(false);
  });
});
