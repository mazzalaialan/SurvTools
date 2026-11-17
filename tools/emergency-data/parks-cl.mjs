#!/usr/bin/env node
/**
 * Áreas silvestres protegidas de Chile (CONAF) para usar sin conexión:
 * app/public/data/parks-CL.json (se baja aparte, como el paquete de Chile).
 *
 * - Contactos y frecuencias: la página de cada área en conaf.cl (sitemap
 *   parque_nacionales). Se toma el bloque "Información de contacto" (oficina
 *   de CONAF de la región o de la unidad, con sus teléfonos) y la frecuencia
 *   VHF que la página publica para emergencias (p. ej. Torres del Paine:
 *   "para emergencias dentro del parque la frecuencia radial es VHF 143.800 MHz").
 *   No se guardan nombres de personas: el teléfono de un administrador queda
 *   como "Administración".
 * - Límites: OpenStreetMap (ODbL), por nombre; CONAF no publica una descarga.
 *   Las áreas que OSM no tiene quedan sin límite (se ubican por la oficina).
 * - Ubicación de las oficinas: Nominatim, por localidad, al generar.
 *
 * Uso: node tools/emergency-data/parks-cl.mjs   (necesita conexión; el resultado se versiona)
 */

import { writeFile } from 'node:fs/promises';
import { parksByCountry, parksById } from '../lib/osm-local.mjs';
import { fileURLToPath } from 'node:url';

// Con VIKARG_DATA_OUT escribe en la carpeta que sirve el servidor (actualización mensual).
const OUT = process.env.VIKARG_DATA_OUT ? `${process.env.VIKARG_DATA_OUT.replace(/\/$/, '')}/parks-CL.json` : fileURLToPath(new URL('../../app/public/data/parks-CL.json', import.meta.url));
const UA = 'VikArg-Prepping-Tools-build/1.0 (https://github.com/mazzalaialan/SurvTools)';
const SITEMAP = 'https://www.conaf.cl/parque_nacionales-sitemap.xml';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Nombre de CONAF → nombre en OpenStreetMap, cuando no coinciden. */
const OSM_NAME = {
  'Parque Nacional Bernardo O’Higgins': "Parque Nacional Bernardo O'Higgins",
  'Parque Nacional Archipiélago Juan Fernández': 'Parque Nacional Archipiélago de Juan Fernández',
  'Reserva Nacional Río de Los Cipreses': 'Reserva Nacional Río Los Cipreses',
  'Reserva Nacional Villarrica o Hualalafquén': 'Reserva Nacional Villarrica',
  'Parque Nacional Kawésqar': 'Parque Nacional y Reserva Nacional Kawésqar',
  'Reserva Nacional Kawésqar': 'Parque Nacional y Reserva Nacional Kawésqar',
  'Parque Nacional Bosque Fray Jorge': 'Parque Nacional Bosque de Fray Jorge',
  'Reserva Nacional Río Clarillo': 'Parque Nacional Río Clarillo',
};

const fold = (s) => (s ?? '').normalize('NFD').replace(/\p{M}/gu, '').replace(/[’']/g, "'").toLowerCase().trim();
const clean = (s) => s.replace(/\s+/g, ' ').trim();
const text = (raw) =>
  clean(
    raw
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&#8217;/g, '’')
      .replace(/&#8211;/g, '–')
      .replace(/&amp;/g, '&')
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))),
  );

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.text();
}

// ---------- Contactos ----------
const LABEL = /(CONAF[^:.]{0,45}|Administrador(?:a)?(?: de la unidad)?|Oficina[^:.]{0,45}|Tel[eé]fono de informaciones|Tel[eé]fonos?|Guarder[ií]a[^:.]{0,40}|(?:Parque|Reserva|Monumento) Nacional[^:.]{0,45}|Monumento Natural[^:.]{0,45})\s*:/;
const PHONE = /(?:\(?\+?\s?56\)?[\s-]*)?\(?\d{1,2}\)?[\s-]?\d[\d\s–-]{5,11}\d/g;
const digits = (s) => s.replace(/\D/g, '');

function phonesIn(s) {
  return (s.replace(/[\w.-]+@[\w.-]+/g, '').match(PHONE) ?? [])
    .map((p) => clean(p.replace(/–\d+$/, '')))
    .filter((p) => digits(p).length >= 8 && digits(p).length <= 12);
}

/**
 * Bloque "Información de contacto" → oficinas con dirección y teléfonos.
 * "Teléfonos:" suelto se suma a la oficina anterior; un administrador queda
 * como "Administración" (sin el nombre de la persona).
 */
