#!/usr/bin/env node
/**
 * Tablas de marea oficiales de Argentina (SHN) y Uruguay (SOHMA) para usar sin conexión: app/public/data/tides-official.json.
 *
 * - SHN (Servicio de Hidrografía Naval): formulario público https://www.hidro.gob.ar/Oceanografia/Tmareas/Form_Tmareas.asp, consulta POST a
 *   RE_TablasDeMarea.asp con FAnio, Localidad (código de 4 letras), FMes y B1; 48 puertos, un mes por consulta, hora y altura de cada
 *   extremo (SIN la etiqueta de pleamar o bajamar: se infiere alternando y se comprueba contra las alturas). «© Todos los Derechos
 *   Reservados, Servicio de Hidrografía Naval»: se usa mientras la app sea gratuita, citando la fuente (ver app/src/modules/navigation/sources.ts).
 * - SOHMA (Armada Nacional del Uruguay): PDF anuales de Montevideo, Colonia, Punta del Este y La Paloma
 *   (https://sohma.armada.mil.uy/index.php/servicios/informacion-mareografica) con ALTURAS HORARIAS en cm (24 columnas por día): las pleamares
 *   y bajamares se obtienen de los picos (interpolación parabólica, error de unos minutos). Sin licencia declarada: se cita la fuente.
 *   Necesita `pdftotext` (poppler-utils).
 *
 * Las alturas de cada fuente son sobre su propio cero (plano de reducción): no se mezclan. Se publican una vez por año: para 2027 volver a correr
 * en diciembre o enero (`node tools/tide-data/official.mjs --year 2027`); `node tools/tide-data/official.mjs --check 2027` solo dice si ya están.
 *
 * Uso: node tools/tide-data/official.mjs [--year AAAA] [--solo-shn] [--solo-sohma] [--cache carpeta] [--check AAAA]
 * (necesita conexión; la primera vez tarda unos 12 minutos por la pausa entre consultas; el resultado se versiona)
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const UA = 'VikArg-Survival-Tools/1.0';
const OUT = process.env.VIKARG_DATA_OUT ? `${process.env.VIKARG_DATA_OUT.replace(/\/$/, '')}/tides-official.json` : fileURLToPath(new URL('../../app/public/data/tides-official.json', import.meta.url));
const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? true) : def;
};
const YEAR = Number(arg('--check', arg('--year', new Date().getFullYear())));
const CACHE = arg('--cache', `${tmpdir()}/vikarg-tides-${YEAR}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SHN_FORM = 'https://www.hidro.gob.ar/Oceanografia/Tmareas/RE_TablasDeMarea.asp';
const SOHMA_PAGE = 'https://sohma.armada.mil.uy/index.php/servicios/informacion-mareografica';
/** Los 48 puertos del formulario del SHN (código → nombre). Si el SHN suma o quita, se ve en el reporte. */
const SHN_PORTS = {
  ATAL: 'ATALAYA', AGUI: 'BAHÍA AGUIRRE', SUCE: 'BAHÍA BUEN SUCESO', CROS: 'BAHÍA CROSSLEY (Isla de los Estados)', SANB: 'BAHÍA SAN BLAS', SSEB: 'BAHÍA SAN SEBASTIÁN', THET: 'BAHÍA THETIS', USHU: 'BAHÍA USHUAIA', CBRE: 'CALETA BRENT (Isla de los Estados)', LAMI: 'CALETA LA MISIÓN', CPAU: 'CALETA PAULA', SPAB: 'CALETA SAN PABLO', BBLA: 'CANAL PRINCIPAL A BAHÍA BLANCA (Par 12 a 16)', PIND: 'CANAL PUNTA INDIO (Km 201.6)', OYAR: 'CANAL PUNTA INDIO (Oyarvide - Km 133)', PCOL: 'CARGADERO DE PUNTA COLORADA', EMAG: 'ESTRECHO DE MAGALLANES (Boca Oriental)', SROM: 'FONDEADERO SAN ROMÁN (Golfo San José)', MAGA: 'ISLA MARTÍN GARCÍA', ANUE: 'ISLAS DE AÑO NUEVO (Isla Observatorio)', MAJO: 'MAR DE AJÓ', MHER: 'MONTE HERMOSO', TURB: 'MUELLE EL TURBIO (Puerto Río Gallegos)', NORD: 'PILOTE NORDEN - ADMINISTRACIÓN BINACIONAL', PINA: 'PINAMAR', PARG: 'PUERTO ARGENTINO (Isla Soledad, Islas Malvinas)', BELG: 'PUERTO BELGRANO', COMO: 'PUERTO COMODORO RIVADAVIA', BSAS: 'PUERTO DE BUENOS AIRES (Muelle de Pescadores)', PDES: 'PUERTO DESEADO', IWHI: 'PUERTO INGENIERO WHITE', LPLA: 'PUERTO LA PLATA', MADR: 'PUERTO MADRYN', MARD: 'PUERTO MAR DEL PLATA', QUEQ: 'PUERTO QUEQUÉN', RAWS: 'PUERTO RAWSON', RIOG: 'PUERTO RÍO GRANDE (Exterior)', ROSA: 'PUERTO ROSALES', SANT: 'PUERTO SAN ANTONIO (Muelle de Ultramar)', SJUA: 'PUERTO SAN JUAN DEL SALVAMENTO (Isla de los Estados)', SJUL: 'PUERTO SAN JULIÁN (Punta Peña)', SELE: 'PUERTO SANTA ELENA', VANC: 'PUERTO VANCOUVER (Isla de los Estados)', LOYO: 'PUNTA LOYOLA (Muelle Presidente Illia)', QUIL: 'PUNTA QUILLA (Puerto Santa Cruz)', RION: 'RÍO NEGRO (Punta Redonda)', SCLE: 'SAN CLEMENTE DEL TUYÚ (Muelle)', SANF: 'SAN FERNANDO', STER: 'SANTA TERESITA',
};
/** Los puertos de Uruguay y el nombre del PDF (`TABLA_DE_MAREAS_<año>_<archivo>.pdf`). */
const SOHMA_PORTS = [
  { id: 'MVD', name: 'Montevideo', file: 'MONTEVIDEO' },
  { id: 'COL', name: 'Colonia', file: 'COLONIA' },
  { id: 'PDE', name: 'Punta del Este', file: 'PUNTA DEL ESTE' },
  { id: 'LPA', name: 'La Paloma', file: 'LAPALOMA' },
];

