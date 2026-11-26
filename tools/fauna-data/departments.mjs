/**
 * Departamentos de Argentina para el mapa de caza de cada provincia (sección Fauna).
 *
 * Uso: `node tools/fauna-data/departments.mjs ~/vikarg-fishing-work/fauna`
 *
 * Lee `ign/departamentos.json` (capa «departamento» del IGN, bajada del WFS oficial:
 * https://wms.ign.gob.ar/geoserver/ign/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=ign:departamento&outputFormat=application/json),
 * simplifica los contornos (Douglas-Peucker, ~1 km) y escribe `ign/departamentos-simple.json`: por provincia, cada departamento
 * con su nombre y sus anillos [lon, lat, …]. Licencia: IGN, CC BY 4.0 (crédito «Instituto Geográfico Nacional» en la app).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const work = process.argv[2];
if (!work) {
  console.error('Uso: node tools/fauna-data/departments.mjs <carpeta de trabajo de fauna>');
  process.exit(1);
}

/** Código INDEC de provincia (dos primeros dígitos de `in1`) → nombre como en la app. */
export const PROVINCE_CODE = {
  '02': 'Ciudad de Buenos Aires', '06': 'Buenos Aires', 10: 'Catamarca', 14: 'Córdoba', 18: 'Corrientes', 22: 'Chaco', 26: 'Chubut', 30: 'Entre Ríos', 34: 'Formosa',
  38: 'Jujuy', 42: 'La Pampa', 46: 'La Rioja', 50: 'Mendoza', 54: 'Misiones', 58: 'Neuquén', 62: 'Río Negro', 66: 'Salta', 70: 'San Juan',
  74: 'San Luis', 78: 'Santa Cruz', 82: 'Santa Fe', 86: 'Santiago del Estero', 90: 'Tucumán', 94: 'Tierra del Fuego',
};

/** Grados: ~1 km, alcanza para un mapa de una provincia en el celular. */
const TOLERANCE = 0.01;
/** Islas y anillos más chicos que esto (grados²) no se dibujan. */
const MIN_AREA = 0.0004;
const r3 = (n) => Math.round(n * 1000) / 1000;

function perpDist([x, y], [x1, y1], [x2, y2]) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = dx * dx + dy * dy;
  if (len === 0) return Math.hypot(x - x1, y - y1);
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let max = 0;
    let index = -1;
    for (let i = a + 1; i < b; i++) {
      const d = perpDist(points[i], points[a], points[b]);
      if (d > max) [max, index] = [d, i];
    }
    if (max > tolerance) {
      keep[index] = 1;
      stack.push([a, index], [index, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

const area = (ring) =>
  Math.abs(
    ring.reduce((s, [x1, y1], i) => {
      const [x2, y2] = ring[(i + 1) % ring.length];
      return s + x1 * y2 - x2 * y1;
    }, 0),
  ) / 2;

function rings(geometry) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const all = polys.map((p) => p[0]);
  const big = all.filter((r) => area(r) >= MIN_AREA);
  // Un departamento hecho solo de islas chicas (p. ej. en el Delta) conserva al menos la más grande.
  const keep = big.length ? big : [all.sort((a, b) => area(b) - area(a))[0]];
  return keep
    .map((r) => simplify(r, TOLERANCE))
    .filter((r) => r.length >= 4)
    .map((r) => r.flatMap(([lon, lat]) => [r3(lon), r3(lat)]));
}

const src = JSON.parse(readFileSync(join(work, 'ign', 'departamentos.json'), 'utf8'));
const out = {};
for (const f of src.features) {
  const code = String(f.properties.in1 ?? '');
  const province = PROVINCE_CODE[code.slice(0, 2)] ?? PROVINCE_CODE[Number(code.slice(0, 2))];
  if (!province || !f.geometry) continue;
  (out[province] ??= []).push({ id: code, name: f.properties.nam, rings: rings(f.geometry) });
}
for (const list of Object.values(out)) list.sort((a, b) => a.name.localeCompare(b.name, 'es'));
const dest = join(work, 'ign', 'departamentos-simple.json');
writeFileSync(dest, JSON.stringify({ source: 'IGN, capa «departamento» (WFS oficial), CC BY 4.0', date: new Date().toISOString().slice(0, 10), provinces: out }));
writeFileSync(join(work, 'ign', 'nombres.json'), JSON.stringify(Object.fromEntries(Object.entries(out).map(([p, l]) => [p, l.map((d) => d.name)])), null, 1));
console.log(`${Object.values(out).flat().length} departamentos en ${Object.keys(out).length} provincias → ${dest} (${Math.round(JSON.stringify(out).length / 1024)} KB)`);
