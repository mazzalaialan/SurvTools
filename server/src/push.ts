import webpush from 'web-push';
import { getSetting, setSetting, type Db } from './db.ts';
import type { FcmSender, FcmTarget } from './fcm.ts';

export interface PushSubscriptionJson {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export type GardenPush =
  | { kind: 'frost'; placeId: string; label: string | null; date: string; min: number; crops: string[] }
  | { kind: 'water'; placeId: string; label: string | null; mm: number; rain: number }
  | { kind: 'tasks'; tasks: string[] };

/** Contenido de la notificación; la app la arma en el idioma del usuario (ver app/src/sw.ts). */
export interface PushPayload {
  type: 'alerts' | 'rain' | 'lightning' | 'test' | 'update' | 'hazard' | 'garden' | 'official' | 'volcano' | 'river' | 'outing';
  alerts?: { itemName: string; kind: string; dueDate: string | null }[];
  /** Aviso de lluvia en un lugar; `label` null = "donde estoy", y `fixAt` es de cuándo es esa ubicación. */
  rain?: { placeId: string; label: string | null; state: 'raining' | 'soon'; inMinutes: number; mm: number; fixAt: string | null; observedMmH?: number; stronger?: boolean; startsAt?: number; update?: boolean; clear?: boolean };
  /** Rayo cercano: distancia (km) y rumbo (grados desde el lugar hacia el rayo). */
  lightning?: { placeId: string; label: string | null; distanceKm: number; bearing: number; fixAt: string | null };
  /** Peligro natural cerca: sismo (USGS) o evento de GDACS, con distancia y rumbo desde el lugar. */
  hazard?: {
    placeId: string;
    label: string | null;
    fixAt: string | null;
    kind: 'quake' | 'TC' | 'FL' | 'WF' | 'VO';
    name: string;
    distanceKm: number;
    bearing: number;
    magnitude?: number;
    tsunami?: boolean;
    level?: 'Green' | 'Orange' | 'Red';
    /** Ubicaciones con reserva del inventario dentro del radio: hay que ponerla a resguardo. */
    stock?: string[];
    url: string;
  };
  /**
   * Alerta oficial de un servicio meteorológico (SMN, DMC, INUMET) que incluye un lugar del dispositivo
   * (ver official/watch.ts). El texto es el del organismo; la app solo lo muestra.
   */
  official?: {
    key: string;
    source: 'SMN' | 'DMC' | 'INUMET' | 'INMET' | 'SENAMHI_BO' | 'SENAMHI_PE' | 'SIGMET';
    senderName: string;
    event: string;
    headline: string;
    severity: 'Extreme' | 'Severe' | 'Moderate' | 'Minor' | 'Unknown';
    onset: string;
    expires: string;
    /** Incluye "donde estoy". */
    here: boolean;
    fixAt: string | null;
    /** Waypoints, reservas o canteros con nombre dentro de la zona. */
    places: string[];
    stock: string[];
    url: string;
  };
  /** Volcán que subió su nivel de alerta técnica (OAVV) cerca de un lugar (ver volcanoes/watch.ts). */
  volcano?: {
    placeId: string;
    label: string | null;
    fixAt: string | null;
    name: string;
    level: 'yellow' | 'orange' | 'red';
    distanceKm: number;
    bearing: number;
    stock?: string[];
    url: string;
    /** Organismo que da el nivel: OAVV (Argentina) o CENVUL (Perú). Sin él, OAVV. */
    source?: 'OAVV' | 'CENVUL';
  };
  /** Un río llegó al nivel de alerta o de evacuación de su estación (o bajó a aguas bajas) cerca de un lugar (ver rivers/watch.ts). */
  river?: {
    placeId: string;
    label: string | null;
    fixAt: string | null;
    station: string;
    river: string;
    state: 'attention' | 'alert' | 'evac' | 'low';
    /** Organismo del dato: ANA (Brasil). Sin él, el INA. En Brasil `attention` es «atención», `alert` «alerta» y `evac` «inundación». */
    source?: 'ANA';
    level: number;
    threshold: number;
    /** Cuándo se midió (ISO); si es un aviso anticipado, cuándo el pronóstico indica que llegará. */
    at: string;
    /** Aviso anticipado: el INA pronostica que llegará a ese nivel (`level` es la altura prevista). */
    forecast?: boolean;
    distanceKm: number;
    bearing: number;
    stock?: string[];
  };
  /** Huerta: helada (por lugar), riego (por lugar) o las tareas del día juntas (ver garden/watch.ts). */
  garden?: GardenPush;
  /** Pasó la hora límite de regreso de una salida: el texto ya viene escrito por la app en su idioma (ver outings/watch.ts). */
  outing?: { outingId: string; title: string; body: string };
  /** Actualización importante: la app muestra el texto en su idioma (ver announce.ts). */
  update?: { version: string; title: { es: string; en: string }; body: { es: string; en: string } };
}

/**
 * A dónde se manda el aviso de un dispositivo (se guarda como JSON en `devices.subscription`, sin cambiar el esquema): la suscripción de
 * Web Push de un navegador o, en la app nativa, el token de FCM. El envío elige el camino por la forma del dato.
 */
export type PushTarget = PushSubscriptionJson | FcmTarget;
export const isFcmTarget = (t: PushTarget): t is FcmTarget => typeof (t as FcmTarget).fcm === 'string';

export interface PushSender {
  publicKey: string;
  /** ¿Hay una cuenta de FCM configurada? Sin ella, los dispositivos nativos no se registran. */
  fcmEnabled?: boolean;
  /** Devuelve `false` si la suscripción ya no existe (el dispositivo desinstaló o revocó el permiso). */
  send(subscription: PushTarget, payload: PushPayload): Promise<boolean>;
}

/** Prioridad del push (RFC 8030): alta para lo que no puede esperar. */
export function urgencyOf(payload: PushPayload): 'high' | 'normal' {
  return payload.type === 'outing' || payload.type === 'hazard' || payload.type === 'official' || payload.type === 'volcano' || payload.type === 'river' || payload.type === 'lightning' || payload.type === 'rain' || payload.garden?.kind === 'frost' ? 'high' : 'normal';
}

/** Claves VAPID: se generan en el primer arranque y se guardan en la base. */
export function createPushSender(db: Db, subject: string, fcm: FcmSender | null = null): PushSender {
  let publicKey = getSetting(db, 'vapid_public');
  let privateKey = getSetting(db, 'vapid_private');
  if (!publicKey || !privateKey) {
    ({ publicKey, privateKey } = webpush.generateVAPIDKeys());
    setSetting(db, 'vapid_public', publicKey);
    setSetting(db, 'vapid_private', privateKey);
  }
  const details = { subject, publicKey, privateKey };

  return {
    publicKey,
    fcmEnabled: fcm !== null,
    async send(subscription, payload) {
      if (isFcmTarget(subscription)) {
        // Un dispositivo nativo sin FCM configurado (se quitó la cuenta): es un error de configuración, no un token vencido; no se borra el dispositivo.
        if (!fcm) throw new Error('fcm-not-configured');
        return fcm.send(subscription, payload, urgencyOf(payload));
      }
      try {
        // El contenido viaja cifrado de punta a punta (RFC 8291): el servicio push no lo puede leer.
        // Lo urgente con prioridad alta: si no, Android puede demorarlo mientras el celular está en reposo.
        await webpush.sendNotification(subscription, JSON.stringify(payload), { vapidDetails: details, TTL: 24 * 3600, urgency: urgencyOf(payload) });
        return true;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) return false;
        throw err;
      }
    },
  };
}
