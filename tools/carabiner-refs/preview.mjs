// Dibuja TODOS los mosquetones de la app (formas y trabas) grandes, sobre fondo claro y oscuro, en un PNG.
// Uso: cd app && node ../tools/carabiner-refs/preview.mjs <salida.png>
// Carga el componente real (CarabinerFigure.tsx) con el servidor SSR de Vite: lo que ves es lo que sale en la app.
import { createRequire } from 'node:module';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const req = createRequire(resolve('package.json'));
const { createServer } = await import(req.resolve('vite'));
const React = req('react');
const { renderToStaticMarkup } = req('react-dom/server');

const out = resolve(process.argv[2] ?? 'carabiners-preview.png');
const server = await createServer({ root: resolve('.'), server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { CarabinerFigure } = await server.ssrLoadModule('/src/modules/knots/CarabinerFigure.tsx');
const h = React.createElement;
const fig = (shape, lock) => renderToStaticMarkup(h(CarabinerFigure, { shape, lock, className: 'f' }));
const cell = (svg, label) => `<div class="c">${svg}<div>${label}</div></div>`;
const shapes = ['d', 'offset', 'pear', 'oval', 'wide', 'steel', 'key'];
const locks = ['none', 'screw', 'twist', 'triple'];
const row = (theme) =>
  `<div class="row ${theme}">` +
  shapes.map((s) => cell(fig(s), s)).join('') + '<span class="sep"></span>' +
  locks.map((k) => cell(fig('d', k), `D+${k}`)).join('') +
  cell(fig('pear', 'twist'), 'pear+twist') + '</div>';
const html = `<style>body{margin:0;font:14px sans-serif}.row{display:flex;gap:18px;padding:16px;align-items:flex-end}.c{text-align:center}.f{width:150px;height:222px}.sep{width:30px}.light{background:#fff;color:#1c2531;--accent:#9b5629;--surface:#fff;--danger:#a3361c}.dark{background:#1b2633;color:#e8e2d6;--accent:#c47d45;--surface:#1b2633;--danger:#e0664a}</style>${row('light')}${row('dark')}`;
const file = join(mkdtempSync(join(tmpdir(), 'carab-')), 'preview.html');
writeFileSync(file, html);
await server.close();
execFileSync('npx', ['playwright', 'screenshot', '--viewport-size=1900,520', 'file://' + file, out], { stdio: 'ignore' });
console.log(out);
