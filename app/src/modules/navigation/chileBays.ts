import { distanceMeters } from '@/core/geo/geo';
import { sentenceCase } from './chileMarine';

/**
 * Pronóstico marítimo oficial para bahías de la Armada de Chile (Directemar): 49 áreas con viento, mar en la bahía y fuera de ella,
 * olas, visibilidad y nubosidad por período (de día y de noche, unos dos días). JSON público con CORS abierto
 * (https://meteoarmada.directemar.cl/meteo/stat/download/bahias_met.json), sin licencia declarada. El archivo no trae coordenadas: las de
 * cada bahía están acá, puestas a mano (lugares conocidos; son aproximadas, el centro de la bahía o del puerto).
 */
export const CHILE_BAYS_URL = 'https://meteoarmada.directemar.cl/meteo/stat/download/bahias_met.json';

/** [id de bahía de la Armada, latitud, longitud]. */
const COORDS: Record<number, [number, number]> = {
  1: [-18.48, -70.32], // Arica
  2: [-20.21, -70.15], // Iquique
  3: [-20.82, -70.2], // Patache
  4: [-22.09, -70.2], // Tocopilla
  5: [-23.1, -70.45], // Mejillones
  6: [-23.65, -70.4], // Antofagasta
  7: [-25.4, -70.48], // Taltal
  8: [-26.35, -70.62], // Chañaral
  9: [-27.07, -70.82], // Caldera
  10: [-28.46, -71.22], // Huasco
  11: [-29.95, -71.34], // Coquimbo
  12: [-31.91, -71.51], // Los Vilos
  13: [-32.78, -71.53], // Quintero
  14: [-33.03, -71.63], // Valparaíso
  15: [-33.59, -71.62], // San Antonio
  16: [-34.39, -72.01], // Pichilemu
  17: [-33.64, -78.83], // Juan Fernández
  18: [-27.15, -109.43], // Rapa Nui
  111: [-27.14, -109.43], // Bahía Pascua (Rapa Nui)
  19: [-35.33, -72.41], // Constitución
  20: [-36.71, -72.98], // Lirquén
  21: [-36.71, -73.11], // Talcahuano
  22: [-36.74, -73.16], // San Vicente
  23: [-37.03, -73.16], // Coronel
  24: [-37.09, -73.16], // Lota
  25: [-37.61, -73.65], // Lebú
  26: [-38.78, -73.4], // Puerto Saavedra
  27: [-39.89, -73.43], // Corral
  28: [-39.43, -73.2], // Mehuín
  29: [-37.2, -73.4], // Golfo de Arauco
  30: [-41.62, -73.6], // Maullín
  31: [-41.78, -73.85], // Acceso oceánico del canal Chacao
  32: [-41.47, -72.95], // Puerto Montt
  33: [-43.75, -74.3], // Boca del Guafo
  34: [-45.47, -72.82], // Seno Aysén y Puerto Chacabuco
  35: [-47.2, -75.2], // Golfo de Penas
  36: [-43.5, -73.7], // Ruta Quellón–Melinka
  // Zona austral: en el archivo el id 37 se repite (Puerto Saavedra sin datos y Puerto Edén); se distinguen por el centro.
  38: [-50.0, -74.6], // Golfo Trinidad
  39: [-51.73, -72.5], // Puerto Natales
  40: [-52.5, -72.0], // Seno Skyring
  41: [-53.0, -71.3], // Seno Otway
  42: [-52.4, -68.4], // Límite oriental del estrecho de Magallanes
  43: [-52.65, -74.6], // Boca occidental del estrecho de Magallanes
  44: [-52.6, -70.15], // Bahía Gregorio
  45: [-53.16, -70.91], // Punta Arenas
  46: [-53.29, -70.4], // Bahía Chilota (junto a Porvenir)
  47: [-40.58, -73.74], // Bahía Mansa
  48: [-54.93, -67.62], // Puerto Williams
  49: [-62.2, -58.95], // Bahía Fildes (isla Rey Jorge, Antártica)
};
/** Puerto Edén es el id 37 de la zona austral (centro 5). */
const PUERTO_EDEN: [number, number] = [-49.13, -74.42];

export interface BayPeriod {
  /** «Domingo 15 08:00 a 20:00», tal como lo da la Armada, en minúsculas con mayúscula inicial. */
  label: string;
  wind: string;
  /** Mar dentro de la bahía y mar de fondo/oceánico, y la altura de las olas. */
  bay: string;
  ocean: string;
  waves: string;
  visibility: string;
  clouds: string;
  phenomenon: string;
  tempMin: string;
  tempMax: string;
}

export interface Bay {
  id: number;
  name: string;
  center: string;
  lat: number;
  lon: number;
  periods: BayPeriod[];
}

export interface ChileBays {
  bays: Bay[];
  fetchedAt: number;
}

