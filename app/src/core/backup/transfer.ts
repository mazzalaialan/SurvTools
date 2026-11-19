import { normalizeServerUrl } from '@/core/notifications/notifications';
import { isNativePlatform } from '@/core/platform';

/** Dónde vive la web pública de la app: en la nativa la página es `https://localhost/` (el WebView), que no sirve en otro teléfono. */
import { PUBLIC_APP_URL } from '@/core/appUrl';
export { PUBLIC_APP_URL };

/** La dirección que lleva el enlace: la de la página en el navegador y la web pública en la app nativa. */
export const defaultLinkBase = (): string => (isNativePlatform() ? PUBLIC_APP_URL : `${location.origin}${location.pathname}`);

/**
 * Transferencia por código (ARQUITECTURA §8.2): el backup, ya cifrado, se sube
 * al servidor propio y se baja en el otro dispositivo con un código de un solo uso.
 */

export class TransferError extends Error {
  constructor(public readonly code: 'unreachable' | 'not-found' | 'too-many-attempts' | 'too-large' | 'failed') {
    super(code);
    this.name = 'TransferError';
  }
}

export interface TransferTicket {
  code: string;
  expiresAt: string;
}

export function formatTransferCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export async function uploadTransfer(serverUrl: string, bytes: Uint8Array<ArrayBuffer>): Promise<TransferTicket> {
  let res: Response;
  try {
    res = await fetch(`${normalizeServerUrl(serverUrl)}/api/transfers`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: bytes,
    });
  } catch {
    throw new TransferError('unreachable');
  }
  if (res.status === 413) throw new TransferError('too-large');
  if (!res.ok) throw new TransferError('failed');
  return (await res.json()) as TransferTicket;
}

export async function downloadTransfer(serverUrl: string, code: string): Promise<Uint8Array> {
  let res: Response;
  try {
    res = await fetch(`${normalizeServerUrl(serverUrl)}/api/transfers/${encodeURIComponent(code.trim())}`);
  } catch {
    throw new TransferError('unreachable');
  }
  if (res.status === 404) throw new TransferError('not-found');
  if (res.status === 429) throw new TransferError('too-many-attempts');
  if (!res.ok) throw new TransferError('failed');
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Link para el QR: abre esta misma app en la pantalla de recepción con el
 * servidor y el código ya cargados, aunque el otro dispositivo no tenga servidor configurado.
 */
export function transferLink(serverUrl: string, code: string, base = defaultLinkBase()): string {
  const params = new URLSearchParams({ server: normalizeServerUrl(serverUrl), code });
  return `${base}#/transfer?${params}`;
}

export function parseTransferLink(text: string): { server: string; code: string } | null {
  const query = text.split('#/transfer?')[1];
  if (!query) return null;
  const params = new URLSearchParams(query);
  const server = params.get('server');
  const code = params.get('code');
  return server && code ? { server, code } : null;
}
