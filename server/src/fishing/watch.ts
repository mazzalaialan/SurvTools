import { createHash } from 'node:crypto';
import { getSetting, setSetting, type Db } from '../db.ts';
import type { AdminNotifier } from '../monitor/sources.ts';

/**
 * Vigila la normativa de pesca (ver docs/PESCA.md): una vez por día baja el reglamento vigente y las páginas oficiales de los permisos,
 * y si alguno cambió (otra huella del contenido) avisa al administrador por mail, para revisar y regenerar el paquete
 * `fish-AR.json` con tools/fishing-data. También prueba si ya se publicó el reglamento de la temporada siguiente.
 *
 * No regenera nada solo: la transcripción del reglamento se revisa a mano (es normativa, y un error de lectura sería peor que un
 * dato atrasado). Las huellas quedan en la tabla `settings` (`fishing-watch:<url>`), así un reinicio no repite el aviso.
 */

export interface WatchedDoc {
  /** Nombre para el mail. */
  label: string;
  url: string;
}

/** Documentos que se vigilan. Agregar acá los de cada jurisdicción nueva. */
export const FISHING_DOCS: WatchedDoc[] = [
  { label: 'Reglamento de Pesca Deportiva Continental Patagónico 2026/2027', url: 'https://chubutstorage.s3.amazonaws.com/Pesca/Reglamento%20PDCP%202026-27%20Baja.pdf' },
];

/** El reglamento de la temporada siguiente, si siguen publicándolo con el mismo nombre (se prueba si existe). */
export function nextSeasonUrls(now: Date): WatchedDoc[] {
  // La temporada empieza en noviembre: en noviembre de 2026 rige la 2026/27 y se busca la 2027/28.
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
  const notes: string[] = [];
  for (const doc of docs) {
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
  for (const doc of nextSeasonUrls(now)) {
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
