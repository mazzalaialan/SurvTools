#!/usr/bin/env node
/**
 * Geología de Uruguay, base nacional para usar sin conexión: app/public/data/geology-UY.json.
 *
 * Fuente: Loureiro Olivet, J.; Sánchez Bettucci, L.; Núñez Demarco, P.; Peel, E.; Fort, S. y Preciozzi, F. (2024),
 * «Actualización de la Carta Geológica del Uruguay a escala 1:500.000», MIEM-DINAMIGE, Revista Investigaciones 5(1).
 * Estado de la licencia: publicada en gub.uy SIN licencia declarada; se usa citando la fuente (política de datos del proyecto).
 * La página pide escribir a la autora para el mapa en alta definición: NO se escribió a nadie; se usa solo el PDF público.
 * Archivos: carta2024.pdf (1 hoja de 3117,74 x 3543 pt, ArcMap 10.8, WGS84 UTM 21S, factor de escala 0,9996) y columna2024.pdf
 * (columna estratigráfica con nombres, códigos y edades). Se bajan de la página de la revista (gub.uy, MIEM) y se pasan por argumento.
 *
 * El PDF NO trae polígonos vectoriales: el relleno geológico es un ráster de 77 bandas (JPEG/PNG de 2977 x 41 px, 1 px = 1 pt =
 * ~176 m) y por encima van líneas y textos vectoriales. Por eso el método es ráster -> vector:
 *   1. pdfimages (poppler) saca las bandas y Python 3 + Pillow las apila en el orden y la posición que declara el PDF.
 *   2. Máscara del país: la hoja renderizada con pdftoppm (72 dpi); lo que es fondo gris del marco u océano/Río de la Plata queda
 *      afuera (el ráster extiende el color más allá de la frontera: lo oculta el PDF con máscaras que pdfimages no entrega).
 *   3. Se le pasa un filtro de mediana 5x5 (borra los achurados y las líneas finas) y cada píxel se asigna al color de leyenda más
 *      cercano (PALETA, medida en los cuadritos de columna2024.pdf). Las unidades que comparten el mismo color de leyenda
 *      (p. ej. Dolores y Libertad) se juntan en un solo grupo con ambos nombres: el mapa no permite separarlas.
 *   4. Grilla de celdas de 3 x 3 px (~530 m), contornos de cada clase (anillos y huecos), georreferencia y Douglas-Peucker.
 * Georreferencia: los rótulos del propio mapa dan x = 381,5 + (E - 400000) / 176,33 pt (rótulos 400.000...800.000 del marco) y
 * y = 38078 - N / 176,33 pt (ajustada con los rótulos 30°S...35°S de ambos costados, error < 1 pt); (E, N) -> lon/lat con UTM
 * inversa propia (WGS84, zona 21 sur, meridiano central 57°O, k0 = 0,9996, sin librerías).
 * Edades por el código de la unidad (Q = Cuaternario, N = Neógeno, E = Paleógeno, K = Cretácico, J = Jurásico, T = Triásico,
 * P = Pérmico, C = Carbonífero, D = Devónico, NP = Neoproterozoico, PP = Paleoproterozoico, NA/PA = Arqueano); la litología
 * resume la descripción de la columna. Es un producto de calidad media: la asignación de cada mancha a su unidad se hizo por color.
 *
 * Requisitos: node, python3 con Pillow, poppler-utils (pdfimages, pdftoppm).
 * Uso: node tools/geology-data/build-uy.mjs carta2024.pdf [directorio-de-trabajo]   (el resultado se versiona)
 */
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { ringArea, simplifyRing, inRing } from '../lib/osm-geo.mjs';
import { periodColor } from './periods.mjs';

