#!/usr/bin/env node
/**
 * Genera el mapa base del Mapa de Meteorología
 * (app/src/modules/weathermap/geo-data.json):
 *
 * - Provincias de Argentina, regiones de Chile y departamentos de Uruguay,
 *   Bolivia y Perú, más el contorno del resto de América del Sur y las Islas
 *   Malvinas, con el nombre de cada país (en español e inglés).
 *   Natural Earth 1:10m y 1:50m (dominio público): https://www.naturalearthdata.com
 * - Capitales de cada provincia, región y departamento (para el clima por zona).
 * - Volcanes del Holoceno de Argentina, Chile, Bolivia y Perú: Global Volcanism Program,
 *   Smithsonian Institution (Volcanoes of the World, uso libre citando la fuente):
 *   https://volcano.si.edu
 *
 * - Ríos de América del Sur: líneas centrales de Natural Earth 1:10m (dominio público) y, para que todo río con
 *   estación de nivel (INA, SENAMHI Bolivia) aparezca, los cursos de OpenStreetMap (ODbL, © OpenStreetMap contributors)
 *   a menos de 12 km de una estación, como el Paraná de las Palmas, que Natural Earth no trae.
 * - `node build.mjs --solo-paraguay` suma Paraguay (departamentos, frontera, capitales) al archivo ya generado.
 * - `node build.mjs --solo-mundo` genera aparte `world-borders.json`: el contorno de todos los países del mundo (Natural Earth 1:50m) para el mapa del clima.
 * - `node build.mjs --solo-contornos` suma al archivo ya generado el contorno de América Central y de la Antártida (sector de la Península).
 *   `node build.mjs --solo-rios` reemplaza solo los ríos en el archivo ya generado (sin volver a bajar volcanos ni provincias).
 *
 * Las geometrías se simplifican (Douglas-Peucker) y se redondean: el mapa es un
 * contorno de referencia, no cartografía de precisión.
 *
 * Uso: node tools/geo-data/build.mjs   (necesita conexión; el resultado se versiona)
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { overpass } from '../lib/overpass.mjs';
import { localRiversNearStations } from '../lib/osm-local.mjs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';
const GVP =
  'https://webservices.volcano.si.edu/geoserver/GVP-VOTW/ows?service=WFS&version=1.0.0&request=GetFeature' +
  '&typeName=GVP-VOTW:Smithsonian_VOTW_Holocene_Volcanoes&outputFormat=application/json';
const OUT = fileURLToPath(new URL('../../app/src/modules/weathermap/geo-data.json', import.meta.url));

const COUNTRIES = { ARG: 'AR', CHL: 'CL', URY: 'UY', BOL: 'BO', PER: 'PE', PRY: 'PY' };
/** El resto de América del Sur (la Guayana Francesa sale del polígono de Francia). */
const NEIGHBORS = ['BRA', 'ECU', 'COL', 'VEN', 'GUY', 'SUR'];
/** Grados: ~1 km en provincias, ~4 km en el contorno de los vecinos. */
const TOLERANCE = 0.01;
const NEIGHBOR_TOLERANCE = 0.04;
/** Islotes más chicos que esto (grados²) no aportan a un mapa de referencia. */
const MIN_RING_AREA = 0.002;
/** Solo las islas grandes en la frontera de los países (ver más abajo). */
const BORDER_MIN_AREA = 0.05;

const get = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
};

const r3 = (n) => Math.round(n * 1000) / 1000;
const label = (p) => [r3(p.LABEL_X), r3(p.LABEL_Y)];

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

const area = (ring) => Math.abs(ring.reduce((s, [x1, y1], i) => {
  const [x2, y2] = ring[(i + 1) % ring.length];
  return s + x1 * y2 - x2 * y1;
}, 0)) / 2;

/** Polígono o multipolígono → anillos exteriores simplificados, como [lon, lat, lon, lat, …]. */
function rings(geometry, tolerance, minArea = MIN_RING_AREA) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polys
    .map((poly) => poly[0])
    .filter((ring) => area(ring) >= minArea)
    .map((ring) => simplify(ring, tolerance))
    .filter((ring) => ring.length >= 4)
    .map((ring) => ring.flatMap(([lon, lat]) => [r3(lon), r3(lat)]));
}

/** Grados: ~2 km; un río es una línea de referencia. */
const RIVER_TOLERANCE = 0.02;
/** América del Sur: [oeste, sur, este, norte]. */
const SOUTH_AMERICA = [-83, -58, -33, 14];

