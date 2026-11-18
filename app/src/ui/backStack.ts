/**
 * Pila de «cosas que se cierran con atrás»: diálogos, pantalla completa, etc. En el navegador se cierran con Escape; en la app nativa el botón
 * «atrás» de Android primero cierra lo de arriba de la pila y recién si no hay nada vuelve a la pantalla anterior (`core/backButton.ts`).
 */
type Handler = () => void;
const stack: Handler[] = [];

/** Registra algo que se cierra con «atrás». Devuelve la función que lo saca de la pila (al cerrarse por otro lado o al desmontarse). */
export function pushBack(handler: Handler): () => void {
  stack.push(handler);
  return () => {
    const i = stack.lastIndexOf(handler);
    if (i >= 0) stack.splice(i, 1);
  };
}

/** Cierra lo de más arriba. `true` si había algo que cerrar. */
export function handleBack(): boolean {
  const top = stack.pop();
  if (!top) return false;
  top();
  return true;
}

export const hasBackHandlers = (): boolean => stack.length > 0;
