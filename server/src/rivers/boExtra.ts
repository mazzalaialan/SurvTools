import { extractText, getDocumentProxy } from 'unpdf';
import { parsePlanilla, type BoPlanilla, type PlanillaItem } from './boPlanilla.ts';

/**
 * Dos documentos más del SENAMHI Bolivia, además del reporte de niveles diarios (rivers/bo.ts): el resumen del pronóstico hidrológico de ~14
 * días (nota oficial con las cuencas bajo amenaza y los períodos de ascensos o descensos) y el boletín semanal del lago Titicaca (estación
 * Huatajata). Sin licencia declarada («Derechos Reservados»): se usa citando al SENAMHI y mostrando la fecha, igual que los niveles diarios.
 * La planilla por estación (amenaza, tendencia, cuánto falta para el desborde y período) se lee por la posición de cada texto: ver boPlanilla.ts.
 */
export interface BoForecast {
  /** Fecha de emisión (AAAA-MM-DD) y período que cubre, como lo escribe el SENAMHI («13 AL 27 NOVIEMBRE DE 2026»). */
  issuedOn: string;
  period: string;
  /** «NOTA» del resumen, textual: la amenaza y las cuencas. */
  note: string;
  /** «Probables ascensos» o «descensos» y sus períodos, textual. */
  trend: 'rises' | 'falls' | null;
  spans: string;
  url: string;
}

export interface BoLake {
  /** Fecha de la lectura (AAAA-MM-DD), nivel en la escala (m) y absoluto (m s. n. m.). */
  date: string;
  levelM: number;
  absoluteM: number;
  /** Variación de la última semana (cm): positiva sube, negativa baja. */
  weekCm: number | null;
  /** Metros respecto del promedio histórico: positivo, por encima; negativo, por debajo. */
  vsAverageM: number | null;
  url: string;
}

export interface BoExtras {
  fetchedAt: number;
  forecast: BoForecast | null;
  lake: BoLake | null;
  /** La planilla por estación del pronóstico (la nacional), o null si no se pudo leer. */
  planilla: BoPlanilla | null;
}

const FORECAST_LIST = 'https://senamhi.gob.bo/hidrologia/repositorio-pronostico';
const LAKE_LIST = 'https://senamhi.gob.bo/hidrologia/thidrologico';
const UA = 'VikArg-Survival-Tools/1.0';
const MAX_PDF = 6 * 1024 * 1024;
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const iso = (y: number | string, m: number | string, d: number | string) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** El enlace más nuevo de la página de listados que cumple `pattern` (con la fecha en los grupos 1 a 3: día, mes, año). */
function latestLink(html: string, pattern: RegExp, base: string): string | null {
  const links = [...html.matchAll(/href="([^"]+\.pdf)"/gi)].flatMap((m) => {
    const hit = pattern.exec(decode(m[1]!));
    return hit ? [{ href: m[1]!, key: `${hit[3]}${hit[2]}${hit[1]}` }] : [];
  });
  links.sort((a, b) => b.key.localeCompare(a.key));
  return links[0] ? new URL(links[0].href, base).href : null;
}

/** «…RESUMEN DEL BOLETÍN DE PRONÓSTICO HIDROLÓGICO SENAMHI VIERNES 13-11-2026.pdf» (sin los de «(DIRECTOR)» ni los de planilla). */
export const latestForecastUrl = (html: string) => latestLink(html, /RESUMEN DEL BOLET[ÍI]N DE PRON[ÓO]STICO HIDROL[ÓO]GICO SENAMHI\s+\S+\s+(\d{2})-(\d{2})-(\d{4})\.pdf$/i, FORECAST_LIST);
/** «…/RESUMEN EN PLANILLA PRONÓSTICO HIDROLÓGICO SENAMHI VIERNES 13-11-2026.pdf»: la nacional (las regionales llevan un prefijo, «CBBA-RESUMEN…», y son partes de ella). */
export const latestPlanillaUrl = (html: string) => latestLink(html, /\/RESUMEN EN PLANILLA PRON[ÓO]STICO HIDROL[ÓO]GICO SENAMHI\s+\S+\s+(\d{2})-(\d{2})-(\d{4})\.pdf$/i, FORECAST_LIST);
/** «…LAGO TITICACA - BOLETIN Semanal (Actualizado 06_11_2026).pdf». */
export const latestLakeUrl = (html: string) => latestLink(html, /LAGO TITICACA - BOLETIN Semanal \(Actualizado (\d{2})_(\d{2})_(\d{4})\)\.pdf$/i, LAKE_LIST);

