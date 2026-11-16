#!/usr/bin/env node
/**
 * Geología de Perú, base nacional para usar sin conexión: app/public/data/geology-PE.json.
 *
 * Fuente: INGEMMET (Instituto Geológico, Minero y Metalúrgico), GEOCATMIN, «Geología Nacional escala 1:1000000, Perú, 2016»
 * (File Geodatabase «Mapa_geologico_millon.gdb», clase de polígonos geológicos con campos CODI_M, NAME_M, DESCRIP_M; WGS84 en grados).
 * Metadatos: «Uso Definitivo», «Acceso Público»; no nombra una licencia abierta: se usa citando la fuente (decisión del proyecto).
 * Catálogo: https://geocatmin.ingemmet.gob.pe/ (descarga «Mapa Geológico del Perú Millón GIS»; el servidor tiene un certificado TLS que
 * no valida en todos los equipos: la descarga manual se hizo con autorización expresa de quien dirige el proyecto, solo para ese paso).
 * Cita: INGEMMET, GEOCATMIN: Geología Nacional 1:1.000.000, Perú (2016).
 *
 * El .rar (en realidad RAR v4, ~317 MB) se extrae con `unar`. No hay GDAL: este script trae su propio lector mínimo del formato
 * FileGDB (.gdbtablx con offsets de 5 bytes, .gdbtable con bitmap de nulos y geometría poligonal con varints delta sobre origen/escala).
 * La tabla de polígonos es la de 58.247 filas (a00000009.gdbtable en esta copia); si cambia, se pasa el prefijo por argumento.
 *
 * Uso: node tools/geology-data/build-pe.mjs <carpeta .gdb> [tolerancia] [área mínima]
 *   p. ej. node tools/geology-data/build-pe.mjs /tmp/geo-pe/x/pe/Mapa_Geologico_del_Peru_Millon_GIS/GDB/Mapa_geologico_millon.gdb
 * Se descartan los polígonos sin unidad (CODI_M sin nombre ni descripción, ~11.000 manchas chicas).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ringArea, simplifyRing } from '../lib/osm-geo.mjs';
import { periodColor } from './periods.mjs';

const OUT = fileURLToPath(new URL('../../app/public/data/geology-PE.json', import.meta.url));
const GDB = process.argv[2];
const TOL = Number(process.argv[3] ?? 0.01);
const MIN_AREA = Number(process.argv[4] ?? 0.0003);
if (!GDB) throw new Error('Falta la carpeta .gdb');
const PREFIX = process.env.GDB_TABLE || 'a00000009';

// ---- Lector FileGDB mínimo --------------------------------------------------------------------------------------------
// Parámetros del campo Shape leídos del descriptor de la tabla (origen -400/-400 y escala 2^…; ver cabecera de la tabla).
const t = readFileSync(`${GDB}/${PREFIX}.gdbtable`);
const tx = readFileSync(`${GDB}/${PREFIX}.gdbtablx`);
const SC = t.readDoubleLE(t.indexOf(Buffer.from([0xff, 0xff, 0xff, 0xff, 0x64, 0xcd, 0xcd, 0x41])));
const XO = -400, YO = -400; // origen de la cuadrícula del campo Shape (descriptor: dos doubles previos a la escala)
{
  const i = t.indexOf(Buffer.from([0xff, 0xff, 0xff, 0xff, 0x64, 0xcd, 0xcd, 0x41]));
  if (t.readDoubleLE(i - 16) !== XO || t.readDoubleLE(i - 8) !== YO) throw new Error('Origen inesperado');
}
const vu = (b, p) => { let r = 0, s = 0, c; do { c = b[p++]; r += (c & 127) * 2 ** s; s += 7; } while (c & 128); return [r, p]; };
const vs = (b, p) => { let c = b[p++]; const neg = c & 64; let r = c & 63, s = 6; while (c & 128) { c = b[p++]; r += (c & 127) * 2 ** s; s += 7; } return [neg ? -r : r, p]; };
function* rows() {
  const n = tx.readUInt32LE(4) * 1024;
  for (let i = 0; i < n; i++) {
    const o = tx.readUIntLE(16 + i * 5, 5);
    if (!o) continue;
    const sz = t.readUInt32LE(o);
    const b = t.subarray(o + 4, o + 4 + sz);
    const bm = b[0];
    let p = 1;
    const r = {};
    // Campos (todos anulables): Shape, CODI_M (int32), NAME_M, DESCRIP_M (texto), Shape_Length, Shape_Area (double).
    ['shape', 'codi', 'name', 'desc', 'len', 'area'].forEach((k, j) => {
      if ((bm >> j) & 1) return;
      if (k === 'shape') { let L; [L, p] = vu(b, p); r.shape = b.subarray(p, p + L); p += L; }
      else if (k === 'codi') { r.codi = b.readInt32LE(p); p += 4; }
      else if (k === 'name' || k === 'desc') { let L; [L, p] = vu(b, p); r[k] = b.toString('utf8', p, p + L).trim(); p += L; }
      else p += 8;
    });
    yield r;
  }
}
/** Anillos de un polígono ESRI: exteriores en sentido horario, huecos antihorarios, huecos después de su exterior. */
function polygon(g) {
  let p = 0, np, nparts, _;
  [_, p] = vu(g, p); [np, p] = vu(g, p); [nparts, p] = vu(g, p);
  for (let k = 0; k < 4; k++) [_, p] = vu(g, p);
  const cnt = [];
  for (let k = 0; k < nparts - 1; k++) { let c; [c, p] = vu(g, p); cnt.push(c); }
  cnt.push(np - cnt.reduce((a, b) => a + b, 0));
  let x = 0, y = 0;
  const parts = [];
  for (const c of cnt) {
    const r = [];
    for (let k = 0; k < c; k++) { let dx, dy; [dx, p] = vs(g, p); [dy, p] = vs(g, p); x += dx; y += dy; r.push([x / SC + XO, y / SC + YO]); }
    const area = r.reduce((s, [a, b], i) => { const [a2, b2] = r[(i + 1) % r.length]; return s + a * b2 - a2 * b; }, 0);
    if (area < 0 || !parts.length) parts.push([r]); else parts[parts.length - 1].push(r);
  }
  return parts;
}

