import { create } from 'zustand';
import { db } from '@/core/db/db';
import type { WorkoutKind } from '@/core/model/types';
import type { UnitSystem } from '@/core/units/units';
import type { MapSourceMode } from '@/modules/maps/sources';

/**
 * Ajustes no sensibles: se guardan en claro porque se necesitan antes de
 * desbloquear (idioma y tema de la pantalla de desbloqueo).
 */
export type Language = 'es' | 'en';
/** `saver`: ahorro de batería (negro puro para pantallas OLED y menos trabajo de fondo; ver core/power/saver.ts). */
export type Theme = 'dark' | 'light' | 'red' | 'saver';

export interface Settings {
  language: Language;
  theme: Theme;
  units: UnitSystem;
  autoLockMinutes: number;
  /**
   * Ficha médica y contactos de emergencia visibles en la pantalla de bloqueo
   * (una copia sin cifrar, ver core/security/emergencyCard.ts). Opcional: por defecto, no.
   */
  emergencyOnLock: boolean;
  serverUrl: string;
  /** Ya se le cargó el servidor por defecto (para no volver a ponerlo si lo vació). */
  serverDefaulted: boolean;
  weatherUrl: string;
  notificationsEnabled: boolean;
  /** Hora local (0–23) a partir de la cual el servidor envía el aviso del día. */
  notifyHour: number;
  /** Referencia de la brújula: norte geográfico (corrige la declinación) o magnético. */
  northReference: NorthReference;
  /**
   * Lugar para sol, luna y clima: un waypoint guardado (solo su id; las
   * coordenadas quedan cifradas) o `null` para usar el GPS.
   */
  placeWaypointId: string | null;
  /** Avisar si va a llover donde estoy (GPS con la app abierta; última ubicación conocida en segundo plano). */
  rainAlertsHere: boolean;
  /**
   * Con el servidor propio y las notificaciones activadas: mandarle la última
   * ubicación conocida (~1 km) para avisar de lluvia y rayos cerca con la app
   * cerrada. Prendido por defecto; se apaga en Ajustes → Notificaciones.
   */
  serverLocation: boolean;
  /** Avisos de actualizaciones importantes de la app (los manda el servidor, a mano; ver server/src/announce.ts). */
  updateNotices: boolean;
  /** Avisos de peligros naturales cerca (sismos, incendios, inundaciones, ciclones, erupciones), con la app cerrada. */
  hazardNotices: boolean;
  /** Rojo nocturno automático: nunca, en un horario fijo o desde el anochecer hasta el amanecer. */
  redSchedule: RedSchedule;
  /** Horario fijo, "HH:MM" (si `redFrom` > `redTo`, cruza la medianoche). */
  redFrom: string;
  redTo: string;
  /**
   * Ubicación aproximada para calcular el anochecer, redondeada a 0,5° (~50 km):
   * se guarda en claro porque el tema se aplica incluso con la app bloqueada.
   */
  duskPlace: { lat: number; lon: number } | null;
  /** Prender el rojo nocturno al abrir el mapa estelar. */
  starmapRed: boolean;
  starmapLayers: StarmapLayers;
  weatherMapLayers: WeatherMapLayers;
  /** Qué dato del clima se dibuja en cada provincia. */
  weatherMapValue: WeatherMapValue;
  /**
   * De dónde bajar los mapas offline: el servidor propio y, si falla, las
   * fuentes públicas (`auto`); solo el servidor; o solo las públicas.
   */
  mapSource: MapSourceMode;
  /** Capas de los mapas offline de Orientación. */
  mapLayers: MapLayers;
  /** Línea de nieve puesta a mano para la capa de avalanchas (m); `null` = la estima la app con la isoterma de 0 °C. */
  snowlineManual: number | null;
  /** Altura de la nieve a usar cuando no hay isoterma para la zona (sin conexión y sin pronóstico guardado cerca). */
  snowlineFallback: number;
  /** Al seguir un track: el dibujo liviano o el mapa (en 2D o 3D). */
  trackFollowView: 'drawing' | 'map';
  /** Cómo guiarse hasta un punto: la última vista elegida (`null` = preguntar). */
  gotoView: 'map' | '3d' | null;
  /** Sonido y voz al salirte del track que seguís y al llegar (además de la vibración). */
  followSound: boolean;
  /** Ya descartó la tarjeta de primeros pasos del inicio. */
  firstStepsDone: boolean;
  /** El dibujo del track gira con la brújula (lo que tenés adelante, arriba); si no, el norte va arriba. */
  trackDrawingRotate: boolean;
  /** Leer en voz alta los pasos de las guías de primeros auxilios. */
  guideVoice: boolean;
  /** Entorno de la guía de primeros auxilios: con ayuda cerca o lejos. */
  firstAidEnv: FirstAidEnv;
  /** País: define los números de emergencia y de la guía. */
  country: Country;
  /** Zona de la huerta; `null` = la sugerida según la ubicación. */
  gardenZone: GardenZone | null;
  /** Fecha de la última helada de primavera en el lugar, "MM-DD" (opcional). */
  gardenLastFrost: string | null;
  /** Avisar si va a helar y hay plantas sensibles en canteros al aire libre. */
  gardenFrostAlerts: boolean;
  /** Avisar cuando la lluvia no alcanza y hay que regar. */
  gardenWaterAlerts: boolean;
  /**
   * Último riego marcado en cada lugar (ISO), por celda de ~1 km de los
   * waypoints de los canteros: desde ahí se vuelve a contar el balance de agua.
   */
  gardenWateredAt: Record<string, string>;
  /** Nudos marcados como aprendidos (ids de la guía de nudos). */
  knotsLearned: string[];
  /** Avisos que el usuario dio por leídos con «Entendido» (ver ui/Notice.tsx). */
  dismissedNotices: string[];
  /** Qué recorridos se dibujan en el mapa: el que se graba o el último (`auto`), los elegidos, todos o ninguno. */
  mapTracksMode: 'auto' | 'none' | 'chosen' | 'all';
  /** Los recorridos elegidos (ids), para el modo `chosen`. */
  mapTracksChosen: string[];
  /** Mostrar en el mapa los recorridos cargados desde archivos (Wikiloc, GPX…). */
  mapImportedShow: boolean;
  /** País donde se detectó que estás (por la última ubicación) y los vecinos a menos de 50 km de su frontera; `null` = todavía no se detectó. */
  detectedCountry: Country | null;
  detectedNear: Country[];
  /** Países para los que dijiste «No, gracias» al aviso «Estás en X: ¿usar X en la app?» (no se vuelve a preguntar). */
  countryOfferDismissed: Country[];
  /** Países para los que dijiste «No, gracias» a la oferta de bajar mapas sin conexión al llegar. */
  mapOfferDismissed: Country[];
  /** Última actividad elegida en Entrenamiento. */
  trainingKind: WorkoutKind;
  /** Lee en voz alta el tiempo y el ritmo al cerrar cada kilómetro. */
  trainingVoice: boolean;
  /** Cuenta regresiva antes de empezar a grabar una sesión (segundos; 0 = sin cuenta). */
  trainingCountdownS: number;
  /** Seguimiento en vivo en curso (ver modules/training/liveShare.ts): el código solo sirve para mandar posiciones y cortar ese enlace, que vence. */
  liveShare: { id: string; url: string; token: string; expiresAt: string; name: string; sentSeg: number; sentPt: number; lastSentAt: number | null; failing: boolean } | null;
  /** Equipo de entrenamiento (zapatillas, bici, bote) y su desgaste, también en el Inventario: se puede ocultar si no se usa. */
  trainingGear: boolean;
  /** Altura (cm) para el IMC cuando no hay ficha médica propia donde guardarla. */
  heightCm: number | null;
  /** Objetivos de la semana en Entrenamiento (0 = sin objetivo). */
  trainingGoals: { distanceKm: number; minutes: number; sessions: number };
  /** Tamaño de letra del visor de la biblioteca (%). */
  readerFontPct: number;
}

