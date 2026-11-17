import type { LatLon } from '@/core/geo/geo';
import { formatUtm, fromUtm, toUtm } from '@/core/geo/utm';
import { LOGO_MM, loadLogo } from '@/core/pdf/brand';
import { jpegPagePdf } from '@/core/pdf/jpegPdf';
import { planSheet, type SheetPlan, type TopoLeg, type TopoSheetInput } from './plan';
import { renderBaseMap, type BaseMap } from './renderBase';
import {
  contourInterval,
  DEFAULT_DPI,
  gridLabel,
  gridLines,
  edgeTicks,
  gridStepM,
  latLonStepDeg,
  MAX_COORD_POINTS,
  MM_PER_INCH,
  scaleBar,
  scaleEquivalence,
  zoomForScale,
  type Rect,
} from './geometry';

const PX_PER_MM = DEFAULT_DPI / MM_PER_INCH;
const mm = (v: number) => v * PX_PER_MM;

/** Grados y minutos (y segundos si hace falta) de una coordenada: 41°08′ o 71°27′30″. */
const dm = (deg: number, seconds = false) => {
  const total = Math.round(Math.abs(deg) * (seconds ? 3600 : 60));
  const d = Math.floor(total / (seconds ? 3600 : 60));
  const rest = total - d * (seconds ? 3600 : 60);
  const m = seconds ? Math.floor(rest / 60) : rest;
  const sec = seconds ? rest % 60 : 0;
  return `${d}°${String(m).padStart(2, '0')}′${seconds ? `${String(sec).padStart(2, '0')}″` : ''}`;
};
const fmtDist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(2).replace('.', ',')} km` : `${Math.round(m)} m`);

type Ctx = CanvasRenderingContext2D;
const FONT = 'system-ui, "Segoe UI", Roboto, Arial, sans-serif';

interface TextOpts {
  size: number;
  bold?: boolean;
  color?: string;
  align?: CanvasTextAlign;
  base?: CanvasTextBaseline;
  halo?: string;
}

/** Nombre de la app que se imprime en la hoja (la hoja sale siempre en español). */
const APP_NAME = 'Herramientas de Supervivencia por VikArg';

function text(ctx: Ctx, s: string, x: number, y: number, o: TextOpts) {
  ctx.font = `${o.bold ? '700 ' : ''}${mm(o.size)}px ${FONT}`;
  ctx.textAlign = o.align ?? 'left';
  ctx.textBaseline = o.base ?? 'alphabetic';
  if (o.halo) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = mm(o.size * 0.35);
    ctx.strokeStyle = o.halo;
    ctx.strokeText(s, x, y);
  }
  ctx.fillStyle = o.color ?? '#111';
  ctx.fillText(s, x, y);
}

/** Texto girado 90° (se lee de abajo hacia arriba); el cuerpo de las letras queda a la izquierda de la línea de base `x`. */
function vtext(ctx: Ctx, s: string, x: number, y: number, o: TextOpts) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 2);
  text(ctx, s, 0, 0, o);
  ctx.restore();
}

const rectPx = (r: Rect): Rect => ({ x: mm(r.x), y: mm(r.y), w: mm(r.w), h: mm(r.h) });

/** Arma la hoja completa sobre el mapa ya dibujado. */
export function drawSheet(base: BaseMap, plan: SheetPlan, input: TopoSheetInput, logo?: CanvasImageSource | null): HTMLCanvasElement {
  const { layout, scale } = plan;
  if (!scale) throw new Error('NO_FIT');
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(mm(layout.paper.w));
  canvas.height = Math.round(mm(layout.paper.h));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const map = rectPx(layout.map);
  const sx = map.w / base.canvas.width;
  const sy = map.h / base.canvas.height;
  const toSheet = (p: { x: number; y: number }) => ({ x: map.x + p.x * sx, y: map.y + p.y * sy });
  const proj = (p: LatLon) => toSheet(base.project(p));
  const unproj = (x: number, y: number) => base.unproject((x - map.x) / sx, (y - map.y) / sy);

  // Mapa
  ctx.save();
  ctx.beginPath();
  ctx.rect(map.x, map.y, map.w, map.h);
  ctx.clip();
  ctx.drawImage(base.canvas, map.x, map.y, map.w, map.h);

  // Cuadrícula UTM: líneas rectas en UTM, dibujadas punto a punto sobre el mapa.
  const corners = [unproj(map.x, map.y), unproj(map.x + map.w, map.y), unproj(map.x, map.y + map.h), unproj(map.x + map.w, map.y + map.h)].map((c) => toUtm(c, plan.zone));
  const minE = Math.min(...corners.map((c) => c.easting));
  const maxE = Math.max(...corners.map((c) => c.easting));
  const minN = Math.min(...corners.map((c) => c.northing));
  const maxN = Math.max(...corners.map((c) => c.northing));
  const step = gridStepM(scale);
  const grid = gridLines(minE, maxE, minN, maxN, step);
  const hemi = plan.center.lat < 0 ? 'S' : 'N';
  const toXY = (e: number, n: number) => proj(fromUtm({ zone: plan.zone, hemisphere: hemi, easting: e, northing: n }));
  const GRID_COLOR = '#1d4e89';
  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = mm(0.18);
  const line = (pts: { x: number; y: number }[]) => {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
  };
  for (const e of grid.eastings) {
    const pts: { x: number; y: number }[] = [];
    for (let n = minN - 2000; n <= maxN + 2000; n += 250) pts.push(toXY(e, n));
    line(pts);
  }
  for (const n of grid.northings) {
    const pts: { x: number; y: number }[] = [];
    for (let e = minE - 2000; e <= maxE + 2000; e += 250) pts.push(toXY(e, n));
    line(pts);
  }
  // Ruta y waypoints
  if (input.line.length > 1) {
    const pts = input.line.map(proj);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = mm(1.5);
    line(pts);
    ctx.strokeStyle = '#d62828';
    ctx.lineWidth = mm(0.75);
    line(pts);
  }
  // Los círculos primero; los nombres se ubican en el primer lugar libre (derecha, izquierda, arriba o abajo) sin pisar
  // otro nombre ni otro círculo.
  const circles = input.points.map((p) => proj(p));
  const taken: Rect[] = circles.map((c) => ({ x: c.x - mm(2.8), y: c.y - mm(2.8), w: mm(5.6), h: mm(5.6) }));
  input.points.forEach((p, i) => {
    const c = circles[i]!;
    ctx.beginPath();
    ctx.arc(c.x, c.y, mm(2.3), 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.lineWidth = mm(0.45);
    ctx.strokeStyle = '#d62828';
    ctx.stroke();
    text(ctx, String(p.n), c.x, c.y, { size: 2.9, bold: true, color: '#d62828', align: 'center', base: 'middle' });
  });
  const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  input.points.forEach((p, i) => {
    if (!p.name) return;
    const c = circles[i]!;
    ctx.font = `700 ${mm(3)}px ${FONT}`;
    const w = ctx.measureText(p.name).width;
    const h = mm(3.6);
    const spots: Rect[] = [
      { x: c.x + mm(3.2), y: c.y - mm(4.6), w, h },
      { x: c.x + mm(3.2), y: c.y + mm(1), w, h },
      { x: c.x - mm(3.2) - w, y: c.y - mm(4.6), w, h },
      { x: c.x - mm(3.2) - w, y: c.y + mm(1), w, h },
      { x: c.x - w / 2, y: c.y - mm(8), w, h },
      { x: c.x - w / 2, y: c.y + mm(3.6), w, h },
    ];
    const free = (r: Rect) => r.x >= map.x && r.x + r.w <= map.x + map.w && r.y >= map.y && r.y + r.h <= map.y + map.h && !taken.some((t) => overlaps({ x: r.x - mm(0.5), y: r.y - mm(0.5), w: r.w + mm(1), h: r.h + mm(1) }, t));
    const spot = spots.find(free) ?? spots[0]!;
    taken.push(spot);
    text(ctx, p.name, spot.x, spot.y + mm(2.9), { size: 3, bold: true, color: '#111', halo: 'rgba(255,255,255,0.92)' });
  });
  ctx.restore();

  // Marco del mapa
  ctx.strokeStyle = '#111';
  ctx.lineWidth = mm(0.4);
  ctx.strokeRect(map.x, map.y, map.w, map.h);

  // Valores de la cuadrícula UTM afuera del marco, con la marca donde cada línea lo cruza: los de este arriba y abajo
  // (horizontales); los de norte a los costados (en vertical). El valor va completo, en metros.
  const grp = (v: number) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009');
  const midN = (minN + maxN) / 2;
  const midE = (minE + maxE) / 2;
  const UT = { size: 2.7, bold: true, color: GRID_COLOR } as const;
  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = mm(0.3);
  for (const e of grid.eastings) {
    const x = toXY(e, midN).x;
    if (x < map.x + mm(6) || x > map.x + map.w - mm(6)) continue;
    ctx.beginPath();
    ctx.moveTo(x, map.y - mm(1.8));
    ctx.lineTo(x, map.y);
    ctx.moveTo(x, map.y + map.h);
    ctx.lineTo(x, map.y + map.h + mm(1.8));
    ctx.stroke();
    text(ctx, grp(e), x, map.y - mm(2.4), { ...UT, align: 'center', base: 'bottom' });
    text(ctx, grp(e), x, map.y + map.h + mm(2.4), { ...UT, align: 'center', base: 'top' });
  }
  for (const n of grid.northings) {
    const y = toXY(midE, n).y;
    if (y < map.y + mm(6) || y > map.y + map.h - mm(6)) continue;
    ctx.beginPath();
    ctx.moveTo(map.x - mm(1.8), y);
    ctx.lineTo(map.x, y);
    ctx.moveTo(map.x + map.w, y);
    ctx.lineTo(map.x + map.w + mm(1.8), y);
    ctx.stroke();
    vtext(ctx, grp(n), map.x - mm(2.4), y, { ...UT, align: 'center' });
    vtext(ctx, grp(n), map.x + map.w + mm(5.2), y, { ...UT, align: 'center' });
  }
  text(ctx, 'E (m)', map.x - mm(1), map.y - mm(5), { size: 2.2, color: GRID_COLOR, align: 'right', base: 'bottom' });
  vtext(ctx, 'N (m)', map.x + map.w + mm(8), map.y + mm(1), { size: 2.2, color: GRID_COLOR, align: 'right' });

  // Marcas de latitud y longitud (opcionales), hacia adentro del marco: con el mapa girado quedan inclinadas
  if (input.latLonTicks) {
    const ll = latLonStepDeg(scale);
    const secs = ll < 1 / 60 - 1e-9;
    const N = 240;
    const along = (from: { x: number; y: number }, to: { x: number; y: number }, key: 'lat' | 'lon', axis: 'x' | 'y') =>
      Array.from({ length: N + 1 }, (_, i) => {
        const x = from.x + ((to.x - from.x) * i) / N;
        const y = from.y + ((to.y - from.y) * i) / N;
        return { pos: axis === 'x' ? x : y, value: unproj(x, y)[key] };
      });
    const L = { x: map.x, y: map.y };
    const R = { x: map.x + map.w, y: map.y };
    const BL = { x: map.x, y: map.y + map.h };
    const BR = { x: map.x + map.w, y: map.y + map.h };
    const LL = { size: 2.3, color: '#111', halo: 'rgba(255,255,255,0.9)' } as const;
    ctx.strokeStyle = '#111';
    ctx.lineWidth = mm(0.3);
    const tick = (x1: number, y1: number, x2: number, y2: number) => {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };
    for (const t of edgeTicks(along(L, BL, 'lat', 'y'), ll)) {
      tick(map.x, t.pos, map.x + mm(2), t.pos);
      vtext(ctx, dm(t.value, secs), map.x + mm(5), t.pos, { ...LL, align: 'center' });
    }
    for (const t of edgeTicks(along(R, BR, 'lat', 'y'), ll)) {
      tick(map.x + map.w, t.pos, map.x + map.w - mm(2), t.pos);
      vtext(ctx, dm(t.value, secs), map.x + map.w - mm(2.6), t.pos, { ...LL, align: 'center' });
    }
    for (const t of edgeTicks(along(L, R, 'lon', 'x'), ll)) {
      tick(t.pos, map.y, t.pos, map.y + mm(2));
      text(ctx, dm(t.value, secs), t.pos, map.y + mm(5), { ...LL, align: 'center' });
    }
    for (const t of edgeTicks(along(BL, BR, 'lon', 'x'), ll)) {
      tick(t.pos, map.y + map.h, t.pos, map.y + map.h - mm(2));
      text(ctx, dm(t.value, secs), t.pos, map.y + map.h - mm(2.6), { ...LL, align: 'center' });
    }
  }

  // Título
  const h = rectPx(layout.header);
  const tx = h.x + (logo ? mm(LOGO_MM + 3) : 0);
  if (logo) ctx.drawImage(logo, h.x, h.y + mm(0.5), mm(LOGO_MM), mm(LOGO_MM));
  const scaleText = `1:${scale.toLocaleString('es-AR')}`;
  text(ctx, scaleText, h.x + h.w, h.y + mm(7), { size: 6.5, bold: true, align: 'right' });
  const titleRoom = h.x + h.w - tx - ctx.measureText(scaleText).width - mm(5);
  ctx.font = `700 ${mm(6.5)}px ${FONT}`;
  text(ctx, fit(ctx, input.title, titleRoom), tx, h.y + mm(7), { size: 6.5, bold: true });
  text(ctx, `${input.subtitle ? input.subtitle + ' · ' : ''}${input.date}${layout.detailOnly ? ' · tramos y coordenadas desde la hoja 2' : ''}`, tx, h.y + mm(12.2), { size: 3.4, color: '#444' });
  text(ctx, APP_NAME, h.x + h.w, h.y + mm(12.2), { size: 3, color: '#444', align: 'right' });

  // Si los tramos y las coordenadas no entran enteros, no se imprimen acá: van todos desde la hoja 2.
  if (!layout.detailOnly) {
    drawTable(ctx, rectPx(layout.table), input);
    if (layout.coords) drawCoords(ctx, rectPx(layout.coords), input, plan.zone, layout.orientation);
  }
  drawFooter(ctx, rectPx(layout.footer), plan, input, scale);
  return canvas;
}

/** Recorta un texto con «…» para que entre en `maxW` píxeles (con la fuente que tenga el contexto). */
function fit(ctx: Ctx, s: string, maxW: number): string {
  if (ctx.measureText(s).width <= maxW) return s;
  let t = s;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t}…`;
}

