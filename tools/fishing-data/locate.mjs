// Ubica en el mapa los tramos del reglamento de pesca (ver docs/PESCA.md): busca cada río, arroyo o lago por su nombre en
// OpenStreetMap y, si el reglamento lo parte en zonas («desde la confluencia con el Varvarco hasta Balsa Huitrín»), corta el cauce
// entre los dos puntos siguiendo el río (camino más corto sobre la red de tramos del río). Los puntos de corte se escriben a mano en
// cuts.json, con lo que dice el reglamento: confluencia con otro río, salida o entrada de un lago, puente de una ruta, presa, naciente,
// desembocadura o una coordenada.
//
// Uso: node tools/fishing-data/locate.mjs <carpeta de prepare.sh> <ambientes.json> <jurisdicción> <salida.json>
// © colaboradores de OpenStreetMap, ODbL.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const [dir, ambientesFile, jurisdiction, outFile] = process.argv.slice(2);
if (!outFile) {
  console.error('Uso: node locate.mjs <carpeta> <ambientes.json> <jurisdicción> <salida.json>');
  process.exit(1);
}
const CUTS_FILE = fileURLToPath(new URL('./cuts.json', import.meta.url));
const cuts = existsSync(CUTS_FILE) ? JSON.parse(readFileSync(CUTS_FILE, 'utf8')) : {};

/** Recuadro de cada jurisdicción, con margen (los ríos compartidos se buscan con el de la jurisdicción). */
const BBOX = {
  Neuquén: [-71.95, -41.15, -67.9, -36.05],
  'Río Negro': [-72.0, -42.05, -62.7, -37.5],
  Chubut: [-72.2, -46.05, -63.5, -41.95],
  'Parques Nacionales del Sur (APN)': [-73.8, -55.2, -62.7, -36.0],
};
const box = BBOX[jurisdiction];
if (!box) throw new Error(`Jurisdicción sin recuadro: ${jurisdiction}`);
const inBox = ([x, y]) => x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3];

