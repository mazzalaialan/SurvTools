/**
 * Dónde se encuentra cada especie de Fauna: registros de GBIF (gbif.org) por departamento de Argentina.
 *
 * Uso: `node tools/fauna-data/occurrences.mjs ~/vikarg-fishing-work/fauna`
 *
 * Para cada ficha (por su nombre científico) busca la especie en GBIF y cuenta los registros con coordenadas válidas en Argentina
 * desde 1990, agrupados por departamento (GADM nivel 2, que GBIF asigna a cada registro). Los nombres GADM se traducen a los del
 * IGN (los del mapa de la app) por provincia y nombre normalizado. Escribe `gbif/presencia.json` en la carpeta de trabajo; los
 * nombres de GADM quedan en caché en `gbif/gadm.json` para no volver a pedirlos.
 *
 * Licencia: cada registro de GBIF trae la licencia de su conjunto (CC0, CC BY o CC BY-NC); acá solo se usan cantidades por zona,
 * con crédito a GBIF.org y la fecha de la consulta. Es un mapa de registros (dónde alguien lo vio y lo cargó), no de distribución
 * exacta: donde no hay registros puede igual haber.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const work = process.argv[2];
if (!work) {
  console.error('Uso: node tools/fauna-data/occurrences.mjs <carpeta de trabajo de fauna>');
  process.exit(1);
}
const UA = { 'User-Agent': 'VikArgDataTool/1.0' };
const API = 'https://api.gbif.org/v1';
const SINCE = 1990;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const read = (f) => JSON.parse(readFileSync(f, 'utf8'));

async function get(url) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { headers: UA });
    if (r.status === 429) {
      // Límite de uso de GBIF: se espera, no se insiste.
      await sleep(5000 * (i + 1));
      continue;
    }
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r.json();
  }
  throw new Error(`demasiados reintentos: ${url}`);
}

const dir = join(work, 'gbif');
mkdirSync(dir, { recursive: true });
const gadmFile = join(dir, 'gadm.json');
const gadm = existsSync(gadmFile) ? read(gadmFile) : {};
async function gadmName(gid) {
  if (!gadm[gid]) {
    const g = await get(`${API}/geocode/gadm/${gid}`);
    gadm[gid] = { name: g.name, parent: g.higherRegions?.find((h) => /^ARG\.\d+_1$/.test(h.id))?.name };
    await sleep(150);
  }
  return gadm[gid];
}

// Nombres del IGN por provincia, para traducir los de GADM.
const ign = read(join(work, 'ign', 'nombres.json'));
const norm = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(departamento|partido|de|del|la|las|los|el)\b/g, ' ')
    .replace(/\bgral\b\.?/g, 'general')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
/** GADM y el IGN escriben algunas provincias distinto. */
const PROV = { 'Ciudad de Buenos Aires': 'Ciudad de Buenos Aires', 'Distrito Federal': 'Ciudad de Buenos Aires', 'Tierra del Fuego': 'Tierra del Fuego' };
/** Nombres que GADM escribe distinto del IGN (con letras en vez de números, abreviados o viejos). Sin equivalente: Distrito Federal
 * (CABA entera) y General Sarmiento (partido disuelto en 1994). */
const DEPT = {
  'Nueve de Julio': '9 de Julio', 'Veinticinco de Mayo': '25 de Mayo', 'Primero de Mayo': '1° de Mayo', 'Doce de Octubre': '12 de Octubre',
  'Coronel de Marina Leonardo Rosal': 'Coronel de Marina Leonardo Rosales', 'San Fernando (1)': 'San Fernando', 'San Fernando (2)': 'San Fernando',
  Ameghino: 'Florentino Ameghino', 'Juan B. Alberdi': 'Juan Bautista Alberdi', 'General Angel Vicente Peñaloza': 'Ángel Vicente Peñaloza',
  'General Ocampo': 'General Ortiz de Ocampo', 'Coronel Felipe Varela': 'General Felipe Varela',
};
/**
 * Partidos y departamentos que se dividieron después del mapa que usa GBIF (GADM): los registros del viejo se cuentan también en cada
 * uno de los que salieron de él (es aproximado: el registro estaba en alguna parte del territorio viejo).
 */
