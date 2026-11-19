// Como pickarea.mjs pero para varias relaciones: de `osmium export -f geojsonseq --add-unique-id=type_id` junta las figuras de las relaciones
// pedidas (id de área = 2 × id + 1) en un solo MultiPolygon GeoJSON. Uso: node pickareas.mjs <id> [<id>...]. Falla si falta alguna.
// © colaboradores de OpenStreetMap, ODbL.
import { createInterface } from 'node:readline';

const ids = process.argv.slice(2).map((n) => `a${Number(n) * 2 + 1}`);
const found = new Map();
for await (const raw of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  const line = raw.replace(/^\u001e/, '').trim();
  if (!line) continue;
  try {
    const f = JSON.parse(line);
    if (ids.includes(String(f.id))) found.set(String(f.id), f.geometry);
  } catch {
    // línea cortada: se ignora
  }
}
const missing = ids.filter((i) => !found.has(i));
if (missing.length) {
  console.error(`no se encontraron las fronteras ${missing.join(' ')}`);
  process.exit(1);
}
const polygons = [];
for (const g of found.values()) {
  if (g.type === 'Polygon') polygons.push(g.coordinates);
  else if (g.type === 'MultiPolygon') polygons.push(...g.coordinates);
}
process.stdout.write(JSON.stringify({ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: polygons } }));
console.error(`${found.size} fronteras, ${polygons.length} polígonos`);
