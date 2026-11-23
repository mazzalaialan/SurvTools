// Arma app/public/data/fish-AR.json (ver docs/PESCA.md y app/src/modules/fishing/fishing.ts) con:
//  - los tramos del reglamento (ambientes.json, transcripción del Reglamento de Pesca Deportiva Continental Patagónico 2026/27),
//  - su ubicación (salida de locate.mjs, una por jurisdicción),
//  - las carnadas orientativas (carnadas.json, tabla propia de VikArg) y las reglas generales (reglas_generales.json).
// Lee del texto literal de cada tramo la modalidad, la temporada, el cupo (LD) y la devolución obligatoria. Lo que no se puede leer
// seguro queda en el texto del tramo, que la app muestra siempre.
//
// Uso: node tools/fishing-data/build.mjs <carpeta de trabajo> <jurisdicción>[,<jurisdicción>…] [salida]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const [work, jurs, outArg] = process.argv.slice(2);
if (!jurs) {
  console.error('Uso: node build.mjs <carpeta de trabajo> <jurisdicción>[,…] [salida]');
  process.exit(1);
}
const OUT = outArg ?? fileURLToPath(new URL('../../app/public/data/fish-AR.json', import.meta.url));
const read = (f) => JSON.parse(readFileSync(`${work}/${f}`, 'utf8'));
const ambientes = read('ambientes.json');
const carnadas = read('carnadas.json');
const reglas = read('reglas_generales.json');
const cuts = JSON.parse(readFileSync(fileURLToPath(new URL('./cuts.json', import.meta.url)), 'utf8'));
const permits = JSON.parse(readFileSync(fileURLToPath(new URL('./permits.json', import.meta.url)), 'utf8'));
const images = JSON.parse(readFileSync(fileURLToPath(new URL('./images.json', import.meta.url)), 'utf8'));

const SOURCE = {
  id: 'pdcp-2026-27',
  name: 'Reglamento de Pesca Deportiva Continental Patagónico 2026/2027 (Comisión Consultiva: Neuquén, Río Negro, Chubut y Parques Nacionales)',
  url: 'https://chubutstorage.s3.amazonaws.com/Pesca/Reglamento%20PDCP%202026-27%20Baja.pdf',
  license: 'Normativa pública sin licencia declarada: se usa con atribución',
  date: '2026-10-20',
};
const SOURCES = [
  SOURCE,
  { id: 'osm', name: 'Ríos y lagos: © colaboradores de OpenStreetMap', url: 'https://www.openstreetmap.org/copyright', license: 'ODbL 1.0', date: new Date().toISOString().slice(0, 10) },
  { id: 'fishbase', name: 'Dieta de las especies: FishBase (Froese y Pauly)', url: 'https://www.fishbase.se', license: 'CC BY-NC 4.0', date: '2026-11-23' },
];

// --- Especies que se pescan (las de devolución obligatoria en todo el reglamento, como puyenes y lampreas, no son de pesca deportiva) ---
const SPORT = ['trucha-arcoiris', 'trucha-marron', 'trucha-arroyo', 'trucha-lago', 'salmon-atlantico', 'salmon-pacifico', 'perca', 'pejerrey', 'carpa', 'robalo'];
const NAMES = {
  pejerrey: { es: 'Pejerrey', en: 'Silverside (pejerrey)', pt: 'Peixe-rei' },
  robalo: { es: 'Róbalo', en: 'Patagonian blennie (róbalo)', pt: 'Robalo-patagônico' },
};
const SCIENTIFIC = { robalo: 'Eleginops maclovinus' };
const bait = (b) => [b.tipo, b.detalle].filter(Boolean).join(': ');
function speciesFromCarnadas() {
  const list = carnadas.especies;
  const find = (id) => list.find((s) => s.id === id);
  return SPORT.map((id) => {
    // El pejerrey del reglamento («pejerreyes») puede ser el patagónico o el bonaerense según el embalse: una sola especie para la app.
    const ALIAS = { 'trucha-arroyo': 'trucha-de-arroyo', 'trucha-lago': 'trucha-de-lago', 'salmon-atlantico': 'salmon-encerrado', 'salmon-pacifico': 'salmon-chinook', pejerrey: 'pejerrey-patagonico' };
    const src = find(ALIAS[id] ?? id) ?? find(id);
    if (!src) return { id, scientific: SCIENTIFIC[id] ?? '', native: id === 'robalo', name: NAMES[id] ?? { es: id } };
    const fly = src.moscas ? [...(src.moscas.streamers ?? []), ...(src.moscas.ninfas ?? []), ...(src.moscas.secas ?? [])] : [];
    const conf = String(src.confianza ?? src.confianza_general ?? '').toLowerCase();
    return {
      id,
      scientific: id === 'pejerrey' ? 'Odontesthes hatcheri / O. bonariensis' : src.cientifico,
      native: /nativ/i.test(src.origen ?? ''),
      name: NAMES[id] ?? src.nombre,
      ...(src.tamano_tipico_region && { size: src.tamano_tipico_region }),
      ...(src.dieta && { diet: src.dieta }),
      ...(src.mejor_epoca && { bestSeason: typeof src.mejor_epoca === 'string' ? src.mejor_epoca : JSON.stringify(src.mejor_epoca) }),
      ...(src.mejor_horario && { bestTime: typeof src.mejor_horario === 'string' ? src.mejor_horario : JSON.stringify(src.mejor_horario) }),
      baits: {
        natural: (src.carnada_natural?.recomendadas ?? []).map((x) => (typeof x === 'string' ? x : bait(x))),
        lures: (src.senuelos_spinning ?? []).map((x) => (typeof x === 'string' ? x : bait(x))),
        fly,
        confidence: conf.startsWith('alta') ? 'high' : conf.startsWith('media') ? 'medium' : 'low',
      },
    };
  });
}

