#!/usr/bin/env node
/**
 * Áreas protegidas de Brasil para usar sin conexión: app/public/data/parks-BR.json
 * (se baja aparte, como los de Bolivia, Perú, Paraguay y Uruguay).
 *
 * Fuente: CNUC, Cadastro Nacional de Unidades de Conservação, Ministério do Meio Ambiente (MMA), portal dados.mma.gov.br.
 *   Ficha: https://dados.mma.gov.br/dataset/unidadesdeconservacao  (CKAN: license_id "cc-by", Creative Commons Atribuição = CC BY)
 *   Atribución: «Dados: CNUC/MMA, licencia CC BY».
 *   - Tabla de atributos: cnuc_2026_07.csv (julio 2026; ISO-8859-1, «;»).
 *   - Límites: shp_cnuc_2025_08.zip (agosto 2025), el último shapefile con URL directa: la versión 2026_07 está en un SharePoint del MMA
 *     y no se baja. Las unidades creadas después de agosto 2025 no tienen polígono y quedan afuera (el script las lista).
 *   - Las unidades sin polígono (180; entre ellas 18 estaduales de PR, como Vila Velha o Pico Paraná) vienen en el shapefile de puntos
 *     (cnuc_2025_08_pontos): su ubicación es oficial, pero el borde NO existe. Se dibuja un cuadrado de ±0,01° (≈ 2 km) alrededor del
 *     punto, marcado con `areaApprox: true`: sirve para ubicarlas, no para saber dónde empieza el parque.
 *   Se unen por «Código UC» (cd_cnuc). No se usa ni se copia nada de WDPA/Protected Planet (prohíbe redistribuir).
 * - El CNUC no trae teléfonos, direcciones ni reglas de acceso ni sitio de cada unidad: esos campos quedan vacíos (no se inventan).
 *   `url` es la página del órgano gestor solo cuando es el ICMBio (federal, página oficial del instituto); en las estaduales queda vacía.
 *
 * Alcance (criterio):
 *  - Todos los parques nacionales de Brasil (esfera federal, categoría «Parque»), y
 *  - todas las unidades federales y estaduales de RS, SC, PR y MS (región cargada primero), en las categorías útiles para trekking y
 *    camping: Parque, Reserva Biológica, Estación Ecológica, Monumento Natural, Refugio de Vida Silvestre, Floresta (FLONA/FLOE),
 *    Área de Relevante Interesse Ecológico y Área de Protección Ambiental (APA).
 *  - Quedan afuera: las RPPN (propiedad privada, 1.500 en el país, sin acceso público garantizado), las reservas extractivistas y de
 *    desarrollo sostenible (territorio de comunidades), las unidades municipales (fuera del alcance pedido) y las demás categorías.
 *  - Las APA son enormes y de uso mixto (ciudades y chacras adentro): se incluyen solo si el archivo cabe en el límite de peso; ver MAX_BYTES.
 *
 * Uso: node tools/emergency-data/parks-br.mjs   (necesita conexión; el resultado se versiona)
 *   Carpeta de trabajo: BR_WORK (por defecto ~/parks-br-work; no usar /tmp, es RAM). Se puede borrar al terminar.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { centerOf, inRing, simplified } from '../lib/osm-geo.mjs';

const OUT = process.env.VIKARG_DATA_OUT ? `${process.env.VIKARG_DATA_OUT.replace(/\/$/, '')}/parks-BR.json` : fileURLToPath(new URL('../../app/public/data/parks-BR.json', import.meta.url));
const WORK = process.env.BR_WORK ?? `${homedir()}/parks-br-work`;
const UA = 'VikArg-Prepping-Tools/1.0';
const BASE = 'https://dados.mma.gov.br/dataset/44b6dc8a-dc82-4a84-8d95-1b0da7c85dac/resource';
const CSV_URL = `${BASE}/72dd3d2d-3cca-4b97-b382-a1c90531e379/download/cnuc_2026_07.csv`;
const SHP_URL = `${BASE}/6ba9a557-87e8-4882-acb7-b3e0f0ea192d/download/shp_cnuc_2025_08.zip`;
const LICENSE_URL = 'https://dados.mma.gov.br/dataset/unidadesdeconservacao';
const ICMBIO = 'https://www.gov.br/icmbio/pt-br';
const UFS = new Set(['RS', 'SC', 'PR', 'MS']);
const CATS = new Set(['Parque', 'Reserva Biológica', 'Estação Ecológica', 'Monumento Natural', 'Refúgio de Vida Silvestre', 'Floresta', 'Área de Relevante Interesse Ecológico', 'Área de Proteção Ambiental']);
const MAX_BYTES = 1.5 * 1024 * 1024;
const TOL = Number(process.env.BR_TOL ?? 0.0015); // grados (≈ 170 m)

async function fetchTo(url, file) {
  if (existsSync(file)) return;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || type.includes('text/html')) throw new Error(`${url}: ${res.status} ${type} (¿bloqueo o cambio de enlace? no se esquiva: parar)`);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
}

// ---------- CSV (latin-1, «;», comillas) ----------
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ';') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const head = rows.shift();
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

// ---------- Shapefile de polígonos (solo lo que hace falta: X, Y, partes) ----------
function readDbf(buf) {
  const n = buf.readUInt32LE(4), hl = buf.readUInt16LE(8), rl = buf.readUInt16LE(10);
  const fields = [];
  for (let i = 32, off = 1; buf[i] !== 0x0d; i += 32) {
    const name = buf.toString('latin1', i, i + 11).split('\0')[0];
    const len = buf[i + 16];
    fields.push({ name, off, len });
    off += len;
  }
  return Array.from({ length: n }, (_, k) => {
    const base = hl + k * rl;
    return Object.fromEntries(fields.map((f) => [f.name, buf.toString('utf8', base + f.off, base + f.off + f.len).trim()]));
  });
}
function readPoints(buf) {
  const out = [];
  let p = 100;
  while (p + 8 <= buf.length) {
    const len = buf.readInt32BE(p + 4) * 2;
    out.push(buf.readInt32LE(p + 8) === 1 ? [buf.readDoubleLE(p + 12), buf.readDoubleLE(p + 20)] : null);
    p += 8 + len;
  }
  return out;
}
function readShp(buf) {
  const out = [];
  let p = 100;
  while (p + 8 <= buf.length) {
    const len = buf.readInt32BE(p + 4) * 2;
    const c = p + 8;
    const type = buf.readInt32LE(c);
    if (type === 5 || type === 15 || type === 25) {
      const nParts = buf.readInt32LE(c + 36), nPts = buf.readInt32LE(c + 40);
      const parts = Array.from({ length: nParts }, (_, i) => buf.readInt32LE(c + 44 + 4 * i));
      const pts = c + 44 + 4 * nParts;
      const rings = parts.map((s, i) => {
        const e = i + 1 < nParts ? parts[i + 1] : nPts;
        const r = [];
        for (let j = s; j < e; j++) r.push([buf.readDoubleLE(pts + 16 * j), buf.readDoubleLE(pts + 16 * j + 8)]);
        return r;
      });
      out.push(rings);
    } else out.push(null);
    p = c + len;
  }
  return out;
}
const signed = (r) => r.reduce((s, [x, y], i) => { const [x2, y2] = r[(i + 1) % r.length]; return s + x * y2 - x2 * y; }, 0);
/** Anillos del shapefile → [[borde, ...huecos]] (borde: horario; hueco: antihorario). */
function toPolys(rings) {
  const outers = rings.filter((r) => signed(r) < 0).map((r) => [r]);
  for (const h of rings.filter((r) => signed(r) >= 0 && r.length >= 4)) outers.find((o) => inRing(o[0], h[0]))?.push(h);
  return outers;
}

