#!/usr/bin/env node
/**
 * Geología de Argentina, base nacional para usar sin conexión: app/public/data/geology-AR.json.
 *
 * Fuente: SEGEMAR (Servicio Geológico Minero Argentino), SIGAM, «Unidades geológicas 1:2.500.000» (Lizuain Fuentes y Panza, 2018,
 * repositorio.segemar.gob.ar/handle/308849217/3184), licencia CC BY 4.0 («se permite su uso, copia, modificación y redistribución,
 * incluidos productos derivados, reconociendo la autoría»). Servicio: https://sigam.segemar.gov.ar/geoserver217/ (las rutas viejas
 * /geoserver/ dan 500 o 403). Se simplifica a ~2 km y se junta cada unidad en un diccionario: es una base gruesa; el detalle (1:250.000)
 * se baja por zona desde el servidor (server/src/geology).
 *
 * Uso: node tools/geology-data/build-ar.mjs   (necesita conexión; el resultado se versiona)
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ringArea, simplifyRing } from '../lib/osm-geo.mjs';
import { periodColor } from './periods.mjs';

const OUT = fileURLToPath(new URL('../../app/public/data/geology-AR.json', import.meta.url));
const WFS = 'https://sigam.segemar.gov.ar/geoserver217/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=sigam:e2.5M.UnidadesGeologicas&outputFormat=application/json&srsName=EPSG:4326';
const TOL = 0.02;
const MIN_AREA = 0.004;

const res = await fetch(WFS, { signal: AbortSignal.timeout(300_000) });
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const fc = await res.json();

const units = [];
const byKey = new Map();
const polys = [];
for (const f of fc.features) {
  const p = f.properties;
  const name = (p.unidades || p.nombre || '').trim();
  if (!name || !f.geometry) continue;
  const unit = { name, litho: (p.litologia || '').trim(), from: p.edad_inf || '', to: p.edad_sup || '' };
  const key = JSON.stringify(unit);
  let i = byKey.get(key);
  if (i === undefined) {
    i = units.push({ ...unit, color: periodColor(unit.to || unit.from) }) - 1;
    byKey.set(key, i);
  }
  const parts = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const part of parts) {
    const rings = part
      .map((r) => simplifyRing(r, TOL).map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]))
      .filter((r) => r.length >= 4 && ringArea(r) > MIN_AREA);
    if (rings.length) polys.push({ u: i, p: rings.map((r) => r.flat()) });
  }
}
const data = {
  generatedAt: new Date().toISOString().slice(0, 10),
  source: 'SEGEMAR, SIGAM, Unidades geológicas 1:2.500.000 (Lizuain Fuentes y Panza 2018), CC BY 4.0',
  units,
  polys,
};
await writeFile(OUT, JSON.stringify(data));
console.log(`${units.length} unidades, ${polys.length} polígonos → ${OUT} (${JSON.stringify(data).length} bytes)`);
