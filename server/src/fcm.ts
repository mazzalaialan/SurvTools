import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { PushPayload } from './push.ts';

/**
 * Envío de avisos a la app nativa (Android; iPhone a través de APNs) con Firebase Cloud Messaging, API HTTP v1.
 * Sin dependencias: la autenticación (OAuth2 con el JWT firmado de la cuenta de servicio) se arma con `node:crypto`.
 * La clave de la cuenta de servicio es un SECRETO: va en un archivo fuera del repositorio (FCM_SERVICE_ACCOUNT_FILE), nunca en un commit.
 *
 * Qué viaja en el mensaje lo decide `fcmData` (hoy el aviso completo, como en Web Push pero SIN el cifrado de punta a punta: Google lo ve).
 * Está pendiente decidir si mandar solo un aviso mínimo y que la app consulte el detalle (docs/PENDIENTES.md, «notificaciones sin contenido»):
 * cambiarlo es reemplazar esa función.
 */
export interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export interface FcmTarget {
  fcm: string;
  platform: 'android' | 'ios';
}

export interface FcmSender {
  projectId: string;
  /** `false` si el token ya no existe (se desinstaló la app o se revocó el permiso); lanza ante cualquier otro error. */
  send(target: FcmTarget, payload: PushPayload, urgency: 'high' | 'normal'): Promise<boolean>;
}

export function readServiceAccount(path: string): ServiceAccount {
  const json = JSON.parse(readFileSync(path, 'utf8')) as Partial<ServiceAccount>;
  if (!json.project_id || !json.client_email || !json.private_key) throw new Error('La cuenta de servicio de FCM no tiene project_id, client_email o private_key');
  return json as ServiceAccount;
}

const b64url = (data: Buffer | string) => Buffer.from(data).toString('base64url');
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

/** JWT firmado (RS256) que se cambia por un token de acceso. */
export function signServiceJwt(account: ServiceAccount, nowSeconds: number): string {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({ iss: account.client_email, scope: SCOPE, aud: account.token_uri ?? 'https://oauth2.googleapis.com/token', iat: nowSeconds, exp: nowSeconds + 3600 }),
  );
  const signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(account.private_key);
  return `${header}.${claims}.${b64url(signature)}`;
}

/** Los datos del mensaje. FCM limita todo el mensaje a 4 KB, igual que Web Push: los avisos ya se compactan para entrar (alertPayload.ts). */
export function fcmData(payload: PushPayload): Record<string, string> {
  return { payload: JSON.stringify(payload) };
}

export function createFcmSender(account: ServiceAccount, fetchFn: typeof fetch = fetch, now: () => number = Date.now): FcmSender {
  let token: { value: string; expiresAt: number } | null = null;

  async function accessToken(): Promise<string> {
    if (token && token.expiresAt > now() + 60_000) return token.value;
    const res = await fetchFn(account.token_uri ?? 'https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: signServiceJwt(account, Math.floor(now() / 1000)) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`FCM: no se pudo obtener el token de acceso (${res.status})`);
    const body = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new Error('FCM: respuesta de token sin access_token');
    token = { value: body.access_token, expiresAt: now() + (body.expires_in ?? 3600) * 1000 };
    return token.value;
  }

  return {
    projectId: account.project_id,
    async send(target, payload, urgency) {
      const message: Record<string, unknown> = {
        token: target.fcm,
        data: fcmData(payload),
        android: { priority: urgency === 'high' ? 'HIGH' : 'NORMAL', ttl: '86400s' },
      };
      // iPhone: un mensaje de datos solo despierta la app (aviso en segundo plano). Mostrar el texto sin que viaje en el mensaje necesita una
      // extensión nativa de iOS: queda para cuando se haga la versión de iPhone (docs/PENDIENTES.md).
      if (target.platform === 'ios') message.apns = { headers: { 'apns-priority': urgency === 'high' ? '10' : '5', 'apns-push-type': 'background' }, payload: { aps: { 'content-available': 1 } } };
      const res = await fetchFn(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${await accessToken()}` },
        body: JSON.stringify({ message }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) return true;
      const err = (await res.json().catch(() => null)) as { error?: { status?: string; details?: { errorCode?: string }[] } } | null;
      const code = err?.error?.details?.find((d) => d.errorCode)?.errorCode;
      // UNREGISTERED (404): el token ya no sirve. Lo demás (cuota, credenciales, mensaje inválido) es un error nuestro: se lanza.
      if (res.status === 404 || code === 'UNREGISTERED') return false;
      if (res.status === 401) token = null;
      throw Object.assign(new Error(`FCM ${res.status} ${err?.error?.status ?? ''} ${code ?? ''}`.trim()), { statusCode: res.status });
    },
  };
}
