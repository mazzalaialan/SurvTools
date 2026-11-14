import { describe, expect, it } from 'vitest';
import { clusterFires, fetchFires, fireLevel, type FireCell } from './fires';

// Proyección de juguete: 1° = 10 px.
const proj = (lat: number, lon: number) => ({ x: (lon + 70) * 10, y: (lat + 30) * -10 });

describe('focos de calor de FIRMS en el mapa', () => {
  it('junta las celdas de la misma casilla y suma sus detecciones por confianza', () => {
    const cells: FireCell[] = [
      [-26.55, -60.65, 3, 1, 2, 12, 120],
      [-26.5, -60.6, 2, 0, 2, 4, 30],
      [-30.05, -65.05, 1, 0, 0, 1, 500], // lejos: otra casilla, de baja confianza
    ];
    const g = clusterFires(cells, proj, 40);
    expect(g).toHaveLength(2);
    const near = g.find((c) => c.n === 5)!;
    expect(near).toMatchObject({ high: 1, nominal: 4, low: 0, frp: 16, newestMin: 30 });
    // El centro se inclina hacia la celda con alta confianza (la primera).
    expect(near.lat).toBeLessThan(-26.5);
    expect(g.find((c) => c.n === 1)).toMatchObject({ high: 0, nominal: 0, low: 1 });
  });

  it('la llama es solo para alta confianza; nominal va naranja y lo demás, amarillo chico', () => {
    expect(fireLevel({ high: 1, nominal: 9 })).toBe('flame');
    expect(fireLevel({ high: 0, nominal: 1 })).toBe('orange');
    expect(fireLevel({ high: 0, nominal: 0 })).toBe('low');
  });

  it('descarta lo que cae fuera de la pantalla (con un margen)', () => {
    const cells: FireCell[] = [[-26, -60, 1, 0, 1, 1, 1], [-26, 60, 1, 0, 1, 1, 1]];
    expect(clusterFires(cells, proj, 40, { width: 400, height: 400 })).toHaveLength(1);
    expect(clusterFires(cells, proj, 40)).toHaveLength(2);
  });

  it('pide al servidor propio y avisa si responde mal', async () => {
    let asked = '';
    const ok = (async (url: string) => ((asked = url), new Response(JSON.stringify({ fetchedAt: 1, newestAt: 1, total: 1, sources: ['NOAA-20'], cells: [[-26.55, -60.65, 1, 1, 0, 3, 5]] })))) as unknown as typeof fetch;
    expect((await fetchFires('https://srv.test/', ok)).cells).toHaveLength(1);
    expect(asked).toBe('https://srv.test/api/fires');
    await expect(fetchFires('https://srv.test', (async () => new Response('x', { status: 503 })) as unknown as typeof fetch)).rejects.toThrow('503');
    await expect(fetchFires('https://srv.test', (async () => new Response('{}')) as unknown as typeof fetch)).rejects.toThrow();
  });
});
