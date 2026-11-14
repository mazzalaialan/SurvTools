// Peso de cada archivo de public/data/, para avisar cuánto se baja al detectar un país nuevo (src/modules/emergency/data-sizes.json),
// y el índice `public/data/index.json` (fecha de generación y peso de cada archivo): con él el teléfono sabe qué archivos guardados
// cambiaron sin bajarlos enteros (src/modules/emergency/dataFile.ts). El servidor arma el suyo (server/src/routes/data.ts).
// Volver a correrlo cuando se regeneren los paquetes: `npm run data-sizes`. Una prueba avisa si quedó desactualizado.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../public/data/', import.meta.url));
const names = readdirSync(dir)
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .sort();
const sizes = Object.fromEntries(names.map((f) => [f, statSync(dir + f).size]));
// `index.json` no cuenta en los pesos (no es un paquete de un país).
writeFileSync(fileURLToPath(new URL('../src/modules/emergency/data-sizes.json', import.meta.url)), JSON.stringify(sizes, null, 1) + '\n');

const dateOf = (f) => {
  try {
    const d = JSON.parse(readFileSync(dir + f, 'utf8'));
    return d && typeof d === 'object' && typeof d.generatedAt === 'string' ? d.generatedAt : '';
  } catch {
    return '';
  }
};
const files = Object.fromEntries(names.map((f) => [f, { date: dateOf(f), bytes: sizes[f] }]));
writeFileSync(dir + 'index.json', JSON.stringify({ files }) + '\n');
console.log(`${names.length} archivos`);
