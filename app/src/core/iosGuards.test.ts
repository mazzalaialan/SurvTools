import { afterEach, describe, expect, it, vi } from 'vitest';

/** Lo que es solo de Android no tiene que andar (ni molestar) en iPhone: se simula Capacitor diciendo que es iPhone. */
function asPlatform(name: 'ios' | 'android' | 'web') {
  vi.stubGlobal('Capacitor', name === 'web' ? undefined : { isNativePlatform: () => true, getPlatform: () => name });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('isAndroid', () => {
  it.each([
    ['android', true],
    ['ios', false],
    ['web', false],
  ] as const)('%s → %s', async (name, expected) => {
    asPlatform(name);
    const { isAndroid } = await import('./platform');
    expect(isAndroid()).toBe(expected);
  });
});

describe('copia automática', () => {
  it('en iPhone no se hace (Documentos de la app se borra al desinstalar)', async () => {
    asPlatform('ios');
    const { runAutoBackup } = await import('./backup/autoBackup');
    expect(await runAutoBackup({ force: true })).toBe('unsupported');
  });
});
