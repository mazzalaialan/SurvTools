// Catálogo de estaciones de los ríos de Paraguay con coordenadas → app/public/data/rivers-PY.json.
// La tabla de niveles de la DMH (meteorologia.gov.py/nivel-rio/indexconvencional.php) no trae río ni coordenadas, solo un código
// por estación. Las ubicaciones son aproximadas y salen de dos lugares (consultados el 2026-11-16):
//  - las estaciones de la ANNP y del MADES que publica YRATO (Itaipú, hidroinformatica.itaipu.gov.py/yrato/estaciones.geojson, sin licencia declarada);
//  - la localidad según OpenStreetMap (© OpenStreetMap contributors, ODbL), marcada `approx: 'pueblo'`.
// Quedaron afuera las que no se pudieron ubicar (Puerto Ladario, Puerto Tigre, Estación Arirai) y Puerto Antequera (ubicación dudosa).
// Uso: node tools/river-data/paraguay.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../../app/public/data/rivers-PY.json', import.meta.url));

// [código DMH, nombre, río, lat, lon, 'estacion' (YRATO) | 'pueblo' (OpenStreetMap)]
const ROWS = [
  ['2000082002', 'Puerto Murtinho (Brasil)', 'Paraguay', -21.7004, -57.8913, 'estacion'],
  ['2000082003', 'Cáceres (Brasil)', 'Paraguay', -16.0644, -57.6879, 'pueblo'],
  ['2000086009', 'Isla Margarita', 'Paraguay', -21.6888, -57.8884, 'pueblo'],
  ['2000086010', 'Fuerte Olimpo', 'Paraguay', -21.04, -57.87, 'estacion'],
  ['2000086033', 'Bahía Negra', 'Paraguay', -20.2054, -58.1848, 'estacion'],
  ['2000086088', 'Vallemí', 'Paraguay', -22.1759, -57.9611, 'estacion'],
  ['2000086134', 'Concepción', 'Paraguay', -23.4062, -57.4543, 'estacion'],
  ['2000086183', 'Rosario', 'Paraguay', -24.4477, -57.1459, 'estacion'],
  ['2000086211', 'Villeta', 'Paraguay', -25.5045, -57.5694, 'pueblo'],
  ['2000086218', 'Asunción', 'Paraguay', -25.2759, -57.6411, 'estacion'],
  ['2000086219', 'Itá Enramada', 'Paraguay', -25.3539, -57.6394, 'pueblo'],
  ['2000086252', 'Humaitá', 'Paraguay', -27.0649, -58.5148, 'estacion'],
  ['2000086254', 'Alberdi', 'Paraguay', -26.182, -58.1403, 'estacion'],
  ['2000086255', 'Pilar', 'Paraguay', -26.8693, -58.3234, 'estacion'],
  ['2000086210', 'Salto del Guairá', 'Paraná', -24.0617, -54.3056, 'pueblo'],
  ['2000086248', 'Ciudad del Este', 'Paraná', -25.5096, -54.6027, 'estacion'],
  ['2000086253', 'Cerrito', 'Paraná', -27.347, -57.6441, 'estacion'],
  ['2000086257', 'Itá Pirú', 'Paraná', -27.2878, -58.5679, 'estacion'],
  ['2000086258', 'Paso de Patria', 'Paraná', -27.2427, -58.5417, 'pueblo'],
  ['2000086261', 'Ayolas', 'Paraná', -27.41, -56.87, 'estacion'],
  ['2000086263', 'Panchito López', 'Paraná', -27.4007, -57.3276, 'estacion'],
  ['2000086264', 'Coratei', 'Paraná', -27.423, -56.9601, 'estacion'],
  ['2000086288', 'Itá Corá', 'Paraná', -27.236, -58.2123, 'estacion'],
  ['2000086295', 'San Cosme y Damián', 'Paraná', -27.316, -56.3313, 'pueblo'],
  ['2000086297', 'Encarnación', 'Paraná', -27.3463, -55.8695, 'estacion'],
  ['2000086067', 'Pozo Hondo', 'Pilcomayo', -22.3708, -62.5163, 'pueblo'],
  ['2000086262', 'Villa Florida', 'Tebicuary', -26.4041, -57.13, 'estacion'],
];

const data = {
  generatedAt: new Date().toISOString().slice(0, 10),
  source: 'Niveles: Dirección de Meteorología e Hidrología (DMH, Paraguay). Ubicación aproximada: estaciones de la ANNP y el MADES publicadas por YRATO (Itaipú) y, las marcadas «pueblo», OpenStreetMap (© OpenStreetMap contributors, ODbL)',
  stations: ROWS.map(([code, name, river, lat, lon, from]) => ({ code, name, river, lat, lon, approx: from === 'pueblo' })),
};
writeFileSync(OUT, JSON.stringify(data));
console.log(`${data.stations.length} estaciones → ${OUT}`);
