/**
 * Lector mínimo de CAP 1.2 (Common Alerting Protocol, el estándar de la OMM
 * para alertas): sin dependencias, con o sin prefijo de espacio de nombres
 * ("<info>" o "<cap:info>"). Solo lo que usa la app.
 */

export type CapSeverity = 'Extreme' | 'Severe' | 'Moderate' | 'Minor' | 'Unknown';

export interface OfficialArea {
  desc: string;
  /** Anillos [lat, lon] (CAP da "lat,lon" separados por espacios). */
  polygons: [number, number][][];
}

export interface OfficialAlert {
  /** Identificador estable: identificador CAP + número de bloque <info>. */
  key: string;
  /** Organismo que la emite (SMN, DMC, INUMET…). */
  source: OfficialSource;
  senderName: string;
  event: string;
  headline: string;
  description: string;
  instruction: string;
  severity: CapSeverity;
  /** Desde cuándo rige (ISO); si no viene, desde que se emitió. */
  onset: string;
  expires: string;
  sent: string;
  /** Página oficial de la alerta (o del organismo). */
  web: string;
  areas: OfficialArea[];
}

/** Servicios meteorológicos (CAP; INMET de Brasil; los SENAMHI de Bolivia y Perú, de sus datos abiertos) y SIGMET de ceniza volcánica (aviación). */
export type OfficialSource = 'SMN' | 'DMC' | 'INUMET' | 'INMET' | 'SENAMHI_BO' | 'SENAMHI_PE' | 'SIGMET';
export type CapSource = 'SMN' | 'DMC' | 'INUMET' | 'INMET';

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .trim();
}

/** Todos los elementos `<name>` (con cualquier prefijo) de un trozo de XML. */
function all(xml: string, name: string): string[] {
  const re = new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${name}>`, 'g');
  return [...xml.matchAll(re)].map((m) => m[1]!);
}

const one = (xml: string, name: string) => decode(all(xml, name)[0] ?? '');

export function parsePolygon(text: string): [number, number][] {
  return text
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(',').map(Number) as [number, number])
    .filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180);
}

const SEVERITIES = new Set(['Extreme', 'Severe', 'Moderate', 'Minor']);

/** Un mensaje CAP → una alerta por bloque <info> en español (o el primero). Ignora pruebas y cancelaciones. */
export function parseCap(xml: string, source: OfficialSource, fallbackWeb = ''): OfficialAlert[] {
  const status = one(xml, 'status');
  const msgType = one(xml, 'msgType');
  if ((status && status !== 'Actual') || msgType === 'Cancel') return [];
  const identifier = one(xml, 'identifier');
  const sent = one(xml, 'sent');
  const infos = all(xml, 'info');
  const spanish = infos.filter((i) => /^es/i.test(one(i, 'language') || 'es'));
  return (spanish.length ? spanish : infos.slice(0, 1)).flatMap((info, n) => {
    const areas = all(info, 'area')
      .map((a) => ({ desc: one(a, 'areaDesc'), polygons: all(a, 'polygon').map(parsePolygon).filter((p) => p.length >= 3) }))
      .filter((a) => a.polygons.length);
    const expires = one(info, 'expires');
    if (!areas.length || !expires) return [];
    const severity = one(info, 'severity');
    return [
      {
        key: `${source}:${identifier}:${n}`,
        source,
        senderName: one(info, 'senderName'),
        event: one(info, 'event'),
        headline: one(info, 'headline') || one(info, 'event'),
        description: one(info, 'description'),
        instruction: one(info, 'instruction'),
        severity: (SEVERITIES.has(severity) ? severity : 'Unknown') as CapSeverity,
        onset: one(info, 'onset') || one(info, 'effective') || sent,
        expires,
        sent,
        web: one(info, 'web') || fallbackWeb,
        areas,
      },
    ];
  });
}

/** Punto dentro de un anillo [lat, lon]. */
export function inPolygon(ring: [number, number][], lat: number, lon: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i]!;
    const [yj, xj] = ring[j]!;
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export const covers = (a: OfficialAlert, lat: number, lon: number) => a.areas.some((area) => area.polygons.some((p) => inPolygon(p, lat, lon)));

/** Para comparar: una alerta que sube de severidad se vuelve a avisar. */
export const severityRank = (s: CapSeverity) => ({ Unknown: 0, Minor: 1, Moderate: 2, Severe: 3, Extreme: 4 })[s];
