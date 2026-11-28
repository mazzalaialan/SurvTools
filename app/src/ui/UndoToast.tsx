import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { create } from 'zustand';

/**
 * Aviso al pie con «Deshacer», para acciones de un toque que es fácil errar con guantes (anotar huevos, un nacimiento, borrar un
 * registro). Dura 8 s; uno nuevo reemplaza al anterior. Se monta con <UndoToastHost /> en la pantalla que lo usa.
 */
interface UndoState {
  current: { id: number; message: string; undo: () => void | Promise<void> } | null;
  show: (message: string, undo: () => void | Promise<void>) => void;
  dismiss: () => void;
}
let seq = 0;
export const useUndoToast = create<UndoState>((set) => ({
  current: null,
  show: (message, undo) => set({ current: { id: ++seq, message, undo } }),
  dismiss: () => set({ current: null }),
}));

export function UndoToastHost() {
  const { t } = useTranslation();
  const { current, dismiss } = useUndoToast();
  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(dismiss, 8000);
    return () => clearTimeout(timer);
  }, [current, dismiss]);
  useEffect(() => dismiss, [dismiss]);
  if (!current) return null;
  return (
    <div className="undo-toast" role="status" data-testid="undo-toast">
      <span>{current.message}</span>
      <button
        type="button"
        className="btn"
        onClick={() => {
          void current.undo();
          dismiss();
        }}
        data-testid="undo-toast-undo"
      >
        {t('common.undo')}
      </button>
    </div>
  );
}
