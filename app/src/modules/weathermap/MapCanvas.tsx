import { i18n } from '@/core/i18n/i18n';
import { useCountry } from '@/modules/emergency/currentCountry';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { WeatherMapValue } from '@/core/settings/settings';
import { tempLevel, windLevel, type ScaleColor } from '@/modules/weather/levels';
import type { GeoData, Volcano, WorldBorders } from './geo';
import type { NavState, RiverPoint, TidePoint } from './navLayers';
import { seaState, type SeaState } from '@/modules/navigation/waves';
import { clusterFires, fireCellDegrees, fireLevel, type FireCell, type FireInpe, type InpeCell } from './fires';
import { waveSegments, type WaveSpot } from './waveGrid';
import { fitBounds, homeBounds, pan, project, unproject, zoomAt, type Size, type View } from './projection';
import { readyImage } from './images';
import { alertCovers, type Flash, type Hazard, type HazardLevel, type OfficialAlert, type OfficialSeverity, type VolcanoAlert, volcanoAlertAt, type Quake, type ZoneWeather } from './sources';

/** Imagen georreferenciada (satélite, tesela de radar, focos de calor), en metros Mercator. */
export interface Overlay {
  url: string;
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  opacity: number;
  /** Focos de calor: además de los puntos, se marca cada grupo con una llama. */
  fire?: boolean;
}

export interface MapWaypoint {
  id: string;
  name: string;
  lon: number;
  lat: number;
}

/** Un grupo de focos de calor (anomalías térmicas del satélite): dónde y cuántas detecciones (estimadas). */
export interface FireSpot {
  lon: number;
  lat: number;
  detections: number;
  /** Con FIRMS: por confianza, potencia total (MW) y minutos desde la más reciente (al bajar los datos). Sin FIRMS (imagen de la NASA) no hay. */
  high?: number;
  nominal?: number;
  low?: number;
  frp?: number;
  newestMin?: number;
  /** Brasil: riesgo de fuego, días sin lluvia, bioma y municipio del INPE, si el servidor los trae. */
  inpe?: FireInpe;
}

export type MapFeature =
  | { kind: 'quake'; item: Quake }
  | { kind: 'hazard'; item: Hazard }
  | { kind: 'official'; item: OfficialAlert }
  | { kind: 'volcano'; item: Volcano }
  | { kind: 'river'; item: RiverPoint }
  | { kind: 'tide'; item: TidePoint }
  | { kind: 'wave'; item: WaveSpot }
  | { kind: 'fire'; item: FireSpot }
  | { kind: 'zone'; item: ZoneWeather }
  | { kind: 'waypoint'; item: MapWaypoint };

/** El centro de la vista como «lon,lat» (para las pruebas: dice a qué país está mirando el mapa). */
function centerLabel(view: View, size: Size): string {
  const c = unproject(size.width / 2, size.height / 2, view, size);
  return `${c.lon.toFixed(1)},${c.lat.toFixed(1)}`;
}

interface Props {
  geo: GeoData;
  /** Contorno del resto de los países del mundo (opcional: llega después, el mapa se dibuja igual sin él). */
  world?: WorldBorders | null;
  view: View | null;
  onView: (view: View, size: Size) => void;
  overlays: Overlay[];
  zones: ZoneWeather[] | null;
  zoneValue: WeatherMapValue;
  quakes: Quake[] | null;
  hazards: Hazard[] | null;
  /** Alertas oficiales vigentes (SMN, DMC, INUMET): zonas pintadas por severidad. */
  official: OfficialAlert[] | null;
  volcanoes: Volcano[] | null;
  /** Líneas de los ríos del mapa base. */
  showRivers?: boolean;
  /** Estaciones de niveles de ríos y de mareas (capas de Navegación). */
  riverPoints?: RiverPoint[] | null;
  tidePoints?: TidePoint[] | null;
  /** Oleaje: altura de las olas en una grilla de puntos de mar. */
  waves?: WaveSpot[] | null;
  /** Focos de calor de FIRMS (celdas de 0,1° con su confianza): llama solo para alta confianza. Si no hay, se usa la imagen de la NASA. */
  fires?: FireCell[] | null;
  /** Lo que el INPE suma a las celdas de Brasil (riesgo, días sin lluvia, bioma, municipio), por «lat,lon» de la celda; se muestra al tocar un grupo. */
  fireInfo?: Record<string, InpeCell> | null;
  /** Nivel de alerta técnica (OAVV): el volcán se pinta de amarillo, naranja o rojo, más grande. */
  volcanoAlerts?: VolcanoAlert[] | null;
  waypoints: MapWaypoint[] | null;
  here: { lon: number; lat: number } | null;
  /** Rayos de los últimos minutos: círculos amarillos y un ⚡ que titila por grupo. */
  lightning: Flash[] | null;
  /** Anillos de 10, 20 y 30 km alrededor de mi ubicación. */
  rings: boolean;
  /** Animar los ⚡ (no con ahorro de batería). */
  animate: boolean;
  selected: MapFeature | null;
  onSelect: (feature: MapFeature | null) => void;
  /** Cambia cuando termina de bajar una imagen: hay que redibujar. */
  version: number;
  format: { temp: (c: number) => string; wind: (kmh: number) => string; rain: (mm: number) => string };
  now: number;
}