const OUT = fileURLToPath(new URL('../../app/public/data/geology-UY.json', import.meta.url));
const PDF = process.argv[2];
const WORK = process.argv[3] || '/tmp/geo-uy-build';
if (!PDF) throw new Error('Uso: node build-uy.mjs carta2024.pdf [directorio-de-trabajo]');
const SOURCE = 'Loureiro et al. (2024), Actualización de la Carta Geológica del Uruguay 1:500.000, MIEM-DINAMIGE, Revista Investigaciones 5(1); sin licencia declarada, se cita la fuente';
const CELL = 3; // px por celda de la grilla
const TOL = Number(process.env.TOL || 0.008); // Douglas-Peucker, en grados (~600 m)
const MIN_AREA = Number(process.env.MIN_AREA || 6e-5); // grados cuadrados (~0,7 km2 por 1e-4 grados cuadrados: 6e-5 son ~0,7 km2)

// [código, nombre, litología, desde (más antigua), hasta (más joven), RGB del cuadrito de leyenda]
const U = [
  ['Q2_a', 'Depósitos actuales', 'Sedimentos limo-arcillosos, arenosos y arenoconglomerádicos; playas, dunas, esteros y bañados', 'Holoceno', 'Holoceno', [252, 252, 220]],
  ['Q2_vs', 'Formación Villa Soriano', 'Arenas y gravas con lechos de cantos, arcillas y limos; depósitos marinos y litorales', 'Pleistoceno', 'Holoceno', [252, 232, 172]],
  ['Q1_d', 'Formación Dolores', 'Limolitas y areniscas finas micáceas, estratificadas', 'Pleistoceno', 'Pleistoceno', [212, 176, 104]],
  ['Q1_ch', 'Formación Chuy', 'Arenas y arenas arcillosas finas a medias; sedimentación marina', 'Pleistoceno', 'Pleistoceno', [224, 184, 112]],
  ['Q1_la', 'Formación Las Arenas', 'Arenas finas y medias de selección regular, con gravillas y gravas', 'Pleistoceno', 'Pleistoceno', [204, 168, 100]],
  ['Q1_li', 'Formación Libertad', 'Lodolitas, loess y fangolitas, limo-arcillitas y limos loéssicos', 'Pleistoceno', 'Pleistoceno', [212, 176, 104]],
  ['N2_r', 'Formación Raigón', 'Areniscas finas a conglomerádicas, arcillosas; sedimentación fluvial', 'Plioceno', 'Pleistoceno', [252, 252, 176]],
  ['N2_s', 'Formación Salto', 'Areniscas finas a medias, rojizas, con niveles pelíticos y conglomerádicos', 'Plioceno', 'Plioceno', [252, 252, 84]],
  ['N2_pp', 'Formación Paso del Puerto', 'Areniscas y arenas finas a gruesas, mal seleccionadas, con arcillas y limolitas verdes', 'Plioceno', 'Plioceno', [252, 252, 0]],
  ['N1_c', 'Formación Camacho', 'Areniscas muy finas y finas, loéssicas, con fangolitas y niveles conglomerádicos', 'Mioceno', 'Mioceno', [228, 228, 0]],
  ['E3_fb', 'Formación Fray Bentos', 'Areniscas muy finas, loessitas y fangolitas, con niveles conglomerádicos', 'Oligoceno', 'Oligoceno', [252, 208, 188]],
  ['E1_pn', 'Suite Pepe Núñez', 'Plugs subvolcánicos alcalinos de naturaleza ultramáfica', 'Paleoceno', 'Paleoceno', [136, 112, 68]],
  ['K2-E1_a', 'Formación Asencio', 'Areniscas y conglomerados; sucesión sedimentaria rojiza con procesos de silicificación', 'Cretácico', 'Paleoceno', [232, 204, 152]],
  ['K2_m', 'Formación Mercedes', 'Areniscas y conglomerados polimícticos moderadamente seleccionados, areniscas con cemento calcáreo', 'Cretácico', 'Cretácico', [168, 228, 48]],
  ['K2_g', 'Formación Guichón', 'Areniscas finas a medias, bien seleccionadas, de color rosado', 'Cretácico', 'Cretácico', [208, 252, 112]],
  ['K1_mi', 'Formación Migues', 'Areniscas y limolitas rojizas, sedimentos continentales', 'Cretácico', 'Cretácico', [128, 196, 0]],
  ['K1_c', 'Formación Cuaró', 'Basaltos toleíticos con estructura en coladas', 'Cretácico', 'Cretácico', [0, 168, 132]],
  ['J3-K1_a', 'Formación Arapey', 'Basaltos toleíticos en coladas con intercalaciones de areniscas eólicas', 'Jurásico', 'Cretácico', [124, 232, 176]],
  ['J3_t', 'Formación Tacuarembó', 'Areniscas eólicas rojizas finas a medias, bien seleccionadas, con estratificación cruzada', 'Jurásico', 'Jurásico', [28, 152, 160]],
  ['J3_rb', 'Dacitas de Río Branco', 'Basaltos toleíticos y dacitas en derrames subhorizontales', 'Jurásico', 'Jurásico', [0, 132, 168]],
  ['T1_bv', 'Formación Buena Vista', 'Areniscas, limolitas y conglomerados; sedimentación continental fluvio-eólica', 'Triásico', 'Triásico', [164, 68, 156]],
  ['P1_y', 'Formación Yaguarí', 'Areniscas finas a medias rojizas, lutitas negras y pardas con intercalaciones conglomerádicas', 'Pérmico', 'Pérmico', [248, 164, 148]],
  ['P1_pa-m', 'Formaciones Paso Aguiar y Mangrullo', 'Limolitas y areniscas muy finas, arcillosas, lutitas pirobituminosas y areniscas calcáreas', 'Pérmico', 'Pérmico', [252, 148, 148]],
  ['P1_fm', 'Formación Fraile Muerto', 'Limolitas y areniscas finas, areniscas de color rojizo', 'Pérmico', 'Pérmico', [252, 124, 124]],
  ['P1_ti', 'Formación Tres Islas', 'Areniscas finas a medias con estratificación cruzada, niveles pelíticos y conglomerádicos', 'Pérmico', 'Pérmico', [204, 100, 100]],
  ['C2_P1_sg', 'Formación San Gregorio', 'Diamictitas, limolitas, areniscas y conglomerados; depósitos glaciales y fluvioglaciales', 'Carbonífero', 'Pérmico', [204, 212, 196]],
  ['D1_lp', 'Formación La Paloma', 'Areniscas rojizas, conglomerados y pelitas; ambiente fluvial y marino somero', 'Devónico', 'Devónico', [176, 120, 8]],
  ['D1_co', 'Formación Cordobés', 'Lutitas, limolitas y areniscas finas fosilíferas; plataforma marina', 'Devónico', 'Devónico', [168, 112, 0]],
  ['D1_ce', 'Formación Cerrezuelo', 'Areniscas de colores variados, cuarzo-feldespáticas, con conglomerados y arcillitas', 'Devónico', 'Devónico', [168, 112, 0]],
  ['NP3_gp4', 'Granito Santa Teresa', 'Granitos', 'Neoproterozoico', 'Neoproterozoico', [140, 176, 16]],
  ['NP3_bn', 'Formación Barriga Negra', 'Conglomerados, areniscas, lutitas y rocas volcánicas', 'Neoproterozoico', 'Neoproterozoico', [252, 48, 20]],
  ['NP3_pa', 'Formación Piedras de Afilar', 'Areniscas, pelitas y conglomerados metamorfizados', 'Neoproterozoico', 'Neoproterozoico', [252, 156, 56]],
  ['NP3_pv', 'Grupo Playa Verde', 'Metasedimentos y metavulcanitas de bajo grado', 'Neoproterozoico', 'Neoproterozoico', [252, 132, 0]],
  ['NP3_csa4', 'Complejo Sierra de las Ánimas (indiferenciado)', 'Rocas volcánicas y plutónicas ácidas', 'Neoproterozoico', 'Neoproterozoico', [252, 108, 36]],
  ['NP3_csa3', 'Formaciones El Tambo y Piriápolis', 'Rocas volcánicas y plutónicas ácidas', 'Neoproterozoico', 'Neoproterozoico', [252, 84, 0]],
  ['NP3_csa2', 'Formación Pan de Azúcar', 'Granitos, sienitas y riolitas', 'Neoproterozoico', 'Neoproterozoico', [252, 84, 0]],
  ['NP3_csa1', 'Formaciones Las Flores y El Ombú', 'Rocas volcánicas y subvolcánicas', 'Neoproterozoico', 'Neoproterozoico', [216, 72, 0]],
  ['NP3_zc', 'Zonas de cizalla brasilianas', 'Milonitas y rocas de zonas de cizalla', 'Neoproterozoico', 'Neoproterozoico', [252, 48, 0]],
  ['NP3_sr', 'Formación Sierra de los Ríos', 'Rocas volcánicas y subvolcánicas ácidas', 'Neoproterozoico', 'Neoproterozoico', [252, 100, 12]],
  ['NP3_cc', 'Unidad Cerro Catedral', 'Rocas volcánicas y subvolcánicas ácidas', 'Neoproterozoico', 'Neoproterozoico', [252, 100, 12]],
  ['NP3_gt2', 'Granitoides tardíos a postectónicos', 'Granitos', 'Neoproterozoico', 'Neoproterozoico', [252, 156, 12]],
  ['NP3_gm3', 'Granitoides miloníticos', 'Granitoides milonitizados', 'Neoproterozoico', 'Neoproterozoico', [228, 152, 0]],
  ['NP3_gs1', 'Granitoides sintectónicos e indiferenciados', 'Granitoides', 'Neoproterozoico', 'Neoproterozoico', [232, 152, 0]],
  ['NP3_l1', 'Formación Fuente del Puma (Grupo Lavalleja)', 'Rocas metavolcánicas y metasedimentarias de bajo grado', 'Neoproterozoico', 'Neoproterozoico', [252, 100, 0]],
  ['NP3_l2', 'Formación Minas (Grupo Lavalleja)', 'Metacalizas y metapelitas', 'Neoproterozoico', 'Neoproterozoico', [252, 100, 0]],
  ['NP3_l3', 'Formación Zanja del Tigre (Grupo Lavalleja)', 'Rocas metavolcánicas y metasedimentarias', 'Neoproterozoico', 'Neoproterozoico', [228, 76, 0]],
  ['NP3_sp', 'Formación San Pablo', 'Rocas metasedimentarias de bajo grado', 'Neoproterozoico', 'Neoproterozoico', [252, 132, 12]],
  ['NP3_sa', 'Formación Sierra de Aguirre', 'Rocas volcánicas y volcanosedimentarias ácidas', 'Neoproterozoico', 'Neoproterozoico', [252, 84, 0]],
  ['NP3_r', 'Formación Rocha', 'Metasedimentos (metareniscas y metapelitas)', 'Neoproterozoico', 'Neoproterozoico', [252, 132, 12]],
  ['NP3_pd', 'Complejo Paso del Dragón', 'Rocas metamórficas de facies anfibolita', 'Neoproterozoico', 'Neoproterozoico', [252, 160, 4]],
  ['NP1_co4', 'Complejo Cerro Olivo (indiferenciado)', 'Gneises, migmatitas y anfibolitas', 'Neoproterozoico', 'Neoproterozoico', [252, 168, 0]],
  ['NP1_co2', 'Unidad Centinela', 'Granitoides leucocráticos', 'Neoproterozoico', 'Neoproterozoico', [252, 168, 0]],
  ['NP1_co1', 'Unidades Chafalote y Cerro Bori', 'Ortogneises', 'Neoproterozoico', 'Neoproterozoico', [252, 168, 0]],
  ['NP_mp', 'Migmatitas Parao', 'Migmatitas', 'Neoproterozoico', 'Neoproterozoico', [252, 132, 0]],
  ['PP2_g1', 'Granitoides tardíos a postectónicos transplatenses', 'Granitos', 'Paleoproterozoico', 'Paleoproterozoico', [212, 0, 68]],
  ['PP2_g2', 'Granitoides sintectónicos transplatenses', 'Granitoides', 'Paleoproterozoico', 'Paleoproterozoico', [196, 0, 64]],
  ['PP2_ag', 'Formación Arroyo Grande', 'Metasedimentos y metavolcanitas en facies esquistos verdes', 'Paleoproterozoico', 'Paleoproterozoico', [252, 44, 56]],
  ['PP2_ps', 'Formación Paso Severino', 'Rocas metavolcánicas y metasedimentarias', 'Paleoproterozoico', 'Paleoproterozoico', [244, 60, 140]],
  ['PP2_sju', 'Formación Cerros de San Juan', 'Mármoles, cuarcitas y rocas metasedimentarias', 'Paleoproterozoico', 'Paleoproterozoico', [244, 52, 96]],
  ['PP2_sjo', 'Formación San José', 'Esquistos, anfibolitas, metapelitas y cuarcitas', 'Paleoproterozoico', 'Paleoproterozoico', [216, 4, 112]],
  ['PP2_m', 'Formación Montevideo', 'Gneises y anfibolitas', 'Paleoproterozoico', 'Paleoproterozoico', [252, 0, 196]],
  ['PP2_cc6', 'Complejo Casupá: granitoides', 'Granitoides', 'Paleoproterozoico', 'Paleoproterozoico', [252, 156, 220]],
  ['PP2_cc5', 'Complejo Casupá: ortoanfibolitas de Berrondo', 'Ortoanfibolitas', 'Paleoproterozoico', 'Paleoproterozoico', [252, 140, 216]],
  ['PP2_cc4', 'Complejo Casupá: ortogneises Punta Espinillo', 'Ortogneises', 'Paleoproterozoico', 'Paleoproterozoico', [252, 148, 216]],
  ['PP2_cc3', 'Complejo Casupá: ortogneises Punta Carretas', 'Ortogneises', 'Paleoproterozoico', 'Paleoproterozoico', [252, 188, 232]],
  ['PP2_cc2', 'Complejo Casupá: migmatitas de Suárez', 'Migmatitas', 'Paleoproterozoico', 'Paleoproterozoico', [252, 160, 220]],
  ['PP2_cc1', 'Complejo Casupá (indiferenciado)', 'Gneises graníticos y migmatitas', 'Paleoproterozoico', 'Paleoproterozoico', [252, 188, 232]],
  ['PP_mc', 'Formación Minas de Corrales', 'Rocas metasedimentarias y metavolcánicas', 'Paleoproterozoico', 'Paleoproterozoico', [240, 4, 124]],
  ['PP_vi', 'Formación Vichadero', 'Rocas metavolcánicas y metasedimentarias', 'Paleoproterozoico', 'Paleoproterozoico', [252, 128, 164]],
  ['PP_va', 'Formación Valentines', 'Granulitas, gneises y migmatitas', 'Paleoproterozoico', 'Paleoproterozoico', [252, 80, 128]],
  ['NA-PP_cvr', 'Complejo Valentines-Rivera', 'Rocas metamórficas de alto grado (granulitas y gneises)', 'Arqueano', 'Paleoproterozoico', [252, 104, 124]],
  ['NA_lt', 'Complejo Las Tetas', 'Rocas metamórficas arqueanas (gneises y anfibolitas)', 'Arqueano', 'Arqueano', [168, 0, 228]],
  ['PA-NA_lc', 'Complejo La China', 'Rocas metamórficas arqueanas', 'Arqueano', 'Arqueano', [132, 0, 168]],
];

