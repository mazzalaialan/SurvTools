import * as maplibregl from 'maplibre-gl';
import mlcontour from 'maplibre-contour';
// MapLibre 6 dibuja con un worker aparte: con Vite hay que indicarle dónde queda el archivo.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import './appSources';
import { decodeTerrarium, HATCH_RECENT, HATCH_USUAL, overzoomElevation, paintSlopeTile, type SlopeStyle, cornicePad, CORNICE_MIN_ZOOM } from './slope';
import { themeColors } from './style';
import { cachedOr, DEM_MAX_ZOOM, DEM_URL, GLYPHS_URL, mapTile, networkUrl } from './tiles';

/**
 * Protocolos propios de MapLibre: cada pedido busca primero en los mapas
 * importados y lo descargado y, si falta y hay conexión, en el servidor propio o las fuentes públicas
 * (sources.ts). Así una zona descargada sigue andando aunque OpenFreeMap
 * publique una versión nueva del mapa.
 */

let ready = false;
let contoursUrl = '';

/** Últimas teselas de altura ya decodificadas: con zoom alto, muchas teselas de pendiente salen de la misma. */
const decoded = new Map<string, Promise<Float32Array | null>>();
const DECODED_MAX = 48;

/** Últimas teselas de pendiente ya pintadas, por dirección completa (zoom, línea de nieve, sotavento) y tema: al volver sobre lo ya mirado o cambiar de pantalla no se recalculan. */
const painted = new Map<string, ArrayBuffer>();
const PAINTED_MAX = 96;
function rememberPainted(key: string, data: ArrayBuffer): ArrayBuffer {
  painted.delete(key);
  painted.set(key, data);
  while (painted.size > PAINTED_MAX) painted.delete(painted.keys().next().value!);
  return data.slice(0);
}

function demHeights(z: number, x: number, y: number): Promise<Float32Array | null> {
  const key = `${z}/${x}/${y}`;
  let hit = decoded.get(key);
  if (hit) {
    decoded.delete(key);
  } else {
    hit = mapTile('dem', z, x, y).then((png) => (png ? decodeTerrarium(png) : null));
    // Una falla no se recuerda: puede volver la conexión.
    hit.then((h) => h ?? decoded.delete(key)).catch(() => decoded.delete(key));
  }
  decoded.set(key, hit);
  while (decoded.size > DECODED_MAX) decoded.delete(decoded.keys().next().value!);
  return hit;
}

