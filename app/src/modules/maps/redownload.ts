import { downloadLayerTiles, zoneLayerTiles } from '@/modules/layers/zoneLayers';
import { serverMaps, type MapSourceMode } from './sources';
import { useMapZones, type MapZone } from './store';
import { circleBounds, downloadZone, planZone, zoneSource, type DownloadProgress } from './tiles';

export type RedownloadFailure = 'offline' | 'tooBig' | 'tooBigServer' | 'outsideServer' | 'noServer' | 'failed' | 'cancelled';

/**
 * Vuelve a bajar lo que falta de una zona de mapas que ya figura como bajada (por ejemplo, después de restaurar un backup o de que el sistema borre
 * parte de la caché): las teselas que faltan, con la misma fuente que al crearla, y el detalle de geología y vegetación si la zona lo tenía.
 * Lo que ya está guardado no se vuelve a bajar. Actualiza el peso y los fallos de la zona.
 */
export async function redownloadZone(
  zone: MapZone,
  opts: { serverUrl: string; mode: MapSourceMode; onProgress?: (p: DownloadProgress) => void; signal?: AbortSignal },
): Promise<{ ok: true; failed: number } | { ok: false; reason: RedownloadFailure }> {
  if (!navigator.onLine) return { ok: false, reason: 'offline' };
  const controller = new AbortController();
  const signal = opts.signal ?? controller.signal;
  try {
    const plan = planZone(zone.lat, zone.lon, zone.radiusKm, zone.maxZoom);
    const info = opts.mode === 'public' || !opts.serverUrl.trim() ? null : await serverMaps(opts.serverUrl);
    const source = zoneSource(plan, info, opts.mode);
    if (!source.ok) return { ok: false, reason: source.reason };
    const result = await downloadZone(plan, opts.onProgress ?? (() => undefined), signal, { vectorPublic: source.vectorPublic });
    let failed = result.failed;
    if (zone.layers && opts.serverUrl.trim()) {
      const tiles = zoneLayerTiles(circleBounds(zone.lat, zone.lon, zone.radiusKm));
      if (tiles.length) failed += (await downloadLayerTiles(opts.serverUrl, tiles, signal, () => undefined)).failed;
    }
    await useMapZones.getState().add({ ...zone, bytes: result.bytes || zone.bytes, failed });
    return { ok: true, failed };
  } catch {
    return { ok: false, reason: signal.aborted ? 'cancelled' : 'failed' };
  }
}
