import type { FastifyInstance } from 'fastify';
import { getSetting, setSetting, type Db } from '../db.ts';

/**
 * Marea roja: últimos avisos oficiales de Chubut, leídos del feed (RSS) del sitio del Plan Provincial de Prevención y Control
 * (https://marearoja.chubut.gov.ar/feed/). Es la única provincia con una fuente oficial al día y legible: se copia el título y la
 * fecha de cada aviso tal cual, sin interpretarlo (es un dato de salud), y la app lo muestra con el enlace al aviso.
 * Se revisa una vez por día; lo último leído queda en `settings` («redtide:chubut») para servirlo aunque el sitio no responda.
 */

export const CHUBUT_FEED = 'https://marearoja.chubut.gov.ar/feed/';
const KEY = 'redtide:chubut';

export interface RedTideNotice {
  title: string;
  url: string;
  /** Fecha de publicación (ISO). */
  date: string;
}

export interface RedTideState {
  source: string;
  /** Cuándo se leyó el feed por última vez con éxito (ISO). */
  fetchedAt: string;
  items: RedTideNotice[];
}

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#8211;/g, '–')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();

/** Los avisos del feed (los más nuevos primero), con título, enlace y fecha. */
export function parseFeed(xml: string, max = 5): RedTideNotice[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  return items
    .map((it) => ({
      title: decode(it.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? ''),
      url: decode(it.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? ''),
      date: new Date(decode(it.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? '')).toISOString(),
    }))
    .filter((n) => n.title && /^https:\/\/marearoja\.chubut\.gov\.ar\//.test(n.url))
    .slice(0, max);
}

/** Lee el feed y guarda los avisos. Si falla, queda lo último leído. */
export async function refreshChubut(db: Db, fetchImpl: typeof fetch = fetch, now = new Date()): Promise<RedTideState | null> {
  const res = await fetchImpl(CHUBUT_FEED, { signal: AbortSignal.timeout(30_000), headers: { 'user-agent': 'VikArg-server/1.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const items = parseFeed(await res.text());
  if (!items.length) throw new Error('feed sin avisos');
  const state: RedTideState = { source: CHUBUT_FEED, fetchedAt: now.toISOString(), items };
  setSetting(db, KEY, JSON.stringify(state));
  return state;
}

export function chubutState(db: Db): RedTideState | null {
  const raw = getSetting(db, KEY);
  return raw ? (JSON.parse(raw) as RedTideState) : null;
}

/** GET /api/redtide: los últimos avisos oficiales de marea roja que se pudieron leer (hoy, solo Chubut). */
export function redTideRoutes(app: FastifyInstance, db: Db): void {
  app.get('/api/redtide', async (_req, reply) => {
    reply.header('cache-control', 'public, max-age=3600');
    return { chubut: chubutState(db) };
  });
}