// ---------- Armado ----------
mkdirSync(WORK, { recursive: true });
const csvFile = `${WORK}/cnuc_2026_07.csv`, zipFile = `${WORK}/shp_cnuc_2025_08.zip`, shpDir = `${WORK}/shp`;
await fetchTo(CSV_URL, csvFile);
await fetchTo(SHP_URL, zipFile);
if (!existsSync(`${shpDir}/cnuc_2025_08.shp`)) { mkdirSync(shpDir, { recursive: true }); execFileSync('unzip', ['-o', '-q', zipFile, '-d', shpDir]); }

const table = parseCsv(new TextDecoder('latin1').decode(readFileSync(csvFile)));
const shpFile = readFileSync(`${shpDir}/cnuc_2025_08.shp`);
const attrs = readDbf(readFileSync(`${shpDir}/cnuc_2025_08.dbf`));
const geoms = readShp(shpFile);
const byCode = new Map(); // cd_cnuc → polígonos de todos sus registros
attrs.forEach((a, i) => { if (geoms[i]) byCode.set(a.cd_cnuc, [...(byCode.get(a.cd_cnuc) ?? []), ...toPolys(geoms[i])]); });

const pointByCode = new Map();
{
  const pa = readDbf(readFileSync(`${shpDir}/cnuc_2025_08_pontos.dbf`));
  readPoints(readFileSync(`${shpDir}/cnuc_2025_08_pontos.shp`)).forEach((pt, i) => { if (pt && !byCode.has(pa[i].codigo_uc)) pointByCode.set(pa[i].codigo_uc, pt); });
}
const HALF = 0.01;
const square = ([x, y]) => [[[[x - HALF, y - HALF], [x - HALF, y + HALF], [x + HALF, y + HALF], [x + HALF, y - HALF], [x - HALF, y - HALF]]]];

