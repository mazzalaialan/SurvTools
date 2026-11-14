import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { Config } from '../config.ts';

/**
 * Paquetes de datos regenerados por el servidor cada mes
 * (server/src/data/update-data.sh): `GET /api/data/:file`. La app usa la copia
 * del servidor si es más nueva que la que trae (campo `generatedAt`).
 * Solo estos archivos: nada de rutas arbitrarias.
 */
/** Servicios para "Buscar cercanos" (tools/services-data): un archivo por categoría y país. */
const SERVICE_CATEGORIES = ['fuel', 'tyres', 'repair', 'pharmacy', 'aed', 'vet', 'water', 'shelter', 'atm', 'nautical'];
const SERVICE_COUNTRIES = ['AR', 'CL', 'UY', 'BO', 'PE'];
export const DATA_FILES = new Set([
  'CL.json',
  'UY.json',
  'BO.json',
  'PE.json',
  'parks-CL.json',
  'parks-AR.json',
  'parks-BO.json',
  'parks-PE.json',
  ...SERVICE_CATEGORIES.flatMap((c) => SERVICE_COUNTRIES.map((cc) => `${c}-${cc}.json`)),
]);

/** Fecha de generación (`generatedAt`, AAAA-MM-DD) de un paquete; vacía si no la tiene. */
export function generatedAtOf(json: string): string {
  try {
    const d = JSON.parse(json) as { generatedAt?: unknown };
    return d && typeof d === 'object' && typeof d.generatedAt === 'string' ? d.generatedAt : '';
  } catch {
    return '';
  }
}

export function dataRoutes(app: FastifyInstance, config: Config): void {
  // Qué leyó de cada archivo (por fecha de modificación y peso): los paquetes son de cientos de KB y se regeneran cada mes.
  const seen = new Map<string, { mtimeMs: number; bytes: number; date: string }>();

  /**
   * `GET /api/data/index.json`: fecha y peso de cada paquete que tiene el servidor, para que el teléfono baje solo los que cambiaron
   * (app/src/modules/emergency/dataFile.ts). Mismo formato que `public/data/index.json` de la app.
   */
  app.get('/api/data/index.json', async (_req, reply) => {
    if (!config.dataPacksDir) return reply.code(404).send({ error: 'not-found' });
    const files: Record<string, { date: string; bytes: number }> = {};
    for (const file of [...DATA_FILES].sort()) {
      const path = join(config.dataPacksDir, file);
      try {
        const st = await stat(path);
        let hit = seen.get(file);
        if (!hit || hit.mtimeMs !== st.mtimeMs || hit.bytes !== st.size) {
          hit = { mtimeMs: st.mtimeMs, bytes: st.size, date: generatedAtOf(await readFile(path, 'utf8')) };
          seen.set(file, hit);
        }
        files[file] = { date: hit.date, bytes: hit.bytes };
      } catch {
        /* el servidor no tiene ese paquete: no figura */
      }
    }
    return reply.header('cache-control', 'no-cache').send({ files });
  });

  app.get<{ Params: { file: string } }>('/api/data/:file', async (req, reply) => {
    const { file } = req.params;
    if (!config.dataPacksDir || !DATA_FILES.has(file)) return reply.code(404).send({ error: 'not-found' });
    let body: Buffer;
    try {
      body = await readFile(join(config.dataPacksDir, file));
    } catch {
      return reply.code(404).send({ error: 'not-found' });
    }
    return reply.header('content-type', 'application/json; charset=utf-8').header('cache-control', 'no-cache').send(body);
  });
}