// Grupos por color (mismo cuadrito de leyenda = indistinguibles en el mapa).
const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const groups = [];
for (const u of U) {
  let g = groups.find((x) => dist2(x.rgb, u[5]) <= 12 * 12);
  if (!g) groups.push((g = { rgb: u[5], members: [] }));
  g.members.push(u);
}
const joinUniq = (arr) => [...new Set(arr)].join('; ');
const groupUnit = (g) => {
  const ms = g.members;
  const names = ms.map((m) => m[1]);
  const name = names.length <= 3 ? names.join(' / ') : `${names.slice(0, 2).join(' / ')} y otras (${ms.length} unidades)`;
  const ages = ms.flatMap((m) => [m[3], m[4]]);
  const order = ['Arqueano', 'Paleoproterozoico', 'Mesoproterozoico', 'Neoproterozoico', 'Cámbrico', 'Ordovícico', 'Silúrico', 'Devónico', 'Carbonífero', 'Pérmico', 'Triásico', 'Jurásico', 'Cretácico', 'Paleoceno', 'Eoceno', 'Oligoceno', 'Mioceno', 'Plioceno', 'Pleistoceno', 'Holoceno'];
  const sorted = [...new Set(ages)].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const from = sorted[0], to = sorted[sorted.length - 1];
  return { name, litho: joinUniq(ms.map((m) => m[2])).slice(0, 200), from, to, color: periodColor(to || from) };
};

