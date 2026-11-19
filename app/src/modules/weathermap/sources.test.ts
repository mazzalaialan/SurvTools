import { describe, expect, it, vi } from 'vitest';
import { fetchSinarame, MapSourceError, radarTouchesView, readMapCache, writeMapCache } from './sources';

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

describe('radares argentinos', () => {
  const bounds = { west: -65, east: -60, south: -40, north: -36 };

  it('el radar entra en la vista solo si su cuadrado la toca', () => {
    expect(radarTouchesView(bounds, { west: -62, east: -58, south: -38, north: -34 })).toBe(true);
    expect(radarTouchesView(bounds, { west: -59, east: -55, south: -38, north: -34 })).toBe(false); // más al este
    expect(radarTouchesView(bounds, { west: -62, east: -58, south: -35, north: -30 })).toBe(false); // más al norte
    expect(radarTouchesView(bounds, { west: -90, east: -30, south: -60, north: -10 })).toBe(true); // el país entero
  });

  it('pide los radares elegidos al servidor y arma las direcciones completas de las imágenes', async () => {
    const fetchMock = vi.fn(async (_url: string) =>
      new Response(
        JSON.stringify({
          enabled: true,
          attribution: 'SINARAME',
          radars: [{ id: 'RMA10', name: 'Bahía Blanca', bounds, frames: [{ at: '2026-11-19T12:50:00.000Z', url: '/api/radar/RMA10/20261119095000.png' }] }],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const d = await fetchSinarame('https://srv.example/', ['RMA10', 'RMA1']);
    expect(String(fetchMock.mock.calls[0]![0])).toBe('https://srv.example/api/radar?ids=RMA10,RMA1');
    expect(d.attribution).toBe('SINARAME');
    expect(d.radars[0]!.frames[0]!.url).toBe('https://srv.example/api/radar/RMA10/20261119095000.png');
    expect(d.radars[0]!.frames[0]!.at).toEqual(new Date('2026-11-19T12:50:00.000Z'));
    vi.unstubAllGlobals();
  });

  it('si el servidor lo tiene apagado o falla, es un error de la fuente (no rompe el mapa)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ enabled: false, radars: [] }), { status: 200 })));
    await expect(fetchSinarame('https://srv.example', [])).rejects.toBeInstanceOf(MapSourceError);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 500 })));
    await expect(fetchSinarame('https://srv.example', [])).rejects.toBeInstanceOf(MapSourceError);
    vi.unstubAllGlobals();
  });
});
