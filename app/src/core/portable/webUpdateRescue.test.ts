import { afterEach, describe, expect, it, vi } from 'vitest';
import { forceWebUpdate, isAppShellCache, removeStaleRegistrations, staleRegistrations } from './webUpdateRescue';

const reg = (scope: string) => ({ scope, unregister: vi.fn(async () => true) });
const NOW = 'https://mazzalaialan.github.io/SurvTools/';

afterEach(() => vi.unstubAllGlobals());

describe('rescate de la actualización de la web', () => {
  it('reconoce los service workers del nombre viejo (/PrepperApp/) y deja los demás', () => {
    const regs = [reg(NOW), reg('https://mazzalaialan.github.io/PrepperApp/'), reg('https://mazzalaialan.github.io/OtroProyecto/'), reg('https://otro.example/PrepperApp/')];
    expect(staleRegistrations(regs, NOW).map((r) => r.scope)).toEqual(['https://mazzalaialan.github.io/PrepperApp/']);
    // Si la app volviera a vivir en /PrepperApp/, ese ya no es «viejo».
    expect(staleRegistrations(regs, 'https://mazzalaialan.github.io/PrepperApp/')).toEqual([]);
  });

  it('da de baja solo los viejos', async () => {
    const [a, b] = [reg(NOW), reg('https://mazzalaialan.github.io/PrepperApp/')];
    vi.stubGlobal('navigator', { serviceWorker: { getRegistrations: async () => [a, b] } });
    expect(await removeStaleRegistrations(NOW)).toBe(1);
    expect(a.unregister).not.toHaveBeenCalled();
    expect(b.unregister).toHaveBeenCalledTimes(1);
  });

  it('sin service workers disponibles no falla', async () => {
    vi.stubGlobal('navigator', {});
    expect(await removeStaleRegistrations(NOW)).toBe(0);
  });

  it('forzar la actualización borra solo la copia de la app, no los datos', async () => {
    const regs = [reg(NOW), reg('https://mazzalaialan.github.io/PrepperApp/')];
    const names = ['workbox-precache-v2-https://mazzalaialan.github.io/SurvTools/', 'workbox-precache-v2-https://mazzalaialan.github.io/PrepperApp/', 'vikarg-maps', 'vikarg-country', 'vikarg-library', 'vikarg-library-books'];
    const deleted: string[] = [];
    vi.stubGlobal('navigator', { serviceWorker: { getRegistrations: async () => regs } });
    vi.stubGlobal('caches', { keys: async () => names, delete: async (n: string) => (deleted.push(n), true) });
    const reload = vi.fn();
    await forceWebUpdate(reload);
    expect(regs.every((r) => r.unregister.mock.calls.length === 1)).toBe(true);
    expect(deleted.sort()).toEqual(names.filter((n) => n.startsWith('workbox-precache')).sort());
    expect(reload).toHaveBeenCalledTimes(1);
    expect(isAppShellCache('vikarg-country')).toBe(false);
  });
});
