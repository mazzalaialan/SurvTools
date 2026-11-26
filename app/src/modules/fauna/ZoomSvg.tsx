import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Maximize2, Minus, Plus } from 'lucide-react';

type Box = [number, number, number, number];

const MAX_ZOOM = 12;
/** Píxeles que tiene que moverse el dedo para que cuente como arrastre y no como toque (el toque elige una provincia). */
const DRAG_PX = 6;

/**
 * Mapa SVG con zoom y desplazamiento: rueda del mouse, pellizco con dos dedos, arrastre, doble toque y botones + / − / encuadrar.
 * Cambia el `viewBox` (no escala con CSS), así los bordes siguen finos. Un arrastre no dispara el clic de lo que está debajo.
 */
export function ZoomSvg({ viewBox, label, children, testId }: { viewBox: Box; label: string; children: ReactNode; testId?: string }) {
  const { t } = useTranslation();
  const ref = useRef<SVGSVGElement>(null);
  const [vb, setVb] = useState<Box>(viewBox);
  const base = useRef(viewBox);
  const key = viewBox.join(',');
  // Otro mapa (otra provincia): vuelve al encuadre completo.
  useEffect(() => {
    base.current = viewBox;
    setVb(viewBox);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  /** Acerca o aleja `f` veces alrededor del punto (cx, cy) en coordenadas del mapa, sin salirse de los límites. */
  const zoomAt = (f: number, cx: number, cy: number) =>
    setVb(([x, y, w, h]) => {
      const [bx, by, bw, bh] = base.current;
      const nw = Math.min(bw, Math.max(bw / MAX_ZOOM, w / f));
      const nh = (nw * h) / w;
      return clamp([cx - ((cx - x) * nw) / w, cy - ((cy - y) * nh) / h, nw, nh], [bx, by, bw, bh]);
    });
  /** Punto de la pantalla → coordenadas del mapa. */
  const toMap = (clientX: number, clientY: number, box = vb): [number, number] => {
    const r = ref.current!.getBoundingClientRect();
    return [box[0] + ((clientX - r.left) / r.width) * box[2], box[1] + ((clientY - r.top) / r.height) * box[3]];
  };

  // La rueda necesita un listener no pasivo para que la página no se desplace mientras se hace zoom.
  const vbRef = useRef(vb);
  vbRef.current = vb;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const [cx, cy] = toMap(e.clientX, e.clientY, vbRef.current);
      zoomAt(e.deltaY < 0 ? 1.25 : 0.8, cx, cy);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(0);
  const lastTap = useRef(0);
  const pinch = useRef<number | null>(null);

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) moved.current = 0;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = Math.hypot(a!.x - b!.x, a!.y - b!.y);
    }
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, cur);
    const r = ref.current!.getBoundingClientRect();
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const [cx, cy] = toMap((a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
      zoomAt(d / pinch.current, cx, cy);
      pinch.current = d;
      moved.current += DRAG_PX;
      return;
    }
    const dx = cur.x - prev.x;
    const dy = cur.y - prev.y;
    moved.current += Math.abs(dx) + Math.abs(dy);
    if (moved.current < DRAG_PX) return;
    ref.current!.setPointerCapture?.(e.pointerId);
    setVb(([x, y, w, h]) => clamp([x - (dx / r.width) * w, y - (dy / r.height) * h, w, h], base.current));
  };
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    // Doble toque: acerca donde se tocó.
    if (moved.current < DRAG_PX && e.pointerType === 'touch') {
      const now = Date.now();
      if (now - lastTap.current < 300) {
        const [cx, cy] = toMap(e.clientX, e.clientY);
        zoomAt(2, cx, cy);
        lastTap.current = 0;
      } else lastTap.current = now;
    }
  };
  // Un arrastre o un pellizco no cuentan como toque sobre una provincia.
  const onClickCapture = (e: React.MouseEvent) => {
    if (moved.current >= DRAG_PX) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  const center = (): [number, number] => [vb[0] + vb[2] / 2, vb[1] + vb[3] / 2];
  const zoomed = vb[2] < base.current[2] - 0.5;
  return (
    <div className="zoom-svg" data-testid={testId}>
      <svg
        ref={ref}
        viewBox={vb.map((n) => n.toFixed(1)).join(' ')}
        role="img"
        aria-label={label}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={onClickCapture}
        onDoubleClick={(e) => {
          const [cx, cy] = toMap(e.clientX, e.clientY);
          zoomAt(2, cx, cy);
        }}
      >
        {children}
      </svg>
      <div className="zoom-svg-controls">
        <button type="button" className="icon-btn" aria-label={t('fauna.zoom.in')} onClick={() => zoomAt(1.6, ...center())} data-testid="zoom-in">
          <Plus size={18} aria-hidden />
        </button>
        <button type="button" className="icon-btn" aria-label={t('fauna.zoom.out')} onClick={() => zoomAt(1 / 1.6, ...center())} disabled={!zoomed}>
          <Minus size={18} aria-hidden />
        </button>
        <button type="button" className="icon-btn" aria-label={t('fauna.zoom.reset')} onClick={() => setVb(base.current)} disabled={!zoomed}>
          <Maximize2 size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
}

/** Que el encuadre no se salga del mapa completo. */
function clamp([x, y, w, h]: Box, [bx, by, bw, bh]: Box): Box {
  return [Math.min(Math.max(x, bx), bx + bw - w), Math.min(Math.max(y, by), by + bh - h), w, h];
}