export function parseContact(block, parkName) {
  const parts = block.split(LABEL);
  const out = [];
  for (let i = 1; i < parts.length; i += 2) {
    let label = clean(parts[i]);
    const body = parts[i + 1] ?? '';
    const phones = phonesIn(body);
    if (/^tel[eé]fonos?$/i.test(label) && out.length) {
      out[out.length - 1].phones.push(...phones);
      continue;
    }
    // El administrador o la propia unidad ("Reserva Nacional …: teléfono"; a veces con el nombre mal escrito).
    if (/^(administr|parque|reserva|monumento)/i.test(label)) label = 'Administración';
    else if (/informaciones/i.test(label)) label = 'Informaciones';
    const address = /^(CONAF|Oficina|Guarder)/i.test(label)
      ? clean(body.split(/,?\s*tel[eé]fono|\.\s*Tel[eé]fono|\.\s*Correo|,\s*correo/i)[0].replace(PHONE, '').replace(/[\s,.]+$/, ''))
      : '';
    if (!phones.length && !address) continue;
    out.push({ label, address: /\d|[A-ZÁÉÍÓÚ]/.test(address) && !address.includes(':') && address.length < 120 ? address : '', phones: [...new Set(phones)] });
  }
  return out;
}

/** Frecuencia VHF de emergencia publicada en la página, con la frase de la que sale. */
function radioIn(page) {
  // "VHF.143.800 MHz" (Torres del Paine): el punto pegado cortaría la frase.
  const t = page.replace(/VHF\.(?=\d)/g, 'VHF ');
  const m = t.match(/[^.]*frecuencias? radial(?:es)?[^.]*?(1[3-7]\d)[.,](\d{3})/i);
  if (!m) return null;
  // La frase entera: hasta un punto seguido de mayúscula (no el de "5.770").
  const sentence = t.slice(m.index).match(/^.*?\.(?=\s+[A-ZÁÉÍÓÚ]|$)/)?.[0] ?? m[0];
  return { freq: `${m[1]},${m[2]} MHz`, sentence: clean(sentence) };
}

// ---------- Límites de OpenStreetMap ----------
const key = (p) => `${p.lon},${p.lat}`;
/** Une los tramos (ways) de una relación en anillos cerrados. */
function stitch(segments) {
  const rings = [];
  const pool = segments.filter((s) => s.length > 1).map((s) => s.map((p) => [p.lon, p.lat]));
  while (pool.length) {
    let ring = pool.shift();
    let guard = 0;
    while (key({ lon: ring[0][0], lat: ring[0][1] }) !== key({ lon: ring.at(-1)[0], lat: ring.at(-1)[1] }) && guard++ < 10000) {
      const end = ring.at(-1);
      const i = pool.findIndex((s) => (s[0][0] === end[0] && s[0][1] === end[1]) || (s.at(-1)[0] === end[0] && s.at(-1)[1] === end[1]));
      if (i < 0) break;
      const [s] = pool.splice(i, 1);
      ring = ring.concat((s[0][0] === end[0] && s[0][1] === end[1] ? s : s.reverse()).slice(1));
    }
    if (ring.length >= 4) rings.push(ring);
  }
  return rings;
}

/** Punto dentro de un anillo [lon, lat]. */
function inRing(ring, [x, y]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Elemento de OSM → polígonos [[borde, ...huecos]]. */
function osmPolygons(e) {
  if (e.type === 'way') return [[e.geometry.map((p) => [p.lon, p.lat])]];
  const outers = stitch(e.members.filter((m) => m.type === 'way' && m.role !== 'inner' && m.geometry).map((m) => m.geometry));
  const inners = stitch(e.members.filter((m) => m.type === 'way' && m.role === 'inner' && m.geometry).map((m) => m.geometry));
  return outers.map((o) => [o, ...inners.filter((h) => inRing(o, h[0]))]);
}

// ---------- Simplificación (igual que parks.mjs) ----------
const r4 = (n) => Math.round(n * 1e4) / 1e4;
function simplify(points, tol) {
  if (points.length < 4) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1e-12;
    let max = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * (points[i][0] - ax) - dx * (points[i][1] - ay)) / len;
      if (d > max) {
        max = d;
        idx = i;
      }
    }
    if (max > tol && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}
const ringArea = (r) => Math.abs(r.reduce((s, [x, y], i) => { const [x2, y2] = r[(i + 1) % r.length]; return s + x * y2 - x2 * y; }, 0) / 2);
const simplifyRing = (ring, tol) => {
  const mid = Math.floor(ring.length / 2);
  return [...simplify(ring.slice(0, mid + 1), tol).slice(0, -1), ...simplify(ring.slice(mid), tol)];
};
function simplified(polys) {
  return polys
    .map((poly) => poly.map((ring) => simplifyRing(ring, 0.0015).map(([x, y]) => [r4(x), r4(y)])).filter((r) => r.length >= 4 && ringArea(r) > 1e-6))
    .filter((p) => p.length);
}

// ---------- Generar ----------
const urls = [...(await get(SITEMAP)).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).filter((u) => /\/parque_nacionales\/[^/]+\/$/.test(u));
console.log(`CONAF: ${urls.length} áreas`);

const areas = [];
for (const url of urls) {
  const raw = await get(url);
  const name = clean(text(raw.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '').split(' - ')[0]);
  const t = text(raw);
  const block = t.match(/Información de contacto (.*?)(?:Síguenos en nuestras|Conoce más d|Enlaces de interés|Playlist|Gobernanza)/)?.[1] ?? '';
  areas.push({ name, url, contacts: parseContact(block, name), radio: radioIn(t) });
  await sleep(300);
}

