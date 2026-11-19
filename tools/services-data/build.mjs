#!/usr/bin/env node
/**
 * Genera los archivos de servicios para "Buscar cercanos" (además de los de
 * emergencia): uno por categoría y país, `app/public/data/<categoría>-<país>.json`
 * (p. ej. fuel-AR.json, pharmacy-CL.json). Como los paquetes por país, no van en
 * la descarga inicial: se bajan una vez con el país y quedan guardados (ver
 * app/src/modules/emergency/services.ts).
 *
 * Categorías (filtros de la app):
 * - Vehículos: fuel (estaciones de servicio), tyres (gomerías), repair (talleres mecánicos).
 * - Salud: pharmacy (farmacias), aed (desfibriladores, DEA), vet (veterinarias).
 * - water (agua potable: bebederos, canillas, puntos de agua y vertientes),
 *   shelter (refugios de montaña, no atendidos y vivacs), atm (cajeros automáticos).
 *
 * Fuentes: OpenStreetMap (ODbL), vía Overpass. Estaciones de servicio de
 * Argentina: la base es el listado oficial de la Secretaría de Energía (precios
 * vigentes en surtidor, Resolución 314/2016; datos.energia.gob.ar, CC BY 4.0),
 * con bandera, dirección y combustibles; se descartan las que no informan
 * precios hace más de dos años (probablemente cerradas) y de OpenStreetMap se
 * suman las que faltan y el teléfono que le falte a una oficial.
 *
 * Combustibles (`fuels`): códigos que la app traduce: gasoline (nafta,
 * bencina, gasolina), diesel, cng (GNC/GNV) y lpg (GLP).
 *
 * Brasil (BR): por sectores (macrorregiones del IBGE: sul, sudeste, centro-oeste, nordeste, norte), un archivo por categoría y sector:
 * `<categoría>-BR-<sector>.json`, con `country: 'BR'`, `sector` y `coverage` (qué sector y estados cubre). Recortado de los extractos de
 * Geofabrik con tools/osm-index/brazil.sh (hay que apuntar OSM_LOCAL_DIR a su carpeta de salida; sin ese archivo no se genera, no se consulta
 * Brasil a Overpass). Fuente: OpenStreetMap (ODbL), fecha del extracto en `meta-BR-<sector>.json`; GeoNames CC BY 4.0 no interviene acá.
 *
 * Uso: node tools/services-data/build.mjs [AR|CL|UY|BO|PE|PY|BR|BR-<sector>] [categoría]
 *      (necesita conexión; el resultado se versiona; sin país, todos; sin categoría, todas)
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { hasLocal, localMeta, osmByCountry } from '../lib/osm-local.mjs';

// Salida: la app (por defecto) o, con VIKARG_DATA_OUT, la carpeta que sirve el servidor
// (actualización mensual, server/src/data/update-data.sh).
const OUT_DIR = process.env.VIKARG_DATA_OUT ? `${process.env.VIKARG_DATA_OUT.replace(/\/$/, '')}/` : fileURLToPath(new URL('../../app/public/data/', import.meta.url));
const UA = 'VikArg-Prepping-Tools-build/1.0 (https://github.com/mazzalaialan/SurvTools)';
const AR_PACKAGE = 'http://datos.energia.gob.ar/api/3/action/package_show?id=1c181390-5045-475e-94dc-410429be4b17';
/** Estaciones que no informan precios hace más de esto: se consideran cerradas. */
const MAX_AGE_MONTHS = 24;
export const BR_SECTORS = ['sul', 'sudeste', 'centro-oeste', 'nordeste', 'norte'];
export const COUNTRIES = ['AR', 'CL', 'UY', 'BO', 'PE', 'PY', ...BR_SECTORS.map((s) => `BR-${s}`)];

