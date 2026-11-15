/**
 * «Resumen en planilla» del pronóstico hidrológico del SENAMHI Bolivia: una tabla por cuenca con, para cada estación, la amenaza
 * considerada (Amarilla, Naranja o Roja), la tendencia (ascensos o descensos), cuánto falta para el desborde y el período en que se
 * espera. El PDF no tiene un texto ordenado (las celdas se parten en 2 a 4 líneas y salen mezcladas), así que se lee por **posición**:
 * cada texto trae su x e y y las columnas caen siempre en la misma franja. Cada fila se ancla en su casilla de amenaza.
 * Sin licencia declarada («Derechos Reservados»): se usa citando al SENAMHI y mostrando la fecha, igual que los otros documentos.
 * Si el formato cambia y no se reconoce una cantidad razonable de filas, devuelve null en vez de datos dudosos.
 */

/** Un texto de la página: [texto, x, y] (y crece hacia arriba, como en el PDF). */
export type PlanillaItem = [string, number, number];

export interface BoPlanillaRow {
  /** Estación y río tal como los escribe el SENAMHI (una palabra larga puede venir partida en dos líneas: «Guayaram erin»). */
  station: string;
  river: string;
  threat: 'yellow' | 'orange' | 'red';
  trend: 'rises' | 'falls' | null;
  /** Cuánto falta para el desborde y en qué unidad: metros de nivel, m³/s de caudal; `null` sin dato («-») o si la tabla mezcla las dos. */
  untilOverflow: number | null;
  unit: 'm' | 'm3s' | null;
  /** Períodos en que se espera la amenaza, textual («14 al 16, 17 al 19 noviembre»). */
  period: string;
}

export interface BoPlanilla {
  /** Fecha de emisión (AAAA-MM-DD, la del nombre del archivo). */
  issuedOn: string;
  url: string;
  rows: BoPlanillaRow[];
}

const THREAT: Record<string, BoPlanillaRow['threat']> = { amarilla: 'yellow', naranja: 'orange', roja: 'red' };
/** Menos que esto y no se reconoce la planilla (la de hoy tiene unas 80 filas). */
export const MIN_ROWS = 5;

const text = (items: PlanillaItem[]) => items.sort((a, b) => b[2] - a[2] || a[1] - b[1]).map((i) => i[0]).join(' ').replace(/\s+/g, ' ').trim();

/** Las filas de las tablas de una página. */
function parsePage(page: PlanillaItem[]): BoPlanillaRow[] {
  const headers = page.filter((i) => i[0] === 'Amenaza').sort((a, b) => b[2] - a[2]);
  const out: BoPlanillaRow[] = [];
  headers.forEach((h, k) => {
    const top = h[2];
    // La tabla llega hasta la cabecera de la siguiente o hasta el pie con la leyenda («Nivel Hidrologico de Amenazas»).
    const nextTop = headers[k + 1]?.[2];
    const legend = page.find((i) => /Nivel Hidrol[óo]gico de Amenazas/i.test(i[0]) && i[2] < top);
    const bottom = nextTop !== undefined ? nextTop + 14 : (legend ? legend[2] + 10 : -Infinity);
    // La cabecera ocupa unas 4 líneas hacia arriba y hacia abajo de «Amenaza»; el cuerpo, debajo de la última.
    const headerBand = (i: PlanillaItem) => i[2] <= top + 30 && i[2] > top - 36;
    const x = (name: RegExp, fallback: number) => page.find((i) => name.test(i[0]) && headerBand(i) && Math.abs(i[2] - top) <= 12)?.[1] ?? fallback;
    const xAmenaza = h[1];
    const xEstacion = x(/^Estaci[óo]n$/i, xAmenaza - 164);
    const xRio = x(/^R[íi]o$/i, xAmenaza - 114);
    const xPron = x(/^Pron[óo]stico$/i, xAmenaza + 50);
    const xPeriodo = x(/^Periodo/i, xAmenaza + 238);
    // «Para (el) desborde falta» está en la línea de arriba o de abajo de «Amenaza»: su x ubica la columna del dato.
    const xFalta = page.find((i) => /^Para( el)?$/i.test(i[0]) && headerBand(i) && i[1] > xPron)?.[1] ?? xPron + 52;

    // Unidad de la tabla, según su cabecera (caudal en m³/s o nivel en metros); si trae las dos, la de «falta» no se sabe.
    const headText = page.filter((i) => headerBand(i) && i[1] > xFalta - 15 && i[1] < xPeriodo - 5).map((i) => i[0]).join(' ');
    const hasFlow = /m3\/s/i.test(headText);
    const hasLevel = /metros/i.test(headText);
    const unit: BoPlanillaRow['unit'] = hasFlow && !hasLevel ? 'm3s' : hasLevel && !hasFlow ? 'm' : null;

    // Filas: una por casilla de amenaza, en la franja de la columna «Amenaza».
    const below = page.filter((i) => i[2] < top - 24 && i[2] > bottom);
    const anchors = below.filter((i) => Math.abs(i[1] - xAmenaza) <= 14 && THREAT[i[0].toLowerCase()] !== undefined).sort((a, b) => b[2] - a[2]);
    if (anchors.length === 0) return;
    // El cuerpo empieza un poco por encima de la primera casilla: el período de la primera fila tiene líneas arriba (y la cabecera termina más arriba todavía).
    const bodyTop = anchors[0]![2] + 13;
    const body = below.filter((i) => i[2] <= bodyTop);
    anchors.forEach((a, n) => {
      const upper = n === 0 ? bodyTop : (anchors[n - 1]![2] + a[2]) / 2;
      const lower = n === anchors.length - 1 ? bottom : (a[2] + anchors[n + 1]![2]) / 2;
      const band = body.filter((i) => i[2] <= upper && i[2] > lower);
      const col = (from: number, to: number) => band.filter((i) => i[1] >= from && i[1] < to);
      const trendText = text(col(xPron - 8, xFalta - 12));
      const fal = col(xFalta - 12, xFalta + 27).map((i) => i[0]).join(' ').trim();
      const value = /^-?\d+(?:[.,]\d+)?$/.test(fal) ? Number(fal.replace(',', '.')) : null;
      out.push({
        // Los nombres de estación empiezan en x ≈ 78 a 92 y los de río en x ≈ 120 a 130 (el título «Río» está centrado en 130).
        station: text(col(xEstacion - 8, xRio - 15)),
        river: text(col(xRio - 15, xRio + 22)),
        threat: THREAT[a[0].toLowerCase()]!,
        trend: /^Ascens/i.test(trendText) ? 'rises' : /^Descens/i.test(trendText) ? 'falls' : null,
        untilOverflow: value,
        unit: value === null ? null : unit,
        // El texto del período va centrado: sus líneas empiezan unos píxeles a la izquierda de «Periodo de ocurrencia».
        period: text(col(xPeriodo - 25, Infinity)),
      });
    });
  });
  return out;
}

/** De los textos con posición de todas las páginas: las filas de la planilla; null si no se reconoce. */
export function parsePlanilla(pages: PlanillaItem[][], issuedOn: string, url = ''): BoPlanilla | null {
  const rows = pages.flatMap(parsePage).filter((r) => r.station.length > 0);
  return rows.length >= MIN_ROWS ? { issuedOn, url, rows } : null;
}