const parseZxy = (url: string) => {
  const [z, x, y] = url.replace(/^\w+:\/\//, '').split('/').map(Number);
  return { z: z!, x: x!, y: y! };
};

export function setupProtocols(): { contoursUrl: string } {
  if (ready) return { contoursUrl };
  ready = true;
  maplibregl.setWorkerUrl(workerUrl);

  maplibregl.addProtocol('vktile', async (params) => {
    const { z, x, y } = parseZxy(params.url);
    const data = await mapTile('vector', z, x, y);
    // Sin datos: tesela vacía (se ve el fondo y el contorno), no un error.
    return { data: data ?? new ArrayBuffer(0) };
  });

  maplibregl.addProtocol('vkdem', async (params) => {
    const { z, x, y } = parseZxy(params.url);
    const data = await mapTile('dem', z, x, y);
    if (!data) throw new Error('sin elevación');
    return { data };
  });

  // Riesgo de avalancha: la pendiente se calcula con la misma tesela de altura (anda sin conexión si la zona está bajada).
  maplibregl.addProtocol('vkslope', async (params) => {
    // "vkslope://z/x/y?min=1850&lee=90,135&usual=45": la línea de nieve y el sotavento (reciente y habitual) van en la dirección, así cambiarlos vuelve a pintar.
    const [path, query] = params.url.split('?');
    const { z, x, y } = parseZxy(path!);
    const q = new URLSearchParams(query ?? '');
    const minElevation = Number(q.get('min') ?? 0) || 0;
    const list = (k: string) => (q.get(k) ?? '').split(',').filter(Boolean).map(Number).filter(Number.isFinite);
    const c = themeColors();
    // La tesela pintada depende de la dirección y de los colores del tema.
    const cacheKey = `${params.url}|${c.ok}|${c.warn}|${c.slopeAvalanche}|${c.steep}|${c.extreme}`;
    const again = painted.get(cacheKey);
    if (again) {
      painted.delete(cacheKey);
      painted.set(cacheKey, again);
      return { data: again.slice(0) };
    }
    const colors = { low: c.ok, caution: c.warn, avalanche: c.slopeAvalanche, steep: c.steep, extreme: c.extreme, hatch: HATCH_RECENT, hatchUsual: HATCH_USUAL };
    if (z > DEM_MAX_ZOOM) {
      // Más cerca que la elevación: la altura se interpola suave y la pendiente se calcula a la escala de la pantalla,
      // así los bordes entre colores no salen en escalones y las rayas mantienen su ancho.
      // Con cornisas, más margen: se mira 90 m más allá del borde de la tesela.
      const corniceLee = z >= CORNICE_MIN_ZOOM ? list('cor') : [];
      const pad = corniceLee.length ? cornicePad(z, y) : 1;
      const elev = await overzoomElevation(z, x, y, DEM_MAX_ZOOM, (tx, ty) => demHeights(DEM_MAX_ZOOM, tx, ty), pad);
      if (!elev) throw new Error('sin elevación');
      const style: SlopeStyle = { colors, minElevation, lee: list('lee'), leeUsual: list('usual'), corniceLee };
      return { data: rememberPainted(cacheKey, await paintSlopeTile(elev, z, x, y, style, pad)) };
    }
    // La altura decodificada se recuerda: cambiar solo la línea de nieve o el sotavento repinta sin volver a leer la imagen.
    const elev = await demHeights(z, x, y);
    if (!elev) throw new Error('sin elevación');
    return { data: rememberPainted(cacheKey, await paintSlopeTile(elev, z, x, y, { colors, minElevation, lee: list('lee'), leeUsual: list('usual') })) };
  });

  maplibregl.addProtocol('vkglyph', async (params) => {
    const [fontstack, range] = params.url.replace('vkglyph://', '').split('/');
    const url = GLYPHS_URL.replace('{fontstack}', fontstack!).replace('{range}', range!);
    const data = await cachedOr(url, networkUrl(url));
    if (!data) throw new Error('sin letras');
    return { data };
  });

  // Curvas de nivel: maplibre-contour pide la elevación por su cuenta; se le cambia la forma de pedirla
  // para que use lo descargado y, si falta, la misma fuente que el resto del mapa (servidor propio o públicas).
  const dem = new mlcontour.DemSource({ url: DEM_URL, encoding: 'terrarium', maxzoom: DEM_MAX_ZOOM, worker: false });
  const manager = (dem as unknown as { manager?: { getTile?: unknown } }).manager;
  if (manager && 'getTile' in manager) {
    manager.getTile = async (url: string) => {
      const m = /\/(\d+)\/(\d+)\/(\d+)\.png$/.exec(url);
      const data = m ? await mapTile('dem', Number(m[1]), Number(m[2]), Number(m[3])) : null;
      if (!data) throw new Error('sin elevación');
      return { data: new Blob([data], { type: 'image/png' }) };
    };
  }
  dem.setupMaplibre(maplibregl);
  contoursUrl = dem.contourProtocolUrl({
    // Equidistancia [fina, maestra] en metros, según el zoom.
    thresholds: { 9: [500, 1000], 10: [200, 1000], 11: [100, 500], 12: [50, 250], 13: [20, 100], 14: [10, 50] },
    elevationKey: 'ele',
    levelKey: 'level',
    contourLayer: 'contours',
  });
  return { contoursUrl };
}
