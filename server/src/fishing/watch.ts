import { createHash } from 'node:crypto';
import { getSetting, setSetting, type Db } from '../db.ts';
import type { AdminNotifier } from '../monitor/sources.ts';

/**
 * Vigila la normativa de pesca (ver docs/PESCA.md): recién desde `WATCH_DAYS_BEFORE` días antes de que termine la vigencia del
 * reglamento actual (`VALID_UNTIL`) —no todo el año—, una vez por día baja el reglamento y prueba si ya se publicó el de la temporada
 * siguiente; si cambió o apareció, avisa al administrador por mail para revisar y regenerar `fish-AR.json` con tools/fishing-data.
 * Pasada la vigencia sigue probando cada día hasta encontrar el nuevo. Al cargar un reglamento nuevo, actualizar `VALID_UNTIL`.
 *
 * No regenera nada solo: la transcripción del reglamento se revisa a mano (es normativa, y un error de lectura sería peor que un
 * dato atrasado). Las huellas quedan en la tabla `settings` (`fishing-watch:<url>`), así un reinicio no repite el aviso.
 */

export interface WatchedDoc {
  /** Nombre para el mail. */
  label: string;
  url: string;
  /** Fin de la vigencia de ese documento, si no es la del reglamento patagónico común. */
  validUntil?: string;
  /** Dirección probable de la norma siguiente (se prueba si existe y se avisa una vez). */
  next?: string;
  /**
   * Sitio oficial que cambia todos los días (portada, boletín): la huella se toma solo de las líneas de texto que dicen alguna de estas
   * palabras («pesca», «veda»), así avisa cuando aparece o cambia algo de pesca y no por cada noticia nueva.
   */
  keywords?: string[];
}

/** Fin de la vigencia del reglamento cargado (los permisos de temporada 2026/27 valen hasta el 31/10/2027). */
export const VALID_UNTIL = '2027-10-31';
/** Cuántos días antes del fin de la vigencia se empieza a revisar. */
export const WATCH_DAYS_BEFORE = 45;

/** ¿Toca revisar? Solo desde unos días antes del fin de la vigencia (y después, hasta que se cargue el reglamento nuevo). */
export function watchDue(now: Date, validUntil = VALID_UNTIL, daysBefore = WATCH_DAYS_BEFORE): boolean {
  return now.getTime() >= new Date(`${validUntil}T00:00:00Z`).getTime() - daysBefore * 86_400_000;
}

