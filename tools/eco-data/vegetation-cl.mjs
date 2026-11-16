#!/usr/bin/env node
/**
 * Pisos de vegetación de Chile para usar sin conexión (ecorregión «fina» de Chile): app/public/data/vegetation-CL.json.
 *
 * Fuente: Luebert, F. y Pliscoff, P. (2021). «Supplementary data to The vegetation of Chile and the EcoVeg approach in the context of the
 * International Vegetation Classification project» (archivo Shape_Macrogroups.rar, shapefile «Shapefile_Macrogroups»). Zenodo,
 * https://doi.org/10.5281/zenodo.4711540 · licencia CC BY 4.0 (confirmada en la API de Zenodo, publicado el 2021-04-22).
 * Los pisos se citan con sus autores en la app. Un piso = un registro de Code_VegBe (P1 a P125); el dato trae 126 registros y uno viene vacío.
 *
 * Campos usados del .dbf (UTF-8, según el .cpg): Code_VegBe (id = número tras la «P»), Name_VegBe (nombre original, en inglés),
 * Formation (para agrupar). Los nombres se traducen acá por plantilla (tipo + zona + clima + «de» + especies, que se conservan).
 *
 * El origen es un .rar (Zenodo no da zip). Extraerlo primero con unar:
 *   mkdir -p /tmp/veg && curl -L -o /tmp/veg/m.rar https://zenodo.org/api/records/4711540/files/Shape_Macrogroups.rar/content
 *   unar -o /tmp/veg/x /tmp/veg/m.rar
 *
 * Uso: node tools/eco-data/vegetation-cl.mjs <carpeta con el shapefile extraído | ruta al .shp>   (el resultado se versiona)
 *      Sin argumento busca /tmp/veg/x. Variables: VEG_TOL (tolerancia en grados, 0,005) y VEG_MIN_AREA (grados² mínimos, 0,0006).
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { simplifyRing, ringArea } from '../lib/osm-geo.mjs';

const OUT = process.env.VIKARG_DATA_OUT ? `${process.env.VIKARG_DATA_OUT.replace(/\/$/, '')}/vegetation-CL.json` : fileURLToPath(new URL('../../app/public/data/vegetation-CL.json', import.meta.url));
const TOL = Number(process.env.VEG_TOL ?? 0.005);
const MIN_AREA = Number(process.env.VEG_MIN_AREA ?? 0.0006); // grados² (~7 km²): sin islotes ni manchas minúsculas

/** Busca el .shp en la carpeta (o en una subcarpeta). */
async function findShp(p) {
  if (p.endsWith('.shp')) return p;
  for (const e of await readdir(p, { withFileTypes: true })) {
    if (e.isFile() && e.name.endsWith('.shp')) return `${p}/${e.name}`;
    if (e.isDirectory()) { const r = await findShp(`${p}/${e.name}`).catch(() => null); if (r) return r; }
  }
  throw new Error(`No hay .shp en ${p}`);
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
      out.push(parts.map((s, i) => {
        const e = i + 1 < nParts ? parts[i + 1] : nPts;
        const r = [];
        for (let k = s; k < e; k++) r.push([dv.getFloat64(p0 + 16 * k, true), dv.getFloat64(p0 + 16 * k + 8, true)]);
        return r;
      }));
    } else out.push([]);
    o = at + len;
  }
  return out;
}

/** Atributos del .dbf. La codificación sale del .cpg (acá UTF-8; con latin1 se rompen las tildes). */
function readDbf(buf, enc) {
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
    for (const f of fields) { row[f.name] = buf.toString(enc, o, o + f.len).trim(); o += f.len; }
    rows.push(row);
  }
  return rows;
}

/** Anillo externo (horario, área firmada negativa) o hueco. */
const signedArea = (r) => r.reduce((s, [x, y], i) => { const [x2, y2] = r[(i + 1) % r.length]; return s + x * y2 - x2 * y; }, 0);

