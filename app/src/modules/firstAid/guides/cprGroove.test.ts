import { describe, expect, it } from 'vitest';
import { GROOVE_BASS, scheduleGrooveBeat } from './cprGroove';

/** AudioContext de mentira: cuenta qué se programó y a qué hora. */
function fakeCtx() {
  const started: { kind: string; at: number; freq?: number }[] = [];
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = (kind: string) => {
    const n: Record<string, unknown> = { connect: (x: unknown) => x, stop() {}, frequency: param(), gain: param(), type: '' };
    n.start = (at: number) => started.push({ kind, at, freq: (n.frequency as { value: number }).value });
    return n;
  };
  const ctx = {
    sampleRate: 8000,
    destination: {},
    createBuffer: () => ({ getChannelData: () => new Float32Array(400) }),
    createOscillator: () => node('osc'),
    createBufferSource: () => node('noise'),
    createBiquadFilter: () => node('filter'),
    createGain: () => node('gain'),
  };
  return { ctx: ctx as unknown as AudioContext, started };
}

describe('base rítmica de la RCP', () => {
  it('programa bombo y bajo en el tiempo y un platillo a la mitad', () => {
    const { ctx, started } = fakeCtx();
    scheduleGrooveBeat(ctx, 10, 0.6, 0, false);
    const sources = started.filter((s) => s.kind !== 'filter' && s.kind !== 'gain');
    expect(sources).toHaveLength(3);
    expect(sources.filter((s) => s.at === 10)).toHaveLength(2); // bombo + bajo
    expect(sources.find((s) => s.kind === 'noise')!.at).toBeCloseTo(10.3);
  });

  it('el bajo sigue el compás y baja una octava en la compresión 30', () => {
    const a = fakeCtx();
    scheduleGrooveBeat(a.ctx, 0, 0.6, 2, false);
    expect(a.started.filter((s) => s.kind === 'osc')[1]!.freq).toBe(GROOVE_BASS[2]);
    const b = fakeCtx();
    scheduleGrooveBeat(b.ctx, 0, 0.6, 2, true);
    expect(b.started.filter((s) => s.kind === 'osc')[1]!.freq).toBeCloseTo(GROOVE_BASS[2]! / 2);
  });

  it('si el audio falla no tira error', () => {
    expect(() => scheduleGrooveBeat({} as AudioContext, 0, 0.6, 0, false)).not.toThrow();
  });
});