interface TableOpts {
  /** Índice del primer tramo a dibujar (hojas de detalle). */
  from?: number;
  /** Cuántos tramos como máximo (por defecto, los que entran). */
  count?: number;
  /** Siempre la tabla ancha (una línea por tramo). */
  wide?: boolean;
  /** Aviso de que el resto sigue en otra hoja. */
  moreOn?: string;
}

/** Tramos que entran en un rectángulo de tabla. */
const tableCapacity = (r: Rect, narrow: boolean) => Math.max(1, Math.floor((r.h - mm(6.2) - mm(7)) / (narrow ? mm(9.6) : mm(5.2))));

function drawTable(ctx: Ctx, r: Rect, input: TopoSheetInput, opts: TableOpts = {}) {
  const name = (n: number) => input.points.find((p) => p.n === n)?.name || `Punto ${n}`;
  const narrow = !opts.wide && r.w < mm(120);
  const headH = mm(6.2);
  ctx.fillStyle = '#e9e5da';
  ctx.fillRect(r.x, r.y, r.w, headH);
  ctx.strokeStyle = '#111';
  ctx.lineWidth = mm(0.3);
  ctx.strokeRect(r.x, r.y, r.w, r.h);
  const total = input.legs.reduce((s, l) => s + l.distanceM, 0);
  const up = input.legs.reduce((s, l) => s + (l.ascentM ?? 0), 0);
  const down = input.legs.reduce((s, l) => s + (l.descentM ?? 0), 0);
  const deg3 = (v: number | null) => (v === null ? '—' : `${String(Math.round(v) % 360).padStart(3, '0')}°`);
  const gain = (l: TopoLeg) => (l.ascentM === undefined && l.descentM === undefined ? '—' : `+${Math.round(l.ascentM ?? 0)} / −${Math.round(l.descentM ?? 0)} m`);
  const rowH = narrow ? mm(9.6) : mm(5.2);
  const maxRows = tableCapacity(r, narrow);
  const from = opts.from ?? 0;
  const legs = input.legs.slice(from, from + Math.min(maxRows, opts.count ?? maxRows));

  if (narrow) {
    // Tabla angosta (hoja horizontal): dos líneas por tramo, el nombre arriba y los datos abajo.
    text(ctx, 'Tramos: distancia · rumbo geog. y mag. · desnivel', r.x + mm(1.5), r.y + mm(4.3), { size: 3, bold: true });
    legs.forEach((leg, i) => {
      const y = r.y + headH + rowH * i;
      ctx.font = `700 ${mm(3.1)}px ${FONT}`;
      const title = fit(ctx, `${from + i + 1}.  ${name(leg.from)} → ${name(leg.to)}`, r.w - mm(3));
      text(ctx, title, r.x + mm(1.5), y + mm(4.2), { size: 3.1, bold: true });
      text(ctx, `${fmtDist(leg.distanceM)} · geog. ${deg3(leg.bearingTrueDeg)} · mag. ${deg3(leg.bearingMagDeg)} · ${gain(leg)}`, r.x + mm(1.5), y + mm(8), { size: 2.7, color: '#333' });
      ctx.strokeStyle = '#c9c4b6';
      ctx.beginPath();
      ctx.moveTo(r.x, y + rowH);
      ctx.lineTo(r.x + r.w, y + rowH);
      ctx.stroke();
    });
  } else {
    const cols = [0.06, 0.34, 0.13, 0.13, 0.13, 0.21];
    const heads = ['N.°', 'Tramo', 'Distancia', 'Rumbo geog.', 'Rumbo mag.', 'Desnivel'];
    let x = r.x;
    heads.forEach((hd, i) => {
      text(ctx, hd, x + mm(1.2), r.y + mm(4.3), { size: 3, bold: true });
      x += cols[i]! * r.w;
    });
    legs.forEach((leg, i) => {
      const y = r.y + headH + rowH * i + mm(3.8);
      ctx.font = `${mm(3)}px ${FONT}`;
      const cells = [String(from + i + 1), fit(ctx, `${name(leg.from)} → ${name(leg.to)}`, cols[1]! * r.w - mm(2.4)), fmtDist(leg.distanceM), deg3(leg.bearingTrueDeg), deg3(leg.bearingMagDeg), gain(leg)];
      let cx = r.x;
      cells.forEach((c, k) => {
        text(ctx, c, cx + mm(1.2), y, { size: 3 });
        cx += cols[k]! * r.w;
      });
      ctx.strokeStyle = '#c9c4b6';
      ctx.beginPath();
      ctx.moveTo(r.x, y + mm(1.4));
      ctx.lineTo(r.x + r.w, y + mm(1.4));
      ctx.stroke();
    });
  }
  const more = legs.length < input.legs.length ? (from === 0 && opts.moreOn ? ` · ${opts.moreOn}` : ` (tramos ${from + 1} a ${from + legs.length} de ${input.legs.length})`) : '';
  text(ctx, `Total: ${fmtDist(total)}${up || down ? ` · +${Math.round(up)} / −${Math.round(down)} m` : ''}${more}`, r.x + mm(1.5), r.y + r.h - mm(1.8), { size: 3, bold: true });
}

