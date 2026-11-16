#!/usr/bin/env node
/**
 * Ecorregiones de Argentina, Chile, Uruguay, Bolivia, Perú y Paraguay para usar sin conexión: app/public/data/ecoregions.json.
 *
 * Fuente: RESOLVE Ecoregions 2017 (Dinerstein et al. 2017, BioScience 67(6), «An Ecoregion-Based Approach to Protecting Half the
 * Terrestrial Realm»), licencia CC BY 4.0 (el propio archivo trae LICENSE = «CC-BY 4.0»): https://ecoregions.appspot.com
 * Se citan los autores en la app (capa del mapa y ficha). Se conservan las partes de cada ecorregión que tocan alguno de los seis países,
 * simplificadas a ~1 km (el mapa es de referencia: los límites reales entre ecorregiones son graduales).
 *
 * Los nombres de las ecorregiones y los biomas se traducen acá (TRADUCCIONES): los demás datos son los del original.
 *
 * Uso: node tools/eco-data/build.mjs [ruta/a/Ecoregions2017.zip]   (sin ruta, la baja de
 *      https://storage.googleapis.com/teow2016/Ecoregions2017.zip, unos 150 MB; el resultado se versiona)
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { simplifyRing, ringArea, inRing } from '../lib/osm-geo.mjs';
import { TRADUCCIONES, BIOMAS } from './names.mjs';

const require = createRequire(new URL('../../app/package.json', import.meta.url));
const { unzipSync } = require('fflate');
const OUT = process.env.VIKARG_DATA_OUT ? `${process.env.VIKARG_DATA_OUT.replace(/\/$/, '')}/ecoregions.json` : fileURLToPath(new URL('../../app/public/data/ecoregions.json', import.meta.url));
const URL_ZIP = 'https://storage.googleapis.com/teow2016/Ecoregions2017.zip';
const TOL = 0.01;
/** Con `--continente`: [oeste, sur, este, norte] de lo que se conserva (América del Sur, Panamá y la Península Antártica). */
const CONTINENT = process.argv.includes('--continente') ? [-95, -90, -30, 13] : null;
/** Islas de Chile sin frontera en el mapa de países: Juan Fernández y San Félix-San Ambrosio. */
const EXTRA_IDS = new Set(['560', '562']);
const TOL_FAR = 0.02;
const MIN_AREA = 0.002; // grados²: sin islotes ni manchas minúsculas

async function zipBytes() {
  const arg = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (arg) return readFile(arg);
  const cached = `${tmpdir()}/Ecoregions2017.zip`;
  if (existsSync(cached)) return readFile(cached);
  const res = await fetch(URL_ZIP);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(cached, buf);
  return buf;
}

/** Polígonos del .shp (tipo 5) en el orden de los registros. */
function readShp(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const out = [];
  let o = 100;
  while (o + 8 <= buf.length) {
    const len = dv.getInt32(o + 4) * 2;
    const at = o + 8;
    const type = dv.getInt32(at, true);
    if (type === 5) {
      const nParts = dv.getInt32(at + 36, true);
      const nPts = dv.getInt32(at + 40, true);
      const parts = Array.from({ length: nParts }, (_, i) => dv.getInt32(at + 44 + 4 * i, true));
      const p0 = at + 44 + 4 * nParts;
      const rings = parts.map((s, i) => {
        const e = i + 1 < nParts ? parts[i + 1] : nPts;
        const r = [];
        for (let k = s; k < e; k++) r.push([dv.getFloat64(p0 + 16 * k, true), dv.getFloat64(p0 + 16 * k + 8, true)]);
        return r;
      });
      out.push(rings);
    } else out.push([]);
    o = at + len;
  }
  return out;
}

/** Atributos del .dbf (texto en latin1). */
function readDbf(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const n = dv.getUint32(4, true);
  const headLen = dv.getUint16(8, true);
  const recLen = dv.getUint16(10, true);
  const fields = [];
  for (let o = 32; buf[o] !== 0x0d; o += 32) fields.push({ name: buf.toString('latin1', o, o + 11).replace(/\0.*$/, ''), len: buf[o + 16] });
  const rows = [];
  for (let i = 0; i < n; i++) {
    let o = headLen + i * recLen + 1;
    const row = {};
    for (const f of fields) {
      row[f.name] = buf.toString('latin1', o, o + f.len).trim();
      o += f.len;
    }
    rows.push(row);
  }
  return rows;
}

