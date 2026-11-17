/**
 * Altura de calle en Argentina a partir de una posición, con la API Georef del Estado argentino (datos abiertos, https://datosgobar.github.io/georef-ar-api/).
 * Georef solo geocodifica hacia adelante («Pueyrredon 1745, Hurlingham» → punto); acá se invierte: se piden en una sola consulta masiva los puntos de
 * muchas alturas de esa calle, se elige la más cercana a la posición y se afina en una segunda pasada. OpenStreetMap casi no tiene números de
 * puerta en muchas calles argentinas; las alturas por cuadra de Georef sí cubren todo el país. Es una aproximación: se marca «aprox.» y se
 * descarta si el punto más cercano queda a más de `MAX_DISTANCE_M`.
 */
export const GEOREF = 'https://apis.datos.gob.ar/georef/api';
export const MAX_DISTANCE_M = 120;
const FIRST_PASS_POINTS = 44;

export interface AlturaResult {
  /** La calle como la nombra Georef (en mayúsculas). */
  street: string;
  number: number;
  /** Distancia del punto de esa altura a la posición, en metros. */
  distance: number;
  nomenclatura: string;
}

export type FetchJson = (url: string, init?: { method: 'POST'; body: unknown }) => Promise<unknown>;

export const realFetchJson: FetchJson = async (url, init) => {
  const res = await fetch(url, {
    ...(init ? { method: init.method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(init.body) } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`georef ${res.status}`);
  return res.json();
};

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;
function meters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  return R * Math.hypot(rad(b.lat - a.lat), rad(b.lon - a.lon) * Math.cos(rad((a.lat + b.lat) / 2)));
}

interface Calle {
  nombre: string;
  altura: { inicio: { derecha: number | null; izquierda: number | null }; fin: { derecha: number | null; izquierda: number | null } };
}
interface Direccion {
  altura: { valor: number | null };
  calle: { nombre: string | null };
  nomenclatura: string;
  ubicacion: { lat: number; lon: number };
}

/** Pide el punto de cada altura (una sola consulta masiva) y devuelve las que Georef ubicó. */
async function points(fetchJson: FetchJson, name: string, dep: string, prov: string, alturas: number[]): Promise<{ h: number; d: Direccion }[]> {
  const body = { direcciones: alturas.map((h) => ({ direccion: `${name} ${h}`, departamento: dep, provincia: prov, max: 1 })) };
  const json = (await fetchJson(`${GEOREF}/direcciones`, { method: 'POST', body })) as { resultados?: { direcciones?: Direccion[] }[] };
  const out: { h: number; d: Direccion }[] = [];
  alturas.forEach((h, i) => {
    const d = json.resultados?.[i]?.direcciones?.[0];
    if (d?.ubicacion) out.push({ h, d });
  });
  return out;
}

export async function alturaAt(lat: number, lon: number, street: string, fetchJson: FetchJson = realFetchJson): Promise<AlturaResult | null> {
  const here = { lat, lon };
  const name = street.trim();
  if (!name) return null;
  const loc = ((await fetchJson(`${GEOREF}/ubicacion?lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}`)) as { ubicacion?: { departamento?: { id?: string }; provincia?: { id?: string } } }).ubicacion;
  const dep = loc?.departamento?.id;
  const prov = loc?.provincia?.id;
  if (!dep || !prov) return null;
  const calles = (
    (await fetchJson(`${GEOREF}/calles?${new URLSearchParams({ nombre: name, departamento: dep, provincia: prov, max: '8' })}`)) as { calles?: Calle[] }
  ).calles ?? [];
  let best: { h: number; d: Direccion; dist: number } | null = null;
  for (const calle of calles.slice(0, 4)) {
    const a = calle.altura;
    const vals = [a.inicio.derecha, a.inicio.izquierda, a.fin.derecha, a.fin.izquierda].filter((v): v is number => typeof v === 'number' && v > 0);
    if (vals.length === 0) continue;
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const step = Math.max(1, Math.ceil((hi - lo) / FIRST_PASS_POINTS));
    const first = Array.from({ length: Math.floor((hi - lo) / step) + 1 }, (_, i) => lo + i * step);
    const near = (list: { h: number; d: Direccion }[]) =>
      list.map((p) => ({ ...p, dist: meters(here, p.d.ubicacion) })).reduce<{ h: number; d: Direccion; dist: number } | null>((m, p) => (!m || p.dist < m.dist ? p : m), null);
    const pass1 = near(await points(fetchJson, calle.nombre, dep, prov, first));
    if (!pass1) continue;
    // Segunda pasada: de a 2 en 2 alrededor de la mejor de la primera.
    const around = Array.from({ length: Math.floor((step * 2) / 2) + 1 }, (_, i) => Math.max(lo, pass1.h - step) + i * 2).filter((h) => h <= hi);
    const pass2 = step > 2 ? near(await points(fetchJson, calle.nombre, dep, prov, around)) : null;
    const pick = pass2 && pass2.dist < pass1.dist ? pass2 : pass1;
    if (!best || pick.dist < best.dist) best = pick;
  }
  if (!best || best.dist > MAX_DISTANCE_M) return null;
  return { street: best.d.calle.nombre ?? name, number: best.h, distance: Math.round(best.dist), nomenclatura: best.d.nomenclatura };
}
