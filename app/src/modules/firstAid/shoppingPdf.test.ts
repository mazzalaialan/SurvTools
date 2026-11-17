import { describe, expect, it } from 'vitest';
import { paginate, type ShoppingGroup } from './shoppingPdf';

const group = (name: string, n: number): ShoppingGroup => ({ name, rows: Array.from({ length: n }, (_, i) => ({ name: `${name} ${i}`, buy: '1' })) });

describe('lista de compras en PDF: reparto en hojas', () => {
  it('con pocas filas entra todo en una hoja, con el título de cada grupo', () => {
    const pages = paginate([group('A', 3), group('B', 2)], 200);
    expect(pages).toHaveLength(1);
    expect(pages[0]!.filter((b) => b.kind === 'group').map((b) => (b.kind === 'group' ? b.name : ''))).toEqual(['A', 'B']);
    expect(pages[0]!.filter((b) => b.kind === 'row')).toHaveLength(5);
  });

  it('cuando no entra, pasa a otra hoja y repite el título del grupo cortado', () => {
    // Capacidad: 7,6 del grupo + 4 filas de 6,4.
    const pages = paginate([group('A', 10)], 7.6 + 4 * 6.4);
    expect(pages.length).toBe(3);
    expect(pages[0]!.filter((b) => b.kind === 'row')).toHaveLength(4);
    const second = pages[1]![0]!;
    expect(second.kind === 'group' && second.continued).toBe(true);
    expect(pages.flat().filter((b) => b.kind === 'row')).toHaveLength(10);
  });

  it('un título de grupo nunca queda solo al pie de una hoja', () => {
    // Entra el grupo A con 3 filas (26,8) y sobra lugar para el título de B pero no para su primera fila.
    const pages = paginate([group('A', 3), group('B', 2)], 7.6 + 3 * 6.4 + 8);
    expect(pages.length).toBe(2);
    expect(pages[0]!.at(-1)!.kind).toBe('row');
    const first = pages[1]![0]!;
    expect(first.kind === 'group' && first.name === 'B' && !first.continued).toBe(true);
  });

  it('sin filas no hay hojas con contenido', () => expect(paginate([], 100)).toEqual([[]]));

  it('las filas más altas (con nota) ocupan más y se reparten igual sin perder ninguna', () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ name: `Artículo ${i}`, buy: '2', note: 'tenés 1 de 2' }));
    const pages = paginate([{ name: 'Heridas', rows }], 200, () => 9);
    expect(pages.flat().filter((b) => b.kind === 'row')).toHaveLength(30);
    expect(pages.length).toBeGreaterThan(1);
  });
});
