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
// Patagonia (reglamento común) + Santa Cruz y Tierra del Fuego (normas provinciales propias, en sur/).
const ambientes = [
  ...read('ambientes.json'),
  ...(existsSync(`${work}/sur/ambientes.json`) ? read('sur/ambientes.json') : []),
  ...(existsSync(`${work}/cuyo/ambientes.json`) ? read('cuyo/ambientes.json') : []),
];
const reglasSur = existsSync(`${work}/sur/reglas_generales.json`) ? read('sur/reglas_generales.json') : { reglas: [] };
if (existsSync(`${work}/cuyo/reglas_generales.json`)) reglasSur.reglas.push(...read('cuyo/reglas_generales.json').reglas.map((r) => ({ jurisdiccion: 'Mendoza', ...r })));
const carnadas = read('carnadas.json');
const reglas = read('reglas_generales.json');
const cuts = JSON.parse(readFileSync(fileURLToPath(new URL('./cuts.json', import.meta.url)), 'utf8'));
const permits = JSON.parse(readFileSync(fileURLToPath(new URL('./permits.json', import.meta.url)), 'utf8'));
const images = JSON.parse(readFileSync(fileURLToPath(new URL('./images.json', import.meta.url)), 'utf8'));
const survival = JSON.parse(readFileSync(fileURLToPath(new URL('./survival.json', import.meta.url)), 'utf8'));

