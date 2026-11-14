import { describe, expect, it } from 'vitest';
import { clusterFires, fetchFires, fireLevel, type FireCell } from './fires';

import { FIRE_CELL_DEGREES, fireCellDegrees } from './fires';

describe('focos de calor de FIRMS en el mapa', () => {
  it('junta las celdas de la misma casilla geográfica y suma sus detecciones por confianza', () => {
    const cells: FireCell[] = [
      [-26.55, -60.65, 3, 1, 2, 12, 120],
      [-26.5, -60.6, 2, 0, 2, 4, 30],
      [-30.05, -65.05, 1, 0, 0, 1, 500], // lejos: otra casilla, de baja confianza
    ];
    const g = clusterFires(cells, 0.8);
    expect(g).toHaveLength(2);
    const near = g.find((c) => c.n === 5)!;
    expect(near).toMatchObject({ high: 1, nominal: 4, low: 0, frp: 16, newestMin: 30 });
    // El centro se inclina hacia la celda con alta confianza (la primera).
    expect(near.lat).toBeLessThan(-26.5);
    expect(g.find((c) => c.n === 1)).toMatchObject({ high: 0, nominal: 0, low: 1 });
  });

  it('los grupos NO cambian al desplazar el mapa: solo dependen del zoom (la grilla es geográfica, no de la pantalla)', () => {
    // Un campo de celdas de 0,1° repartido por el norte argentino.
    const cells: FireCell[] = [];
    for (let la = -28; la < -24; la += 0.1) for (let lo = -62; lo < -58; lo += 0.1) if (Math.round(la * 10 + lo * 7) % 3 === 0) cells.push([Number(la.toFixed(2)), Number(lo.toFixed(2)), 1, 0, 1, 1, 10]);
    const deg = fireCellDegrees(40, 22); // mismo zoom
    const all = clusterFires(cells, deg);
    // «Desplazar» el mapa = mirar otra ventana: los grupos que se ven en ambas ventanas son idénticos.
    const windowA = clusterFires(cells, deg, (_lat, lon) => lon < -59.5);
    const windowB = clusterFires(cells, deg, (_lat, lon) => lon > -60.5);
    const key = (c: { lat: number; lon: number; n: number }) => `${c.lat.toFixed(4)},${c.lon.toFixed(4)},${c.n}`;
    const both = windowA.filter((a) => windowB.some((b) => key(a) === key(b)));
    expect(both.length).toBeGreaterThan(0);
    expect(new Set(windowA.map(key)).size).toBe(windowA.length);
    for (const w of [...windowA, ...windowB]) expect(all.map(key)).toContain(key(w));
    // Y la cantidad total de detecciones se conserva.
    expect(all.reduce((n, c) => n + c.n, 0)).toBe(cells.length);
  });

  it('la casilla se elige por el zoom y cambia en saltos, de la celda de FIRMS (0,1°) hacia casillas más grandes', () => {
    expect(fireCellDegrees(1000)).toBe(0.1); // muy cerca: sin agrupar
    expect(fireCellDegrees(100)).toBe(0.4); // 0,4° × 100 px/° = 40 px ≥ 22
    expect(fireCellDegrees(17)).toBe(1.6); // el zoom del mapa entero
    expect(fireCellDegrees(0.5)).toBe(FIRE_CELL_DEGREES[FIRE_CELL_DEGREES.length - 1]);
    // Con más zoom nunca da una casilla más grande.
    let last = Infinity;
    for (const px of [1, 5, 10, 20, 50, 100, 400]) {
      const d = fireCellDegrees(px);
      expect(d).toBeLessThanOrEqual(last);
      last = d;
    }
  });

  it('la llama es solo para alta confianza; nominal va naranja y lo demás, amarillo chico', () => {
    expect(fireLevel({ high: 1, nominal: 9 })).toBe('flame');
    expect(fireLevel({ high: 0, nominal: 1 })).toBe('orange');
    expect(fireLevel({ high: 0, nominal: 0 })).toBe('low');
  });

  it('deja solo los grupos que caen en pantalla (decidido sobre el grupo ya armado)', () => {
    const cells: FireCell[] = [[-26, -60, 1, 0, 1, 1, 1], [-26, 60, 1, 0, 1, 1, 1]];
    expect(clusterFires(cells, 0.8, (_lat, lon) => lon < 0)).toHaveLength(1);
    expect(clusterFires(cells, 0.8)).toHaveLength(2);
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
