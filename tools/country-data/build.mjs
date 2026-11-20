#!/usr/bin/env node
/**
 * Genera los paquetes de datos sin conexión de Chile, Uruguay, Bolivia, Perú, Paraguay y Brasil:
 * app/public/data/CL.json, UY.json, BO.json, PE.json, PY.json y, de Brasil, uno por sector: BR-sul.json, BR-sudeste.json, etc. No van en la descarga inicial de la app:
 * se bajan una vez al elegir el país (ver app/src/modules/emergency/country.ts).
 *
 * - Localidades: GeoNames (CC BY 4.0), con población, para la detección de
 *   ciudad o zona agreste y para ubicar lugares por nombre.
 * - Bomberos, policía y centros de salud: OpenStreetMap (ODbL), del extracto de Geofabrik por país (tools/osm-index/countries.sh) o, sin él, de Overpass.
 *   Uruguay: la base son los listados oficiales del catálogo de datos abiertos
 *   (Licencia de Datos Abiertos de Uruguay): comisarías y destacamentos de
 *   bomberos del Ministerio del Interior y unidades asistenciales de ASSE, con
 *   teléfono y dirección. De OpenStreetMap se suman los que no están (mutualistas,
 *   emergencias móviles…) y el teléfono que le falte a uno oficial.
 *   Perú: los centros de salud salen del RENIPRESS (SUSALUD, datosabiertos.gob.pe,
 *   Open Data Commons Attribution), completados con OpenStreetMap.
 * - Radios: Radiodifusión Nacional del Uruguay (Radio Uruguay y su red del
 *   interior) y la red de Radio Bío-Bío en Chile (privada, de cobertura nacional:
 *   Chile no tiene radio pública) y la Red Patria Nueva de Bolivia (solo las
 *   frecuencias confirmadas) y Radio Nacional del Perú (planilla oficial del IRTP),
 *   ubicadas con GeoNames.
 *
 * - Brasil (BR): se arma por sectores (macrorregiones del IBGE; Brasil entero pesa demasiado): sul (PR, SC, RS), sudeste (SP, RJ, MG, ES), centro-oeste
 *   (MT, MS, GO, DF), nordeste (MA, PI, CE, RN, PB, PE, AL, SE, BA) y norte (AC, AM, AP, PA, RO, RR, TO). Los bomberos, la policía y la salud salen
 *   del recorte de OpenStreetMap de tools/osm-index/brazil.sh (extractos de Geofabrik; ODbL) y las localidades de GeoNames (CC BY 4.0) dentro
 *   del mismo contorno de los estados del sector (`border-BR-<sector>.geojson`, junto a `places-BR-<sector>.jsonl`). Hay que apuntar OSM_LOCAL_DIR
 *   a esa carpeta. Cada archivo lleva `country: 'BR'`, `sector` y `coverage`. Radio: no hay una fuente pública verificada: queda vacía.
 *
 * Uso: node tools/country-data/build.mjs [UY|CL|BO|PE|PY|BR|BR-<sector>]   (necesita conexión; el resultado se versiona; sin país, todos; BR = los sectores que tengan archivo local)
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { hasLocal, localFile, localMeta, osmByCountry } from '../lib/osm-local.mjs';
import { fileURLToPath } from 'node:url';

// Salida: los paquetes de la app (por defecto) o, con VIKARG_DATA_OUT, la carpeta que sirve el servidor
// (actualización mensual, server/src/data/update-data.sh).
const OUT_DIR = process.env.VIKARG_DATA_OUT ? `${process.env.VIKARG_DATA_OUT.replace(/\/$/, '')}/` : fileURLToPath(new URL('../../app/public/data/', import.meta.url));

/** Lector de ZIP mínimo (sin dependencias, para correr con Node solo): nombre → contenido. */
function unzipSync(buf) {
  const b = Buffer.from(buf);
  let eocd = b.length - 22;
  while (eocd >= 0 && b.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('ZIP sin directorio central');
  const count = b.readUInt16LE(eocd + 10);
  let off = b.readUInt32LE(eocd + 16);
  const out = {};
  for (let i = 0; i < count; i++) {
    const method = b.readUInt16LE(off + 10);
    const size = b.readUInt32LE(off + 20);
    const nameLen = b.readUInt16LE(off + 28);
    const extra = b.readUInt16LE(off + 30);
    const comment = b.readUInt16LE(off + 32);
    const local = b.readUInt32LE(off + 42);
    const name = b.toString('utf8', off + 46, off + 46 + nameLen);
    const start = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28);
    const data = b.subarray(start, start + size);
    out[name] = method === 8 ? inflateRawSync(data) : data;
    off += 46 + nameLen + extra + comment;
  }
  return out;
}
const strFromU8 = (u8) => Buffer.from(u8).toString('utf8');
const UA = 'VikArg-Prepping-Tools-build/1.0 (https://github.com/mazzalaialan/SurvTools)';