// 1) Ráster -> grilla de clases (Python + Pillow + poppler)
await mkdir(WORK, { recursive: true });
const PY = String.raw`
import sys, os, json, subprocess
from PIL import Image, ImageFilter, ImageDraw
pdf, work, cell = sys.argv[1], sys.argv[2], int(sys.argv[3])
pal = json.load(open(os.path.join(work, 'palette.json')))
img = os.path.join(work, 'img'); os.makedirs(img, exist_ok=True)
subprocess.run(['pdfimages', '-all', pdf, os.path.join(img, 'i')], check=True)
subprocess.run(['pdftoppm', '-r', '72', '-png', pdf, os.path.join(work, 'r72')], check=True)
X0, Y0, W, H = 73.917836, 113.43, 2977, 3306
canvas = Image.new('RGB', (W, H), (242, 242, 242))
for k in list(range(3, 80)) + [81]:
    fn = None
    for ext in ('jpg', 'png'):
        f = os.path.join(img, 'i-%03d.%s' % (k, ext))
        if os.path.exists(f): fn = f
    im = Image.open(fn).convert('RGB')
    ty = 275.176384 + (k - 3) * 40.3166 if k != 81 else 3419.043205
    top = round(ty - 40.8 - Y0)
    canvas.paste(im.resize((W, 41), Image.BOX), (0, top))
r = Image.open(os.path.join(work, 'r72-1.png')).convert('RGB'); rp = r.load()
mask = Image.new('L', (W, H), 0); mp = mask.load()
for y in range(H):
    for x in range(W):
        if x > 2100 and y < 700: continue
        p = rp[x + 74, y + 113]
        gris = abs(p[0] - 242) < 5 and abs(p[1] - 242) < 5 and abs(p[2] - 242) < 5
        mar = abs(p[0] - 191) < 6 and abs(p[1] - 210) < 6 and p[2] > 248
        if not (gris or mar): mp[x, y] = 255
mask = mask.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
ImageDraw.floodfill(mask, (1000, 1500), 128)
mask = mask.point(lambda v: 255 if v == 128 else 0)
ImageDraw.Draw(mask).rectangle((2300, 3135, W, H), fill=0)
gm = canvas.filter(ImageFilter.MedianFilter(5)); gp = gm.load()
cache = {}
def cls(p):
    k = (p[0] // 4, p[1] // 4, p[2] // 4)
    v = cache.get(k)
    if v is None:
        best, bd = 0, 60 * 60 + 1
        for i, c in enumerate(pal):
            d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2
            if d < bd: best, bd = i + 1, d
        v = cache[k] = best
    return v
lab = Image.new('L', (W, H), 0); lp = lab.load(); mp = mask.load()
for y in range(H):
    for x in range(W):
        if mp[x, y]:
            p = gp[x, y]
            if min(p) >= 236: continue
            lp[x, y] = cls(p)
lab = lab.filter(ImageFilter.ModeFilter(5))
GW, GH = W // cell, H // cell
mk = mask.resize((GW, GH), Image.BOX).point(lambda v: 255 if v >= 128 else 0)
out = bytearray(GW * GH); lp = lab.load(); mkp = mk.load()
for gy in range(GH):
    for gx in range(GW):
        out[gy * GW + gx] = lp[gx * cell + cell // 2, gy * cell + cell // 2] if mkp[gx, gy] else 255
open(os.path.join(work, 'grid.bin'), 'wb').write(out)
print(GW, GH)
`;
await writeFile(join(WORK, 'palette.json'), JSON.stringify(groups.map((g) => g.rgb)));
await writeFile(join(WORK, 'raster.py'), PY);
// REUSE=1 reaprovecha la grilla ya calculada (solo para probar tolerancias)
const reuse = process.env.REUSE && existsSync(join(WORK, 'grid.bin'));
const dims = reuse ? [Math.floor(2977 / CELL), Math.floor(3306 / CELL)] : execFileSync('python3', ['-I', join(WORK, 'raster.py'), PDF, WORK, String(CELL)], { encoding: 'utf8', maxBuffer: 1 << 26 }).trim().split(/\s+/).map(Number);
const [GW, GH] = dims;
const grid = new Uint8Array(await readFile(join(WORK, 'grid.bin')));

