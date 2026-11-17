import type { TFunction } from 'i18next';
import { deliverFile } from '@/ui/files';
import { unitFor } from './kitTemplates';
import { makeShoppingPdf, type ShoppingGroup } from './shoppingPdf';

/**
 * Lo que hay que comprar de un botiquín, para copiar o compartir como texto y para armar el PDF A4. Lo usan «¿Qué le falta?» (comparación con
 * una plantilla) y la lista de faltantes del propio botiquín (stock mínimo no cubierto).
 */
export interface ShopEntry {
  name: string;
  unit: string;
  /** Cantidad que debería haber y cuánta hay (hay que comprar la diferencia). */
  need: number;
  have: number;
  groupName: string;
  groupOrder: number;
}

export interface ShoppingContext {
  t: TFunction;
  language: string;
  kitName: string;
  /** Segunda línea del encabezado del PDF y del texto («Casa · nivel Individual · 4 personas»). */
  detail: string;
  completeNames?: string[];
}

const toBuy = (e: ShopEntry) => Math.max(0, e.need - e.have);
const num = (n: number) => String(Math.round(n * 100) / 100);

export function shoppingGroups(entries: ShopEntry[]): ShoppingGroup[] {
  const groups = new Map<string, { order: number; group: ShoppingGroup }>();
  for (const e of entries) {
    const g = groups.get(e.groupName) ?? { order: e.groupOrder, group: { name: e.groupName, rows: [] } };
    g.group.rows.push({
      name: e.name,
      buy: `${num(toBuy(e))} ${unitFor(toBuy(e), e.unit)}`.trim(),
      ...(e.have > 0 ? { note: ctxHave(e) } : {}),
    });
    groups.set(e.groupName, g);
  }
  return [...groups.values()].sort((a, b) => a.order - b.order).map((g) => g.group);
}

// La nota («tenés 1 de 2») la arma quien llama con `t`; acá queda como texto neutro que se reemplaza en `withNotes`.
const ctxHave = (e: ShopEntry) => `${num(e.have)}/${num(e.need)}`;

function withNotes(groups: ShoppingGroup[], t: TFunction): ShoppingGroup[] {
  return groups.map((g) => ({
    ...g,
    rows: g.rows.map((r) => {
      if (!r.note) return r;
      const [have, need] = r.note.split('/');
      return { ...r, note: t('kitCompare.haveOf', { have, need }) };
    }),
  }));
}

export function shoppingText(entries: ShopEntry[], ctx: ShoppingContext): string {
  const lines = entries.map((e) => {
    const base = `- ${num(toBuy(e))} ${unitFor(toBuy(e), e.unit)} · ${e.name}`;
    return e.have > 0 ? `${base} (${ctx.t('kitCompare.haveOf', { have: num(e.have), need: num(e.need) })})` : base;
  });
  return `${ctx.t('kitCompare.shoppingTitle', { kit: ctx.kitName, scenario: ctx.detail })}\n${lines.join('\n')}\n\n${ctx.t('kitCompare.shoppingFooter')}`;
}

/** Comparte la lista como texto (menú de compartir) o la copia al portapapeles; devuelve un aviso si se copió. */
export async function shareShoppingText(entries: ShopEntry[], ctx: ShoppingContext): Promise<string | null> {
  const text = shoppingText(entries, ctx);
  try {
    if (typeof navigator.share === 'function') await navigator.share({ title: ctx.kitName, text });
    else {
      await navigator.clipboard.writeText(text);
      return ctx.t('kitCompare.copied');
    }
  } catch {
    // La persona cerró el menú de compartir: no hay nada que avisar.
  }
  return null;
}

/** Arma el PDF A4 con el logo y la frase de la app y lo entrega (compartir o descargar). Devuelve el aviso para mostrar. */
export async function exportShoppingPdf(entries: ShopEntry[], ctx: ShoppingContext): Promise<string | null> {
  const { t, language, kitName } = ctx;
  try {
    const date = new Intl.DateTimeFormat(language, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
    const title = t('kitCompare.pdfTitle', { kit: kitName });
    const { pdf, pages } = await makeShoppingPdf(
      {
        appName: t('app.name'),
        motto: t('app.motto'),
        title,
        subtitle: `${ctx.detail} · ${date}`,
        summary: t('kitCompare.pdfSummary', { count: entries.length }),
        groups: withNotes(shoppingGroups(entries), t),
        completeLine: ctx.completeNames?.length ? t('kitCompare.pdfComplete', { list: ctx.completeNames.join(', ') }) : undefined,
        footer: `${t('kitCompare.shoppingFooter')} ${t('kitBuilder.disclaimer')}`,
        pageLabel: (page, total) => t('kitCompare.pdfPage', { page, total }),
        columns: { item: t('kitCompare.pdfItem'), buy: t('kitCompare.pdfBuy') },
      },
      title,
    );
    const name = `${title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'lista'}.pdf`;
    await deliverFile(pdf as Uint8Array<ArrayBuffer>, name, 'application/pdf');
    return t('kitCompare.pdfReady', { count: pages });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null;
    return t('kitCompare.pdfFailed');
  }
}
