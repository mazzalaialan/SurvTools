import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fetchChileBays, nearestBays, parseChileBays, windText, CHILE_BAYS_URL } from './chileBays';

const sample = JSON.parse(readFileSync(new URL('./fixtures/bahias_met.sample.json', import.meta.url), 'utf8')) as unknown;

describe('pronóstico marítimo de bahías de la Armada de Chile', () => {
  it('lee cada bahía con su ubicación, su centro y sus períodos en minúsculas con mayúscula inicial', () => {
    const r = parseChileBays(sample, 7)!;
    expect(r.fetchedAt).toBe(7);
    const names = r.bays.map((b) => b.name);
    expect(names).toEqual(expect.arrayContaining(['Bahía Arica', 'Bahía Valparaíso', 'Bahía Pascua', 'Bahía Puerto Eden']));
    const arica = r.bays.find((b) => b.name === 'Bahía Arica')!;
    expect(arica.center).toBe('Zona Norte');
    expect(arica.lat).toBeCloseTo(-18.48, 2);
    expect(arica.periods.length).toBeGreaterThanOrEqual(2);
    const p = arica.periods[0]!;
    expect(p.bay).toMatch(/^[A-ZÁÉÍÓÚ]/);
    expect(p.bay).not.toBe(p.bay.toUpperCase());
    expect(p.wind).toMatch(/\d/);
    expect(p.waves).toContain('(');
    expect(p.label).toMatch(/\d{2}:\d{2}/);
  });

  it('la bahía sin pronóstico se descarta y el id 37 repetido se distingue por la zona (Puerto Edén es de la austral)', () => {
    const r = parseChileBays(sample)!;
    // «Bahía Puerto Saavedra» con id 37 en la zona sur viene vacía; Puerto Edén (id 37, zona austral) sí tiene datos.
    expect(r.bays.filter((b) => b.id === 37)).toHaveLength(1);
    const eden = r.bays.find((b) => b.id === 37)!;
    expect(eden.name).toMatch(/Eden|Edén/i);
    expect(eden.lat).toBeCloseTo(-49.13, 1);
  });

  it('el viento junta dirección, velocidad y la segunda («ocasional», «a calma»)', () => {
    expect(windText({ direccion: 'W/SW', velocidad: '4/12 KT', direccion2: 'OCASIONAL', velocidad2: '18 KT' })).toBe('W/SW 4/12 kt, ocasional 18 kt');
    expect(windText({ direccion: 'N/NE', velocidad: '8/4 KT', direccion2: 'A CALMA', velocidad2: '' })).toBe('N/NE 8/4 kt, a calma');
    expect(windText(undefined)).toBe('');
  });

  it('las bahías más cercanas a un punto, hasta una distancia máxima', () => {
    const r = parseChileBays(sample)!;
    // Valparaíso: la más cercana es la de Valparaíso; Arica queda fuera de los 150 km.
    const near = nearestBays(r.bays, -33.04, -71.62);
    expect(near[0]!.bay.name).toBe('Bahía Valparaíso');
    expect(near.some((n) => n.bay.name === 'Bahía Arica')).toBe(false);
    expect(nearestBays(r.bays, -34.6, -58.4)).toEqual([]);
  });

  it('un archivo con otro formato no se lee, y un error del servidor se informa', async () => {
    expect(parseChileBays({})).toBeNull();
    expect(parseChileBays(null)).toBeNull();
    const bad = (async () => new Response('x', { status: 500 })) as unknown as typeof fetch;
    await expect(fetchChileBays(bad)).rejects.toThrow('500');
    let asked = '';
    const ok = (async (url: string) => ((asked = url), new Response(JSON.stringify(sample)))) as unknown as typeof fetch;
    expect((await fetchChileBays(ok))!.bays.length).toBeGreaterThan(2);
    expect(asked).toBe(CHILE_BAYS_URL);
  });
});
