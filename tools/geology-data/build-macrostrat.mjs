#!/usr/bin/env node
/**
 * Geología de Bolivia y Paraguay, base gruesa para usar sin conexión:
 * app/public/data/geology-BO.json y app/public/data/geology-PY.json.
 *
 * Fuente: Macrostrat (https://macrostrat.org, la API responde «license: CC-BY 4.0»), que para esta zona solo trae el mapa
 * «Geological Map of South America 2018» (CGMW, Servicio Geológico de Colombia y Servicio Geológico de Brasil; Gómez, Schobbenhaus
 * y Montes 2019), escala 1:5.000.000, fuente nº 1087 de Macrostrat (https://www.arcgis.com/home/item.html?id=7ecc9e7e0c1f46c8ad44f5e5b476150d).
 * Trae edad y litología general («Devonian Siliciclastic»), sin nombre de formación. Es la mejor fuente abierta hallada para
 * estos dos países; es muy gruesa (decisión del proyecto: usarla mientras no haya otra mejor).
 *
 * Los polígonos se toman de las teselas vectoriales públicas https://tiles.macrostrat.org/carto/{z}/{x}/{y}.mvt (z=4: 4 teselas
 * cubren los dos países), con user-agent genérico y 3 s de pausa entre pedidos, sin paralelismo. Las teselas se decodifican aquí
 * mismo (protobuf a mano, sin dependencias) y se descartan los polígonos de otras fuentes (solo source_id 1087). Cada tesela se
 * recorta a su extensión exacta (los vecinos se solapan por el «buffer») y al rectángulo del país + 0,3°; después se conservan
 * los polígonos que tocan el país o su margen de 0,3° (contorno de Natural Earth de borders-data.json).
 *
 * Cita: Gómez, J., Schobbenhaus, C. y Montes, N.E. (compiladores), 2019. Geological Map of South America 2018, 1:5.000.000. CGMW,
 * Servicio Geológico de Colombia y Servicio Geológico de Brasil. Vía Macrostrat, CC BY 4.0.
 *
 * Uso: node tools/geology-data/build-macrostrat.mjs [directorio-de-cache-de-teselas]   (necesita conexión si faltan teselas)
 */
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ringArea, simplifyRing, inRing } from '../lib/osm-geo.mjs';
import { periodColor } from './periods.mjs';

const OUTDIR = fileURLToPath(new URL('../../app/public/data/', import.meta.url));
const BORDERS = fileURLToPath(new URL('../../app/src/modules/emergency/borders-data.json', import.meta.url));
const CACHE = process.argv[2] || '/tmp/macrostrat-tiles';
const UA = 'VikArg-Survival-Tools/1.0';
const SOURCE = 'Macrostrat, Geological Map of South America 2018 (CGMW/SGC/SGB; Gómez, Schobbenhaus y Montes 2019), 1:5.000.000, CC BY 4.0';
const SOURCE_ID = 1087;
const Z = 4;
const MARGIN = 0.3;
const TOL = 0.004; // grados (≈450 m): la fuente es 1:5.000.000, no hay más detalle que rescatar
const MIN_AREA = 0.002; // grados² (≈ 25 km²)

