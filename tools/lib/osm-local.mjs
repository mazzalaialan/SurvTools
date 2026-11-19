/**
 * OpenStreetMap por país para las herramientas de datos, sin Overpass: lee los archivos que arma `tools/osm-index/countries.sh` desde el
 * extracto de Geofabrik (uno por país, recortado con el contorno oficial del país: `deploy/osm/countries/places-<PAÍS>.jsonl`). Si el
 * archivo del país no está, consulta a Overpass como antes (`overpass.mjs`). © colaboradores de OpenStreetMap, ODbL.
 *
 * Los filtros se escriben con la misma sintaxis que ya usaban las herramientas (`nwr["amenity"="fuel"]["boat"="yes"]`) y valen para las dos
 * fuentes: a Overpass se le pasan tal cual y para el archivo local se convierten en una función.
 */
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { overpass } from './overpass.mjs';

const DEFAULT_DIR = fileURLToPath(new URL('../../deploy/osm/countries/', import.meta.url));
const dirOf = () => (process.env.OSM_LOCAL_DIR ?? DEFAULT_DIR).replace(/\/?$/, '/');
export const localFile = (cc) => `${dirOf()}places-${cc}.jsonl`;
/** Metadatos del recorte de un sector de Brasil (`meta-BR-<sector>.json` de osm-index/brazil.sh; código `BR-<sector>`): fecha del extracto, estados y fuente. `null` si no hay. */
export function localMeta(cc) {
  try {
    return JSON.parse(readFileSync(`${dirOf()}meta-${cc}.json`, 'utf8'));
  } catch {
    return null;
  }
}
export const hasLocal = (cc) => process.env.OSM_LOCAL !== '0' && existsSync(localFile(cc));

/** `nwr["amenity"~"^(a|b)$"]["phone"]` → función sobre las etiquetas. Soporta `=`, `!=`, `~`, `!~` y la existencia de la clave (`["k"]`). */
export function selectorToPredicate(selector) {
  const tests = [];
  // `relation[...]`, `way[...]`, `node[...]` solo valen para ese tipo; `nwr[...]` para todos.
  const wanted = selector.trim().match(/^(node|way|relation)\b/)?.[1];
  if (wanted) tests.push((_t, type) => type === undefined || type === wanted);
  for (const m of selector.matchAll(/\["([^"]+)"(?:(!?[=~])"((?:[^"\\]|\\.)*)"(,i)?)?\]/g)) {
    const [, key, op, val, flag] = m;
    if (!op) tests.push((t) => t[key] !== undefined);
    else if (op === '=') tests.push((t) => t[key] === val);
    else if (op === '!=') tests.push((t) => t[key] !== val);
    else if (op === '~') {
      const re = new RegExp(val, flag ? 'i' : '');
      tests.push((t) => t[key] !== undefined && re.test(t[key]));
    } else {
      const re = new RegExp(val, flag ? 'i' : '');
      tests.push((t) => t[key] === undefined || !re.test(t[key]));
    }
  }
  if (tests.length === (wanted ? 1 : 0)) throw new Error(`filtro no soportado: ${selector}`);
  return (t, type) => tests.every((f) => f(t, type));
}

const TYPE = { n: 'node', w: 'way', r: 'relation' };

