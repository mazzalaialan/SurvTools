/**
 * Arma el paquete de la sección Fauna (`app/public/data/fauna-AR.json`) y copia las fotos a `app/public/fauna/`.
 *
 * Uso: `node tools/fauna-data/build.mjs ~/vikarg-fishing-work/fauna`
 *
 * La carpeta de trabajo (fuera del repo) tiene lo relevado por región (centro, cuyo, litoral, noa, patagonia): zonas.json (con
 * `reglas_app`: temporada, cupos por especie), permisos.json, protegidas.json y fuentes.json, y las fichas de especies
 * (especies-mamiferos.json, especies-aves.json) con sus fotos en listas/<id>.webp. Cada región se escribió con una forma un poco
 * distinta (lista o texto, provincias sueltas o bajo `provincias`): acá se normaliza todo.
 *
 * El estado de cada provincia (norma vigente, vieja, prohibida, sin norma, judicializada) no sale de los archivos: es una
 * decisión de lectura de las fuentes y está en `status.json`, junto a este script.
 *
 * Licencias: normas provinciales sin licencia declarada (se usan con atribución a cada organismo); fotos de Wikimedia Commons con
 * la licencia de cada una en las fichas.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const work = process.argv[2];
if (!work) {
  console.error('Uso: node tools/fauna-data/build.mjs <carpeta de trabajo de fauna>');
  process.exit(1);
}
const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const read = (f) => JSON.parse(readFileSync(f, 'utf8'));
const opt = (f) => (existsSync(f) ? read(f) : null);
const REGIONS = ['centro', 'cuyo', 'litoral', 'noa', 'patagonia'];
const META = new Set(['region', 'fecha_consulta', 'nota', 'provincias', 'fuente']);
const status = read(here('./status.json'));
const alias = opt(join(work, 'alias.json')) ?? {};
const canon = (id) => alias[id] ?? id;

/** Las provincias de un archivo regional: sueltas en la raíz o bajo `provincias`. */
function byProvince(file) {
  const d = opt(file);
  if (!d) return {};
  const src = d.provincias && typeof d.provincias === 'object' ? d.provincias : d;
  return Object.fromEntries(Object.entries(src).filter(([k]) => !META.has(k)));
}

/** «no encontrado», «sin dato» y parecidos no se muestran. */
const clean = (v) => (typeof v === 'string' && /^(no encontrad|sin dato|no hallad)/i.test(v.trim()) ? undefined : v ?? undefined);
const firstUrl = (v) => {
  const u = clean(v);
  if (typeof u !== 'string') return undefined;
  const m = u.match(/https?:\/\/\S+/);
  return m ? m[0].replace(/[),.;]+$/, '') : undefined;
};

function protectedList(v) {
  if (!v) return [];
  if (typeof v === 'string') return [{ name: v }];
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'string' ? { name: x } : { name: x.nombre, rule: x.regla, source: x.fuente }));
  // Forma de Cuyo y Patagonia: { texto, ... }.
  const out = [];
  if (v.texto) out.push({ name: v.texto });
  for (const x of v.lista ?? v.areas ?? []) out.push(typeof x === 'string' ? { name: x } : { name: x.nombre, rule: x.regla, source: x.fuente });
  return out;
}

function sourceList(v) {
  const list = Array.isArray(v) ? v : v ? [v] : [];
  return list
    .filter((x) => x && typeof x === 'object')
    .map((x) => ({
      title: x.documento ?? x.titulo ?? x.nombre,
      org: x.organismo,
      url: firstUrl(x.pagina_oficial) ?? firstUrl(x.url),
      date: x.fecha,
      validUntil: x.vigencia_hasta,
      confidence: x.confianza,
    }))
    .filter((x) => x.title);
}

function permit(v) {
  if (!v || typeof v !== 'object') return undefined;
  const prices = [];
  const p = v.precios_2026;
  if (p && typeof p === 'object')
    for (const [k, val] of Object.entries(p)) if (typeof val === 'number') prices.push({ type: k, price: `$ ${val.toLocaleString('es-AR')}` });
  const list = (x) => (Array.isArray(x) ? x.filter((s) => typeof s === 'string' && clean(s)) : typeof clean(x) === 'string' ? [x] : undefined);
  return {
    buyUrl: firstUrl(v.buyUrl) ?? firstUrl(v.buyUrl_menor),
    infoUrl: firstUrl(v.infoUrl),
    phone: list(v.phone),
    email: list(v.email),
    where: clean(v.where),
    prices: prices.length ? prices : undefined,
    priceDate: p?.fecha,
    requirements: list(v.requisitos),
  };
}