/** Documentos que se vigilan. Agregar acá los de cada jurisdicción nueva. */
export const FISHING_DOCS: WatchedDoc[] = [
  { label: 'Reglamento de Pesca Deportiva Continental Patagónico 2026/2027', url: 'https://chubutstorage.s3.amazonaws.com/Pesca/Reglamento%20PDCP%202026-27%20Baja.pdf' },
  // Santa Cruz: Disposición 241/2026 (temporada hasta el 30/09/2027).
  { label: 'Santa Cruz: Reglamento de Pesca Deportiva Continental 2026/2027', url: 'https://pesca.santacruz.gob.ar/static/docs/reglamento-pesca-2026-2027.pdf', validUntil: '2027-09-30' },
  // Tierra del Fuego: Resolución S.A. 259/2026 (temporada hasta el 02/05/2027; la nueva sale en septiembre u octubre).
  { label: 'Tierra del Fuego: Resolución de la temporada de pesca 2026/2027', url: 'https://prodyambiente.tierradelfuego.gob.ar/wp-content/uploads/2026/10/Resolucion-N259-Temporada-pesca-2026.pdf', validUntil: '2027-10-01' },
  // San Luis: Calendario Íctico 2026 (año calendario; el de 2027 se publica a fines de diciembre o en enero).
  { label: 'San Luis: Calendario Íctico 2026', url: 'https://permisosdepesca.sanluis.gov.ar/Calendario_Ictico_2026.pdf', validUntil: '2026-12-31', next: 'https://permisosdepesca.sanluis.gov.ar/Calendario_Ictico_2027.pdf' },
  // San Juan: reglamento «de cada año»: se revisa antes del fin de la temporada de diques (19/08).
  { label: 'San Juan: Reglamento de Pesca Deportiva y Sustentable', url: 'https://tramite.sanjuan.gob.ar/tramite/dla/1320', validUntil: '2027-08-19' },
  // Sin norma vigente (ver docs/PESCA.md, «Reglamentos vencidos»): se prueba cada día si aparece la nueva publicación.
  { label: 'Tucumán: habilitación de pesca en ríos (vencida el 20/09/2026)', url: 'https://www.aicacyp.ar/blog/temporada-de-pesca-2026-tucuman/', validUntil: '2026-09-20', next: 'https://www.aicacyp.ar/blog/temporada-de-pesca-2027-tucuman/' },
  { label: 'Santiago del Estero: reglamento de pesca (último publicado: 2024)', url: 'https://www.aicacyp.ar/blog/temporada-de-pesca-2024-santiago-del-estero/', validUntil: '2025-12-31', next: 'https://www.aicacyp.ar/blog/temporada-de-pesca-2026-santiago-del-estero/' },
  { label: 'La Rioja: resolución anual de pesca (no publicada)', url: 'https://www.aicacyp.ar/blog/temporada-de-pesca-2020-en-la-rioja/', validUntil: '2020-12-31', next: 'https://www.aicacyp.ar/blog/temporada-de-pesca-2026-en-la-rioja/' },
  // Sitios oficiales de las provincias sin norma vigente: se avisa si cambia lo que dicen de pesca o veda.
  { label: 'Tucumán: Ministerio de Producción (novedades de pesca)', url: 'https://producciontucuman.gob.ar/', validUntil: '2026-09-20', keywords: ['pesca', 'veda'] },
  { label: 'Tucumán: Boletín Oficial (pesca)', url: 'https://boletin.tucuman.gov.ar/', validUntil: '2026-09-20', keywords: ['pesca', 'veda'] },
  { label: 'Santiago del Estero: Dirección General de Bosques y Fauna', url: 'https://dgbyf.gob.ar/', validUntil: '2025-12-31', keywords: ['pesca', 'veda'] },
  { label: 'La Rioja: Secretaría de Ambiente (pesca)', url: 'https://ambiente.larioja.gob.ar/', validUntil: '2020-12-31', keywords: ['pesca', 'veda'] },
  // NOA: Salta (Res. 567/2026, temporada hasta el 31/08/2027) y Catamarca (Disp. 309/2026, hasta el 31/08/2027).
  { label: 'Salta: Resolución 567/2026, anexo de pesca (copia de AICACYP)', url: 'https://www.aicacyp.ar/wp-content/uploads/2026/08/anexo-salta-pesca-2026-7.pdf', validUntil: '2027-08-31' },
  { label: 'Catamarca: Disposición 309/2026, temporada de pesca (copia de AICACYP)', url: 'https://www.aicacyp.ar/wp-content/uploads/2026/11/Disposicion-Temporada-de-pesca-2026-2027.pdf', validUntil: '2027-08-31' },
  // Mendoza: Res. 322/2026 (pejerrey y perca hasta el 30/09/2027; la resolución nueva sale en octubre).
  { label: 'Mendoza: Resolución de pesca deportiva 2026/2027 (copia del Boletín Oficial)', url: 'https://www.elsol.com.ar/wp-content/uploads/2026/11/Pesca-Resolucion.pdf', validUntil: '2027-09-30' },
  { label: 'Tierra del Fuego: página de pesca deportiva (anuncia la resolución nueva)', url: 'https://prodyambiente.tierradelfuego.gob.ar/pesca-deportiva-tdf/', validUntil: '2027-10-01' },
];

/** El reglamento de la temporada siguiente, si siguen publicándolo con el mismo nombre (se prueba si existe). */
export function nextSeasonUrls(now: Date): WatchedDoc[] {
  // La que sigue a la vigente: la 2026/27 vence en octubre de 2027, así que se busca la 2027/28 (hasta noviembre, la del año en curso).
  const start = now.getUTCMonth() >= 10 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  const yy = (n: number) => String(n % 100).padStart(2, '0');
  return [{ label: `Reglamento ${start}/${start + 1} (temporada siguiente)`, url: `https://chubutstorage.s3.amazonaws.com/Pesca/Reglamento%20PDCP%20${start}-${yy(start + 1)}%20Baja.pdf` }];
}

export interface FishingWatchResult {
  checked: number;
  changed: string[];
  failed: string[];
  found: string[];
  /** Normas vencidas sin reemplazo (se avisa una vez por norma). */
  expired: string[];
}

const KEY = (url: string) => `fishing-watch:${url}`;
const NEXT_KEY = (url: string) => `fishing-watch:next:${url}`;

/** Las líneas de texto (sin etiquetas HTML) que dicen alguna palabra clave, para comparar solo lo de pesca de una página que cambia mucho. */
export function keywordLines(html: string, keywords: string[]): string {
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, '\n');
  const re = new RegExp(keywords.join('|'), 'i');
  return text
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l && re.test(l))
    .join('\n');
}