const r5 = (n) => Math.round(n * 1e5) / 1e5;
/** Distancia aproximada en metros (para no duplicar una estación oficial con la de OpenStreetMap). */
const meters = (a, b) => Math.hypot((a.lat - b.lat) * 111_320, (a.lon - b.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180));
/** "SHELL C.A.P.S.A." → "Shell"; las siglas cortas (YPF) quedan en mayúsculas. */
const title = (s) =>
  s
    .replace(/\b(S\.?\s?A\.?|S\.?R\.?L\.?|C\.?A\.?P\.?S\.?A\.?|S\.?A\.?C\.?I\.?(F\.?)?)\s*$/i, '')
    .trim()
    .toLowerCase()
    .replace(/(^|[\s(/.-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase())
    .replace(/\b(Ypf|Gnc|Glp|Aca)\b/g, (w) => w.toUpperCase())
    .replace(/\b(De|Del|La|Las|Los|Y|E)\b/g, (w, _a, i) => (i === 0 ? w : w.toLowerCase()));

/** Solo si está todo en mayúsculas ("AVDA BELGRANO 1017" → "Avda Belgrano 1017"); "RN 40" y "KM" quedan. */
const upperToTitle = (s) =>
  s === s.toUpperCase() && /\p{L}{4}/u.test(s) ? s.toLowerCase().replace(/(^|[\s(/.-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()).replace(/\b(Rn|Rp|Ruta Nac|Km|Gnc|Ypf)\b/g, (w) => (w.length <= 3 ? w.toUpperCase() : w)) : s;

// ---------- Argentina: Secretaría de Energía ----------

/** CSV con comillas (los campos geojson traen comas). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (field += '"'), i++;
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') row.push(field), (field = '');
    else if (c === '\n') row.push(field.replace(/\r$/, '')), rows.push(row), (row = []), (field = '');
    else field += c;
  }
  if (field || row.length) row.push(field), rows.push(row);
  const [head, ...rest] = rows;
  const keys = head.map((k) => k.replace(/^﻿/, ''));
  return rest.filter((r) => r.length === keys.length).map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i]])));
}

/** Producto de la Secretaría de Energía → combustible. */
const AR_PRODUCT = { 2: 'gasoline', 3: 'gasoline', 19: 'diesel', 21: 'diesel', 6: 'cng' };
const FUEL_ORDER = ['gasoline', 'diesel', 'cng', 'lpg'];

async function arOfficial() {
  const pkg = await (await fetch(AR_PACKAGE, { headers: { 'User-Agent': UA } })).json();
  const res = pkg.result.resources.find((r) => /vigentes/i.test(r.name) && /csv/i.test(r.format));
  if (!res) throw new Error('No se encontró el CSV de precios vigentes de la Secretaría de Energía');
  const resp = await fetch(res.url, { headers: { 'User-Agent': UA } });
  if (!resp.ok) throw new Error(`Secretaría de Energía: ${resp.status}`);
  const rows = parseCsv(await resp.text());
  const now = new Date();
  const oldest = `${new Date(now.getFullYear(), now.getMonth() - MAX_AGE_MONTHS, 1).toISOString().slice(0, 7)}`;
  const byId = new Map();
  for (const r of rows) {
    const lat = Number(r.latitud);
    const lon = Number(r.longitud);
    if (!lat || !lon || lat > -21 || lat < -56 || lon > -53 || lon < -74) continue;
    let s = byId.get(r.idempresa);
    if (!s) {
      const brand = r.empresabandera?.trim() ?? '';
      const sinBandera = !brand || /^blanca$/i.test(brand);
      s = {
        name: sinBandera ? title(r.empresa) : title(brand),
        lat: r5(lat),
        lon: r5(lon),
        // Muchas direcciones vienen en mayúsculas: se pasan a tipo título (las que no, quedan como están).
        address: [upperToTitle(r.direccion?.trim() ?? ''), r.localidad ? title(r.localidad) : ''].filter(Boolean).join(', '),
        ...(sinBandera ? { type: 'Sin bandera' } : {}),
        fuels: new Set(),
        last: '',
      };
      byId.set(r.idempresa, s);
    }
    const f = AR_PRODUCT[r.idproducto];
    if (f) s.fuels.add(f);
    if ((r.indice_tiempo ?? '') > s.last) s.last = r.indice_tiempo;
  }
  const out = [];
  for (const s of byId.values()) {
    if (s.last < oldest) continue;
    const { fuels, last: _last, ...rest } = s;
    out.push({ ...rest, fuels: FUEL_ORDER.filter((f) => fuels.has(f)) });
  }
  return out;
}

// ---------- OpenStreetMap ----------

/**
 * Cada categoría: qué se le pide a Overpass y, de cada elemento, el tipo que se
 * muestra (`type`) y una aclaración (`note`). Las mismas etiquetas que usa la
 * app para la consulta en vivo (app/src/modules/emergency/osm.ts).
 */
const SHELTER_TYPES = 'basic_hut|lean_to|rock_shelter|weather_shelter';
export const CATEGORIES = {
  fuel: { selectors: ['nwr["amenity"="fuel"]'] },
  tyres: { selectors: ['nwr["shop"="tyres"]'] },
  repair: { selectors: ['nwr["shop"="car_repair"]'] },
  pharmacy: { selectors: ['nwr["amenity"="pharmacy"]', 'nwr["healthcare"="pharmacy"]'] },
  aed: {
    selectors: ['nwr["emergency"="defibrillator"]'],
    // Dónde está adentro del edificio ("en la recepción"), si lo dice.
    note: (t) => t['defibrillator:location'] ?? t['defibrillator:location:es'] ?? t.description ?? '',
  },
  vet: { selectors: ['nwr["amenity"="veterinary"]'] },
  water: {
    selectors: ['nwr["amenity"="drinking_water"]', 'nwr["amenity"="water_point"]', 'nwr["man_made"="water_tap"]["drinking_water"="yes"]', 'nwr["natural"="spring"]'],
    // Una vertiente no siempre es potable: se aclara.
    type: (t) => (t.natural === 'spring' ? (t.drinking_water === 'yes' ? 'Vertiente (potable)' : t.drinking_water === 'no' ? 'Vertiente (no potable)' : 'Vertiente (potabilidad desconocida)') : t.amenity === 'water_point' ? 'Punto de agua' : 'Agua potable'),
    // Brasil: en Mato Grosso, Goiás y la Amazonia hay decenas de miles de `natural=spring` importados de la hidrografía (nacientes de arroyos,
    // sin nombre ni dato de potabilidad: 54.000 solo en el Centro-Oeste, 4,8 MB). No sirven para «buscar agua»: se descartan los sin nombre y
    // sin `drinking_water`. Los nombrados y los que dicen si son potables quedan.
    keep: (t, cc = '') => !(t.natural !== 'spring' && t.drinking_water === 'no') && !(cc.startsWith('BR') && t.natural === 'spring' && !t.name && !t.drinking_water),
  },
  shelter: {
    selectors: ['nwr["tourism"="alpine_hut"]', 'nwr["tourism"="wilderness_hut"]', `nwr["amenity"="shelter"]["shelter_type"~"^(${SHELTER_TYPES})$"]`],
    type: (t) => (t.tourism === 'alpine_hut' ? 'Refugio de montaña' : t.tourism === 'wilderness_hut' ? 'Refugio no atendido' : 'Vivac o reparo'),
    note: (t) => [t.ele && `${t.ele} m`, t.capacity && `capacidad ${t.capacity}`].filter(Boolean).join(' · '),
  },
  // Náutica: combustible para embarcaciones, marinas, rampas, guarderías, alquiler, talleres y amarras o boyas. Sin muelles (miles, casi sin nombre).
  // Mismas etiquetas que app/src/modules/emergency/osm.ts (isNautical, NAUTICAL_SELECTORS).
  nautical: {
    selectors: [
      'nwr["waterway"="fuel"]',
      'nwr["amenity"="fuel"]["boat"="yes"]',
      'nwr["amenity"="fuel"]["marine"="yes"]',
      'nwr["leisure"="marina"]',
      'nwr["leisure"="slipway"]',
      'nwr["amenity"="boat_storage"]',
      'nwr["amenity"="boat_rental"]',
      'nwr["shop"~"^(boat|boat_repair|ship_chandler)$"]',
      'nwr["craft"="boatbuilder"]',
      'nwr["mooring"]["mooring"!="no"]',
      'nwr["seamark:type"="mooring"]',
      // Solo muelles con nombre y no privados (hay miles, casi sin nombre y muchos privados).
      'nwr["man_made"="pier"]["name"]["access"!~"^(private|no)$"]',
    ],
    type: (t) =>
      t.waterway === 'fuel' || t.amenity === 'fuel'
        ? 'Combustible para embarcaciones'
        : t.leisure === 'marina'
          ? 'Marina'
          : t.leisure === 'slipway'
            ? 'Rampa para embarcaciones'
            : t.amenity === 'boat_storage'
              ? 'Guardería de embarcaciones'
              : t.amenity === 'boat_rental'
                ? 'Alquiler de embarcaciones'
                : t.man_made === 'pier'
                  ? 'Muelle'
                  : t.shop || t.craft
                  ? 'Taller o comercio náutico'
                  : 'Amarra o boya',
    note: (t) => (t.man_made === 'pier' ? 'Confirmá que sea de uso público' : ''),
    // Un muelle sin nombre o privado no entra aunque tenga `mooring=*` (esa etiqueta lo traería por la otra puerta).
    keep: (t) => t.man_made !== 'pier' || (!!t.name && t.access !== 'private' && t.access !== 'no'),
  },
  atm: {
    selectors: ['nwr["amenity"="atm"]', 'nwr["amenity"="bank"]["atm"="yes"]'],
    // La red (Banelco, Link, Redbanc…) o el banco.
    type: (t) => t.network ?? t.brand ?? t.operator ?? '',
  },
};

function fuelsOf(t) {
  const fuels = new Set();
  for (const [k, v] of Object.entries(t)) {
    if (v !== 'yes' || !k.startsWith('fuel:')) continue;
    const f = k.slice(5);
    if (/^(octane_\d+|e\d+|gasoline|petrol)$/.test(f)) fuels.add('gasoline');
    else if (/^(diesel|gtl_diesel|hgv_diesel|biodiesel)$/.test(f)) fuels.add('diesel');
    else if (f === 'cng') fuels.add('cng');
    else if (f === 'lpg') fuels.add('lpg');
  }
  return FUEL_ORDER.filter((f) => fuels.has(f));
}

async function osmPlaces(cc, category) {
  const cat = CATEGORIES[category];
  const seen = new Set();
  return (await osmByCountry(cc, cat.selectors))
    .map((e) => {
      const t = e.tags ?? {};
      const lat = e.lat ?? e.center?.lat;
      const lon = e.lon ?? e.center?.lon;
      if (lat === undefined || lon === undefined || (cat.keep && !cat.keep(t, cc))) return null;
      // Un banco con cajero y el cajero cargado aparte, o un nodo dentro de su edificio: uno solo.
      const key = `${r5(lat).toFixed(4)},${r5(lon).toFixed(4)}`;
      if (seen.has(key)) return null;
      seen.add(key);
      const brand = t.brand ?? t.operator ?? '';
      const name = t.name ?? (category === 'fuel' ? brand : '');
      const address = [[t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' '), t['addr:city']].filter(Boolean).join(', ');
      const phone = (t.phone ?? t['contact:phone'] ?? '').split(';')[0].trim();
      const type = cat.type ? cat.type(t) : brand && brand !== name ? brand : '';
      const note = cat.note ? cat.note(t) : '';
      const fuels = category === 'fuel' ? fuelsOf(t) : [];
      return {
        name,
        lat: r5(lat),
        lon: r5(lon),
        ...(address && { address }),
        ...(phone.replace(/\D/g, '').length >= 6 && { phone }),
        ...(type && { type }),
        ...(note && { note: note.slice(0, 160) }),
        ...(fuels.length && { fuels }),
      };
    })
    .filter(Boolean);
}

/** Oficiales + las de OSM que no están a menos de 150 m de una oficial (marcadas `osm`); el teléfono que falte, de OSM. */
function withOsm(official, osm) {
  const cell = (p) => `${Math.round(p.lat * 100)},${Math.round(p.lon * 100)}`;
  const grid = new Map();
  const out = official.map((p) => ({ ...p }));
  for (const p of out) grid.set(cell(p), [...(grid.get(cell(p)) ?? []), p]);
  const around = (p) => {
    const [la, lo] = cell(p).split(',').map(Number);
    const near = [];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) near.push(...(grid.get(`${la + i},${lo + j}`) ?? []));
    return near;
  };
  for (const o of osm) {
    // La misma estación: a menos de 150 m, o a menos de 400 m si es de la misma bandera
    // (las coordenadas del listado oficial a veces caen en la esquina o del otro lado de la ruta).
    const brandOf = (x) => `${x.name} ${x.type ?? ''}`.toLowerCase();
    const twin = around(o).find((p) => {
      const d = meters(p, o);
      return d < 150 || (d < 400 && !p.type && brandOf(o).includes(p.name.toLowerCase()));
    });
    if (twin) {
      if (!twin.phone && o.phone) twin.phone = o.phone;
    } else out.push({ ...o, osm: true });
  }
  return out;
}

async function build(cc, category) {
  const osm = await osmPlaces(cc, category);
  const official = cc === 'AR' && category === 'fuel' ? await arOfficial() : null;
  const places = official ? withOsm(official, osm) : osm;
  // Una respuesta cortada de Overpass trae de menos: con las estaciones (que siempre hay muchas) se nota.
  if (category === 'fuel' && places.length < MIN_FUEL[cc]) throw new Error(`${cc}: muy pocas estaciones (${places.length}); probá de nuevo más tarde`);
  const brMeta = cc.startsWith('BR-') ? localMeta(cc) : null;
  const data = {
    country: cc.slice(0, 2),
    ...(brMeta && { sector: brMeta.sector }),
    category,
    generatedAt: new Date().toISOString().slice(0, 10),
    // Sin listado oficial, todos vienen de OpenStreetMap.
    ...(official ? {} : { osm: true }),
    source: official
      ? 'Secretaría de Energía, precios vigentes en surtidor (datos.energia.gob.ar, CC BY 4.0); las que faltan: © colaboradores de OpenStreetMap (ODbL)'
      : brMeta
        ? `© colaboradores de OpenStreetMap (ODbL), extracto de Geofabrik del ${brMeta.extractDate}. Cubre solo el sector ${brMeta.coverage}, no todo Brasil`
        : '© colaboradores de OpenStreetMap (ODbL)',
    ...(brMeta && { coverage: brMeta.coverage, extractDate: brMeta.extractDate }),
    places,
  };
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(`${OUT_DIR}${category}-${cc}.json`, JSON.stringify(data));
  console.log(`${category}-${cc}: ${places.length}${official ? ` (${official.length} oficiales + ${places.length - official.length} de OpenStreetMap)` : ''}`);
}

/** Mínimo esperable de estaciones por país: si hay menos, la respuesta vino cortada y no se genera. */
const MIN_FUEL = { AR: 3000, CL: 800, UY: 200, BO: 150, PE: 800, PY: 800, 'BR-sul': 3000, 'BR-sudeste': 6000, 'BR-centro-oeste': 1200, 'BR-nordeste': 4000, 'BR-norte': 800 };

const [onlyCountry, onlyCategory] = process.argv.slice(2);
if (onlyCategory && !CATEGORIES[onlyCategory]) throw new Error(`Categoría desconocida: ${onlyCategory} (${Object.keys(CATEGORIES).join(', ')})`);
const wanted = onlyCountry === 'BR' ? BR_SECTORS.map((x) => `BR-${x}`) : onlyCountry ? [onlyCountry] : null;
if (wanted && !wanted.every((c) => COUNTRIES.includes(c))) throw new Error(`País desconocido: ${onlyCountry} (${COUNTRIES.join(', ')}, BR)`);
for (const cc of COUNTRIES) {
  if (wanted && !wanted.includes(cc)) continue;
  // Brasil solo se arma con el recorte local de cada sector: sin él se salta (y si se pide a propósito, avisa).
  if (cc.startsWith('BR-') && !hasLocal(cc)) {
    if (onlyCountry) throw new Error(`${cc}: falta places-${cc}.jsonl (OSM_LOCAL_DIR; ver tools/osm-index/brazil.sh)`);
    console.warn(`${cc}: sin places-${cc}.jsonl, se salta`);
    continue;
  }
  for (const category of Object.keys(CATEGORIES)) if (!onlyCategory || onlyCategory === category) await build(cc, category);
}