function zone(z) {
  const r = z.reglas_app ?? {};
  const t = r.temporada ?? {};
  return {
    id: z.id,
    name: z.nombre,
    limits: clean(z.limites),
    text: z.descripcion_literal ?? z.descripcion,
    methods: clean(z.metodos_armas ?? z.metodos),
    reserves: clean(z.cotos),
    closed: r.cerrado ?? null,
    season: t.from || t.to || t.note ? { from: t.from ?? undefined, to: t.to ?? undefined, note: clean(t.note) } : undefined,
    species: Object.entries(r.especies ?? {}).map(([id, s]) => ({
      id: canon(id),
      bag: s.cupo ?? undefined,
      sex: s.sexo ?? undefined,
      note: s.note ?? undefined,
      from: s.from ?? undefined,
      to: s.to ?? undefined,
      group: s.cupo_grupo ?? undefined,
      groupTotal: s.cupo_grupo_total ?? undefined,
      perVehicle: s.cupo_vehiculo ?? undefined,
    })),
  };
}

const provinces = [];
for (const region of REGIONS) {
  const zonas = byProvince(join(work, region, 'zonas.json'));
  const permisos = byProvince(join(work, region, 'permisos.json'));
  const protegidas = byProvince(join(work, region, 'protegidas.json'));
  const fuentes = byProvince(join(work, region, 'fuentes.json'));
  for (const [name, zs] of Object.entries(zonas)) {
    const st = status[name];
    if (!st) throw new Error(`Falta el estado de ${name} en status.json`);
    // Si la norma da una especie como cazable y también como protegida, manda la protección: sale de las zonas y se avisa.
    const { protectedSpecies = {}, urbanDepartments: _u, ...info } = st;
    const zonesOut = (Array.isArray(zs) ? zs : []).map(zone).map((z) => ({ ...z, species: z.species.filter((s) => !protectedSpecies[s.id]) }));
    provinces.push({
      name,
      region,
      ...info,
      zones: zonesOut,
      permit: permit(permisos[name]),
      protectedSpecies: Object.keys(protectedSpecies).length ? Object.entries(protectedSpecies).map(([id, note]) => ({ id: canon(id), note })) : undefined,
      protected: protectedList(protegidas[name]),
      sources: sourceList(fuentes[name]),
    });
  }
}
// Jurisdicciones sin norma de caza relevada (CABA): solo su estado, aviso y fuentes.
for (const [name, st] of Object.entries(status)) {
  if (name.startsWith('_') || !st.noZones || provinces.some((p) => p.name === name)) continue;
  const { noZones: _n, sources = [], urbanDepartments: _u, ...info } = st;
  provinces.push({ name, region: 'centro', ...info, zones: [], protected: [], sources });
}
const missing = Object.keys(status).filter((k) => !k.startsWith('_') && !provinces.some((p) => p.name === k));
if (missing.length) throw new Error(`Provincias de status.json sin datos: ${missing.join(', ')}`);