const HIT_PX = 18;
/** Qué tan cerca de la franja de oleaje cuenta un toque. */
const WAVE_HIT_PX = 14;
const TAP_SLOP_PX = 6;

function cssVars(): Record<string, string> {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string) => s.getPropertyValue(name).trim();
  return {
    bg: v('--bg'),
    surface: v('--surface'),
    surface2: v('--surface-2'),
    border: v('--border'),
    text: v('--text'),
    muted: v('--text-muted'),
    mapCountry: v('--map-country'),
    mapProvince: v('--map-province'),
    accent: v('--accent'),
    info: v('--info'),
    ...Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [`s${n}`, v(`--scale-${n}`)])),
  };
}

const scaleColor = (c: Record<string, string>, color: ScaleColor | null, fallback: string) => (color ? c[`s${color}`]! : fallback);

/** Niveles de GDACS: verde (seguimiento), naranja, rojo. */
const HAZARD_COLOR: Record<HazardLevel, ScaleColor> = { Green: 3, Orange: 5, Red: 6 };
/** Severidad CAP de las alertas oficiales: amarillo, naranja, rojo. */
export const OFFICIAL_COLOR: Record<OfficialSeverity, ScaleColor> = { Unknown: 3, Minor: 4, Moderate: 4, Severe: 5, Extreme: 6 };
/** Ícono de cada tipo, que se entiende sin leer la leyenda. */
export const HAZARD_ICON: Record<Hazard['type'], string> = { TC: '🌀', FL: '🌊', DR: '🏜️', WF: '🔥', VO: '🌋' };
const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

/** Tamaño (px de la imagen) de la celda en la que se agrupan los focos de calor cercanos. */
const FIRE_CELL_PX = 64;
/** Píxeles rojos mínimos para marcar la celda con una llama (cada foco ocupa unos 20–25 px: ~4 focos juntos). Uno aislado queda solo como punto. */
const FIRE_MIN_PX = 90;
/** Píxeles por foco (para estimar cuántas detecciones hay en un grupo) y mínimo para considerar que hay uno. */
const FIRE_PX_EACH = 22;
/** Casilla (px de pantalla) en la que se juntan los focos de FIRMS, y colores fijos (iguales en todos los temas). */
const FIRE_CLUSTER_PX = 22;
/** Metros por grado de longitud en Mercator (el mapa mide en metros Mercator). */
const M_PER_DEGREE = 111_320;
const FIRE_ORANGE = '#f08a00';
const FIRE_LOW = '#f0d95a';
const FIRE_HIGH = '#e8330a';

/** Traza una chispa de cuatro puntas, rellena (lados cóncavos suaves), centrada en (x, y) con puntas a `r`. */
function sparkPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const k = 0.3 * r;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x + k, y - k, x + r, y);
  ctx.quadraticCurveTo(x + k, y + k, x, y + r);
  ctx.quadraticCurveTo(x - k, y + k, x - r, y);
  ctx.quadraticCurveTo(x - k, y - k, x, y - r);
  ctx.closePath();
}

/** Traza una silueta de llama de alto ~2,9 r centrada en (x, y): base redondeada, lengua izquierda chica, muesca y punta principal ladeada a la derecha. */
function flamePath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y + r);
  ctx.bezierCurveTo(x - 1.15 * r, y + 0.85 * r, x - 1.15 * r, y - 0.35 * r, x - 0.7 * r, y - 1.05 * r);
  ctx.bezierCurveTo(x - 0.65 * r, y - 0.6 * r, x - 0.45 * r, y - 0.5 * r, x - 0.2 * r, y - 0.55 * r);
  ctx.bezierCurveTo(x - 0.15 * r, y - 1.2 * r, x + 0.1 * r, y - 1.6 * r, x + 0.3 * r, y - 1.95 * r);
  ctx.bezierCurveTo(x + 0.55 * r, y - 1.3 * r, x + 1.2 * r, y - 0.6 * r, x + 1.05 * r, y + 0.2 * r);
  ctx.bezierCurveTo(x + 0.95 * r, y + 0.8 * r, x + 0.5 * r, y + r, x, y + r);
  ctx.closePath();
}
const FIRE_ANY_PX = 14;
const fireCache = new WeakMap<HTMLImageElement, { x: number; y: number; n: number }[]>();

/**
 * Los focos vienen como imagen (puntos rojos): se agrupan los píxeles por
 * celda y se devuelve el centro de cada grupo, en metros Mercator, para
 * dibujar una llama por grupo y no una por píxel.
 */
