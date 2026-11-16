/**
 * Pronóstico mareológico oficial del Río de la Plata (Servicio de Hidrografía Naval, SHN): pleamares y bajamares **corregidas por viento**
 * de La Plata, Buenos Aires, San Fernando y el canal Punta Indio (https://www.hidro.gob.ar/oceanografia/pronostico.asp, HTML de ASP clásico,
 * sin CORS: el servidor lo lee). Cada emisión vale unas 13 horas («VALIDO DESDE … HASTA …»). Las alturas son «valores corregidos» sobre el
 * mismo cero de las tablas de marea del SHN (en Buenos Aires, 0,91 m bajo el nivel medio). Derechos reservados del SHN: se usa mientras la
 * app sea gratuita, citando la fuente y la fecha (ver app/src/modules/navigation/sources.ts).
 */
export interface ShnEvent {
  type: 'high' | 'low';
  /** Instante (ISO con el huso -03:00 de Argentina). */
  at: string;
  /** Altura en metros, ya corregida. */
  height: number;
}

export interface ShnStation {
  id: 'la-plata' | 'buenos-aires' | 'san-fernando' | 'martin-garcia' | 'punta-indio' | string;
  name: string;
  section: 'interior' | 'exterior';
  /** Ubicación aproximada del puerto (el SHN no publica coordenadas en esta página). */
  lat: number;
  lon: number;
  events: ShnEvent[];
}

export interface ShnForecast {
  fetchedAt: number;
  /** Fecha de la emisión (AAAA-MM-DD) y ventana de validez (ISO con -03:00). */
  issuedOn: string;
  validFrom: string;
  validTo: string;
  /** Textos de corrección de cada sección, como los publica el SHN («VEINTE CENTIMETROS POR DEBAJO DE LOS VALORES INDICADOS EN LAS TABLAS DE MAREA»). */
  notes: string[];
  stations: ShnStation[];
}

export const SHN_URL = 'https://www.hidro.gob.ar/oceanografia/pronostico.asp';
const UA = 'VikArg-Survival-Tools/1.0';
const TIMEOUT_MS = 30_000;
/** Menos eventos que esto es que la página cambió de formato: no se muestra nada dudoso. */
const MIN_EVENTS = 4;

const MONTHS: Record<string, number> = { ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6, JULIO: 7, AGOSTO: 8, SEPTIEMBRE: 9, SETIEMBRE: 9, OCTUBRE: 10, NOVIEMBRE: 11, DICIEMBRE: 12 };
const strip = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const pad = (n: number | string) => String(n).padStart(2, '0');
const iso = (d: string, m: string, y: string, hh: string, mm: string) => `${y}-${pad(m)}-${pad(d)}T${pad(hh)}:${mm}:00-03:00`;

/** Ubicaciones aproximadas de los puertos de la página (el de Punta Indio es solo del canal). */
const PLACES: { re: RegExp; id: string; lat: number; lon: number }[] = [
  { re: /LA PLATA/i, id: 'la-plata', lat: -34.867, lon: -57.9 },
  { re: /BUENOS AIRES/i, id: 'buenos-aires', lat: -34.567, lon: -58.4 },
  { re: /SAN FERNANDO/i, id: 'san-fernando', lat: -34.443, lon: -58.532 },
  { re: /MART[IÍ]N GARC[IÍ]A/i, id: 'martin-garcia', lat: -34.18, lon: -58.25 },
  { re: /PUNTA INDIO|OYARVIDE/i, id: 'punta-indio', lat: -35.28, lon: -57.22 },
];

/** De la página del SHN: la emisión, su ventana de validez, los textos de corrección y los extremos de cada puerto. */
export function parseShn(html: string, now = Date.now()): ShnForecast {
  const issued = /FECHA:\s*(\d{1,2})\s+DE\s+([A-ZÁÉÍÓÚ]+)\s+DE\s+(\d{4})/i.exec(strip(html));
  const month = issued ? MONTHS[issued[2]!.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')] : undefined;
  if (!issued || !month) throw new Error('la página del SHN no trae la fecha de emisión');
  const text = strip(html);
  const valid = /VALIDO DESDE LAS\s*(\d{1,2}):(\d{2})\s*Hs DE\s*(\d{2})\/(\d{2})\/(\d{4})\s*HASTA LAS\s*(\d{1,2}):(\d{2})\s*Hs DE\s*(\d{2})\/(\d{2})\/(\d{4})/i.exec(text);
  if (!valid) throw new Error('la página del SHN no trae la ventana de validez');
  const validFrom = iso(valid[3]!, valid[4]!, valid[5]!, valid[1]!, valid[2]!);
  const validTo = iso(valid[8]!, valid[9]!, valid[10]!, valid[6]!, valid[7]!);

  const stations = new Map<string, ShnStation>();
  const notes: string[] = [];
  // Una sección por <h3>: «RIO DE LA PLATA INTERIOR» y «EXTERIOR».
  const sections = html.split(/<h3[^>]*class="text-primary"[^>]*>/i).slice(1);
  for (const sec of sections) {
    const title = strip(sec.slice(0, sec.search(/<\/h3>/i)));
    const section: ShnStation['section'] = /EXTERIOR/i.test(title) ? 'exterior' : 'interior';
    const note = /<strong>\s*([^<]*MAREA[^<]*)<\/strong>/i.exec(sec);
    if (note) notes.push(strip(note[1]!).replace(/\.-$/, ''));
    let last: ShnStation | null = null;
    for (const row of sec.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? []) {
      const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => strip(c[1]!));
      if (cells.length < 5) continue;
      const [place, state, hora, altura, fecha] = cells as [string, string, string, string, string];
      if (place) {
        const known = PLACES.find((p) => p.re.test(place));
        const id = known?.id ?? place.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        last = stations.get(id) ?? { id, name: place, section, lat: known?.lat ?? NaN, lon: known?.lon ?? NaN, events: [] };
        stations.set(id, last);
      }
      const d = /(\d{2})\/(\d{2})\/(\d{4})/.exec(fecha);
      const h = /(\d{1,2}):(\d{2})/.exec(hora);
      const height = Number(altura.replace(',', '.'));
      const type = /PLEAMAR/i.test(state) ? 'high' : /BAJAMAR/i.test(state) ? 'low' : null;
      if (!last || !d || !h || !type || !Number.isFinite(height)) continue;
      last.events.push({ type, at: iso(d[1]!, d[2]!, d[3]!, h[1]!, h[2]!), height });
    }
  }
  const list = [...stations.values()].filter((s) => s.events.length > 0 && Number.isFinite(s.lat));
  const total = list.reduce((n, s) => n + s.events.length, 0);
  if (total < MIN_EVENTS || !list.some((s) => s.id === 'buenos-aires')) throw new Error(`la página del SHN trajo ${total} extremos: cambió de formato`);
  if (list.some((s) => s.events.some((e) => e.height < -1 || e.height > 5))) throw new Error('alturas fuera de rango en la página del SHN');
  for (const s of list) s.events.sort((a, b) => a.at.localeCompare(b.at));
  return { fetchedAt: now, issuedOn: `${issued[3]}-${pad(month)}-${pad(issued[1]!)}`, validFrom, validTo, notes, stations: list };
}

/** Lee la página del SHN; falla si cambió de formato. */
export async function fetchShn(now = Date.now(), url = SHN_URL): Promise<ShnForecast> {
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseShn(await res.text(), now);
}
