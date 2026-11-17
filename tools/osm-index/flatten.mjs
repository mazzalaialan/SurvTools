// De `osmium export -f geojsonseq --add-unique-id=type_id` a una línea JSON por elemento: {id, lat, lon, tags}.
// Los polígonos (edificios, áreas) quedan como el promedio de los vértices de su contorno. © colaboradores de OpenStreetMap, ODbL.
import { createInterface } from 'node:readline';

function pointOf(g) {
  if (g.type === 'Point') return g.coordinates;
  const ring = g.type === 'Polygon' ? g.coordinates[0] : g.type === 'MultiPolygon' ? g.coordinates[0]?.[0] : null;
  if (!ring?.length) return null;
  const s = ring.reduce((a, c) => [a[0] + c[0], a[1] + c[1]], [0, 0]);
  return [s[0] / ring.length, s[1] / ring.length];
}

/** Los nodos que solo acompañan a un camino o a un edificio no traen ninguna de estas etiquetas: se descartan. */
const KEYS = ['amenity', 'healthcare', 'emergency', 'shop', 'man_made', 'natural', 'tourism', 'waterway', 'leisure', 'craft', 'mooring', 'seamark:type'];

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
  if (!KEYS.some((k) => f.properties?.[k] !== undefined)) continue;
  const c = f.geometry ? pointOf(f.geometry) : null;
  if (!c) continue;
  process.stdout.write(`${JSON.stringify({ id: String(f.id ?? ''), lat: Math.round(c[1] * 1e6) / 1e6, lon: Math.round(c[0] * 1e6) / 1e6, tags: f.properties ?? {} })}\n`);
  n++;
}
console.error(`${n.toLocaleString('es')} elementos`);
