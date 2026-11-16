import { flatPolys } from './simplify.ts';
import { tileBounds, type TileId } from './tiles.ts';

/**
 * Geología de Argentina de SEGEMAR (SIGAM, 1:250.000, CC BY 4.0: se puede redistribuir y derivar citando la fuente), por teselas de
 * 0,4° (~44 km) que la app baja con cada zona descargada. El servicio no manda CORS (el navegador no lo puede llamar) y trae cientos de MB:
 * el servidor lo lee, simplifica (~150 m) y arma un diccionario de unidades. Las rutas viejas /geoserver/ dan 500 o 403: es /geoserver217/.
 */
export const GEOLOGY_TILE_DEG = 0.4;
export const SEGEMAR_URL = 'https://sigam.segemar.gov.ar/geoserver217/ows';
const LAYER = 'sigam:e250K_UnidadGeologica';
const TIMEOUT_MS = 90_000;
const UA = 'VikArg-Survival-Tools/1.0';
/** Argentina continental (con margen): fuera de acá no hay datos. */
export const AR_BOX = { west: -74, south: -56, east: -53, north: -21 };

export interface GeologyUnit {
  name: string;
  litho: string;
  from: string;
  to: string;
}
export interface GeologyTile {
  x: number;
  y: number;
  /** Diccionario de unidades (único por nombre, litología y edades) y los polígonos que lo usan por índice. */
  units: GeologyUnit[];
  polys: { u: number; p: number[][] }[];
}

export const inArgentina = (t: TileId, size = GEOLOGY_TILE_DEG): boolean => {
  const b = tileBounds(t, size);
  return b.east > AR_BOX.west && b.west < AR_BOX.east && b.north > AR_BOX.south && b.south < AR_BOX.north;
};

interface Props {
  nombre?: string | null;
  descrip_litologica?: string | null;
  edad_inf?: string | null;
  edad_sup?: string | null;
}
interface Feature {
  properties: Props;
  geometry: { type: string; coordinates: unknown } | null;
}

/** De la respuesta GeoJSON del WFS a la tesela compacta. */
export function toGeologyTile(t: TileId, features: Feature[]): GeologyTile {
  const units: GeologyUnit[] = [];
  const byKey = new Map<string, number>();
  const polys: GeologyTile['polys'] = [];
  for (const f of features) {
    const name = (f.properties.nombre ?? '').trim();
    if (!name) continue;
    const unit: GeologyUnit = { name, litho: (f.properties.descrip_litologica ?? '').trim(), from: f.properties.edad_inf ?? '', to: f.properties.edad_sup ?? '' };
    const key = JSON.stringify(unit);
    let u = byKey.get(key);
    if (u === undefined) u = byKey.set(key, units.push(unit) - 1).get(key)!;
    for (const p of flatPolys(f.geometry, 0.0012, 2e-8)) polys.push({ u, p });
  }
  return { x: t.x, y: t.y, units, polys };
}

export async function fetchGeologyTile(t: TileId, url = SEGEMAR_URL): Promise<GeologyTile> {
  const b = tileBounds(t, GEOLOGY_TILE_DEG);
  const q = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: LAYER,
    outputFormat: 'application/json',
    srsName: 'EPSG:4326',
    propertyName: 'nombre,descrip_litologica,edad_inf,edad_sup,shape',
    CQL_FILTER: `BBOX(shape,${b.west},${b.south},${b.east},${b.north},'EPSG:4326')`,
  });
  const res = await fetch(`${url}?${q}`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const fc = (await res.json()) as { features?: Feature[] };
  if (!Array.isArray(fc.features)) throw new Error('respuesta sin features');
  return toGeologyTile(t, fc.features);
}

/** La unidad en un punto (consulta en línea para lugares sin zona descargada); `null` si no hay datos. */
export async function fetchGeologyPoint(lat: number, lon: number, url = SEGEMAR_URL): Promise<GeologyUnit | null> {
  const q = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: LAYER,
    outputFormat: 'application/json',
    propertyName: 'nombre,descrip_litologica,edad_inf,edad_sup',
    // Con el filtro por punto el WFS quiere la latitud primero.
    CQL_FILTER: `INTERSECTS(shape,POINT(${lat} ${lon}))`,
    count: '1',
  });
  const res = await fetch(`${url}?${q}`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const f = ((await res.json()) as { features?: Feature[] }).features?.[0];
  const name = f?.properties.nombre?.trim();
  return f && name ? { name, litho: (f.properties.descrip_litologica ?? '').trim(), from: f.properties.edad_inf ?? '', to: f.properties.edad_sup ?? '' } : null;
}
