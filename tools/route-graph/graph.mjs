import fs from 'node:fs';
import zlib from 'node:zlib';
import parseOSM from 'osm-pbf-parser';
import through from 'through2';

const FILE = process.env.PBF || '../uruguay.osm.pbf';
const VEHICLE = new Set(['motorway','motorway_link','trunk','trunk_link','primary','primary_link','secondary','secondary_link','tertiary','tertiary_link','unclassified','residential','living_street','service','track']);
const FOOT = new Set(['path','footway','cycleway','pedestrian','steps','bridleway','corridor']);
const profile = process.argv[2] || 'vehicle';
const allowed = (h) => VEHICLE.has(h) || (profile === 'all' && FOOT.has(h));

const t0 = Date.now();
function stream(onItem) {
  return new Promise((res, rej) => {
    fs.createReadStream(FILE).pipe(parseOSM()).pipe(through.obj((items, _e, next) => { for (const it of items) onItem(it); next(); })).on('finish', res).on('error', rej);
  });
}
// Pasada 1: las calles y cuántas veces se usa cada nodo.
const ways = [];
const uses = new Map();
await stream((it) => {
  if (it.type !== 'way') return;
  const h = it.tags?.highway;
  if (!h || !allowed(h)) return;
  if (it.tags.area === 'yes') return;
  const acc = it.tags.access;
  if (profile === 'vehicle' && (acc === 'no' || acc === 'private')) return;
  ways.push({ refs: it.refs, h, oneway: it.tags.oneway === 'yes' || it.tags.oneway === '1' || it.tags.junction === 'roundabout' ? 1 : it.tags.oneway === '-1' ? -1 : 0 });
  for (const r of it.refs) uses.set(r, (uses.get(r) ?? 0) + 1);
});
console.error(profile, 'pasada 1', ((Date.now() - t0) / 1000).toFixed(0) + 's', 'calles', ways.length, 'nodos usados', uses.size);
// Pasada 2: coordenadas de esos nodos.
const coord = new Map();
await stream((it) => { if (it.type === 'node' && uses.has(it.id)) coord.set(it.id, [it.lat, it.lon]); });
console.error('pasada 2', ((Date.now() - t0) / 1000).toFixed(0) + 's', 'coordenadas', coord.size);

// Nodos del grafo = extremos de calle o nodos compartidos (cruces).
const idx = new Map(); // id osm -> índice
const nlat = []; const nlon = [];
const nodeIdx = (id) => { let i = idx.get(id); if (i === undefined) { i = nlat.length; idx.set(id, i); const c = coord.get(id); nlat.push(c[0]); nlon.push(c[1]); } return i; };
const R = 6371000, rad = Math.PI / 180;
const hav = (a, b) => { const dl = (b[0]-a[0])*rad, dn = (b[1]-a[1])*rad; const x = Math.sin(dl/2)**2 + Math.cos(a[0]*rad)*Math.cos(b[0]*rad)*Math.sin(dn/2)**2; return 2*R*Math.asin(Math.sqrt(x)); };
const eFrom = [], eTo = [], eLen = [], eFlag = [], eShapeOff = [], shape = [];
const CLS = { motorway:0, trunk:1, primary:2, secondary:3, tertiary:4, unclassified:5, residential:6, living_street:6, service:7, track:8 };
for (const w of ways) {
  const refs = w.refs.filter((r) => coord.has(r));
  if (refs.length < 2) continue;
  let start = 0;
  for (let i = 1; i < refs.length; i++) {
    const junction = i === refs.length - 1 || uses.get(refs[i]) > 1;
    if (!junction) continue;
    let len = 0; const mid = [];
    for (let k = start + 1; k <= i; k++) { len += hav(coord.get(refs[k-1]), coord.get(refs[k])); if (k < i) mid.push(coord.get(refs[k])); }
    const a = nodeIdx(refs[start]), b = nodeIdx(refs[i]);
    const base = w.h.replace('_link', '');
    eFrom.push(w.oneway === -1 ? b : a); eTo.push(w.oneway === -1 ? a : b); eLen.push(Math.round(len * 10));
    eFlag.push(((CLS[base] ?? 9) & 15) | (w.oneway !== 0 ? 16 : 0));
    eShapeOff.push(shape.length / 2);
    // forma intermedia en micro-grados enteros
    for (const p of mid) shape.push(Math.round(p[0] * 1e6), Math.round(p[1] * 1e6));
    start = i;
  }
}
const N = nlat.length, E = eFrom.length;
console.error('nodos', N, 'aristas', E, 'puntos de forma', shape.length / 2, 'km totales', (eLen.reduce((s, x) => s + x, 0) / 10 / 1000).toFixed(0));

// Serialización compacta: nodos Int32 (1e-6°), aristas (from,to u32; len u32 dm; flag u8), forma con deltas varint.
const buf = (arr, T) => Buffer.from(new T(arr).buffer);
const varint = (nums) => { const out = []; for (let n of nums) { n = n < 0 ? ((-n) << 1) - 1 : n << 1; while (n > 127) { out.push((n & 127) | 128); n >>>= 7; } out.push(n); } return Buffer.from(out); };
// deltas de la forma respecto del punto anterior (dentro de la arista, el primero respecto del nodo de origen)
const deltas = [];
for (let e = 0; e < E; e++) {
  const from = eFrom[e] === undefined ? 0 : eFrom[e];
  let pl = Math.round(nlat[from] * 1e6), pn = Math.round(nlon[from] * 1e6);
  const s = eShapeOff[e], t = e + 1 < E ? eShapeOff[e + 1] : shape.length / 2;
  for (let k = s; k < t; k++) { deltas.push(shape[2*k] - pl, shape[2*k+1] - pn); pl = shape[2*k]; pn = shape[2*k+1]; }
}
// latitudes y longitudes de nodos: delta respecto del anterior (los nodos de una calle están cerca)
const nl = nlat.map((v) => Math.round(v * 1e6)), nn = nlon.map((v) => Math.round(v * 1e6));
const parts = {
  'nodos (lat,lon Int32)': Buffer.concat([buf(nl, Int32Array), buf(nn, Int32Array)]),
  'aristas (de, a, largo, clase)': Buffer.concat([buf(eFrom, Uint32Array), buf(eTo, Uint32Array), buf(eLen, Uint32Array), buf(eFlag, Uint8Array)]),
  'forma (deltas varint)': varint(deltas),
};
let raw = 0, gz = 0, br = 0;
for (const [name, b] of Object.entries(parts)) {
  const g = zlib.gzipSync(b, { level: 9 }).length, r = zlib.brotliCompressSync(b, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 } }).length;
  raw += b.length; gz += g; br += r;
  console.error(' ', name.padEnd(32), (b.length / 1e6).toFixed(1).padStart(6), 'MB  gzip', (g / 1e6).toFixed(1).padStart(6), 'MB  brotli', (r / 1e6).toFixed(1), 'MB');
}
console.error('TOTAL', profile, 'crudo', (raw / 1e6).toFixed(1), 'MB · gzip', (gz / 1e6).toFixed(1), 'MB · brotli', (br / 1e6).toFixed(1), 'MB');
fs.writeFileSync(`graph-${process.env.TAG || ''}${profile}.json`, JSON.stringify({ N, E, nl: undefined }));
// guardo lo necesario para el benchmark
const out = { N, E, nlat, nlon, eFrom, eTo, eLen, eFlag };
fs.writeFileSync(`graph-${process.env.TAG || ''}${profile}.bin.json`, JSON.stringify(out));
console.error('listo en', ((Date.now() - t0) / 1000).toFixed(0) + 's');
