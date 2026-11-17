#!/usr/bin/env node
/**
 * Genera los datos de emergencia incluidos en la app (funcionan sin conexión):
 * app/src/modules/emergency/emergency-data.json
 *
 * - Cuarteles de bomberos de todo el país: IGN / Consejo Nacional de Bomberos
 *   Voluntarios, publicado en el catálogo de datos abiertos de la Provincia de
 *   Buenos Aires (CC BY 4.0).
 * - Comisarías de la Provincia de Buenos Aires (CC BY 4.0, mismo catálogo).
 * - Establecimientos de salud públicos de la Provincia de Buenos Aires
 *   (CC BY 4.0, mismo catálogo).
 * - Edificios de seguridad (comisarías, destacamentos, Gendarmería, Prefectura,
 *   guardaparques…) y de salud de todo el país: capas del IGN (WFS, CC BY 4.0).
 *   En la Provincia de Buenos Aires mandan los listados provinciales (traen
 *   teléfono y dirección): un punto del IGN a menos de 150 m de uno de ellos
 *   se descarta.
 * - Teléfonos de OpenStreetMap (ODbL): a cada punto del IGN sin teléfono se le
 *   pasa el de un lugar de OSM del mismo tipo, a menos de 400 m y con nombre
 *   equivalente (la mitad o más de las palabras importantes en común); y los
 *   lugares de OSM con teléfono que el IGN no tiene se suman (si no hay otro
 *   del mismo tipo a 150 m).
 * - Emisoras de Radio Nacional (AM/FM): tabla de Wikipedia (CC BY-SA),
 *   ubicadas con Nominatim (OpenStreetMap) una sola vez, al generar.
 *
 * Uso: node tools/emergency-data/build.mjs   (necesita conexión; el resultado se versiona)
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { osmByCountry } from '../lib/osm-local.mjs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../../app/src/modules/emergency/emergency-data.json', import.meta.url));
const GBA = 'https://catalogo.datos.gba.gob.ar/dataset';
const FIRE_CSV = `${GBA}/f3cf1025-b253-4627-b546-9c83457618f9/resource/9d601310-6bf9-4d82-b809-65fed2f3f63a/download/cuarteles-bomberos-082026.csv`;
const POLICE_CSV = `${GBA}/bf79faeb-cb8a-4444-bbbe-5dc39479aa4a/resource/8d31bb16-3489-4ede-9e63-072f7f17383d/download/comisarias-pba-2026.csv`;
const HEALTH_CSV = `${GBA}/91743f68-bc82-4475-baca-7d5d6908eee8/resource/c2d51824-c61d-4374-a014-cca5b76b082a/download/establecimientos-salud-publicos.csv`;
const UA = 'VikArg-Prepping-Tools-build/1.0 (https://github.com/mazzalaialan/SurvTools)';
const IGN_WFS = 'https://wms.ign.gob.ar/geoserver/ows?service=wfs&version=2.0.0&request=GetFeature&outputFormat=application/json&count=20000&typeNames=';
const IGN_HEALTH = 'ign:salud_020801';
const IGN_SECURITY = 'ign:estructuras_operativas_y_defensivas_FA517';
/** Edificios de seguridad que sirven ante una emergencia (por tipo del IGN): policía, Gendarmería, Prefectura, guardaparques. */
const SECURITY_TYPES = /comisar|destacamento|polic|gendarmer|prefectura|puesto caminero|cuadrante|comando radioel|unidad regional|jefatura|parques nacionales|guardaparque|seguridad vial|brigada/i;