export const norm = (s) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(rio|r°|rº|arroyo|ao|lago|laguna|lagunas|embalse|lago embalse|del|de|la|el|los|las)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function readSeq(name) {
  const text = readFileSync(`${dir}/${name}.geojsonseq`, 'utf8');
  return text
    .split('\n')
    .map((l) => l.replace(/^\x1e/, '').trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}
const namesOf = (p) => [p.name, p['name:es'], p.alt_name, p.official_name, p.old_name].filter(Boolean).flatMap((n) => String(n).split(';'));

const rivers = readSeq('rivers').filter((f) => f.geometry.type === 'LineString' && f.geometry.coordinates.some(inBox));
// Solo lagos, lagunas y embalses: el agua de un río también es `natural=water` (con `water=river`), y como al comparar nombres se sacan
// «río» y «lago», el «Río Aluminé» se confundía con el «Lago Aluminé» (el lago salía estirado sobre el río).
const RIVER_WATER = /^(river|stream|canal|ditch|drain|oxbow|rapids|stream_pool)$/;
const lakes = readSeq('lakes').filter(
  (f) =>
    /Polygon/.test(f.geometry.type) &&
    namesOf(f.properties).length &&
    !RIVER_WATER.test(f.properties.water ?? '') &&
    !namesOf(f.properties).some((n) => /^\s*(r[ií]o|arroyo|a[°º]|canal)\b/i.test(n)) &&
    ringsOf(f.geometry).some((r) => r.some(inBox)),
);
const dams = readSeq('dams');
const places = readSeq('places').filter((f) => f.properties.name);
const bridges = readSeq('bridges').filter((f) => f.geometry.type === 'LineString' && f.geometry.coordinates.some(inBox));

function ringsOf(g) {
  if (g.type === 'Polygon') return g.coordinates;
  if (g.type === 'MultiPolygon') return g.coordinates.flat();
  return [];
}

const byName = (list, key) => list.filter((f) => namesOf(f.properties).some((n) => norm(n) === key));

// --- Distancias (equirrectangular, sirve para estas escalas) ---
const R = 6_371_000;
const rad = (d) => (d * Math.PI) / 180;
const dist = (a, b) => {
  const k = Math.cos(rad((a[1] + b[1]) / 2));
  return rad(Math.hypot((a[0] - b[0]) * k, a[1] - b[1])) * R;
};

// --- Red de un río: nodos por coordenada, aristas por segmento ---
function graphOf(ways) {
  const nodes = new Map();
  const id = (c) => `${c[0].toFixed(6)},${c[1].toFixed(6)}`;
  const add = (c) => {
    const k = id(c);
    if (!nodes.has(k)) nodes.set(k, { c, edges: [] });
    return k;
  };
  for (const w of ways) {
    const cs = w.geometry.coordinates;
    for (let i = 1; i < cs.length; i++) {
      const a = add(cs[i - 1]);
      const b = add(cs[i]);
      const d = dist(cs[i - 1], cs[i]);
      nodes.get(a).edges.push([b, d]);
      nodes.get(b).edges.push([a, d]);
    }
  }
  // En OSM un río suele estar partido (un embalse, un tramo sin nombre, un error de dibujo): se unen los extremos sueltos que quedan
  // a menos de GAP_M de otro punto del río, para que el camino por el cauce no se corte.
  const GAP_M = 300;
  const ends = [...nodes].filter(([, n]) => n.edges.length === 1);
  for (const [k, n] of ends) {
    let best = null;
    let bd = GAP_M;
    for (const [k2, n2] of nodes) {
      if (k2 === k || n.edges.some(([v]) => v === k2)) continue;
      const d = dist(n.c, n2.c);
      if (d < bd) (bd = d), (best = k2);
    }
    if (best) {
      n.edges.push([best, bd]);
      nodes.get(best).edges.push([k, bd]);
    }
  }
  return nodes;
}
function nearestNode(nodes, p) {
  let best = null;
  let bd = Infinity;
  for (const [k, n] of nodes) {
    const d = dist(n.c, p);
    if (d < bd) {
      bd = d;
      best = k;
    }
  }
  return { key: best, d: bd };
}
/** Dijkstra (sencillo: las redes de un río tienen pocos miles de nodos). */
function shortest(nodes, from) {
  const dists = new Map([[from, 0]]);
  const prev = new Map();
  const todo = new Set([from]);
  while (todo.size) {
    let u = null;
    let du = Infinity;
    for (const k of todo) if (dists.get(k) < du) (du = dists.get(k)), (u = k);
    todo.delete(u);
    for (const [v, w] of nodes.get(u).edges) {
      const nd = du + w;
      if (nd < (dists.get(v) ?? Infinity)) {
        dists.set(v, nd);
        prev.set(v, u);
        todo.add(v);
      }
    }
  }
  return { dists, prev };
}
function pathBetween(nodes, a, b) {
  const { dists, prev } = shortest(nodes, a);
  if (!dists.has(b)) return null;
  const out = [];
  for (let k = b; k; k = prev.get(k)) {
    out.push(nodes.get(k).c);
    if (k === a) break;
  }
  return out.reverse();
}
/** Nodos a los que se llega por el cauce desde `a`. */
const reachable = (nodes, a) => new Set(shortest(nodes, a).dists.keys());

/** El nodo más lejano (por el cauce) desde `a`: la naciente o la desembocadura del otro lado. */
function farthest(nodes, a) {
  const { dists } = shortest(nodes, a);
  let best = a;
  for (const [k, d] of dists) if (d > dists.get(best)) best = k;
  return best;
}

// --- Puntos de corte ---
function nearestPointOn(ways, p) {
  let best = null;
  let bd = Infinity;
  for (const w of ways) for (const c of w.geometry.coordinates) {
    const d = dist(c, p);
    if (d < bd) (bd = d), (best = c);
  }
  return { c: best, d: bd };
}
/** Punto de la red más cercano a un conjunto de coordenadas (confluencia con otro río, borde de un lago, puente, presa). */
function closestTo(nodes, coords, allowed) {
  let best = null;
  let bd = Infinity;
  for (const [k, n] of nodes) {
    if (allowed && !allowed.has(k)) continue;
    for (const c of coords) {
      const d = dist(n.c, c);
      if (d < bd) (bd = d), (best = k);
    }
  }
  return { key: best, d: bd };
}

function resolvePoint(spec, nodes, ctx) {
  if (Array.isArray(spec)) return { ...nearestNode(nodes, spec), how: 'coordenada' };
  if (spec.confluence) {
    const other = byName(rivers, norm(spec.confluence));
    if (!other.length) throw new Error(`sin río para la confluencia «${spec.confluence}»`);
    return { ...closestTo(nodes, other.flatMap((w) => w.geometry.coordinates), ctx.allowed), how: `confluencia ${spec.confluence}` };
  }
  if (spec.lake) {
    const lk = byName(lakes, norm(spec.lake));
    if (!lk.length) throw new Error(`sin lago «${spec.lake}»`);
    return { ...closestTo(nodes, lk.flatMap((l) => ringsOf(l.geometry).flat()), ctx.allowed), how: `lago ${spec.lake}` };
  }
  if (spec.bridge) {
    const want = norm(spec.bridge);
    const near = bridges.filter((b) => [b.properties.ref, b.properties.name].some((v) => v && norm(v).includes(want)));
    if (!near.length) throw new Error(`sin puente «${spec.bridge}»`);
    const r = closestTo(nodes, near.flatMap((b) => b.geometry.coordinates), ctx.allowed);
    return { ...r, how: `puente ${spec.bridge}` };
  }
  if (spec.dam) {
    const want = norm(spec.dam);
    const d = dams.filter((x) => namesOf(x.properties).some((n) => norm(n).includes(want)));
    if (!d.length) throw new Error(`sin presa «${spec.dam}»`);
    const coords = d.flatMap((x) => (x.geometry.type === 'Point' ? [x.geometry.coordinates] : x.geometry.type === 'LineString' ? x.geometry.coordinates : ringsOf(x.geometry).flat()));
    return { ...closestTo(nodes, coords, ctx.allowed), how: `presa ${spec.dam}` };
  }
  if (spec.named) {
    const want = norm(spec.named);
    const p = places.filter((x) => namesOf(x.properties).some((n) => norm(n) === want));
    if (!p.length) throw new Error(`sin lugar «${spec.named}»`);
    const coords = p.flatMap((x) => (x.geometry.type === 'Point' ? [x.geometry.coordinates] : x.geometry.type === 'LineString' ? x.geometry.coordinates : ringsOf(x.geometry).flat()));
    return { ...closestTo(nodes, coords, ctx.allowed), how: `lugar ${spec.named}` };
  }
  // El primer puente del río aguas abajo (o arriba) de otro punto: «hasta el puente carretero».
  if (spec.firstBridgeFrom) {
    const base = resolvePoint(spec.firstBridgeFrom, nodes, ctx);
    const { dists } = shortest(nodes, base.key);
    let best = null;
    let bd = Infinity;
    for (const b of bridges)
      for (const c of b.geometry.coordinates) {
        const n = nearestNode(nodes, c);
        if (n.d > 60) continue; // el puente cruza el río
        const along = dists.get(n.key);
        if (along !== undefined && along > 30 && along < bd) (bd = along), (best = n.key);
      }
    if (!best) throw new Error('sin puente sobre el río cerca de ese punto');
    return { key: best, d: 0, how: `primer puente desde ${base.how} (${Math.round(bd)} m)` };
  }
  // A cierta distancia por el cauce desde un punto, hacia otro: «2.000 m aguas abajo del puente».
  if (spec.after) {
    const base = resolvePoint(spec.after, nodes, ctx);
    const toward = resolvePoint(spec.toward, nodes, { ...ctx, allowed: reachable(nodes, base.key) });
    const path = pathBetween(nodes, base.key, toward.key);
    if (!path) throw new Error('sin cauce entre los puntos de «after»');
    let acc = 0;
    let at = path[path.length - 1];
    for (let i = 1; i < path.length; i++) {
      acc += dist(path[i - 1], path[i]);
      if (acc >= spec.m) {
        at = path[i];
        break;
      }
    }
    return { ...nearestNode(nodes, at), how: `${spec.m} m desde ${base.how}` };
  }
  // Donde el río cruza un paralelo («desde el paralelo 42°»): el punto del cauce más cerca de esa latitud.
  if (spec.lat !== undefined) {
    let best = null;
    let bd = Infinity;
    for (const [k, n] of nodes) {
      if (ctx.allowed && !ctx.allowed.has(k)) continue;
      const d = Math.abs(n.c[1] - spec.lat);
      if (d < bd) (bd = d), (best = k);
    }
    return { key: best, d: Math.round(bd * 111_000), how: `paralelo ${spec.lat}` };
  }
  if (spec.end) {
    // La naciente (o la desembocadura) es el extremo más lejano del otro punto, pero del lado contrario a `away`: si no, en un río
    // largo el «más lejano» puede quedar río abajo (la naciente del Neuquén salía en la confluencia con el Limay).
    if (!spec.away) return { key: farthest(nodes, ctx.other), d: 0, how: spec.end };
    const away = resolvePoint(spec.away, nodes, ctx);
    const fromOther = shortest(nodes, ctx.other).dists;
    const fromAway = shortest(nodes, away.key).dists;
    const base = fromAway.get(ctx.other) ?? 0;
    let best = ctx.other;
    for (const [k, d] of fromOther) {
      const da = fromAway.get(k);
      // El camino desde `away` hasta ese nodo pasa por el otro punto (está más allá, del lado de la naciente).
      if (da !== undefined && Math.abs(da - (base + d)) < 1 + d * 0.01 && d > fromOther.get(best)) best = k;
    }
    return { key: best, d: 0, how: spec.end };
  }
  throw new Error(`punto sin entender: ${JSON.stringify(spec)}`);
}

// --- Simplificación (Douglas-Peucker, ~15 m) ---
function simplify(pts, tol = 15) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let idx = -1;
    let md = 0;
    for (let i = a + 1; i < b; i++) {
      const d = segDist(pts[i], pts[a], pts[b]);
      if (d > md) (md = d), (idx = i);
    }
    if (md > tol) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}