// ---------- Traducción (tabla explícita; un valor sin traducir corta el script) ----------
// Litología general → [forma para el nombre, litología]
const LITHO = {
  Siliciclastic: ['Rocas siliciclásticas', 'Rocas siliciclásticas'],
  Carbonate: ['Rocas carbonáticas', 'Rocas carbonáticas'],
  Evaporite: ['Evaporitas', 'Evaporitas'],
  Granite: ['Rocas graníticas', 'Rocas graníticas'],
  'Alkaline plutonic': ['Rocas plutónicas alcalinas', 'Rocas plutónicas alcalinas'],
  'Alkaline volcanic': ['Rocas volcánicas alcalinas', 'Rocas volcánicas alcalinas'],
  'Gabbro and ultramafic': ['Rocas gábricas y ultramáficas', 'Rocas gábricas y ultramáficas'],
  basalt: ['Rocas basálticas', 'Rocas basálticas'],
  'Andesite and related volcanic': ['Rocas andesíticas y volcánicas afines', 'Rocas andesíticas y volcánicas afines'],
  Rhyolite: ['Rocas riolíticas', 'Rocas riolíticas'],
  'Volcaniclastic, volcanic': ['Rocas volcanosedimentarias', 'Rocas volcanoclásticas y volcánicas'],
  'Low to medium grade metamorphic': ['Rocas metamórficas de grado bajo a medio', 'Rocas metamórficas de grado bajo a medio'],
  'Medium to high grade metamorphic': ['Rocas metamórficas de grado medio a alto', 'Rocas metamórficas de grado medio a alto'],
  Sedimentary: ['Rocas sedimentarias sin diferenciar', 'Rocas sedimentarias'],
  Volcanic: ['Rocas volcánicas sin diferenciar', 'Rocas volcánicas'],
  Metamorphic: ['Rocas metamórficas sin diferenciar', 'Rocas metamórficas'],
};
// Edad (período, época o era del mapa) → nombre en español. Los períodos del Proterozoico y del Arqueano llevan el
// nombre de su era delante para que periodColor los pinte (ver periods.mjs).
const AGE = {
  Quaternary: 'Cuaternario', Neogene: 'Neógeno', Paleogene: 'Paleógeno', Cretaceous: 'Cretácico', Jurassic: 'Jurásico',
  Triassic: 'Triásico', Permian: 'Pérmico', Carboniferous: 'Carbonífero', Devonian: 'Devónico', Silurian: 'Silúrico',
  Ordovician: 'Ordovícico', Cambrian: 'Cámbrico',
  Ediacaran: 'Neoproterozoico (Ediacárico)', Cryogenian: 'Neoproterozoico (Criogénico)', Tonian: 'Neoproterozoico (Toniano)',
  Stenian: 'Mesoproterozoico (Esteniano)', Ectasian: 'Mesoproterozoico (Ectásico)', Calymmian: 'Mesoproterozoico (Calímico)',
  Statherian: 'Paleoproterozoico (Estatérico)', Orosirian: 'Paleoproterozoico (Orosírico)', Rhyacian: 'Paleoproterozoico (Riácico)',
  Siderian: 'Paleoproterozoico (Sidérico)',
  Neoarchean: 'Neoarqueano', Mesoarchean: 'Mesoarqueano', Paleoarchean: 'Paleoarqueano',
  Neoproterozoic: 'Neoproterozoico', Mesoproterozoic: 'Mesoproterozoico', Paleoproterozoic: 'Paleoproterozoico',
  Cenozoic: 'Cenozoico', Mesozoic: 'Mesozoico', Paleozoic: 'Paleozoico',
};
const tr = (table, k, what) => { if (!(k in table)) throw new Error(`Sin traducción de ${what}: «${k}»`); return table[k]; };
// «Devónico» → «del Devónico»; «Mesoproterozoico (Esteniano)» → «del Mesoproterozoico (Esteniano)»
const del = (a) => `del ${a}`;

