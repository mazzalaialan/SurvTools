import { beforeEach, describe, expect, it, vi } from 'vitest';

type Entry = { id: number; latitude: number; longitude: number; accuracy: number; altitude: number | null; bearing: number | null; speed: number | null; time: number | null };
let log: Entry[] = [];
let callback: ((p?: unknown, e?: { code?: string; message?: string }) => void) | null = null;
const plugin = {
  start: vi.fn(async (_o: unknown, cb: typeof callback) => void (callback = cb)),
  stop: vi.fn(async () => undefined),
  getLocationLog: vi.fn(async ({ afterId = 0, limit = 1000 }: { afterId?: number; limit?: number } = {}) => ({ entries: log.filter((e) => e.id > afterId).slice(0, limit) })),
  clearLocationLog: vi.fn(async ({ upToId }: { upToId?: number } = {}) => void (log = upToId === undefined ? [] : log.filter((e) => e.id > upToId))),
};
vi.mock('@capgo/background-geolocation', () => ({ BackgroundGeolocation: plugin }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));

const { nativeLocation, fixFromLocation, errorCode } = await import('./nativeLocation');
const { recordingLocation } = await import('./locationBackend');

const entry = (id: number, extra: Partial<Entry> = {}): Entry => ({ id, latitude: -34 - id / 1000, longitude: -58, accuracy: 5, altitude: 100 + id, bearing: 90, speed: 1.4, time: 1_700_000_000_000 + id * 1000, ...extra });
const text = { title: 'Grabando', message: 'Con la pantalla apagada' };

beforeEach(() => {
  log = [];
  callback = null;
  vi.clearAllMocks();
});

describe('ubicación en segundo plano (app nativa)', () => {
  it('es la que graba con la pantalla apagada', () => {
    expect(nativeLocation.background).toBe(true);
    expect(nativeLocation.supported()).toBe(true);
  });

  it('una posición del plugin se convierte en un Fix', () => {
    expect(fixFromLocation(entry(1) as never)).toEqual({ lat: -34.001, lon: -58, accuracy: 5, altitude: 101, speed: 1.4, heading: 90, timestamp: 1_700_000_001_000 });
    expect(fixFromLocation(entry(2, { altitude: null, speed: null, bearing: null }) as never)).toMatchObject({ altitude: null, speed: null, heading: null });
  });

  it('empieza con un registro limpio y le pide al plugin el servicio en primer plano con el registro nativo', async () => {
    log = [entry(99)];
    await nativeLocation.start(() => undefined, () => undefined, text);
    expect(plugin.clearLocationLog).toHaveBeenCalled();
    const options = plugin.start.mock.calls[0]![0] as Record<string, unknown>;
    expect(options).toMatchObject({ backgroundTitle: 'Grabando', backgroundMessage: 'Con la pantalla apagada', locationLog: true, requestPermissions: true, stale: false });
    await nativeLocation.stop();
  });

  it('las posiciones salen del registro nativo, en orden y sin repetir, aunque el callback avise varias veces', async () => {
    const got: number[] = [];
    await nativeLocation.start((f) => got.push(f.timestamp), () => undefined, text);
    log = [entry(1), entry(2), entry(3)];
    callback!(entry(3));
    callback!(entry(3));
    await nativeLocation.flush!();
    expect(got).toEqual([1_700_000_001_000, 1_700_000_002_000, 1_700_000_003_000]);
    // Lo entregado se borra del registro nativo.
    expect(log).toEqual([]);
    log = [entry(4)];
    await nativeLocation.flush!();
    expect(got).toHaveLength(4);
    await nativeLocation.stop();
  });

  it('con la pantalla apagada se acumulan muchas posiciones y al volver se entregan todas, en tandas', async () => {
    const got: number[] = [];
    await nativeLocation.start((f) => got.push(f.lat), () => undefined, text);
    log = Array.from({ length: 1234 }, (_, i) => entry(i + 1));
    await nativeLocation.flush!();
    expect(got).toHaveLength(1234);
    expect([...got].sort((a, b) => b - a)).toEqual(got); // latitud decreciente = orden de llegada
    await nativeLocation.stop();
  });

  it('al parar entrega lo último que quedaba y corta el servicio', async () => {
    const got: number[] = [];
    await nativeLocation.start((f) => got.push(f.timestamp), () => undefined, text);
    log = [entry(1), entry(2)];
    await nativeLocation.stop();
    expect(got).toHaveLength(2);
    expect(plugin.stop).toHaveBeenCalled();
  });

  it('errores del plugin: sin permiso es «denied», cualquier otro «unavailable»', async () => {
    expect(errorCode({ code: 'NOT_AUTHORIZED' })).toBe('denied');
    expect(errorCode({ message: 'Location permission denied' })).toBe('denied');
    expect(errorCode({ message: 'GPS apagado' })).toBe('unavailable');
    const errors: string[] = [];
    await nativeLocation.start(() => undefined, (c) => errors.push(c), text);
    callback!(undefined, { code: 'NOT_AUTHORIZED' });
    expect(errors).toEqual(['denied']);
    await nativeLocation.stop();
  });

  it('si el plugin no puede empezar (sin permiso), avisa y no queda grabando', async () => {
    plugin.start.mockRejectedValueOnce(new Error('permission denied'));
    const errors: string[] = [];
    await nativeLocation.start(() => undefined, (c) => errors.push(c), text);
    expect(errors).toEqual(['denied']);
  });

  it('recuperar: tras cerrarse la app, lo que quedó en el registro se entrega al reabrir', async () => {
    log = [entry(1), entry(2)];
    const got: number[] = [];
    expect(await nativeLocation.recover!((f) => got.push(f.timestamp))).toBe(2);
    expect(got).toHaveLength(2);
    expect(log).toEqual([]);
    expect(await nativeLocation.recover!(() => undefined)).toBe(0);
  });

  it('por defecto la grabación usa el navegador, no el servicio nativo', () => {
    expect(recordingLocation().background).toBe(false);
  });
});
