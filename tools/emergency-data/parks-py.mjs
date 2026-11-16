#!/usr/bin/env node
/**
 * Áreas protegidas de Paraguay para usar sin conexión:
 * app/public/data/parks-PY.json (se baja aparte, como el de Bolivia).
 *
 * - Límites y nombres: OpenStreetMap (ODbL). El MADES (Ministerio del Ambiente) no
 *   publica una descarga de límites y la base mundial WDPA/Protected Planet no permite
 *   redistribuir sus datos en una app: se usa solo para comprobar qué áreas faltan
 *   (ver docs/FUENTES-DE-DATOS.md), nada de WDPA entra a este archivo.
 * - Contacto: el de la central del MADES (mades.gov.py, 021 2879000): ninguna área
 *   publica su propio teléfono.
 * - Sin frecuencias de radio: ninguna se publica.
 *
 * Uso: node tools/emergency-data/parks-py.mjs   (necesita conexión; el resultado se versiona)
 */

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { centerOf, osmPolygons, simplified } from '../lib/osm-geo.mjs';
import { overpass } from '../lib/overpass.mjs';

// Con VIKARG_DATA_OUT escribe en la carpeta que sirve el servidor (actualización mensual).
const OUT = process.env.VIKARG_DATA_OUT ? `${process.env.VIKARG_DATA_OUT.replace(/\/$/, '')}/parks-PY.json` : fileURLToPath(new URL('../../app/public/data/parks-PY.json', import.meta.url));

/** Datos del MADES (mades.gov.py, leídos el 2026-11-15). */
const MADES_PAGE = 'https://www.mades.gov.py/';
const EMERGENCY = [{ label: 'MADES (sede central, Asunción)', phone: '+595 21 2879000' }];

// Parques, reservas y monumentos: pueden estar mapeados como relación o como vía cerrada. Se descartan los sitios del Patrimonio
// (clase 22), las comunidades indígenas (24), las «matas ciliares» de la represa de Itaipú, los sitios históricos o urbanos mal etiquetados
// y los lugares cuyo nombre no dice que sean un parque, reserva, refugio, monumento o área protegida (lotes y estancias con etiqueta de reserva).
const elements = (
  await overpass(`[out:json][timeout:300];
area["ISO3166-1"="PY"][admin_level=2]->.a;
(
  nwr["boundary"="national_park"]["name"](area.a);
  nwr["boundary"="protected_area"]["name"](area.a);
  nwr["leisure"="nature_reserve"]["name"](area.a);
);
out geom;`)
).filter((e) => !/^(22|24)$/.test(e.tags?.protect_class ?? '') && !/mata ciliar|centro hist[oó]rico|batall[oó]n|campo de batalla/i.test(e.tags?.name ?? '') && /parque|reserva|refug|monumento|[aá]rea|fort[ií]n/i.test(e.tags?.name ?? '') && (e.type === 'relation' ? e.members?.length : e.geometry?.length > 3));

const seen = new Set();
const parks = [];
for (const e of elements) {
  const name = e.tags?.name;
  if (!name || seen.has(name)) continue;
  seen.add(name);
  const area = simplified(osmPolygons(e), 0.003, 1e-5);
  const at = centerOf(area);
  if (!at) {
    console.warn(`Sin límite: ${name}`);
    continue;
  }
  const site = e.tags.website ?? e.tags['contact:website'];
  parks.push({
    country: 'PY',
    name,
    url: /^https?:\/\//.test(site ?? '') ? site : MADES_PAGE,
    office: 'MADES',
    address: '',
    phone: '',
    phones: '',
    emergency: EMERGENCY,
    lat: at.lat,
    lon: at.lon,
    area,
  });
}
parks.sort((a, b) => a.name.localeCompare(b.name, 'es'));

const data = {
  generatedAt: new Date().toISOString().slice(0, 10),
  source: 'Límites y nombres: © colaboradores de OpenStreetMap (ODbL). Contacto: MADES (mades.gov.py).',
  parks,
};
await writeFile(OUT, JSON.stringify(data));
console.log(`${parks.length} áreas → ${OUT} (${JSON.stringify(data).length} bytes)`);
console.log(parks.map((p) => p.name).join('; '));
