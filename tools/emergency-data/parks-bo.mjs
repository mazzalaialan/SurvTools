#!/usr/bin/env node
/**
 * Áreas protegidas nacionales de Bolivia (SERNAP) para usar sin conexión:
 * app/public/data/parks-BO.json (se baja aparte, como el de Chile).
 *
 * - Límites y nombres: OpenStreetMap (ODbL), las áreas con operador SERNAP.
 *   El SERNAP no publica una descarga de límites (solo un atlas en PDF).
 * - Contacto: el del SERNAP en La Paz (sernap.gob.bo, "Lista de direcciones"):
 *   ninguna área publica su propio teléfono ni OpenStreetMap lo trae.
 * - Sin frecuencias de radio: ninguna se publica.
 *
 * Uso: node tools/emergency-data/parks-bo.mjs   (necesita conexión; el resultado se versiona)
 */

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { centerOf, osmPolygons, simplified } from '../lib/osm-geo.mjs';
import { parksByCountry } from '../lib/osm-local.mjs';

// Con VIKARG_DATA_OUT escribe en la carpeta que sirve el servidor (actualización mensual).
const OUT = process.env.VIKARG_DATA_OUT ? `${process.env.VIKARG_DATA_OUT.replace(/\/$/, '')}/parks-BO.json` : fileURLToPath(new URL('../../app/public/data/parks-BO.json', import.meta.url));

/** Datos del SERNAP (sernap.gob.bo, leídos el 2026-11-08). */
const SERNAP_PAGE = 'https://www.sernap.gob.bo/';
const EMERGENCY = [
  { label: 'SERNAP (sede central, La Paz)', phone: '+591 2 2426304' },
  { label: 'SERNAP: línea gratuita', phone: '+591 2 2116169' },
];

const elements = await parksByCountry('BO', ['relation["boundary"~"^(protected_area|national_park)$"]["operator"~"SERNAP|Servicio Nacional de Áreas Protegidas",i]']);

const parks = [];
for (const e of elements) {
  const name = e.tags?.name;
  if (!name) continue;
  // Tolerancia más gruesa que la de Chile (≈ 330 m): son áreas enormes (Madidi, TIPNIS) y se miran de lejos.
  const area = simplified(osmPolygons(e), 0.003, 1e-5);
  const at = centerOf(area);
  if (!at) {
    console.warn(`Sin límite: ${name}`);
    continue;
  }
  parks.push({
    country: 'BO',
    name,
    // Siempre la portada: las páginas por área (sernap.gob.bo/amboro/…) daban 404 en la revisión del 2026-11-16 (el sitio se rediseñó).
    url: SERNAP_PAGE,
    office: 'SERNAP',
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
  source: 'Límites y nombres: © colaboradores de OpenStreetMap (ODbL). Contacto: SERNAP (sernap.gob.bo).',
  parks,
};
await writeFile(OUT, JSON.stringify(data));
console.log(`${parks.length} áreas → ${OUT} (${JSON.stringify(data).length} bytes)`);
console.log(parks.map((p) => p.name).join('; '));
