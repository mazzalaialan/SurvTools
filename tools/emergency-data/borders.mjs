#!/usr/bin/env node
/**
 * Contorno de Argentina, Chile, Uruguay, Bolivia y Perú para saber, sin conexión, en qué país se está
 * y a qué distancia de la frontera (frecuencias de montaña de cada país):
 * app/src/modules/emergency/borders-data.json
 *
 * Fuente: Natural Earth 1:50 m, admin 0 (dominio público), v5.1.2. Precisión
 * de unos pocos km: alcanza para un umbral de 50 km.
 *
 * Uso: node tools/emergency-data/borders.mjs   (necesita conexión; el resultado se versiona)
 */

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../../app/src/modules/emergency/borders-data.json', import.meta.url));
const URL_NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_admin_0_countries.geojson';
const r3 = (n) => Math.round(n * 1e3) / 1e3;

const res = await fetch(URL_NE);
if (!res.ok) throw new Error(`Natural Earth: ${res.status}`);
const features = (await res.json()).features;
const data = { source: 'Natural Earth 1:50 m (dominio público)' };
for (const [code, a3] of [['AR', 'ARG'], ['CL', 'CHL'], ['UY', 'URY'], ['BO', 'BOL'], ['PE', 'PER'], ['PY', 'PRY']]) {
  const g = features.find((f) => f.properties.ADM0_A3 === a3).geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  // Solo el borde de cada polígono (sin huecos) y sin islotes oceánicos lejanos (Rapa Nui, Juan Fernández).
  data[code] = polys.map((p) => p[0].map(([x, y]) => [r3(x), r3(y)])).filter((ring) => ring.some(([x]) => x > -76));
}
await writeFile(OUT, JSON.stringify(data));
console.log(`AR ${data.AR.length} polígonos, CL ${data.CL.length}, UY ${data.UY.length}, BO ${data.BO.length}, PE ${data.PE.length}, PY ${data.PY.length} → ${OUT} (${JSON.stringify(data).length} bytes)`);