function segDist(p, a, b) {
  const k = Math.cos(rad(p[1]));
  const ax = (a[0] - p[0]) * k, ay = a[1] - p[1], bx = (b[0] - p[0]) * k, by = b[1] - p[1];
  const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
  return rad(Math.hypot(ax + t * dx, ay + t * dy)) * R;
}
const round = (c) => [Number(c[0].toFixed(5)), Number(c[1].toFixed(5))];

/** Une los tramos de un río en líneas continuas (para «todo el río»). */
function mergeWays(ways) {
  return ways.map((w) => simplify(w.geometry.coordinates, 40).map(round)).filter((l) => l.length > 1);
}

// --- Principal ---
const ambientes = JSON.parse(readFileSync(ambientesFile, 'utf8')).filter((a) => a.jurisdiccion === jurisdiction);
const out = {};
const report = { ok: [], cut: [], missing: [], errors: [] };
for (const a of ambientes) {
  // «Wintter (o Vintter)», «Pellegrini o Mosquito», «Huillines o Bullines»: se prueba cada nombre por separado.
  const keys = [cuts[a.id]?.name ?? a.agua, ...(cuts[a.id]?.name ? [] : a.agua.replace(/[()]/g, ' ').split(/\s+o\s+|\s+y\s+|,/i))].map(norm).filter(Boolean);
  const key = keys[0];
  // Lagos, lagunas, embalses, diques y represas se buscan como cuerpos de agua (antes un «Embalse» se buscaba entre los ríos).
  const isLake = /lag|embalse|represa|dique|derivador/i.test(a.tipo_agua);
  const cut = cuts[a.id];
  if (cut?.skip) continue;
  try {
    if (isLake) {
      const lk = keys.map((k) => byName(lakes, k)).find((l) => l.length) ?? [];
      if (!lk.length) {
        report.missing.push(`${a.id} (${a.tipo_agua} ${a.agua})`);
        continue;
      }
      // El más grande con ese nombre (a veces hay charcos homónimos lejos).
      const area = (f) => ringsOf(f.geometry).reduce((n, r) => n + r.length, 0);
      const chosen = cut?.all ? lk : [lk.sort((x, y) => area(y) - area(x))[0]];
      const polys = chosen.flatMap((f) => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates));
      const geometry = polys.length === 1 ? { type: 'Polygon', coordinates: [simplify(polys[0][0], 40).map(round)] } : { type: 'MultiPolygon', coordinates: polys.map((p) => [simplify(p[0], 40).map(round)]) };
      out[a.id] = { geometry, how: 'lago por nombre', osm: chosen.map((f) => `${f.properties['@type'] ?? f.properties.type}/${f.properties['@id'] ?? f.properties.id}`) };
      report.ok.push(a.id);
      continue;
    }
    const ways = keys.map((k) => byName(rivers, k)).find((w) => w.length) ?? [];
    if (!ways.length) {
      report.missing.push(`${a.id} (${a.tipo_agua} ${a.agua})`);
      continue;
    }
    if (cut?.from || cut?.to) {
      const nodes = graphOf(ways);
      const fromSpec = cut.from ?? { end: 'naciente' };
      const toSpec = cut.to ?? { end: 'desembocadura' };
      const concrete = (s) => !s.end;
      let pa, pb;
      if (concrete(fromSpec)) pa = resolvePoint(fromSpec, nodes, {});
      if (concrete(toSpec)) pb = resolvePoint(toSpec, nodes, pa ? { allowed: reachable(nodes, pa.key) } : {});
      if (!pa) pa = resolvePoint(fromSpec, nodes, { other: pb.key });
      if (!pb) pb = resolvePoint(toSpec, nodes, { other: pa.key });
      const path = pathBetween(nodes, pa.key, pb.key);
      if (!path) throw new Error('los dos puntos no están conectados por el cauce (la red del río está cortada en OSM)');
      if (path.length < 2) throw new Error(`el tramo quedó de largo 0 (${pa.how} → ${pb.how}): falta ese pedazo del río en OSM`);
      out[a.id] = { geometry: { type: 'LineString', coordinates: simplify(path, 40).map(round) }, how: `${pa.how} → ${pb.how}`, snapM: [Math.round(pa.d), Math.round(pb.d)] };
      report.cut.push(`${a.id}: ${pa.how} (${Math.round(pa.d)} m) → ${pb.how} (${Math.round(pb.d)} m), ${(path.reduce((n, c, i) => (i ? n + dist(path[i - 1], c) : 0), 0) / 1000).toFixed(1)} km`);
      continue;
    }
    out[a.id] = { geometry: { type: 'MultiLineString', coordinates: mergeWays(ways) }, how: 'río por nombre', ways: ways.length };
    report.ok.push(a.id);
  } catch (e) {
    report.errors.push(`${a.id}: ${e.message}`);
  }
}
writeFileSync(outFile, JSON.stringify(out));
console.log(`${jurisdiction}: ${report.ok.length} enteros, ${report.cut.length} cortados, ${report.missing.length} sin encontrar, ${report.errors.length} con error`);
for (const l of report.cut) console.log('  corte', l);
for (const l of report.missing) console.log('  falta', l);
for (const l of report.errors) console.log('  error', l);