/** Radio Nacional: indicativo, ciudad, provincia, AM (kHz), FM (MHz). Fuente: es.wikipedia.org/wiki/Radio_Nacional_(Argentina). */
const RADIO_NACIONAL = [
  ['LRA 1', 'Ciudad de Buenos Aires', '', 870, null],
  ['LRA 2', 'Viedma', 'Río Negro', 1150, 93.5],
  ['LRA 3', 'Santa Rosa', 'La Pampa', 730, 95.9],
  ['LRA 4', 'Salta', 'Salta', 690, 102.7],
  ['LRA 5', 'Rosario', 'Santa Fe', 1300, 104.5],
  ['LRA 6', 'Mendoza', 'Mendoza', 960, 97.1],
  ['LRA 7', 'Córdoba', 'Córdoba', 750, 100.1],
  ['LRA 8', 'Formosa', 'Formosa', 820, 94.1],
  ['LRA 9', 'Esquel', 'Chubut', 560, 88.7],
  ['LRA 10', 'Ushuaia', 'Tierra del Fuego', 780, 92.1],
  ['LRA 11', 'Comodoro Rivadavia', 'Chubut', 670, 94.7],
  ['LRA 12', 'Santo Tomé', 'Corrientes', 780, 100.5],
  ['LRA 13', 'Bahía Blanca', 'Buenos Aires', 560, 99.3],
  ['LRA 14', 'Santa Fe', 'Santa Fe', 540, 102.9],
  ['LRA 15', 'San Miguel de Tucumán', 'Tucumán', 1190, 98.7],
  ['LRA 16', 'La Quiaca', 'Jujuy', 560, 92.5],
  ['LRA 17', 'Zapala', 'Neuquén', 710, 93.9],
  ['LRA 18', 'Río Turbio', 'Santa Cruz', 620, 90.3],
  ['LRA 19', 'Puerto Iguazú', 'Misiones', 710, 99.1],
  ['LRA 20', 'Las Lomitas', 'Formosa', 1270, 99.5],
  ['LRA 21', 'Santiago del Estero', 'Santiago del Estero', 1130, 98.5],
  ['LRA 22', 'San Salvador de Jujuy', 'Jujuy', 790, 94.1],
  ['LRA 23', 'San Juan', 'San Juan', 910, 101.9],
  ['LRA 24', 'Río Grande', 'Tierra del Fuego', 640, 88.1],
  ['LRA 25', 'Tartagal', 'Salta', 540, 92.3],
  ['LRA 26', 'Resistencia', 'Chaco', 620, 94.1],
  ['LRA 27', 'San Fernando del Valle de Catamarca', 'Catamarca', 730, 103.3],
  ['LRA 28', 'La Rioja', 'La Rioja', 620, 102.5],
  ['LRA 29', 'San Luis', 'San Luis', 1170, 96.7],
  ['LRA 30', 'San Carlos de Bariloche', 'Río Negro', 590, 95.5],
  ['LRA 42', 'Gualeguaychú', 'Entre Ríos', 1310, 98.7],
  ['LRA 51', 'San José de Jáchal', 'San Juan', 1150, 102.7],
  ['LRA 52', 'Chos Malal', 'Neuquén', 670, 92.3],
  ['LRA 53', 'San Martín de los Andes', 'Neuquén', 1440, 92.5],
  ['LRA 54', 'Ingeniero Jacobacci', 'Río Negro', 1370, 93.5],
  ['LRA 55', 'Alto Río Senguer', 'Chubut', 740, 93.5],
  ['LRA 56', 'Perito Moreno', 'Santa Cruz', 860, 93.5],
  ['LRA 57', 'El Bolsón', 'Río Negro', 1160, 92.3],
  ['LRA 58', 'Río Mayo', 'Chubut', 1020, 88.1],
  ['LRA 59', 'Gobernador Gregores', 'Santa Cruz', 720, 99.9],
  ['LRA 343', 'Neuquén', 'Neuquén', null, 103.3],
];

/** Ciudades que Nominatim no ubica bien por nombre. */
const RADIO_COORDS = { 'LRA 10': [-54.8019, -68.303] };
/** Tipos de establecimiento de salud que sirven ante una emergencia (se dejan afuera oficinas, laboratorios, etc.). */
const HEALTH_TYPES = new Set(['Hospital', 'U.P.A.', 'Emergencias', 'C.A.P.S', 'Posta Sanitaria']);