// ---------- Traducción por plantilla ----------
// Tipos de vegetación: [singular/plural en español, género]. Más largos primero para que no gane «forest» sobre «coniferous forest».
const TIPOS = [
  ['desert dwarf scrub', 'matorral desértico enano', 'm'],
  ['sclerophyllous arborescent shrubland', 'matorral arborescente esclerófilo', 'm'],
  ['arborescent shrubland', 'matorral arborescente', 'm'],
  ['deciduous shrubland', 'matorral caducifolio', 'm'],
  ['evergreen shrubland', 'matorral siempreverde', 'm'],
  ['deciduous forest', 'bosque caducifolio', 'm'],
  ['evergreen forest', 'bosque siempreverde', 'm'],
  ['sclerophyllous forest', 'bosque esclerófilo', 'm'],
  ['coniferous forest', 'bosque de coníferas', 'm'],
  ['lauriphyllous forest', 'bosque laurifolio', 'm'],
  ['thorny forest', 'bosque espinoso', 'm'],
  ['mixed forest', 'bosque mixto', 'm'],
  ['mixed', 'bosque mixto', 'm'],
  ['desert scrub', 'matorral desértico', 'm'],
  ['thorny scrub', 'matorral espinoso', 'm'],
  ['dwarf scrub', 'matorral enano', 'm'],
  ['forb vegetation', 'vegetación herbácea', 'f'],
  ['ephemeral forb vegetation', 'vegetación herbácea efímera', 'f'],
  ['shrubland', 'matorral', 'm'],
  ['steppe', 'estepa', 'f'],
  ['moorland', 'turbal', 'm'],
  ['dunes', 'dunas', 'fp'],
].sort((a, b) => b[0].length - a[0].length);
const CLIMAS = { Tropical: ['tropical', 'tropical'], Mediterranean: ['mediterráneo', 'mediterránea'], Temperate: ['templado', 'templada'], Antiboreal: ['antiboreal', 'antiboreal'] };
const ZONAS = { interior: ['interior', 'interior'], coastal: ['costero', 'costera'], Andean: ['andino', 'andina'], eastern: ['oriental', 'oriental'] };

function traducir(name) {
  const n = name.replace(/\s*\(\*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  if (/^Tropical interior desert with sparse vegetation$/.test(n)) return 'Desierto tropical interior con vegetación escasa';
  const m = n.match(/^(\S+) (?:(interior|coastal|Andean|eastern) )?(.+?) of (.+)$/);
  if (!m) throw new Error(`Nombre sin traducir: ${n}`);
  const [, clima, zona, tipo, especies] = m;
  const t = TIPOS.find((x) => x[0] === tipo) ?? TIPOS.find((x) => x[0] === tipo.replace(/^coastal /, ''));
  if (!t) throw new Error(`Tipo sin traducir: ${tipo} (${n})`);
  const g = t[2].startsWith('f') ? 1 : 0;
  const climaEs = clima.split('-').map((c) => (CLIMAS[c] ?? (() => { throw new Error(`Clima: ${c}`); })())[g]).join('-');
  const zonaEs = zona ? ZONAS[zona][g] : '';
  const pl = t[2] === 'fp';
  const adj = (s) => (pl ? s.replace(/o$/, 'a').replace(/a$/, 'as').replace(/(l|r)$/, '$1es') : s);
  const txt = [t[1], zonaEs && adj(zonaEs), adj(climaEs)].filter(Boolean).join(' ');
  const out = `${txt} de ${especies}`.replace(/\s+/g, ' ');
  return out[0].toUpperCase() + out.slice(1);
}

// ---------- Grupos (formaciones) y colores ----------
const GRUPOS = {
  1: ['Bosque antiboreal magallánico (lenga, coihue de Magallanes)', 18],
  2: ['Bosque caducifolio (roble, raulí, hualo, lenga)', 100],
  3: ['Bosque siempreverde y laurifolio templado', 140],
  4: ['Bosque de coníferas (araucaria, alerce, ciprés)', 165],
  5: ['Bosque esclerófilo mediterráneo', 75],
  6: ['Matorral y espinal mediterráneo', 52],
  7: ['Desierto y matorral desértico', 38],
  8: ['Salares y tamarugal', 190],
  9: ['Matorral enano altoandino y puna', 28],
  10: ['Vegetación altoandina templada y mediterránea', 45],
  11: ['Estepa patagónica oriental', 60],
  12: ['Turbales y tundra magallánica', 205],
};
const BASE = { // [matiz, saturación %, luminosidad %]
  1: [150, 35, 32], 2: [95, 45, 38], 3: [145, 55, 26], 4: [165, 45, 22], 5: [75, 40, 36], 6: [45, 45, 52], 7: [35, 55, 66],
  8: [195, 25, 78], 9: [28, 35, 55], 10: [20, 12, 72], 11: [52, 55, 62], 12: [205, 30, 52],
};
function grupo(name, formation) {
  const n = name.toLowerCase();
  if (formation === 'Boreal Forest & Woodland') return 1;
  if (formation === 'Mediterranean Forest & Woodland') return n.includes('deciduous') ? 2 : 5;
  if (formation === 'Cool Temperate Forest & Woodland') {
    if (n.includes('coniferous')) return 4;
    if (n.includes('deciduous')) return 2;
    return 3;
  }
  if (formation === 'Mediterranean Scrub & Grassland') return 6;
  if (formation === 'Warm Desert & Semi-Desert Scrub & Grassland') return 7;
  if (formation === 'Salt Marsh') return 8;
  if (formation === 'Tropical High Montane Scrub & Grassland') return 9;
  if (formation === 'Cool Semi-Desert Scrub & Grassland' || formation === 'Temperate & Boreal Alpine Tundra') return 10;
  if (formation === 'Temperate Grassland & Shrubland') return 11;
  if (formation.startsWith('Temperate to Polar Bog')) return 12;
  throw new Error(`Formación sin grupo: ${formation}`);
}
function hsl([h, s, l]) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)))).toString(16).padStart(2, '0');
  return `#${f(0)}${f(8)}${f(4)}`;
}