const SPLITS = {
  'Buenos Aires|Morón': ['Morón', 'Hurlingham', 'Ituzaingó'],
  'Buenos Aires|General Sarmiento': ['San Miguel', 'José C. Paz', 'Malvinas Argentinas'],
  'Buenos Aires|Esteban Echeverría': ['Esteban Echeverría', 'Ezeiza', 'Presidente Perón'],
  'Buenos Aires|San Vicente': ['San Vicente', 'Presidente Perón'],
  'Buenos Aires|Florencio Varela': ['Florencio Varela', 'Presidente Perón'],
  'Buenos Aires|Magdalena': ['Magdalena', 'Punta Indio'],
  'Buenos Aires|Chascomús': ['Chascomús', 'Lezama'],
  'Tierra del Fuego|Río Grande': ['Río Grande', 'Tolhuin'],
  'Entre Ríos|Villaguay': ['Villaguay', 'San Salvador'],
  'Entre Ríos|Colón': ['Colón', 'San Salvador'],
};
const DEPT_BY_PROV = { 'Jujuy|Capital': 'Dr. Manuel Belgrano', 'San Luis|La Capital': 'Juan Martín de Pueyrredón' };
function toIgn(prov, dept) {
  dept = DEPT_BY_PROV[`${prov}|${dept}`] ?? DEPT[dept] ?? dept;
  const p = PROV[prov] ?? prov;
  const list = ign[p] ?? ign[Object.keys(ign).find((k) => norm(k) === norm(p)) ?? ''];
  if (!list) return null;
  const n = norm(dept);
  const hit = list.find((d) => norm(d) === n) ?? list.find((d) => norm(d).replace(/ /g, '') === n.replace(/ /g, ''));
  return hit ? [Object.keys(ign).find((k) => ign[k] === list), hit] : null;
}

const files = ['especies-mamiferos.json', 'especies-aves.json', 'especies-protegidas.json', 'especies-reptiles.json', 'especies-artropodos.json'];
const alias = existsSync(join(work, 'alias.json')) ? read(join(work, 'alias.json')) : {};
// Las fichas vienen como lista (`especies`) o como objeto por id (las aves).
const listOf = (d) => (Array.isArray(d.especies) ? d.especies : Object.values(d).filter((x) => x && typeof x === 'object' && x.id));
const species = files.flatMap((f) => (existsSync(join(work, f)) ? listOf(read(join(work, f))) : [])).filter((s) => !alias[s.id]);
const out = { source: 'GBIF.org, registros con coordenadas en Argentina desde 1990, por departamento (GADM nivel 2)', date: new Date().toISOString().slice(0, 10), species: {} };
const unmatched = new Set();
for (const sp of species) {
  // El nombre científico puede traer aclaraciones («Pecari tajacu (sinónimos: …)»): se usan las dos primeras palabras.
  const name = String(sp.cientifico ?? '').replace(/[()]/g, ' ').split(/\s+/).slice(0, 2).join(' ');
  if (!name) continue;
  const m = await get(`${API}/species/match?${new URLSearchParams({ name, kingdom: 'Animalia' })}`);
  await sleep(150);
  if (!m.usageKey || m.matchType === 'NONE') {
    console.warn(`${sp.id}: sin coincidencia en GBIF para «${name}»`);
    continue;
  }
  const q = new URLSearchParams({ taxonKey: m.usageKey, country: 'AR', limit: '0', facet: 'gadmLevel2Gid', facetLimit: '700', hasGeospatialIssue: 'false', occurrenceStatus: 'PRESENT', year: `${SINCE},${new Date().getFullYear()}` });
  const d = await get(`${API}/occurrence/search?${q}`);
  await sleep(250);
  const depts = {};
  for (const c of d.facets?.[0]?.counts ?? []) {
    if (!c.name.startsWith('ARG.')) continue;
    const g = await gadmName(c.name);
    const hit = g.parent ? toIgn(g.parent, g.name) : null;
    const split = g.parent ? SPLITS[`${PROV[g.parent] ?? g.parent}|${g.name}`] : undefined;
    if (split) {
      const prov = PROV[g.parent] ?? g.parent;
      for (const dn of split) (depts[prov] ??= {})[dn] = (depts[prov][dn] ?? 0) + c.count;
      continue;
    }
    if (!hit && /buenos aires/i.test(g.parent ?? '') && g.name === 'Distrito Federal') {
      // GADM tiene a la Ciudad de Buenos Aires como un solo bloque: se pinta en todas sus comunas.
      for (const com of ign['Ciudad de Buenos Aires'] ?? []) (depts['Ciudad de Buenos Aires'] ??= {})[com] = (depts['Ciudad de Buenos Aires'][com] ?? 0) + c.count;
      continue;
    }
    if (!hit) {
      unmatched.add(`${g.parent} / ${g.name}`);
      continue;
    }
    const [p, dn] = hit;
    (depts[p] ??= {})[dn] = (depts[p][dn] ?? 0) + c.count;
  }
  out.species[sp.id] = { taxonKey: m.usageKey, name: m.scientificName, total: d.count, depts };
  console.log(`${sp.id}: ${d.count} registros, ${Object.values(depts).reduce((n, x) => n + Object.keys(x).length, 0)} departamentos`);
  writeFileSync(gadmFile, JSON.stringify(gadm));
}
writeFileSync(join(dir, 'presencia.json'), JSON.stringify(out));
if (unmatched.size) console.warn(`Departamentos GADM sin equivalente en el IGN (${unmatched.size}): ${[...unmatched].slice(0, 40).join('; ')}`);