// 2) Relleno de celdas sin clase (blancos, textos, bordes) con la clase vecina más cercana
{
  let q = [];
  for (let i = 0; i < grid.length; i++) if (grid[i] > 0 && grid[i] < 255) q.push(i);
  while (q.length) {
    const nq = [];
    for (const i of q) {
      const x = i % GW, y = (i / GW) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
        const j = ny * GW + nx;
        if (grid[j] === 0) { grid[j] = grid[i]; nq.push(j); }
      }
    }
    q = nq;
  }
}

// 3) Georreferencia: celda (vx, vy) -> pt de la hoja -> UTM 21S -> lon/lat
const A = 6378137.0, F = 1 / 298.257223563, K0 = 0.9996;
const E2 = F * (2 - F), EP2 = E2 / (1 - E2);
function utmInv(E, N) {
  const x = E - 500000, y = N - 1e7, M = y / K0;
  const mu = M / (A * (1 - E2 / 4 - 3 * E2 ** 2 / 64 - 5 * E2 ** 3 / 256));
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
  const phi1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu) + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const s = Math.sin(phi1), c = Math.cos(phi1), t = Math.tan(phi1);
  const N1 = A / Math.sqrt(1 - E2 * s * s), T1 = t * t, C1 = EP2 * c * c;
  const R1 = A * (1 - E2) / (1 - E2 * s * s) ** 1.5, D = x / (N1 * K0);
  const lat = phi1 - (N1 * t / R1) * (D ** 2 / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * EP2) * D ** 4 / 24 + (61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * EP2 - 3 * C1 ** 2) * D ** 6 / 720);
  const lon = (D - (1 + 2 * T1 + C1) * D ** 3 / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * EP2 + 24 * T1 ** 2) * D ** 5 / 120) / c;
  return [-57 + lon * 180 / Math.PI, lat * 180 / Math.PI];
}
const S = 100000 / 567.1; // m por pt
const toLonLat = (vx, vy) => {
  const px = 73.917836 + CELL * vx, py = 113.43 + CELL * vy;
  return utmInv(400000 + (px - 381.5) * S, (38078 - py) * S);
};

