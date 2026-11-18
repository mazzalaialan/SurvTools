import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { pushBack } from './backStack';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

/** Diálogo modal nativo (<dialog>): foco atrapado y Escape sin dependencias. */
export function Dialog({ title, onClose, children, footer }: Props) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  // El botón «atrás» de la app nativa cierra el diálogo de arriba (en el navegador es Escape, ver `onCancel`).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    const off = pushBack(() => onCloseRef.current());
    return () => {
      off();
      dialog?.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header className="dialog-header">
        <h2 id={titleId}>{title}</h2>
        <button className="icon-btn" type="button" onClick={onClose} aria-label={t('common.close')}>
          <X size={22} />
        </button>
      </header>
      <div className="dialog-body stack">{children}</div>
      {footer && <footer className="dialog-footer">{footer}</footer>}
    </dialog>
  );
}