export type GardenZone = 'pampeana' | 'nea' | 'noa' | 'cuyo' | 'patagoniaNorte' | 'patagoniaSur' | 'vallesBolivia' | 'tropicoBolivia' | 'sierraPeru';

export type FirstAidEnv = 'city' | 'wild';
export type Country = 'AR' | 'CL' | 'UY' | 'BO' | 'PE';
export const COUNTRIES: Country[] = ['AR', 'CL', 'UY', 'BO', 'PE'];

/** Por la zona horaria del dispositivo (Chile, Uruguay, Bolivia y Perú tienen la suya); si no, Argentina. */
export function detectCountry(): Country {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  if (/^America\/(Santiago|Punta_Arenas)$|^Pacific\/Easter$/.test(zone)) return 'CL';
  if (zone === 'America/Montevideo') return 'UY';
  if (zone === 'America/La_Paz') return 'BO';
  if (zone === 'America/Lima') return 'PE';
  return 'AR';
}

export interface MapLayers {
  hillshade: boolean;
  contours: boolean;
  /** Mis waypoints y rutas. */
  mine: boolean;
  /** Tracks importados (GPX). */
  tracks: boolean;
  /** Riesgo de avalancha por pendiente (con los colores del inclinómetro), calculado con la elevación descargada. */
  slope: boolean;
  /** Dentro del riesgo de avalancha: rayar las laderas cargadas por viento (recientes y habituales). */
  windLoad: boolean;
  /** Dentro del riesgo de avalancha: marcar en violeta los filos donde se pueden formar cornisas. */
  cornices: boolean;
  /** Relieve en 3D (el mapa se puede inclinar); apagado es el mapa plano. */
  terrain3d: boolean;
}

