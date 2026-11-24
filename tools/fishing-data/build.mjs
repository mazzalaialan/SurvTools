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
const survival = JSON.parse(readFileSync(fileURLToPath(new URL('./survival.json', import.meta.url)), 'utf8'));

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
    // «LD: sin límites de captura para la trucha de lago (bocón) y salmón Chinook, otros salmónidos 2 ejemplares» (Parques Nacionales).
    const free = ld.match(/sin l[ií]mites? de (?:captura|extracci[oó]n) para ([^,]*)/i);
    if (free) for (const part of free[1].split(/\sy\s/)) for (const id of speciesOf(part)) set(id, { limit: null });
    // «la pesca de salmónidos exóticos (salmón y trucha) será sin límites de extracción y sin devolución» (PN Tierra del Fuego).
    const freeAll = ld.match(/pesca de ([^.]*?)\s+ser[aá] sin l[ií]mites?/i);
    if (freeAll) for (const id of /salm[oó]nid/i.test(freeAll[1]) ? ['trucha-arcoiris', 'trucha-marron', 'trucha-arroyo'] : speciesOf(freeAll[1])) set(id, { limit: null });
    for (const item of ld.matchAll(/(?:otros\s+)?([a-záéíóúñ ]+?)\s+(\d+)\s+ejemplares?/gi)) {
      const ids = speciesOf(item[1]);
      const others = /otros/i.test(item[0]);
      for (const id of /salm[oó]nid/i.test(item[1]) ? ['trucha-arcoiris', 'trucha-marron', 'trucha-arroyo'] : ids) if (!(others && species.has(id))) set(id, { limit: Number(item[2]) });
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
  const closed = (/pesca no autorizada|no se permite la pesca|veda total|prohibida la pesca\s*(en todo|todo el a)/i.test(text) || /^\W*(neuqu[eé]n\W*)?prohibida la pesca\.?\s*$/i.test(text.replace(/^-\s*/, ''))) && !/LD/.test(text);
  // Sin especies nombradas (p. ej. «Devolución obligatoria.»): se toman las truchas, que están en casi todos los ríos y lagos patagónicos.
  const inferred = !species.size && !closed;
  if (inferred) for (const id of ['trucha-arcoiris', 'trucha-marron']) set(id, allRelease ? { limit: 0 } : {});
  const mods = new Set();
  for (const m of text.matchAll(/\((S|M|T|SBM)\)/g)) mods.add(MODALITY[m[1]]);
  if (/mosca solamente|exclusivo equipo de mosca|solo mosca/i.test(text)) mods.add('fly');
  if (/trolling/i.test(t) && !/prohibid[oa] (el )?trolling/i.test(t)) mods.add('trolling');
  // «Apertura: 01/11/2026 - Cierre: 31/05/2027» o «Permitido pescar desde el 01/11/2026 al 31/05/2027».
  const span = text.match(/desde el (\d{1,2}\/\d{1,2}\/\d{4}) (?:al|hasta el) (\d{1,2}\/\d{1,2}\/\d{4})/i);
  const open = text.match(/Apertura:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i) ?? (span && [span[0], span[1]]);
  const close = text.match(/Cierre:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i) ?? (span && [span[0], span[2]]);
  const season = closed ? undefined : open && close ? { from: iso(open[1]), to: iso(close[1]) } : undefined;
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
      ...((cuts[a.id]?.approx || g.approxPoint) && { approx: cuts[a.id]?.approx ?? 'ubicado por coordenada; el agua no está dibujada en el mapa base' }),
      source: SOURCE.id,
      ref: `pág. ${a.fuente?.pagina_impresa ?? '?'}`,
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
const RULE_KEYS = ['season', 'closed', 'modality', 'catchAndRelease', 'species', 'notes', 'ref', 'name', 'approx', 'speciesInferred'];
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
const LIT_ALIAS = { 'armado-comun': 'armado', 'salmon-de-rio': 'salmon-rio', 'raya-de-rio': 'raya' };
const litFile = `${work}/litoral/especies.json`;
if (existsSync(litFile) && jurs.split(',').includes('Litoral')) {
  const v = (x) => (x && typeof x === 'object' && 'valor' in x ? x.valor : x);
  const conf = (x) => (x?.confianza === 'oficial' || x?.confianza?.startsWith?.('confirmado') ? 'high' : x?.confianza === 'sin confirmar' ? 'low' : 'medium');
  for (const e of JSON.parse(readFileSync(litFile, 'utf8')).especies) {
    const id = LIT_ALIAS[e.id] ?? e.id;
    if (species.some((x) => x.id === id)) continue; // carpa y pejerrey ya tienen ficha (Patagonia)
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
const used = species.filter((sp) => sectors.some((s) => s.species.some((x) => x.id === sp.id))).map((sp) => ({ ...sp, ...(images[sp.id] && { image: images[sp.id] }), ...(survival[sp.id] && { survival: survival[sp.id] }) }));
// Fecha y hora (no solo el día): la app reemplaza su copia guardada solo si la nueva es posterior, y el mismo día se regenera varias veces.
// Zonas (por cuenca): la app muestra los peces, la normativa y los permisos de la zona donde estás.
const ZONES = [
  { id: 'patagonia', name: { es: 'Patagonia', en: 'Patagonia', pt: 'Patagônia' } },
  { id: 'litoral', name: { es: 'Litoral (Paraná, Uruguay y Delta)', en: 'Litoral (Paraná, Uruguay and Delta)', pt: 'Litoral (Paraná, Uruguai e Delta)' } },
];
for (const r of regions) r.zone = r.id.startsWith('lit-') ? 'litoral' : 'patagonia';
const data = { version: 1, generatedAt: new Date().toISOString().slice(0, 19) + 'Z', seasonLabel: '2026/2027', zones: ZONES.filter((z) => regions.some((r) => r.zone === z.id)), sources: SOURCES, species: used, regions, sectors };
writeFileSync(OUT, JSON.stringify(data));
const noSpecies = sectors.filter((s) => s.speciesInferred).map((s) => s.id);
console.log(`${sectors.length} tramos, ${used.length} especies → ${OUT} (${Math.round(readFileSync(OUT).length / 1024)} KB)`);
if (missing.length) console.log(`sin ubicar (${missing.length}): ${missing.join(', ')}`);
if (noSpecies.length) console.log(`especies supuestas (truchas) (${noSpecies.length}): ${noSpecies.join(', ')}`);