// --- Lectura del texto del tramo ---
const lower = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Nombres del reglamento → especies de la app. «truchas» y «salmónidos» sin más: arco iris y marrón (las que hay en casi todos lados). */
function speciesOf(phrase) {
  const p = lower(phrase);
  if (/arco ?iris/.test(p)) return ['trucha-arcoiris'];
  if (/marron/.test(p)) return ['trucha-marron'];
  if (/arroyo|fontinalis/.test(p)) return ['trucha-arroyo'];
  if (/de lago|namaycush|bocona/.test(p)) return ['trucha-lago'];
  if (/encerrado|salmo salar|atlantico/.test(p)) return ['salmon-atlantico'];
  if (/chinook|pacifico/.test(p)) return ['salmon-pacifico'];
  if (/salmonido|trucha/.test(p)) return ['trucha-arcoiris', 'trucha-marron'];
  if (/perca/.test(p)) return ['perca'];
  if (/pejerrey/.test(p)) return ['pejerrey'];
  if (/carpa/.test(p)) return ['carpa'];
  if (/robalo/.test(p)) return ['robalo'];
  return [];
}
const MODALITY = { S: 'spinning', M: 'fly', T: 'trolling', SBM: 'spinning' };
const iso = (d) => {
  const [dd, mm, yy] = d.split('/');
  return `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
};

function parseSector(a) {
  const text = a.descripcion_tramo_literal;
  const t = lower(text);
  const species = new Map();
  const set = (id, patch) => species.set(id, { id, ...species.get(id), ...patch });
  // Cupo diario: «LD: 1 trucha arco iris, 2 percas y 10 pejerreyes y carpas sin límite».
  for (const m of text.matchAll(/LD:?\s*([^.]*)/g)) {
    const ld = m[1].split(/-\s*devoluci|,?\s*devoluci/i)[0];
    for (const item of ld.matchAll(/(\d+)\s+([a-záéíóúñ ]+?)(?=,|\sy\s\d|\sy\s[a-z]+\s+sin|$|\s+excepto)/gi)) for (const id of speciesOf(item[2])) set(id, { limit: Number(item[1]) });
    if (/carpas? sin l[ií]mite/i.test(ld)) set('carpa', { limit: null });
  }
  // Devolución obligatoria: cupo 0.
  // «Devolución obligatoria.» a secas (sin «de …») o «de todos los peces»: todo se devuelve.
  let allRelease = /devoluci[oó]n obligatoria(?! de)(?! a partir)/i.test(text.replace(/devoluci[oó]n obligatoria de (todas las especies|todos los peces)/gi, 'devolución obligatoria')) || /captura y devoluci[oó]n/i.test(text);
  for (const m of text.matchAll(/devoluci[oó]n obligatoria de ([^.;:]*)/gi)) {
    const what = m[1];
    if (/todas las especies|todos los peces/i.test(what)) continue;
    // «A partir del 02/05/2027: devolución…»: es por fecha, queda en el texto.
    const before = text.slice(Math.max(0, m.index - 40), m.index);
    if (/a partir del|desde el \d/i.test(before)) continue;
    for (const part of what.split(/,|\sy\s/)) for (const id of speciesOf(/salm[oó]nidos/i.test(what) && !/encerrado/i.test(part) ? 'salmonidos' : part)) set(id, { limit: 0 });
  }
  if (allRelease) for (const id of species.keys()) set(id, { limit: 0 });
  // Si no nombra ninguna especie pero se pesca, al menos las truchas (en la Patagonia están en casi todos los ambientes con salmónidos).
  const closed = (/pesca no autorizada|veda total|prohibida la pesca\s*(en todo|todo el a)/i.test(text) || /^\W*(neuqu[eé]n\W*)?prohibida la pesca\.?\s*$/i.test(text.replace(/^-\s*/, ''))) && !/LD/.test(text);
  // Sin especies nombradas (p. ej. «Devolución obligatoria.»): se toman las truchas, que están en casi todos los ríos y lagos patagónicos.
  const inferred = !species.size && !closed;
  if (inferred) for (const id of ['trucha-arcoiris', 'trucha-marron']) set(id, allRelease ? { limit: 0 } : {});
  const mods = new Set();
  for (const m of text.matchAll(/\((S|M|T|SBM)\)/g)) mods.add(MODALITY[m[1]]);
  if (/mosca solamente|exclusivo equipo de mosca|solo mosca/i.test(text)) mods.add('fly');
  if (/trolling/i.test(t) && !/prohibid[oa] (el )?trolling/i.test(t)) mods.add('trolling');
  const open = text.match(/Apertura:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
  const close = text.match(/Cierre:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
  const season = closed ? undefined : open && close ? { from: iso(open[1]), to: iso(close[1]) } : undefined;
  return { species: [...species.values()], modality: [...mods], season, closed, inferred, catchAndRelease: allRelease || undefined };
}

// --- Principal ---
const species = speciesFromCarnadas();
const regions = [];
const sectors = [];
const missing = [];
for (const jur of jurs.split(',')) {
  const geoFile = `${work}/geo-${jur.replace(/\s+/g, '-')}.json`;
  const geo = existsSync(geoFile) ? JSON.parse(readFileSync(geoFile, 'utf8')) : {};
  const regionId = lower(jur).replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
  regions.push({
    id: regionId,
    name: jur,
    rules: reglas.reglas.filter((r) => r.jurisdiccion === jur || r.jurisdiccion?.startsWith('Todas')).map((r) => `${r.texto_literal} (${r.articulo_o_punto ?? ''}, pág. ${r.pagina_impresa ?? '?'})`),
    season: { from: '2026-11-01', to: '2027-05-01' },
    ...(permits[jur] && { permit: permits[jur] }),
    source: SOURCE.id,
  });
  for (const a of ambientes.filter((x) => x.jurisdiccion === jur)) {
    if (cuts[a.id]?.skip) continue;
    const g = geo[a.id] ?? (cuts[a.id]?.lakeZone ? geo[a.id.replace(/-zona-[ivx]+$/, '')] : undefined);
    if (!g) {
      missing.push(a.id);
      continue;
    }
    const p = parseSector(a);
    const general = ambientes.find((x) => x.id === a.id.replace(/-zona-[ivx]+$/, '') && x.id !== a.id);
    const kind = a.tipo_agua.replace(/s$/, '');
    sectors.push({
      id: a.id,
      region: regionId,
      water: `${kind} ${a.agua}`,
      name: a.subtramo && a.subtramo !== '(general)' ? a.descripcion_tramo_literal.split(/Modalidad|Apertura|LD:/)[0].trim().replace(/[:,.]$/, '') : `Todo el ${kind === 'Laguna' ? 'cuerpo de agua' : kind.toLowerCase()}`,
      geometry: g.geometry,
      ...(p.season && { season: p.season }),
      ...(p.closed && { closed: true }),
      ...(p.modality.length && { modality: p.modality }),
      ...(p.catchAndRelease && { catchAndRelease: true }),
      ...(p.inferred && { speciesInferred: true }),
      species: p.species,
      notes: [general?.descripcion_tramo_literal, a.descripcion_tramo_literal].filter(Boolean).map((x) => x.replace(/^[\s-]+/, '')).join(' — '),
      ...(cuts[a.id]?.approx && { approx: cuts[a.id].approx }),
      source: SOURCE.id,
      ref: `pág. ${a.fuente?.pagina_impresa ?? '?'}`,
    });
  }
}
// Solo los peces que tienen algún tramo (los de otras jurisdicciones se suman cuando se agregan).
const used = species.filter((sp) => sectors.some((s) => s.species.some((x) => x.id === sp.id))).map((sp) => (images[sp.id] ? { ...sp, image: images[sp.id] } : sp));
const data = { version: 1, generatedAt: new Date().toISOString().slice(0, 10), seasonLabel: '2026/2027', sources: SOURCES, species: used, regions, sectors };
writeFileSync(OUT, JSON.stringify(data));
const noSpecies = sectors.filter((s) => s.speciesInferred).map((s) => s.id);
console.log(`${sectors.length} tramos, ${used.length} especies → ${OUT} (${Math.round(readFileSync(OUT).length / 1024)} KB)`);
if (missing.length) console.log(`sin ubicar (${missing.length}): ${missing.join(', ')}`);
if (noSpecies.length) console.log(`especies supuestas (truchas) (${noSpecies.length}): ${noSpecies.join(', ')}`);
