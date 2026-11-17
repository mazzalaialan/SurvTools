// Ríos con nombre de OpenStreetMap cerca de las estaciones de nivel de ríos (los que usa tools/geo-data): deja los caminos `waterway=river` que
// pasan a menos de `radio` metros de alguna estación, con la forma de Overpass `out geom tags`. Hay 25 millones de nodos de ríos en Sudamérica:
// solo se guardan los cercanos a las estaciones. La primera línea lleva una huella de la lista de estaciones, para que geo-data sepa si el
// archivo todavía vale. Uso: node nearRivers.mjs <radio en metros> <estaciones.json>… (GeoJSON de osmium por la entrada estándar).
// © colaboradores de OpenStreetMap, ODbL.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const [radiusArg, ...files] = process.argv.slice(2);
const radiusM = Number(radiusArg);
const stations = files.flatMap((f) => JSON.parse(readFileSync(f, 'utf8')).stations);
/** La misma huella que calcula tools/lib/osm-local.mjs (`stationsKey`). */
const key = createHash('sha1').update(stations.map((s) => `${s.lat.toFixed(5)},${s.lon.toFixed(5)}`).sort().join(';')).digest('hex');

const dLat = radiusM / 111_000;
// Cuadrícula de 0,2° para no comparar contra todas las estaciones en cada vértice.
const grid = new Map();
const cell = (lat, lon) => `${Math.floor(lat * 5)},${Math.floor(lon * 5)}`;
for (const s of stations) {
  const c = cell(s.lat, s.lon);
  grid.set(c, [...(grid.get(c) ?? []), s]);
}
const near = (lat, lon) => {
  const cy = Math.floor(lat * 5);
  const cx = Math.floor(lon * 5);
  for (let y = cy - 1; y <= cy + 1; y++) {
    for (let x = cx - 1; x <= cx + 1; x++) {
      for (const s of grid.get(`${y},${x}`) ?? []) {
        const d = Math.hypot((lat - s.lat) * 111_000, (lon - s.lon) * 111_000 * Math.cos((s.lat * Math.PI) / 180));
        if (d <= radiusM) return true;
      }
    }
  }
  return false;
};
void dLat;

process.stdout.write(`${JSON.stringify({ meta: { stations: key, radiusM } })}\n`);
let n = 0;
for await (const raw of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  const line = raw.replace(/^\u001e/, '').trim();
  if (!line) continue;
  let f;
  try {
    f = JSON.parse(line);
  } catch {
    continue;
  }
  const t = f.properties ?? {};
  const coords = f.geometry?.type === 'LineString' ? f.geometry.coordinates : null;
  if (!coords || !t.name || t.waterway !== 'river' || !coords.some(([lon, lat]) => near(lat, lon))) continue;
  const id = Number(String(f.id ?? '').slice(1));
  process.stdout.write(`${JSON.stringify({ type: 'way', id, tags: t, geometry: coords.map(([lon, lat]) => ({ lat, lon })) })}\n`);
  n++;
}
console.error(`${n.toLocaleString('es')} ríos cerca de las estaciones`);
