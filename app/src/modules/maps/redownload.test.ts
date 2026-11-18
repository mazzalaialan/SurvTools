import { beforeEach, describe, expect, it, vi } from 'vitest';

const add = vi.fn(async () => undefined);
const downloadZone = vi.fn();
const downloadLayerTiles = vi.fn();
const zoneSource = vi.fn();

vi.mock('./store', () => ({ useMapZones: { getState: () => ({ add }) } }));
vi.mock('./sources', () => ({ serverMaps: vi.fn(async () => null) }));
vi.mock('./tiles', () => ({
  planZone: () => ({ plan: true }),
  circleBounds: () => ({}),
  downloadZone: (...a: unknown[]) => downloadZone(...a),
  zoneSource: (...a: unknown[]) => zoneSource(...a),
}));
vi.mock('@/modules/layers/zoneLayers', () => ({
  zoneLayerTiles: () => [{ key: 'k' }],
  downloadLayerTiles: (...a: unknown[]) => downloadLayerTiles(...a),
}));

const { redownloadZone } = await import('./redownload');
const zone = { id: 'z', name: 'Cerro', lat: -41, lon: -71, radiusKm: 10, maxZoom: 13, bytes: 100, failed: 3, createdAt: '2026-11-18' };
const opts = { serverUrl: 'https://s.example', mode: 'auto' as const };

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  zoneSource.mockReturnValue({ ok: true, from: 'server', vectorPublic: false });
  downloadZone.mockResolvedValue({ keys: [], bytes: 5000, failed: 0 });
  downloadLayerTiles.mockResolvedValue({ ok: 1, failed: 0 });
});

describe('redownloadZone', () => {
  it('sin conexión no intenta nada', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    expect(await redownloadZone(zone, opts)).toEqual({ ok: false, reason: 'offline' });
    expect(downloadZone).not.toHaveBeenCalled();
  });
  it('si no hay de dónde bajarla, dice por qué', async () => {
    zoneSource.mockReturnValue({ ok: false, reason: 'outsideServer' });
    expect(await redownloadZone(zone, opts)).toEqual({ ok: false, reason: 'outsideServer' });
    expect(downloadZone).not.toHaveBeenCalled();
  });
  it('baja lo que falta con la fuente de la zona y actualiza el peso y los fallos', async () => {
    expect(await redownloadZone(zone, opts)).toEqual({ ok: true, failed: 0 });
    expect(downloadZone.mock.calls[0]![3]).toEqual({ vectorPublic: false });
    expect(add).toHaveBeenCalledWith({ ...zone, bytes: 5000, failed: 0 });
  });
  it('si la zona tenía detalle de geología, lo vuelve a bajar y suma sus fallos', async () => {
    downloadLayerTiles.mockResolvedValue({ ok: 0, failed: 2 });
    expect(await redownloadZone({ ...zone, layers: true }, opts)).toEqual({ ok: true, failed: 2 });
    expect(downloadLayerTiles).toHaveBeenCalled();
  });
  it('una falla de red no rompe: devuelve el motivo', async () => {
    downloadZone.mockRejectedValue(new Error('x'));
    expect(await redownloadZone(zone, opts)).toEqual({ ok: false, reason: 'failed' });
    expect(add).not.toHaveBeenCalled();
  });
});