const flat = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Del texto del resumen: la fecha, el período, la nota y los períodos de ascensos o descensos; null si no se reconoce. */
export function parseForecastSummary(text: string, url = ''): BoForecast | null {
  const date = /SENAMHI,\s*[A-Za-zÁÉÍÓÚáéíóú]+\s+(\d{1,2})\s+([A-Za-záéíóú]+)\s+de\s+(\d{4})/i.exec(text);
  const month = date ? MONTHS.indexOf(date[2]!.toLowerCase()) : -1;
  const period = /DEL\s+\d{1,2}\s+AL\s+\d{1,2}\s+[A-ZÁÉÍÓÚ]+\s+DE\s+\d{4}/i.exec(text);
  const noteMatch = /NOTA:\s*([\s\S]*?)\s*RESUMEN PRON[ÓO]STICO/i.exec(text);
  const spans = /Probables\s+(Ascensos|Descensos)\s*:\s*(Del[\s\S]*?\d{4})/i.exec(text);
  if (!date || month < 0 || !noteMatch) return null;
  const note = flat(noteMatch[1]!);
  if (note.length < 20) return null;
  return {
    issuedOn: iso(date[3]!, month + 1, date[1]!),
    period: period ? flat(period[0]!).toLowerCase().replace(/^del/, 'Del') : '',
    note,
    trend: spans ? (spans[1]!.toLowerCase() === 'ascensos' ? 'rises' : 'falls') : null,
    spans: spans ? flat(spans[2]!) : '',
    url,
  };
}

/** Del texto del boletín semanal del lago (estación Huatajata); null si no se reconoce. */
export function parseLakeBulletin(text: string, url = ''): BoLake | null {
  const flatText = flat(text);
  const date = /FECHA:\s*(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})/i.exec(flatText);
  const level = /NIVEL:\s*(\d+(?:[.,]\d+)?)\s*m\.?\s*\((\d{4}(?:[.,]\d+)?)\s*m\.?\s*s\.?n\.?m\.?\)/i.exec(flatText);
  const month = date ? MONTHS.indexOf(date[2]!.toLowerCase()) : -1;
  if (!date || month < 0 || !level) return null;
  const week = /VARIACI[ÓO]N\s+[ÚU]LTIMA\s+SEMANA:\s*(Ascenso|Descenso|Se mantiene)\s*(\d+)?(?:\s*cm)?/i.exec(flatText);
  const vs = /se encuentran\s+(\d+(?:[.,]\d+)?)\s*m\s+por\s+(debajo|encima)\s+de\s+su\s+promedio/i.exec(flatText);
  const num = (s: string) => Number(s.replace(',', '.'));
  return {
    date: iso(date[3]!, month + 1, date[1]!),
    levelM: num(level[1]!),
    absoluteM: num(level[2]!),
    weekCm: week ? (/mantiene/i.test(week[1]!) ? 0 : (/descenso/i.test(week[1]!) ? -1 : 1) * Number(week[2] ?? 0)) : null,
    vsAverageM: vs ? (vs[2] === 'debajo' ? -1 : 1) * num(vs[1]!) : null,
    url,
  };
}

async function get(url: string): Promise<Response> {
  const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`SENAMHI Bolivia ${res.status}`);
  return res;
}

async function pdfText(url: string): Promise<string> {
  const buf = new Uint8Array(await (await get(url)).arrayBuffer());
  if (buf.length > MAX_PDF) throw new Error('SENAMHI Bolivia: el PDF es demasiado grande');
  const { text } = await extractText(await getDocumentProxy(buf), { mergePages: true });
  return text as string;
}

/** La planilla: los textos con su posición en cada página, y la fecha de emisión que dice el nombre del archivo. */
async function planillaFrom(url: string): Promise<BoPlanilla | null> {
  const buf = new Uint8Array(await (await get(url)).arrayBuffer());
  if (buf.length > MAX_PDF) throw new Error('SENAMHI Bolivia: el PDF es demasiado grande');
  const pdf = await getDocumentProxy(buf);
  const pages: PlanillaItem[][] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const content = await (await pdf.getPage(n)).getTextContent();
    pages.push(content.items.flatMap((i) => ('str' in i && i.str.trim() ? [[i.str.trim(), Math.round(i.transform[4]!), Math.round(i.transform[5]!)] as PlanillaItem] : [])));
  }
  const date = /(\d{2})-(\d{2})-(\d{4})\.pdf$/i.exec(decode(url));
  return date ? parsePlanilla(pages, iso(date[3]!, date[2]!, date[1]!), url) : null;
}

/** Baja el último resumen del pronóstico y el último boletín del lago; cada uno puede fallar sin tirar al otro (null). Falla si ninguno sale. */
export async function fetchBoExtras(now = Date.now()): Promise<BoExtras> {
  const one = async <T>(list: string, find: (html: string) => string | null, parse: (text: string, url: string) => T | null): Promise<T | null> => {
    try {
      const url = find(await (await get(list)).text());
      return url ? parse(await pdfText(url), url) : null;
    } catch {
      return null;
    }
  };
  const planilla = async (): Promise<BoPlanilla | null> => {
    try {
      const url = latestPlanillaUrl(await (await get(FORECAST_LIST)).text());
      return url ? await planillaFrom(url) : null;
    } catch {
      return null;
    }
  };
  const [forecast, lake, stations] = await Promise.all([one(FORECAST_LIST, latestForecastUrl, parseForecastSummary), one(LAKE_LIST, latestLakeUrl, parseLakeBulletin), planilla()]);
  if (!forecast && !lake && !stations) throw new Error('SENAMHI Bolivia: no se pudo leer el pronóstico, el boletín del lago ni la planilla');
  return { fetchedAt: now, forecast, lake, planilla: stations };
}
