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
const opt = (f) => (existsSync(join(dir, f)) ? read(join(dir, f)) : null);
// Las especies que se suman después (abejas, peces, burro) vienen en archivos «-extra» con la misma forma.
const sp = read(join(dir, 'especies.json'));
const EXTRA = ['-extra', '-extra2'];
for (const x of EXTRA) {
  const more = opt(`especies${x}.json`);
  if (more) {
    sp.especies.push(...more.especies);
    Object.assign(sp.fuentes_ref, more.fuentes_ref);
  }
}
const normas = read(join(dir, 'normas.json'));
for (const x of EXTRA) normas.normas.push(...(opt(`normas${x}.json`)?.normas ?? []));
const asList = (x) => (!x ? [] : Array.isArray(x) ? x : Object.entries(x).map(([id, v]) => ({ id, ...v })));
const imgList = [...asList(opt('imagenes.json')), ...EXTRA.flatMap((x) => asList(opt(`imagenes${x}.json`)))];

/** Nombre legible de cada dato (las claves de la investigación). */
const LABEL = {
  gallinero_densidad: 'Densidad en el gallinero', caseta_movil: 'Gallinero móvil', parque_patio_m2_por_ave: 'Patio por ave', altura: 'Altura',
  nidales_perchas: 'Nidos y perchas', sombra_reparo: 'Sombra y reparo', luz: 'Luz', depredadores_plagas: 'Depredadores y plagas',
  tipo: 'Qué comen', g_por_dia: 'Cuánto por día', l_por_dia: 'Agua por día', con_calor: 'Con calor', huevos_por_anio: 'Huevos por año',
  inicio_postura: 'Inicio de la postura', peso_faena: 'Peso de faena', edad_faena: 'Edad de faena', carne: 'Carne', incubacion: 'Incubación',
  gestacion: 'Gestación', camada: 'Camada o nidada', destete: 'Destete', epoca: 'Época', vacunas_recomendadas: 'Vacunas',
  desparasitacion: 'Desparasitación', 'señales_alarma': 'Señales de alarma', manejo: 'Manejo', bienestar_animal: 'Bienestar animal',
  higiene: 'Higiene', frio_conservacion: 'Frío y conservación', renspa: 'RENSPA', habilitacion_sanitaria: 'Habilitación sanitaria',
  transito: 'Tránsito', venta: 'Venta', codigo_alimentario: 'Código Alimentario', habilitacion_municipal: 'Municipio', maltrato: 'Maltrato animal', notificacion: 'Notificación', vacunacion_obligatoria: 'Vacunación obligatoria', tuberculosis: 'Tuberculosis',
  garrapata: 'Garrapata', sarna_melofagosis: 'Sarna y melófago', sarna_garrapata: 'Sarna y garrapata', anemia_infecciosa: 'Anemia infecciosa equina',
  triquinosis: 'Triquinosis', identificacion: 'Identificación', dte: 'DT-e (documento de tránsito)', marcas_y_senales: 'Marcas y señales',
  plan_vacunacion_obligatorio: 'Plan de vacunación obligatorio', leche_cruda: 'Leche cruda', triquinosis_obligatoria: 'Análisis de triquinosis',
  faena_equidos: 'Faena de équidos', analisis_triquinosis: 'Análisis de triquinosis', plumas: 'Plumas', lana: 'Lana o fibra',
  leche_por_dia: 'Leche por día', lechones_por_camada: 'Lechones por camada', trabajo: 'Trabajo',
};
const label = (k) => LABEL[k] ?? (k.charAt(0).toUpperCase() + k.slice(1)).replace(/_/g, ' ');
const item = (x, k) => ({ label: k ? label(k) : undefined, text: x.v, sources: x.fuente?.length ? x.fuente : undefined, confidence: x.confianza });
/** Un bloque: lista de datos ({v, fuente, confianza}) o un objeto de datos con nombre. */
const block = (b) =>
  Array.isArray(b)
    ? b.filter((x) => x && x.v).map((x) => item(x))
    : b && typeof b === 'object'
      ? Object.entries(b).flatMap(([k, x]) => (Array.isArray(x) ? x.filter((y) => y && y.v).map((y) => item(y, k)) : x && x.v ? [item(x, k)] : []))
      : [];