const strip = (s) => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const dms = (d, m, s, hemi) => Math.round((Number(d) + Number(m) / 60 + Number(s || 0) / 3600) * (/[SW]/i.test(hemi) ? -1 : 1) * 1e4) / 1e4;
const minutesOfYear = (year, month, day, hh, mm) => Math.round((Date.UTC(year, month - 1, day, hh, mm) - Date.UTC(year, 0, 1)) / 60_000);

async function cached(file, load) {
  if (existsSync(file)) return readFile(file);
  const data = await load();
  await writeFile(file, data);
  return data;
}

/** Cada extremo con su etiqueta (h/l): se alterna a partir de los dos primeros y se comprueba que cada pleamar supere a las bajamares vecinas. */
function labelExtremes(events, who) {
  if (events.length < 4) throw new Error(`${who}: muy pocos extremos (${events.length})`);
  let high = events[0].h > events[1].h;
  const kinds = events.map(() => {
    const k = high ? 'h' : 'l';
    high = !high;
    return k;
  });
  let bad = 0;
  for (let i = 1; i < events.length; i++) {
    if (kinds[i] === 'h' && events[i].h < events[i - 1].h) bad++;
    if (kinds[i] === 'l' && events[i].h > events[i - 1].h) bad++;
  }
  if (bad > events.length * 0.02) throw new Error(`${who}: ${bad} de ${events.length} extremos no alternan con las alturas`);
  return kinds.join('');
}