/** Radio Uruguay (Radiodifusión Nacional del Uruguay): Montevideo y repetidoras FM del interior. */
const RADIO_UY = [
  ['CX26 Radio Uruguay', 'Montevideo', 1050, 94.7],
  ['CX254 Radio Uruguay', 'Artigas', null, 98.7],
  ['CX261B Radio Uruguay', 'Bella Unión', null, 100.1],
  ['CX274B Radio Uruguay', 'Carmelo', null, 102.7],
  // Chuy no está en GeoNames de Uruguay: ubicación a mano (Chuy, Rocha).
  ['CX228 Radio Uruguay', 'Chuy', null, 93.5, { lat: -33.697, lon: -53.456, province: 'Rocha' }],
  ['CX280 Radio Uruguay', 'Colonia del Sacramento', null, 103.9],
  ['CX286 Radio Uruguay', 'Durazno', null, 105.1],
  ['CX241A Radio Uruguay', 'Florida', null, 96.1],
  ['CX275B Radio Uruguay', 'Fray Bentos', null, 102.9],
  ['CX295 Radio Uruguay', 'Melo', null, 106.9],
  ['CX221 Radio Uruguay', 'Mercedes', null, 92.1],
  ['CX291A Radio Uruguay', 'Minas', null, 106.1],
  ['CX291 Radio Uruguay', 'Paso de los Toros', null, 106.1],
  ['CX278A Radio Uruguay', 'Paysandú', null, 103.5],
  ['CX230 Radio Uruguay', 'Rivera', null, 93.9],
  ['CX299 Radio Uruguay', 'Rocha', null, 107.7],
  ['CX282 Radio Uruguay', 'Salto', null, 104.3],
  ['CX236D Radio Uruguay', 'San José de Mayo', null, 95.1],
  ['CX279 Radio Uruguay', 'Tacuarembó', null, 103.7],
  ['CX224 Radio Uruguay', 'Treinta y Tres', null, 92.7],
];

/** Red de Radio Bío-Bío (es.wikipedia.org/wiki/Radio_Bío-Bío). */
const RADIO_CL = [
  ['Santiago', null, 99.7],
  ['Arica', null, 92.7],
  ['Iquique', null, 96.9],
  ['Calama', null, 100.7],
  ['Antofagasta', null, 93.5],
  ['Caldera', null, 96.9],
  ['Copiapó', null, 97.3],
  ['Vallenar', null, 89.7],
  ['La Serena', null, 90.5],
  ['Ovalle', null, 101.1],
  ['Los Andes', null, 103.5],
  ['Valparaíso', null, 94.5],
  ['Casablanca', null, 93.5],
  ['San Antonio', null, 106.1],
  ['Curacaví', null, 95.1],
  ['Melipilla', null, 89.9],
  ['Rancagua', null, 99.9],
  ['Vichuquén', null, 100.3],
  ['Curicó', null, 98.5],
  ['Constitución', null, 106.1],
  ['Talca', null, 96.9],
  ['Longaví', null, 97.3],
  ['Chillán', null, 105.3],
  ['Cañete', null, 97.7],
  ['Lebu', null, 103.5],
  ['Concepción', 620, 98.1],
  ['Los Ángeles', null, 96.7],
  ['Angol', null, 99.7],
  ['Lonquimay', null, 101.5],
  ['Temuco', null, 88.1],
  ['Pucón', null, 103.7],
  ['Villarrica', null, 88.5],
  ['Valdivia', null, 88.9],
  ['Los Lagos', null, 91.5],
  ['Osorno', null, 106.5],
  ['Puerto Varas', null, 88.9],
  ['Puerto Montt', null, 94.9],
  ['Ancud', null, 99.3],
  ['Castro', null, 89.3],
  ['Quellón', null, 93.7],
  ['Coyhaique', null, 90.3],
  ['Punta Arenas', null, 105.1],
].map(([city, am, fm]) => ['Radio Bío-Bío', city, am, fm]);

/** Red Patria Nueva (Radio Illimani), radio del Estado de Bolivia: solo las confirmadas (State Media Monitor, 2026). */
const RADIO_BO = [
  ['Red Patria Nueva (Radio Illimani)', 'La Paz', 1020, 94.3],
  ['Red Patria Nueva', 'Cochabamba', null, 93.7],
];

/**
 * Radio Nacional del Perú (IRTP): las 70 estaciones FM y las 4 AM de las planillas oficiales «Red de Radio FM del IRTP» y «Red de Radio
 * Nacional AM del IRTP» (datosabiertos.gob.pe, ODC-By: hay que atribuir; planilla del 2021-09-15, puede haber cambiado). Se descartó una
 * lista anterior de un sitio de terceros (myradioenvivo.pe): ponía a Piura los valores de Ayabaca (850 AM y 89.1 FM; Piura es 100.5 FM) y
 * AM de otras ciudades que la planilla oficial no trae (Ayacucho 1260, Cajamarca 1050, Chimbote 1020).
 */
