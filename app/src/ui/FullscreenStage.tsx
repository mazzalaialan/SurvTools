import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Maximize2, Minimize2 } from 'lucide-react';
import { pushBack } from './backStack';

interface Props extends HTMLAttributes<HTMLDivElement> {
  /** Datos superpuestos que se muestran solo en pantalla completa. */
  overlay?: ReactNode;
  children: ReactNode;
}

/**
 * Contenedor con modo pantalla completa (para la realidad aumentada). Usa la
 * API de pantalla completa del navegador; si no está o la rechaza, ocupa toda
 * la ventana de la app igual.
 */
export function FullscreenStage({ overlay, children, className, ...rest }: Props) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [native, setNative] = useState(false);
  const [pseudo, setPseudo] = useState(false);
  const full = native || pseudo;

  useEffect(() => {
    const onChange = () => setNative(document.fullscreenElement === ref.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // En el modo de respaldo, Escape (o "atrás" en el teclado) también sale; en la app nativa, el botón «atrás» (en pantalla completa de verdad
  // el navegador ya sale con Escape).
  useEffect(() => {
    if (!full) return;
    return pushBack(() => {
      setPseudo(false);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    });
  }, [full]);

  useEffect(() => {
    if (!pseudo) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPseudo(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pseudo]);

  // Al salir de la pantalla (cambio de ruta) no queda nada en pantalla completa.
  useEffect(
    () => () => {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    },
    [],
  );

  async function enter() {
    try {
      if (!ref.current?.requestFullscreen) throw new Error('unsupported');
      await ref.current.requestFullscreen({ navigationUI: 'hide' });
    } catch {
      setPseudo(true);
    }
  }

  async function exit() {
    setPseudo(false);
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
  }

  return (
    <div ref={ref} className={`${className ?? ''} fs-stage`} data-fullscreen={full} {...rest}>
      {children}
      {full && overlay && <div className="fs-overlay">{overlay}</div>}
      <button
        className="icon-btn fs-toggle"
        type="button"
        onClick={() => void (full ? exit() : enter())}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={full ? t('fullscreen.exit') : t('fullscreen.enter')}
        title={full ? t('fullscreen.exit') : t('fullscreen.enter')}
      >
        {full ? <Minimize2 size={22} /> : <Maximize2 size={22} />}
      </button>
    </div>
  );
}
