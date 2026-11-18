import { describe, expect, it } from 'vitest';
import { clampView, FULL_VIEW, MAX_ZOOM, panView, tapAction, viewForPinch, viewRect, zoomAround, type Box } from './countryMapView';

const box: Box = { x: 0, y: 0, w: 1000, h: 2000 };

describe('vista del mapa', () => {
  it('con el mapa entero se ve todo', () => {
    expect(viewRect(box, FULL_VIEW(box))).toEqual(box);
  });
  it('al acercar, el punto bajo el dedo no se corre', () => {
    const v = zoomAround(box, FULL_VIEW(box), 4, 250, 500);
    const r = viewRect(box, v);
    // El punto (250, 500) estaba en el cuarto superior izquierdo; sigue en la misma posición relativa del rectángulo visible.
    expect((250 - r.x) / r.w).toBeCloseTo(0.25, 5);
    expect((500 - r.y) / r.h).toBeCloseTo(0.25, 5);
    expect(v.zoom).toBe(4);
  });
  it('no se acerca más del máximo ni se aleja más del mapa entero', () => {
    expect(zoomAround(box, FULL_VIEW(box), 1000, 500, 1000).zoom).toBe(MAX_ZOOM);
    expect(zoomAround(box, FULL_VIEW(box), 0.01, 500, 1000).zoom).toBe(1);
  });
  it('al correr la vista no se sale del mapa', () => {
    const near = zoomAround(box, FULL_VIEW(box), 4, 500, 1000);
    const moved = panView(box, near, -99999, 99999);
    const r = viewRect(box, moved);
    expect(r.x).toBeCloseTo(0, 5);
    expect(r.y + r.h).toBeCloseTo(2000, 5);
  });
  it('con el mapa entero no hay a dónde correrse', () => {
    expect(panView(box, FULL_VIEW(box), 300, -300)).toEqual(FULL_VIEW(box));
    expect(clampView(box, { cx: -50, cy: 9999, zoom: 1 })).toEqual(FULL_VIEW(box));
  });
});

describe('qué hace tocar un país', () => {
  const base = { marked: null as string | null, tapped: 'PY', state: 'missing' as const, isCurrent: false, busy: false };
  it('el primer toque lo marca, aunque ya sea el país activo', () => {
    expect(tapAction(base)).toBe('mark');
    expect(tapAction({ ...base, tapped: 'AR', isCurrent: true, state: 'ready' as never })).toBe('mark');
  });
  it('el segundo lo baja si falta, lo actualiza si hay versión nueva', () => {
    expect(tapAction({ ...base, marked: 'PY' })).toBe('download');
    expect(tapAction({ ...base, marked: 'PY', state: 'outdated' })).toBe('update');
  });
  it('con los datos al día, el siguiente lo pone como país activo; si ya lo es, no hace nada', () => {
    expect(tapAction({ ...base, marked: 'PY', state: 'ready' as never })).toBe('use');
    expect(tapAction({ ...base, marked: 'PY', state: 'ready' as never, isCurrent: true })).toBe('none');
  });
  it('mientras baja, o sin saber todavía el estado, los toques no hacen nada', () => {
    expect(tapAction({ ...base, marked: 'PY', busy: true })).toBe('none');
    expect(tapAction({ ...base, marked: 'PY', state: undefined })).toBe('none');
  });
});

describe('pellizco', () => {
  const rect = { left: 10, top: 20, width: 500, height: 1000 };
  /** Punto del mapa que queda bajo un píxel de pantalla con esa vista. */
  const under = (v: ReturnType<typeof viewForPinch>, px: { x: number; y: number }) => {
    const r = viewRect(box, v);
    const scale = Math.min(rect.width / r.w, rect.height / r.h);
    const offX = (rect.width - r.w * scale) / 2;
    const offY = (rect.height - r.h * scale) / 2;
    return { x: r.x + (px.x - rect.left - offX) / scale, y: r.y + (px.y - rect.top - offY) / scale };
  };
  it('el punto bajo el medio de los dedos no se corre al acercar', () => {
    const anchor = { x: 300, y: 700 };
    const mid = { x: 200, y: 400 };
    const v = viewForPinch(box, rect, anchor, mid, 3);
    expect(v.zoom).toBe(3);
    const p = under(v, mid);
    expect(p.x).toBeCloseTo(anchor.x, 3);
    expect(p.y).toBeCloseTo(anchor.y, 3);
  });
  it('si los dedos se mueven mientras pellizcan, el mapa los acompaña', () => {
    const anchor = { x: 500, y: 1000 };
    const a = viewForPinch(box, rect, anchor, { x: 260, y: 520 }, 2);
    const b = viewForPinch(box, rect, anchor, { x: 300, y: 560 }, 2);
    expect(b.cx).not.toBeCloseTo(a.cx, 3);
    const p = under(b, { x: 300, y: 560 });
    expect(p.x).toBeCloseTo(anchor.x, 3);
  });
  it('no pasa el acercamiento máximo ni se sale del mapa', () => {
    const v = viewForPinch(box, rect, { x: 0, y: 0 }, { x: 260, y: 520 }, 999);
    expect(v.zoom).toBe(MAX_ZOOM);
    const r = viewRect(box, v);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
  });
});
