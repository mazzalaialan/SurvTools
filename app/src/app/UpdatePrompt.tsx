import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRegisterSW } from 'virtual:pwa-register/react';
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

export function UpdatePrompt({ visible }: { visible: boolean }) {
  const { t, i18n } = useTranslation();
  const [downloading, setDownloading] = useState(false);
  const [later, setLater] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [started, setStarted] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
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

  // También se muestra si el service worker avisó que hay algo para bajar (la página pudo recargarse con la actualización ya esperando).
  if (!visible || later || (!needRefresh && !downloading && !pending && !started)) return null;

  const download = () => {
    setStarted(true);
    channelRef.current?.postMessage({ type: 'UPDATE_START' });
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
      ) : (
        <span>{t('pwa.downloading')}</span>
      )}
      {needRefresh && (
        <button className="btn btn-primary" type="button" onClick={() => void updateServiceWorker(true)}>
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