function fireClusters(img: HTMLImageElement, bbox: Overlay['bbox']): { x: number; y: number; n: number }[] {
  const hit = fireCache.get(img);
  if (hit) return hit;
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const octx = off.getContext('2d', { willReadFrequently: true });
  let points: { x: number; y: number; n: number }[] = [];
  if (octx && w > 0 && h > 0) {
    octx.drawImage(img, 0, 0);
    try {
      const data = octx.getImageData(0, 0, w, h).data;
      const cells = new Map<number, { sx: number; sy: number; n: number }>();
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          if (data[i + 3]! < 100 || data[i]! < 150 || data[i + 1]! > 150) continue;
          const key = Math.floor(y / FIRE_CELL_PX) * 100_000 + Math.floor(x / FIRE_CELL_PX);
          const cell = cells.get(key) ?? { sx: 0, sy: 0, n: 0 };
          cell.sx += x;
          cell.sy += y;
          cell.n++;
          cells.set(key, cell);
        }
      }
      points = [...cells.values()].filter((c) => c.n >= FIRE_ANY_PX).map((c) => ({
        n: c.n,
        x: bbox.minX + ((c.sx / c.n + 0.5) / w) * (bbox.maxX - bbox.minX),
        y: bbox.maxY - ((c.sy / c.n + 0.5) / h) * (bbox.maxY - bbox.minY),
      }));
    } catch {
      // Imagen sin permiso de lectura (CORS): quedan solo los puntos.
    }
  }
  fireCache.set(img, points);
  return points;
}

/** Color de los rayos (fijo: tiene que verse igual en todos los temas). */
const LIGHTNING_COLOR = '#ffd400';
/** Celda (px de pantalla) en la que se agrupan los rayos cercanos para poner un solo ⚡. */
const LIGHTNING_CELL_PX = 36;
/** Cada cuánto cambia el titileo de los ⚡. */
export const LIGHTNING_TICK_MS = 160;
export const RING_KM = [10, 20, 30];

/** Los ⚡ aparecen y desaparecen a destiempo, cada grupo con su ritmo, para que parezcan tormentas vivas. */
export function lightningVisible(cellKey: number, tick: number): boolean {
  const phase = (cellKey * 2654435761) >>> 0;
  const period = 6 + (phase % 7);
  return (tick + (phase % period)) % period < 3;
}

/** Radio en px de un círculo de `km` alrededor de una latitud (Mercator estira hacia los polos). */
export function kmToPx(km: number, lat: number, scale: number): number {
  return ((km * 1000) / Math.cos((lat * Math.PI) / 180)) * scale;
}

export function quakeRadius(mag: number): number {
  return 3 + Math.max(0, mag - 2.5) * 3;
}

/** Color por antigüedad: último día, últimos 3 días, la semana. */
export function quakeAge(time: number, now: number): ScaleColor {
  const hours = (now - time) / 3_600_000;
  return hours < 24 ? 6 : hours < 72 ? 5 : 4;
}

export function MapCanvas(props: Props) {
  // El país actual de Ajustes (no el de donde estás parado): es el que el mapa muestra al abrirse.
  const country = useCountry();
  const { view, onView, onSelect } = props;
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<Size | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry!.contentRect;
      if (width > 0 && height > 0) setSize({ width: Math.round(width), height: Math.round(height) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Primera vista (o al cambiar mucho el tamaño): el país elegido (Argentina, Chile y Uruguay, los tres juntos).
  useEffect(() => {
    if (size && !view) onView(fitBounds(homeBounds(country), size), size);
    else if (size && view) onView(view, size);
    // Solo cuando cambia el tamaño.
  }, [size]);

  // Titileo de los ⚡: se redibuja seguido solo si hay rayos y está permitido animar.
  const [tick, setTick] = useState(0);
  const flashing = props.animate && !!props.lightning?.length;
  useEffect(() => {
    if (!flashing) return;
    const timer = setInterval(() => setTick((n) => n + 1), LIGHTNING_TICK_MS);
    return () => clearInterval(timer);
  }, [flashing]);

  useEffect(() => {
    if (size && view && canvas.current) draw(canvas.current, size, view, props, flashing ? tick : null);
  });

  // ---------- Gestos: arrastrar, pellizcar, rueda y tocar ----------
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ startX: number; startY: number; moved: boolean; pinch: number | null }>({ startX: 0, startY: 0, moved: false, pinch: null });
  const local = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    canvas.current!.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 1) gesture.current = { startX: p.x, startY: p.y, moved: false, pinch: null };
    else gesture.current.moved = true;
  }

  function onPointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev || !view || !size) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (Math.hypot(p.x - g.startX, p.y - g.startY) > TAP_SLOP_PX) g.moved = true;
    if (pointers.current.size === 1) {
      onView(pan(view, p.x - prev.x, p.y - prev.y), size);
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (g.pinch) onView(zoomAt(view, size, dist / g.pinch, (a!.x + b!.x) / 2, (a!.y + b!.y) / 2), size);
      g.pinch = dist;
    }
  }

  function onPointerUp(e: ReactPointerEvent<HTMLCanvasElement>) {
    const p = local(e);
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) gesture.current.pinch = null;
    if (pointers.current.size === 0 && !gesture.current.moved && view && size) onSelect(hitTest(p.x, p.y, size, view, props));
  }

  useEffect(() => {
    const el = canvas.current;
    if (!el || !view || !size) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      onView(zoomAt(view, size, e.deltaY < 0 ? 1.25 : 0.8, p.x, p.y), size);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [view, size, onView]);

  return (
    <div className="wmap-canvas" ref={wrap}>
      <canvas
        ref={canvas}
        data-testid="weather-map"
        // Centro de la vista (lon,lat), para las pruebas: dice a qué país está mirando el mapa.
        data-center={view && size ? centerLabel(view, size) : ''}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
    </div>
  );
}