/** Distancia (grados) a la que se simplifican los cursos de OpenStreetMap: ~500 m. */
const OSM_RIVER_TOLERANCE = 0.005;
const STATION_RADIUS_M = 12_000;
const normName = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/^rio /, '').trim();

/** Cursos de agua de OpenStreetMap cerca de las estaciones de nivel de ríos que Natural Earth no trae (por nombre). */
async function osmRiversNearStations(known) {
  const dir = new URL('../../app/public/data/', import.meta.url);
  const stations = [];
  for (const f of ['rivers-AR.json', 'rivers-BO.json']) stations.push(...JSON.parse(await readFile(new URL(f, dir), 'utf8')).stations);
  // Archivo local de Geofabrik (tools/osm-index/countries.sh) si fue armado con esta lista de estaciones; si no, Overpass.
  let elements = await localRiversNearStations(stations, STATION_RADIUS_M);
  if (elements) console.log(`Ríos de OpenStreetMap: archivo local (${elements.length} caminos)`);
  else {
    const around = stations.map((s) => `way(around:${STATION_RADIUS_M},${s.lat},${s.lon})["waterway"="river"];`).join('\n');
    elements = await overpass(`[out:json][timeout:180];(\n${around}\n);out geom tags;`);
  }
  const byName = new Map();
  for (const el of elements) {
    const name = el.tags?.name;
    if (!name || !el.geometry || el.geometry.length < 2 || known.has(normName(name))) continue;
    const line = simplify(el.geometry.map((g) => [g.lon, g.lat]), OSM_RIVER_TOLERANCE).flatMap(([lon, lat]) => [r3(lon), r3(lat)]);
    if (line.length >= 4) byName.set(name, [...(byName.get(name) ?? []), line]);
  }
  return [...byName].map(([name, lines]) => ({ name, rank: 6, osm: true, lines })).sort((a, b) => a.name.localeCompare(b.name));
}

/** Ríos: Natural Earth y los de OpenStreetMap cerca de estaciones → [{ name, rank, lines: [[lon, lat, lon, lat, …]] }]. `rank` 1 es el mayor. */
async function riversOf() {
  const ne = await neRivers();
  return [...ne, ...(await osmRiversNearStations(new Set(ne.map((r) => normName(r.name)))))];
}

async function neRivers() {
  const data = await get(`${NE}/ne_10m_rivers_lake_centerlines.geojson`);
  const [w, so, e, n] = SOUTH_AMERICA;
  const inside = ([lon, lat]) => lon >= w && lon <= e && lat >= so && lat <= n;
  const out = [];
  for (const f of data.features) {
    if (f.properties.featurecla !== 'River') continue;
    const parts = f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [f.geometry.coordinates];
    const lines = parts
      .filter((line) => line.some(inside))
      .map((line) => simplify(line, RIVER_TOLERANCE))
      .filter((line) => line.length >= 2)
      .map((line) => line.flatMap(([lon, lat]) => [r3(lon), r3(lat)]));
    if (lines.length) out.push({ name: f.properties.name ?? '', rank: f.properties.scalerank, lines });
  }
  return out.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
}

if (process.argv.includes('--solo-rios')) {
  const data = JSON.parse(await readFile(OUT, 'utf8'));
  data.rivers = await riversOf();
  await writeFile(OUT, JSON.stringify(data));
  console.log(`ríos: ${data.rivers.length} → ${OUT} (${JSON.stringify(data).length} bytes)`);
  process.exit(0);
}

/** América Central (de Guatemala a Panamá): solo el contorno, como el resto de los vecinos. */
const CENTRAL_AMERICA = ['GTM', 'BLZ', 'SLV', 'HND', 'NIC', 'CRI', 'PAN'];
/** Antártida: solo el sector de la Península y el mar de Weddell, donde hay estaciones de mareas ([oeste, sur, este, norte]). */
const ANTARCTICA_BOX = [-100, -80, -20, -60];

/** Recorta un anillo [[lon, lat], …] a un rectángulo (Sutherland–Hodgman). */
function clipRing(ring, [w, s, e, n]) {
  const edges = [
    [([x]) => x >= w, (a, b) => { const t = (w - a[0]) / (b[0] - a[0]); return [w, a[1] + t * (b[1] - a[1])]; }],
    [([x]) => x <= e, (a, b) => { const t = (e - a[0]) / (b[0] - a[0]); return [e, a[1] + t * (b[1] - a[1])]; }],
    [([, y]) => y >= s, (a, b) => { const t = (s - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), s]; }],
    [([, y]) => y <= n, (a, b) => { const t = (n - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), n]; }],
  ];
  let out = ring;
  for (const [inside, cut] of edges) {
    const input = out;
    out = [];
    input.forEach((cur, i) => {
      const prev = input[(i + input.length - 1) % input.length];
      if (inside(cur)) {
        if (!inside(prev)) out.push(cut(prev, cur));
        out.push(cur);
      } else if (inside(prev)) out.push(cut(prev, cur));
    });
    if (!out.length) return [];
  }
  return out;
}

