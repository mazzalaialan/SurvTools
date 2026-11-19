import { describe, expect, it } from 'vitest';
import { clusterFires, fetchFires, fireLevel, fireRiskLevel, inpeSummary, type FireCell, type InpeCell } from './fires';
import es from '../../locales/es.json';

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

describe('focos de calor en Brasil: datos del INPE en el detalle', () => {
  const cells: FireCell[] = [
    [-19.45, -57.05, 3, 1, 2, 12, 120],
    [-19.35, -57.05, 1, 0, 1, 4, 30],
    [-19.25, -56.95, 1, 0, 1, 2, 60],
  ];
  const inpe: Record<string, InpeCell> = {
    '-19.45,-57.05': [0.98, 12, 'Pantanal', 'Corumbá-MS'],
    '-19.35,-57.05': [0.6, 4, 'Pantanal', 'Corumbá-MS'],
    '-19.25,-56.95': [null, null, 'Pantanal', 'Ladário-MS'],
  };

  it('el grupo toma el riesgo y los días sin lluvia máximos, y el bioma y el municipio de más detecciones', () => {
    const [g] = clusterFires(cells, 1.6, undefined, inpe);
    expect(g!.n).toBe(5);
    expect(g!.inpe).toEqual({ risk: 0.98, dry: 12, biome: 'Pantanal', place: 'Corumbá-MS', places: 2 });
  });

  it('sin datos del INPE (otro país, o servidor viejo) el grupo queda como antes', () => {
    expect(clusterFires(cells, 1.6)[0]!.inpe).toBeUndefined();
    expect(clusterFires(cells, 1.6, undefined, {})[0]!.inpe).toBeUndefined();
    expect(clusterFires(cells, 1.6, undefined, null)[0]!.inpe).toBeUndefined();
  });

  it('la escala del riesgo es la del INPE: mínimo < 0,15, bajo hasta 0,40, medio hasta 0,70, alto hasta 0,95, crítico por encima', () => {
    expect(['0', '0.14', '0.15', '0.4', '0.41', '0.7', '0.71', '0.95', '0.96', '1'].map((r) => fireRiskLevel(Number(r)))).toEqual(['min', 'min', 'low', 'low', 'medium', 'medium', 'high', 'high', 'critical', 'critical']);
  });

  it('el texto del detalle junta riesgo, días sin lluvia, bioma y lugar, y omite lo que falta', () => {
    const t = (key: string, o?: Record<string, unknown>) => {
      const w = es.weatherMap as unknown as Record<string, string>;
      const raw = o && 'count' in o ? w[key.replace('weatherMap.', '') + (o.count === 1 ? '_one' : '_other')]! : w[key.replace('weatherMap.', '')]!;
      return raw.replace(/\{\{(\w+)\}\}/g, (_, k) => String(o?.[k]));
    };
    expect(inpeSummary({ risk: 0.98, dry: 12, biome: 'Cerrado', place: 'Corumbá-MS', places: 1 }, t)).toBe('Riesgo de fuego: crítico · 12 días sin lluvia · Cerrado · Corumbá-MS');
    expect(inpeSummary({ risk: 0.5, dry: 1, biome: 'Pantanal', place: 'Corumbá-MS', places: 3 }, t)).toBe('Riesgo de fuego: medio · 1 día sin lluvia · Pantanal · Corumbá-MS y otros');
    expect(inpeSummary({ risk: null, dry: null, biome: 'Amazônia', place: 'Calçoene-AP', places: 1 }, t)).toBe('Amazônia · Calçoene-AP');
    expect(es.weatherMap.fireCreditInpe).toContain('NASA FIRMS');
    expect(es.weatherMap.fireCreditInpe).toContain('INPE (Programa Queimadas)');
  });
});

