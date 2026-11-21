/**
 * Revisión RIGUROSA cruce por cruce: UNA imagen con la figura de la app con cada cruce numerado y, al lado,
 * las fotos/figuras reales del nudo (app/public/knots/<id>-*.webp) y la tabla «cuál cuerda va arriba de cuál».
 *   node numerado.mjs <id> <paso> [salida.png] [--zoom=2]
 * Cada insignia numerada marca un cruce; la tabla dice, por número, qué cuerda pasa POR ARRIBA y cuál POR DEBAJO
 * y a qué altura del recorrido de cada una (0 % = firme/primer punto, 100 % = punta). Lo que hay que hacer con ella:
 * mirar la referencia real, recorrer la cuerda del firme a la punta y comprobar cada número (¿en la foto pasa por
 * arriba o por abajo? ¿entra por dentro o por fuera de la vuelta? ¿por delante o por detrás?).
 */
import { mkdirSync, readdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { render, resolve as solve, trace } from './diagram.mjs';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const zoomArg = Number((process.argv.find((a) => a.startsWith('--zoom=')) ?? '--zoom=1').split('=')[1]);
const [id, step, outArg] = args;
if (!id || !step) {
  console.error('uso: node numerado.mjs <id> <paso> [salida.png] [--zoom=2]');
  process.exit(1);
}
const all = {};
for (const f of readdirSync(new URL('./specs/', import.meta.url)).filter((f) => f.endsWith('.mjs')).sort()) {
  Object.assign(all, (await import(new URL(`./specs/${f}`, import.meta.url))).default);
}
const fig = all[id]?.[Number(step) - 1];
if (!fig) {
  console.error('esa figura no existe o no tiene dibujo propio');
  process.exit(1);
}
const out = outArg ?? `/tmp/nudos-revision/${id}-${step}-numerado.png`;
mkdirSync(resolvePath(out, '..'), { recursive: true });

trace(fig); // marca los ambiguos en los cruces
const { strands, xs } = solve(fig);
trace(fig);
// Numeración: por el orden en que se recorre la cuerda 0 (firme → punta); si es una cruce entre otras cuerdas, por la primera que lo toca.
const total = strands.map((r) => Math.max(...r.pts.map((p) => p.s)) || 1);
const pct = (k, s) => Math.round((100 * s) / total[k]);
const list = xs
  .map((c) => ({ c, key: Math.min(c.over.k === 0 ? c.over.s : 1e9, c.under.k === 0 ? c.under.s : 1e9, 1e9 + c.i) }))
  .sort((a, b) => a.key - b.key)
  .map((e, i) => ({ n: i + 1, c: e.c }));

const W = fig.width ?? 400, H = fig.height ?? 300;
let svg = render(fig, { id: 'n' });
const z = fig.zoom;
const tf = z ? `translate(${z[1]} ${z[2]}) scale(${z[0]}) translate(${-z[1]} ${-z[2]})` : '';
const badges = list.map(({ n, c }) => `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="11" fill="#d11" stroke="#fff" stroke-width="2"/><text x="${c.x.toFixed(1)}" y="${(c.y + 4.5).toFixed(1)}" font-size="13" font-weight="700" fill="#fff" text-anchor="middle" font-family="sans-serif">${n}</text>`).join('');
svg = svg.replace('</svg>', `<g${tf ? ` transform="${tf}"` : ''}>${badges}</g></svg>`);
const size = 640 * zoomArg;
svg = svg.replace(/width="\d+" height="\d+"/, `width="${size}" height="${(size * H) / W}"`);

const rows = list.map(({ n, c }) => {
  const o = c.over, u = c.under;
  const who = (p) => `cuerda ${p.k} (${pct(p.k, p.s)} %)`;
  const same = o.z === u.z ? '' : ' · por profundidad (z)';
  return `<tr><td>${n}</td><td>(${Math.round(c.x)},${Math.round(c.y)})</td><td><b>ARRIBA:</b> ${who(o)}</td><td><b>ABAJO:</b> ${who(u)}</td><td>${Math.round(c.ang)}°${c.ambiguo ? ' ⚠ ' + c.ambiguo : ''}${same}</td></tr>`;
}).join('');

const dir = resolvePath('../../app/public/knots');
const refs = readdirSync(dir).filter((f) => f.startsWith(`${id}-`) && /\.(webp|png|jpe?g)$/.test(f));
const refImgs = refs.map((f) => `<div><img src="file://${dir}/${f}" style="max-width:640px;max-height:520px;border:1px solid #888"><div style="font:11px sans-serif">${f} (referencia de la app)</div></div>`).join('') || '<div style="font:12px sans-serif">Sin foto de la app para este nudo: usar la referencia de refs/' + id + '.json</div>';
const html = `<body style="margin:8px;background:#fff;font:12px sans-serif"><h3 style="margin:0 0 6px">${id} · paso ${step} · ${list.length} cruces</h3>
<div style="display:flex;gap:14px;align-items:flex-start"><div>${svg}</div><div style="display:flex;flex-direction:column;gap:8px">${refImgs}</div></div>
<table border="1" cellpadding="3" style="border-collapse:collapse;margin-top:8px"><tr><th>#</th><th>dónde</th><th>por arriba</th><th>por debajo</th><th>ángulo / aviso</th></tr>${rows}</table></body>`;
const { chromium } = await import('../../app/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 800 }, deviceScaleFactor: 1.2 });
const tmp = resolvePath(out + '.html');
writeFileSync(tmp, html);
await p.goto('file://' + tmp);
await p.waitForLoadState('load');
await p.screenshot({ path: out, fullPage: true });
await b.close();
unlinkSync(tmp);
console.log(out);