const RADIO_PE = [
  ['Radio Nacional del Perú', 'Chachapoyas', null, 103.9],
  ['Radio Nacional del Perú', 'Bagua', null, 91.3],
  ['Radio Nacional del Perú', 'Huaraz', null, 100.5],
  ['Radio Nacional del Perú', 'Cabana', null, 101.3],
  ['Radio Nacional del Perú', 'Chimbote', null, 105.1],
  ['Radio Nacional del Perú', 'Yungay', null, 101.3],
  ['Radio Nacional del Perú', 'Abancay', null, 100.1],
  ['Radio Nacional del Perú', 'Andahuaylas', null, 101.1],
  ['Radio Nacional del Perú', 'Arequipa', null, 92.5],
  ['Radio Nacional del Perú', 'Puerto Lomas', null, 104.7, { province: 'Caravelí', lat: -15.5667, lon: -74.8333 }],
  ['Radio Nacional del Perú', 'Yauca', null, 101.9],
  ['Radio Nacional del Perú', 'Chivay', null, 103.7],
  ['Radio Nacional del Perú', 'Ayacucho', null, 97.9],
  ['Radio Nacional del Perú', 'Sivia', null, 104.7],
  ['Radio Nacional del Perú', 'Cajamarca', null, 100.1],
  ['Radio Nacional del Perú', 'Jaén', null, 101.1],
  ['Radio Nacional del Perú', 'San Miguel', null, 100.3],
  ['Radio Nacional del Perú', 'Cusco', null, 96.9],
  ['Radio Nacional del Perú', 'Quillabamba', null, 99.9],
  ['Radio Nacional del Perú', 'Sicuani', null, 103.3],
  ['Radio Nacional del Perú', 'Acomayo', null, 100.7],
  ['Radio Nacional del Perú', 'Paucartambo', null, 100.1],
  ['Radio Nacional del Perú', 'Santo Tomás', null, 100.5],
  ['Radio Nacional del Perú', 'Huancavelica', null, 101.9],
  ['Radio Nacional del Perú', 'Huánuco', null, 100.9],
  ['Radio Nacional del Perú', 'Tingo María', null, 99.7],
  ['Radio Nacional del Perú', 'Ica', null, 100.7],
  ['Radio Nacional del Perú', 'Nazca', null, 97.5],
  ['Radio Nacional del Perú', 'Pisco', null, 90.9],
  ['Radio Nacional del Perú', 'Chincha', null, 101.7],
  ['Radio Nacional del Perú', 'Huancayo', null, 97.9],
  ['Radio Nacional del Perú', 'Pichanaki', null, 95.9, { province: 'Chanchamayo', lat: -10.9253, lon: -74.8733 }],
  ['Radio Nacional del Perú', 'Satipo', null, 100.3],
  ['Radio Nacional del Perú', 'Chiclayo', null, 101.7],
  ['Radio Nacional del Perú', 'Trujillo', null, 89.7],
  ['Radio Nacional del Perú', 'Huamachuco', null, 106.5],
  ['Radio Nacional del Perú', 'Santiago de Chuco', null, 100.1],
  ['Radio Nacional del Perú', 'Lunahuaná', null, 99.3],
  ['Radio Nacional del Perú', 'Lima', 850, 103.9],
  ['Radio Nacional del Perú', 'Comas', null, 89.3],
  ['Radio Nacional del Perú', 'Cañete', null, 92.9],
  ['Radio Nacional del Perú', 'Oyón', null, 100.1],
  ['Radio Nacional del Perú', 'Iquitos', 1120, 101.3],
  ['Radio Nacional del Perú', 'Nauta', null, 100.5],
  ['Radio Nacional del Perú', 'Yurimaguas', null, 98.9],
  ['Radio Nacional del Perú', 'Caballococha', null, 101.1],
  ['Radio Nacional del Perú', 'Andoas', null, 101.1],
  ['Radio Nacional del Perú', 'Puerto Maldonado', null, 101.3],
  ['Radio Nacional del Perú', 'Iñapari', null, 102.5],
  ['Radio Nacional del Perú', 'Moquegua', null, 101.5],
  ['Radio Nacional del Perú', 'Omate', null, 100.1],
  ['Radio Nacional del Perú', 'Ilo', null, 91.7],
  ['Radio Nacional del Perú', 'Cerro de Pasco', null, 99.3],
  ['Radio Nacional del Perú', 'Tapuc', null, 104.5],
  ['Radio Nacional del Perú', 'Piura', null, 100.5],
  ['Radio Nacional del Perú', 'Talara', null, 101.9],
  ['Radio Nacional del Perú', 'Huancabamba', null, 100.9],
  ['Radio Nacional del Perú', 'Sullana', null, 100.1],
  ['Radio Nacional del Perú', 'Ilave', null, 98.9],
  ['Radio Nacional del Perú', 'Puno', null, 100.9],
  ['Radio Nacional del Perú', 'Juliaca', null, 100.5],
  ['Radio Nacional del Perú', 'Ayaviri', null, 94.5],
  ['Radio Nacional del Perú', 'Desaguadero', null, 94.1],
  ['Radio Nacional del Perú', 'Moyobamba', null, 95.7],
  ['Radio Nacional del Perú', 'Tarapoto', null, 103.9],
  ['Radio Nacional del Perú', 'Tacna', 830, 99.9],
  ['Radio Nacional del Perú', 'Tarata', null, 99.9],
  ['Radio Nacional del Perú', 'Tumbes', 780, 99.7],
  ['Radio Nacional del Perú', 'Zarumilla', null, 107.3],
  ['Radio Nacional del Perú', 'Pucallpa', null, 95.3],
];