const titleCase = (s) => s.toLowerCase().replace(/(^|[\s(\-/])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/\b(Da|De|Do|Das|Dos|E|Em|Na|No|Nas|Nos|Para|A|O)\b/g, (w) => w.toLowerCase()).replace(/^./, (c) => c.toUpperCase());
const federal = (r) => r['Esfera Administrativa'] === 'Federal';
const ufs = (r) => r.UF.split(',').map((s) => s.trim()).filter(Boolean);
const keep = (r) => CATS.has(r['Categoria de Manejo']) && r['Esfera Administrativa'] !== 'Municipal' &&
  ((federal(r) && r['Categoria de Manejo'] === 'Parque') || ufs(r).some((u) => UFS.has(u)));

function build(withApa) {
  const missing = [];
  const parks = [];
  for (const r of table.filter(keep)) {
    if (!withApa && r['Categoria de Manejo'] === 'Área de Proteção Ambiental') continue;
    let polys = byCode.get(r['Código UC']);
    const pt = pointByCode.get(r['Código UC']);
    if (!polys && pt) polys = square(pt);
    if (!polys?.length) { missing.push(`${r['Código UC']} ${r['Nome da UC']} (${r.UF})`); continue; }
    const area = !byCode.has(r['Código UC']) ? polys.map((q) => q.map((ring) => ring.map(([x, y]) => [Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4]))) : simplified(polys, TOL, 2e-6);
    const at = centerOf(area);
    if (!at) { missing.push(`${r['Código UC']} ${r['Nome da UC']} (sin polígono útil)`); continue; }
    const gestor = r['Órgão Gestor'];
    const icm = /CHICO MENDES/i.test(gestor);
    parks.push({
      country: 'BR',
      name: titleCase(r['Nome da UC']),
      url: icm ? ICMBIO : '',
      office: icm ? 'ICMBio (Instituto Chico Mendes de Conservação da Biodiversidade)' : titleCase(gestor.replace(/\s+-\s+[A-Z]{2}$/, '')),
      address: '',
      phone: '',
      phones: '',
      category: r['Categoria de Manejo'],
      sphere: r['Esfera Administrativa'],
      states: ufs(r),
      ...(r['Ano de Criação'] ? { year: Number(r['Ano de Criação']) } : {}),
      cnuc: r['Código UC'],
      ...(byCode.has(r['Código UC']) ? {} : { areaApprox: true }),
      lat: at.lat,
      lon: at.lon,
      area,
    });
  }
  parks.sort((a, b) => a.name.localeCompare(b.name, 'pt'));
  return { parks, missing };
}

const generatedAt = new Date().toISOString().slice(0, 10);
const wrap = (parks) => ({
  generatedAt,
  source: `Dados: Cadastro Nacional de Unidades de Conservação (CNUC), Ministério do Meio Ambiente do Brasil, licencia CC BY (${LICENSE_URL}). Atributos: cnuc_2026_07.csv (julio 2026); límites: shp_cnuc_2025_08 (agosto 2025), simplificados. Descargado el ${generatedAt}. Sin teléfonos ni reglas de acceso: el CNUC no los trae.`,
  parks,
});

let { parks, missing } = build(true);
let json = JSON.stringify(wrap(parks));
let note = 'con APA';
if (Buffer.byteLength(json) > MAX_BYTES) {
  ({ parks, missing } = build(false));
  json = JSON.stringify(wrap(parks));
  note = 'SIN APA (no entraban en el peso)';
}
await writeFile(OUT, json);
console.log(`${parks.length} áreas (${note}) → ${OUT} (${Buffer.byteLength(json)} bytes, tolerancia ${TOL}°)`);
const count = (f) => Object.entries(parks.reduce((m, p) => { for (const k of f(p)) m[k] = (m[k] ?? 0) + 1; return m; }, {})).sort().map(([k, v]) => `${k}: ${v}`).join('; ');
console.log('Por categoría:', count((p) => [p.category]));
console.log('Por estado:', count((p) => p.states));
console.log(`Sin polígono en el shapefile (${missing.length}):`, missing.slice(0, 40).join(' | '));
