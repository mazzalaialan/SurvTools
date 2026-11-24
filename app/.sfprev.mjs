import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const req = createRequire(resolve('package.json'));
const { createServer } = await import(req.resolve('vite'));
const React = req('react');
const { renderToStaticMarkup } = req('react-dom/server');
const server = await createServer({ root: resolve('.'), server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { SurvivalFigure } = await server.ssrLoadModule('/src/modules/fishing/SurvivalFigure.tsx');
const ids = ['where','hooks','handline','setline','traps','spear','food'];
const theme = process.argv[3] ?? 'light';
const css = theme==='light' ? 'background:#fff;color:#1c2531;--text:#1c2531;--text-muted:#5b6674;--accent:#9b5629;--info:#2a6fa8;--surface:#fff;--border:#c9ccd1' : 'background:#1b2633;color:#e8e2d6;--text:#e8e2d6;--text-muted:#9aa5b1;--accent:#c47d45;--info:#5aa0d6;--surface:#1b2633;--border:#3a4756';
for (const id of ids) {
  const html = `<style>body{margin:0;padding:10px;${css}}.survival-figure{width:360px;height:auto;display:block}</style>${renderToStaticMarkup(React.createElement(SurvivalFigure,{id}))}`;
  writeFileSync(`/tmp/sf/${id}.html`, html);
  execFileSync('npx', ['playwright','screenshot','--viewport-size=380,320','--full-page',`file:///tmp/sf/${id}.html`,`/tmp/sf/${id}-${theme}.png`],{stdio:'ignore'});
}
await server.close();