/** Elementos con la forma de Overpass (`{type, id, lat, lon, tags}`) que cumplen alguno de los filtros. */
export async function localByCountry(cc, selectors) {
  const preds = selectors.map(selectorToPredicate);
  const out = [];
  const rl = createInterface({ input: createReadStream(localFile(cc)), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    const e = JSON.parse(line);
    let type0 = TYPE[e.id[0]] ?? 'node';
    if (e.id[0] === 'a') type0 = Number(e.id.slice(1)) % 2 === 0 ? 'way' : 'relation';
    if (!preds.some((p) => p(e.tags, type0))) continue;
    // Las áreas de osmium (`a123`) llevan el doble del id del camino, o el doble más uno si vienen de una relación.
    let type = TYPE[e.id[0]] ?? 'node';
    let id = Number(e.id.slice(1)) || 0;
    if (e.id[0] === 'a') {
      type = id % 2 === 0 ? 'way' : 'relation';
      id = Math.floor(id / 2);
    }
    out.push({ type, id, lat: e.lat, lon: e.lon, tags: e.tags });
  }
  return out;
}

/** Lo mismo desde Overpass (el respaldo, y lo que se usa si no hay archivo local del país). */
export function overpassByCountry(cc, selectors, { timeout = 300, ...opts } = {}) {
  // Brasil entero no cabe en Overpass ni en un paquete: solo se arma con el recorte regional (tools/osm-index/brazil.sh).
  if (cc.startsWith('BR')) throw new Error(`${cc}: falta places-${cc}.jsonl (sh tools/osm-index/brazil.sh <sector> <extracto> <salida>; OSM_LOCAL_DIR=<salida>); no se consulta Brasil a Overpass`);
  const query = `[out:json][timeout:${timeout}];
area["ISO3166-1"="${cc}"][admin_level=2]->.a;
(
${selectors.map((s) => `  ${s}(area.a);`).join('\n')}
);
out center tags;`;
  return overpass(query, opts);
}

/** Los elementos de OpenStreetMap de un país que cumplen alguno de los filtros: archivo local si existe, si no Overpass. */
export async function osmByCountry(cc, selectors, opts) {
  if (hasLocal(cc)) {
    console.log(`OpenStreetMap ${cc}: archivo local (${localFile(cc)})`);
    return localByCountry(cc, selectors);
  }
  console.log(`OpenStreetMap ${cc}: sin archivo local, se consulta a Overpass`);
  return overpassByCountry(cc, selectors, opts);
}

// ---------- Áreas protegidas (con su geometría) ----------

export const parksFile = (cc) => `${dirOf()}parks-${cc}.jsonl`;
export const hasLocalParks = (cc) => process.env.OSM_LOCAL !== '0' && existsSync(parksFile(cc));

async function readParks(cc, keep) {
  const out = [];
  const rl = createInterface({ input: createReadStream(parksFile(cc)), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    const e = JSON.parse(line);
    if (keep(e)) out.push(e);
  }
  // El orden de Overpass: caminos antes que relaciones, y por id (importa cuando dos áreas tienen el mismo nombre: gana la primera).
  const rank = { node: 0, way: 1, relation: 2 };
  return out.sort((a, b) => rank[a.type] - rank[b.type] || a.id - b.id);
}

/**
 * Áreas protegidas de un país con su geometría en la forma de Overpass (`out geom`): del archivo local (`parks-<PAÍS>.jsonl`, de
 * `tools/osm-index/countries.sh`) o, sin él, de Overpass. `geom: false` pide solo las etiquetas (`out tags`).
 */
export async function parksByCountry(cc, selectors, { geom = true, ...opts } = {}) {
  if (hasLocalParks(cc)) {
    console.log(`Áreas protegidas ${cc}: archivo local (${parksFile(cc)})`);
    const preds = selectors.map(selectorToPredicate);
    return readParks(cc, (e) => preds.some((p) => p(e.tags, e.type)));
  }
  console.log(`Áreas protegidas ${cc}: sin archivo local, se consulta a Overpass`);
  const query = `[out:json][timeout:300];
area["ISO3166-1"="${cc}"][admin_level=2]->.a;
(
${selectors.map((x) => `  ${x}(area.a);`).join('\n')}
);
out ${geom ? 'geom' : 'tags'};`;
  return overpass(query, opts);
}

/** La geometría de elementos concretos (por tipo e id): archivo local o, sin él, Overpass. */
export async function parksById(cc, type, ids, opts) {
  if (ids.length === 0) return [];
  if (hasLocalParks(cc)) {
    const want = new Set(ids);
    return readParks(cc, (e) => e.type === type && want.has(e.id));
  }
  const out = [];
  for (let i = 0; i < ids.length; i += 20) out.push(...(await overpass(`[out:json][timeout:180];${type}(id:${ids.slice(i, i + 20).join(',')});out geom;`, opts)));
  return out;
}

// ---------- Ríos cerca de las estaciones (tools/geo-data) ----------

export const riversFile = () => `${dirOf()}rivers-near-stations.jsonl`;
/** La huella de la lista de estaciones (igual que osm-index/nearRivers.mjs). */
export const stationsKey = (stations) =>
  createHash('sha1').update(stations.map((s) => `${s.lat.toFixed(5)},${s.lon.toFixed(5)}`).sort().join(';')).digest('hex');

/**
 * Ríos con nombre a menos de `radiusM` de las estaciones, en la forma de Overpass `out geom tags`: del archivo local si fue armado con esta
 * misma lista de estaciones y radio; si no, `null` (quien llama consulta a Overpass).
 */
export async function localRiversNearStations(stations, radiusM) {
  if (process.env.OSM_LOCAL === '0' || !existsSync(riversFile())) return null;
  const out = [];
  let ok = false;
  const rl = createInterface({ input: createReadStream(riversFile()), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    const e = JSON.parse(line);
    if (e.meta) {
      ok = e.meta.stations === stationsKey(stations) && e.meta.radiusM === radiusM;
      if (!ok) return null;
      continue;
    }
    out.push(e);
  }
  return ok ? out : null;
}