// 4) Contornos por clase
const VW = GW + 1;
function ringsOf(cls) {
  const out = new Map(); // vértice -> aristas salientes [x2, y2, usada]
  const add = (x1, y1, x2, y2) => { const k = y1 * VW + x1; (out.get(k) || out.set(k, []).get(k)).push([x2, y2, false]); };
  const is = (x, y) => x >= 0 && y >= 0 && x < GW && y < GH && grid[y * GW + x] === cls;
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    if (!is(x, y)) continue;
    if (!is(x, y - 1)) add(x, y, x + 1, y);
    if (!is(x + 1, y)) add(x + 1, y, x + 1, y + 1);
    if (!is(x, y + 1)) add(x + 1, y + 1, x, y + 1);
    if (!is(x - 1, y)) add(x, y + 1, x, y);
  }
  const rings = [];
  for (const [k0, list] of out) {
    for (const e0 of list) {
      if (e0[2]) continue;
      const sx = k0 % VW, sy = (k0 / VW) | 0;
      const ring = [[sx, sy]];
      let cx = sx, cy = sy, e = e0;
      for (;;) {
        e[2] = true;
        const dx = e[0] - cx, dy = e[1] - cy;
        cx = e[0]; cy = e[1];
        if (cx === sx && cy === sy) break;
        ring.push([cx, cy]);
        const cand = (out.get(cy * VW + cx) || []).filter((c) => !c[2]);
        if (!cand.length) break;
        // preferencia de giro a la derecha (separa celdas que se tocan en diagonal)
        cand.sort((a, b) => cross(dx, dy, a[0] - cx, a[1] - cy) - cross(dx, dy, b[0] - cx, b[1] - cy));
        e = cand[cand.length - 1];
      }
      ring.push([sx, sy]);
      rings.push(ring);
    }
  }
  return rings;
}
const cross = (ax, ay, bx, by) => ax * by - ay * bx;
const signedArea = (r) => { let s = 0; for (let i = 0; i < r.length - 1; i++) s += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return s / 2; };