export async function runFishingWatch(
  db: Db,
  notifier: AdminNotifier | null,
  log: (msg: string, data?: object) => void,
  fetchImpl: typeof fetch = fetch,
  now = new Date(),
  docs: WatchedDoc[] = FISHING_DOCS,
): Promise<FishingWatchResult> {
  const result: FishingWatchResult = { checked: 0, changed: [], failed: [], found: [], expired: [] };
  if (!docs.some((d) => watchDue(now, d.validUntil))) return result;
  const notes: string[] = [];
  for (const doc of docs) {
    if (!watchDue(now, doc.validUntil)) continue;
    try {
      const res = await fetchImpl(doc.url, { signal: AbortSignal.timeout(60_000), headers: { 'user-agent': 'VikArg-server/1.0' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = Buffer.from(await res.arrayBuffer());
      const hash = createHash('sha256').update(doc.keywords ? keywordLines(body.toString('utf8'), doc.keywords) : body).digest('hex');
      result.checked++;
      const before = getSetting(db, KEY(doc.url));
      setSetting(db, KEY(doc.url), hash);
      // La primera vez solo se guarda la huella.
      if (before && before !== hash) {
        result.changed.push(doc.label);
        notes.push(`Cambió: ${doc.label}\n${doc.url}`);
      }
    } catch (err) {
      result.failed.push(doc.label);
      log('no se pudo revisar un documento de pesca', { url: doc.url, err: String(err) });
    }
  }
  const nexts = [...(watchDue(now) ? nextSeasonUrls(now) : []), ...docs.filter((d) => d.next && watchDue(now, d.validUntil)).map((d) => ({ label: `${d.label} (siguiente)`, url: d.next! }))];
  for (const doc of nexts) {
    // Clave propia («next:»): la versión anterior marcaba «encontrado» también las páginas web que devuelven 200 para cualquier dirección.
    if (getSetting(db, NEXT_KEY(doc.url))) continue; // ya se avisó
    try {
      const res = await fetchImpl(doc.url, { method: 'HEAD', signal: AbortSignal.timeout(30_000), headers: { 'user-agent': 'VikArg-server/1.0' } });
      // Solo cuenta un documento de verdad: algunos sitios (San Luis) devuelven 200 con su página web para cualquier dirección.
      if (res.ok && !/text\/html/i.test(res.headers.get('content-type') ?? '')) {
        setSetting(db, NEXT_KEY(doc.url), 'encontrado');
        result.found.push(doc.label);
        notes.push(`Se publicó: ${doc.label}\n${doc.url}`);
      }
    } catch {
      // Todavía no está (o no responde): se prueba mañana.
    }
  }
  // Vencida la norma sin que aparezca la nueva: la app ya muestra «Sin regla específica encontrada» en esos tramos. Se avisa una vez, para
  // revisar si la fuente cambió de dirección (y hay que corregir la URL) o si la norma nueva cambió (se liberó la pesca, otra veda…).
  for (const doc of docs) {
    const until = doc.validUntil ?? VALID_UNTIL;
    if (now.getTime() <= new Date(`${until}T23:59:59Z`).getTime()) continue;
    const key = `fishing-watch:expired:${doc.url}`;
    if (getSetting(db, key)) continue;
    setSetting(db, key, now.toISOString());
    result.expired.push(doc.label);
    notes.push(`Venció (${until}) y no se cargó la norma nueva: ${doc.label}\n${doc.url}\nLa app ya muestra «Sin regla específica encontrada» en esos tramos. Revisá si la fuente cambió de dirección o si cambió la norma (por ejemplo, si se liberó la pesca).`);
  }
  // Lo último que se revisó queda guardado (settings «fishing-watch:last»), para ver después qué falló y desde cuándo.
  setSetting(db, 'fishing-watch:last', JSON.stringify({ at: now.toISOString(), ...result }));
  if (notes.length) {
    const text = `${notes.join('\n\n')}\n\nRevisar y regenerar los datos de pesca: tools/fishing-data (README) y docs/PESCA.md. Hasta entonces la app muestra los datos anteriores, con su fecha y el aviso de consultar el reglamento vigente.`;
    if (notifier) {
      try {
        await notifier.send('VikArg: cambió la normativa de pesca', text);
      } catch (err) {
        log('no se pudo avisar el cambio de la normativa de pesca', { err: String(err) });
      }
    } else log('cambió la normativa de pesca (sin correo configurado: SMTP_URL)', { notes });
  }
  return result;
}
