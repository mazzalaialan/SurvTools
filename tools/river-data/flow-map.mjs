// Agrega a cada estación de app/public/data/rivers-AR.json la serie de caudal medio diario del INA (`flow`: id de serie) cuando se
// actualiza todos los días. Fuente: INA, Alerta Hidrológico, API a5 `obs/puntual/series?var_id=40&proc_id=1` («Caudal medio diario»,
// m³/s; el valor del día anterior, no el de ahora). Solo las que tienen datos de los últimos 14 días; la app igual muestra la fecha.
// Uso: node flow-map.mjs (una consulta)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FILE = fileURLToPath(new URL('../../app/public/data/rivers-AR.json', import.meta.url));
const MAX_AGE_MS = 14 * 86_400_000;

const res = await fetch('https://alerta.ina.gob.ar/a5/obs/puntual/series?var_id=40&proc_id=1', { headers: { 'user-agent': 'VikArg-Prepping-Tools/1.0' }, signal: AbortSignal.timeout(120_000) });
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const rows = (await res.json()).rows;
const byStation = new Map();
for (const r of rows) {
  const end = r.date_range?.timeend ? Date.parse(r.date_range.timeend) : NaN;
  if (Number.isFinite(end) && Date.now() - end <= MAX_AGE_MS) byStation.set(r.estacion.id, r.id);
}
const data = JSON.parse(readFileSync(FILE, 'utf8'));
let n = 0;
for (const s of data.stations) {
  const flow = byStation.get(s.id);
  if (flow) {
    s.flow = flow;
    n++;
  } else delete s.flow;
}
writeFileSync(FILE, JSON.stringify(data) + '\n');
console.log(`${n} de ${data.stations.length} estaciones con caudal medio diario`);