/** Lista de los puntos con sus coordenadas UTM (para cargarlas en un GPS o dictarlas por radio). */
/** Puntos que entran en el rectángulo de la lista de coordenadas. */
const coordsCapacity = (r: Rect, cols: number) => Math.max(1, Math.floor((r.h - mm(5.4)) / mm(4.4))) * cols;

function drawCoords(ctx: Ctx, r: Rect, input: TopoSheetInput, zone: number, orientation: 'portrait' | 'landscape', opts: { from?: number; count?: number; moreOn?: string; cols?: number } = {}) {
  const grp = (v: number) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009');
  ctx.strokeStyle = '#111';
  ctx.lineWidth = mm(0.3);
  ctx.strokeRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = '#e9e5da';
  ctx.fillRect(r.x, r.y, r.w, mm(5.4));
  const hemi = input.points[0] && input.points[0].lat < 0 ? 'Sur' : 'Norte';
  const head = r.w < mm(120) ? `Coordenadas UTM · zona ${zone} ${hemi} · m` : `Coordenadas UTM de los puntos · zona ${zone} ${hemi} · WGS84 · metros`;
  ctx.font = `700 ${mm(2.8)}px ${FONT}`;
  text(ctx, fit(ctx, head, r.w - mm(3)), r.x + mm(1.5), r.y + mm(3.9), { size: 2.8, bold: true });
  const cols = opts.cols ?? (orientation === 'portrait' ? 2 : 1);
  const from = opts.from ?? 0;
  const list = input.points.slice(from, from + (opts.count ?? Math.min(MAX_COORD_POINTS, coordsCapacity(r, cols))));
  const perCol = Math.ceil(list.length / cols);
  const colW = r.w / cols;
  list.forEach((p, i) => {
    const col = Math.floor(i / perCol);
    const row = i % perCol;
    const x = r.x + col * colW + mm(1.5);
    const y = r.y + mm(5.4) + mm(4.4) * (row + 1) - mm(1);
    const u = toUtm(p, zone);
    const coords = `${grp(u.easting)} E · ${grp(u.northing)} N`;
    ctx.font = `${mm(2.6)}px ${FONT}`;
    const cw = ctx.measureText(coords).width;
    ctx.font = `700 ${mm(2.6)}px ${FONT}`;
    const label = fit(ctx, `${p.n}. ${p.name || `Punto ${p.n}`}`, colW - mm(4) - cw);
    text(ctx, label, x, y, { size: 2.6, bold: true });
    text(ctx, coords, x + colW - mm(3), y, { size: 2.6, align: 'right' });
  });
  if (list.length < input.points.length) text(ctx, from === 0 && opts.moreOn ? `(${opts.moreOn})` : `(puntos ${from + 1} a ${from + list.length} de ${input.points.length})`, r.x + r.w - mm(1.5), r.y + r.h - mm(0.8), { size: 2.2, color: '#444', align: 'right' });
}

