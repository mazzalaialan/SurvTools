import { describe, expect, it } from 'vitest';
import { currentPlatform, isNativePlatform } from './platform';

describe('plataforma', () => {
  it('en el navegador no existe Capacitor: es web', () => {
    expect(currentPlatform({})).toBe('web');
    expect(isNativePlatform()).toBe(false);
  });
  it('Capacitor que dice que no es nativo (la web con Capacitor cargado) sigue siendo web', () => {
    expect(currentPlatform({ Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' } })).toBe('web');
  });
  it('en Android y en iPhone', () => {
    expect(currentPlatform({ Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' } })).toBe('android');
    expect(currentPlatform({ Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' } })).toBe('ios');
  });
  it('nativa sin decir cuál: se trata como Android', () => {
    expect(currentPlatform({ Capacitor: { isNativePlatform: () => true } })).toBe('android');
  });
});
