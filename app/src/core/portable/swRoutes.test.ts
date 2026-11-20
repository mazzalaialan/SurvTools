import { describe, expect, it } from 'vitest';
import { isServerPage, SERVER_PAGES } from './swRoutes';

describe('rutas que el service worker deja pasar al servidor', () => {
  it('la ubicación en vivo, la salida compartida y la API van al servidor', () => {
    expect(isServerPage('/l/D1BcaGtVK4j_')).toBe(true);
    expect(isServerPage('/o/abc123')).toBe(true);
    expect(isServerPage('/api/health')).toBe(true);
  });

  it('la app (raíz, hash y otras rutas) sigue siendo la app', () => {
    expect(isServerPage('/')).toBe(false);
    expect(isServerPage('/index.html')).toBe(false);
    expect(isServerPage('/SurvTools/')).toBe(false);
    expect(isServerPage('/library')).toBe(false);
    expect(isServerPage('/l')).toBe(false);
    expect(isServerPage('/lista/1')).toBe(false);
    expect(isServerPage('/oferta/1')).toBe(false);
  });

  it('la expresión sirve tal cual para el denylist de Workbox', () => {
    expect(SERVER_PAGES.test('/l/x')).toBe(true);
  });
});
