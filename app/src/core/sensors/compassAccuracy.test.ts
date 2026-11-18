import { describe, expect, it } from 'vitest';
import { accuracyLevel } from './compassAccuracy';

describe('accuracyLevel', () => {
  it('traduce los niveles de Android', () => {
    expect(accuracyLevel(3)).toBe('high');
    expect(accuracyLevel(2)).toBe('medium');
    expect(accuracyLevel(1)).toBe('low');
    expect(accuracyLevel(0)).toBe('unreliable');
  });
  it('sin dato no inventa nada', () => {
    expect(accuracyLevel(-1)).toBeNull();
    expect(accuracyLevel(99)).toBeNull();
  });
});