/** Capitales departamentales de Paraguay: [nombre, latitud, longitud]. */
const PY_CAPITALS = [
  ['Asunción', -25.264, -57.576], ['Concepción', -23.406, -57.434], ['San Pedro de Ycuamandiyú', -24.093, -57.083],
  ['Caacupé', -25.386, -57.141], ['Villarrica', -25.75, -56.433], ['Coronel Oviedo', -25.45, -56.442],
  ['Caazapá', -26.199, -56.371], ['Encarnación', -27.331, -55.867], ['San Juan Bautista', -26.667, -57.15],
  ['Pilar', -26.867, -58.3], ['Paraguarí', -25.624, -57.152], ['Areguá', -25.311, -57.389],
  ['Ciudad del Este', -25.517, -54.617], ['Salto del Guairá', -24.058, -54.308], ['Pedro Juan Caballero', -22.547, -55.733],
  ['Pozo Colorado', -23.492, -58.8], ['Filadelfia', -22.35, -60.033], ['Fuerte Olimpo', -21.042, -57.867],
];

if (process.argv.includes('--solo-paraguay')) {
  // Paraguay deja de ser solo contorno: departamentos, frontera, capitales y nombre. Se suma al archivo ya generado.
  const data = JSON.parse(await readFile(OUT, 'utf8'));
  const [admin1, admin0hi] = await Promise.all([
    get(`${NE}/ne_10m_admin_1_states_provinces.geojson`),
    get(`${NE}/ne_10m_admin_0_countries.geojson`),
  ]);
  const regions = admin1.features
    .filter((f) => f.properties.adm0_a3 === 'PRY')
    .map((f) => ({
      id: f.properties.iso_3166_2 || f.properties.adm1_code,
      country: 'PY',
      name: f.properties.name_es || f.properties.name,
      label: [r3(f.properties.longitude), r3(f.properties.latitude)],
      rings: rings(f.geometry, TOLERANCE),
    }));
  const border = admin0hi.features.find((f) => f.properties.ADM0_A3 === 'PRY');
  // Natural Earth trae capitales equivocadas para Paraguay (Ypacaraí en vez de Areguá, ninguna de Boquerón ni Canindeyú):
  // se usa la lista de las 18 capitales departamentales, con coordenadas aproximadas del casco urbano.
  const capitals = PY_CAPITALS.map(([name, lat, lon]) => ({ name, country: 'PY', national: name === 'Asunción', lon, lat }));
  data.regions = [...data.regions.filter((r) => r.country !== 'PY'), ...regions].sort((a, b) => a.id.localeCompare(b.id));
  data.neighbors = data.neighbors.filter((n) => n.code !== 'PY');
  data.borders = [...data.borders.filter((b) => b.code !== 'PY'), { code: 'PY', rings: rings(border.geometry, TOLERANCE, BORDER_MIN_AREA) }];
  data.capitals = [...data.capitals.filter((c) => c.country !== 'PY'), ...capitals].sort((a, b) => a.name.localeCompare(b.name));
  await writeFile(OUT, JSON.stringify(data));
  console.log(`Paraguay: ${regions.length} departamentos, ${capitals.length} capitales → ${OUT} (${JSON.stringify(data).length} bytes)`);
  process.exit(0);
}

