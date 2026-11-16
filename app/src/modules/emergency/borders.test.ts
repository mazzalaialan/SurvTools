import { describe, expect, it } from 'vitest';
import data from './borders-data.json';
import { distanceToCountry, type BordersData } from './borders';

const B = data as unknown as BordersData;
const km = (c: 'AR' | 'CL', lat: number, lon: number) => distanceToCountry(B, c, lat, lon) / 1000;

describe('fronteras Argentina–Chile', () => {
  it('adentro del país, 0', () => {
    expect(km('AR', -34.6, -58.38)).toBe(0); // Buenos Aires
    expect(km('CL', -33.45, -70.66)).toBe(0); // Santiago
  });

  it('distancia a la frontera del otro país', () => {
    expect(km('CL', -32.89, -68.84)).toBeGreaterThan(50); // Mendoza capital
    expect(km('CL', -32.82, -69.92)).toBeLessThan(25); // Puente del Inca
    expect(km('AR', -33.45, -70.66)).toBeGreaterThan(50); // Santiago
    expect(km('AR', -51.73, -72.51)).toBeLessThan(30); // Puerto Natales
    expect(km('CL', -34.6, -58.38)).toBeGreaterThan(1000); // Buenos Aires
  });
});

describe('país según la ubicación', () => {
  it('Argentina, Chile y Uruguay; en el medio del océano, ninguno', async () => {
    const { countryAt, loadBorders } = await import('./borders');
    const d = await loadBorders();
    expect(countryAt(d, -41.1335, -71.3103)).toBe('AR'); // Bariloche
    expect(countryAt(d, -33.45, -70.66)).toBe('CL'); // Santiago
    expect(countryAt(d, -34.9, -56.16)).toBe('UY'); // Montevideo
    expect(countryAt(d, -16.5, -68.15)).toBe('BO'); // La Paz
    expect(countryAt(d, -16.17, -69.09)).toBe('BO'); // Copacabana (Titicaca)
    expect(countryAt(d, -12.05, -77.04)).toBe('PE'); // Lima
    expect(countryAt(d, -9.53, -77.53)).toBe('PE'); // Huaraz
    expect(countryAt(d, -18.48, -70.31)).toBe('CL'); // Arica (frontera con Perú)
    expect(countryAt(d, -25.28, -57.63)).toBe('PY'); // Asunción
    expect(countryAt(d, -25.52, -54.62)).toBe('PY'); // Ciudad del Este (frontera con Brasil)
    expect(countryAt(d, -27.45, -58.99)).toBe('AR'); // Resistencia, del otro lado del río
    expect(countryAt(d, -45, -40)).toBeNull(); // Atlántico
  });
});
