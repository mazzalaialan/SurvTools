import { describe, expect, it } from 'vitest';
import { clampView, FULL_VIEW, MAX_ZOOM, panView, tapAction, viewRect, zoomAround, type Box } from './countryMapView';

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