if (process.argv.includes('--solo-mundo')) {
  // Contorno de todos los países del mundo (Natural Earth 1:50m, dominio público) para el mapa del clima, en un archivo aparte que se carga recién
  // cuando se abre ese mapa. Salen los que ya están en geo-data.json (con más detalle), las Malvinas y las Georgias del Sur (ya van con la Argentina),
  // la Antártida (no entra en Mercator; su sector de la Península ya está) y la Guayana Francesa, que NE trae dentro del polígono de Francia.
  const WORLD_OUT = fileURLToPath(new URL('../../app/src/modules/weathermap/world-borders.json', import.meta.url));
  const WORLD_TOLERANCE = 0.1;
  const WORLD_MIN_AREA = 0.02;
  const base = JSON.parse(await readFile(OUT, 'utf8'));
  const skip = new Set(['AQ', 'FK', 'GS', ...base.neighbors.map((n) => n.code), ...base.regions.map((r) => r.country), ...base.borders.map((b) => b.code)]);
  const admin0 = await get(`${NE}/ne_50m_admin_0_countries.geojson`);
  const inGuiana = (ring) => {
    const lon = ring.reduce((t, [x]) => t + x, 0) / ring.length;
    const lat = ring.reduce((t, [, y]) => t + y, 0) / ring.length;
    return lon > -55 && lon < -51 && lat > 2 && lat < 6;
  };
  const countries = [];
  for (const f of admin0.features) {
    const code = f.properties.ISO_A2_EH;
    if (f.properties.ADM0_A3 === 'ATA' || skip.has(code)) continue;
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    const rs = polys
      .map((poly) => poly[0])
      .filter((ring) => !(code === 'FR' && inGuiana(ring)) && area(ring) >= WORLD_MIN_AREA)
      .map((ring) => simplify(ring, WORLD_TOLERANCE))
      .filter((ring) => ring.length >= 4)
      .map((ring) => ring.flatMap(([lon, lat]) => [Math.round(lon * 100) / 100, Math.round(lat * 100) / 100]));
    if (rs.length) countries.push({ code, rings: rs });
  }
  countries.sort((a, b) => a.code.localeCompare(b.code));
  const out = { source: 'Natural Earth 1:50m (dominio público), simplificado a ~10 km', countries };
  await writeFile(WORLD_OUT, JSON.stringify(out));
  console.log(`mundo: ${countries.length} países → ${WORLD_OUT} (${JSON.stringify(out).length} bytes)`);
  process.exit(0);
}

if (process.argv.includes('--solo-contornos')) {
  // Suma el contorno de América Central y la Antártida al archivo ya generado, sin volver a bajar el resto.
  const data = JSON.parse(await readFile(OUT, 'utf8'));
  const admin0 = await get(`${NE}/ne_50m_admin_0_countries.geojson`);
  const extra = [];
  for (const f of admin0.features.filter((f) => CENTRAL_AMERICA.includes(f.properties.ADM0_A3))) {
    extra.push({ code: f.properties.ISO_A2_EH, rings: rings(f.geometry, NEIGHBOR_TOLERANCE), name: { es: f.properties.NAME_ES, en: f.properties.NAME_EN }, label: label(f.properties) });
  }
  const ata = admin0.features.find((f) => f.properties.ADM0_A3 === 'ATA');
  const polys = ata.geometry.type === 'Polygon' ? [ata.geometry.coordinates] : ata.geometry.coordinates;
  const ataRings = polys
    .map((poly) => clipRing(poly[0], ANTARCTICA_BOX))
    .filter((ring) => ring.length >= 4 && area(ring) >= MIN_RING_AREA)
    .map((ring) => simplify(ring, NEIGHBOR_TOLERANCE))
    .filter((ring) => ring.length >= 4)
    .map((ring) => ring.flatMap(([lon, lat]) => [r3(lon), r3(lat)]));
  extra.push({ code: 'AQ', rings: ataRings, name: { es: 'Antártida', en: 'Antarctica' }, label: [-75, -77] });
  const codes = new Set(extra.map((e) => e.code));
  data.neighbors = [...data.neighbors.filter((n) => !codes.has(n.code)), ...extra.map(({ code, rings }) => ({ code, rings }))];
  data.countries = [...data.countries.filter((c) => !codes.has(c.code)), ...extra.map(({ code, name, label }) => ({ code, name, label }))].sort((a, b) => a.code.localeCompare(b.code));
  await writeFile(OUT, JSON.stringify(data));
  console.log(`contornos: ${[...codes].join(', ')} → ${OUT} (${JSON.stringify(data).length} bytes)`);
  process.exit(0);
}

const [admin1, admin0hi, places, admin0, volcanoes] = await Promise.all([
  get(`${NE}/ne_10m_admin_1_states_provinces.geojson`),
  get(`${NE}/ne_10m_admin_0_countries.geojson`),
  get(`${NE}/ne_10m_populated_places_simple.geojson`),
  get(`${NE}/ne_50m_admin_0_countries.geojson`),
  get(GVP),
]);

const regions = admin1.features
  .filter((f) => COUNTRIES[f.properties.adm0_a3])
  .map((f) => ({
    id: f.properties.iso_3166_2 || f.properties.adm1_code,
    country: COUNTRIES[f.properties.adm0_a3],
    name: f.properties.name,
    label: [r3(f.properties.longitude), r3(f.properties.latitude)],
    rings: rings(f.geometry, TOLERANCE),
  }))
  .sort((a, b) => a.id.localeCompare(b.id));