const r5 = (n) => Math.round(n * 1e5) / 1e5;
const clean = (s) => (s ?? '').replace(/\s+/g, ' ').trim();
const phone = (s) => (/\d/.test(s ?? '') ? clean(s) : '');

/** CSV simple con comillas (los catálogos usan "," o ";"). */
function parseCsv(text, sep) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [head, ...body] = rows.filter((r) => r.some((c) => c.trim()));
  const keys = head.map((h) => h.replace(/^﻿/, '').trim());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? ''])));
}

async function csv(url, sep) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return parseCsv(await res.text(), sep);
}

const num = (s) => Number(String(s).replace(',', '.'));
const valid = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && lat < -20 && lat > -60 && lon < -50 && lon > -76;

const fire = (await csv(FIRE_CSV, ','))
  .map((r) => ({ name: clean(r.nombre), lat: r5(num(r.latitud)), lon: r5(num(r.longitud)) }))
  .filter((r) => r.name && valid(r.lat, r.lon));

const police = (await csv(POLICE_CSV, ','))
  .map((r) => ({
    name: clean(r.dependencia),
    phone: phone(r.telefono),
    address: [clean(r.direccion), clean(r.localidad)].filter(Boolean).join(', '),
    lat: r5(num(r.latitud)),
    lon: r5(num(r.longitud)),
  }))
  .filter((r) => r.name && valid(r.lat, r.lon));

const health = (await csv(HEALTH_CSV, ';'))
  .map((r) => ({
    name: clean(r.fna),
    // tes: dependencia; cat: tipo (hospital, CAPS, …).
    type: clean(r.cat),
    phone: phone(r.tel),
    address: [clean(r.dom), clean(r.nba)].filter(Boolean).join(', '),
    lat: r5(num(r.lat)),
    lon: r5(num(r.long)),
  }))
  .filter((r) => r.name && HEALTH_TYPES.has(r.type) && valid(r.lat, r.lon));

