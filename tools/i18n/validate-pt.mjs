#!/usr/bin/env node
// Uso: node validate-pt.mjs <pt.json> <es.json>  → compara claves, tipos y marcadores {{x}} / <n> / saltos de línea.
import { readFileSync } from 'node:fs';
const [ptFile, esFile] = process.argv.slice(2);
const pt = JSON.parse(readFileSync(ptFile, 'utf8'));
const es = JSON.parse(readFileSync(esFile, 'utf8'));
const errors = [];
const marks = (s) => (String(s).match(/\{\{[^}]+\}\}|<\/?\d+>|<\/?[a-z]+\/?>|\n/g) ?? []).sort().join('|');
function walk(a, b, path) {
  if (typeof a === 'string') {
    if (typeof b !== 'string') return errors.push(`${path}: debería ser texto`);
    if (marks(a) !== marks(b)) errors.push(`${path}: marcadores distintos (es: ${marks(a)} / pt: ${marks(b)})`);
    if (a.trim() && !b.trim()) errors.push(`${path}: vacío`);
    return;
  }
  if (a && typeof a === 'object') {
    if (!b || typeof b !== 'object') return errors.push(`${path}: debería ser objeto`);
    for (const k of Object.keys(a)) {
      if (!(k in b)) errors.push(`${path}.${k}: falta`);
      else walk(a[k], b[k], `${path}.${k}`);
    }
    for (const k of Object.keys(b)) if (!(k in a)) errors.push(`${path}.${k}: sobra`);
    return;
  }
  if (a !== b) errors.push(`${path}: valor distinto`);
}
walk(es, pt, '$');
if (errors.length) {
  console.log(errors.slice(0, 60).join('\n'));
  console.log(`${errors.length} problemas`);
  process.exit(1);
}
console.log('OK: mismas claves y marcadores');
