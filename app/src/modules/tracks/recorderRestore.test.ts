import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Fix } from '@/core/geo/locationBackend';

const backend = {
  background: true,
  supported: () => true,
  start: vi.fn(async () => undefined),
  stop: vi.fn(async () => undefined),
  recover: vi.fn(async (onFix: (f: Fix) => void) => {
    for (const f of recovered) onFix(f);
    return recovered.length;
  }),
};
let recovered: Fix[] = [];

vi.mock('@/core/geo/locationBackend', () => ({ recordingLocation: () => backend, setRecordingLocation: () => undefined }));
vi.mock('@/core/security/session', () => ({ isUnlocked: () => true }));
vi.mock('./lockedBuffer', () => ({ addLocked: vi.fn(), clearLocked: vi.fn(async () => undefined), newRecKey: vi.fn(async () => ({}) as JsonWebKey), prepareLocked: vi.fn(), readLocked: vi.fn(async () => []) }));
vi.mock('@/modules/firstAid/medicalStore', () => ({ useMedical: { getState: () => ({ profiles: new Map() }) } }));
vi.mock('@/modules/training/store', () => ({ useTraining: { getState: () => ({}) }, workoutFromRecording: vi.fn() }));
vi.mock('./store', async () => {
  const { create } = await import('zustand');
  const useTracks = create(() => ({ tracks: new Map(), loaded: false, saveTrack: vi.fn(async () => undefined), deleteTrack: vi.fn(async () => undefined) }));
  return { useTracks };
});

// El grabador se engancha a `document` al cargarse (el entorno de pruebas es `node`).
vi.stubGlobal('document', { addEventListener: () => undefined, visibilityState: 'visible' });
const { useRecorder } = await import('./recorder');
const { useTracks } = await import('./store');

const NOW = Date.now();
const open = (extra: Record<string, unknown> = {}) =>
  ({
    id: 't1',
    name: 'Prueba',
    recorded: true,
    recording: true,
    durationS: 100,
    updatedAt: new Date(NOW - 120_000).toISOString(),
    segments: [[[-34.6, -58.4, 10, 1_700_000_000]]],
    gaps: undefined,
    distanceM: 0,
    ascentM: 0,
    descentM: 0,
    minEle: null,
    maxEle: null,
    recKey: {},
    ...extra,
  }) as never;

async function reopen(track: unknown) {
  useRecorder.setState({ status: 'idle', track: null, elapsedMs: 0, since: null });
  useTracks.setState({ tracks: new Map(), loaded: false });
  useTracks.setState({ tracks: new Map([['t1', track as never]]), loaded: true });
  await vi.waitFor(() => expect(useRecorder.getState().status).not.toBe('idle'));
  await new Promise((r) => setTimeout(r, 20));
}

beforeEach(() => {
  backend.start.mockClear();
  backend.background = true;
  recovered = [];
});

describe('al reabrir la app con una grabación abierta', () => {
  it('en la app nativa se reanuda sola: vuelve a grabando, cuenta el tiempo que estuvo cerrada y vuelve a pedirle posiciones al servicio', async () => {
    recovered = [{ lat: -34.601, lon: -58.401, accuracy: 5, altitude: 12, speed: 1, heading: 0, timestamp: NOW - 60_000 }];
    await reopen(open());
    const s = useRecorder.getState();
    expect(s.status).toBe('recording');
    expect(backend.start).toHaveBeenCalledTimes(1);
    // 100 s grabados + ~120 s que estuvo cerrada (el servicio siguió grabando).
    expect(s.elapsedMs).toBeGreaterThanOrEqual(215_000);
    expect(s.elapsedMs).toBeLessThan(230_000);
    expect(s.since).not.toBeNull();
    expect(s.track?.recPaused).toBe(false);
    // Lo grabado con la app cerrada quedó en el mismo tramo.
    expect(s.track?.segments).toHaveLength(1);
    expect(s.track?.segments[0]!.length).toBe(2);
  });

  it('si la persona la había pausado a propósito, sigue en pausa y no se le piden posiciones al servicio', async () => {
    await reopen(open({ recPaused: true }));
    const s = useRecorder.getState();
    expect(s.status).toBe('paused');
    expect(backend.start).not.toHaveBeenCalled();
    expect(s.since).toBeNull();
  });

  it('en el navegador (no graba con la app cerrada) vuelve en pausa, como siempre', async () => {
    backend.background = false;
    await reopen(open());
    expect(useRecorder.getState().status).toBe('paused');
    expect(backend.start).not.toHaveBeenCalled();
  });

  it('pausar anota que fue a propósito y reanudar lo borra', async () => {
    await reopen(open());
    expect(useRecorder.getState().status).toBe('recording');
    await useRecorder.getState().pause();
    expect(useRecorder.getState().status).toBe('paused');
    expect(useRecorder.getState().track?.recPaused).toBe(true);
    useRecorder.getState().resume();
    expect(useRecorder.getState().status).toBe('recording');
    expect(useRecorder.getState().track?.recPaused).toBe(false);
  });
});