const norm = (s) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** El portal de datos abiertos de Perú rechaza (418) los clientes que ponen una dirección web en el User-Agent. */
const uaFor = (url) => (url.includes('datosabiertos.gob.pe') ? 'VikArg-Prepping-Tools/1.0' : UA);

async function getBytes(url) {
  const res = await fetch(url, { headers: { 'User-Agent': uaFor(url) } });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** ¿El punto cae dentro de un GeoJSON Feature con Polygon o MultiPolygon? (rayos; los anillos interiores son agujeros) */
function insideGeometry(geometry) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const inRing = (ring, x, y) => {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  // Caja de cada polígono para descartar rápido.
  const boxes = polys.map((p) => {
    const xs = p[0].map((c) => c[0]);
    const ys = p[0].map((c) => c[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  });
  return (lat, lon) => polys.some((p, i) => lon >= boxes[i][0] && lon <= boxes[i][2] && lat >= boxes[i][1] && lat <= boxes[i][3] && inRing(p[0], lon, lat) && !p.slice(1).some((h) => inRing(h, lon, lat)));
}

/** Contorno del sector recortado (Brasil, `BR-<sector>`): el que armó tools/osm-index/brazil.sh junto a places-BR-<sector>.jsonl. */
function regionFilter(cc) {
  if (!cc.startsWith('BR-')) return null;
  if (!hasLocal(cc)) throw new Error(`${cc}: falta places-${cc}.jsonl (OSM_LOCAL_DIR; ver tools/osm-index/brazil.sh)`);
  const border = JSON.parse(readFileSync(localFile(cc).replace(/places-BR-([a-z-]+)\.jsonl$/, 'border-BR-$1.geojson'), 'utf8'));
  return insideGeometry(border.geometry);
}

/** Localidades con población (o cabeceras) de GeoNames; `inside(lat, lon)` las restringe a una región (Brasil: Sul y Mato Grosso do Sul). */
async function geonames(cc, admin1, inside = null, onlyProvinces = null) {
  const zip = unzipSync(await getBytes(`https://download.geonames.org/export/dump/${cc}.zip`));
  const rows = strFromU8(zip[`${cc}.txt`]).split('\n');
  const SKIP = new Set(['PPLH', 'PPLQ', 'PPLW', 'PPLX', 'PPLCH']);
  const provinces = new Set();
  const places = [];
  // Todos los lugares poblados (también sin población), solo para ubicar radios por nombre.
  const all = [];
  for (const line of rows) {
    const f = line.split('\t');
    if (f[6] !== 'P' || SKIP.has(f[7])) continue;
    if (inside && !inside(Number(f[4]), Number(f[5]))) continue;
    const population = Number(f[14]) || 0;
    const seat = /^PPL(A\d?|C)$/.test(f[7]);
    all.push([f[1], f[10], Math.round(Number(f[4]) * 1e3) / 1e3, Math.round(Number(f[5]) * 1e3) / 1e3, population]);
    if (population === 0 && !seat) continue;
    const province = admin1.get(`${cc}.${f[10]}`) ?? '';
    // Brasil: un lugar cuya provincia (admin1 de GeoNames) no es de los estados del sector es un error de la fuente en el borde: se descarta.
    if (onlyProvinces && !onlyProvinces.has(province)) continue;
    provinces.add(province);
    // Misma escala que el nomenclátor argentino: 2000 = localidad; +población; cabeceras +500.
    const rank = 2000 + population + (seat ? 500 : 0);
    places.push({ name: f[1], province, lat: Math.round(Number(f[4]) * 1e3) / 1e3, lon: Math.round(Number(f[5]) * 1e3) / 1e3, rank });
  }
  const provList = [...provinces].sort();
  places.sort((a, b) => b.rank - a.rank);
  return {
    provinces: provList,
    places: places.map((p) => [p.name, provList.indexOf(p.province), p.lat, p.lon, p.rank]),
    // [nombre, provincia (nombre), lat, lon]: el de más población primero.
    all: all.sort((a, b) => b[4] - a[4]).map(([n, a1, lat, lon]) => [n, admin1.get(`${cc}.${a1}`) ?? '', lat, lon]),
  };
}

async function admin1Names() {
  const text = new TextDecoder().decode(await getBytes('https://download.geonames.org/export/dump/admin1CodesASCII.txt'));
  return new Map(
    text
      .split('\n')
      .filter(Boolean)
      .map((l) => l.split('\t'))
      .map((f) => [f[0], f[1]]),
  );
}

/** Bomberos, policía y salud de un país: del archivo local de Geofabrik (tools/osm-index/countries.sh) o, sin él, de Overpass. */
async function overpass(cc) {
  return osmByCountry(cc, [
    'nwr["amenity"="fire_station"]',
    'nwr["amenity"="police"]',
    'nwr["amenity"~"^(hospital|clinic)$"]',
    'nwr["healthcare"~"^(hospital|clinic|centre)$"]',
  ]);
}

function toPlace(e, fallbackName) {
  const t = e.tags ?? {};
  const lat = e.lat ?? e.center?.lat;
  const lon = e.lon ?? e.center?.lon;
  if (lat === undefined || lon === undefined) return null;
  const address = [[t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' '), t['addr:city']].filter(Boolean).join(', ');
  const place = { name: t.name ?? t.official_name ?? fallbackName, lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5 };
  const phone = t.phone ?? t['contact:phone'] ?? t.emergency_phone;
  if (phone) place.phone = phone;
  if (address) place.address = address;
  return place;
}

function radios(list, all) {
  const out = [];
  for (const [call, city, am, fm, fixed] of list) {
    if (fixed) {
      out.push({ call, city, am, fm, ...fixed });
      continue;
    }
    const n = norm(city);
    const hit = all.find((p) => norm(p[0]) === n) ?? all.find((p) => norm(p[0]).startsWith(n));
    if (!hit) {
      console.warn(`Sin ubicación para la radio de ${city}`);
      continue;
    }
    out.push({ call, city, province: hit[1], am, fm, lat: hit[2], lon: hit[3] });
  }
  return out;
}


// ---------- Uruguay: listados oficiales ----------
const UY_POLICE_KML = 'https://catalogodatos.gub.uy/dataset/b4fc162d-26cd-443f-b596-8c7a897e4bba/resource/719964a7-70a7-4299-84a3-c64815641f1b/download/comisarias.kml';
const UY_FIRE_KML = 'https://catalogodatos.gub.uy/dataset/cc6a849b-86ac-4a55-ba7c-c08d2fe616a8/resource/64db651d-32c3-4ea5-9516-8d14b9b0fb9a/download/destacamentosbomberos.kml';
const UY_ASSE = 'https://catalogodatos.gub.uy/api/3/action/package_show?id=unidades-asistenciales-de-asse';
/** De ASSE, lo que sirve ante una emergencia (no salud mental ni residencias). */
const UY_HEALTH = new Set(['HOSPITAL', 'CENTRO DE SALUD', 'POLICLINICA', 'CONSULTORIO']);

/** "MALDONADO" → "Maldonado"; "JOSE IGNACIO" → "Jose Ignacio" (los listados vienen en mayúsculas y sin tildes). */
/** Palabras de los listados oficiales que vienen sin tilde. */
const ACCENTS = { Comisaria: 'Comisaría', Subcomisaria: 'Subcomisaría', Policlinica: 'Policlínica', Jefatura: 'Jefatura', Seccion: 'Sección', Region: 'Región', Policia: 'Policía' };
const title = (s) =>
  (s ?? '')
    .trim()
    // Algunos listados perdieron la eñe al exportarse ("MARO?AS").
    .replace(/(\p{L})\?(\p{L})/gu, '$1ñ$2')
    .toLowerCase()
    .replace(/(^|[\s(./-])\p{L}/gu, (c) => c.toUpperCase())
    // Artículos y preposiciones en minúscula, salvo al principio.
    .replace(/(?<=\S\s)(De|Del|La|Las|Los|Y|El|En)\b/g, (w) => w.toLowerCase())
    .replace(/\p{L}+/gu, (w) => ACCENTS[w] ?? w);
const r5 = (n) => Math.round(n * 1e5) / 1e5;
const digits = (s) => (/\d{6,}/.test((s ?? '').replace(/\D/g, '')) ? String(s).trim() : '');

function kmlPlacemarks(text) {
  return [...text.matchAll(/<Placemark>([\s\S]*?)<\/Placemark>/g)].map((m) => {
    const data = Object.fromEntries([...m[1].matchAll(/<SimpleData name="([^"]+)">([\s\S]*?)<\/SimpleData>/g)].map((d) => [d[1], d[2].trim()]));
    const [lon, lat] = (m[1].match(/<coordinates>\s*([-\d.]+),([-\d.]+)/) ?? []).slice(1).map(Number);
    return { data, lat, lon };
  });
}

async function uyOfficial() {
  const text = async (url) => new TextDecoder().decode(await getBytes(url));
  const police = kmlPlacemarks(await text(UY_POLICE_KML))
    .filter((p) => Number.isFinite(p.lat))
    .map(({ data: d, lat, lon }) => ({
      name: `${title(d.TIPO || 'Comisaría')} ${d.SECCIONAL ? `${d.SECCIONAL}.ª ` : ''}de ${title(d.CIUDAD_LOC || d.DEPTO)}`.replace(/\s+/g, ' '),
      type: title(d.TIPO),
      phone: digits(d.TELEFONO),
      address: [title(d.DIRECCION), title(d.CIUDAD_LOC), title(d.DEPTO)].filter(Boolean).join(', '),
      lat: r5(lat),
      lon: r5(lon),
    }));
  const fire = kmlPlacemarks(await text(UY_FIRE_KML))
    .filter((p) => Number.isFinite(p.lat))
    .map(({ data: d, lat, lon }) => ({ name: `Bomberos ${title(d.NOMBRE)}`, address: title(d.DEPARTAMEN), lat: r5(lat), lon: r5(lon) }));
  // El archivo de ASSE cambia de nombre con cada actualización: se busca en el catálogo.
  const pkg = JSON.parse(await text(UY_ASSE));
  const geojson = pkg.result.resources.find((r) => /geojson/i.test(r.format)).url;
  const health = JSON.parse(await text(geojson))
    .features.filter((f) => UY_HEALTH.has(f.properties.Categoria) && f.geometry?.type === 'Point')
    .map((f) => {
      const p = f.properties;
      const cat = p.Categoria === 'POLICLINICA' ? 'Policlínica' : title(p.Categoria);
      return {
        name: title(p.Nombre),
        type: cat,
        phone: digits(p.Telefono),
        address: [title(p.Direccion), title(p.Localidad), title(p.Departamento)].filter(Boolean).join(', '),
        lat: r5(f.geometry.coordinates[1]),
        lon: r5(f.geometry.coordinates[0]),
      };
    });
  return { police, fire, health };
}

// ---------- Perú: RENIPRESS (registro oficial de establecimientos de salud) ----------
const PE_RENIPRESS_PAGE = 'https://www.datosabiertos.gob.pe/dataset/registro-nacional-de-entidades-prestadoras-de-servicios-de-salud-renipress';
/** De RENIPRESS, lo que sirve ante una emergencia (no consultorios, laboratorios, ópticas…), con el tipo a mostrar. */
const PE_HEALTH = [
  [/HOSPITALES|INSTITUTOS DE SALUD/, 'Hospital'],
  [/CENTROS DE SALUD CON CAMAS/, 'Centro de salud con internación'],
  [/ATENCION PRE HOSPITALARIA/, 'Ambulancias'],
  [/CENTROS DE SALUD O CENTROS MEDICOS/, 'Centro de salud'],
  [/POLICLINICOS/, 'Policlínico'],
  [/PUESTOS DE SALUD/, 'Puesto de salud'],
];

async function peOfficial() {
  // El archivo cambia de nombre cada mes (RENIPRESS_dd-mm-aaaa.csv): el más nuevo de la página del conjunto de datos.
  const page = new TextDecoder().decode(await getBytes(PE_RENIPRESS_PAGE));
  const files = [...new Set(page.match(/https:\/\/www\.datosabiertos\.gob\.pe\/sites\/default\/files\/RENIPRESS_\d\d-\d\d-\d{4}\.csv/g) ?? [])];
  const dated = files.map((url) => {
    const [d, m, y] = url.match(/(\d\d)-(\d\d)-(\d{4})\.csv$/).slice(1);
    return { url, at: `${y}-${m}-${d}` };
  });
  const latest = dated.sort((a, b) => b.at.localeCompare(a.at))[0];
  if (!latest) throw new Error('RENIPRESS: no se encontró el CSV');
  const lines = new TextDecoder().decode(await getBytes(latest.url)).replace(/^\uFEFF/, '').split(/\r?\n/);
  const head = lines[0].split(';');
  const col = (name) => head.indexOf(name);
  const [cName, cClass, cCat, cPhone, cAddr, cDist, cProv, cDep, cState, cLat, cLon] = ['NOMBRE', 'CLASIFICACION', 'CATEGORIA', 'TELEFONO', 'DIRECCION', 'DISTRITO', 'PROVINCIA', 'DEPARTAMENTO', 'ESTADO', 'NORTE', 'ESTE'].map(col);
  const health = [];
  for (const line of lines.slice(1)) {
    const f = line.split(';');
    if (f[cState] !== 'ACTIVO') continue;
    const lat = Number(f[cLat]);
    const lon = Number(f[cLon]);
    // Coordenadas que caen en Perú (hay registros sin ubicar o con lat/lon cambiadas).
    if (!(lat < 0.5 && lat > -18.6 && lon > -81.5 && lon < -68.5)) continue;
    const match = PE_HEALTH.find(([re]) => re.test(f[cClass] ?? ''));
    if (!match) continue;
    // Las categorías II y III (hospitales de referencia) cuentan como hospital aunque el registro diga "centro de salud".
    const type = /^(II|III)/.test(f[cCat] ?? '') ? 'Hospital' : match[1];
    health.push({
      name: title(f[cName]),
      type,
      phone: digits(f[cPhone]),
      address: [title(f[cAddr]), title(f[cDist]), title(f[cProv]), title(f[cDep])].filter(Boolean).join(', '),
      lat: r5(lat),
      lon: r5(lon),
    });
  }
  console.log(`RENIPRESS ${latest.at}: ${health.length} establecimientos`);
  return { health, at: latest.at };
}

/** Distancia aproximada en metros (para no duplicar un lugar oficial con el de OpenStreetMap). */
const meters = (a, b) => Math.hypot((a.lat - b.lat) * 111_320, (a.lon - b.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180));

/** Oficiales + los de OSM que no están a menos de 150 m de uno oficial (marcados `osm`); el teléfono que falte, de OSM. */
function withOsm(official, osm) {
  const out = official.map((p) => ({ ...p }));
  for (const o of osm.filter(Boolean)) {
    const twin = out.find((p) => !p.osm && meters(p, o) < 150);
    if (twin) {
      if (!twin.phone && o.phone) twin.phone = o.phone;
      if (!twin.address && o.address) twin.address = o.address;
    } else out.push({ ...o, osm: true });
  }
  return out;
}

const brSrc = (m) => `OpenStreetMap (ODbL), extracto de Geofabrik del ${m.extractDate}; cubre solo ${m.coverage}`;

/** Nombre del estado en GeoNames (admin1CodesASCII, `BR.<código>`) por sigla: para los estados de cada sector. */
const BR_UF = { PR: 'Paraná', SC: 'Santa Catarina', RS: 'Rio Grande do Sul', SP: 'São Paulo', RJ: 'Rio de Janeiro', MG: 'Minas Gerais', ES: 'Espírito Santo', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', GO: 'Goiás', DF: 'Federal District', MA: 'Maranhão', PI: 'Piauí', CE: 'Ceará', RN: 'Rio Grande do Norte', PB: 'Paraíba', PE: 'Pernambuco', AL: 'Alagoas', SE: 'Sergipe', BA: 'Bahia', AC: 'Acre', AM: 'Amazonas', AP: 'Amapá', PA: 'Pará', RO: 'Rondônia', RR: 'Roraima', TO: 'Tocantins' };

/** `cc` es el código del país o, en Brasil, `BR-<sector>` (el archivo de salida lleva ese nombre; `country` dentro, siempre `BR`). */
async function build(cc, radioList, labels) {
  const iso = cc.slice(0, 2);
  const admin1 = await admin1Names();
  const brMeta = cc.startsWith('BR-') ? localMeta(cc) : null;
  const { provinces: rawProvinces, places, all } = await geonames(iso, admin1, regionFilter(cc), brMeta && new Set(brMeta.states.map((u) => BR_UF[u.slice(3)])));
  // GeoNames llama «Federal District» al Distrito Federal: en la app va con su nombre en portugués.
  const provinces = rawProvinces.map((p) => (p === 'Federal District' ? 'Distrito Federal' : p));
  const elements = await overpass(cc);
  const fire = [];
  const police = [];
  const health = [];
  for (const e of elements) {
    const t = e.tags ?? {};
    if (t.amenity === 'fire_station') fire.push(toPlace(e, labels.fire));
    else if (t.amenity === 'police') police.push(toPlace(e, labels.police));
    else {
      const place = toPlace(e, labels.health);
      // Hospitales aparte de los centros de atención primaria (como en los datos argentinos).
      if (place && (t.amenity === 'hospital' || t.healthcare === 'hospital')) place.type = 'Hospital';
      health.push(place);
    }
  }
  // Uruguay: los listados oficiales, completados con OpenStreetMap; Perú: salud oficial (RENIPRESS);
  // Chile y Bolivia: solo OpenStreetMap.
  const official = cc === 'UY' ? await uyOfficial() : null;
  const pe = cc === 'PE' ? await peOfficial() : null;
  const UY_SRC = 'Ministerio del Interior (catalogodatos.gub.uy, Licencia de Datos Abiertos de Uruguay)';
  const data = {
    country: iso,
    ...(brMeta && { sector: brMeta.sector }),
    generatedAt: new Date().toISOString().slice(0, 10),
    // Sin listados oficiales, todos los lugares vienen de OpenStreetMap.
    ...(official || pe ? {} : { osm: true }),
    // Brasil: solo un sector (el resto del país está en los otros archivos BR-<sector>.json).
    ...(brMeta && { coverage: brMeta.coverage, extractDate: brMeta.extractDate }),
    sources: official
      ? {
          fire: `Destacamentos de bomberos: ${UY_SRC}; los que faltan: OpenStreetMap (ODbL)`,
          police: `Comisarías: ${UY_SRC}; las que faltan: OpenStreetMap (ODbL)`,
          health: 'Unidades asistenciales de ASSE (catalogodatos.gub.uy, Licencia de Datos Abiertos de Uruguay); mutualistas y los que faltan: OpenStreetMap (ODbL)',
          radio: labels.radioSource,
          places: 'GeoNames (CC BY 4.0)',
        }
      : {
          fire: brMeta ? brSrc(brMeta) : 'OpenStreetMap (ODbL)',
          police: brMeta ? brSrc(brMeta) : 'OpenStreetMap (ODbL)',
          health: brMeta ? brSrc(brMeta) : pe
            ? `Establecimientos de salud: RENIPRESS de SUSALUD (${pe.at}, datosabiertos.gob.pe, Open Data Commons Attribution); los que faltan: OpenStreetMap (ODbL)`
            : 'OpenStreetMap (ODbL)',
          radio: labels.radioSource,
          places: brMeta ? `GeoNames (CC BY 4.0), solo las localidades dentro de ${brMeta.coverage}` : 'GeoNames (CC BY 4.0)',
        },
    // En Perú solo la salud es oficial: policía y bomberos van marcados como de OpenStreetMap uno por uno.
    fire: official ? withOsm(official.fire, fire) : fire.filter(Boolean).map((p) => (pe ? { ...p, osm: true } : p)),
    police: official ? withOsm(official.police, police) : police.filter(Boolean).map((p) => (pe ? { ...p, osm: true } : p)),
    health: official ? withOsm(official.health, health) : pe ? withOsm(pe.health, health) : health.filter(Boolean),
    radio: radios(radioList, all),
    provinces,
    places,
  };
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(`${OUT_DIR}${cc}.json`, JSON.stringify(data));
  console.log(
    `${cc}: ${data.fire.length} bomberos, ${data.police.length} policía, ${data.health.length} salud, ${data.radio.length} radios, ${places.length} localidades`,
  );
}

/**
 * Radio Nacional del Paraguay (estatal, Mitic): las tres frecuencias que muestra el menú de su sitio oficial (radionacional.gov.py,
 * leído el 2026-11-16). No hay un listado completo (CONATEL no publica uno): no se agrega nada que no esté en la fuente oficial.
 */
const RADIO_PY = [
  ['Radio Nacional del Paraguay', 'Asunción', 920, null, { province: 'Distrito Capital', lat: -25.2637, lon: -57.5759 }],
  ['Radio Nacional del Paraguay', 'San Pedro', null, 105.9, { province: 'San Pedro', lat: -24.093, lon: -57.083 }],
  ['Radio Nacional del Paraguay', 'Pilar', 700, null, { province: 'Ñeembucú', lat: -26.867, lon: -58.3 }],
];

/**
 * Rádio Nacional de Brasil (EBC, empresa pública), de la página oficial https://www.ebc.com.br/sobre/radio-nacional (consultada el
 * 2026-11-20): solo las emisoras con frecuencia publicada ahí. Rio de Janeiro y São Paulo: FM 87,1 (la página no da AM); Brasília: AM 980 y
 * FM 96,1; São Luís: FM 93,7; Alto Solimões: FM 96,1 (Tabatinga). Recife figura entre las emisoras propias pero sin frecuencia: queda afuera.
 * La Rádio Nacional da Amazônia (onda corta, 11.780 y 6.180 kHz) no tiene un lugar fijo: va en el texto de la app. Cada emisora va en el
 * sector donde está. Las coordenadas son las del centro de la ciudad. No se agregan emisoras comerciales ni de otras redes sin fuente oficial.
 */
const RADIO_BR = {
  sudeste: [
    ['Rádio Nacional do Rio de Janeiro', 'Rio de Janeiro', null, 87.1, { province: 'Rio de Janeiro', lat: -22.9068, lon: -43.1729 }],
    ['Rádio Nacional de São Paulo', 'São Paulo', null, 87.1, { province: 'São Paulo', lat: -23.5505, lon: -46.6333 }],
  ],
  'centro-oeste': [['Rádio Nacional de Brasília', 'Brasília', 980, 96.1, { province: 'Distrito Federal', lat: -15.7939, lon: -47.8828 }]],
  nordeste: [['Rádio Nacional de São Luís', 'São Luís', null, 93.7, { province: 'Maranhão', lat: -2.5307, lon: -44.3068 }]],
  norte: [['Rádio Nacional do Alto Solimões', 'Tabatinga', null, 96.1, { province: 'Amazonas', lat: -4.253, lon: -69.938 }]],
  sul: [],
};

const only = process.argv[2];
const BR_SECTORS = ['sul', 'sudeste', 'centro-oeste', 'nordeste', 'norte'];
if (!only || only === 'UY') await build('UY', RADIO_UY, { fire: 'Bomberos', police: 'Policía', health: 'Centro de salud', radioSource: 'Radiodifusión Nacional del Uruguay (Wikipedia)' });
if (!only || only === 'CL') await build('CL', RADIO_CL, { fire: 'Bomberos', police: 'Carabineros', health: 'Centro de salud', radioSource: 'Radio Bío-Bío (Wikipedia)' });
if (!only || only === 'BO') await build('BO', RADIO_BO, { fire: 'Bomberos', police: 'Policía', health: 'Centro de salud', radioSource: 'Red Patria Nueva (State Media Monitor)' });
if (!only || only === 'PE') await build('PE', RADIO_PE, { fire: 'Bomberos', police: 'Comisaría', health: 'Centro de salud', radioSource: 'Radio Nacional del Perú (IRTP, datos abiertos de datosabiertos.gob.pe, ODC-By, planilla de 2021)' });
if (!only || only === 'PY') await build('PY', RADIO_PY, { fire: 'Bomberos', police: 'Policía', health: 'Centro de salud', radioSource: 'Radio Nacional del Paraguay (radionacional.gov.py, sitio oficial, 2026-11-16)' });
// Brasil: `BR` arma los sectores que tengan archivo local; `BR-<sector>` uno solo.
const BR_LABELS = { fire: 'Bombeiros', police: 'Polícia', health: 'Unidade de saúde', radioSource: 'Rádio Nacional (EBC, ebc.com.br/sobre/radio-nacional, sitio oficial, consultado el 2026-11-20)' };
for (const sector of BR_SECTORS) {
  const cc = `BR-${sector}`;
  if (only === cc || only === 'BR' || (!only && hasLocal(cc))) {
    if (!hasLocal(cc)) throw new Error(`${cc}: falta places-${cc}.jsonl (OSM_LOCAL_DIR; ver tools/osm-index/brazil.sh)`);
    await build(cc, RADIO_BR[sector] ?? [], BR_LABELS);
  }
}
if (!only && !BR_SECTORS.some((s) => hasLocal(`BR-${s}`))) console.warn('BR: sin places-BR-<sector>.jsonl, se salta');
