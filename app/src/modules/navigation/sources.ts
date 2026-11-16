/**
 * Fuentes de Navegación con su licencia. Decisión de quien dirige (2026-11-14): sin licencia declarada se usa (citando y con la fecha del
 * dato) y con licencia no comercial o con derechos reservados se usa mientras la app sea gratuita y sin publicidad. Para una copia paga,
 * con publicidad o institucional (por ejemplo la de una escuela) se compila con `VITE_COMMERCIAL=1` y se apagan esas fuentes.
 */
export type SourceId = 'ina' | 'tides' | 'open-meteo' | 'armada-cl' | 'inumet' | 'senamhi-bo' | 'ioc' | 'caru' | 'dinagua' | 'dmh-py';
export type LicenseKind = 'open' | 'undeclared' | 'reserved' | 'non-commercial';

export interface NavSource {
  id: SourceId;
  name: string;
  /** Qué datos da dentro de Navegación. */
  provides: string;
  license: LicenseKind;
  /** Texto de la licencia o de su estado, como lo dice la fuente. */
  licenseText: string;
  url: string;
  /** Cita que corresponde mostrar. */
  cite: string;
}

export const NAV_SOURCES: NavSource[] = [
  {
    id: 'ina',
    name: 'INA — Alerta Hidrológico',
    provides: 'Niveles de los ríos de Argentina y sus umbrales',
    license: 'undeclared',
    licenseText: 'Sin licencia declarada para la API (el sitio institucional es CC BY 4.0)',
    url: 'https://alerta.ina.gob.ar/',
    cite: 'Instituto Nacional del Agua (INA), Alerta Hidrológico; escalas de Prefectura Naval y Red Hidrológica Nacional',
  },
  {
    id: 'tides',
    name: 'Constantes armónicas TICON-4',
    provides: 'Mareas calculadas sin conexión',
    license: 'open',
    licenseText: 'CC BY 4.0 (uso comercial permitido, con cita)',
    url: 'https://doi.org/10.17882/109129',
    cite: 'Hart-Davis, Dettmering y Seitz (2025), TICON-4, SEANOE, doi 10.17882/109129; a través de la base abierta Neaps (MIT). Se modificó el formato.',
  },
  {
    id: 'open-meteo',
    name: 'Open-Meteo Marine',
    provides: 'Oleaje y viento previstos',
    license: 'non-commercial',
    licenseText: 'Datos CC BY 4.0; la API gratuita es solo para uso no comercial (para uso comercial hay un plan pago)',
    url: 'https://open-meteo.com/',
    cite: 'Open-Meteo.com; modelos de Météo-France, ECMWF, NOAA y DWD',
  },
  {
    id: 'armada-cl',
    name: 'Armada de Chile, Servicio Meteorológico',
    provides: 'Pronóstico marítimo por zonas de Chile',
    license: 'undeclared',
    licenseText: 'Sin licencia declarada; el servidor permite el acceso (robots.txt vacío, CORS abierto)',
    url: 'https://meteoarmada.directemar.cl/',
    cite: 'Servicio Meteorológico de la Armada de Chile (Directemar)',
  },
  {
    id: 'inumet',
    name: 'INUMET (Uruguay), aviso marino',
    provides: 'Aviso marino oficial del Río de la Plata y el río Uruguay',
    license: 'undeclared',
    licenseText: 'Sin licencia declarada en esa ruta (el portal de datos abiertos de INUMET usa la Licencia de Datos Abiertos de Uruguay, que permite uso comercial con cita); CORS abierto',
    url: 'https://www.inumet.gub.uy/',
    cite: 'Instituto Uruguayo de Meteorología (INUMET), aviso marino',
  },
  {
    id: 'senamhi-bo',
    name: 'SENAMHI Bolivia, reporte de niveles diarios',
    provides: 'Niveles de ríos y del lago Titicaca de Bolivia',
    license: 'reserved',
    licenseText: 'Derechos reservados, sin términos de uso (el enlace «Términos y condiciones» del sitio está vacío)',
    url: 'https://senamhi.gob.bo/hidrologia/rhidrologico',
    cite: 'Servicio Nacional de Meteorología e Hidrología (SENAMHI) de Bolivia, reporte de niveles diarios; ubicación de las estaciones: mapa de pronóstico del SENAMHI y OpenStreetMap (© OpenStreetMap contributors)',
  },
  {
    id: 'caru',
    name: 'CARU, alturas del río Uruguay',
    provides: 'Alturas de los puertos del río Uruguay (lado uruguayo y Salto Grande), leídas por el servidor',
    license: 'undeclared',
    licenseText: 'Sin licencia ni términos declarados; la página de alturas es pública (por HTTP, sin TLS, en un servidor aparte) y se lee desde el servidor propio',
    url: 'https://www.caru.org.uy/nuevositio/',
    cite: 'Comisión Administradora del Río Uruguay (CARU); datos de la Prefectura Naval Argentina, la Prefectura Nacional Naval (Uruguay) y la CTM',
  },
  {
    id: 'dinagua',
    name: 'DINAGUA, Observatorio Hidrológico (Uruguay)',
    provides: 'Niveles de ríos de Uruguay (Río Negro, Yí, Santa Lucía…), leídos por el servidor',
    license: 'undeclared',
    licenseText: 'Sin licencia ni términos declarados; es la API del visualizador público y se lee desde el servidor propio con retraso de unas horas',
    url: 'https://www.ambiente.gub.uy/dinagua-obh/',
    cite: 'Dirección Nacional de Aguas (DINAGUA), Ministerio de Ambiente de Uruguay; datos de DINAGUA, UTE, CTM y OSE',
  },
  {
    id: 'dmh-py',
    name: 'DMH, nivel de los ríos de Paraguay',
    provides: 'Niveles diarios de los ríos Paraguay, Paraná, Pilcomayo y Tebicuary, leídos por el servidor',
    license: 'undeclared',
    licenseText: 'Sin licencia ni términos declarados; la tabla es pública (sin CORS) y se lee desde el servidor propio',
    url: 'https://www.meteorologia.gov.py/nivel-rio/',
    cite: 'Dirección de Meteorología e Hidrología (DMH) de Paraguay, por convenio con la Armada, la ANNP, el MADES y el MOPC; ubicación aproximada: estaciones publicadas por YRATO (Itaipú) y OpenStreetMap (© OpenStreetMap contributors)',
  },
  {
    id: 'ioc',
    name: 'IOC Sea Level Station Monitoring Facility',
    provides: 'Nivel del mar medido casi en vivo (mareógrafos de Chile, Perú y Argentina), vía el servidor con una clave de API',
    license: 'non-commercial',
    licenseText: 'Prohíbe el uso comercial; hay que registrarse; datos sin control de calidad',
    url: 'https://www.ioc-sealevelmonitoring.org/',
    cite: 'Flanders Marine Institute (VLIZ); Intergovernmental Oceanographic Commission (IOC) (2026): Sea level station monitoring facility. doi 10.14284/482',
  },
];

/** ¿Es una copia comercial (paga, con publicidad o institucional)? Se decide al compilar. */
export const COMMERCIAL_BUILD: boolean = import.meta.env.VITE_COMMERCIAL === '1';

/** ¿Se puede usar esta fuente? En una copia comercial se apagan las de licencia no comercial. */
export function sourceEnabled(id: SourceId, commercial: boolean = COMMERCIAL_BUILD): boolean {
  const s = NAV_SOURCES.find((x) => x.id === id);
  return !!s && !(commercial && (s.license === 'non-commercial' || s.license === 'reserved'));
}

/** Las fuentes que se muestran en la lista de licencias de la pantalla (las apagadas no). */
export function visibleSources(commercial: boolean = COMMERCIAL_BUILD): NavSource[] {
  return NAV_SOURCES.filter((s) => sourceEnabled(s.id, commercial));
}