function drawFooter(ctx: Ctx, r: Rect, plan: SheetPlan, input: TopoSheetInput, scale: number) {
  ctx.strokeStyle = '#111';
  ctx.lineWidth = mm(0.3);
  ctx.strokeRect(r.x, r.y, r.w, r.h);
  const zoom = zoomForScale(plan.center.lat, scale);
  const ci = contourInterval(zoom);
  const left = r.x + mm(2.5);

  // Columna izquierda: escala numérica, equivalencia y barra gráfica
  text(ctx, `Escala 1:${scale.toLocaleString('es-AR')}`, left, r.y + mm(5.6), { size: 4.6, bold: true });
  text(ctx, scaleEquivalence(scale), left, r.y + mm(9.8), { size: 3 });
  const bar = scaleBar(scale);
  const by = r.y + mm(13);
  const bw = mm(bar.mm);
  const bh = mm(1.6);
  const parts = 4;
  for (let i = 0; i < parts; i++) {
    ctx.fillStyle = i % 2 ? '#fff' : '#111';
    ctx.fillRect(left + (bw / parts) * i, by, bw / parts, bh);
  }
  ctx.strokeStyle = '#111';
  ctx.lineWidth = mm(0.25);
  ctx.strokeRect(left, by, bw, bh);
  const lab = (m: number) => (bar.meters >= 1000 ? `${+(m / 1000).toFixed(2)}` : String(m));
  for (let i = 0; i <= parts; i++) text(ctx, lab((bar.meters / parts) * i), left + (bw / parts) * i, by + bh + mm(3.2), { size: 2.6, align: 'center' });
  text(ctx, bar.meters >= 1000 ? 'km' : 'm', left + bw + mm(1.2), by + bh + mm(3.2), { size: 2.6 });

  // Columna del medio: la cuadrícula y los datos del mapa
  const mx = Math.max(left + bw + mm(10), r.x + r.w * 0.42);
  const lines = [
    `Cuadrícula UTM de ${gridLabel(scale)}`,
    `(1 cuadro = ${paperMmLabel(scale)} en el papel)`,
    `Proyección UTM (Mercator transversal) · WGS84`,
    `Zona ${plan.zone} ${plan.center.lat < 0 ? 'Sur' : 'Norte'} (${plan.zone}${toUtm(plan.center, plan.zone).band}) · meridiano central ${Math.abs(-183 + 6 * plan.zone)}° ${-183 + 6 * plan.zone < 0 ? 'O' : 'E'}`,
    `Centro: ${formatUtm(toUtm(plan.center, plan.zone))}`,
    `Curvas de nivel cada ${ci.minor} m (destacadas cada ${ci.major} m)`,
  ];
  lines.forEach((s, i) => text(ctx, s, mx, r.y + mm(3.9 + i * 2.85), { size: 2.3 }));

  // Norte: de la cuadrícula (NC), verdadero (NV) y magnético (NM)
  const ncx = r.x + r.w - mm(24);
  const ncy = r.y + mm(19);
  const conv = convergenceDeg(plan.center, plan.zone);
  const arrow = (angleDeg: number, len: number, color: string, dash = false) => {
    ctx.save();
    ctx.translate(ncx, ncy);
    ctx.rotate((angleDeg * Math.PI) / 180);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = mm(0.4);
    ctx.setLineDash(dash ? [mm(0.8), mm(0.6)] : []);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -mm(len));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(0, -mm(len + 2));
    ctx.lineTo(-mm(1), -mm(len - 0.5));
    ctx.lineTo(mm(1), -mm(len - 0.5));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
  // Las diferencias entre los tres nortes son de pocos grados: las flechas son largas para que se distingan.
  arrow(0, 12, '#1d4e89');
  arrow(-conv, 12, '#111', true);
  arrow(input.declinationDeg - conv, 12, '#b3261e');
  // Rótulos en la punta de cada flecha: GN a la izquierda, MN a la derecha con su valor y TN abajo a la izquierda.
  const tipY = ncy - mm(12);
  text(ctx, 'GN', ncx - mm(2.2), tipY - mm(0.6), { size: 2.8, bold: true, color: '#1d4e89', align: 'right' });
  text(ctx, `MN ${dm(input.declinationDeg)} ${input.declinationDeg >= 0 ? 'E' : 'O'}`, ncx + mm(2.6), tipY - mm(0.6), { size: 2.8, bold: true, color: '#b3261e', align: 'left' });
  text(ctx, 'TN', ncx - mm(2.2), tipY + mm(3.2), { size: 2.6, bold: true, color: '#111', align: 'right' });

  // Fila de abajo: leyenda del norte, declinación, aviso y atribuciones
  const legendY = r.y + mm(21.4);
  let x = left;
  const run = (s: string, color: string, bold = false) => {
    text(ctx, s, x, legendY, { size: 2.4, color, bold });
    x += ctx.measureText(s).width;
  };
  run('GN', '#1d4e89', true);
  run(' norte de la cuadrícula  ·  ', '#111');
  run('TN', '#111', true);
  run(` norte verdadero (convergencia ${dm(conv)} ${conv >= 0 ? 'E' : 'O'})  ·  `, '#111');
  run('MN', '#b3261e', true);
  run(` norte magnético: declinación ${dm(input.declinationDeg)} ${input.declinationDeg >= 0 ? 'E' : 'O'} en ${input.declinationYear}`, '#111');
  text(ctx, `Mapa de ruta de ${APP_NAME}: no es una carta oficial. Verificá con las cartas oficiales.`, left, r.y + mm(24.8), { size: 2.5, bold: true });
  text(ctx, '© OpenStreetMap contributors (ODbL), OpenMapTiles, OpenFreeMap · Elevación: Terrain Tiles (AWS)', left, r.y + mm(27.8), { size: 2.2, color: '#444' });
}

