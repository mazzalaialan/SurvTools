/**
 * Animales de granja: arma el archivo de fichas que va DENTRO de la app (anda sin descargar nada) y copia las fotos.
 * Datos de trabajo en `~/vikarg-fishing-work/granja/` (especies.json, normas.json, imagenes.json, listas/<id>.webp), investigados con
 * fuente, fecha y confianza por dato. Diseño en docs/GRANJA.md.
 *
 * Uso: node tools/farm-data/build.mjs ~/vikarg-fishing-work/granja
 *
 * Licencias: SENASA y argentina.gob.ar CC BY 2.5 AR; INTA CC BY-NC-SA (solo datos, texto propio); normas sin licencia declarada, con
 * crédito; fotos de Wikimedia Commons con su autor y licencia. Nunca dosis ni medicamentos.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const read = (f) => JSON.parse(readFileSync(f, 'utf8'));
const dir = process.argv[2];
if (!dir || !existsSync(join(dir, 'especies.json'))) {
  console.error('Uso: node tools/farm-data/build.mjs <carpeta de granja>');
  process.exit(1);
}
const sp = read(join(dir, 'especies.json'));
const normas = read(join(dir, 'normas.json'));
const imgs = existsSync(join(dir, 'imagenes.json')) ? read(join(dir, 'imagenes.json')) : [];
const imgList = Array.isArray(imgs) ? imgs : Object.entries(imgs).map(([id, v]) => ({ id, ...v }));

/** Nombre legible de cada dato (las claves de la investigación). */
const LABEL = {
  gallinero_densidad: 'Densidad en el gallinero', caseta_movil: 'Gallinero móvil', parque_patio_m2_por_ave: 'Patio por ave', altura: 'Altura',
  nidales_perchas: 'Nidos y perchas', sombra_reparo: 'Sombra y reparo', luz: 'Luz', depredadores_plagas: 'Depredadores y plagas',
  tipo: 'Qué comen', g_por_dia: 'Cuánto por día', l_por_dia: 'Agua por día', con_calor: 'Con calor', huevos_por_anio: 'Huevos por año',
  inicio_postura: 'Inicio de la postura', peso_faena: 'Peso de faena', edad_faena: 'Edad de faena', carne: 'Carne', incubacion: 'Incubación',
  gestacion: 'Gestación', camada: 'Camada o nidada', destete: 'Destete', epoca: 'Época', vacunas_recomendadas: 'Vacunas',
  desparasitacion: 'Desparasitación', 'señales_alarma': 'Señales de alarma', manejo: 'Manejo', bienestar_animal: 'Bienestar animal',
  higiene: 'Higiene', frio_conservacion: 'Frío y conservación', renspa: 'RENSPA', habilitacion_sanitaria: 'Habilitación sanitaria',
  transito: 'Tránsito', venta: 'Venta', codigo_alimentario: 'Código Alimentario', habilitacion_municipal: 'Municipio', maltrato: 'Maltrato animal', notificacion: 'Notificación',
};
const label = (k) => LABEL[k] ?? (k.charAt(0).toUpperCase() + k.slice(1)).replace(/_/g, ' ');
const item = (x, k) => ({ label: k ? label(k) : undefined, text: x.v, sources: x.fuente?.length ? x.fuente : undefined, confidence: x.confianza });
/** Un bloque: lista de datos ({v, fuente, confianza}) o un objeto de datos con nombre. */
const block = (b) => (Array.isArray(b) ? b.map((x) => item(x)) : b && typeof b === 'object' ? Object.entries(b).filter(([, x]) => x && x.v).map(([k, x]) => item(x, k)) : []);

const BLOCKS = [['razas_comunes_argentina', 'breeds'], ['espacio', 'space'], ['alimento', 'food'], ['agua', 'water'], ['produccion', 'production'], ['cria', 'breeding'], ['sanidad', 'health'], ['zoonosis', 'zoonoses'], ['faena_conservacion', 'slaughter'], ['normativa', 'rules']];
const out = here('../../app/public/farm/');
mkdirSync(out, { recursive: true });
const species = sp.especies.map((s) => {
  const img = imgList.find((i) => i.id === s.id || i.file?.includes(`${s.id}.`));
  let image;
  if (existsSync(join(dir, 'listas', `${s.id}.webp`))) {
    copyFileSync(join(dir, 'listas', `${s.id}.webp`), join(out, `${s.id}.webp`));
    image = `${s.id}.webp`;
  }
  return {
    id: s.id,
    group: s.grupo,
    name: s.nombre,
    image,
    imageCredit: img ? { author: img.credit ?? img.autor, license: img.license ?? img.licencia, url: img.url } : undefined,
    blocks: Object.fromEntries(BLOCKS.map(([k, key]) => [key, block(s[k])]).filter(([, v]) => v.length)),
  };
});
const sources = Object.fromEntries(Object.entries(sp.fuentes_ref).map(([id, f]) => [id, { org: f.organismo, title: f.titulo, url: f.url, date: f.fecha }]));
const rules = normas.normas.map((n) => ({ topic: n.tema, text: n.v, confidence: n.confianza, source: n.fuente ? { org: n.fuente.organismo, url: n.fuente.url, date: n.fuente.fecha } : undefined, contact: n.consultas }));
const file = here('../../app/src/modules/farm/farm-AR.json');
mkdirSync(here('../../app/src/modules/farm/'), { recursive: true });
writeFileSync(file, JSON.stringify({ date: sp.fecha, species, rules, sources }));
console.log(`${species.length} especies, ${rules.length} normas → ${file} (${Math.round(readFileSync(file).length / 1024)} KB)`);
