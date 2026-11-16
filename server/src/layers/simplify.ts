/** Simplificación de polígonos (Douglas-Peucker) para que las capas por zona pesen poco. Coordenadas [lon, lat]. */
export type Pt = [number, number];

function dp(points: Pt[], tol: number): Pt[] {
  if (points.length < 4) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = points[a]!;
    const [bx, by] = points[b]!;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1e-12;
    let max = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * (points[i]![0] - ax) - dx * (points[i]![1] - ay)) / len;
      if (d > max) {
        max = d;
        idx = i;
      }
    }
    if (max > tol && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Anillo cerrado: se parte por la mitad para no colapsarlo (el primer y el último punto coinciden). */
export function simplifyRing(ring: Pt[], tol: number): Pt[] {
  const mid = Math.floor(ring.length / 2);
  return [...dp(ring.slice(0, mid + 1), tol).slice(0, -1), ...dp(ring.slice(mid), tol)];
}

export const ringArea = (r: Pt[]): number => Math.abs(r.reduce((s, [x, y], i) => { const [x2, y2] = r[(i + 1) % r.length]!; return s + x * y2 - x2 * y; }, 0) / 2);

const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

/** Polígonos GeoJSON (Polygon o MultiPolygon) → [[borde, ...huecos]] con anillos planos [lon, lat, …], simplificados y redondeados. */
export function flatPolys(geometry: { type: string; coordinates: unknown } | null, tol: number, minArea: number, decimals = 4): number[][][] {
  if (!geometry) return [];
  const parts = (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : []) as Pt[][][];
  const out: number[][][] = [];
  for (const part of parts) {
    const rings = part
      .map((r, i) => {
        const s = simplifyRing(r, tol);
        // Un hueco que no se ve a esta escala no vale la pena; el borde sí hay que conservarlo si tiene área.
        return s.length >= 4 && ringArea(s) > (i === 0 ? minArea : minArea * 4) ? s.flatMap(([x, y]) => [round(x, decimals), round(y, decimals)]) : null;
      })
      .filter((r): r is number[] => r !== null);
    if (rings.length && part[0] && rings.length > 0 && ringArea(simplifyRing(part[0], tol)) > minArea) out.push(rings);
  }
  return out;
}
