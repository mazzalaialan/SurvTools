/**
 * Índice por cuadrícula para «qué polígono contiene este punto»: cada polígono se anota en las celdas que toca su caja, así una búsqueda
 * mira solo los pocos de su celda y no todos (la geología de Perú tiene 10.000 polígonos y se consulta al grabar, cada segundo).
 */
export type Box = [number, number, number, number];

const CELL_DEG = 0.5;
const cellX = (lon: number) => Math.floor(lon / CELL_DEG);
const cellY = (lat: number) => Math.floor(lat / CELL_DEG);
const key = (x: number, y: number) => x * 4096 + y;

export class GridIndex<T extends { b: Box }> {
  private cells = new Map<number, T[]>();

  constructor(items: T[]) {
    for (const it of items) {
      const [w, s, e, n] = it.b;
      for (let x = cellX(w); x <= cellX(e); x++) {
        for (let y = cellY(s); y <= cellY(n); y++) {
          const k = key(x, y);
          const list = this.cells.get(k);
          if (list) list.push(it);
          else this.cells.set(k, [it]);
        }
      }
    }
  }

  /** Los candidatos de la celda del punto (todavía hay que probar el polígono: la caja es solo un filtro). */
  near(lon: number, lat: number): T[] {
    return this.cells.get(key(cellX(lon), cellY(lat))) ?? [];
  }
}
