import { describe, expect, it } from 'vitest';
import { MIN_INTERVAL_MS, shouldBackup } from './autoBackup';

const prev = { at: '2026-11-18T10:00:00.000Z', fingerprint: 'a' };
const at = (ms: number) => new Date(prev.at).getTime() + ms;

describe('shouldBackup', () => {
  it('la primera vez siempre hace una copia', () => {
    expect(shouldBackup(null, 'a')).toBe('run');
  });
  it('si no cambió nada, no copia aunque haya pasado el plazo', () => {
    expect(shouldBackup(prev, 'a', at(MIN_INTERVAL_MS * 5))).toBe('unchanged');
  });
  it('si cambió pero hace menos de un día, espera', () => {
    expect(shouldBackup(prev, 'b', at(3_600_000))).toBe('recent');
  });
  it('si cambió y pasó el día, copia', () => {
    expect(shouldBackup(prev, 'b', at(MIN_INTERVAL_MS + 1))).toBe('run');
  });
  it('forzado, copia siempre', () => {
    expect(shouldBackup(prev, 'a', at(1), true)).toBe('run');
  });
});
