/**
 * Crustáceos y moluscos (cangrejos, camarones, almejas, mejillones…) en el paquete de Pesca: fichas, reglas por jurisdicción y marea
 * roja. Los datos están en `~/vikarg-fishing-work/invertebrados/` (especies.json, reglas.json, marea-roja.json, imagenes.json y las
 * fotos en listas/<id>.webp).
 *
 * Uso suelto (agrega o actualiza la parte de mariscos en el paquete ya armado, sin rehacer los tramos):
 *   node tools/fishing-data/shellfish.mjs ~/vikarg-fishing-work/invertebrados
 * También lo llama build.mjs al armar el paquete completo.
 *
 * Licencias: normas y textos oficiales sin licencia declarada (se usan con atribución); fotos de Wikimedia Commons con la licencia y
 * el autor de cada una.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const read = (f) => JSON.parse(readFileSync(f, 'utf8'));

/** Arma la parte `shellfish` del paquete de pesca y copia las fotos a app/public/fish/. Devuelve null si no hay datos. */
export function buildShellfish(dir) {
  if (!dir || !existsSync(join(dir, 'especies.json'))) return null;
  const species = read(join(dir, 'especies.json')).especies;
  const rules = read(join(dir, 'reglas.json'));
  const tide = read(join(dir, 'marea-roja.json'));
  const credits = existsSync(join(dir, 'imagenes.json')) ? read(join(dir, 'imagenes.json')) : {};
  const out = here('../../app/public/fish/');
  mkdirSync(out, { recursive: true });
  const list = species.map((sp) => {
    const src = join(dir, 'listas', `${sp.id}.webp`);
    let image;
    if (existsSync(src)) {
      image = `shellfish-${sp.id}.webp`;
      copyFileSync(src, join(out, image));
    }
    const c = credits[sp.id];
    return { ...sp, image, imageCredit: c?.file ? { author: c.credit, license: c.license, url: c.url } : undefined };
  });
  // Reglas por especie: cada regla de cada jurisdicción, con su norma (la ficha muestra todas las que la nombran).
  const byJurisdiction = (rules.jurisdicciones ?? []).map((j) => ({
    jurisdiction: j.jurisdiccion,
    rules: (j.reglas ?? []).map((r) => ({ species: r.especies ?? [], topic: r.tema, summary: r.resumen, norm: r.norma, article: r.articulo, date: r.fecha_norma, url: r.url })),
  }));
  return {
    species: list,
    rules: byJurisdiction,
    redTide: {
      text: tide.texto_corto_para_la_app,
      status: (tide.estado_actual_snapshot_2026_11_26 ?? []).map((s) => ({ jurisdiction: s.jurisdiccion, status: s.estado, url: s.fuente, date: s.fecha })),
      agencies: (tide.organismos_y_canales ?? []).map((o) => ({ name: o.organismo, role: o.rol, pages: o.paginas ?? [] })),
      date: tide.fecha,
    },
  };
}

// Uso suelto: agrega la parte de mariscos al paquete ya armado.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dir = process.argv[2];
  const file = here('../../app/public/data/fish-AR.json');
  const data = read(file);
  const sf = buildShellfish(dir);
  if (!sf) {
    console.error('Uso: node tools/fishing-data/shellfish.mjs <carpeta de invertebrados>');
    process.exit(1);
  }
  data.shellfish = sf;
  // Fecha nueva: los teléfonos que ya tienen el paquete ven que hay una versión nueva.
  data.generatedAt = new Date().toISOString().slice(0, 19) + 'Z';
  writeFileSync(file, JSON.stringify(data));
  console.log(`${sf.species.length} crustáceos y moluscos, ${sf.rules.length} jurisdicciones → ${file}`);
}
