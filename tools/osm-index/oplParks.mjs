// De `osmium cat -f opl` (nodos, caminos y relaciones de las áreas protegidas de un país) a una línea JSON por área, con la forma exacta de
// Overpass `out geom`: un camino → {type:'way', id, tags, geometry:[{lat,lon}]}; una relación → {type:'relation', id, tags,
// members:[{type:'way', role, geometry:[{lat,lon}]}]} (con los tramos sueltos: las herramientas los unen en anillos, aunque el contorno
// quede abierto, algo que el armado de polígonos de osmium rechazaría, como en el área de Madidi).
// Uso: node oplParks.mjs <frontera de este país.geojson> [fronteras de los otros países…] (OPL por la entrada estándar). El recorte por
// frontera trae también las áreas del país vecino que tocan la línea (por ejemplo, las de la orilla de un río fronterizo): se descartan. © colaboradores de OpenStreetMap, ODbL.
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const dec = (s) => s.replace(/%([0-9a-fA-F]+)%/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
const isPark = (t) => t.boundary === 'protected_area' || t.boundary === 'national_park' || t.leisure === 'nature_reserve';

function tagsOf(field) {
  const t = {};
  if (!field) return t;
  for (const kv of field.split(',')) {
    const i = kv.indexOf('=');
    if (i > 0) t[dec(kv.slice(0, i))] = dec(kv.slice(i + 1));
  }
  return t;
}

// El primer argumento es la frontera del país de este archivo; los demás, la de los otros países. Un área es del país que tiene más de sus
// vértices claramente adentro (a más de ~330 m de la frontera; se muestrean hasta 60): un parque pegado a la línea queda en el país donde tiene
// su interior, y una reserva de la orilla de un río fronterizo (todos sus vértices sobre la línea) en el que queda del otro lado.
const MARGIN = 0.003; // ≈ 330 m: un vértice pegado a la línea (una orilla de río fronteriza) no cuenta para ningún país
const CELL = 0.1;
function loadBorder(path) {
  const g = JSON.parse(readFileSync(path, 'utf8')).geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  // Los tramos del borde en una cuadrícula, para medir la distancia al borde sin recorrerlos todos.
  const grid = new Map();
  for (const poly of polys) {
    for (const ring of poly) {
      for (let i = 1; i < ring.length; i++) {
        const [a, b] = [ring[i - 1], ring[i]];
        const x0 = Math.floor((Math.min(a[0], b[0]) - MARGIN) / CELL);
        const x1 = Math.floor((Math.max(a[0], b[0]) + MARGIN) / CELL);
        const y0 = Math.floor((Math.min(a[1], b[1]) - MARGIN) / CELL);
        const y1 = Math.floor((Math.max(a[1], b[1]) + MARGIN) / CELL);
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const k = `${x},${y}`;
          (grid.get(k) ?? grid.set(k, []).get(k)).push([a, b]);
        }
      }
    }
  }
  return { polys, grid };
}
function inRing(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function nearBorder({ grid }, x, y) {
  for (const [[ax, ay], [bx, by]] of grid.get(`${Math.floor(x / CELL)},${Math.floor(y / CELL)}`) ?? []) {
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
    if (Math.hypot(x - (ax + t * dx), y - (ay + t * dy)) <= MARGIN) return true;
  }
  return false;
}
/** Adentro del país y a más de ~330 m de su frontera. */
const interior = (b, x, y) => b.polys.some((poly) => inRing(poly[0], x, y) && !poly.slice(1).some((h) => inRing(h, x, y))) && !nearBorder(b, x, y);
const [ownBorder, ...otherBorders] = process.argv.slice(2).map(loadBorder);

/** Cuántos de los vértices muestreados (hasta 60) están claramente adentro de cada país (el propio primero). */
function shares(lists) {
  const all = lists.flat();
  if (all.length === 0) return null;
  const step = Math.max(1, Math.floor(all.length / 60));
  const counts = [0, ...otherBorders.map(() => 0)];
  for (let i = 0; i < all.length; i += step) {
    const { lon, lat } = all[i];
    if (interior(ownBorder, lon, lat)) counts[0]++;
    otherBorders.forEach((b, k) => {
      if (interior(b, lon, lat)) counts[k + 1]++;
    });
  }
  return counts;
}
const belongs = (lists) => {
  const c = shares(lists);
  return !!c && c[0] > 0 && c[0] >= Math.max(...c.slice(1), 0);
};

const nodes = new Map(); // id → [lon, lat]
const ways = new Map(); // id → [ids de nodos]
const parkWays = [];
const parkRels = [];

for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  const c = line[0];
  if (c !== 'n' && c !== 'w' && c !== 'r') continue;
  const f = line.split(' ');
  const id = Number(f[0].slice(1));
  const field = (p) => f.find((x, i) => i > 0 && x[0] === p)?.slice(1);
  if (c === 'n') {
    const x = field('x');
    const y = field('y');
    if (x !== undefined && y !== undefined) nodes.set(id, [Number(x), Number(y)]);
  } else if (c === 'w') {
    const refs = (field('N') ?? '').split(',').filter(Boolean).map((v) => Number(v.slice(1)));
    ways.set(id, refs);
    const t = tagsOf(field('T'));
    if (isPark(t)) parkWays.push({ id, tags: t });
  } else {
    const t = tagsOf(field('T'));
    if (isPark(t)) parkRels.push({ id, tags: t, members: (field('M') ?? '').split(',').filter(Boolean) });
  }
}

const geometryOf = (wayId) => {
  const pts = [];
  for (const nid of ways.get(wayId) ?? []) {
    const n = nodes.get(nid);
    if (n) pts.push({ lat: n[1], lon: n[0] });
  }
  return pts;
};

let count = 0;
const emit = (o) => {
  process.stdout.write(`${JSON.stringify(o)}\n`);
  count++;
};
for (const w of parkWays) {
  const geometry = geometryOf(w.id);
  if (geometry.length >= 4 && belongs([geometry])) emit({ type: 'way', id: w.id, tags: w.tags, geometry });
}
for (const r of parkRels) {
  const members = [];
  for (const m of r.members) {
    const mm = m.match(/^w(\d+)@(.*)$/);
    if (!mm) continue;
    const geometry = geometryOf(Number(mm[1]));
    if (geometry.length > 1) members.push({ type: 'way', role: mm[2], geometry });
  }
  if (members.length && belongs(members.map((m) => m.geometry))) emit({ type: 'relation', id: r.id, tags: r.tags, members });
}
console.error(`${count.toLocaleString('es')} áreas protegidas`);
