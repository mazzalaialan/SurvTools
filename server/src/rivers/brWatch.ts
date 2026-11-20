import type { BrCatalogStation, BrLevels } from './br.ts';
import type { RiverLevel, RiverStation } from './watch.ts';

/**
 * Avisos push de los ríos de Brasil: usan el mismo vigilante que los del INA (rivers/watch.ts) con las estaciones de la ANA vistas como
 * `RiverStation`. Las cotas del SGB/CPRM (atención, alerta, inundación) vienen en cm y acá pasan a metros, que es lo que escribe el aviso.
 * Solo entran las estaciones con alguna cota oficial: sin cotas el aviso no tiene umbral que cruzar. Aviso informativo, no oficial.
 */
export function brRiverStations(catalog: BrCatalogStation[]): RiverStation[] {
  const m = (cm: number | null | undefined): number | null => (cm == null ? null : Math.round(cm) / 100);
  return catalog.flatMap((c) => {
    const t = c.thresholds;
    if (!t || (t.attention === null && t.alert === null && t.flood === null)) return [];
    const id = Number(c.code);
    if (!Number.isSafeInteger(id)) return [];
    return [{ id, name: c.name, river: c.river, lat: c.lat, lon: c.lon, attention: m(t.attention), alert: m(t.alert), evac: m(t.flood), low: null, series: id, source: 'ANA' as const }];
  });
}

/** Las últimas lecturas de la ANA como el mapa de niveles del vigilante (metros, hora ISO). */
export function brRiverLevels(levels: BrLevels): Map<number, RiverLevel> {
  const out = new Map<number, RiverLevel>();
  for (const s of levels.stations) {
    const id = Number(s.code);
    const t = Date.parse(s.at);
    if (Number.isFinite(id) && Number.isFinite(t) && Number.isFinite(s.level)) out.set(id, { level: Math.round(s.level) / 100, at: new Date(t).toISOString() });
  }
  return out;
}
