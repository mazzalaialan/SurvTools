import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parentOf, ROUTE_PATHS } from './BackButton';

describe('volver', () => {
  it('la lista de rutas es la misma que la de la app', () => {
    const app = readFileSync(new URL('../app/App.tsx', import.meta.url), 'utf8');
    // La ruta comodín («*», las direcciones que no existen vuelven al Inicio) no es una pantalla.
    const paths = [...app.matchAll(/path: '([^']+)'/g)].map((m) => m[1]).filter((p) => p !== '*');
    expect([...paths].sort()).toEqual([...ROUTE_PATHS].sort());
  });

  it('la pantalla de arriba', () => {
    expect(parentOf('/garden/beds/123')).toBe('/garden/beds');
    expect(parentOf('/garden/crops/tomate')).toBe('/garden/calendar');
    expect(parentOf('/garden/calendar')).toBe('/garden');
    expect(parentOf('/orientation/waypoints/abc/go')).toBe('/orientation/waypoints/abc');
    expect(parentOf('/orientation/routes/r1/go/2')).toBe('/orientation/routes/r1');
    expect(parentOf('/first-aid/contacts/nearby')).toBe('/first-aid/contacts');
    expect(parentOf('/settings/share')).toBe('/settings');
    expect(parentOf('/garden')).toBe('/');
    expect(parentOf('/about')).toBe('/');
  });
});
