#!/usr/bin/env node
/**
 * Áreas protegidas de Uruguay (Sistema Nacional de Áreas Protegidas, SNAP) para usar sin conexión:
 * app/public/data/parks-UY.json (se baja aparte, como el de Bolivia).
 *
 * - Lista de las 22 áreas del SNAP: Ministerio de Ambiente (gub.uy/ministerio-ambiente/politicas-y-gestion/es-snap, consultada el 2026-11-16).
 *   El Ministerio no publica los límites (el catálogo de datos abiertos solo trae un indicador de superficie de 2020): los límites y
 *   nombres salen de OpenStreetMap (ODbL), las áreas que coinciden con esa lista. Cuatro no están en OSM (Islas del Queguay, Quebrada de
 *   los Cuervos y Sierras del Yerbal, Humedales e Islas del Hum y Laguna Negra) y quedan afuera hasta que alguien las dibuje.
 * - Contacto: el del Ministerio de Ambiente (2917 3380, Juncal 1385, Montevideo): ningún área publica su propio teléfono.
 * - Sin frecuencias de radio: ninguna se publica.
 * - La base mundial WDPA/Protected Planet se usó solo para comprobar la cantidad (22): nada de ella entra a este archivo.
 *
 * Uso: node tools/emergency-data/parks-uy.mjs   (necesita conexión; el resultado se versiona)
 */

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { centerOf, osmPolygons, simplified } from '../lib/osm-geo.mjs';
import { parksByCountry } from '../lib/osm-local.mjs';

// Con VIKARG_DATA_OUT escribe en la carpeta que sirve el servidor (actualización mensual).
const OUT = process.env.VIKARG_DATA_OUT ? `${process.env.VIKARG_DATA_OUT.replace(/\/$/, '')}/parks-UY.json` : fileURLToPath(new URL('../../app/public/data/parks-UY.json', import.meta.url));

const SNAP_PAGE = 'https://www.gub.uy/ministerio-ambiente/politicas-y-gestion/es-snap';
const EMERGENCY = [{ label: 'Ministerio de Ambiente (Montevideo)', phone: '+598 2917 3380' }];

/** Las 22 áreas del SNAP, como expresiones para reconocer su nombre en OpenStreetMap (sin tildes ni mayúsculas). */
const SNAP = [
  /coronilla/, /rinc[oó]n de franqu[ií]a/, /esteros y algarrobales/, /laguna garz[oó]n/, /humedales de santa luc[ií]a/, /montes del queguay/, /islas del queguay/,
  /grutas del palacio/, /laguna de castillos/, /laguna de rocha/, /chamang[aá]/, /paso centuri[oó]n|sierra de r[ií]os/, /quebrada de los cuervos/, /lunarejo/,
  /cabo polonio/, /farrapos/, /islas? del hum/, /isla de flores/, /isla e islote de lobos|islas? de lobos/, /san miguel/, /arequita/, /laguna negra/,
];

const elements = (
  await parksByCountry('UY', ['nwr["boundary"~"^(protected_area|national_park)$"]["name"]', 'nwr["leisure"="nature_reserve"]["name"]'])
).filter((e) => SNAP.some((re) => re.test((e.tags?.name ?? '').toLowerCase())) && (e.type === 'relation' ? e.members?.length : e.geometry?.length > 3));

const seen = new Set();
const parks = [];
for (const e of elements) {
  const name = e.tags.name;
  if (seen.has(name)) continue;
  seen.add(name);
  const area = simplified(osmPolygons(e), 0.003, 1e-5);
  const at = centerOf(area);
  if (!at) {
    console.warn(`Sin límite: ${name}`);
    continue;
  }
  parks.push({ country: 'UY', name, url: SNAP_PAGE, office: 'Ministerio de Ambiente (SNAP)', address: '', phone: '', phones: '', emergency: EMERGENCY, lat: at.lat, lon: at.lon, area });
}
parks.sort((a, b) => a.name.localeCompare(b.name, 'es'));

const data = {
  generatedAt: new Date().toISOString().slice(0, 10),
  source: 'Límites y nombres: © colaboradores de OpenStreetMap (ODbL). Lista y contacto: Ministerio de Ambiente de Uruguay (SNAP).',
  parks,
};
await writeFile(OUT, JSON.stringify(data));
console.log(`${parks.length} áreas → ${OUT} (${JSON.stringify(data).length} bytes)`);
console.log(parks.map((p) => p.name).join('; '));
