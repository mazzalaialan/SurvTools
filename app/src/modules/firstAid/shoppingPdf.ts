import { LOGO_MM, PDF_FONT, loadLogo, mmToPx as mm } from '@/core/pdf/brand';
import { jpegPagePdf } from '@/core/pdf/jpegPdf';

/**
 * Lista de compras de un botiquín en PDF, una o más hojas A4 (210 × 297 mm), con el logo y el nombre de la app arriba y la frase al pie,
 * como la hoja del mapa topográfico. Se dibuja en un canvas a 300 puntos por pulgada y se guarda como JPEG dentro del PDF (jpegPdf.ts).
 */
export interface ShoppingRow {
  name: string;
  /** Qué hay que comprar («2 pares»). */
  buy: string;
  /** Aclaración («tenés 1 de 2»). */
  note?: string;
}
export interface ShoppingGroup {
  name: string;
  rows: ShoppingRow[];
}
export interface ShoppingSheetInput {
  appName: string;
  motto: string;
  title: string;
  subtitle: string;
  summary: string;
  groups: ShoppingGroup[];
  /** Lo que ya está completo, en una línea (opcional). */
  completeLine?: string;
  /** Aviso al pie (medicamentos, fuentes). */
  footer: string;
  /** «Hoja 1 de 2». */
  pageLabel: (page: number, total: number) => string;
  /** Texto de «Comprar» y «Ya tenés». */
  columns: { item: string; buy: string };
}

const PAGE = { w: 210, h: 297, margin: 15 };
const HEADER_H = 22;
const FOOTER_H = 18;
const ROW_H = 6.4;
const GROUP_H = 7.6;

export type Block = { kind: 'group'; name: string; continued: boolean } | { kind: 'row'; row: ShoppingRow };

/**
 * Reparte las filas en hojas: cada hoja entra hasta `capacity` milímetros; un grupo no queda con su título solo al pie de una hoja
 * (necesita al menos una fila) y, si sigue en la hoja siguiente, se repite su título.
 */
export function paginate(groups: ShoppingGroup[], capacity: number, rowHeight: (r: ShoppingRow) => number = () => ROW_H, groupHeight = GROUP_H): Block[][] {
  const pages: Block[][] = [[]];
  let used = 0;
  for (const g of groups) {
    let first = true;
    let started = false;
    for (const row of g.rows) {
      const h = rowHeight(row);
      const need = (started ? 0 : groupHeight) + h;
      if (used + need > capacity && pages.at(-1)!.length > 0) {
        pages.push([]);
        used = 0;
        started = false;
      }
      if (!started) {
        pages.at(-1)!.push({ kind: 'group', name: g.name, continued: !first });
        used += groupHeight;
        started = true;
        first = false;
      }
      pages.at(-1)!.push({ kind: 'row', row });
      used += h;
    }
  }
  return pages;
}

type Ctx = CanvasRenderingContext2D;
const font = (size: number, bold = false, italic = false) => `${italic ? 'italic ' : ''}${bold ? '700 ' : ''}${mm(size)}px ${PDF_FONT}`;