/** Capa de puntos del IGN. */
async function ign(layer) {
  const res = await fetch(IGN_WFS + layer, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${layer}: ${res.status}`);
  return (await res.json()).features
    .filter((f) => f.geometry?.type === 'Point')
    .map((f) => ({ p: f.properties, lat: r5(f.geometry.coordinates[1]), lon: r5(f.geometry.coordinates[0]) }))
    .filter((f) => valid(f.lat, f.lon));
}

/** Distancia aproximada en metros (alcanza para descartar duplicados cercanos). */
const meters = (a, b) => Math.hypot((a.lat - b.lat) * 111_320, (a.lon - b.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180));

/** Suma los del IGN que no repiten uno provincial (a menos de 150 m). */
function addNational(provincial, national) {
  const grid = new Map();
  const cell = (p) => `${Math.round(p.lat * 100)},${Math.round(p.lon * 100)}`;
  for (const p of provincial) grid.set(cell(p), [...(grid.get(cell(p)) ?? []), p]);
  const near = (p) => {
    const [la, lo] = cell(p).split(',').map(Number);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const q of grid.get(`${la + i},${lo + j}`) ?? []) if (meters(p, q) < 150) return true;
    return false;
  };
  const extra = national.filter((p) => !near(p));
  return { list: [...provincial, ...extra], added: extra.length };
}

const securityIgn = (await ign(IGN_SECURITY))
  .filter((f) => SECURITY_TYPES.test(`${f.p.gna ?? ''} ${f.p.fna ?? ''}`))
  .map((f) => ({ name: clean(f.p.fna || f.p.gna), type: clean(f.p.gna), lat: f.lat, lon: f.lon }))
  .filter((r) => r.name);
const healthIgn = (await ign(IGN_HEALTH)).map((f) => ({ name: clean(f.p.fna || f.p.gna), type: clean(f.p.gna), lat: f.lat, lon: f.lon })).filter((r) => r.name);
const policeAll = addNational(police, securityIgn);
const healthAll = addNational(health, healthIgn);

// ---------- Teléfonos de OpenStreetMap ----------
/** Lugares de OpenStreetMap con teléfono (archivo local de Geofabrik o, sin él, Overpass). */
const OSM_SELECTORS = [
  'nwr["amenity"~"^(police|hospital|clinic|ranger_station|doctors)$"]["phone"]',
  'nwr["amenity"~"^(police|hospital|clinic|ranger_station|doctors)$"]["contact:phone"]',
  'nwr["healthcare"~"^(centre|hospital|clinic)$"]["phone"]',
  'nwr["healthcare"~"^(centre|hospital|clinic)$"]["contact:phone"]',
];

const fold = (s) => (s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
/** Palabras que no distinguen un lugar de otro. */
const STOP = new Set('de del la el los las y n no nro centro salud hospital comisaria subcomisaria policia puesto sanitario sanitaria posta municipal provincial dr doctor dra san santa caps sala primeros auxilios atencion primaria unidad seccional distrito regional destacamento clinica sanatorio general zonal integral'.split(' '));
const tokens = (s) => new Set((fold(s).match(/[a-z0-9]+/g) ?? []).filter((t) => !STOP.has(t) && (t.length > 2 || /^\d+$/.test(t))));
/** Nombres equivalentes: la mitad o más de las palabras importantes en común, mirado desde los dos lados. */
function sameName(a, b) {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.size || !B.size) return false;
  const common = [...A].filter((t) => B.has(t)).length;
  return common / Math.min(A.size, B.size) >= 0.5 && common / Math.max(A.size, B.size) >= 0.5;
}
/** Primer teléfono, sin aclaraciones ("3775 498146 (fijo). 3794…" → "3775 498146"). */
function osmPhone(tags) {
  const raw = (tags.phone || tags['contact:phone'] || '').split(/[;,/(]|\. /)[0].replace(/[.\s]+$/, '').trim();
  return raw.replace(/\D/g, '').length >= 6 ? raw : '';
}
const osmAddress = (t) => [[t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' '), t['addr:city']].filter(Boolean).join(', ');

const OSM_KIND = {
  police: (t) => t.amenity === 'police' || t.amenity === 'ranger_station',
  health: (t) => ['hospital', 'clinic', 'doctors'].includes(t.amenity) || ['centre', 'hospital', 'clinic'].includes(t.healthcare),
};

const osmAll = (await osmByCountry('AR', OSM_SELECTORS))
  .map((e) => ({ tags: e.tags ?? {}, lat: r5(e.lat ?? e.center?.lat), lon: r5(e.lon ?? e.center?.lon) }))
  .filter((e) => valid(e.lat, e.lon) && osmPhone(e.tags));

/** Teléfonos de OSM para los que no tienen, y los lugares de OSM que faltan. */
function withOsmPhones(list, kind) {
  const cands = osmAll.filter((e) => OSM_KIND[kind](e.tags));
  const grid = new Map();
  const cell = (p) => `${Math.round(p.lat * 100)},${Math.round(p.lon * 100)}`;
  const around = (g, p) => {
    const [la, lo] = cell(p).split(',').map(Number);
    const out = [];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) out.push(...(g.get(`${la + i},${lo + j}`) ?? []));
    return out;
  };
  for (const c of cands) grid.set(cell(c), [...(grid.get(cell(c)) ?? []), c]);
  const used = new Set();
  let phones = 0;
  const out = list.map((p) => {
    if (p.phone) return p;
    let best = null;
    for (const c of around(grid, p)) {
      const d = meters(p, c);
      if (d < 400 && sameName(p.name, c.tags.name) && (!best || d < best.d)) best = { d, c };
    }
    if (!best) return p;
    used.add(best.c);
    phones++;
    const address = p.address || osmAddress(best.c.tags);
    return { ...p, phone: osmPhone(best.c.tags), ...(address && { address }) };
  });
  const existing = new Map();
  for (const p of out) existing.set(cell(p), [...(existing.get(cell(p)) ?? []), p]);
  const added = cands
    .filter((c) => !used.has(c) && c.tags.name && !around(existing, c).some((q) => meters(c, q) < 150))
    .map((c) => {
      const address = osmAddress(c.tags);
      const type = c.tags.amenity === 'ranger_station' ? 'Guardaparques' : c.tags.amenity === 'police' ? 'Policía' : c.tags.amenity === 'hospital' || c.tags.healthcare === 'hospital' ? 'Hospital' : 'Centro de salud';
      return { name: clean(c.tags.name), type, phone: osmPhone(c.tags), ...(address && { address }), lat: c.lat, lon: c.lon };
    });
  return { list: [...out, ...added], phones, added: added.length };
}

console.log(`OpenStreetMap: ${osmAll.length} lugares con teléfono`);
// Si Overpass devolvió una respuesta cortada, mejor no generar con datos de menos.
if (osmAll.length < 4000) throw new Error(`OpenStreetMap devolvió muy pocos lugares (${osmAll.length}); probá de nuevo más tarde`);
const policeOsm = withOsmPhones(policeAll.list, 'police');
const healthOsm = withOsmPhones(healthAll.list, 'health');

const radio = [];
for (const [call, city, province, am, fm] of RADIO_NACIONAL) {
  if (RADIO_COORDS[call]) {
    const [lat, lon] = RADIO_COORDS[call];
    radio.push({ call, city, province, am, fm, lat, lon });
    continue;
  }
  const q = new URLSearchParams({ city, state: province, country: 'Argentina', format: 'json', limit: '1' });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${q}`, { headers: { 'User-Agent': UA } });
  const [hit] = res.ok ? await res.json() : [];
  if (!hit) {
    console.warn(`Sin ubicación: ${call} ${city}`);
    continue;
  }
  radio.push({ call, city, province, am, fm, lat: r5(Number(hit.lat)), lon: r5(Number(hit.lon)) });
  // Política de uso de Nominatim: como máximo un pedido por segundo.
  await new Promise((r) => setTimeout(r, 1100));
}

