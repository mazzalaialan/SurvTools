import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { omFetchWith, ownUrl, resetOmBackoff } from './omFetch';

const PUB = 'https://api.open-meteo.com/v1/forecast?latitude=-34.6&longitude=-58.6&hourly=temperature_2m';
const SERVER = 'https://vikarg.example';
const ok = () => new Response('{"ok":true}', { status: 200 });

describe('ownUrl', () => {
  it('traduce las tres direcciones públicas a /api/om', () => {
    expect(ownUrl(PUB, SERVER)).toBe(`${SERVER}/api/om/v1/forecast?latitude=-34.6&longitude=-58.6&hourly=temperature_2m`);
    expect(ownUrl('https://archive-api.open-meteo.com/v1/archive?a=1', `${SERVER}/`)).toBe(`${SERVER}/api/om/v1/archive?a=1`);
    expect(ownUrl('https://marine-api.open-meteo.com/v1/marine?a=1', SERVER)).toBe(`${SERVER}/api/om/v1/marine?a=1`);
  });
  it('no toca una dirección propia del usuario ni sin servidor', () => {
    expect(ownUrl('https://mi-clima.example/v1/forecast?a=1', SERVER)).toBeNull();
    expect(ownUrl(PUB, '')).toBeNull();
    expect(ownUrl(PUB, undefined)).toBeNull();
  });
});

describe('omFetchWith', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    resetOmBackoff();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('usa el servidor propio si responde', async () => {
    fetchMock.mockResolvedValueOnce(ok());
    await omFetchWith(PUB, {}, SERVER, 1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/api/om/v1/forecast');
  });

  it('con 404 (dato que no tiene) pide al público y vuelve a probar el propio la próxima', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 404 })).mockResolvedValueOnce(ok()).mockResolvedValueOnce(ok());
    await omFetchWith(PUB, {}, SERVER, 1000);
    expect(String(fetchMock.mock.calls[1]![0])).toBe(PUB);
    await omFetchWith(PUB, {}, SERVER, 2000);
    expect(String(fetchMock.mock.calls[2]![0])).toContain('/api/om/');
  });

  it('si el propio falla (red o 5xx), va al público y lo deja de probar 5 minutos', async () => {
    fetchMock.mockRejectedValueOnce(new Error('red')).mockResolvedValueOnce(ok()).mockResolvedValueOnce(ok()).mockResolvedValueOnce(ok()).mockResolvedValueOnce(ok());
    await omFetchWith(PUB, {}, SERVER, 1000);
    expect(String(fetchMock.mock.calls[1]![0])).toBe(PUB);
    await omFetchWith(PUB, {}, SERVER, 1000 + 60_000);
    expect(String(fetchMock.mock.calls[2]![0])).toBe(PUB); // sin probar el propio
    await omFetchWith(PUB, {}, SERVER, 1000 + 6 * 60_000);
    expect(String(fetchMock.mock.calls[3]![0])).toContain('/api/om/'); // pasó el descanso
  });

  it('un 503 también pasa al público', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 503 })).mockResolvedValueOnce(ok());
    const res = await omFetchWith(PUB, {}, SERVER, 1000);
    expect(res.ok).toBe(true);
    expect(String(fetchMock.mock.calls[1]![0])).toBe(PUB);
  });

  it('sin servidor configurado va directo al público', async () => {
    fetchMock.mockResolvedValueOnce(ok());
    await omFetchWith(PUB, {}, '', 1000);
    expect(String(fetchMock.mock.calls[0]![0])).toBe(PUB);
  });

  it('si la persona cancela, no reintenta con el público', async () => {
    const c = new AbortController();
    fetchMock.mockImplementationOnce(() => {
      c.abort();
      return Promise.reject(new DOMException('Aborted', 'AbortError'));
    });
    await expect(omFetchWith(PUB, { signal: c.signal }, SERVER, 1000)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
