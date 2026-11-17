import { describe, expect, it, vi } from 'vitest';
import { readMapCache, writeMapCache } from './sources';

// Un almacén en memoria con una demora al leer: así dos escrituras simultáneas se pisarían si no estuvieran ordenadas.
vi.mock('@/core/db/repository', () => {
  const store = new Map<string, Uint8Array>();
  return {
    blobStore: {
      get: async (id: string) => {
        const v = store.get(id) ?? null;
        await new Promise((r) => setTimeout(r, 5));
        return v;
      },
      put: async (id: string, bytes: Uint8Array) => void store.set(id, bytes),
    },
  };
});

describe('writeMapCache', () => {
  it('varias capas que guardan a la vez no se pisan entre sí', async () => {
    const at = new Date().toISOString();
    await Promise.all([
      writeMapCache({ quakes: { fetchedAt: at, items: [] } }),
      writeMapCache({ zones: { fetchedAt: at, items: [] } }),
      writeMapCache({ official: { fetchedAt: at, items: [], volcanoes: [] } }),
    ]);
    const saved = await readMapCache();
    expect(Object.keys(saved).sort()).toEqual(['official', 'quakes', 'zones']);
  });
});