// Las Malvinas van con el resto del mapa (no como país vecino), con su nombre en español.
const flk = admin0.features.find((f) => f.properties.ADM0_A3 === 'FLK');
regions.push({ id: 'AR-MALVINAS', country: 'AR', name: 'Islas Malvinas', label: [-59.5, -51.75], rings: rings(flk.geometry, TOLERANCE) });

const neighbors = admin0.features
  .filter((f) => NEIGHBORS.includes(f.properties.ADM0_A3))
  .map((f) => ({ code: f.properties.ISO_A2_EH, rings: rings(f.geometry, NEIGHBOR_TOLERANCE) }));
// Guayana Francesa: los polígonos de Francia que están en América del Sur.
const fra = admin0.features.find((f) => f.properties.ADM0_A3 === 'FRA');
const guiana = { type: 'MultiPolygon', coordinates: fra.geometry.coordinates.filter((poly) => poly[0].every(([lon, lat]) => lon < -50 && lon > -55 && lat > 1 && lat < 6.5)) };
neighbors.push({ code: 'GF', rings: rings(guiana, NEIGHBOR_TOLERANCE) });

/**
 * Frontera y costa de nuestros países, del mismo 1:10m que las provincias (así
 * coinciden con sus bordes), para dibujarlas de otro color que los límites
 * internos. Las Malvinas van con Argentina.
 */
// Solo las islas grandes (Chiloé, Tierra del Fuego, Malvinas…): las cientos de islitas de los
// canales del sur con línea gruesa forman una mancha; ya tienen su línea fina de provincia.
const borders = admin0hi.features
  .filter((f) => COUNTRIES[f.properties.ADM0_A3])
  .map((f) => ({ code: COUNTRIES[f.properties.ADM0_A3], rings: rings(f.geometry, TOLERANCE, BORDER_MIN_AREA) }));
borders.find((b) => b.code === 'AR').rings.push(...rings(flk.geometry, TOLERANCE, BORDER_MIN_AREA));

/** Nombre de cada país de América del Sur y dónde escribirlo. */
const countries = [
  ...admin0.features
    .filter((f) => COUNTRIES[f.properties.ADM0_A3] || NEIGHBORS.includes(f.properties.ADM0_A3))
    .map((f) => ({ code: f.properties.ISO_A2_EH, name: { es: f.properties.NAME_ES, en: f.properties.NAME_EN }, label: label(f.properties) })),
  { code: 'GF', name: { es: 'Guayana Francesa', en: 'French Guiana' }, label: [-53.2, 3.9] },
].sort((a, b) => a.code.localeCompare(b.code));

const capitals = places.features
  .filter((f) => COUNTRIES[f.properties.adm0_a3] && /Admin-[01] capital/.test(f.properties.featurecla))
  .map((f) => ({
    name: f.properties.name,
    country: COUNTRIES[f.properties.adm0_a3],
    national: f.properties.adm0cap === 1,
    lon: r3(f.properties.longitude),
    lat: r3(f.properties.latitude),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const volcanoRows = volcanoes.features
  .filter((f) => /Argentina|Chile|Bolivia|Peru/.test(f.properties.Country))
  .map((f) => {
    const p = f.properties;
    const [lon, lat] = f.geometry.coordinates;
    return {
      id: p.Volcano_Number,
      name: p.Volcano_Name,
      lon: r3(lon),
      lat: r3(lat),
      elevation: p.Elevation ?? null,
      lastEruption: typeof p.Last_Eruption_Year === 'number' ? p.Last_Eruption_Year : null,
      type: p.Primary_Volcano_Type ?? null,
      country: p.Country,
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

const data = {
  source: 'Natural Earth (dominio público; provincias, contorno y ríos) · © OpenStreetMap contributors (ODbL; ríos cerca de estaciones de nivel) · Global Volcanism Program, Smithsonian Institution',
  regions,
  neighbors,
  borders,
  countries,
  capitals,
  volcanoes: volcanoRows,
  rivers: await riversOf(),
};
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(data));
const points = (rs) => rs.reduce((n, r) => n + r.length / 2, 0);
console.log(
  `regiones: ${regions.length} (${regions.reduce((n, r) => n + points(r.rings), 0)} puntos), vecinos: ${neighbors.length}, países: ${countries.length}, ` +
    `capitales: ${capitals.length}, volcanes: ${volcanoRows.length} → ${OUT} (${JSON.stringify(data).length} bytes)`,
);