// ---- Edades y litología -----------------------------------------------------------------------------------------------
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const EPOCH = [ // [prefijo normalizado, nombre de periods.mjs]
  ['holocen', 'Holoceno'], ['pleistocen', 'Pleistoceno'], ['plioc', 'Plioceno'], ['mioc', 'Mioceno'], ['oligoc', 'Oligoceno'],
  ['paleocen', 'Paleoceno'], ['eocen', 'Eoceno'],
];
const PERIOD = [
  ['cuaternario', 'Cuaternario'], ['neogeno', 'Neógeno'], ['paleogeno', 'Paleógeno'], ['cretaceo', 'Cretácico'], ['jurasico', 'Jurásico'],
  ['triasico', 'Triásico'], ['permiano', 'Pérmico'], ['carbonifero', 'Carbonífero'], ['devoniano', 'Devónico'], ['siluriano', 'Silúrico'],
  ['ordoviciano', 'Ordovícico'], ['cambriano', 'Cámbrico'], ['neoproterozoic', 'Neoproterozoico'], ['mesoproterozoic', 'Mesoproterozoico'],
  ['meso', 'Mesoproterozoico'], ['paleoproterozoic', 'Paleoproterozoico'],
];
/** «Neógeno miocena, pliocena» → ['Mioceno','Plioceno']; «Jurásico superior, Cretáceo inferior» → ['Jurásico','Cretácico']. */
function ages(era) {
  const out = [];
  for (const tok of era.split(',')) {
    const n = norm(tok.trim());
    const ep = EPOCH.find(([k]) => n.includes(k));
    const pe = PERIOD.find(([k]) => n.startsWith(k));
    // Cuaternario/Neógeno con época explícita se nombra por la época; en el resto, la época es «superior/inferior» y se usa el período.
    const name = ep && pe && ['Cuaternario', 'Neógeno', 'Paleógeno'].includes(pe[1]) ? ep[1] : pe?.[1] ?? ep?.[1];
    if (name) out.push(name);
  }
  // «Paleógeno, Neógeno» deja los períodos; «Neógeno miocena, pliocena»: la 2.ª coma es otra época del mismo período.
  return out;
}
const LITHO = [
  ['plutones', 'Rocas plutónicas'], ['porfidos', 'Pórfidos y rocas subvolcánicas'], ['volcanosedimentario', 'Secuencias volcanosedimentarias'],
  ['volcanico', 'Rocas volcánicas'], ['marino, continental', 'Secuencias sedimentarias marinas y continentales'],
  ['marino', 'Secuencias sedimentarias marinas'], ['continental', 'Secuencias sedimentarias continentales'],
  ['metasedimentario', 'Rocas metasedimentarias'], ['esquisto', 'Esquisto y gneis'], ['gneis', 'Gneis'],
  ['domos de sal', 'Domos de sal'], ['fonolita', 'Fonolita'],
];
const cap = (s) => s[0].toUpperCase() + s.slice(1);

const units = [];
const byKey = new Map();
const polys = [];
let nRows = 0, nBlank = 0;
for (const r of rows()) {
  nRows++;
  if (!r.shape) continue;
  if (!r.name || !r.desc) { nBlank++; continue; }
  const [era, ...rest] = r.desc.split(' - ');
  const lit = rest.join(' - ');
  const nl = norm(lit);
  const tipo = LITHO.find(([k]) => nl.includes(k))?.[1] ?? cap(lit);
  const ag = ages(era);
  const eraTxt = era.replace(/penssylvaniano/, 'pennsylvaniano').replace(/Pérmiano/, 'Permiano');
  const unit = { name: `${tipo}, ${eraTxt} (${r.name})`, litho: lit, from: ag[0] ?? '', to: ag[ag.length - 1] ?? '' };
  const key = JSON.stringify(unit);
  let i = byKey.get(key);
  if (i === undefined) { i = units.push({ ...unit, color: periodColor(unit.to || unit.from) }) - 1; byKey.set(key, i); }
  for (const part of polygon(r.shape)) {
    const rings = [];
    for (const [k, ring] of part.entries()) {
      let s = simplifyRing(ring, TOL).map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
      s = s.filter((p, j) => j === 0 || p[0] !== s[j - 1][0] || p[1] !== s[j - 1][1]);
      if (s.length < 4 || ringArea(s) < (k === 0 ? MIN_AREA : MIN_AREA / 2)) { if (k === 0) break; continue; }
      rings.push(s.flat());
    }
    if (rings.length) polys.push({ u: i, p: rings });
  }
}
const data = {
  generatedAt: new Date().toISOString().slice(0, 10),
  source: 'INGEMMET, GEOCATMIN: Geología Nacional 1:1.000.000, Perú (2016); acceso público, se cita la fuente',
  units,
  polys,
};
const json = JSON.stringify(data);
writeFileSync(OUT, json);
console.log(`${nRows} filas (${nBlank} sin unidad descartadas), ${units.length} unidades, ${polys.length} polígonos → ${OUT} (${json.length} bytes), tol ${TOL}, área mín ${MIN_AREA}`);