/** Parte un texto en renglones que entran en `width` (px); el último se corta con «…» si pasa de `maxLines`. */
function wrap(ctx: Ctx, s: string, width: number, maxLines: number): string[] {
  const words = s.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width <= width || !cur) cur = next;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1]!;
    while (last.length > 1 && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last}…`;
    return kept;
  }
  return lines;
}

function drawPage(input: ShoppingSheetInput, blocks: Block[], pageNo: number, total: number, logo: CanvasImageSource | null): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(mm(PAGE.w));
  canvas.height = Math.round(mm(PAGE.h));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const x = PAGE.margin;
  const w = PAGE.w - 2 * PAGE.margin;
  const text = (s: string, px: number, py: number, size: number, o: { bold?: boolean; italic?: boolean; color?: string; align?: CanvasTextAlign } = {}) => {
    ctx.font = font(size, o.bold, o.italic);
    ctx.fillStyle = o.color ?? '#111';
    ctx.textAlign = o.align ?? 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(s, px, py);
  };

  // Encabezado: logo, título y subtítulo a la izquierda; nombre de la app a la derecha.
  const tx = x + (logo ? LOGO_MM + 3 : 0);
  if (logo) ctx.drawImage(logo, mm(x), mm(PAGE.margin + 0.5), mm(LOGO_MM), mm(LOGO_MM));
  ctx.font = font(6.5, true);
  let title = input.title;
  while (title.length > 1 && ctx.measureText(title).width > mm(x + w - tx)) title = title.slice(0, -1);
  text(title === input.title ? title : `${title}…`, mm(tx), mm(PAGE.margin + 7), 6.5, { bold: true });
  text(input.subtitle, mm(tx), mm(PAGE.margin + 12.2), 3.4, { color: '#444' });
  text(input.appName, mm(x + w), mm(PAGE.margin + 12.2), 3, { color: '#444', align: 'right' });
  ctx.strokeStyle = '#111';
  ctx.lineWidth = mm(0.4);
  ctx.beginPath();
  ctx.moveTo(mm(x), mm(PAGE.margin + HEADER_H - 4));
  ctx.lineTo(mm(x + w), mm(PAGE.margin + HEADER_H - 4));
  ctx.stroke();

  let y = PAGE.margin + HEADER_H;
  if (pageNo === 1) {
    text(input.summary, mm(x), mm(y + 1), 3.8, { bold: true });
    y += 6;
  }
  const buyX = x + w - 52;
  for (const b of blocks) {
    if (b.kind === 'group') {
      ctx.fillStyle = '#eceff1';
      ctx.fillRect(mm(x), mm(y), mm(w), mm(GROUP_H - 1.4));
      text(b.continued ? `${b.name} (…)` : b.name, mm(x + 1.5), mm(y + 4.3), 3.7, { bold: true });
      if (!b.continued && y <= PAGE.margin + HEADER_H + 8) text(input.columns.buy, mm(buyX), mm(y + 4.3), 3.2, { color: '#555' });
      y += GROUP_H;
    } else {
      // Casilla para tildar al comprar, nombre (hasta dos renglones), y a la derecha lo que hay que comprar.
      ctx.strokeStyle = '#222';
      ctx.lineWidth = mm(0.3);
      ctx.strokeRect(mm(x + 1.5), mm(y + 1.1), mm(3.4), mm(3.4));
      ctx.font = font(3.7);
      const lines = wrap(ctx, b.row.name, mm(buyX - x - 9), 2);
      lines.forEach((ln, i) => text(ln, mm(x + 7.5), mm(y + 4 + i * 4), 3.7));
      text(b.row.buy, mm(buyX), mm(y + 4), 3.7, { bold: true });
      if (b.row.note) text(b.row.note, mm(buyX), mm(y + 8), 2.9, { color: '#555' });
      const rowH = ROW_H + (b.row.note || lines.length > 1 ? 2.6 : 0);
      ctx.strokeStyle = '#d5d9dd';
      ctx.lineWidth = mm(0.15);
      ctx.beginPath();
      ctx.moveTo(mm(x), mm(y + rowH - 0.4));
      ctx.lineTo(mm(x + w), mm(y + rowH - 0.4));
      ctx.stroke();
      y += rowH;
    }
  }
  if (input.completeLine && pageNo === total) {
    ctx.font = font(3.2);
    wrap(ctx, input.completeLine, mm(w), 4).forEach((ln, i) => text(ln, mm(x), mm(y + 5 + i * 4.2), 3.2, { color: '#555' }));
  }

  // Pie: frase de la app, aviso y número de hoja.
  const fy = PAGE.h - PAGE.margin;
  ctx.strokeStyle = '#999';
  ctx.lineWidth = mm(0.2);
  ctx.beginPath();
  ctx.moveTo(mm(x), mm(fy - FOOTER_H + 6));
  ctx.lineTo(mm(x + w), mm(fy - FOOTER_H + 6));
  ctx.stroke();
  ctx.font = font(2.8);
  wrap(ctx, input.footer, mm(w), 3).forEach((ln, i) => text(ln, mm(x), mm(fy - FOOTER_H + 10 + i * 3.4), 2.8, { color: '#444' }));
  text(input.motto, mm(x + w / 2), mm(fy + 1.5), 3.4, { italic: true, bold: true, color: '#333', align: 'center' });
  text(input.pageLabel(pageNo, total), mm(x + w), mm(fy + 1.5), 2.8, { color: '#444', align: 'right' });
  return canvas;
}

/** Arma el PDF: una o más hojas A4 con la lista. */
export async function makeShoppingPdf(input: ShoppingSheetInput, title: string): Promise<{ pdf: Uint8Array; pages: number }> {
  const capacity = PAGE.h - 2 * PAGE.margin - HEADER_H - FOOTER_H - 8;
  const pages = paginate(input.groups, capacity, (r) => ROW_H + (r.note || r.name.length > 52 ? 2.6 : 0));
  if (pages.length === 1 && pages[0]!.length === 0) pages[0] = [];
  const logo = await loadLogo();
  const toJpeg = async (c: HTMLCanvasElement) => {
    const blob = await new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('JPEG'))), 'image/jpeg', 0.92));
    return { jpeg: new Uint8Array(await blob.arrayBuffer()), widthPx: c.width, heightPx: c.height };
  };
  const rendered = [];
  for (let i = 0; i < pages.length; i++) rendered.push(await toJpeg(drawPage(input, pages[i]!, i + 1, pages.length, logo)));
  return { pdf: jpegPagePdf({ pages: rendered, pageWmm: PAGE.w, pageHmm: PAGE.h, title }), pages: rendered.length };
}
