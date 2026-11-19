import { SERVICE_CATEGORIES } from './services';
import type { BrSector } from '@/core/settings/settings';

/**
 * Brasil es enorme: sus datos sin conexión (localidades, servicios, parques) se bajan por SECTOR, las cinco macrorregiones del IBGE, y cada persona
 * baja solo el suyo. Para el resto de la app Brasil sigue siendo un solo país (`BR`). Los archivos de un sector son `BR-<sector>.json`,
 * `<categoría>-BR-<sector>.json` y `parks-BR-<sector>.json` (los generan tools/osm-index/brazil.sh y tools/emergency-data/parks-br.mjs).
 */
export const BR_SECTORS: { id: BrSector; states: string[] }[] = [
  { id: 'sul', states: ['PR', 'SC', 'RS'] },
  { id: 'sudeste', states: ['SP', 'RJ', 'MG', 'ES'] },
  { id: 'centro-oeste', states: ['MT', 'MS', 'GO', 'DF'] },
  { id: 'nordeste', states: ['MA', 'PI', 'CE', 'RN', 'PB', 'PE', 'AL', 'SE', 'BA'] },
  { id: 'norte', states: ['AC', 'AM', 'AP', 'PA', 'RO', 'RR', 'TO'] },
];

export const BR_SECTOR_IDS: BrSector[] = BR_SECTORS.map((s) => s.id);

/** Los archivos de `public/data/` de un sector. */
export function sectorFiles(id: BrSector): string[] {
  return [`BR-${id}.json`, ...SERVICE_CATEGORIES.map((c) => `${c}-BR-${id}.json`), `parks-BR-${id}.json`];
}

/** Sector al que pertenece un estado (`PR`, `BR-PR` o `BR-PR` de Natural Earth), o null. */
export function sectorOfState(code: string): BrSector | null {
  const uf = code.replace(/^BR-/, '').toUpperCase();
  return BR_SECTORS.find((s) => s.states.includes(uf))?.id ?? null;
}

interface RegionLike {
  id: string;
  rings: number[][];
}

function inRings(rings: number[][], lon: number, lat: number): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
      const xi = ring[i]!;
      const yi = ring[i + 1]!;
      const xj = ring[j]!;
      const yj = ring[j + 1]!;
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/** Sector donde cae un punto, según los estados del mapa base (`regions` de geo-data); null si no cae en ninguno (el mar, otro país). */
export function sectorAt(regions: RegionLike[], lat: number, lon: number): BrSector | null {
  const hit = regions.find((r) => r.id.startsWith('BR-') && inRings(r.rings, lon, lat));
  return hit ? sectorOfState(hit.id) : null;
}