// ---------- Proceso ----------
const arg = process.argv[2] ?? '/tmp/veg/x';
if (!existsSync(arg)) throw new Error(`No existe ${arg}: extraé el .rar con unar (ver encabezado)`);
const shpPath = await findShp(statSync(arg).isDirectory() ? arg : arg);
const base = shpPath.replace(/\.shp$/, '');
const cpg = existsSync(`${base}.cpg`) ? (await readFile(`${base}.cpg`, 'utf8')).trim().toUpperCase() : 'UTF-8';
const geoms = readShp(await readFile(shpPath));
const attrs = readDbf(await readFile(`${base}.dbf`), cpg.includes('1252') || cpg.includes('LATIN') ? 'latin1' : 'utf8');

const porGrupo = {};
const pisos = [];
for (let i = 0; i < geoms.length; i++) {
  const a = attrs[i];
  if (!/^P\d+$/.test(a.Code_VegBe)) { console.warn(`Registro ${i} sin código (se omite): ${JSON.stringify(a.Name_VegBe)}`); continue; }
  const id = Number(a.Code_VegBe.slice(1));
  const polys = [];
  for (const ring of geoms[i]) {
    if (signedArea(ring) < 0) polys.push([ring]);
    else if (polys.length) polys.at(-1).push(ring);
  }
  const rings = polys
    .map((p) => p.map((r) => simplifyRing(r, TOL).map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000])).filter((r, k) => r.length >= 4 && ringArea(r) > (k === 0 ? MIN_AREA : MIN_AREA / 2)))
    .filter((p) => p.length && ringArea(p[0]) > MIN_AREA && p[0].length >= 4 && p[0].length % 1 === 0);
  if (!rings.length) { console.warn(`${a.Code_VegBe} sin polígonos tras simplificar`); continue; }
  const biome = grupo(a.Name_VegBe, a.Formation);
  (porGrupo[biome] ??= []).push(id);
  pisos.push({ id, name: a.Name_VegBe.replace(/\s+/g, ' '), nameEs: traducir(a.Name_VegBe), biome, polys: rings.map((p) => p.map((r) => r.flat())) });
}
for (const p of pisos) {
  const ids = porGrupo[p.biome].sort((x, y) => x - y);
  const k = ids.indexOf(p.id);
  const [h, s, l] = BASE[p.biome];
  const d = ids.length > 1 ? k / (ids.length - 1) - 0.5 : 0; // -0,5 a +0,5
  p.color = hsl([(h + d * 14 + 360) % 360, s, Math.max(12, Math.min(88, l + d * 12))]);
}
pisos.sort((a, b) => a.id - b.id);
const biomes = Object.fromEntries(Object.entries(GRUPOS).filter(([n]) => porGrupo[n]).map(([n, [txt]]) => [n, txt]));
const data = {
  generatedAt: new Date().toISOString().slice(0, 10),
  source: 'Luebert, F. y Pliscoff, P. (2021). Supplementary data to The vegetation of Chile and the EcoVeg approach in the context of the International Vegetation Classification project (pisos de vegetación, shapefile Macrogroups). Zenodo, doi:10.5281/zenodo.4711540, CC BY 4.0',
  biomes,
  ecoregions: pisos.map(({ id, name, nameEs, biome, color, polys }) => ({ id, name, nameEs, biome, color, polys })),
};
const json = JSON.stringify(data);
await writeFile(OUT, json);
console.log(`${pisos.length} pisos → ${OUT} (${json.length} bytes) tol=${TOL} minArea=${MIN_AREA}`);
