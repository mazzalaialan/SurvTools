#!/usr/bin/env node
/**
 * Establecimientos de salud de Brasil (CNES, Ministério da Saúde) dentro de los paquetes `app/public/data/BR-<sector>.json`.
 *
 * Fuente: Cadastro Nacional de Estabelecimentos de Saúde (CNES), «Estabelecimentos de saúde» del portal de datos abiertos del Ministerio de Salud
 *   https://dadosabertos.saude.gov.br/  ·  https://s3.sa-east-1.amazonaws.com/ckan.saude.gov.br/CNES/cnes_estabelecimentos_csv.zip
 *   (CSV nacional, ~57 MB comprimido, latin-1, separador `;`, actualizado a diario). Licencia: Creative Commons BY-ND 3.0 (sin derivadas):
 *   se usa con el crédito «Ministério da Saúde / CNES» (organismo, enlace, fecha del dato) y SIN alterar los valores ni mezclar campos con
 *   OpenStreetMap: cada pin sale de una sola fuente. Ver docs/FUENTES-DE-DATOS.md.
 *
 * Qué hace: lee el CSV, se queda con los establecimientos ACTIVOS (sin `CO_MOTIVO_DESAB`), de los tipos que sirven en una emergencia o para
 * atención básica (`TP_UNIDADE`, abajo) y con coordenadas válidas dentro de Brasil (y no lejos de su municipio), los reparte por sector
 * (macrorregión del IBGE, por el código del estado `CO_UF`) y reemplaza la lista `health` de cada `BR-<sector>.json`:
 *   - los del CNES (con `cnes`, y `h24` / `sus` cuando corresponde);
 *   - los de OpenStreetMap que ya estaban, salvo los que caen a ≤150 m de un establecimiento del CNES (mismo lugar: se muestra el del CNES).
 * Es repetible: los pins del CNES de una corrida anterior se descartan antes de volver a armar (se reconocen por el campo `cnes`), así que se
 * puede correr tantas veces como haga falta sobre el mismo archivo. Si se regenera `BR-<sector>.json` con tools/country-data/build.mjs
 * (que vuelve a dejar solo OpenStreetMap), hay que correr esto de nuevo después.
 *
 * Uso: node tools/country-data/cnes-br.mjs <cnes_estabelecimentos.csv> [--fecha AAAA-MM-DD] [--sector sul] [--sal <carpeta>] [--sin-escribir]
 *   --fecha: fecha del dato (por defecto, la de modificación del CSV). --sal: carpeta de los BR-<sector>.json (por defecto, app/public/data).
 *   --sin-escribir: solo cuenta y muestra los tamaños.
 * Bajar el CSV en una carpeta temporal y borrarlo al terminar (233 MB descomprimidos).
 */
import { createReadStream, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

export const CNES_URL = 'https://dadosabertos.saude.gov.br/';

/**
 * Tipos de estabelecimento (`TP_UNIDADE`) que entran. Nombres del cadastro oficial (CnesWeb/DATASUS, cnes2.datasus.gov.br, confirmados el
 * 2026-11-20 y con el manual del SCNES para 15, 62 y 72):
 *   01 posto de saúde, 02 centro de saúde/UBS, 04 policlínica, 05 hospital geral, 07 hospital especializado, 15 unidade mista (atención básica con
 *   internación y a veces urgencia), 20/21 pronto-socorro, 72 atención de salud indígena (atención básica; a veces la única en el Norte), 73 pronto atendimento (UPA).
 * Afuera: 62 hospital-día aislado (cirugía/terapia programada, no es emergencia), 70 CAPS, 22 consultorio, 36 clínica, 39 apoyo diagnóstico, 43 farmacia,
 * 40/42 unidades móviles.
 */
export const TYPES = {
  '01': 'Posto de saúde',
  '02': 'Centro de saúde / UBS',
  '04': 'Policlínica',
  '05': 'Hospital geral',
  '07': 'Hospital especializado',
  '15': 'Unidade mista',
  '20': 'Pronto-socorro geral',
  '21': 'Pronto-socorro especializado',
  '72': 'Saúde indígena',
  '73': 'Pronto atendimento (UPA)',
};

/** Estado (`CO_UF`, código IBGE) → sector. */
export const SECTOR_OF_UF = {
  41: 'sul', 42: 'sul', 43: 'sul',
  35: 'sudeste', 33: 'sudeste', 31: 'sudeste', 32: 'sudeste',
  51: 'centro-oeste', 50: 'centro-oeste', 52: 'centro-oeste', 53: 'centro-oeste',
  21: 'nordeste', 22: 'nordeste', 23: 'nordeste', 24: 'nordeste', 25: 'nordeste', 26: 'nordeste', 27: 'nordeste', 28: 'nordeste', 29: 'nordeste',
  12: 'norte', 13: 'norte', 16: 'norte', 15: 'norte', 11: 'norte', 14: 'norte', 17: 'norte',
};
export const SECTORS = ['sul', 'sudeste', 'centro-oeste', 'nordeste', 'norte'];

/** Un pin del CNES más lejos que esto de la mediana de los de su municipio tiene las coordenadas mal cargadas. */
const MAX_FROM_MUNICIPALITY_KM = 250;
/** El mismo establecimiento en OpenStreetMap: a esta distancia o menos se oculta el de OSM. */
export const TWIN_METERS = 150;

const r5 = (n) => Math.round(n * 1e5) / 1e5;
const meters = (a, b) => Math.hypot((a.lat - b.lat) * 111_320, (a.lon - b.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180));

/** Una línea de CSV con comillas y `;` → campos. (Las comillas dobles escapadas `""` quedan como una.) */
export function splitLine(line) {
  const out = [];
  let f = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') (f += '"'), i++;
      else if (c === '"') q = false;
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ';') out.push(f), (f = '');
    else f += c;
  }
  out.push(f);
  return out;
}

