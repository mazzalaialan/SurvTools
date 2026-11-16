#!/usr/bin/env node
/**
 * Geología de Chile, base nacional para usar sin conexión: app/public/data/geology-CL.json.
 *
 * Fuente: SERNAGEOMIN, Mapa Geológico de Chile 1:1.000.000, republicado por CIGIDEN en ArcGIS Online (copia de 2015, 18.935 polígonos):
 * https://services7.arcgis.com/UeyripQFTg6pfUe5/arcgis/rest/services/Mapa_Geol%C3%B3gico_de_Chile/FeatureServer/0
 * Licencia/estado: la capa de CIGIDEN no declara licencia («Autor: CIGIDEN. Fuente: SERNAGEOMIN», 11-nov-2015); el original de SERNAGEOMIN
 * dice «solo uso no comercial» (WMS de OneGeology, 2013). Existe una copia con CC BY 4.0 en Datos para Resiliencia (DOI 10.71578/LK3QWR)
 * con archivos restringidos. Decisión del proyecto: se usa mientras la app sea gratuita (interruptor para una copia paga).
 *
 * Campos usados: geo (código de unidad), composicio (litología general), epoca, periodo, era. La fuente no trae nombre de unidad ni tildes:
 * el nombre se arma como «<litología> (<código>)» y se traducen los textos (tablas de abajo). Edad: se toma de `epoca` (rango «A B» →
 * from=A, to=B); si falta, de `periodo`; si falta, de `era`; «S I» / «Sin Informacion» → vacío.
 *
 * Uso: node tools/geology-data/build-cl.mjs [carpeta con p0.geojson…pN.geojson]
 *   Sin argumento baja el Feature Service (paginación de 2000, WGS84, f=geojson). El resultado se versiona.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ringArea, simplifyRing } from '../lib/osm-geo.mjs';
import { periodColor } from './periods.mjs';

const OUT = fileURLToPath(new URL('../../app/public/data/geology-CL.json', import.meta.url));
const SVC = 'https://services7.arcgis.com/UeyripQFTg6pfUe5/arcgis/rest/services/Mapa_Geol%C3%B3gico_de_Chile/FeatureServer/0';
const TOL = 0.01; // ≈1 km
const MIN_AREA = 0.0004; // grados² (≈5 km²)

async function load(dir) {
  const feats = [];
  if (dir) {
    for (let i = 0; ; i++) {
      let t;
      try { t = await readFile(`${dir}/p${i}.geojson`, 'utf8'); } catch { break; }
      feats.push(...JSON.parse(t).features);
    }
  } else {
    for (let off = 0; ; off += 2000) {
      const r = await fetch(`${SVC}/query?where=1%3D1&outFields=*&outSR=4326&f=geojson&resultOffset=${off}&resultRecordCount=2000&orderByFields=OBJECTID`, { signal: AbortSignal.timeout(120_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const f = (await r.json()).features;
      if (!f.length) break;
      feats.push(...f);
    }
  }
  return feats;
}

// Tablas de traducción (la fuente viene sin tildes). Se busca en orden de aparición dentro del texto de `epoca`.
const EDADES = [
  ['holoceno', 'Holoceno'], ['pleistoceno', 'Pleistoceno'], ['cuaternario', 'Cuaternario'], ['plioceno', 'Plioceno'], ['mioceno', 'Mioceno'],
  ['neogeno', 'Neógeno'], ['oligoceno', 'Oligoceno'], ['eoceno', 'Eoceno'], ['paleoceno', 'Paleoceno'], ['paleogeno', 'Paleógeno'],
  ['terciario', 'Terciario'], ['cretacico', 'Cretácico'], ['campaniano', 'Cretácico'], ['maastrichtiano', 'Cretácico'], ['neocomiano', 'Cretácico'],
  ['aptiano', 'Cretácico'], ['cenomaniano', 'Cretácico'], ['jurasico', 'Jurásico'], ['triasico', 'Triásico'], ['permico', 'Pérmico'],
  ['carbonifero', 'Carbonífero'], ['devonico', 'Devónico'], ['silurico', 'Silúrico'], ['ordovicico', 'Ordovícico'], ['cambrico', 'Cámbrico'],
  ['paleozoico', 'Paleozoico'], ['mesozoico', 'Mesozoico'], ['cenozoico', 'Cenozoico'], ['precambrico', 'Precámbrico'],
];
const LITO = {
  'rocas intrusivas': 'Rocas intrusivas', 'secuencias sedimentarias': 'Secuencias sedimentarias',
  'secuencias volcanosedimenta': 'Secuencias volcanosedimentarias', 'secuencias volcanicas': 'Secuencias volcánicas',
  'rocas metamorficas': 'Rocas metamórficas',
};
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const sinDato = (s) => !s.trim() || /^(s i|sin informacion)$/.test(s.trim());

/** Nombres de edad que aparecen en el texto, en orden. */
function edades(texto) {
  const t = norm(texto);
  if (sinDato(t)) return [];
  const hits = [];
  for (const [k, v] of EDADES) { const m = new RegExp('\\b' + k + '\\b').exec(t); if (m) hits.push([m.index, v]); }
  return hits.sort((a, b) => a[0] - b[0]).map((h) => h[1]);
}
function edadDe(p) {
  for (const campo of [p.epoca, p.periodo, p.era]) {
    const e = edades(campo);
    if (e.length) return { from: e[0], to: e[e.length - 1] };
  }
  return { from: '', to: '' };
}

const feats = await load(process.argv[2]);
const units = [];
const byKey = new Map();
const polys = [];
for (const f of feats) {
  const p = f.properties;
  if (!f.geometry) continue;
  const lk = norm(p.composicio).trim();
  const litho = sinDato(lk) ? 'Sin información' : (LITO[lk] ?? String(p.composicio).trim());
  const code = String(p.geo ?? '').trim();
  const unit = { name: code ? `${litho} (${code})` : litho, litho, ...edadDe(p) };
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
      .filter((r, k) => r.length >= 4 && (k > 0 || ringArea(r) > MIN_AREA));
    if (rings.length && ringArea(rings[0]) > MIN_AREA) polys.push({ u: i, p: rings.map((r) => r.flat()) });
  }
}
const data = {
  generatedAt: new Date().toISOString().slice(0, 10),
  source: 'SERNAGEOMIN, Mapa Geológico de Chile 1:1.000.000 (vía CIGIDEN, 2015); solo uso no comercial',
  units,
  polys,
};
const s = JSON.stringify(data);
await writeFile(OUT, s);
console.log(`${units.length} unidades, ${polys.length} polígonos → ${OUT} (${s.length} bytes)`);