interface RawPeriod {
  periodo_validez?: { dia?: string; numeral?: number; inicio?: string; fin?: string; temperatura_minima?: string; temperatura_maxima?: string };
  pronostico?: {
    visibilidad?: string;
    cobertura_nubosa?: string;
    fenomeno_atmosferico?: string;
    estado_mar?: { descripcion?: string; mar_bahia?: string; altura_olas?: string };
    viento?: { direccion?: string; velocidad?: string; direccion2?: string; velocidad2?: string };
  };
}
interface RawBay {
  'id-bahia'?: number;
  nombre?: string;
  pronostico_actual?: RawPeriod[];
}

const clean = (s: string | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();

/** «W/SW 4/12 KT, ocasional 18 kt»: la dirección y la velocidad, con la segunda («ocasional», «a calma») si la hay. */
export function windText(w: NonNullable<NonNullable<RawPeriod['pronostico']>['viento']> | undefined): string {
  if (!w) return '';
  const first = [clean(w.direccion), clean(w.velocidad)].filter(Boolean).join(' ');
  const second = [clean(w.direccion2).toLowerCase(), clean(w.velocidad2)].filter(Boolean).join(' ');
  return [first, second].filter(Boolean).join(', ').replace(/\b(kt)\b/gi, 'kt');
}

function labelOf(v: RawPeriod['periodo_validez']): string {
  if (!v) return '';
  const from = v.dia ? `${v.dia} ${v.numeral ?? ''} ${v.inicio ?? ''}` : (v.inicio ?? '');
  const raw = v.dia ? `${from.trim()} a ${clean(v.fin)}` : `${clean(from)} a ${clean(v.fin)}`;
  return sentenceCase(raw).replace(/ a (\d{2}:\d{2})$/, ' a $1');
}

/** Las bahías del JSON de la Armada con su ubicación; las que no se saben ubicar o no traen pronóstico se descartan. */
export function parseChileBays(raw: unknown, fetchedAt = Date.now()): ChileBays | null {
  const centers = (raw as { centros_meteorologicos?: { 'id-centro'?: number; nombre?: string; bahias?: RawBay[] }[] } | null)?.centros_meteorologicos;
  if (!Array.isArray(centers)) return null;
  const bays: Bay[] = [];
  for (const c of centers) {
    for (const b of c.bahias ?? []) {
      const id = b['id-bahia'];
      const periods = (b.pronostico_actual ?? []).map<BayPeriod>((p) => ({
        label: labelOf(p.periodo_validez),
        wind: windText(p.pronostico?.viento),
        bay: sentenceCase(p.pronostico?.estado_mar?.mar_bahia ?? ''),
        ocean: sentenceCase(p.pronostico?.estado_mar?.descripcion ?? ''),
        waves: sentenceCase(p.pronostico?.estado_mar?.altura_olas ?? ''),
        visibility: sentenceCase(p.pronostico?.visibilidad ?? ''),
        clouds: sentenceCase(p.pronostico?.cobertura_nubosa ?? ''),
        phenomenon: sentenceCase(p.pronostico?.fenomeno_atmosferico ?? ''),
        tempMin: clean(p.periodo_validez?.temperatura_minima),
        tempMax: clean(p.periodo_validez?.temperatura_maxima),
      }));
      const coords = id === 37 && c['id-centro'] === 5 ? PUERTO_EDEN : id !== undefined ? COORDS[id] : undefined;
      if (id === undefined || !coords || !periods.length || !b.nombre) continue;
      bays.push({ id, name: clean(b.nombre).replace(/^Bahía\s+/i, 'Bahía '), center: clean(c.nombre), lat: coords[0], lon: coords[1], periods });
    }
  }
  return bays.length ? { bays, fetchedAt } : null;
}

export async function fetchChileBays(fetcher: typeof fetch = fetch): Promise<ChileBays | null> {
  const res = await fetcher(CHILE_BAYS_URL, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Armada de Chile ${res.status}`);
  return parseChileBays(await res.json());
}

export interface NearBay {
  bay: Bay;
  km: number;
}

/** Las bahías más cercanas a un punto, hasta una distancia máxima. */
export function nearestBays(bays: Bay[], lat: number, lon: number, count = 3, maxKm = 150): NearBay[] {
  return bays
    .map((bay) => ({ bay, km: distanceMeters({ lat, lon }, bay) / 1000 }))
    .filter((n) => n.km <= maxKm)
    .sort((a, b) => a.km - b.km)
    .slice(0, count);
}

const STORE = 'vikarg.chilebays.last';
export function loadSavedBays(): ChileBays | null {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as ChileBays) : null;
  } catch {
    return null;
  }
}
export function saveBays(b: ChileBays): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(b));
  } catch {
    /* sin almacenamiento: se ve igual con conexión */
  }
}