/** Capas del Mapa de Meteorología. Las que usan internet solo se descargan si están prendidas. */
export interface WeatherMapLayers {
  satellite: boolean;
  radar: boolean;
  regionWeather: boolean;
  earthquakes: boolean;
  /** Alertas de GDACS: ciclones, inundaciones, sequías, incendios forestales y erupciones. */
  hazards: boolean;
  fires: boolean;
  volcanoes: boolean;
  waypoints: boolean;
  /** Lluvia estimada por el servidor propio con el infrarrojo del GOES-19 (toda la región, cada 10 min). */
  satRain: boolean;
  /** Rayos de los últimos minutos (GOES-19, desde el servidor propio) y anillos de 10, 20 y 30 km alrededor mío. */
  lightning: boolean;
  /** Alertas oficiales de los servicios meteorológicos (SMN, DMC, INUMET), desde el servidor propio. */
  official: boolean;
  /** Ríos: las líneas (Natural Earth y OpenStreetMap) y sus estaciones de nivel (INA de Argentina, SENAMHI de Bolivia), pintadas según su estado. */
  rivers: boolean;
  /** Estaciones de mareas (cálculo en el teléfono). */
  tides: boolean;
  /** Oleaje frente a las costas (Open-Meteo Marine, modelo): altura de las olas en una grilla de puntos de mar. */
  waves: boolean;
}

export type WeatherMapValue = 'temp' | 'rain' | 'wind';

export type NorthReference = 'true' | 'magnetic';
export type RedSchedule = 'off' | 'custom' | 'dusk';

export interface StarmapLayers {
  constellationLines: boolean;
  constellationNames: boolean;
  starNames: boolean;
  planets: boolean;
  guide: boolean;
  /** Escala de acimut y círculos de altura (vista de cámara). */
  grid: boolean;
}

export const LANGUAGES: Language[] = ['es', 'en'];
export const THEMES: Theme[] = ['dark', 'light', 'red', 'saver'];
export const AUTO_LOCK_OPTIONS = [1, 5, 15, 30, 60];

function detectLanguage(): Language {
  return globalThis.navigator?.language?.toLowerCase().startsWith('es') === false ? 'en' : 'es';
}

/** Servidor VikArg que viene cargado (se puede cambiar o vaciar en Ajustes). */
export const DEFAULT_SERVER_URL = 'https://valhallarust2.ddns.net';