const data = {
  sources: {
    fire: 'IGN / Consejo Nacional de Bomberos Voluntarios (catalogo.datos.gba.gob.ar, CC BY 4.0)',
    police: 'Edificios de seguridad de todo el país: IGN (CC BY 4.0); en la Provincia de Buenos Aires, Ministerio de Seguridad provincial (catalogo.datos.gba.gob.ar, CC BY 4.0); teléfonos y lugares faltantes: © colaboradores de OpenStreetMap (ODbL)',
    health: 'Establecimientos de salud de todo el país: IGN / SISA (CC BY 4.0); en la Provincia de Buenos Aires, Ministerio de Salud provincial (catalogo.datos.gba.gob.ar, CC BY 4.0); teléfonos y lugares faltantes: © colaboradores de OpenStreetMap (ODbL)',
    radio: 'Radio Nacional (es.wikipedia.org, CC BY-SA); ubicación: OpenStreetMap',
  },
  fire,
  police: policeOsm.list,
  health: healthOsm.list,
  radio,
};
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(data));
console.log(`bomberos ${fire.length}, seguridad ${police.length} PBA + ${policeAll.added} IGN (+${policeOsm.phones} teléfonos y ${policeOsm.added} lugares de OSM), salud ${health.length} PBA + ${healthAll.added} IGN (+${healthOsm.phones} teléfonos y ${healthOsm.added} lugares de OSM), radios ${radio.length} → ${OUT} (${JSON.stringify(data).length} bytes)`);