const clean = (s) => (s ?? '').replace(/\s+/g, ' ').trim();

/** Coordenada del CSV (`-8.2801925142`, a veces con coma) → número, o NaN. */
const num = (s) => Number(clean(s).replace(',', '.'));

/** ¿Cae dentro de Brasil (caja generosa, con las islas oceánicas)? */
export const inBrazil = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && lat >= -34 && lat <= 5.5 && lon >= -74 && lon <= -28;

/** Teléfono: tal cual lo carga el CNES (`(81)35221848`), solo si tiene al menos 6 dígitos. */
const phoneOf = (s) => {
  const p = clean(s);
  return p.replace(/\D/g, '').length >= 6 ? p : '';
};

/** Dirección corta: calle y número, y el barrio. Tal cual el CNES (en mayúsculas). */
const addressOf = (street, no, hood) => [[clean(street), clean(no)].filter(Boolean).join(' '), clean(hood)].filter(Boolean).join(', ');

/**
 * Lee el CSV y devuelve los establecimientos válidos (`{ sector, uf, mun, place }`). `stats` cuenta lo que se descartó y por qué.
 * `place` es lo que se guarda por pin: name, lat, lon, type, cnes y, si hay, phone, address, h24, sus.
 */
export async function readCnes(file) {
  const stats = { rows: 0, inactive: 0, otherType: 0, noCoords: 0, outsideBrazil: 0, farFromMunicipality: 0, noName: 0, kept: 0, byType: {} };
  const rl = createInterface({ input: createReadStream(file, { encoding: 'latin1' }), crlfDelay: Infinity });
  let head = null;
  let pending = '';
  const rows = [];
  for await (const raw of rl) {
    // Un campo entre comillas con salto de línea adentro: se junta con la línea siguiente.
    const line = pending ? `${pending} ${raw}` : raw;
    if ((line.match(/"/g)?.length ?? 0) % 2) {
      pending = line;
      continue;
    }
    pending = '';
    const f = splitLine(line);
    if (!head) {
      head = Object.fromEntries(f.map((k, i) => [k.replace(/^﻿/, '').trim(), i]));
      for (const k of ['CO_CNES', 'CO_UF', 'CO_IBGE', 'NO_FANTASIA', 'NO_RAZAO_SOCIAL', 'TP_UNIDADE', 'NU_LATITUDE', 'NU_LONGITUDE', 'CO_MOTIVO_DESAB', 'CO_TURNO_ATENDIMENTO', 'CO_AMBULATORIAL_SUS']) {
        if (!(k in head)) throw new Error(`el CSV no trae la columna ${k}: cambió el formato`);
      }
      continue;
    }
    if (f.length !== Object.keys(head).length) continue;
    stats.rows++;
    const g = (k) => f[head[k]];
    if (clean(g('CO_MOTIVO_DESAB'))) {
      stats.inactive++;
      continue;
    }
    const tp = clean(g('TP_UNIDADE')).padStart(2, '0');
    if (!TYPES[tp]) {
      stats.otherType++;
      continue;
    }
    const lat = num(g('NU_LATITUDE'));
    const lon = num(g('NU_LONGITUDE'));
    if (!clean(g('NU_LATITUDE')) || !clean(g('NU_LONGITUDE')) || (lat === 0 && lon === 0)) {
      stats.noCoords++;
      continue;
    }
    if (!inBrazil(lat, lon)) {
      stats.outsideBrazil++;
      continue;
    }
    const name = clean(g('NO_FANTASIA')) || clean(g('NO_RAZAO_SOCIAL'));
    if (!name) {
      stats.noName++;
      continue;
    }
    const uf = Number(clean(g('CO_UF')));
    const sector = SECTOR_OF_UF[uf];
    if (!sector) continue;
    const phone = phoneOf(g('NU_TELEFONE'));
    const address = addressOf(g('NO_LOGRADOURO'), g('NU_ENDERECO'), g('NO_BAIRRO'));
    const place = {
      name,
      lat: r5(lat),
      lon: r5(lon),
      type: TYPES[tp],
      ...(phone && { phone }),
      ...(address && { address }),
      cnes: clean(g('CO_CNES')),
      ...(clean(g('CO_TURNO_ATENDIMENTO')) === '06' && { h24: true }),
      ...(clean(g('CO_AMBULATORIAL_SUS')).toUpperCase() === 'SIM' && { sus: true }),
    };
    rows.push({ sector, uf, mun: clean(g('CO_IBGE')), tp, place });
    stats.byType[tp] = (stats.byType[tp] ?? 0) + 1;
  }
  // Coordenadas mal cargadas (otro estado, latitud y longitud cruzadas): lejos de la mediana de su municipio.
  const byMun = new Map();
  for (const r of rows) byMun.set(r.mun, [...(byMun.get(r.mun) ?? []), r]);
  const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const kept = [];
  for (const group of byMun.values()) {
    const c = group.length >= 3 ? { lat: median(group.map((r) => r.place.lat)), lon: median(group.map((r) => r.place.lon)) } : null;
    for (const r of group) {
      if (c && meters(r.place, c) > MAX_FROM_MUNICIPALITY_KM * 1000) stats.farFromMunicipality++;
      else kept.push(r);
    }
  }
  stats.kept = kept.length;
  return { rows: kept, stats };
}

/**
 * La lista `health` de un sector: los del CNES + los de OpenStreetMap que no son el mismo lugar (a ≤150 m de uno del CNES).
 * Los pins de una corrida anterior (con `cnes`) se tiran antes. No se completa ningún campo de uno con el otro (CC BY-ND).
 */
export function mergeHealth(previous, cnes) {
  const osm = previous.filter((p) => !p.cnes);
  const cell = (p) => `${Math.floor(p.lat * 200)},${Math.floor(p.lon * 200)}`; // celdas de ~550 m
  const grid = new Map();
  for (const c of cnes) grid.set(cell(c), [...(grid.get(cell(c)) ?? []), c]);
  const hasTwin = (o) => {
    const [la, lo] = cell(o).split(',').map(Number);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) if ((grid.get(`${la + i},${lo + j}`) ?? []).some((c) => meters(c, o) <= TWIN_METERS)) return true;
    return false;
  };
  const kept = osm.filter((o) => !hasTwin(o));
  return { health: [...cnes, ...kept], droppedOsm: osm.length - kept.length, keptOsm: kept.length };
}

/** Texto de crédito del sector (va en `sources.health`, que la app muestra al pie de «Buscar cercanos»). */
export const creditText = (date, coverage) =>
  `Establecimientos de salud: Ministério da Saúde / CNES, Cadastro Nacional de Estabelecimentos de Saúde (${CNES_URL}, CC BY-ND 3.0, datos del ${date}; cubre solo ${coverage}); los que faltan en el CNES: © colaboradores de OpenStreetMap (ODbL)`;

async function main() {
  const args = process.argv.slice(2);
  const opt = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const file = args.find((a, i) => !a.startsWith('--') && !['--fecha', '--sector', '--sal'].includes(args[i - 1]));
  if (!file) throw new Error('Uso: node tools/country-data/cnes-br.mjs <cnes_estabelecimentos.csv> [--fecha AAAA-MM-DD] [--sector sul] [--sal carpeta] [--sin-escribir]');
  const date = opt('--fecha') ?? statSync(file).mtime.toISOString().slice(0, 10);
  const only = opt('--sector');
  if (only && !SECTORS.includes(only)) throw new Error(`sector desconocido: ${only}`);
  const outDir = (opt('--sal') ?? fileURLToPath(new URL('../../app/public/data/', import.meta.url))).replace(/\/?$/, '/');
  const dry = args.includes('--sin-escribir');

  const { rows, stats } = await readCnes(file);
  console.log(`CSV: ${stats.rows} filas; baja ${stats.inactive}; otro tipo ${stats.otherType}; sin coordenadas ${stats.noCoords}; fuera de Brasil ${stats.outsideBrazil}; lejos de su municipio ${stats.farFromMunicipality}; sin nombre ${stats.noName}; quedan ${stats.kept}`);
  console.log(`por tipo: ${JSON.stringify(stats.byType)}`);
  for (const sector of SECTORS) {
    if (only && only !== sector) continue;
    const path = `${outDir}BR-${sector}.json`;
    const data = JSON.parse(readFileSync(path, 'utf8'));
    const cnes = rows.filter((r) => r.sector === sector).map((r) => r.place);
    const before = { ...data, health: data.health.filter((p) => !p.cnes) };
    const { health, droppedOsm, keptOsm } = mergeHealth(data.health, cnes);
    data.health = health;
    data.sources = { ...data.sources, health: creditText(date, data.coverage) };
    data.cnesDate = date;
    // El índice de archivos (data-sizes.mjs) detecta cambios por esta fecha: sube a la del dato del CNES si es más nueva.
    if (!data.generatedAt || data.generatedAt < date) data.generatedAt = date;
    const json = JSON.stringify(data);
    const mb = (n) => (n / 1e6).toFixed(2);
    console.log(`${sector}: CNES ${cnes.length} + OSM ${keptOsm} (${droppedOsm} de OSM ocultos por ser el mismo lugar) = ${health.length}; ${mb(JSON.stringify(before).length)} → ${mb(json.length)} MB; comprimido ${mb(gzipSync(JSON.stringify(before)).length)} → ${mb(gzipSync(json).length)} MB`);
    if (!dry) writeFileSync(path, json);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
