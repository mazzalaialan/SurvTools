import { afterEach, describe, expect, it, vi } from 'vitest';
import { radarSaysDry } from './radarCheck';

const raining = { state: 'raining', mm: 1, peakMmH: 4 } as const;
const soon = { state: 'soon', inMinutes: 30, startsAt: '2026-11-19T14:00', mm: 1, peakMmH: 4 } as const;

function mockFetch(impl: () => Promise<Response>) {
  const fn = vi.fn((..._args: unknown[]) => impl());
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('radarSaysDry (doble chequeo con el radar)', () => {
  it('descarta solo si el servidor dice «clear»', async () => {
    const fn = mockFetch(async () => Response.json({ verdict: 'clear' }));
    expect(await radarSaysDry('https://srv.example/', -38.717, -62.268, raining)).toBe(true);
    const url = String(fn.mock.calls[0]![0]);
    // Coordenadas redondeadas a ~1 km, el estado y los minutos del aviso.
    expect(url).toBe('https://srv.example/api/radar/check?lat=-38.72&lon=-62.27&state=raining&minutes=0');
    expect(await radarSaysDry('https://srv.example', -38.7, -62.2, soon)).toBe(true);
    expect(String(fn.mock.calls[1]![0])).toContain('state=soon&minutes=30');
  });

  it('con eco, sin cobertura o respuesta rara, el aviso queda', async () => {
    for (const verdict of ['echo', 'unknown', 42, undefined]) {
      mockFetch(async () => Response.json({ verdict }));
      expect(await radarSaysDry('https://srv.example', -38.7, -62.2, raining)).toBe(false);
    }
  });

  it('sin servidor, con error de red o de HTTP, el aviso queda y no se pregunta de más', async () => {
    const fn = mockFetch(async () => Response.json({ verdict: 'clear' }));
    expect(await radarSaysDry('  ', -38.7, -62.2, raining)).toBe(false);
    expect(await radarSaysDry('https://srv.example', -38.7, -62.2, { state: 'dry' })).toBe(false);
    expect(fn).not.toHaveBeenCalled();
    mockFetch(async () => {
      throw new Error('sin red');
    });
    expect(await radarSaysDry('https://srv.example', -38.7, -62.2, raining)).toBe(false);
    mockFetch(async () => new Response('', { status: 500 }));
    expect(await radarSaysDry('https://srv.example', -38.7, -62.2, raining)).toBe(false);
  });
});
