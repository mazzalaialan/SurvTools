// Agrega a cada estación de app/public/data/rivers-AR.json qué modelos del INA dan pronóstico de su altura (`forecast`: ids de
// calibrado, del mejor al peor). Los pronósticos pesan distinto (el del Delta (489), casi 1 MB), así que la app pide solo los que necesita.
// Fuente: INA, Alerta Hidrológico, API a5 `sim/calibrados/{id}/corridas`. Uso: node forecast-map.mjs (sin pausa larga: ~7 consultas)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = 'https://alerta.ina.gob.ar/a5/sim/calibrados';
/** Del mejor al peor: tablas de pronóstico oficiales (10 días), Uruguay, Delta (regresión y ajuste del INA) y San Fernando. Mismo orden que `FORECAST_MODELS` de la app. */
const MODELS = [289, 312, 379, 704, 442, 489, 432];
/** Perspectivas de plazo largo: altura media semanal (hasta fin de año, con mínima y máxima) y estacional SISSA (hasta febrero, con percentiles 10 y 90). */
const OUTLOOKS = [434, 499];
const FILE = fileURLToPath(new URL('../../app/public/data/rivers-AR.json', import.meta.url));

const data = JSON.parse(readFileSync(FILE, 'utf8'));
const byModel = new Map();
for (const cal of MODELS) {
  const res = await fetch(`${BASE}/${cal}/corridas?includeProno=false`, { headers: { 'user-agent': 'VikArg-Prepping-Tools/1.0' }, signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`calibrado ${cal}: HTTP ${res.status}`);
  const runs = await res.json();
  byModel.set(cal, new Set((runs[0]?.series ?? []).map((s) => s.estacion_id)));
}
const outlook = new Map();
for (const cal of OUTLOOKS) {
  const res = await fetch(`${BASE}/${cal}/corridas?includeProno=false`, { headers: { 'user-agent': 'VikArg-Prepping-Tools/1.0' }, signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`calibrado ${cal}: HTTP ${res.status}`);
  outlook.set(cal, new Set(((await res.json())[0]?.series ?? []).map((x) => x.estacion_id)));
}
let n = 0;
let o = 0;
for (const s of data.stations) {
  const long = OUTLOOKS.filter((cal) => outlook.get(cal).has(s.id));
  if (long.length) {
    s.outlook = long;
    o++;
  } else delete s.outlook;
  const cals = MODELS.filter((cal) => byModel.get(cal).has(s.id));
  if (cals.length) {
    s.forecast = cals;
    n++;
  } else delete s.forecast;
}
writeFileSync(FILE, JSON.stringify(data) + '\n');
console.log(`${n} de ${data.stations.length} estaciones con pronóstico y ${o} con perspectiva semanal o estacional`);