/** Lado de un cuadro de la cuadrícula en el papel, por ejemplo «40 mm». */
const paperMmLabel = (scale: number) => `${Math.round((gridStepM(scale) / scale) * 1000)} mm`;

/** Convergencia de meridianos (grados) en el centro: ángulo entre el norte verdadero y el norte de la cuadrícula. */
export function convergenceDeg(p: LatLon, zone: number): number {
  const dl = ((p.lon - (-183 + 6 * zone)) * Math.PI) / 180;
  return (Math.atan(Math.tan(dl) * Math.sin((p.lat * Math.PI) / 180)) * 180) / Math.PI;
}

interface DetailPage {
  legs: { from: number; count: number } | null;
  coords: { from: number; count: number } | null;
}

/**
 * Hojas de detalle (2, 3…) con TODOS los tramos y TODAS las coordenadas, cuando no entran enteros en la hoja del mapa.
 * Vacío si en la hoja 1 entra todo (si no entra, la hoja 1 queda solo con el mapa).
 */
export function detailPages(plan: SheetPlan, input: TopoSheetInput): DetailPage[] {
  const { layout } = plan;
  if (!layout.detailOnly) return [];
  const pages: DetailPage[] = [];
  const area = layout.paper.h - 2 * layout.margin - layout.header.h - 4;
  const dcols = layout.orientation === 'portrait' ? 2 : 3;
  let legFrom = 0;
  let ptFrom = 0;
  while (legFrom < input.legs.length || ptFrom < input.points.length) {
    let left = area;
    let legs: DetailPage['legs'] = null;
    let coords: DetailPage['coords'] = null;
    if (legFrom < input.legs.length) {
      const rows = Math.max(1, Math.min(input.legs.length - legFrom, Math.floor((left - 6.2 - 7) / 5.2)));
      legs = { from: legFrom, count: rows };
      legFrom += rows;
      left -= 6.2 + rows * 5.2 + 7 + 4;
    }
    if (legFrom >= input.legs.length && ptFrom < input.points.length) {
      const perCol = Math.max(1, Math.floor((left - 5.4 - 2) / 4.4));
      if (!legs || perCol >= 3) {
        const count = Math.min(input.points.length - ptFrom, perCol * dcols);
        coords = { from: ptFrom, count };
        ptFrom += count;
      }
    }
    pages.push({ legs, coords });
  }
  return pages;
}