// ---------- SHN ----------
async function shnMonth(code, month) {
  const file = `${CACHE}/shn-${code}-${YEAR}-${String(month).padStart(2, '0')}.html`;
  const buf = await cached(file, async () => {
    await sleep(700);
    const res = await fetch(SHN_FORM, {
      method: 'POST',
      headers: { 'user-agent': UA, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ FAnio: String(YEAR), Localidad: code, FMes: String(month).padStart(2, '0'), B1: 'Ejecutar consulta' }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`SHN ${code} ${month}: HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  });
  return buf.toString('utf8');
}

function parseShnMonth(html, month) {
  const rows = [];
  let day = 0;
  // Las tablas «DIA | HORA:MIN | ALTURA (m)»: el día solo viene en la primera fila de cada día.
  for (const tbl of html.match(/<table[^>]*>(?:(?!<\/table>)[\s\S])*DIA(?:(?!<\/table>)[\s\S])*<\/table>/gi) ?? []) {
    for (const tr of tbl.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? []) {
      const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => strip(c[1]));
      if (tds.length < 3) continue;
      if (/^\d{1,2}$/.test(tds[0])) day = Number(tds[0]);
      const hm = /^(\d{1,2}):(\d{2})$/.exec(tds[1]);
      const h = Number(tds[2].replace(',', '.'));
      if (day && hm && Number.isFinite(h)) rows.push({ day, hh: Number(hm[1]), mm: Number(hm[2]), h });
    }
  }
  return rows.map((r) => ({ ...r, month }));
}

async function buildShn() {
  const ports = [];
  for (const [code, name] of Object.entries(SHN_PORTS)) {
    const events = [];
    let head = null;
    for (let m = 1; m <= 12; m++) {
      const html = await shnMonth(code, m);
      if (!head) {
        const t = strip(html);
        const pos = /Lat\.\s*(\d+)\D+?(\d+)?\D*?([NS])\s*Long\.\s*(\d+)\D+?(\d+)?\D*?([EW])/i.exec(t);
        const huso = /Huso Horario:\s*([+-]?\d+)/i.exec(t);
        const mean = /Nivel medio:\s*([\d,]+)\s*m/i.exec(t);
        head = {
          lat: pos ? dms(pos[1], pos[2] ?? 0, 0, pos[3]) : NaN,
          lon: pos ? dms(pos[4], pos[5] ?? 0, 0, pos[6]) : NaN,
          huso: huso ? Number(huso[1]) : 3,
          meanCm: mean ? Math.round(Number(mean[1].replace(',', '.')) * 100) : null,
        };
      }
      events.push(...parseShnMonth(html, m));
    }
    if (events.length < 600) {
      console.warn(`SHN ${code} ${name}: ${events.length} extremos en ${YEAR}: sin datos, se omite`);
      continue;
    }
    if (!Number.isFinite(head.lat) || !Number.isFinite(head.lon)) {
      console.warn(`SHN ${code} ${name}: sin coordenadas, se omite`);
      continue;
    }
    const ev = events.map((e) => ({ t: minutesOfYear(YEAR, e.month, e.day, e.hh, e.mm), h: Math.round(e.h * 100) }));
    ev.sort((a, b) => a.t - b.t);
    ports.push(pack({ id: code, name, src: 'SHN', lat: head.lat, lon: head.lon, huso: head.huso, meanCm: head.meanCm }, ev, `SHN ${code}`));
    console.log(`SHN ${code} ${name}: ${ev.length} extremos`);
  }
  return ports;
}

// ---------- SOHMA ----------
async function sohmaLinks() {
  const html = await (await fetch(SOHMA_PAGE, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(60_000) })).text();
  const links = {};
  for (const m of html.matchAll(/href="([^"]*TABLA_DE_MAREAS_(\d{4})_([^"]+?)\.pdf)"/gi)) links[`${m[2]}/${decodeURIComponent(m[3]).replace(/%20/g, ' ')}`] = new URL(m[1].replace(/ /g, '%20'), SOHMA_PAGE).href;
  return links;
}

const MONTH_NUM = { ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6, JULIO: 7, AGOSTO: 8, SETIEMBRE: 9, SEPTIEMBRE: 9, OCTUBRE: 10, NOVIEMBRE: 11, DICIEMBRE: 12 };

function parseSohma(text, year) {
  const series = []; // [minutos del año, cm]
  let month = 0;
  const meta = {};
  const lat = /Latitud\s+(\d+)°\s*(\d+)'\s*(\d+)?[”"]?\s*([NS])/i.exec(text);
  const lon = /Longitud\s+(\d+)°\s*(\d+)'\s*(\d+)?[”"]?\s*([EW])/i.exec(text);
  const mean = /Nivel Medio\s+(\d+)\s*cm/i.exec(text);
  const huso = /Huso Horario\s+([+-]?\d+)/i.exec(text);
  meta.lat = lat ? dms(lat[1], lat[2], lat[3], lat[4]) : NaN;
  meta.lon = lon ? dms(lon[1], lon[2], lon[3], lon[4]) : NaN;
  meta.meanCm = mean ? Number(mean[1]) : null;
  meta.huso = huso ? Number(huso[1]) : 3;
  for (const line of text.split('\n')) {
    // Cualquier encabezado «MES AAAA»; las páginas de otro año (el PDF trae enero del año siguiente) se saltean.
    const mh = new RegExp(`^\\s*(${Object.keys(MONTH_NUM).join('|')})\\s+(\\d{4})\\s*$`, 'i').exec(line);
    if (mh) {
      month = Number(mh[2]) === year ? MONTH_NUM[mh[1].toUpperCase()] : 0;
      continue;
    }
    const m = /^\s*(\d{1,2})((?:\s+\d{1,3}){24})\s*$/.exec(line);
    if (m && month) {
      const vals = m[2].trim().split(/\s+/).map(Number);
      vals.forEach((v, h) => series.push([minutesOfYear(year, month, Number(m[1]), h, 0), v]));
    }
  }
  return { series, meta };
}

/**
 * Pleamares y bajamares de una serie horaria: picos locales con interpolación parabólica. Las alturas vienen en centímetros enteros, así que
 * en las mareas chicas aparecen ondulaciones de 1 o 2 cm que no son mareas: se descartan los pares seguidos (pleamar-bajamar) que difieren
 * menos de MIN_SWING cm, y si quedan dos del mismo tipo seguidos se deja el más marcado.
 */
const MIN_SWING = 6;
function extremesOf(series) {
  let out = [];
  for (let i = 1; i < series.length - 1; i++) {
    const [t, y] = series[i];
    const a = series[i - 1][1];
    const b = series[i + 1][1];
    if (series[i + 1][0] - series[i - 1][0] !== 120) continue; // hueco en la serie
    const isMax = y > a && y >= b;
    const isMin = y < a && y <= b;
    if (!isMax && !isMin) continue;
    const den = a - 2 * y + b;
    const dt = den === 0 ? 0 : (0.5 * (a - b)) / den; // en horas, entre -0,5 y 0,5
    out.push({ t: Math.round(t + dt * 60), h: Math.round(y - 0.25 * (a - b) * dt), k: isMax ? 'h' : 'l' });
  }
  for (let again = true; again; ) {
    again = false;
    const next = [];
    for (let i = 0; i < out.length; i++) {
      const cur = out[i];
      const prev = next[next.length - 1];
      if (prev && prev.k === cur.k) {
        // Dos iguales seguidos: queda el más marcado.
        if ((cur.k === 'h' && cur.h > prev.h) || (cur.k === 'l' && cur.h < prev.h)) next[next.length - 1] = cur;
        again = true;
      } else if (prev && Math.abs(prev.h - cur.h) < MIN_SWING) {
        // Ondulación chica: se descartan los dos.
        next.pop();
        again = true;
      } else next.push(cur);
    }
    out = next;
  }
  return out;
}

async function buildSohma(links) {
  const ports = [];
  for (const p of SOHMA_PORTS) {
    const url = links[`${YEAR}/${p.file}`];
    if (!url) {
      console.warn(`SOHMA ${p.name}: no hay PDF ${YEAR} en la página`);
      continue;
    }
    const pdf = await cached(`${CACHE}/sohma-${p.file.replace(/\W/g, '')}-${YEAR}.pdf`, async () => {
      const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(120_000) });
      if (!res.ok) throw new Error(`SOHMA ${p.name}: HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    });
    await mkdir(CACHE, { recursive: true });
    const pdfPath = `${CACHE}/sohma-${p.file.replace(/\W/g, '')}-${YEAR}.pdf`;
    await writeFile(pdfPath, pdf);
    const text = execFileSync('pdftotext', ['-layout', pdfPath, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const { series, meta } = parseSohma(text, YEAR);
    const expected = (YEAR % 4 === 0 ? 366 : 365) * 24;
    if (series.length !== expected) throw new Error(`SOHMA ${p.name}: ${series.length} alturas horarias en vez de ${expected}`);
    if (series.some(([, v]) => v < 0 || v > 400)) throw new Error(`SOHMA ${p.name}: alturas fuera de rango`);
    const ev = extremesOf(series);
    ports.push(pack({ id: p.id, name: p.name, src: 'SOHMA', lat: meta.lat, lon: meta.lon, huso: meta.huso, meanCm: meta.meanCm }, ev, `SOHMA ${p.name}`));
    console.log(`SOHMA ${p.name}: ${ev.length} extremos`);
  }
  return ports;
}

/** Que las pleamares superen a las bajamares vecinas y se alternen (las etiquetas vienen de los picos). */
function checkAlternation(ev, who) {
  let bad = 0;
  for (let i = 1; i < ev.length; i++) {
    if (ev[i].k === ev[i - 1].k) bad++;
    else if (ev[i].k === 'h' && ev[i].h <= ev[i - 1].h) bad++;
    else if (ev[i].k === 'l' && ev[i].h >= ev[i - 1].h) bad++;
  }
  if (bad > 0) throw new Error(`${who}: ${bad} extremos no alternan`);
}

/** Forma compacta: `t` = primer instante (minutos desde el 1 de enero 00:00, hora local) y diferencias; `h` alturas en cm; `k` = h/l de cada extremo. */
function pack(meta, ev, who) {
  const k = ev[0]?.k ? ev.map((e) => e.k).join('') : labelExtremes(ev, who);
  if (ev[0]?.k) checkAlternation(ev, who);
  const t = ev.map((e, i) => (i === 0 ? e.t : e.t - ev[i - 1].t));
  return { ...meta, k, t, h: ev.map((e) => e.h) };
}

async function main() {
  await mkdir(CACHE, { recursive: true });
  if (arg('--check', false)) {
    // ¿Ya publicaron el año? SHN: el formulario devuelve la tabla con datos; SOHMA: la página lista el PDF de ese año.
    const html = await shnMonth('BSAS', 1);
    const shnOk = parseShnMonth(html, 1).length > 20;
    const links = await sohmaLinks();
    const sohmaOk = SOHMA_PORTS.some((p) => links[`${YEAR}/${p.file}`]);
    console.log(`${YEAR}: SHN ${shnOk ? 'SÍ publicó' : 'todavía no'}; SOHMA ${sohmaOk ? 'SÍ publicó' : 'todavía no'}`);
    return;
  }
  const only = { shn: process.argv.includes('--solo-shn'), sohma: process.argv.includes('--solo-sohma') };
  const previous = existsSync(OUT) ? JSON.parse(await readFile(OUT, 'utf8')) : null;
  const keep = (src) => (previous && previous.year === YEAR ? previous.ports.filter((p) => p.src === src) : []);
  const shn = only.sohma ? keep('SHN') : await buildShn();
  const sohma = only.shn ? keep('SOHMA') : await buildSohma(await sohmaLinks());
  const data = {
    generatedAt: new Date().toISOString().slice(0, 10),
    year: YEAR,
    source: `SHN (Servicio de Hidrografía Naval, Argentina), Tablas de marea ${YEAR}; SOHMA (Armada Nacional de Uruguay), Tablas de mareas ${YEAR}. Cada fuente con su cero.`,
    ports: [...shn, ...sohma],
  };
  await writeFile(OUT, JSON.stringify(data));
  console.log(`${data.ports.length} puertos (${shn.length} SHN, ${sohma.length} SOHMA) → ${OUT} (${JSON.stringify(data).length} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