// Fichas: una por especie (los alias apuntan a la ficha canónica).
const imgOut = here('../../app/public/fauna/');
mkdirSync(imgOut, { recursive: true });
const species = [];
/** «No consta como Monumento Natural…» no es un monumento: solo se guarda cuando la ficha nombra uno. */
const monument = (m) => (typeof m === 'string' && m.trim() && !/^(no |sin |ninguno)/i.test(m.trim()) ? m : undefined);
const credits = { ...(opt(join(work, 'imagenes.json')) ?? {}), ...(opt(join(work, 'imagenes-aves.json')) ?? {}), ...(opt(join(work, 'imagenes-protegidas.json')) ?? {}), ...(opt(join(work, 'imagenes-reptiles.json')) ?? {}) };
// Las protegidas (amenazadas y monumentos naturales que no se cazan) traen su grupo en cada ficha (`grupo`).
for (const [file, group] of [['especies-mamiferos.json', 'mammal'], ['especies-aves.json', 'bird'], ['especies-protegidas.json', null], ['especies-reptiles.json', 'reptile']]) {
  const d = opt(join(work, file));
  if (!d) continue;
  const list = Array.isArray(d.especies) ? d.especies : Object.values(d).filter((x) => x && typeof x === 'object' && x.id);
  for (const sp of list) {
    if (alias[sp.id]) continue;
    const img = join(work, 'listas', `${sp.id}.webp`);
    let image;
    if (existsSync(img)) {
      copyFileSync(img, join(imgOut, `${sp.id}.webp`));
      image = `${sp.id}.webp`;
    }
    // Crédito de la foto (autor, licencia y página en Wikimedia Commons): se muestra debajo de la imagen.
    const c = credits[sp.id] ?? sp.imagen;
    const { imagen: _, grupo, monumento_natural, por_que, caza, venenosa, mordedura, ...rest } = sp;
    species.push({
      ...rest,
      group: group ?? grupo ?? 'mammal',
      image,
      imageCredit: c ? { author: c.credit, license: c.license, url: c.url } : undefined,
      // Ficha de una especie que no se caza en ningún lado (no figura en ninguna norma de caza).
      ...(group === null && { protectedOnly: true, naturalMonument: monument(monumento_natural), whyListed: por_que || undefined }),
      // Reptiles: caza prohibida (por defecto), regulada (solo programas o cupos habilitados) o sin regla específica; y si es venenosa.
      ...(file === 'especies-reptiles.json' && {
        protectedOnly: caza !== 'regulada' && caza !== 'sin-regla',
        regulated: caza === 'regulada' || undefined,
        naturalMonument: monument(monumento_natural),
        whyListed: por_que || undefined,
        venomous: venenosa || undefined,
        bite: mordedura || undefined,
      }),
    });
  }
}
// Especie amenazada en la categorización nacional (Amenazada, Vulnerable, En peligro): no se caza en ninguna provincia, aunque una
// norma le dé cupo. Sale de las zonas y la provincia que la nombraba la muestra en «Dónde no se caza».
const THREAT = /^(amenazada|vulnerable|en peligro)/i;
for (const sp of species) {
  const ec = sp.estado_conservacion ?? {};
  const nat = String(ec.nacional_argentina ?? ec.argentina ?? '').trim();
  if (THREAT.test(nat)) sp.threatened = nat.replace(/\s*\(.*$/, '');
}
const threatened = new Map(species.filter((s) => s.threatened).map((s) => [s.id, s.threatened]));
for (const p of provinces)
  for (const z of p.zones) {
    for (const s of z.species)
      if (threatened.has(s.id) && !p.protectedSpecies?.some((x) => x.id === s.id))
        (p.protectedSpecies ??= []).push({ id: s.id, note: `La norma le da cupo, pero hoy es especie ${threatened.get(s.id)} en la categorización nacional: no se caza.` });
    z.species = z.species.filter((s) => !threatened.has(s.id));
  }
const known = new Set(species.map((s) => s.id));
const unknown = new Set(provinces.flatMap((p) => p.zones.flatMap((z) => z.species.map((s) => s.id))).filter((id) => !known.has(id)));
if (unknown.size) console.warn(`Especies de las zonas sin ficha: ${[...unknown].join(', ')}`);

// Departamentos (IGN, simplificados por departments.mjs) y qué departamentos toca cada zona (departamentos-zonas.json, del relevamiento).
const depts = opt(join(work, 'ign', 'departamentos-simple.json'));
const deptZones = opt(join(work, 'departamentos-zonas.json')) ?? {};
/** Fuera del mapa de la provincia: la Antártida y las islas del Atlántico Sur estiran el de Tierra del Fuego hasta hacerlo ilegible. */
const SKIP_DEPT = /antártida|atlántico sur/i;
if (depts)
  for (const p of provinces) {
    const list = (depts.provinces[p.name] ?? []).filter((d) => !SKIP_DEPT.test(d.name));
    if (!list.length) continue;
    p.departments = list.map((d) => ({ name: d.name, rings: d.rings }));
    const names = new Set(list.map((d) => d.name));
    for (const z of p.zones) {
      const dz = deptZones[z.id];
      if (!dz) continue;
      const ok = (n) => {
        if (!names.has(n)) console.warn(`${z.id}: departamento desconocido «${n}»`);
        return names.has(n);
      };
      z.departments = {
        total: (dz.total ?? []).filter(ok),
        partial: Object.fromEntries(Object.entries(dz.parcial ?? {}).filter(([n]) => ok(n))),
        closed: (dz.veda ?? []).filter(ok),
        rest: dz.resto ?? null,
        note: dz.nota || undefined,
        // Ubicado a mano por rutas, sin mapa oficial: la app lo avisa como aproximado.
        approx: dz.aproximado || undefined,
      };
      // Departamentos urbanos (status.json): en la práctica no se caza, aunque la zona los habilite.
      const urban = status[p.name]?.urbanDepartments;
      if (urban) {
        const set = new Set(urban.list);
        z.departments.total = z.departments.total.filter((n) => !set.has(n));
        for (const n of set) delete z.departments.partial[n];
        z.departments.urban = Object.fromEntries(urban.list.filter((n) => names.has(n)).map((n) => [n, urban.note]));
      }
    }
  }

const out = {
  version: 1,
  // Con hora: la app compara esta marca para saber si la copia guardada es vieja (con solo la fecha, dos versiones del mismo día no se actualizaban).
  generatedAt: new Date().toISOString().slice(0, 19) + 'Z',
  provinces,
  species,
};
const dest = here('../../app/public/data/fauna-AR.json');
writeFileSync(dest, JSON.stringify(out));
console.log(`${provinces.length} provincias, ${provinces.reduce((n, p) => n + p.zones.length, 0)} zonas, ${species.length} fichas → ${dest} (${Math.round(JSON.stringify(out).length / 1024)} KB)`);