function hitTest(x: number, y: number, size: Size, view: View, p: Props): MapFeature | null {
  let best: { d: number; f: MapFeature } | null = null;
  const consider = (lon: number, lat: number, f: MapFeature, extra = 0) => {
    const s = project(lon, lat, view, size);
    const d = Math.hypot(s.x - x, s.y - y) - extra;
    if (d <= HIT_PX && (!best || d < best.d)) best = { d, f };
  };
  p.waypoints?.forEach((w) => consider(w.lon, w.lat, { kind: 'waypoint', item: w }));
  p.quakes?.forEach((q) => consider(q.lon, q.lat, { kind: 'quake', item: q }, quakeRadius(q.mag) / 2));
  p.hazards?.forEach((h) => consider(h.lon, h.lat, { kind: 'hazard', item: h }, 4));
  p.volcanoes?.forEach((v) => consider(v.lon, v.lat, { kind: 'volcano', item: v }));
  p.riverPoints?.forEach((r) => consider(r.lon, r.lat, { kind: 'river', item: r }, -4));
  p.tidePoints?.forEach((t) => consider(t.lon, t.lat, { kind: 'tide', item: t }, -4));
  // Focos de calor de FIRMS: se toca el grupo más cercano (llama, punto naranja o amarillo).
  if (p.fires?.length) {
    let nearest: { d: number; g: ReturnType<typeof clusterFires>[number] } | null = null;
    const onScreen = (lat: number, lon: number) => {
      const q = project(lon, lat, view, size);
      return q.x >= -FIRE_CLUSTER_PX && q.y >= -FIRE_CLUSTER_PX && q.x <= size.width + FIRE_CLUSTER_PX && q.y <= size.height + FIRE_CLUSTER_PX;
    };
    for (const g of clusterFires(p.fires, fireCellDegrees(view.scale * M_PER_DEGREE, FIRE_CLUSTER_PX), onScreen, p.fireInfo)) {
      const s = project(g.lon, g.lat, view, size);
      const d = Math.hypot(s.x - x, s.y - y);
      if (d <= HIT_PX && (!nearest || d < nearest.d)) nearest = { d, g };
    }
    if (nearest && (!best || nearest.d < (best as { d: number }).d)) {
      const g = nearest.g;
      best = { d: nearest.d, f: { kind: 'fire', item: { lon: g.lon, lat: g.lat, detections: g.n, high: g.high, nominal: g.nominal, low: g.low, frp: g.frp, newestMin: g.newestMin, inpe: g.inpe } } };
    }
  }
  // Focos de calor de la imagen de la NASA: se toca el grupo (la llama o el punto); vale la cantidad estimada de detecciones de las dos pasadas (ayer y hoy).
  const R = 6_378_137;
  const groups: { sx: number; sy: number; n: number; x: number; y: number }[] = [];
  for (const o of p.overlays) {
    const img = o.fire ? readyImage(o.url) : null;
    if (!img) continue;
    for (const g of fireClusters(img, o.bbox)) groups.push({ sx: size.width / 2 + (g.x - view.cx) * view.scale, sy: size.height / 2 - (g.y - view.cy) * view.scale, n: g.n, x: g.x, y: g.y });
  }
  let nearestFire: { d: number; g: (typeof groups)[number] } | null = null;
  for (const g of groups) {
    const d = Math.hypot(g.sx - x, g.sy - y);
    if (d <= HIT_PX && (!nearestFire || d < nearestFire.d)) nearestFire = { d, g };
  }
  if (nearestFire && (!best || nearestFire.d < (best as { d: number }).d)) {
    const near = groups.filter((g) => Math.hypot(g.sx - nearestFire!.g.sx, g.sy - nearestFire!.g.sy) <= 24);
    const detections = Math.max(1, Math.round(near.reduce((n, g) => n + g.n, 0) / FIRE_PX_EACH));
    const lon = ((nearestFire.g.x / R) * 180) / Math.PI;
    const lat = ((2 * Math.atan(Math.exp(nearestFire.g.y / R)) - Math.PI / 2) * 180) / Math.PI;
    best = { d: nearestFire.d, f: { kind: 'fire', item: { lon, lat, detections } } };
  }
  p.zones?.forEach((z) => consider(z.lon, z.lat, { kind: 'zone', item: z }));
  // Oleaje: la franja pegada a la costa; se toca el tramo y vale el punto más cercano al toque.
  // (solo si no hay otro punto cerca: la franja pasa pegada a la costa, donde están las estaciones de mareas y los waypoints)
  if (!best && p.waves?.length) {
    for (const seg of waveSegments(p.waves)) {
      const a = project(seg.a.lon, seg.a.lat, view, size);
      const b = seg.b ? project(seg.b.lon, seg.b.lat, view, size) : a;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2));
      const d = Math.hypot(a.x + t * dx - x, a.y + t * dy - y);
      const spot = seg.b && t > 0.5 ? seg.b : seg.a;
      if (d <= WAVE_HIT_PX && (!best || d < (best as { d: number }).d)) best = { d, f: { kind: 'wave', item: spot } };
    }
  }
  const point = (best as { f: MapFeature } | null)?.f ?? null;
  if (point || !p.official?.length) return point;
  // Sin nada puntual cerca: la alerta oficial (la más grave) cuya zona incluye el toque.
  const { lon, lat } = unproject(x, y, view, size);
  const inside = p.official.filter((a) => alertCovers(a, lat, lon));
  return inside.length ? { kind: 'official', item: inside[0]! } : null;
}

