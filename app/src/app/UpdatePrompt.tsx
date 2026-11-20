import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { isNativePlatform } from '@/core/platform';
import { removeStaleRegistrations } from '@/core/portable/webUpdateRescue';
import { formatBytes, networkInfo } from '@/modules/emergency/countryDownload';

/**
 * Avisa cuando hay una versión nueva; nunca recarga sola (podría interrumpir una carga de datos).
 * Está a nivel de toda la app: se ve también en el login, donde conviene actualizar porque
 * recargar bloquea la bóveda y adentro obliga a volver a entrar.
 *
 * - Apenas arranca, el service worker busca si hay versión nueva. Si hay algo para bajar, el service worker nuevo NO lo baja solo:
 *   avisa cuánto pesa («hasta X MB», solo lo que cambió) y espera a que se toque «Descargar ahora» (src/sw.ts, `onInstall`). La versión vieja
 *   sigue funcionando mientras tanto. Al confirmar se ve una barra con lo bajado y, al terminar, aparece «Actualizar».
 * - «Más tarde» la oculta hasta cerrar la app: al volver a abrirla pregunta otra vez.
 */
/** Cuánto se espera un avance de la descarga antes de ofrecer reintentar. */
export const STALL_MS = 10_000;

interface Pending {
  bytes: number | null;
  files: number;
}
interface Progress {
  done: number;
  bytes: number | null;
  filesDone: number;
  files: number;
}

/**
 * En la app nativa (Capacitor) no hay service worker: los archivos de la app van dentro del paquete y las versiones nuevas llegan por la
 * tienda (Google Play o App Store). El aviso «hay una versión nueva, bajar X MB» y el registro del service worker son solo de la web, y por
 * eso viven en un componente aparte (el registro ocurre al montar `useRegisterSW`: en la nativa no se monta). La descarga diferida de datos
 * (paquetes de países, mapas, libros) no depende de esto y se mantiene.
 */
export function UpdatePrompt({ visible }: { visible: boolean }) {
  return isNativePlatform() ? null : <WebUpdatePrompt visible={visible} />;
}

