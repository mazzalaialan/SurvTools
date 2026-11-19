import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compareVersions } from './update';

const gradle = readFileSync(new URL('../../../android/app/build.gradle', import.meta.url), 'utf8');
const formula = /versionCode\s+(versionParts\[0\][^\n]+)/.exec(gradle)?.[1] ?? '';
/** Evalúa la fórmula de `versionCode` de build.gradle (es una expresión aritmética sobre `versionParts`). */
const versionCode = (version: string): number => new Function('versionParts', `return ${formula};`)(version.split('.').map(Number)) as number;

describe('versionCode de Android (android/app/build.gradle)', () => {
  it('sube con cada versión, también al pasar de 0.99 a 0.100 y de 0.100 a 1.0', () => {
    expect(formula).toContain('versionParts[2]');
    const versions = ['0.87.0', '0.96.0', '0.99.0', '0.99.1', '0.100.0', '0.100.1', '0.100.9', '0.101.0', '0.999.0', '1.0.0', '1.0.1', '1.1.0', '2.0.0'];
    for (let i = 1; i < versions.length; i++) {
      expect(versionCode(versions[i]!), `${versions[i - 1]} -> ${versions[i]}`).toBeGreaterThan(versionCode(versions[i - 1]!));
      // Y ordena igual que `compareVersions` (el aviso de «hay una versión nueva»).
      expect(compareVersions(versions[i]!, versions[i - 1]!)).toBe(1);
    }
  });

  it('es mayor que los versionCode que ya publicó la fórmula anterior (mayor*10000 + menor*100 + parche): los teléfonos con una versión vieja actualizan', () => {
    const legacy = (v: string) => {
      const [a, b, c] = v.split('.').map(Number);
      return a! * 10000 + b! * 100 + c!;
    };
    for (const v of ['0.87.0', '0.94.0', '0.97.0', '0.98.0', '0.99.0']) expect(versionCode(v)).toBeGreaterThan(legacy(v));
    expect(versionCode('0.99.0')).toBe(99000);
    expect(versionCode('0.100.0')).toBe(100000);
  });

  it('no pasa el máximo que acepta Android (2.100.000.000)', () => {
    expect(versionCode('99.999.999')).toBeLessThan(2_100_000_000);
  });
});
