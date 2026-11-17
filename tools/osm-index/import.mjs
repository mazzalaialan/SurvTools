// Carga en SQLite lo que sale de `osmium export -f geojsonseq` (una figura por línea, por la entrada estándar).
// Uso: node import.mjs <base.sqlite> <roads|numbers|milestones>   (build.sh lo llama tres veces)
// © OpenStreetMap contributors, ODbL.
import { createInterface } from 'node:readline';
import { DatabaseSync } from 'node:sqlite';

const [dbPath, kind] = process.argv.slice(2);
if (!dbPath || !['roads', 'numbers', 'milestones'].includes(kind)) {
  console.error('Uso: node import.mjs <base.sqlite> <roads|numbers|milestones>');
  process.exit(2);
}

/** Misma celda que server/src/osm/around.ts (0,02° ≈ 2,2 km). */
const cellOf = (lat, lon) => Math.floor((lat + 90) * 50) * 20000 + Math.floor((lon + 180) * 50);
const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;
function meters(a, b) {
  const x = rad(b[0] - a[0]) * Math.cos(rad((a[1] + b[1]) / 2));
  const y = rad(b[1] - a[1]);
  return R * Math.hypot(x, y);
}

const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF;
  CREATE TABLE IF NOT EXISTS road (cell INTEGER, lat REAL, lon REAL, name TEXT, ref TEXT, hw TEXT);
  CREATE TABLE IF NOT EXISTS num (cell INTEGER, lat REAL, lon REAL, street TEXT, number TEXT);
  CREATE TABLE IF NOT EXISTS mile (cell INTEGER, lat REAL, lon REAL, km TEXT, ref TEXT);
`);
const insRoad = db.prepare('INSERT INTO road VALUES (?, ?, ?, ?, ?, ?)');
const insNum = db.prepare('INSERT INTO num VALUES (?, ?, ?, ?, ?)');
const insMile = db.prepare('INSERT INTO mile VALUES (?, ?, ?, ?, ?)');

/** Un punto representativo de la figura (el promedio de los vértices del contorno, para los edificios). */
function pointOf(g) {
  if (g.type === 'Point') return g.coordinates;
  const ring = g.type === 'Polygon' ? g.coordinates[0] : g.type === 'MultiPolygon' ? g.coordinates[0]?.[0] : null;
  if (!ring?.length) return null;
  const s = ring.reduce((a, c) => [a[0] + c[0], a[1] + c[1]], [0, 0]);
  return [s[0] / ring.length, s[1] / ring.length];
}

let n = 0;
db.exec('BEGIN');
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const raw of rl) {
  const line = raw.replace(/^\u001e/, '').trim();
  if (!line) continue;
  let f;
  try {
    f = JSON.parse(line);
  } catch {
    continue;
  }
  const p = f.properties ?? {};
  const g = f.geometry;
  if (!g) continue;
  if (kind === 'roads') {
    if (g.type !== 'LineString' || (!p.name && !p.ref)) continue;
    // Se guardan vértices a no menos de 40 m uno de otro (y el último): alcanza para «a menos de 120 m de la calle».
    let last = null;
    const pts = g.coordinates;
    pts.forEach((c, i) => {
      if (last && meters(last, c) < 40 && i !== pts.length - 1) return;
      insRoad.run(cellOf(c[1], c[0]), c[1], c[0], p.name ?? null, p.ref ?? null, p.highway ?? null);
      last = c;
      n++;
    });
  } else if (kind === 'numbers') {
    const c = pointOf(g);
    if (!c || !p['addr:housenumber'] || !p['addr:street']) continue;
    insNum.run(cellOf(c[1], c[0]), c[1], c[0], p['addr:street'], p['addr:housenumber']);
    n++;
  } else {
    const c = pointOf(g);
    const km = p.distance ?? p.pk ?? p.name;
    if (!c || !km) continue;
    insMile.run(cellOf(c[1], c[0]), c[1], c[0], String(km), p.ref ?? p['highway:ref'] ?? null);
    n++;
  }
}
db.exec('COMMIT');
console.error(`${kind}: ${n.toLocaleString('es')} filas`);
db.close();