/** Dibuja una hoja de detalle: cabecera, tabla de tramos (ancha) y lista de coordenadas. */
export function drawDetailPage(plan: SheetPlan, input: TopoSheetInput, page: DetailPage, pageNo: number, pageTotal: number, logo?: CanvasImageSource | null): HTMLCanvasElement {
  const { layout } = plan;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(mm(layout.paper.w));
  canvas.height = Math.round(mm(layout.paper.h));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const x = layout.margin;
  const w = layout.paper.w - 2 * layout.margin;
  const tx = mm(x) + (logo ? mm(LOGO_MM + 3) : 0);
  if (logo) ctx.drawImage(logo, mm(x), mm(layout.margin + 0.5), mm(LOGO_MM), mm(LOGO_MM));
  ctx.font = `700 ${mm(6.5)}px ${FONT}`;
  text(ctx, fit(ctx, input.title, mm(x + w) - tx), tx, mm(layout.margin + 6), { size: 6.5, bold: true });
  text(ctx, `Hoja ${pageNo} de ${pageTotal} · tramos y coordenadas de la ruta · escala del mapa 1:${(plan.scale ?? 0).toLocaleString('es-AR')}`, tx, mm(layout.margin + 11.5), { size: 3.2, color: '#333' });
  ctx.strokeStyle = '#111';
  ctx.lineWidth = mm(0.4);
  ctx.beginPath();
  ctx.moveTo(mm(x), mm(layout.margin + layout.header.h));
  ctx.lineTo(mm(x + w), mm(layout.margin + layout.header.h));
  ctx.stroke();
  let y = layout.margin + layout.header.h + 4;
  if (page.legs) {
    const h = 6.2 + page.legs.count * 5.2 + 7;
    drawTable(ctx, rectPx({ x, y, w, h }), input, { wide: true, from: page.legs.from, count: page.legs.count });
    y += h + 4;
  }
  if (page.coords) {
    const dcols = layout.orientation === 'portrait' ? 2 : 3;
    const h = 5.4 + Math.ceil(page.coords.count / dcols) * 4.4 + 2;
    drawCoords(ctx, rectPx({ x, y, w, h }), input, plan.zone, layout.orientation, { from: page.coords.from, count: page.coords.count, cols: dcols });
  }
  text(ctx, `Mapa de ruta de ${APP_NAME}: no es una carta oficial. Verificá con las cartas oficiales.`, mm(x), mm(layout.paper.h - layout.margin + 3), { size: 2.5, color: '#444' });
  return canvas;
}