/** Texto de un aviso (cadena o dato {v}). */
const txt = (x) => (typeof x === 'string' ? x : x?.v);

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
    // Aviso legal que se muestra fijo arriba de la ficha (ñandú: fauna silvestre; camélidos: guanaco y vicuña; pavo: no mezclar con gallinas).
    warning: txt(s.aviso_fijo),
    survivalLaw: txt(s.supervivencia_ley),
    blocks: Object.fromEntries(BLOCKS.map(([k, key]) => [key, block(s[k])]).filter(([, v]) => v.length)),
  };
});
const sources = Object.fromEntries(Object.entries(sp.fuentes_ref).map(([id, f]) => [id, { org: f.organismo, title: f.titulo, url: f.url, date: f.fecha }]));
const rules = normas.normas.map((n) => ({ topic: n.tema, text: n.v, confidence: n.confianza, source: n.fuente ? { org: n.fuente.organismo, url: n.fuente.url, date: n.fuente.fecha } : undefined, contact: n.consultas }));
// Dónde se crían: existencias oficiales por departamento (SENASA 2019, colmenas RENAPA 2026; código INDEC → nombre del IGN, como en
// los mapas de Fauna) o por provincia (CNA 2018 del INDEC, acuicultura 2023), y una frase de clima y zona apta.
const ex = opt('existencias/resumen.json');
const clima = opt('existencias/clima.json') ?? {};
const ignFile = join(dir, '..', 'fauna', 'ign', 'departamentos-simple.json');
const byCode = {};
if (existsSync(ignFile)) for (const [prov, list] of Object.entries(read(ignFile).provinces)) for (const d of list) byCode[d.id] = { prov, name: d.name };
const { PROVINCE_CODE } = await import('../fauna-data/departments.mjs').catch(() => ({ PROVINCE_CODE: {} }));
const provName = (code) => PROVINCE_CODE[code] ?? PROVINCE_CODE[Number(code)];
const missing = new Set();
for (const s of species) {
  const e = ex?.especies?.[s.id];
  // Los movimientos de animales (codorniz, ñandú, alpaca) no son existencias y cubren pocos lugares: no se dibujan.
  if (e && (e.nivel === 'departamento' || e.nivel === 'provincia') && e.datos?.length && !/^\d{4}-\d{4}$/.test(String(e.anio))) {
    const src = ex.fuentes.find((f) => f.id === e.fuente);
    const data = {};
    for (const r of e.datos) {
      if (!r.cantidad) continue;
      if (e.nivel === 'departamento') {
        // Chascomús cambió de código al crearse Lezama (2009): SENASA usa el viejo.
        const code = String(r.codigo_indec).padStart(5, '0');
        const d = byCode[code] ?? byCode[{ '06217': '06218' }[code]] ?? Object.values(byCode).find((x) => code === '06217' && x.name === 'Chascomús');
        if (!d) {
          missing.add(`${r.provincia} / ${r.departamento} (${r.codigo_indec})`);
          continue;
        }
        (data[d.prov] ??= {})[d.name] = ((data[d.prov] ?? {})[d.name] ?? 0) + r.cantidad;
      } else {
        const p = provName(String(r.codigo_indec).padStart(2, '0')) ?? r.provincia;
        data[p] = (data[p] ?? 0) + r.cantidad;
      }
    }
    s.range = { level: e.nivel === 'departamento' ? 'dept' : 'prov', year: e.anio, unit: e.unidad, source: src ? { org: src.organismo, url: src.url, date: src.fecha } : undefined, data };
  }
  const c = clima[s.id];
  if (c?.v) s.climate = { text: c.v, confidence: c.confianza, sources: Array.isArray(c.fuente) ? c.fuente : c.fuente ? [typeof c.fuente === 'string' ? c.fuente : c.fuente.organismo] : undefined };
}
if (missing.size) console.warn(`Departamentos sin equivalente en el IGN (${missing.size}): ${[...missing].slice(0, 15).join('; ')}`);
const file = here('../../app/src/modules/farm/farm-AR.json');
mkdirSync(here('../../app/src/modules/farm/'), { recursive: true });
writeFileSync(file, JSON.stringify({ date: sp.fecha, species, rules, sources }));
console.log(`${species.length} especies, ${rules.length} normas → ${file} (${Math.round(readFileSync(file).length / 1024)} KB)`);