// Límites: nombres de OSM de una sola consulta; después la geometría de los elegidos.
const tags = await parksByCountry('CL', ['relation["boundary"~"^(protected_area|national_park)$"]', 'way["boundary"~"^(protected_area|national_park)$"]', 'relation["leisure"="nature_reserve"]'], { geom: false });
const byName = new Map();
for (const e of tags) if (e.tags?.name) byName.set(fold(e.tags.name), e);
const wanted = new Map();
for (const a of areas) {
  const e = byName.get(fold(OSM_NAME[a.name] ?? a.name));
  if (e) wanted.set(a.name, e);
}
const ids = (type) => [...wanted.values()].filter((e) => e.type === type).map((e) => e.id);
const geoms = new Map();
for (const e of await parksById('CL', 'relation', ids('relation'))) geoms.set(`relation/${e.id}`, e);
for (const e of await parksById('CL', 'way', ids('way'))) geoms.set(`way/${e.id}`, e);

// Ubicación de las oficinas, por localidad (la última parte de la dirección).
const located = new Map();
async function locate(address) {
  const town = address.split(',').map((s) => s.trim()).filter(Boolean).at(-1);
  if (!town) return null;
  if (!located.has(town)) {
    const q = new URLSearchParams({ q: `${town}, Chile`, format: 'json', limit: '1', countrycodes: 'cl' });
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${q}`, { headers: { 'User-Agent': UA } });
    const [hit] = res.ok ? await res.json() : [];
    located.set(town, hit ? { lat: r4(Number(hit.lat)), lon: r4(Number(hit.lon)) } : null);
    await sleep(1100);
  }
  return located.get(town);
}

const CONAF_EMERGENCY = { label: 'CONAF: emergencias (incendios forestales)', phone: '130' };
const parks = [];
const report = { noArea: [], noPhone: [], radio: [] };
for (const a of areas) {
  const e = wanted.get(a.name);
  const area = e ? simplified(osmPolygons(geoms.get(`${e.type}/${e.id}`))) : [];
  if (!area.length) report.noArea.push(a.name);
  const office = a.contacts.find((c) => c.address && c.phones.length) ?? a.contacts.find((c) => c.phones.length);
  // Otros teléfonos, sin repetir los de la oficina principal (a veces la página los pone dos veces).
  const seen = new Set((office?.phones ?? []).map(digits).map((d) => d.slice(-8)));
  const others = a.contacts
    .filter((c) => c !== office)
    .map((c) => ({ ...c, phones: c.phones.filter((p) => !seen.has(digits(p).slice(-8)) && seen.add(digits(p).slice(-8))) }))
    .filter((c) => c.phones.length);
  let at = office?.address ? await locate(office.address) : null;
  if (!at && area.length) {
    const ring = area[0][0];
    at = { lat: r4(ring.reduce((s, p) => s + p[1], 0) / ring.length), lon: r4(ring.reduce((s, p) => s + p[0], 0) / ring.length) };
  }
  // Monumentos chicos que OSM no tiene como área: el lugar por su nombre.
  if (!at) at = await locate(a.name);
  if (!at) {
    console.warn(`Sin ubicación ni límite: ${a.name}`);
    continue;
  }
  if (!office) report.noPhone.push(a.name);
  if (a.radio) report.radio.push(`${a.name}: ${a.radio.freq}`);
  parks.push({
    name: a.name,
    url: a.url,
    ...(office && { office: office.label }),
    address: office?.address ?? '',
    phone: office?.phones[0] ?? '',
    phones: office && office.phones.length > 1 ? office.phones.join(' / ') : '',
    emergency: [...others.map((c) => ({ label: c.label, phone: c.phones[0] })), CONAF_EMERGENCY],
    ...(a.radio && { radio: [{ freq: a.radio.freq, label: `VHF de emergencia de CONAF en ${a.name.replace(/^(Parque|Reserva) Nacional /, '')}`, source: `CONAF, página del área: "${a.radio.sentence}"` }] }),
    lat: at.lat,
    lon: at.lon,
    area,
  });
}

const MONTH = new Date().toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
const data = {
  generatedAt: new Date().toISOString().slice(0, 10),
  source: `Contactos y frecuencias: CONAF (conaf.cl, página de cada área), ${MONTH}. Límites: © colaboradores de OpenStreetMap (ODbL).`,
  parks,
};
await writeFile(OUT, JSON.stringify(data));
console.log(`${parks.length} áreas → ${OUT} (${JSON.stringify(data).length} bytes)`);
console.log(`Sin límite (${report.noArea.length}): ${report.noArea.join('; ')}`);
console.log(`Sin teléfono (${report.noPhone.length}): ${report.noPhone.join('; ')}`);
console.log(`Con frecuencia: ${report.radio.join('; ')}`);