/** Arma el PDF del mapa topográfico (una hoja A4). Lanza `NO_FIT` si la ruta no entra, `NO_ROUTE` si no hay puntos. */
export async function makeTopoPdf(input: TopoSheetInput): Promise<{ pdf: Uint8Array; scale: number; pages: number }> {
  const plan = planSheet(input);
  if (!plan.scale) throw new Error('NO_FIT');
  const r = DEFAULT_DPI / 96;
  const mapPx = { w: mm(plan.layout.map.w), h: mm(plan.layout.map.h) };
  const base = await renderBaseMap({
    center: plan.center,
    zoom: zoomForScale(plan.center.lat, plan.scale, DEFAULT_DPI, r),
    // El norte de la cuadrícula hacia arriba: la cuadrícula UTM queda vertical y horizontal; el norte verdadero y el magnético, inclinados.
    bearing: convergenceDeg(plan.center, plan.zone),
    cssWidth: Math.round(mapPx.w / r),
    cssHeight: Math.round(mapPx.h / r),
    pixelRatio: r,
  });
  try {
    const toJpeg = async (c: HTMLCanvasElement) => {
      const blob = await new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('JPEG'))), 'image/jpeg', 0.92));
      return { jpeg: new Uint8Array(await blob.arrayBuffer()), widthPx: c.width, heightPx: c.height };
    };
    const logo = await loadLogo();
    const pages = [await toJpeg(drawSheet(base, plan, input, logo))];
    const details = detailPages(plan, input);
    for (let i = 0; i < details.length; i++) pages.push(await toJpeg(drawDetailPage(plan, input, details[i]!, i + 2, details.length + 1, logo)));
    return { pdf: jpegPagePdf({ pages, pageWmm: plan.layout.paper.w, pageHmm: plan.layout.paper.h, title: input.title }), scale: plan.scale, pages: pages.length };
  } finally {
    base.dispose();
  }
}