/** Orden del anillo: externo (horario en el .shp) o hueco. */
const signedArea = (r) => r.reduce((s, [x, y], i) => { const [x2, y2] = r[(i + 1) % r.length]; return s + x * y2 - x2 * y; }, 0);

const zip = unzipSync(new Uint8Array(await zipBytes()));
const shpName = Object.keys(zip).find((n) => n.endsWith('.shp'));
const base = shpName.replace(/\.shp$/, '');
const geoms = readShp(Buffer.from(zip[shpName]));
const attrs = readDbf(Buffer.from(zip[`${base}.dbf`]));

const borders = JSON.parse(await readFile(new URL('../../app/src/modules/emergency/borders-data.json', import.meta.url), 'utf8'));
const countryRings = ['AR', 'CL', 'UY', 'BO', 'PE', 'PY'].flatMap((c) => borders[c]);
const bbox = (r) => r.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
const boxes = countryRings.map((r) => ({ r, b: bbox(r) }));
const inCountries = ([x, y]) => boxes.some(({ r, b }) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3] && inRing(r, [x, y]));

/** ¿La parte toca alguno de los seis países? (algún vértice o el centro de su caja adentro). */
const touchesSix = (p) => {
  const b = bbox(p[0]);
  return p[0].some((pt, k) => k % 7 === 0 && inCountries(pt)) || inCountries([(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]);
};

const ecoregions = [];
const missing = new Set();
for (let i = 0; i < geoms.length; i++) {
  // Cada polígono: borde + huecos (el .shp los lista seguidos: horario = borde, antihorario = hueco).
  const polys = [];
  for (const ring of geoms[i]) {
    if (signedArea(ring) < 0) polys.push([ring]);
    else if (polys.length) polys.at(-1).push(ring);
  }
  // Solo lo que toca alguno de los seis países (algún vértice o el centro de su caja adentro).
  const kept = polys.filter((p) => {
    if (EXTRA_IDS.has(attrs[i].ECO_ID)) return true;
    // `--continente`: toda América del Sur y la Antártida (sector de la Península), sin limitarse a los seis países.
    if (CONTINENT) {
      const b = bbox(p[0]);
      return b[2] > CONTINENT[0] && b[0] < CONTINENT[2] && b[3] > CONTINENT[1] && b[1] < CONTINENT[3];
    }
    const b = bbox(p[0]);
    if (b[2] < -83 || b[0] > -34 || b[3] < -56 || b[1] > 0.5) return false;
    return p[0].some((pt, k) => k % 7 === 0 && inCountries(pt)) || inCountries([(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]);
  });
  if (!kept.length) continue;
  const a = attrs[i];
  const name = a.ECO_NAME.replace(/\uFFFD/g, '?');
  const tr = TRADUCCIONES[a.ECO_ID] ?? null;
  if (!tr) missing.add(`${a.ECO_ID} ${a.ECO_NAME}`);
  const rings = kept
    // Fuera de los seis países (solo con --continente) alcanza con 2 km: el archivo pesa menos.
    .map((p) => p.map((r) => simplifyRing(r, CONTINENT && !touchesSix(p) ? TOL_FAR : TOL).map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000])).filter((r) => r.length >= 4 && ringArea(r) > MIN_AREA))
    .filter((p) => p.length);
  if (!rings.length) continue;
  ecoregions.push({
    id: Number(a.ECO_ID),
    name: name,
    nameEs: tr ?? name,
    biome: a.ECO_ID === '0' ? 99 : Number(a.BIOME_NUM),
    color: a.COLOR,
    // Planos: [lon, lat, lon, lat, …] por anillo (más chico que pares anidados).
    polys: rings.map((p) => p.map((r) => r.flat())),
  });
}
if (missing.size) console.warn('Sin traducción:\n' + [...missing].join('\n'));
ecoregions.sort((a, b) => a.id - b.id);
const data = {
  generatedAt: new Date().toISOString().slice(0, 10),
  source: 'RESOLVE Ecoregions 2017: Dinerstein et al. (2017), BioScience 67(6):534-545, CC BY 4.0 (ecoregions.appspot.com)',
  biomes: BIOMAS,
  ecoregions,
};
await writeFile(OUT, JSON.stringify(data));
console.log(`${ecoregions.length} ecorregiones → ${OUT} (${JSON.stringify(data).length} bytes)`);
console.log(ecoregions.map((e) => `${e.id} ${e.name}`).join('\n'));
