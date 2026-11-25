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
}

const KEY = (url: string) => `fishing-watch:${url}`;

export async function runFishingWatch(
  db: Db,
  notifier: AdminNotifier | null,
  log: (msg: string, data?: object) => void,
  fetchImpl: typeof fetch = fetch,
  now = new Date(),
  docs: WatchedDoc[] = FISHING_DOCS,
): Promise<FishingWatchResult> {
  const result: FishingWatchResult = { checked: 0, changed: [], failed: [], found: [] };
  if (!docs.some((d) => watchDue(now, d.validUntil))) return result;
  const notes: string[] = [];
  for (const doc of docs) {
    if (!watchDue(now, doc.validUntil)) continue;
    try {
      const res = await fetchImpl(doc.url, { signal: AbortSignal.timeout(60_000), headers: { 'user-agent': 'VikArg-server/1.0' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const hash = createHash('sha256').update(Buffer.from(await res.arrayBuffer())).digest('hex');
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
  for (const doc of watchDue(now) ? nextSeasonUrls(now) : []) {
    if (getSetting(db, KEY(doc.url))) continue; // ya se avisó
    try {
      const res = await fetchImpl(doc.url, { method: 'HEAD', signal: AbortSignal.timeout(30_000), headers: { 'user-agent': 'VikArg-server/1.0' } });
      if (res.ok) {
        setSetting(db, KEY(doc.url), 'encontrado');
        result.found.push(doc.label);
        notes.push(`Se publicó: ${doc.label}\n${doc.url}`);
      }
    } catch {
      // Todavía no está (o no responde): se prueba mañana.
    }
  }
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