const SOURCE = {
  id: 'pdcp-2026-27',
  name: 'Reglamento de Pesca Deportiva Continental Patagónico 2026/2027 (Comisión Consultiva: Neuquén, Río Negro, Chubut y Parques Nacionales)',
  url: 'https://chubutstorage.s3.amazonaws.com/Pesca/Reglamento%20PDCP%202026-27%20Baja.pdf',
  license: 'Normativa pública sin licencia declarada: se usa con atribución',
  date: '2026-10-20',
};
/** Normas provinciales propias (no son parte del reglamento patagónico común). */
const OWN = {
  'Santa Cruz': {
    source: {
      id: 'sc-disp-241-2026',
      name: 'Santa Cruz: Disposición N.º 241/2026 de la Secretaría de Estado de Pesca y Acuicultura (Reglamento General de Pesca Deportiva Continental 2026/2027, Anexos I y II)',
      url: 'https://pesca.santacruz.gob.ar/static/docs/reglamento-pesca-2026-2027.pdf',
      license: 'Norma oficial: se usan los datos con atribución (decisión del dueño, 2026-11-24: la leyenda «Todos los derechos reservados» es del portal, no de la disposición)',
      date: '2026-09-22',
    },
    season: { from: '2026-10-01', to: '2027-09-30' },
    validUntil: '2027-09-30',
  },
  'Tierra del Fuego': {
    source: {
      id: 'tdf-res-259-2026',
      name: 'Tierra del Fuego: Resolución S.A. N.º 259/2026 de la Secretaría de Ambiente (reglamento de pesca deportiva 2026/2027)',
      url: 'https://prodyambiente.tierradelfuego.gob.ar/wp-content/uploads/2026/10/Resolucion-N259-Temporada-pesca-2026.pdf',
      license: 'Normativa pública sin licencia declarada: se usa con atribución',
      date: '2026-10-01',
    },
    season: { from: '2026-10-30', to: '2027-05-02' },
    // La resolución de la temporada siguiente sale en septiembre u octubre.
    validUntil: '2027-10-29',
    // Art. del Anexo I: desde el 01/03/2027, devolución obligatoria en toda la provincia.
    releaseFrom: '2027-03-01',
    // Art. 3: «no podrá sacrificar más de un (01) ejemplar por día» (donde el ambiente no dice otra cosa).
    defaultLimit: 1,
    // Anexo IV, 1.a: hasta el 01/01/2027, devolución obligatoria de la trucha arco iris en todos los ambientes provinciales.
    releaseUntil: { 'trucha-arcoiris': '2027-01-01' },
  },
};
OWN.Mendoza = {
  source: {
    id: 'mza-res-322-2026',
    name: 'Mendoza: Resolución N.º 322/2026 de la Subsecretaría de Ambiente (pesca deportiva 2026/2027; Boletín Oficial N.º 32709, 30/10/2026)',
    url: 'https://www.elsol.com.ar/wp-content/uploads/2026/11/Pesca-Resolucion.pdf',
    license: 'Normativa pública sin licencia declarada: se usa con atribución (copia del Boletín Oficial publicada por el diario El Sol)',
    date: '2026-10-30',
  },
  // Art. 2: salmónidos del 01/11/2026 al 01/05/2027 (solo señuelo artificial); pejerrey y perca del 01/12/2026 al 30/09/2027; carpas,
  // dientudos y mojarras todo el año; bagres, cangrejos y anguilas vedados todo el año.
  season: { from: '2026-11-01', to: '2027-05-01' },
  validUntil: '2027-10-31',
  extraSpecies: {
    pejerrey: { closures: [{ from: '10-01', to: '11-30' }], note: 'Temporada del 01/12/2026 al 30/09/2027 (Res. 322/2026, art. 2).' },
    carpa: { limit: null, note: 'Todo el año (Res. 322/2026, art. 2).' },
  },
};
/** Los permisos de temporada del reglamento patagónico 2026/27 valen hasta el 31/10/2027. */
const PDCP_VALID_UNTIL = '2027-10-31';
const SOURCES = [
  SOURCE,
  ...Object.values(OWN).map((o) => o.source),
  { id: 'ign', name: 'Ríos que no están en OpenStreetMap (Tierra del Fuego, Santa Cruz): Instituto Geográfico Nacional, capas de hidrografía (WFS)', url: 'https://www.ign.gob.ar/NuestrasActividades/InformacionGeoespacial/CapasSIG', license: 'Sin licencia declarada: se usa con atribución', date: '2026-11-24' },
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
  if (/arco ?iris|steelhead|mykiss/.test(p)) return ['trucha-arcoiris'];
  if (/marron|salmo trutta/.test(p)) return ['trucha-marron'];
  if (/arroyo|fontinalis/.test(p)) return ['trucha-arroyo'];
  if (/de lago|namaycush|bocona/.test(p)) return ['trucha-lago'];
  if (/encerrado|salmo salar|atlantico/.test(p)) return ['salmon-atlantico'];
  if (/chinook|pacifico|tshawytscha|coho|kisutch/.test(p)) return ['salmon-pacifico'];
  if (/perca|percichthys/.test(p)) return ['perca'];
  if (/salmonido|trucha/.test(p)) return ['trucha-arcoiris', 'trucha-marron'];
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
  // Santa Cruz: «Límite Diario (LD): Dos (2) ejemplares en total por pescador» (sin nombrar especies: es para las truchas en total);
  // «Un (1) ejemplar exclusivo de Salmón Chinook».
  let totalLimit;
  for (const m of text.matchAll(/\(LD\)(?:\s*general)?:?\s*(?:de\s+)?[A-Za-zÁÉÍÓÚáéíóú]+\s*\((\d+)\)\s*([^.;]*)/gi)) {
    const rest = m[2];
    const generic = /^ejemplar/i.test(rest) && !/exclusiv|\bde (trucha|salm|perca|r[oó]balo)/i.test(rest);
    if (generic) totalLimit = Number(m[1]);
    else for (const id of speciesOf(rest.split(/[,;]/)[0])) set(id, { limit: Number(m[1]) });
  }
  // «Un (1) ejemplar de Perca (Percichthys trucha) y Un (1) ejemplar de Trucha Marrón (Salmo trutta)».
  for (const m of text.matchAll(/\((\d+)\)\s*ejemplar(?:es)? de ([A-ZÁÉÍÓÚ][a-záéíóúñ]+(?: [A-ZÁÉÍÓÚ]?[a-záéíóúñ]+)?)/g)) for (const id of speciesOf(m[2])) set(id, { limit: Number(m[1]) });
  // Cupo diario: «LD: 1 trucha arco iris, 2 percas y 10 pejerreyes y carpas sin límite».
  for (const m of text.matchAll(/LD:?\s*([^.]*)/g)) {
    const ld = m[1].split(/-\s*devoluci|,?\s*devoluci/i)[0];
    for (const item of ld.matchAll(/(\d+)\s+([a-záéíóúñ ]+?)(?=,|\sy\s\d|\sy\s[a-z]+\s+sin|$|\s+excepto)/gi)) {
      const ids = speciesOf(item[2]);
      // «1 trucha» o «2 salmónidos»: un cupo en total para todas, no uno por especie.
      const group = ids.length > 1;
      for (const id of ids) set(id, { limit: Number(item[1]), ...(group && { groupLimit: true }) });
    }
    if (/carpas? sin l[ií]mite/i.test(ld)) set('carpa', { limit: null });
    // «LD: sin límites de captura para la trucha de lago (bocón) y salmón Chinook, otros salmónidos 2 ejemplares» (Parques Nacionales).
    const free = ld.match(/sin l[ií]mites? de (?:captura|extracci[oó]n) para ([^,]*)/i);
    if (free) for (const part of free[1].split(/\sy\s/)) for (const id of speciesOf(part)) set(id, { limit: null });
    // «la pesca de salmónidos exóticos (salmón y trucha) será sin límites de extracción y sin devolución» (PN Tierra del Fuego).
    const freeAll = ld.match(/pesca de ([^.]*?)\s+ser[aá] sin l[ií]mites?/i);
    if (freeAll) for (const id of /salm[oó]nid/i.test(freeAll[1]) ? ['trucha-arcoiris', 'trucha-marron', 'trucha-arroyo'] : speciesOf(freeAll[1])) set(id, { limit: null });
    for (const item of ld.matchAll(/(?:otros\s+)?([a-záéíóúñ ]+?)\s+(\d+)\s+ejemplares?/gi)) {
      const ids = speciesOf(item[1]);
      const others = /otros/i.test(item[0]);
      for (const id of /salm[oó]nid/i.test(item[1]) ? ['trucha-arcoiris', 'trucha-marron', 'trucha-arroyo'] : ids) if (!(others && species.has(id))) set(id, { limit: Number(item[2]), ...(/salm[oó]nid|truchas?\b/i.test(item[1]) && { groupLimit: true }) });
    }
  }
  // Cualquier oración con «sin límite»: «Carpas sin límite.», «salmónidos sin límite de captura», «sin límites de percas y salmónidos».
  for (const sentence of text.split(/\.\s+/)) {
    if (!/sin l[ií]mites?/i.test(sentence) || /\d+\s+(?:trucha|perca|pejerrey|salm)/i.test(sentence.replace(/.*sin l[ií]mites?/i, ''))) continue;
    for (const part of sentence.split(/,|\sy\s|\(|\)|:/)) {
      if (!/sin l[ií]mite|salm|trucha|perca|pejerrey|carpa|r[oó]balo|chinook/i.test(part)) continue;
      const ids = /salm[oó]nid/i.test(part) ? ['trucha-arcoiris', 'trucha-marron', 'trucha-arroyo'] : speciesOf(part);
      for (const id of ids) if (!species.get(id)?.limit) set(id, { limit: null });
    }
  }
  // Devolución obligatoria: cupo 0.
  // «Devolución obligatoria.» a secas (sin «de …») o «de todos los peces»: todo se devuelve.
  let allRelease = /devoluci[oó]n obligatoria(?! de)(?! a partir)(?! para)(?! y sin excepciones para)/i.test(text.replace(/devoluci[oó]n obligatoria de (todas las especies|todos los peces)/gi, 'devolución obligatoria')) || /captura y devoluci[oó]n(?! obligatoria (?:para|de) (?:la |el )?(?:trucha|salm))/i.test(text.replace(/a partir del[^.]*\./gi, ''));
  for (const m of text.matchAll(/devoluci[oó]n obligatoria de ([^.;:]*)/gi)) {
    const what = m[1];
    if (/todas las especies|todos los peces/i.test(what)) continue;
    // «A partir del 02/05/2027: devolución…»: es por fecha, queda en el texto.
    const before = text.slice(Math.max(0, m.index - 40), m.index);
    if (/a partir del|desde el \d/i.test(before)) continue;
    for (const part of what.split(/,|\sy\s/)) for (const id of speciesOf(/salm[oó]nidos/i.test(what) && !/encerrado/i.test(part) ? 'salmonidos' : part)) set(id, { limit: 0 });
  }
  if (allRelease) for (const id of species.keys()) set(id, { limit: 0 });
  // «A partir del 02/05/2027: devolución obligatoria de todos los salmónidos» / «Desde el 01/04/2027 devolución obligatoria»:
  // hasta esa fecha rige el cupo; desde ahí, solo devolución.
  for (const m of text.matchAll(/(?:a partir del?|desde el)\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*:?\s*((?:(?!\.\s)[^.])*?)devoluci[oó]n obligatoria(?:\s+(?:de|para)\s+(?:la |el )?([^.,;]+))?/gi)) {
    if (/\bal\s+\d{1,2}\/\d{1,2}/i.test(m[4])) continue; // «desde el … al …»: es un período, queda en el texto
    const yy = m[3].length === 2 ? `20${m[3]}` : m[3];
    const from = `${yy}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    const named = m[5] && !/todas|todos/i.test(m[5]) ? [...new Set(m[5].split(/,|\sy\s/).flatMap((x) => speciesOf(x)))] : [];
    const targets = m[5] && /salm[oó]nid/i.test(m[5]) ? ['trucha-arcoiris', 'trucha-marron', 'trucha-arroyo', 'trucha-lago', 'salmon-atlantico', 'salmon-pacifico'] : named.length ? named : [...species.keys()];
    for (const id of targets) if (species.has(id)) set(id, { releaseFrom: from });
  }
  // Si no nombra ninguna especie pero se pesca, al menos las truchas (en la Patagonia están en casi todos los ambientes con salmónidos).
  const closed = (/pesca no autorizada|no se permite la pesca|veda total|veda permanente|prohibida la pesca\s*(en todo|todo el a|deportiva)|se proh[ií]be la pesca durante todo el a|queda prohibida la pesca|se encuentra prohibida la pesca/i.test(text) || /^\W*(neuqu[eé]n\W*)?prohibida la pesca\.?\s*$/i.test(text.replace(/^-\s*/, ''))) && !/LD/.test(text);
  // Sin especies nombradas (p. ej. «Devolución obligatoria.»): se toman las truchas, que están en casi todos los ríos y lagos patagónicos.
  const inferred = !species.size && !closed;
  if (inferred) for (const id of ['trucha-arcoiris', 'trucha-marron']) set(id, allRelease ? { limit: 0 } : {});
  if (totalLimit !== undefined && !allRelease)
    for (const e of species.values()) if (e.limit === undefined && /trucha|salmon/.test(e.id)) set(e.id, { limit: totalLimit, groupLimit: true });
  const mods = new Set();
  for (const m of text.matchAll(/\((S|M|T|SBM)\)/g)) mods.add(MODALITY[m[1]]);
  if (/mosca solamente|exclusivo equipo de mosca|solo mosca/i.test(text)) mods.add('fly');
  if (/trolling/i.test(t) && !/prohibid[oa] (el )?trolling/i.test(t)) mods.add('trolling');
  // «Apertura: 01/11/2026 - Cierre: 31/05/2027» o «Permitido pescar desde el 01/11/2026 al 31/05/2027».
  const span = text.match(/desde el (\d{1,2}\/\d{1,2}\/\d{4}) (?:al|hasta el) (\d{1,2}\/\d{1,2}\/\d{4})/i);
  const open = text.match(/Apertura:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i) ?? (span && [span[0], span[1]]);
  const close = text.match(/Cierre(?: de la temporada)?:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i) ?? (span && [span[0], span[2]]);
  const oct = text.match(/durante (?:el mes de )?octubre del?\s*(\d{4})/i);
  // Tierra del Fuego: «Se habilita la pesca deportiva el día treinta (30) de octubre de 2026 y la finalización de la temporada para el día dieciocho (18) de abril de 2027».
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const words = [...text.matchAll(/d[ií]a [a-z]+ \((\d+)\) de ([a-z]+) de (\d{4})/gi)].map((m) => `${m[3]}-${String(MONTHS.indexOf(m[2].toLowerCase()) + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`);
  const jan = text.match(/a partir del d[ií]a uno \(1\) de enero de (\d{4})/i);
  const allYear = /(habilitad[oa]s? durante todo el a[ñn]o|abierto todo el a[ñn]o|durante todo el a[ñn]o)/i.test(text) && !open;
  const season = closed ? undefined : allYear ? { allYear: true } : jan ? { from: `${jan[1]}-01-01`, to: '2027-05-02' } : words.length === 2 && /habilita la pesca/i.test(text) ? { from: words[0], to: words[1] } : open && close ? { from: iso(open[1]), to: iso(close[1]), ...(oct && { also: [{ from: `${oct[1]}-10-01`, to: `${oct[1]}-10-31` }] }) } : undefined;
  return { species: [...species.values()], modality: [...mods], season, closed, inferred, catchAndRelease: allRelease || undefined };
}

// --- Principal ---
const species = speciesFromCarnadas();
const regions = [];
const sectors = [];
const missing = [];
for (const jur of jurs.split(',').filter((j) => j !== 'Litoral')) {
  const geoFile = `${work}/geo-${jur.replace(/\s+/g, '-')}.json`;
  const geo = existsSync(geoFile) ? JSON.parse(readFileSync(geoFile, 'utf8')) : {};
  const regionId = lower(jur).replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
  regions.push({
    id: regionId,
    name: jur,
    rules: (OWN[jur] ? reglasSur.reglas.filter((r) => r.jurisdiccion === jur) : reglas.reglas.filter((r) => r.jurisdiccion === jur || r.jurisdiccion?.startsWith('Todas'))).map(
      (r) => `${r.texto_literal} (${[r.articulo_o_punto, r.pagina_impresa || r.pagina ? `pág. ${r.pagina_impresa ?? r.pagina}` : ''].filter(Boolean).join(', ')})`,
    ),
    season: OWN[jur]?.season ?? { from: '2026-11-01', to: '2027-05-01' },
    ...(permits[jur] && { permit: permits[jur] }),
    source: OWN[jur]?.source.id ?? SOURCE.id,
    // Hasta cuándo vale la norma cargada (después, si no se actualizó, la app dice «Sin regla específica encontrada»).
    validUntil: OWN[jur]?.validUntil ?? PDCP_VALID_UNTIL,
  });
  // Subtramos que son una regla puntual del mismo río (veda junto a un puente, ventana de extracción, régimen de una especie):
  // van como nota del tramo general («fold» en cuts.json), no como otro dibujo encima del mismo río.
  const folded = new Map();
  for (const a of ambientes.filter((x) => x.jurisdiccion === jur && cuts[x.id]?.fold)) {
    const into = cuts[a.id].fold;
    folded.set(into, [...(folded.get(into) ?? []), a]);
  }
  for (const a of ambientes.filter((x) => x.jurisdiccion === jur)) {
    if (cuts[a.id]?.skip || cuts[a.id]?.fold) continue;
    const g = geo[a.id] ?? (cuts[a.id]?.lakeZone ? geo[a.id.replace(/-zona-[ivx]+$/, '')] : undefined);
    if (!g) {
      missing.push(a.id);
      continue;
    }
    const p = parseSector(a);
    for (const f of folded.get(a.id) ?? []) {
      const q = parseSector(f);
      for (const e of q.species) if (!p.species.some((x) => x.id === e.id) && !q.inferred) p.species.push(e);
    }
    // «replaceSpecies»: las especies salen solo de cuts.json (Mendoza: el texto junta las reglas generales y el lector se confunde).
    if (cuts[a.id]?.replaceSpecies) (p.species = []), (p.inferred = false), (p.catchAndRelease = cuts[a.id].release === true || undefined);
    if (cuts[a.id]?.closedForce) p.closed = true;
    if (cuts[a.id]?.season) p.season = cuts[a.id].season;
    // Reglas por especie que el texto da con redacción libre (cuts.json → «species»: se revisan a mano contra la norma).
    for (const [id, patch] of Object.entries(cuts[a.id]?.species ?? {})) {
      const e = p.species.find((x) => x.id === id);
      if (e) Object.assign(e, patch);
      else p.species.push({ id, ...patch });
    }
    if (cuts[a.id]?.release === false) p.catchAndRelease = undefined;
    const own = OWN[jur];
    for (const [id, patch] of Object.entries(own?.extraSpecies ?? {})) if (!p.closed && !p.species.some((e) => e.id === id) && new RegExp(id, 'i').test(a.descripcion_tramo_literal)) p.species.push({ id, ...patch });
    for (const e of p.species) {
      if (!own || e.limit === 0 || p.catchAndRelease) continue;
      if (own.defaultLimit !== undefined && e.limit === undefined) Object.assign(e, { limit: own.defaultLimit, groupLimit: true });
      if (own.releaseFrom) e.releaseFrom ??= own.releaseFrom;
      if (own.releaseUntil?.[e.id]) e.releaseUntil = own.releaseUntil[e.id];
    }
    // Cierre anticipado de la trucha de arroyo en ríos y arroyos: desde el 01/03/2027, devolución obligatoria (Reglamento 2026/27, pág. 13, 2.b).
    if (/r[ií]o|arroyo/i.test(a.tipo_agua)) for (const e of p.species) if (e.id === 'trucha-arroyo' && e.limit !== 0) e.releaseFrom ??= '2027-03-01';
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
      notes: [general?.descripcion_tramo_literal, a.descripcion_tramo_literal, ...(folded.get(a.id) ?? []).map((f) => `${f.subtramo}: ${f.descripcion_tramo_literal}`)]
        .filter(Boolean)
        .map((x) => x.replace(/^[\s-]+/, ''))
        .join(' — '),
      ...((cuts[a.id]?.approx || g.approxPoint) && { approx: cuts[a.id]?.approx ?? 'ubicado por coordenada; el agua no está dibujada en el mapa base' }),
      source: OWN[jur]?.source.id ?? SOURCE.id,
      validUntil: OWN[jur]?.validUntil ?? PDCP_VALID_UNTIL,
      ref: `pág. ${a.fuente?.pagina_impresa ?? a.fuente?.pagina ?? a.fuente?.pagina_pdf ?? '?'}`,
      _shared: !!a.compartido_con,
      _regionName: jur,
    });
  }
}

// --- Litoral (ver README): cada provincia regula por especie; cada río lleva el reglamento de cada jurisdicción que rige en él. ---
const LITORAL_NAMES = {
  dorado: 'Dorado', 'surubi-pintado': 'Surubí pintado', 'surubi-atigrado': 'Surubí atigrado', pacu: 'Pacú', manguruyu: 'Manguruyú', boga: 'Boga',
  sabalo: 'Sábalo', pati: 'Patí', tararira: 'Tararira', 'salmon-rio': 'Salmón de río (pirapitá)', armado: 'Armado común', 'armado-chancho': 'Armado chancho',
  'bagre-amarillo': 'Bagre amarillo', 'bagre-blanco': 'Bagre blanco', 'bagre-negro': 'Bagre negro', moncholo: 'Moncholo', mandube: 'Mandubé',
  corvina: 'Corvina de río', palometa: 'Palometa', raya: 'Raya de río', virreyna: 'Virreyna',
};
const litoralSpecies = new Set();
/** Peces de la cuenca del Plata que se encuentran en los ríos grandes y en las lagunas (para los que ninguna norma nombra). */
const LIT_RIVER_SPECIES = ['dorado', 'surubi-pintado', 'surubi-atigrado', 'pacu', 'boga', 'sabalo', 'pati', 'tararira', 'bagre-amarillo', 'bagre-blanco', 'armado', 'mojarra', 'palometa', 'chafalote', 'raya', 'anguila', 'manduvi', 'salmon-rio', 'manguruyu'];
/** Peces que ninguna norma nombra, con dónde están (presence.json: especies del MAGyP sumadas el 2026-11-24). */
const PRESENCE_FILE = fileURLToPath(new URL('./presence.json', import.meta.url));
const presence = existsSync(PRESENCE_FILE) ? JSON.parse(readFileSync(PRESENCE_FILE, 'utf8')) : {};
const LIT_LAKE_SPECIES = ['tararira', 'pejerrey', 'carpa', 'mojarra', 'bagre-amarillo', 'anguila'];
if (jurs.split(',').includes('Litoral')) {
  const rulesBy = JSON.parse(readFileSync(fileURLToPath(new URL('./litoral-rules.json', import.meta.url)), 'utf8'));
  const waters = JSON.parse(readFileSync(`${work}/litoral/ambientes.json`, 'utf8'));
  const geo = JSON.parse(readFileSync(`${work}/geo-Litoral.json`, 'utf8'));
  const rid = (j) => 'lit-' + lower(j).replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
  const lakeLike = (w) => /lag|lago|embalse/i.test(w.tipo_agua);
  const SRC = (j) => ({ id: rid(j), name: `${rulesBy[j]?.norm ?? j}`, url: permits[j]?.infoUrl ?? permits[j]?.buyUrl ?? '', license: 'Normativa pública sin licencia declarada: se usa con atribución', date: '2026-11-23' });
  for (const j of Object.keys(rulesBy).filter((k) => !k.startsWith('_'))) {
    SOURCES.push(SRC(j));
    regions.push({ id: rid(j), name: j.replace('CARU - Rio Uruguay', 'Río Uruguay (CARU)'), rules: [rulesBy[j].norm, ...(rulesBy[j].rules ?? [])], ...(permits[j] && { permit: permits[j] }), source: rid(j) });
  }
  for (const w of waters) {
    const g = geo[w.id];
    if (!g) {
      missing.push(w.id);
      continue;
    }
    const sets = w.jurisdicciones.filter((j) => rulesBy[j]).map((j) => {
      const r = rulesBy[j];
      const species = Object.entries(r.species ?? {}).map(([id, x]) => {
        litoralSpecies.add(id);
        const closures = (x.closures ?? []).filter((c) => !c.onlyLakes || lakeLike(w)).map(({ from, to }) => ({ from, to }));
        return { id, ...(x.limit !== undefined && { limit: x.limit }), ...(x.minSizeCm && { minSizeCm: x.minSizeCm }), ...(x.forbidden && { forbidden: true }), ...(closures.length && { closures }), ...(x.note && { note: x.note }), ...(x.unconfirmed && { unconfirmed: true }) };
      });
      const closures = (r.closures ?? []).filter((c) => c.waters.some((n) => lower(w.agua).includes(lower(n)))).map(({ from, to, note }) => ({ from, to, note }));
      return { region: rid(j), regionName: j.replace('CARU - Rio Uruguay', 'Río Uruguay (CARU)'), species, ...(closures.length && { closures }), notes: [r.norm, ...(r.rules ?? [])].join(' — '), name: w.descripcion_tramo_literal };
    });
    // Peces que están en el agua aunque ninguna norma los nombre (mojarra, chafalote, anguila…): se suman sin regla
    // («Sin regla específica: rige la norma general»), así aparecen en la lista y en el mapa.
    const present = [
      ...(lakeLike(w) ? LIT_LAKE_SPECIES : LIT_RIVER_SPECIES),
      ...Object.entries(presence)
        .filter(([id, p]) => id !== '_' && (lakeLike(w) ? p.lakes : p.rivers) && (!p.waters || p.waters.some((n) => lower(w.agua).includes(lower(n)))))
        .map(([id]) => id),
    ];
    for (const set of sets) for (const id of present) if (!set.species.some((e) => e.id === id)) set.species.push({ id }), litoralSpecies.add(id);
    const sp = new Map();
    for (const set of sets) for (const e of set.species) if (!sp.has(e.id) || (e.forbidden && !sp.get(e.id).forbidden)) sp.set(e.id, e);
    sectors.push({
      id: w.id, region: sets[0]?.region ?? 'lit', water: `${w.tipo_agua} ${w.agua}`, name: w.descripcion_tramo_literal, geometry: g.geometry,
      species: [...sp.values()], ...(sets.length > 1 ? { rules: sets } : { ...sets[0], region: sets[0]?.region }),
      ...(cuts[w.id]?.approx && { approx: cuts[w.id].approx }), source: sets[0]?.region ?? 'lit',
    });
  }
}

// Ambientes compartidos (decisión del dueño): el mismo río o lago figura en el anexo de cada jurisdicción con reglas distintas. Se
// dibuja una sola vez y la ficha muestra el reglamento de cada una, con a quién pertenece. Se juntan solo si el reglamento dice que es
// compartido y además salieron sobre el mismo dibujo (así no se mezclan dos lagunas homónimas).
const RULE_KEYS = ['validUntil', 'season', 'closed', 'modality', 'catchAndRelease', 'species', 'notes', 'ref', 'name', 'approx', 'speciesInferred'];
const byGeo = new Map();
for (const s of sectors) {
  if (!s._shared) continue;
  const k = JSON.stringify(s.geometry);
  byGeo.set(k, [...(byGeo.get(k) ?? []), s]);
}
const drop = new Set();
let merged = 0;
for (const group of byGeo.values()) {
  const regions = new Set(group.map((x) => x.region));
  if (regions.size < 2) continue;
  const [first, ...rest] = group;
  first.rules = group.map((x) => ({ region: x.region, regionName: x._regionName, ...Object.fromEntries(RULE_KEYS.filter((k) => x[k] !== undefined).map((k) => [k, x[k]])) }));
  // Para el mapa y las listas: todas las especies de todas las jurisdicciones (con la regla más estricta).
  const sp = new Map();
  for (const x of group)
    for (const e of x.species) {
      const prev = sp.get(e.id);
      const lim = (v) => (v === null ? Infinity : v ?? Infinity);
      if (!prev || lim(e.limit) < lim(prev.limit)) sp.set(e.id, e);
    }
  first.species = [...sp.values()];
  first.closed = group.every((x) => x.closed) || undefined;
  for (const x of rest) drop.add(x);
  merged++;
}
const finalSectors = sectors.filter((s) => !drop.has(s)).map(({ _shared, _regionName, ...s }) => s);
sectors.length = 0;
sectors.push(...finalSectors);
if (merged) console.log(`${merged} ambientes compartidos juntados (${drop.size} entradas repetidas)`);
// Fichas de los peces del Litoral (investigación del 2026-11-23: MAGyP, Santa Fe, FishBase y experiencia de pescadores).
const LIT_ALIAS = { 'armado-comun': 'armado', 'salmon-de-rio': 'salmon-rio', 'raya-de-rio': 'raya', 'corvina-de-rio': 'corvina' };
const litFile = `${work}/litoral/especies.json`;
if (existsSync(litFile) && jurs.split(',').includes('Litoral')) {
  const v = (x) => (x && typeof x === 'object' && 'valor' in x ? x.valor : x);
  const conf = (x) => (x?.confianza === 'oficial' || x?.confianza?.startsWith?.('confirmado') ? 'high' : x?.confianza === 'sin confirmar' ? 'low' : 'medium');
  const extra = JSON.parse(readFileSync(fileURLToPath(new URL('./litoral-extra.json', import.meta.url)), 'utf8')).especies;
  for (const e of [...JSON.parse(readFileSync(litFile, 'utf8')).especies, ...extra]) {
    const id = LIT_ALIAS[e.id] ?? e.id;
    // Carpa y pejerrey ya tienen ficha (Patagonia); el róbalo solo tenía el nombre: se reemplaza por la ficha completa.
    const prev = species.findIndex((x) => x.id === id);
    if (prev >= 0 && species[prev].baits) continue;
    if (prev >= 0) species.splice(prev, 1);
    const list = (x) => (Array.isArray(v(x)) ? v(x) : v(x) ? [v(x)] : []).filter((t) => typeof t === 'string' && !/^no encontrad/i.test(t));
    const danger = v(e.peligro);
    species.push({
      id,
      scientific: e.cientifico,
      native: /nativ/i.test(v(e.origen) ?? ''),
      name: e.nombre,
      ...(v(e.tamano) && { size: v(e.tamano) }),
      ...(v(e.dieta) && { diet: v(e.dieta) }),
      ...(v(e.epoca) && !/^no encontrad/i.test(v(e.epoca)) && { bestSeason: v(e.epoca) }),
      ...(v(e.horario) && !/^no encontrad/i.test(v(e.horario)) && { bestTime: v(e.horario) }),
      baits: { natural: list(e.carnadas_naturales), lures: list(e.senuelos_moscas), confidence: conf(e.carnadas_naturales) },
      ...(e.en_supervivencia?.baits?.length && { survival: e.en_supervivencia }),
      ...(danger?.texto && { danger: { level: danger.nivel, text: danger.texto } }),
    });
  }
}
for (const id of litoralSpecies) if (!species.some((x) => x.id === id)) species.push({ id, scientific: '', native: true, name: { es: LITORAL_NAMES[id] ?? id } });
// Solo los peces que tienen algún tramo (los de otras jurisdicciones se suman cuando se agregan).
// Otros nombres comunes (investigación con fuentes en ~/vikarg-fishing-work/otros-nombres.json; copia revisada en aka.json).
const AKA_FILE = fileURLToPath(new URL('./aka.json', import.meta.url));
const aka = existsSync(AKA_FILE) ? JSON.parse(readFileSync(AKA_FILE, 'utf8')) : {};
const used = species
  .filter((sp) => sectors.some((s) => s.species.some((x) => x.id === sp.id)))
  .map((sp) => ({ ...sp, ...(aka[sp.id]?.es?.length && { aka: aka[sp.id].es }), ...(images[sp.id] && { image: images[sp.id] }), ...(survival[sp.id] && { survival: survival[sp.id] }) }));
// Fecha y hora (no solo el día): la app reemplaza su copia guardada solo si la nueva es posterior, y el mismo día se regenera varias veces.
// Zonas (por cuenca): la app muestra los peces, la normativa y los permisos de la zona donde estás.
const ZONES = [
  { id: 'patagonia', name: { es: 'Patagonia', en: 'Patagonia', pt: 'Patagônia' } },
  { id: 'litoral', name: { es: 'Litoral (Paraná, Uruguay y Delta)', en: 'Litoral (Paraná, Uruguay and Delta)', pt: 'Litoral (Paraná, Uruguai e Delta)' } },
  { id: 'cuyo', name: { es: 'Cuyo', en: 'Cuyo', pt: 'Cuyo' } },
];
for (const r of regions) r.zone = r.id.startsWith('lit-') ? 'litoral' : r.id === 'mendoza' || r.id === 'san-juan' || r.id === 'san-luis' ? 'cuyo' : 'patagonia';
const data = { version: 1, generatedAt: new Date().toISOString().slice(0, 19) + 'Z', seasonLabel: '2026/2027', zones: ZONES.filter((z) => regions.some((r) => r.zone === z.id)), sources: SOURCES, species: used, regions, sectors };
writeFileSync(OUT, JSON.stringify(data));
const noSpecies = sectors.filter((s) => s.speciesInferred).map((s) => s.id);
console.log(`${sectors.length} tramos, ${used.length} especies → ${OUT} (${Math.round(readFileSync(OUT).length / 1024)} KB)`);
if (missing.length) console.log(`sin ubicar (${missing.length}): ${missing.join(', ')}`);
if (noSpecies.length) console.log(`especies supuestas (truchas) (${noSpecies.length}): ${noSpecies.join(', ')}`);
