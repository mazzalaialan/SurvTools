import { randomInt } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Config } from '../config.ts';
import type { Db } from '../db.ts';

/** Sin caracteres ambiguos (0/O, 1/I/L), igual que la clave de recuperación de la app. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

/** Intentos fallidos por IP antes de bloquear temporalmente (evita adivinar códigos). */
const MAX_FAILURES = 20;
const FAILURE_WINDOW_MS = 10 * 60_000;

export function generateCode(): string {
  return Array.from({ length: CODE_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
}

export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Transferencia de backups entre dispositivos (ARQUITECTURA §8.2). El archivo
 * llega ya cifrado por la app: el servidor nunca puede leerlo. Un solo uso.
 */
export function transferRoutes(app: FastifyInstance, db: Db, config: Config): void {
  const failures = new Map<string, { count: number; resetAt: number }>();

  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer', bodyLimit: config.transferMaxBytes }, (_req, body, done) =>
    done(null, body),
  );

  app.post<{ Body: Buffer }>('/api/transfers', { bodyLimit: config.transferMaxBytes }, async (req, reply) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) return reply.code(400).send({ error: 'empty' });
    const now = Date.now();
    // Tope de lo que el servidor guarda de transferencias a la vez (se vacían solas a las 24 h y al entregarse): sin él, subidas repetidas
    // podían llenar el disco.
    if (config.transferStoreMaxBytes > 0) {
      const stored = (db.prepare('SELECT COALESCE(SUM(LENGTH(data)), 0) AS bytes FROM transfers WHERE expires_at >= ?').get(now) as { bytes: number }).bytes;
      if (stored + req.body.length > config.transferStoreMaxBytes) return reply.code(503).header('retry-after', '3600').send({ error: 'storage-full' });
    }
    const expiresAt = now + config.transferTtlMs;
    let code = generateCode();
    while (db.prepare('SELECT 1 FROM transfers WHERE code = ?').get(code)) code = generateCode();
    db.prepare('INSERT INTO transfers (code, data, created_at, expires_at) VALUES (?, ?, ?, ?)').run(code, req.body, now, expiresAt);
    return reply.code(201).send({ code, expiresAt: new Date(expiresAt).toISOString() });
  });

  app.get<{ Params: { code: string } }>('/api/transfers/:code', async (req, reply) => {
    const now = Date.now();
    const entry = failures.get(req.ip);
    if (entry && entry.resetAt > now && entry.count >= MAX_FAILURES) return reply.code(429).send({ error: 'too-many-attempts' });

    const code = normalizeCode(req.params.code);
    const row = db.prepare('SELECT data FROM transfers WHERE code = ? AND expires_at >= ?').get(code, now) as { data: Uint8Array } | undefined;
    if (!row) {
      const current = entry && entry.resetAt > now ? entry : { count: 0, resetAt: now + FAILURE_WINDOW_MS };
      failures.set(req.ip, { ...current, count: current.count + 1 });
      return reply.code(404).send({ error: 'not-found' });
    }
    // Un solo uso: se borra al entregarlo.
    db.prepare('DELETE FROM transfers WHERE code = ?').run(code);
    return reply.type('application/octet-stream').send(Buffer.from(row.data));
  });
}