function draw(el: HTMLCanvasElement, size: Size, view: View, p: Props, tick: number | null) {
  const dpr = window.devicePixelRatio || 1;
  if (el.width !== Math.round(size.width * dpr) || el.height !== Math.round(size.height * dpr)) {
    el.width = Math.round(size.width * dpr);
    el.height = Math.round(size.height * dpr);
    el.style.width = `${size.width}px`;
    el.style.height = `${size.height}px`;
  }
  const ctx = el.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const c = cssVars();
  const proj = (lon: number, lat: number) => project(lon, lat, view, size);

  const path = (rings: number[][]) => {
    ctx.beginPath();
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i += 2) {
        const s = proj(ring[i]!, ring[i + 1]!);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      }
      ctx.closePath();
    }
  };

  // Mar, vecinos y nuestras regiones.
  ctx.fillStyle = c.bg!;
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.fillStyle = c.surface2!;
  for (const w of p.world?.countries ?? []) {
    path(w.rings);
    ctx.fill();
  }
  for (const n of p.geo.neighbors) {
    path(n.rings);
    ctx.fill();
  }
  ctx.fillStyle = c.surface!;
  for (const r of p.geo.regions) {
    path(r.rings);
    ctx.fill();
  }

  // Imágenes (satélite, radar, fuego), con la posición que tenían al pedirlas.
  for (const o of p.overlays) {
    const img = readyImage(o.url);
    if (!img) continue;
    const tl = { x: size.width / 2 + (o.bbox.minX - view.cx) * view.scale, y: size.height / 2 - (o.bbox.maxY - view.cy) * view.scale };
    const w = (o.bbox.maxX - o.bbox.minX) * view.scale;
    const h = (o.bbox.maxY - o.bbox.minY) * view.scale;
    ctx.globalAlpha = o.opacity;
    ctx.drawImage(img, tl.x, tl.y, w, h);
  }
  ctx.globalAlpha = 1;

  // Límites encima de las imágenes, para no perder la referencia: provincias de un
  // color y, encima, fronteras y costas de los países de otro, más marcadas.
  ctx.lineJoin = 'round';
  ctx.strokeStyle = c.mapProvince!;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 0.7;
  for (const r of p.geo.regions) {
    path(r.rings);
    ctx.stroke();
  }
  ctx.strokeStyle = c.mapCountry!;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 1.3;
  for (const b of [...p.geo.borders, ...p.geo.neighbors]) {
    path(b.rings);
    ctx.stroke();
  }
  // El resto del mundo, más fino y más tenue: es referencia, no el foco del mapa.
  if (p.world) {
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 0.9;
    for (const w of p.world.countries) {
      path(w.rings);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // Ríos: línea azul, más gruesa cuanto mayor es el río (rank 1 a 9).
  if (p.showRivers) {
    ctx.strokeStyle = c.info!;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const r of p.geo.rivers) {
      ctx.globalAlpha = r.rank <= 4 ? 0.85 : 0.6;
      ctx.lineWidth = r.rank <= 2 ? 2.2 : r.rank <= 5 ? 1.5 : 1;
      ctx.beginPath();
      for (const line of r.lines) {
        for (let i = 0; i < line.length; i += 2) {
          const s = proj(line[i]!, line[i + 1]!);
          if (i === 0) ctx.moveTo(s.x, s.y);
          else ctx.lineTo(s.x, s.y);
        }
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Zonas de las alertas oficiales: relleno suave y borde del color de la severidad (las graves encima).
  for (const a of [...(p.official ?? [])].reverse()) {
    const color = c[`s${OFFICIAL_COLOR[a.severity]}`]!;
    const selectedAlert = p.selected?.kind === 'official' && p.selected.item.key === a.key;
    ctx.beginPath();
    for (const area of a.areas) {
      for (const ring of area.polygons) {
        ring.forEach(([lat, lon], i) => {
          const s = proj(lon, lat);
          if (i === 0) ctx.moveTo(s.x, s.y);
          else ctx.lineTo(s.x, s.y);
        });
        ctx.closePath();
      }
    }
    ctx.globalAlpha = selectedAlert ? 0.4 : 0.22;
    ctx.fillStyle = color;
    ctx.fill('evenodd');
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = selectedAlert ? c.accent! : color;
    ctx.lineWidth = selectedAlert ? 2.5 : 1.2;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  const labels: { x: number; y: number; w: number; h: number }[] = [];
  const free = (x: number, y: number, w: number, h: number) => {
    if (x < 0 || y < 0 || x + w > size.width || y + h > size.height) return false;
    if (labels.some((l) => x < l.x + l.w && x + w > l.x && y < l.y + l.h && y + h > l.y)) return false;
    labels.push({ x, y, w, h });
    return true;
  };
  const text = (s: string, x: number, y: number, color: string, bold = false, align: 'center' | 'left' = 'center') => {
    ctx.font = `${bold ? '600 ' : ''}12px system-ui, sans-serif`;
    const w = ctx.measureText(s).width;
    const left = align === 'center' ? x - w / 2 : x;
    if (!free(left - 2, y - 9, w + 4, 14)) return false;
    ctx.lineWidth = 3;
    ctx.strokeStyle = c.bg!;
    ctx.strokeText(s, left, y + 3);
    ctx.fillStyle = color;
    ctx.fillText(s, left, y + 3);
    return true;
  };

  // Lo seleccionado se marca primero, para que su etiqueta no quede tapada.
  const sel = p.selected;
  if (sel && sel.kind !== 'official') {
    const s = proj(sel.item.lon, sel.item.lat);
    ctx.strokeStyle = c.accent!;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 14, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Oleaje: una franja pegada a la costa (de norte a sur), del color del estado del mar (Douglas) en cada tramo, de celeste (calma) a rojo.
  // Cada tramo une dos puntos vecinos con un degradado entre sus colores; un punto sin vecinos con dato queda como un tope redondo.
  const SEA_COLOR: Record<SeaState, string> = { calm: c.s1!, smooth: c.s1!, slight: c.s2!, moderate: c.s3!, rough: c.s4!, veryRough: c.s5!, high: c.s6!, veryHigh: c.s6!, phenomenal: c.s6! };
  if (p.waves?.length) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const segs = waveSegments(p.waves);
    // Primero el borde oscuro de todos los tramos (así los colores no se pisan entre sí) y después el color.
    for (const pass of ['edge', 'color'] as const) {
      for (const seg of segs) {
        const a = proj(seg.a.lon, seg.a.lat);
        const b = seg.b ? proj(seg.b.lon, seg.b.lat) : { x: a.x + 0.01, y: a.y };
        if (Math.max(a.x, b.x) < -20 || Math.min(a.x, b.x) > size.width + 20 || Math.max(a.y, b.y) < -20 || Math.min(a.y, b.y) > size.height + 20) continue;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        if (pass === 'edge') {
          ctx.strokeStyle = c.bg!;
          ctx.lineWidth = 10;
        } else {
          const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
          g.addColorStop(0, SEA_COLOR[seaState(seg.a.height)]);
          g.addColorStop(1, SEA_COLOR[seaState((seg.b ?? seg.a).height)]);
          ctx.strokeStyle = g;
          ctx.lineWidth = 6;
        }
        ctx.stroke();
      }
    }
  }

  // Niveles de ríos: círculo del color del estado (evacuación, alerta, aguas bajas, normal; gris sin dato). Estaciones de mareas: rombo.
  const THREAT_COLOR = { yellow: c.s4!, orange: c.s5!, red: c.s6! };
  const RIVER_COLOR: Record<NavState, string> = { evac: c.s6!, alert: c.s5!, low: c.s4!, normal: c.info!, unknown: c.muted! };
  for (const r of [...(p.riverPoints ?? [])].sort((a, b) => Number(a.state !== 'unknown' && a.state !== 'normal') - Number(b.state !== 'unknown' && b.state !== 'normal'))) {
    const s = proj(r.lon, r.lat);
    // Bolivia: el color es la amenaza del pronóstico del SENAMHI (amarilla, naranja o roja), si la estación sale en la planilla.
    const hot = r.state === 'evac' || r.state === 'alert' || r.state === 'low' || r.threat === 'orange' || r.threat === 'red';
    ctx.fillStyle = r.threat ? THREAT_COLOR[r.threat] : RIVER_COLOR[r.state];
    ctx.strokeStyle = c.bg!;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(s.x, s.y, hot ? 7 : 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  for (const tp of p.tidePoints ?? []) {
    const s = proj(tp.lon, tp.lat);
    ctx.fillStyle = c.info!;
    ctx.strokeStyle = c.text!;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y - 7);
    ctx.lineTo(s.x + 6, s.y);
    ctx.lineTo(s.x, s.y + 7);
    ctx.lineTo(s.x - 6, s.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Volcanes: triángulo; los que tuvieron erupciones desde 1900, más visibles.
  // Con alerta técnica (OAVV): más grande, del color del nivel y con borde claro; se dibujan al final, encima.
  const alerted = (v: Volcano) => volcanoAlertAt(p.volcanoAlerts ?? undefined, v.lat, v.lon);
  const LEVEL_COLOR = { yellow: c.s4!, orange: c.s5!, red: c.s6! };
  for (const v of [...(p.volcanoes ?? [])].sort((a, b) => Number(!!alerted(a)) - Number(!!alerted(b)))) {
    const s = proj(v.lon, v.lat);
    const alert = alerted(v);
    const recent = v.lastEruption !== null && v.lastEruption >= 1900;
    const k = alert ? 1.7 : 1;
    ctx.fillStyle = alert ? LEVEL_COLOR[alert.level] : recent ? c.s5! : c.muted!;
    ctx.strokeStyle = alert ? c.text! : c.bg!;
    ctx.lineWidth = alert ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y - 6 * k);
    ctx.lineTo(s.x + 5 * k, s.y + 4 * k);
    ctx.lineTo(s.x - 5 * k, s.y + 4 * k);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Sismos: tamaño por magnitud, color por antigüedad; los más nuevos encima.
  for (const q of [...(p.quakes ?? [])].reverse()) {
    const s = proj(q.lon, q.lat);
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = c[`s${quakeAge(q.time, p.now)}`]!;
    ctx.beginPath();
    ctx.arc(s.x, s.y, quakeRadius(q.mag), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = c.bg!;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Alertas de GDACS: cuadrado con la letra del tipo, color por nivel de alerta.
  for (const h of p.hazards ?? []) {
    const s = proj(h.lon, h.lat);
    ctx.fillStyle = c[`s${HAZARD_COLOR[h.level]}`]!;
    ctx.strokeStyle = c.bg!;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(s.x - 9, s.y - 9, 18, 18, 4);
    ctx.fill();
    ctx.stroke();
    ctx.font = `12px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(HAZARD_ICON[h.type], s.x, s.y + 4.5);
    ctx.textAlign = 'start';
    labels.push({ x: s.x - 9, y: s.y - 9, w: 18, h: 18 });
  }

  // Focos de calor de FIRMS: un punto amarillo chico (baja confianza), uno naranja (nominal) o una llama (alta confianza), una marca por casilla.
  if (p.fires?.length) {
    const clusters = clusterFires(p.fires, fireCellDegrees(view.scale * M_PER_DEGREE, FIRE_CLUSTER_PX), (lat, lon) => {
      const q = proj(lon, lat);
      return q.x >= -FIRE_CLUSTER_PX && q.y >= -FIRE_CLUSTER_PX && q.x <= size.width + FIRE_CLUSTER_PX && q.y <= size.height + FIRE_CLUSTER_PX;
    });
    for (const level of ['low', 'orange', 'flame'] as const) {
      for (const g of clusters) {
        if (fireLevel(g) !== level) continue;
        const s = proj(g.lon, g.lat);
        if (level === 'flame') {
          // Solo la alta confianza lleva la llama: roja, con borde blanco y llama interior amarilla, más grande que las chispas.
          const r = 5.5 + Math.min(2.5, Math.log2(Math.max(1, g.high)) * 0.7);
          flamePath(ctx, s.x, s.y, r);
          ctx.fillStyle = FIRE_HIGH;
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.2;
          ctx.stroke();
          flamePath(ctx, s.x + 0.05 * r, s.y + 0.38 * r, r * 0.52);
          ctx.fillStyle = '#ffd24d';
          ctx.fill();
          continue;
        }
        // Las nominales (naranja) y las de baja confianza (amarillo, más chicas) son una chispa de cuatro puntas, sin forma de llama: no se
        // confunden con las llamas de alta confianza ni con los círculos de los ríos y los sismos.
        const r = level === 'orange' ? 4.6 + Math.min(3, Math.log2(g.n) * 0.8) : 3.4;
        sparkPath(ctx, s.x, s.y, r);
        ctx.fillStyle = level === 'orange' ? FIRE_ORANGE : FIRE_LOW;
        ctx.globalAlpha = level === 'orange' ? 0.95 : 0.85;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = level === 'orange' ? '#7a3500' : '#7a6a18';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }
  }

  // Una llama por grupo de focos de calor de la imagen de la NASA (los puntos solos no se entienden).
  for (const o of p.overlays) {
    const img = o.fire ? readyImage(o.url) : null;
    if (!img) continue;
    ctx.font = `14px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    for (const m of fireClusters(img, o.bbox).filter((g) => g.n >= FIRE_MIN_PX)) {
      const s = { x: size.width / 2 + (m.x - view.cx) * view.scale, y: size.height / 2 - (m.y - view.cy) * view.scale };
      if (free(s.x - 8, s.y - 18, 16, 16)) ctx.fillText('🔥', s.x, s.y - 4);
    }
    ctx.textAlign = 'start';
  }

  // Clima por zona, de las capitales nacionales hacia el resto (si no hay lugar, se omite).
  const zones = [...(p.zones ?? [])].sort((a, b) => Number(isNational(b, p.geo)) - Number(isNational(a, p.geo)));
  for (const z of zones) {
    const s = proj(z.lon, z.lat);
    if (p.zoneValue === 'temp') {
      text(p.format.temp(z.temp), s.x, s.y, scaleColor(c, tempLevel(z.temp).color, c.text!), true);
    } else if (p.zoneValue === 'rain') {
      if (z.precip > 0) text(p.format.rain(z.precip), s.x, s.y, c.s2!, true);
      else {
        ctx.fillStyle = c.muted!;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Solo el número (la unidad va en la leyenda): con "km/h" en cada zona el mapa se satura.
      const color = scaleColor(c, windLevel(z.windSpeed).color, c.text!);
      if (text(`   ${p.format.wind(z.windSpeed)}`, s.x, s.y, color, true)) {
        // Flecha hacia donde sopla (el dato dice de dónde viene).
        const w = ctx.measureText(`   ${p.format.wind(z.windSpeed)}`).width;
        arrow(ctx, s.x - w / 2 + 5, s.y, ((z.windDir + 180) % 360) * (Math.PI / 180), color);
      }
    }
  }

  // Rayos, encima de las etiquetas del clima: un círculo amarillo por rayo (más tenue cuanto más viejo) y un ⚡ por grupo.
  if (p.lightning?.length) {
    const cells = new Map<number, { x: number; y: number; n: number }>();
    for (const f of p.lightning) {
      const s = proj(f.lon, f.lat);
      if (s.x < -10 || s.y < -10 || s.x > size.width + 10 || s.y > size.height + 10) continue;
      ctx.globalAlpha = f.ageS < 120 ? 0.95 : 0.6;
      ctx.fillStyle = LIGHTNING_COLOR;
      ctx.strokeStyle = '#7a5c00';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const key = Math.floor(s.y / LIGHTNING_CELL_PX) * 100_000 + Math.floor(s.x / LIGHTNING_CELL_PX);
      const cell = cells.get(key) ?? { x: 0, y: 0, n: 0 };
      cell.x += s.x;
      cell.y += s.y;
      cell.n++;
      cells.set(key, cell);
    }
    ctx.globalAlpha = 1;
    ctx.font = `18px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    for (const [key, cell] of cells) {
      // Sin animación (ahorro de batería) el ⚡ queda fijo.
      if (tick !== null && !lightningVisible(key, tick)) continue;
      ctx.fillText('⚡', cell.x / cell.n, cell.y / cell.n - 6);
    }
    ctx.textAlign = 'start';
  }

  // Mis waypoints y mi ubicación.
  for (const w of p.waypoints ?? []) {
    const s = proj(w.lon, w.lat);
    ctx.fillStyle = c.accent!;
    ctx.strokeStyle = c.bg!;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y - 6);
    ctx.lineTo(s.x + 6, s.y);
    ctx.lineTo(s.x, s.y + 6);
    ctx.lineTo(s.x - 6, s.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    text(w.name, s.x + 9, s.y, c.text!, false, 'left');
  }
  if (p.here && p.rings) {
    // Anillos de distancia: a 30 km llega el aviso de rayos.
    const s = proj(p.here.lon, p.here.lat);
    for (const km of RING_KM) {
      const r = kmToPx(km, p.here.lat, view.scale);
      if (r < 8) continue;
      // Dentro del ciclo: la etiqueta cambia el color del pincel (contorno del texto).
      ctx.strokeStyle = c.info!;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.globalAlpha = km === 30 ? 0.9 : 0.6;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);
      if (r > 22) text(`${km} km`, s.x, s.y - r, c.info!, true);
    }
    ctx.setLineDash([]);
  }
  if (p.here) {
    const s = proj(p.here.lon, p.here.lat);
    ctx.fillStyle = c.info!;
    ctx.strokeStyle = c.text!;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Nombre de cada país, al final: si se pisa con algo más importante, no se escribe.
  const lang = i18n.language.startsWith('en') ? 'en' : i18n.language.startsWith('pt') ? 'pt' : 'es';
  ctx.globalAlpha = 0.85;
  // Los países grandes primero: si se pisan, que se quede sin nombre la isla chica y no el país.
  const ordered = [...p.geo.countries].sort((x, y) => Number(SMALL_COUNTRIES.has(x.code)) - Number(SMALL_COUNTRIES.has(y.code)));
  for (const country of ordered) {
    const s = proj(country.label[0], country.label[1]);
    text((country.name[lang] ?? country.name.es).toLocaleUpperCase(i18n.language), s.x, s.y, c.mapCountry!, true);
  }
  ctx.globalAlpha = 1;
}

/** Islas y países chicos del Caribe y de América Central: su nombre se escribe último, porque a poco zoom se pisa con el de países grandes. */
const SMALL_COUNTRIES = new Set(['AG', 'AW', 'BB', 'BS', 'BZ', 'CW', 'DM', 'GD', 'JM', 'KN', 'LC', 'SV', 'SX', 'TT', 'VC']);

function isNational(z: ZoneWeather, geo: GeoData): boolean {
  return geo.capitals.some((c) => c.national && c.name === z.name);
}

function arrow(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 6);
  ctx.lineTo(0, -4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(4, -2);
  ctx.lineTo(-4, -2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