const polys = [];
for (let gi = 0; gi < groups.length; gi++) {
  const rings = ringsOf(gi + 1);
  const outers = [], holes = [];
  for (const r of rings) (signedArea(r) > 0 ? outers : holes).push(r);
  const geo = (r) => r.map(([x, y]) => toLonLat(x, y));
  const O = outers.map((r) => ({ grid: r, g: geo(r), holes: [] }));
  for (const h of holes) {
    const hg = geo(h);
    const host = O.filter((o) => inRing(o.g, hg[0])).sort((a, b) => ringArea(a.g) - ringArea(b.g))[0];
    if (host) host.holes.push(hg);
  }
  for (const o of O) {
    const parts = [o.g, ...o.holes].map((r) => simplifyRing(r, TOL)).map((r) => r.map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]));
    if (parts[0].length < 4 || ringArea(parts[0]) < MIN_AREA) continue;
    const keep = [parts[0], ...parts.slice(1).filter((r) => r.length >= 4 && ringArea(r) >= MIN_AREA)];
    polys.push({ u: gi, p: keep.map((r) => r.flat()) });
  }
}
// Quitar unidades sin polígonos y reindexar
const used = [...new Set(polys.map((p) => p.u))].sort((a, b) => a - b);
const remap = new Map(used.map((u, i) => [u, i]));
const data = {
  generatedAt: new Date().toISOString().slice(0, 10),
  source: SOURCE,
  units: used.map((u) => groupUnit(groups[u])),
  polys: polys.map((p) => ({ u: remap.get(p.u), p: p.p })),
};
const json = JSON.stringify(data);
await writeFile(OUT, json);
console.log(`${data.units.length} unidades, ${data.polys.length} polígonos, TOL=${TOL}, ${json.length} bytes → ${OUT}`);
