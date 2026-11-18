import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { PushPayload } from './push.ts';

/**
 * Envío de avisos a la app nativa (Android; iPhone a través de APNs) con Firebase Cloud Messaging, API HTTP v1.
 * Sin dependencias: la autenticación (OAuth2 con el JWT firmado de la cuenta de servicio) se arma con `node:crypto`.
 * La clave de la cuenta de servicio es un SECRETO: va en un archivo fuera del repositorio (FCM_SERVICE_ACCOUNT_FILE), nunca en un commit.
 *
 * Qué viaja en el mensaje (decisión provisional del 2026-11-18, para el APK de prueba; ver docs/PENDIENTES.md, «notificaciones sin contenido»):
 * solo el TIPO de aviso y un texto genérico que el propio teléfono traduce con claves de idioma (`title_loc_key` y `body_loc_key`, definidas en
 * `strings.xml` de la app). Nada de nombres de botiquines, lugares ni artículos: FCM no tiene el cifrado de punta a punta del Web Push, Google
 * lo vería. Un mensaje de datos puro no se muestra en Android con la app cerrada, por eso lleva el bloque `notification`; el detalle lo
 * consulta la app al abrirla. Cambiarlo es reemplazar `fcmMessage`.
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

/** Clave de idioma del cuerpo según el tipo de aviso (están en `strings.xml` de la app, en español y en inglés). */
export function bodyKey(payload: PushPayload): string {
  return payload.type === 'test' ? 'notif_body_test' : 'notif_body_new';
}

/**
 * El mensaje que se le manda a un dispositivo nativo. El bloque `notification` lleva un texto de respaldo en español; en Android las claves
 * `*_loc_key` lo reemplazan por el idioma del teléfono. `data.type` es lo único del aviso que viaja: la app lo usa para abrir la pantalla.
 */
export function fcmMessage(target: FcmTarget, payload: PushPayload, urgency: 'high' | 'normal'): Record<string, unknown> {
  const test = payload.type === 'test';
  const message: Record<string, unknown> = {
    token: target.fcm,
    notification: { title: 'VikArg', body: test ? 'Notificación de prueba' : 'Tenés avisos nuevos' },
    data: { type: String(payload.type ?? 'alerts') },
    android: {
      priority: urgency === 'high' ? 'HIGH' : 'NORMAL',
      ttl: '86400s',
      // Un aviso con la misma etiqueta reemplaza al anterior en vez de apilarse.
      notification: { tag: 'vikarg-alerts', title_loc_key: 'notif_title', body_loc_key: bodyKey(payload) },
    },
  };
  // iPhone: pendiente para su versión (sonido, `apns-push-type: alert` y la clave de APNs de Apple).
  if (target.platform === 'ios') message.apns = { headers: { 'apns-priority': urgency === 'high' ? '10' : '5' }, payload: { aps: { sound: 'default' } } };
  return message;
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
      const message = fcmMessage(target, payload, urgency);
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
