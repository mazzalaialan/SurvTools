import { useId, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  /** Identificador corto: el botón queda con `data-testid="<id>-toggle"`. */
  id: string;
  title: string;
  /** Estado que importa aunque esté cerrado (p. ej. «sin contraseña», «bloqueo: 5 min»): va en el encabezado, nunca escondido. */
  summary?: ReactNode;
  defaultOpen?: boolean;
  /** Dentro de otra tarjeta (sin tarjeta propia): un bloque con borde fino, para opciones que dependen de un ajuste de arriba. */
  inline?: boolean;
  /** `data-testid` del contenedor (se conserva el de la sección original). */
  testId?: string;
  children: ReactNode;
}

/**
 * Desplegable de una sección de uso poco frecuente (docs/DISENO.md, «Desplegables»).
 * Todo el encabezado es un botón de 48 px; el contenido sigue montado cuando está cerrado (`hidden`) para no perder lo escrito en un formulario.
 * Sin animación: aparece y desaparece al instante (respeta `prefers-reduced-motion` sin más).
 */
export function Collapsible({ id, title, summary, defaultOpen = false, inline = false, testId, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = `${useId()}-panel`;
  return (
    <section className={inline ? 'collapsible collapsible-inline' : 'card collapsible'} data-open={open} data-testid={testId}>
      <h2 className="collapsible-head">
        <button type="button" className="collapsible-toggle" aria-expanded={open} aria-controls={panelId} data-testid={`${id}-toggle`} onClick={() => setOpen(!open)}>
          <span className="collapsible-title">{title}</span>
          {summary && <span className="collapsible-summary">{summary}</span>}
          {open ? <ChevronUp size={20} aria-hidden /> : <ChevronDown size={20} aria-hidden />}
        </button>
      </h2>
      <div id={panelId} className="collapsible-body stack" hidden={!open}>
        {children}
      </div>
    </section>
  );
}