// ---------- Lector de teselas vectoriales (protobuf de Mapbox Vector Tile) ----------
function decodeTile(buf) {
  let p = 0;
  const varint = () => { let r = 0, s = 0, b; do { b = buf[p++]; r += (b & 0x7f) * 2 ** s; s += 7; } while (b & 0x80); return r; };
  const zz = (v) => (v % 2 ? -(v + 1) / 2 : v / 2);
  const readMsg = (end, fn) => { while (p < end) { const k = varint(); fn(k >> 3, k & 7); } };
  const str = (a, b) => Buffer.from(buf.subarray(a, b)).toString('utf8');
  let layer = null;
  readMsg(buf.length, (f, w) => {
    if (f === 3 && w === 2) {
      const end = varint() + p;
      const L = { name: '', keys: [], values: [], features: [], extent: 4096 };
      readMsg(end, (f2, w2) => {
        if (w2 === 0) { const v = varint(); if (f2 === 5) L.extent = v; return; }
        const e2 = varint() + p;
        if (f2 === 1) L.name = str(p, e2);
        else if (f2 === 3) L.keys.push(str(p, e2));
        else if (f2 === 4) {
          let val;
          readMsg(e2, (f3, w3) => {
            if (w3 === 2) { const l3 = varint(); val = str(p, p + l3); p += l3; }
            else if (w3 === 1) { val = buf.readDoubleLE(p); p += 8; }
            else if (w3 === 5) { val = buf.readFloatLE(p); p += 4; }
            else { const v = varint(); val = f3 === 6 ? zz(v) : f3 === 7 ? !!v : v; }
          });
          L.values.push(val);
        } else if (f2 === 2) {
          const F = { tags: [], geom: [] };
          readMsg(e2, (f3, w3) => {
            if (w3 === 0) { varint(); return; }
            const e3 = varint() + p;
            if (f3 === 2) while (p < e3) F.tags.push(varint());
            else if (f3 === 4) while (p < e3) F.geom.push(varint());
            else p = e3;
          });
          L.features.push(F);
        }
        p = e2;
      });
      if (L.name === 'units') layer = L;
      p = end;
    } else if (w === 2) p += varint(); else if (w === 0) varint();
  });
  if (!layer) return [];
  return layer.features.map((F) => {
    const props = {};
    for (let i = 0; i < F.tags.length; i += 2) props[layer.keys[F.tags[i]]] = layer.values[F.tags[i + 1]];
    const rings = [];
    let x = 0, y = 0, cur = null;
    for (let i = 0; i < F.geom.length;) {
      const c = F.geom[i++], cmd = c & 7, n = c >> 3;
      for (let j = 0; j < n; j++) {
        if (cmd === 7) { cur.push(cur[0]); continue; }
        x += zz(F.geom[i++]); y += zz(F.geom[i++]);
        if (cmd === 1) { cur = [[x, y]]; rings.push(cur); } else cur.push([x, y]);
      }
    }
    // Un anillo exterior (área con signo positiva en coordenadas de tesela) abre un polígono; los siguientes son huecos.
    const polys = [];
    for (const r of rings) {
      const a = r.reduce((s, [px, py], k) => { const [qx, qy] = r[(k + 1) % r.length]; return s + px * qy - qx * py; }, 0);
      if (a > 0 || !polys.length) polys.push([r]); else polys[polys.length - 1].push(r);
    }
    return { props, polys, extent: layer.extent };
  });
}

// ---------- Geometría ----------
const tileLon = (x, z) => (x / 2 ** z) * 360 - 180;
const tileLat = (y, z) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;
/** Recorte de un anillo contra un rectángulo (Sutherland-Hodgman). */
function clipRect(ring, [x0, y0, x1, y1]) {
  const edges = [
    [(p) => p[0] >= x0, (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= x1, (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= y0, (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0]],
    [(p) => p[1] <= y1, (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1]],
  ];
  let pts = ring.slice(0, -1);
  for (const [inside, cut] of edges) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i + pts.length - 1) % pts.length], b = pts[i];
      if (inside(b)) { if (!inside(a)) out.push(cut(a, b)); out.push(b); } else if (inside(a)) out.push(cut(a, b));
    }
    pts = out;
    if (!pts.length) return null;
  }
  return pts.length >= 3 ? [...pts, pts[0]] : null;
}
const r2 = (n) => Math.round(n * 100) / 100;

async function getTile(x, y) {
  const f = `${CACHE}/${Z}_${x}_${y}.mvt`;
  if (!existsSync(f)) {
    await mkdir(CACHE, { recursive: true });
    await new Promise((r) => setTimeout(r, 3000));
    const res = await fetch(`https://tiles.macrostrat.org/carto/${Z}/${x}/${y}.mvt`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`tesela ${x}/${y}: HTTP ${res.status}`);
    await writeFile(f, Buffer.from(await res.arrayBuffer()));
  }
  return decodeTile(await readFile(f));
}

