// Carga en SQLite lo que sale de `osmium export -f geojsonseq` (una figura por línea, por la entrada estándar).
// Uso: node import.mjs <base.sqlite> <roads|numbers|milestones|places>   (build.sh lo llama tres veces)
// © OpenStreetMap contributors, ODbL.
import { createInterface } from 'node:readline';
import { DatabaseSync } from 'node:sqlite';

const [dbPath, kind] = process.argv.slice(2);
if (!dbPath || !['roads', 'numbers', 'milestones', 'places'].includes(kind)) {
  console.error('Uso: node import.mjs <base.sqlite> <roads|numbers|milestones|places>');
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
  CREATE TABLE IF NOT EXISTS place (cell INTEGER, lat REAL, lon REAL, cat TEXT, osm TEXT, tags TEXT);
`);
const insRoad = db.prepare('INSERT INTO road VALUES (?, ?, ?, ?, ?, ?)');
const insNum = db.prepare('INSERT INTO num VALUES (?, ?, ?, ?, ?)');
const insMile = db.prepare('INSERT INTO mile VALUES (?, ?, ?, ?, ?)');
const insPlace = db.prepare('INSERT INTO place VALUES (?, ?, ?, ?, ?, ?)');

/** Un punto representativo de la figura (el promedio de los vértices del contorno, para los edificios). */
function pointOf(g) {
  if (g.type === 'Point') return g.coordinates;
  const ring = g.type === 'Polygon' ? g.coordinates[0] : g.type === 'MultiPolygon' ? g.coordinates[0]?.[0] : null;
  if (!ring?.length) return null;
  const s = ring.reduce((a, c) => [a[0] + c[0], a[1] + c[1]], [0, 0]);
  return [s[0] / ring.length, s[1] / ring.length];
}

/**
 * Categorías de «Buscar cercanos»: las mismas etiquetas que app/src/modules/emergency/osm.ts (`osmKind`, `SERVICE_SELECTORS` y
 * `NAUTICAL_SELECTORS`). `core` es lo que se pide siempre (policía, bomberos, salud, Defensa Civil); el resto, solo al elegir esa categoría.
 */
function placeCats(t) {
  const cats = [];
  const a = t.amenity;
  if (['police', 'fire_station', 'hospital', 'clinic'].includes(a) || t.emergency === 'ambulance_station' || (t.office === 'government' && /Defensa Civil|Protecci.n Civil/i.test(t.name ?? ''))) cats.push('core');
  if (a === 'fuel') cats.push('fuel');
  if (t.shop === 'tyres') cats.push('tyres');
  if (t.shop === 'car_repair') cats.push('repair');
  if (a === 'pharmacy' || t.healthcare === 'pharmacy') cats.push('pharmacy');
  if (t.emergency === 'defibrillator') cats.push('aed');
  if (a === 'veterinary') cats.push('vet');
  if (a === 'drinking_water' || a === 'water_point' || (t.man_made === 'water_tap' && t.drinking_water === 'yes') || t.natural === 'spring') cats.push('water');
  if (t.tourism === 'alpine_hut' || t.tourism === 'wilderness_hut' || (a === 'shelter' && /^(basic_hut|lean_to|rock_shelter|weather_shelter)$/.test(t.shelter_type ?? ''))) cats.push('shelter');
  if (a === 'atm' || (a === 'bank' && t.atm === 'yes')) cats.push('atm');
  if (
    t.waterway === 'fuel' || (a === 'fuel' && (t.boat === 'yes' || t.marine === 'yes')) || t.leisure === 'marina' || t.leisure === 'slipway' ||
    a === 'boat_storage' || a === 'boat_rental' || /^(boat|boat_repair|ship_chandler)$/.test(t.shop ?? '') || t.craft === 'boatbuilder' ||
    (t.mooring && t.mooring !== 'no') || t['seamark:type'] === 'mooring' || (t.man_made === 'pier' && t.name && !/^(private|no)$/.test(t.access ?? ''))
  ) cats.push('nautical');
  return cats;
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
  } else if (kind === 'places') {
    const c = pointOf(g);
    if (!c) continue;
    const cats = placeCats(p);
    if (cats.length === 0) continue;
    // `id` es «n123», «w456» o «r789» (osmium --add-unique-id=type_id).
    const tags = JSON.stringify(p);
    for (const cat of cats) {
      insPlace.run(cellOf(c[1], c[0]), c[1], c[0], cat, String(f.id ?? ''), tags);
      n++;
    }
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
