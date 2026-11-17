// De `osmium export -f geojsonseq --add-unique-id=type_id` deja solo la figura de una relación (id de área = 2 × id + 1) como un GeoJSON Feature.
// Uso: node pickarea.mjs <id de la relación>. © colaboradores de OpenStreetMap, ODbL.
import { createInterface } from 'node:readline';

const want = `a${Number(process.argv[2]) * 2 + 1}`;
let found = null;
for await (const raw of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  const line = raw.replace(/^\u001e/, '').trim();
  if (!line) continue;
  try {
    const f = JSON.parse(line);
    if (String(f.id) === want) found = f;
  } catch {
    // línea cortada: se ignora
  }
}
if (!found) {
  console.error(`no se encontró la frontera ${process.argv[2]}`);
  process.exit(1);
}
process.stdout.write(JSON.stringify({ type: 'Feature', properties: {}, geometry: found.geometry }));