const borders = JSON.parse(await readFile(BORDERS, 'utf8'));
const tileCache = new Map();
for (const cc of ['BO', 'PY']) {
  const outline = borders[cc];
  const pts = outline.flat();
  const bb = [Math.min(...pts.map((p) => p[0])) - MARGIN, Math.min(...pts.map((p) => p[1])) - MARGIN, Math.max(...pts.map((p) => p[0])) + MARGIN, Math.max(...pts.map((p) => p[1])) + MARGIN];
  // contorno densificado (≤0,1°) para medir la distancia al país
  const dense = [];
  for (const r of outline) for (let i = 0; i < r.length - 1; i++) {
    const n = Math.max(1, Math.ceil(Math.hypot(r[i + 1][0] - r[i][0], r[i + 1][1] - r[i][1]) / 0.1));
    for (let k = 0; k < n; k++) dense.push([r[i][0] + ((r[i + 1][0] - r[i][0]) * k) / n, r[i][1] + ((r[i + 1][1] - r[i][1]) * k) / n]);
  }
  const near = ([x, y]) => dense.some(([bx, by]) => Math.hypot(bx - x, by - y) <= MARGIN) || outline.some((r) => inRing(r, [x, y]));
  const tx0 = Math.floor(((bb[0] + 180) / 360) * 2 ** Z), tx1 = Math.floor(((bb[2] + 180) / 360) * 2 ** Z);
  const merc = (lat) => (1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2 * 2 ** Z;
  const ty0 = Math.floor(merc(bb[3])), ty1 = Math.floor(merc(bb[1]));

  const units = [], byKey = new Map(), polys = [];
  for (let tx = tx0; tx <= tx1; tx++) for (let ty = ty0; ty <= ty1; ty++) {
    const k = `${tx}/${ty}`;
    if (!tileCache.has(k)) tileCache.set(k, await getTile(tx, ty));
    const lon0 = tileLon(tx, Z), lon1 = tileLon(tx + 1, Z), latT = tileLat(ty, Z), latB = tileLat(ty + 1, Z);
    const rect = [Math.max(lon0, bb[0]), Math.max(latB, bb[1]), Math.min(lon1, bb[2]), Math.min(latT, bb[3])];
    for (const F of tileCache.get(k)) {
      const pr = F.props;
      if (pr.source_id !== SOURCE_ID || !pr.lith || !pr.t_int || !pr.b_int) continue;
      const [lname, litho] = tr(LITHO, pr.lith, 'litología');
      const to = tr(AGE, pr.t_int, 'edad'), from = tr(AGE, pr.b_int, 'edad');
      const name = from === to ? `${lname} ${del(to)}` : `${lname} ${del(from)} al ${to}`;
      const unit = { name, litho, from, to };
      const key = JSON.stringify(unit);
      let ui = byKey.get(key);
      for (const poly of F.polys) {
        const rings = poly.map((ring) => {
          const ll = ring.map(([px, py]) => [lon0 + (px / F.extent) * (lon1 - lon0), tileLat(ty + py / F.extent, Z)]);
          const c = clipRect(ll, rect);
          return c && simplifyRing(c, TOL).map(([a, b]) => [r2(a), r2(b)]);
        });
        if (!rings[0] || rings[0].length < 4 || ringArea(rings[0]) < MIN_AREA) continue;
        if (!rings[0].some(near) && !outline.some((r) => r.some((q) => inRing(rings[0], q)))) continue;
        const good = rings.filter((r) => r && r.length >= 4 && ringArea(r) >= MIN_AREA / 4);
        if (ui === undefined) { ui = units.push({ ...unit, color: periodColor(unit.to || unit.from) }) - 1; byKey.set(key, ui); }
        polys.push({ u: ui, p: good.map((r) => r.flat()) });
      }
    }
  }
  const data = { generatedAt: new Date().toISOString().slice(0, 10), source: SOURCE, units, polys };
  const s = JSON.stringify(data);
  await writeFile(`${OUTDIR}geology-${cc}.json`, s);
  console.log(`${cc}: ${units.length} unidades, ${polys.length} polígonos, ${s.length} bytes`);
}