function WebUpdatePrompt({ visible }: { visible: boolean }) {
  const { t, i18n } = useTranslation();
  const [downloading, setDownloading] = useState(false);
  const [later, setLater] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [started, setStarted] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  /** Tocó «Descargar ahora» y pasaron unos segundos sin que llegue ningún avance: se ofrece reintentar. */
  const [stalled, setStalled] = useState(false);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      registrationRef.current = registration;
      // Un service worker de un nombre de sitio viejo (/PrepperApp/) puede seguir registrado: se da de baja.
      void removeStaleRegistrations(registration.scope);
      // Solo es "versión nueva" si ya hay una funcionando (la primera instalación no se avisa).
      const watch = (worker: ServiceWorker | null) => {
        if (!worker || !navigator.serviceWorker.controller) return;
        setDownloading(true);
        worker.addEventListener('statechange', () => {
          if (worker.state === 'redundant') {
            setDownloading(false);
            setPending(null);
            setStarted(false);
            setProgress(null);
          }
        });
      };
      watch(registration.installing);
      registration.addEventListener('updatefound', () => watch(registration.installing));
      // Buscar ya, sin esperar a que el navegador lo haga por su cuenta.
      void registration.update().catch(() => undefined);
    },
  });

  // Mensajes del service worker nuevo: qué hay para bajar y cómo va la descarga.
  useEffect(() => {
    // Canal con el service worker nuevo (BroadcastChannel: un worker que se está instalando no recibe de forma confiable los postMessage de la página).
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel('vikarg-update');
    channelRef.current = channel;
    const onMessage = (event: MessageEvent) => {
      const m = event.data as { type?: string; bytes?: number | null; done?: number; files?: number; filesDone?: number } | undefined;
      if (m?.type === 'UPDATE_PENDING') {
        setPending({ bytes: m.bytes ?? null, files: m.files ?? 0 });
        // Le avisa al service worker que esta versión de la app sabe preguntar (si ninguna responde, baja solo, como antes).
        channel.postMessage({ type: 'UPDATE_ACK' });
      } else if (m?.type === 'UPDATE_PROGRESS') {
        setStarted(true);
        setProgress({ done: m.done ?? 0, bytes: m.bytes ?? null, filesDone: m.filesDone ?? 0, files: m.files ?? 0 });
      }
    };
    channel.onmessage = onMessage;
    // Si la actualización ya estaba esperando o bajando (la página se recargó), el service worker vuelve a avisar.
    channel.postMessage({ type: 'UPDATE_QUERY' });
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, []);

  // Si se tocó «Descargar ahora» y no llega ningún avance (el service worker no recibió el mensaje o se detuvo), se ofrece reintentar.
  useEffect(() => {
    if (!started || progress || needRefresh) {
      setStalled(false);
      return;
    }
    const timer = window.setTimeout(() => setStalled(true), STALL_MS);
    return () => window.clearTimeout(timer);
  }, [started, progress, needRefresh]);

  // También se muestra si el service worker avisó que hay algo para bajar (la página pudo recargarse con la actualización ya esperando).
  if (!visible || later || (!needRefresh && !downloading && !pending && !started)) return null;

  const download = () => {
    setStarted(true);
    channelRef.current?.postMessage({ type: 'UPDATE_START' });
  };
  /** Vuelve a buscar la versión nueva y a pedir la descarga (el service worker pudo no enterarse del primer pedido). */
  const retry = () => {
    setStalled(false);
    void registrationRef.current?.update().catch(() => undefined);
    channelRef.current?.postMessage({ type: 'UPDATE_QUERY' });
    channelRef.current?.postMessage({ type: 'UPDATE_START' });
  };
  /**
   * Activa la versión nueva y recarga la página. La recarga automática de la librería (`updateServiceWorker(true)`) depende de un evento que, cuando
   * el aviso aparece con la app YA abierta, a veces no llega: la versión nueva se activaba pero la pantalla seguía igual y parecía que el botón no
   * hacía nada (visto en un Motorola). Por eso se recarga también al cambiar el service worker que controla la página y, por si ese evento tampoco
   * llega, unos segundos después de pedir el cambio; una sola vez.
   */
  const activate = () => {
    let done = false;
    const reload = () => {
      if (done) return;
      done = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', reload, { once: true });
    window.setTimeout(reload, 4000);
    void updateServiceWorker(true);
  };
  const size = (b: number) => formatBytes(b, i18n.language);
  const asking = !needRefresh && pending && !started;
  const cellular = networkInfo().kind === 'cellular';

  return (
    <div className="toast" role="status" data-testid="update-prompt">
      {needRefresh ? (
        <span>{t('pwa.updateAvailable')}</span>
      ) : asking ? (
        <span data-testid="update-pending">
          {pending.bytes !== null ? t('pwa.updatePending', { size: size(pending.bytes) }) : t('pwa.updatePendingFiles', { count: pending.files })}
          {cellular && ` ${t('pwa.mobileData')}`}
        </span>
      ) : started && progress ? (
        <span className="stack" style={{ gap: 4, minWidth: 220 }} data-testid="update-progress">
          <span>
            {progress.bytes !== null
              ? t('pwa.progress', { done: size(progress.done), total: size(progress.bytes) })
              : t('pwa.progressFiles', { done: progress.filesDone, total: progress.files })}
          </span>
          <progress max={progress.bytes ?? progress.files} value={progress.bytes !== null ? progress.done : progress.filesDone} aria-label={t('pwa.downloading')} />
        </span>
      ) : stalled ? (
        <span data-testid="update-stalled">{t('pwa.stalled')}</span>
      ) : (
        <span>{t('pwa.downloading')}</span>
      )}
      {stalled && !needRefresh && (
        <button className="btn btn-primary" type="button" onClick={retry} data-testid="update-retry">
          {t('pwa.retry')}
        </button>
      )}
      {needRefresh && (
        <button className="btn btn-primary" type="button" onClick={activate}>
          {t('pwa.update')}
        </button>
      )}
      {asking && (
        <button className="btn btn-primary" type="button" onClick={download} data-testid="update-download">
          {t('pwa.download')}
        </button>
      )}
      <button className="btn" type="button" onClick={() => setLater(true)} data-testid="update-later">
        {t('pwa.later')}
      </button>
    </div>
  );
}
