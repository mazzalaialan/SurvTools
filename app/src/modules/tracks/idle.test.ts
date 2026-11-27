import { describe, expect, it } from 'vitest';
import { detectIdle, idleSeconds, trimIdle } from './idle';
import type { TrackPoint } from './gpx';

// Un paso de ~110 m por minuto hacia el norte, y quieto (unos metros de deambular del GPS) entre medio.
const walk = (lat0: number, t0: number, n: number): TrackPoint[] => Array.from({ length: n }, (_, i) => [lat0 + i * 0.001, -60, null, t0 + i * 60]);
const still = (lat: number, t0: number, n: number, everyS = 120): TrackPoint[] => Array.from({ length: n }, (_, i) => [lat + (i % 2) * 0.0001, -60 + (i % 3) * 0.0001, null, t0 + i * everyS]);

describe('descansos al guardar una grabación', () => {
  it('encuentra un descanso en el medio (20 min quieto) y no cuenta el caminar', () => {
    const a = walk(-34, 0, 10); // 0 a 540 s
    const b = still(-34 + 0.01, 600, 11); // 600 a 1800 s, quieto
    const c = walk(-34 + 0.011, 1900, 10);
    const spans = detectIdle([[...a, ...b, ...c]], 3000);
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ tail: false, head: false });
    expect(spans[0]!.to - spans[0]!.from).toBeGreaterThanOrEqual(1200);
  });

  it('detecta el final quieto (grabación olvidada), contando hasta ahora aunque no haya puntos nuevos', () => {
    const a = walk(-34, 0, 10);
    const spans = detectIdle([a], 540 + 3600); // una hora sin puntos después del último
    expect(spans).toHaveLength(1);
    expect(spans[0]!.tail).toBe(true);
    expect(idleSeconds(spans)).toBe(3600);
  });

  it('recortar saca los puntos de adentro del descanso y, en el final, corta el recorrido', () => {
    const a = walk(-34, 0, 10);
    const b = still(-34 + 0.01, 600, 11);
    const c = walk(-34 + 0.011, 1900, 10);
    const all = [...a, ...b, ...c];
    const [mid] = detectIdle([all], 3000);
    const trimmed = trimIdle([all], [mid!]).flat();
    expect(trimmed.length).toBeLessThan(all.length);
    expect(trimmed.some((p) => p[3] === 1200)).toBe(false); // punto de adentro del descanso
    const [tail] = detectIdle([[...a, ...still(-34 + 0.01, 600, 20)]], 600 + 19 * 120);
    expect(tail!.tail).toBe(true);
    expect(trimIdle([[...a, ...still(-34 + 0.01, 600, 20)]], [tail!]).flat().every((p) => p[3]! <= tail!.from)).toBe(true);
  });

  it('una caminata sin paradas largas no tiene descansos', () => {
    expect(detectIdle([walk(-34, 0, 30)], 30 * 60)).toEqual([]);
  });
});