export const DEFAULT_SETTINGS: Settings = {
  language: detectLanguage(),
  theme: 'dark',
  units: 'metric',
  autoLockMinutes: 5,
  emergencyOnLock: false,
  serverUrl: DEFAULT_SERVER_URL,
  serverDefaulted: true,
  weatherUrl: 'https://api.open-meteo.com',
  notificationsEnabled: false,
  notifyHour: 9,
  northReference: 'true',
  placeWaypointId: null,
  rainAlertsHere: false,
  serverLocation: true,
  updateNotices: true,
  hazardNotices: true,
  redSchedule: 'off',
  redFrom: '21:00',
  redTo: '07:00',
  duskPlace: null,
  starmapRed: true,
  starmapLayers: { constellationLines: true, constellationNames: true, starNames: true, planets: true, guide: true, grid: true },
  weatherMapLayers: { satellite: true, radar: false, regionWeather: true, official: true, earthquakes: true, hazards: true, fires: false, volcanoes: true, waypoints: true, satRain: true, lightning: true, rivers: false, tides: false, waves: false },
  weatherMapValue: 'temp',
  mapSource: 'auto',
  mapLayers: { hillshade: true, contours: true, mine: true, tracks: true, slope: false, windLoad: true, cornices: true, terrain3d: false },
  snowlineManual: null,
  snowlineFallback: 1500,
  trackFollowView: 'drawing',
  gotoView: null,
  followSound: true,
  firstStepsDone: false,
  trackDrawingRotate: false,
  guideVoice: false,
  firstAidEnv: 'city',
  country: detectCountry(),
  gardenZone: null,
  gardenLastFrost: null,
  gardenFrostAlerts: true,
  gardenWaterAlerts: true,
  gardenWateredAt: {},
  knotsLearned: [],
  dismissedNotices: [],
  mapTracksMode: 'auto',
  mapTracksChosen: [],
  mapImportedShow: true,
  detectedCountry: null,
  detectedNear: [],
  countryOfferDismissed: [],
  mapOfferDismissed: [],
  trainingKind: 'walk',
  trainingVoice: false,
  trainingCountdownS: 0,
  liveShare: null,
  trainingGear: true,
  heightCm: null,
  trainingGoals: { distanceKm: 0, minutes: 0, sessions: 0 },
  readerFontPct: 100,
};

const SETTINGS_KEY = 'app';

interface SettingsState {
  settings: Settings;
  loaded: boolean;
  load: () => Promise<void>;
  update: (changes: Partial<Settings>) => Promise<void>;
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  async load() {
    const stored = (await db.settings.get(SETTINGS_KEY))?.value as Partial<Settings> | undefined;
    // Mezclar con los valores por defecto permite agregar ajustes nuevos sin migración.
    set({
      settings: {
        ...DEFAULT_SETTINGS,
        ...stored,
        // Capas nuevas del mapa estelar aparecen activadas aunque ya haya preferencias guardadas.
        starmapLayers: { ...DEFAULT_SETTINGS.starmapLayers, ...stored?.starmapLayers },
        weatherMapLayers: { ...DEFAULT_SETTINGS.weatherMapLayers, ...stored?.weatherMapLayers },
        trainingGoals: { ...DEFAULT_SETTINGS.trainingGoals, ...stored?.trainingGoals },
        mapLayers: { ...DEFAULT_SETTINGS.mapLayers, ...stored?.mapLayers },
        // Quien ya tenía la app sin servidor recibe el que viene cargado, una sola vez:
        // si después lo vacía a propósito, queda vacío.
        ...(stored && !stored.serverDefaulted && !stored.serverUrl ? { serverUrl: DEFAULT_SERVER_URL } : {}),
        serverDefaulted: true,
      },
      loaded: true,
    });
  },
  async update(changes) {
    const settings = { ...get().settings, ...changes };
    set({ settings });
    await db.settings.put({ key: SETTINGS_KEY, value: settings });
  },
}));
