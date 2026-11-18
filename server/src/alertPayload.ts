/**
 * Reduce las alertas de un dispositivo antes de mandarlas por push (el servicio de push rechaza cargas de más de ~4 KB: con decenas de
 * faltantes de un botiquín, repetir el nombre del botiquín en cada fila lo superaba y el 413 cortaba la pasada).
 *
 * Los faltantes de un mismo botiquín (nombre `artículo␟botiquín`, ver app/src/core/notifications/format.ts) se juntan en UNA fila con la
 * cantidad: `artículo␟botiquín␞N`. La app arma el aviso agrupado igual. Y nunca se mandan más de `MAX_ROWS` filas.
 */
export const KIT_SEPARATOR = '\u001f';
export const COUNT_SEPARATOR = '\u001e';
export const MAX_ROWS = 25;

export interface PayloadAlert {
  itemName: string;
  kind: string;
  dueDate: string | null;
}

export function compactAlerts(alerts: PayloadAlert[]): PayloadAlert[] {
  const kits = new Map<string, { row: PayloadAlert; count: number }>();
  const out: PayloadAlert[] = [];
  for (const a of alerts) {
    const at = a.kind === 'minStock' ? a.itemName.indexOf(KIT_SEPARATOR) : -1;
    if (at < 0) {
      out.push(a);
      continue;
    }
    const kit = a.itemName.slice(at + 1);
    const existing = kits.get(kit);
    if (existing) existing.count++;
    else {
      const entry = { row: a, count: 1 };
      kits.set(kit, entry);
      out.push(a);
    }
  }
  const rows = out.map((a) => {
    const at = a.kind === 'minStock' ? a.itemName.indexOf(KIT_SEPARATOR) : -1;
    if (at < 0) return a;
    const entry = kits.get(a.itemName.slice(at + 1))!;
    return entry.count > 1 ? { ...a, itemName: `${a.itemName}${COUNT_SEPARATOR}${entry.count}` } : a;
  });
  return rows.slice(0, MAX_ROWS);
}
