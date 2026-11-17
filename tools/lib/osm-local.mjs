/**
 * OpenStreetMap por país para las herramientas de datos, sin Overpass: lee los archivos que arma `tools/osm-index/countries.sh` desde el
 * extracto de Geofabrik (uno por país, recortado con el contorno oficial del país: `deploy/osm/countries/places-<PAÍS>.jsonl`). Si el
 * archivo del país no está, consulta a Overpass como antes (`overpass.mjs`). © colaboradores de OpenStreetMap, ODbL.
 *
 * Los filtros se escriben con la misma sintaxis que ya usaban las herramientas (`nwr["amenity"="fuel"]["boat"="yes"]`) y valen para las dos
 * fuentes: a Overpass se le pasan tal cual y para el archivo local se convierten en una función.
 */
import { createReadStream, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { overpass } from './overpass.mjs';

const DEFAULT_DIR = fileURLToPath(new URL('../../deploy/osm/countries/', import.meta.url));
const dirOf = () => (process.env.OSM_LOCAL_DIR ?? DEFAULT_DIR).replace(/\/?$/, '/');
export const localFile = (cc) => `${dirOf()}places-${cc}.jsonl`;
export const hasLocal = (cc) => process.env.OSM_LOCAL !== '0' && existsSync(localFile(cc));

/** `nwr["amenity"~"^(a|b)$"]["phone"]` → función sobre las etiquetas. Soporta `=`, `!=`, `~`, `!~` y la existencia de la clave (`["k"]`). */
export function selectorToPredicate(selector) {
  const tests = [];
  for (const m of selector.matchAll(/\["([^"]+)"(?:(!?[=~])"((?:[^"\\]|\\.)*)")?\]/g)) {
    const [, key, op, val] = m;
    if (!op) tests.push((t) => t[key] !== undefined);
    else if (op === '=') tests.push((t) => t[key] === val);
    else if (op === '!=') tests.push((t) => t[key] !== val);
    else if (op === '~') {
      const re = new RegExp(val);
      tests.push((t) => t[key] !== undefined && re.test(t[key]));
    } else {
      const re = new RegExp(val);
      tests.push((t) => t[key] === undefined || !re.test(t[key]));
    }
  }
  if (tests.length === 0) throw new Error(`filtro no soportado: ${selector}`);
  return (t) => tests.every((f) => f(t));
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
    if (!preds.some((p) => p(e.tags))) continue;
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
