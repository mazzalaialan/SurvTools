/**
 * Modelo de datos del usuario (ver docs/ARQUITECTURA.md §5).
 * Todas las entidades se guardan cifradas; solo `id`, `updatedAt` y
 * `deletedAt` quedan en claro para sincronización y purga.
 */

export type Id = string; // UUID v7
export type IsoDate = string; // ISO 8601 (fecha-hora)
export type IsoDay = string; // YYYY-MM-DD

export interface BaseEntity {
  id: Id;
  createdAt: IsoDate;
  updatedAt: IsoDate;
  deletedAt: IsoDate | null;
}

export type ControlType = 'none' | 'expiryDate' | 'shelfLife' | 'capacity';

/** Configuración de alertas; en el artículo, `null` significa "hereda de la categoría". */
export interface AlertConfig {
  controlType: ControlType;
  alertsEnabled: boolean;
  alertLeadDays: number;
  alertCapacityPct: number;
}

export interface Category extends BaseEntity, AlertConfig {
  /** Clave de traducción para categorías del sistema; `null` en las del usuario. */
  nameKey: string | null;
  name: string;
  isSystem: boolean;
  hidden: boolean;
  icon: string;
  color: string;
  order: number;
}

export const MAX_LOCATION_DEPTH = 4;

/** Botiquines específicos por problema; "other" para los que arme el usuario. */
export const KIT_TYPES = ['general', 'trauma', 'bleeding', 'anaphylaxis', 'burns', 'other'] as const;
export type KitType = (typeof KIT_TYPES)[number];

export interface Location extends BaseEntity {
  parentId: Id | null;
  depth: number; // 1..MAX_LOCATION_DEPTH
  name: string;
  notes: string;
  waypointId: Id | null;
  /** Si no es `null`, la ubicación es un botiquín (una caja o mochila) de ese tipo. */
  kitType: KitType | null;
}

export interface Item extends BaseEntity {
  name: string;
  categoryId: Id;
  notes: string;
  barcode: string | null;
  /** Texto libre, sin conversiones (ej.: "latas", "L"). */
  unit: string;
  /** Peso por unidad, siempre en gramos. */
  weightGrams: number | null;
  favorite: boolean;
  controlType: ControlType | null;
  alertsEnabled: boolean | null;
  alertLeadDays: number | null;
  alertCapacityPct: number | null;
}

export interface Lot extends BaseEntity {
  itemId: Id;
  locationId: Id;
  /** Total en la unidad del artículo. Si se carga por envases, = packageCount × packageSize. */
  quantity: number;
  /** Carga por envases (ej.: 4 botellas de 6 L). Todos `null` = cantidad directa. */
  packageCount: number | null;
  packageSize: number | null;
  packageName: string | null;
  /** Peso de cada envase vacío; solo se suma al peso si se cargó. */
  packageTareGrams: number | null;
  expiryDate: IsoDay | null;
  manufactureDate: IsoDay | null;
  shelfLifeMonths: number | null;
  capacityTotal: number | null;
  capacityRemaining: number | null;
  capacityUnit: string | null;
  notes: string;
}

export interface StockMin extends BaseEntity {
  itemId: Id;
  locationId: Id;
  minQuantity: number;
}

export interface PersonalDocument extends BaseEntity {
  title: string;
  notes: string;
  tags: string[];
  /** Vencimiento del documento (DNI, pasaporte, licencia…). Ausente en los guardados antes de 0.7.4. */
  expiryDate?: IsoDay | null;
  /** Médicos (estudios, recetas, carnet de vacunas…) o generales. Ausente = general. */
  category?: DocumentCategory;
  /** De quién es: una ficha médica (persona o mascota); ausente o null = general. */
  profileId?: Id | null;
  /** Posición elegida por el usuario dentro de su grupo; sin ordenar, van al final por título. */
  order?: number;
}

export type DocumentCategory = 'general' | 'medical';

export type AttachmentOwner = 'item' | 'document' | 'location' | 'waypoint' | 'medicalProfile' | 'planting';

export interface Attachment extends BaseEntity {
  ownerType: AttachmentOwner;
  ownerId: Id;
  mime: string;
  width: number;
  height: number;
  order: number;
  /** Los bytes viven cifrados en la tabla `blobs` bajo este mismo id; se leen bajo demanda. */
  sizeBytes: number;
}

/** Para qué sirve un lugar en una emergencia: salida, refugio, agua o algo a evitar. */
export type WaypointRole = 'escape' | 'shelter' | 'water' | 'danger';

export interface Waypoint extends BaseEntity {
  name: string;
  lat: number;
  lon: number;
  alt: number | null;
  icon: string;
  notes: string;
  /** Avisar si va a llover en este punto. */
  rainAlerts: boolean;
  /** Zona privada: radio en metros alrededor de este punto que se saca del recorrido al compartir una salida (0 o ausente: no es zona privada). */
  privateRadiusM?: number | null;
  /** Qué es el lugar en una emergencia (punto de escape, refugio, agua, peligro); sin valor = un lugar común. */
  role?: WaypointRole | null;
}

/** Lista ordenada de waypoints con nombre (ej.: "Evacuación al refugio"). */
export interface Route extends BaseEntity {
  name: string;
  /** En orden de recorrido; un punto puede repetirse (ida y vuelta). */
  waypointIds: Id[];
  notes: string;
  /**
   * Ruta planificada en el mapa: los puntos van acá adentro y NO son waypoints
   * (no salen en la lista de lugares ni dan alertas de clima), salvo los que se
   * guardan como lugar a mano. Cada tramo entre dos puntos es una pierna.
   */
  line?: { lat: number; lon: number }[];
  /** Puntos con nombre de un track que se pasó a ruta (sus waypoints): la hoja impresa los usa como tramos en vez de cada punto de la línea. */
  stops?: { name: string; lat: number; lon: number }[];
}

/** `radio`: frecuencia guardada por el usuario (p. ej. la que le dieron en un refugio). */
export type ContactKind = 'police' | 'fire' | 'medical' | 'hospital' | 'civilDefense' | 'fuel' | 'tyres' | 'carRepair' | 'pharmacy' | 'aed' | 'water' | 'shelter' | 'atm' | 'nautical' | 'other' | 'radio' | 'doctor' | 'vet' | 'insurance';

/** Contacto de emergencia: comisaría, bomberos, hospital, médico, familiar… */
export interface EmergencyContact extends BaseEntity {
  kind: ContactKind;
  name: string;
  phone: string;
  phone2: string;
  address: string;
  /** Ubicación, si se conoce (para ordenar por cercanía y abrir el mapa exacto). */
  lat: number | null;
  lon: number | null;
  notes: string;
  /** De dónde salió (búsqueda de cercanos): para saber qué tan confiable es. */
  source: string | null;
  /** Solo frecuencias de radio (ausentes en los contactos guardados antes de 0.10). */
  frequency?: string;
  /** Tono (CTCSS/DCS), canal u otro dato para sintonizar. */
  tone?: string;
  /** Médicos y veterinarios: especialidad ("Psiquiatra", "Pediatra"). */
  specialty?: string;
  /** Obras sociales: sus teléfonos con nombre ("Riesgo de vida"…); `phone` es copia del primero. */
  phones?: InsurancePhone[];
}

export interface HouseholdMember extends BaseEntity {
  label: string;
  count: number;
}

export interface RecommendationRule extends BaseEntity {
  description: string;
  categoryId: Id | null;
  itemId: Id | null;
  quantityPerMemberPerDay: number;
  unit: string;
  targetDays: number;
  /** Miembros a los que aplica; vacío = todos. */
  memberIds: Id[];
  /** `false`: la regla queda guardada pero no se controla (ni avisa). Sin el campo, se controla. */
  active?: boolean;
}

export interface Medication {
  name: string;
  dose: string;
  /** Indicaciones en texto libre ("en ayunas", "con comida"); antes de 0.11 era el único dato de cuándo tomarlo. */
  schedule: string;
  /** Cada cuántas horas (24 = una vez por día, 168 = semanal); 0 = solo si hace falta; null = sin indicar. */
  everyHours?: number | null;
  /** Hora de la primera toma del día ("08:00"); las demás se calculan. */
  firstTime?: string | null;
}

export type ProfileKind = 'person' | 'pet';
export type PetSpecies = 'dog' | 'cat' | 'other';

/** Ficha médica de una persona o una mascota del grupo familiar. */
/**
 * Un profesional de la salud de la persona o mascota (de cabecera, psiquiatra,
 * veterinario…). Desde 0.11.1 es un contacto compartido (`contactId`): el mismo
 * médico puede estar en varias fichas y sus datos se cambian en un solo lugar.
 * `name` y `phone` quedan como copia para versiones anteriores.
 */
export interface Doctor {
  contactId?: Id | null;
  /** Para esta persona ("Médico de cabecera", "Psiquiatra"). */
  role: string;
  name: string;
  phone: string;
}

/**
 * Obra social o prepaga. Desde 0.13 el nombre y los teléfonos son de un contacto
 * compartido (`contactId`, la misma obra social para toda la familia); acá quedan
 * como copia. El plan y la credencial son de cada persona.
 */
export interface HealthInsurance {
  contactId?: Id | null;
  name: string;
  plan: string;
  /** Número de credencial / afiliado. */
  memberNumber: string;
  /** Primer teléfono de `phones`: copia para versiones anteriores a 0.13. */
  emergencyPhone: string;
  /** Teléfonos de la obra social ("Riesgo de vida", "Emergencias"…), desde 0.13. */
  phones?: InsurancePhone[];
}

export interface InsurancePhone {
  /** Para qué es; vacío = "Teléfono de emergencias" (el único que había antes). */
  label: string;
  number: string;
}

/** Un contacto de emergencia: otra ficha médica (sus datos se leen de ahí) o un texto libre ("María 11 5555-1234"). */
export interface EmergencyContactRef {
  profileId: Id | null;
  text: string;
}

export interface MedicalProfile extends BaseEntity {
  kind: ProfileKind;
  name: string;
  /** Solo personas: "Hijo", "Madre", "Pareja"… (ausente en las fichas anteriores a 0.11). */
  relationship?: string;
  /** Solo personas: para llamarla desde Contactos de emergencia. */
  phone?: string;
  /** Solo personas: si aparece en Contactos de emergencia (por defecto, sí). */
  inContacts?: boolean;
  /** La ficha del usuario (parentesco "Yo"): sus datos van arriba de todo en Contactos. Solo una. */
  isMe?: boolean;
  /**
   * Contactos de emergencia, en orden de prioridad (desde 0.11.1). `emergencyContact`
   * queda como texto de respaldo para versiones anteriores.
   */
  emergencyContacts?: EmergencyContactRef[];
  /** Médicos (en mascotas, veterinarios), desde 0.11.1: antes iban en el texto de `doctor`, que queda como respaldo. */
  doctors?: Doctor[];
  insurance?: HealthInsurance;
  birthDate: IsoDay | null;
  /** Peso en kg, solo personas: lo usa el Entrenamiento para estimar las calorías (desde 0.44). */
  weightKg?: number | null;
  /** Altura en cm, solo personas: para el IMC en Entrenamiento > Peso. */
  heightCm?: number | null;
  /** "A+", "0-", etc.; vacío si no se sabe. */
  bloodType: string;
  allergies: string;
  conditions: string;
  /** Solo personas: si está embarazada (y la fecha probable de parto, si la sabe). `null` o ausente = no. Se usa para personalizar el botiquín; no sale del dispositivo. */
  pregnancy?: { dueDate: IsoDay | null } | null;
  medications: Medication[];
  emergencyContact: string;
  /** Médico y obra social; en mascotas, veterinario. */
  doctor: string;
  notes: string;
  /** Solo mascotas (en personas quedan en `null`). */
  pet: PetHealth | null;
}

export interface PetHealth {
  species: PetSpecies;
  /** Especie escrita si es "other" (ej.: conejo). */
  speciesOther: string;
  lastRabiesVaccine: IsoDay | null;
  /** Séxtuple/polivalente en perros, triple felina en gatos. */
  lastSpeciesVaccine: IsoDay | null;
  lastDeworming: IsoDay | null;
  /** `null` = no se sabe. */
  neutered: boolean | null;
  lastFleaTreatment: IsoDay | null;
}

/** Mapa de tabla → tipo de entidad. Agregar una entidad = agregarla acá y en db.ts. */
export interface EntityMap {
  categories: Category;
  locations: Location;
  items: Item;
  lots: Lot;
  stockMins: StockMin;
  documents: PersonalDocument;
  attachments: Attachment;
  waypoints: Waypoint;
  householdMembers: HouseholdMember;
  recommendationRules: RecommendationRule;
  medicalProfiles: MedicalProfile;
  routes: Route;
  contacts: EmergencyContact;
  tracks: Track;
  gardenBeds: GardenBed;
  plantings: Planting;
  workouts: Workout;
  outings: Outing;
  gear: Gear;
  weights: WeightEntry;
  farmHerds: FarmHerd;
  farmPens: FarmPen;
}

/** Actividad del Entrenamiento (ver modules/training/activities.ts). */
export type WorkoutKind =
  | 'walk' | 'run' | 'trek'
  | 'kayak' | 'canoe' | 'rowboat' | 'sup' | 'rafting'
  | 'roadBike' | 'mtb' | 'gravel' | 'cityBike' | 'ebike'
  | 'treadmill' | 'elliptical' | 'stairClimber';

/** Vehículo de un recorrido grabado en modo «Conducir» (ver modules/tracks/drive.ts). */
export type VehicleKind = 'car' | 'motorcycle' | 'fourByFour' | 'truck' | 'other';

/** Resumen de un recorrido en vehículo: solo lo útil al manejar (sin calorías ni ritmo). */
export interface DriveSummary {
  maxKmh: number;
  /** Velocidad media en movimiento (sin paradas) y total (con paradas). */
  avgMovingKmh: number;
  avgKmh: number;
  movingS: number;
  stoppedS: number;
}

/**
 * Una sesión de entrenamiento: grabada con el GPS (el recorrido queda en el
 * track `trackId`, con su mapa y su perfil de altura) o cargada a mano
 * (actividades bajo techo y las que se olvidaron de grabar).
 */
export interface Workout extends BaseEntity {
  kind: WorkoutKind;
  name: string;
  /** Cuándo empezó (ISO). */
  startedAt: string;
  /** De dónde salen los datos: GPS de la app, carga manual o un reloj (más adelante). */
  source: 'gps' | 'manual' | 'watch';
  /** El recorrido grabado (en Tracks), si hubo GPS. */
  trackId: Id | null;
  /** Segundos, del primer al último punto (sin pausas) y en movimiento (sin paradas). */
  totalS: number;
  movingS: number;
  distanceM: number;
  ascentM: number;
  descentM: number;
  minEle: number | null;
  maxEle: number | null;
  avgSpeedKmh: number;
  paceSPerKm: number;
  maxSpeedKmh: number;
  /** Segundos de cada kilómetro completo. */
  splitsS: number[];
  /** Estimadas con el peso de la persona (ver modules/training/energy.ts). */
  calories: number;
  weightKg: number | null;
  packKg: number | null;
  /** Cinta: inclinación promedio (%). */
  inclinePct: number | null;
  /** Elíptica y escalador. */
  intensity: 'light' | 'moderate' | 'vigorous' | null;
  /** Frecuencia cardíaca (latidos por minuto): cuando se conecten relojes. */
  avgHr: number | null;
  maxHr: number | null;
  notes: string;
  /** La salida a la que pertenece, si la hay. */
  outingId: Id | null;
  /** Cómo me sentí (1 muy mal a 5 muy bien). */
  feeling?: 1 | 2 | 3 | 4 | 5 | null;
  /** Terreno o lugar: ver modules/training/activities.ts (TERRAINS). */
  terrain?: string | null;
  /** El clima al terminar, de Open-Meteo (solo si había internet): grados, código del cielo, viento km/h y humedad %. */
  weather?: { tempC: number; code: number; windKmh: number; humidity: number } | null;
  /** Si fue por intervalos: el plan que se siguió. */
  intervals?: IntervalPlanData | null;
  /** Vueltas que se marcaron. */
  laps?: LapMark[];
  /** El equipo usado (zapatillas, bici, bote): suma sus kilómetros. */
  gearId?: Id | null;
}

/** Plan de intervalos (ver modules/training/intervals.ts). Si `workM` o `restM` están, esa etapa se mide en metros y no en segundos. */
export interface IntervalPlanData {
  warmupS: number;
  workS: number;
  restS: number;
  repeats: number;
  cooldownS: number;
  workM?: number | null;
  restM?: number | null;
}

/** Una vuelta marcada: cuánto tiempo y distancia llevaba la sesión al apretar el botón. */
export interface LapMark {
  elapsedS: number;
  distanceM: number;
}

/** Equipo que se gasta con el uso (zapatillas, bici, bote, remo): suma los km de las actividades donde se usó. */
export interface Gear extends BaseEntity {
  name: string;
  /** En qué actividades se ofrece (vacío: en todas). */
  kinds: WorkoutKind[];
  /** Kilómetros que ya tenía cuando se cargó. */
  startKm: number;
  /** Km de vida útil recomendados (0: sin aviso). */
  retireKm: number;
  /** Artículo del Inventario con el que se vincula (para ver su desgaste ahí). */
  inventoryItemId?: Id | null;
  retired?: boolean;
}

/** Un registro del historial de peso (kg, en un día). */
export interface WeightEntry extends BaseEntity {
  /** Día (AAAA-MM-DD). */
  day: string;
  kg: number;
  note?: string;
}

/** Una salida: varias actividades juntas (por ejemplo "Salida al Platita"), con sus totales, mapa y desnivel. */
export interface Outing extends BaseEntity {
  name: string;
  notes: string;
  /** Si se compartió con un enlace público (ver modules/training/share.ts): el código de borrado queda solo acá, cifrado. */
  share?: { id: string; url: string; deleteToken: string; sharedAt: string; expiresAt: string };
  /** Plan de la salida: hora de regreso, integrantes, a quién avisar y qué hacer si no se vuelve. */
  plan?: OutingPlan;
}

/** Lo que se acuerda antes de salir (ver modules/training/outingPlan.ts). Las horas son ISO con zona. */
export interface OutingPlan {
  startsAt: string | null;
  /** Hora límite de regreso: pasada esa hora sin avisar, algo anda mal. */
  returnBy: string | null;
  leader: string;
  /** Integrantes, uno por línea. */
  members: string;
  /** A quién avisar (nombre y teléfono). */
  contact: string;
  /** Plan B: qué hacer si no se llega o se demora. */
  contingency: string;
  /** Cada "estoy bien" que se dio durante la salida. */
  checkIns: { at: string; note: string }[];
  /** Se volvió: la salida terminó y se apagan los avisos. */
  closedAt: string | null;
}

/** Tierra del cantero: cuánta agua guarda (arenosa poca, franca la media, arcillosa algo más). */
export type SoilKind = 'sandy' | 'loam' | 'clay';

export type BedSide = 'front' | 'back' | 'left' | 'right';

/** Algo que tapa el sol entre dos rumbos, hasta cierta altura sobre el horizonte. */
export interface SunObstacle {
  id: Id;
  /** Rumbos geográficos (0–359°) del sector, en sentido horario de uno a otro. */
  fromDeg: number;
  toDeg: number;
  /** Ángulo aparente del borde de arriba sobre el horizonte, en grados. */
  heightDeg: number;
}

/** Cantero o maceta de la huerta (ARQUITECTURA §10.1). Se dibuja como grilla de cuadros de 30 cm. */
export interface GardenBed extends BaseEntity {
  name: string;
  kind: 'bed' | 'pot';
  /** En invernadero: no cuenta para el aviso de helada ni para el riego por lluvia. */
  greenhouse: boolean;
  widthCm: number;
  lengthCm: number;
  /** Horas de sol directo por día (a mano, o las que dio el cálculo con `sunMode: 'calculated'`). */
  sunHours: number;
  /** De dónde sale `sunHours`; sin valor = a mano. Ver modules/garden/sun.ts. */
  sunMode?: 'manual' | 'calculated';
  /** Rumbo geográfico (0–359°) hacia el que mira el frente del cantero; los lados se miden desde ahí. */
  bearingDeg?: number | null;
  /** Paredes pegadas a un lado del cantero: lado → altura en cm. */
  walls?: Partial<Record<BedSide, number>>;
  /** Obstáculos a distancia (árbol, edificio, cerro): un sector del horizonte con su altura aparente. */
  obstacles?: SunObstacle[];
  /** Tierra del cantero (para el aviso de riego); sin valor = franca. */
  soil?: SoilKind;
  /** Media sombra (malla) encima: porcentaje de sol que frena (0 = sin malla). */
  shadePct?: number;
  /** Dónde está (uno de "Mis waypoints"); `null` = el lugar general de la huerta. */
  waypointId: Id | null;
  notes: string;
  order: number;
}

export type PlantingStatus = 'nursery' | 'growing' | 'harvesting' | 'done';

export interface HarvestEntry {
  id: Id;
  date: IsoDay;
  quantity: number;
  /** "kg", "u" o "atados". */
  unit: string;
  /** Lote del inventario creado con esta cosecha (si se sumó al inventario). */
  lotId: Id | null;
}

/** Una siembra: un cultivo en un cantero (o todavía en almácigo), con su seguimiento y su cosecha. */
export interface Planting extends BaseEntity {
  /** Id de la ficha de cultivo (modules/garden/crops.ts). */
  cropId: string;
  /** Variedad o nombre propio (ej.: "Tomate platense"). */
  variety: string;
  /** `null` mientras está en el almácigo. */
  bedId: Id | null;
  /** Cuadros que ocupa: fila * columnas + columna. */
  cells: number[];
  method: 'direct' | 'nursery';
  sownOn: IsoDay;
  transplantedOn: IsoDay | null;
  status: PlantingStatus;
  endedOn: IsoDay | null;
  notes: string;
  harvests: HarvestEntry[];
  /** Almácigo que está AFUERA, en este lugar (un waypoint): recibe los avisos de helada y riego. Sin valor = adentro de casa, sin avisos. */
  nurseryWaypointId?: Id | null;
}

/** Punto con nombre que trae un track importado (refugio, agua, mirador…). No es un waypoint propio. */
export interface TrackWaypoint {
  name: string;
  lat: number;
  lon: number;
  ele: number | null;
  desc: string;
}

/**
 * Recorrido importado de un GPX (Wikiloc u otra app) o grabado con la app.
 * Va aparte de los waypoints y rutas propios: sus puntos no se mezclan con
 * los del usuario.
 */
/** Un corte de la grabación (pantalla apagada): cuándo fue y si se unió con una recta o quedó como hueco. */
export interface TrackGap {
  from: number;
  to: number;
  joined: boolean;
  /**
   * Extremos de la recta con la que se unió el corte ([lat, lon]: el último punto antes y el primero después) y su largo en metros.
   * Se guardan aparte porque al terminar el recorrido se simplifica y esos puntos pueden perderse; con ellos el corte se dibuja
   * en otro color. Esa distancia SÍ suma al recorrido (es menos de lo que se caminó, pero no se descarta).
   */
  a?: [number, number];
  b?: [number, number];
  lengthM?: number;
  /** Si el corte se cerró siguiendo un track cargado en vez de con una recta: el nombre de ese track y los puntos [lat, lon] del camino. `lengthM` es el largo de ese camino. */
  via?: string;
  path?: [number, number][];
}

export interface Track extends BaseEntity {
  /** Grabado con la app (no importado). */
  recorded?: boolean;
  /** Track armado a partir de una ruta planificada (para seguirla): no sale en la lista de Tracks. */
  routeId?: Id;
  /** Grabación en curso: se guarda a medida que avanza, para no perderla si la app se cierra. */
  recording?: boolean;
  /** Grabación en curso que la persona pausó a propósito: al reabrir la app sigue en pausa (si no, en la app nativa se reanuda sola). */
  recPaused?: boolean;
  /** Versión del cálculo del desnivel (`ascentM` y `descentM`): 5 = con la altura del GPS alisada (ver `tracks/gpx.ts`). Sin este campo, es el cálculo viejo, que sumaba el ruido del GPS. */
  elevationV?: number;
  /** Tiempo grabando, sin contar las pausas. */
  durationS?: number;
  /** Mientras se graba: clave privada para leer los puntos grabados con la app bloqueada (ver tracks/lockedBuffer). */
  recKey?: JsonWebKey;
  /** Grabado como sesión de Entrenamiento: qué actividad y la carga (mochila, kg). Al terminar crea la actividad. */
  activity?: WorkoutKind;
  activityPackKg?: number | null;
  /** Grabado en modo «Conducir»: con qué vehículo. Nunca es una sesión de Entrenamiento (sin calorías ni ritmo). */
  vehicle?: VehicleKind;
  /** Resumen de la conducción, calculado al terminar con todos los puntos. */
  drive?: DriveSummary;
  /** Sesión por intervalos (ver modules/training/intervals.ts). */
  intervals?: IntervalPlanData | null;
  /** Vueltas marcadas con el botón durante la grabación: tiempo (s) y distancia (m) acumulados al marcar. */
  laps?: LapMark[];
  /** Cortes de la grabación (pantalla apagada). */
  gaps?: TrackGap[];
  name: string;
  desc: string;
  /** De dónde salió ("Wikiloc", o el nombre del archivo). */
  source: string;
  /** Página original (Wikiloc pone el link a la ruta). */
  link: string | null;
  /** Segmentos simplificados: [lat, lon, altura o null]. */
  /** [lat, lon, altura o null, hora (s desde 1970, solo si se grabó con la app)]. */
  segments: [number, number, number | null, number?][][];
  waypoints: TrackWaypoint[];
  /** Calculados con todos los puntos originales, antes de simplificar. */
  distanceM: number;
  ascentM: number;
  descentM: number;
  minEle: number | null;
  maxEle: number | null;
  notes: string;
}

export type EntityTable = keyof EntityMap;

/** Granja: un corral, gallinero, conejera, colmenar o estanque. Con waypoint, avisos de calor y frío para los animales que tiene. */
export interface FarmPen extends BaseEntity {
  name: string;
  waypointId: Id | null;
  notes: string;
}

/** Granja: un lote de animales (p. ej. «Gallinas del fondo»), con lo que les pasó y lo que produjeron. Ver modules/farm/herd.ts. */
export interface FarmHerd extends BaseEntity {
  name: string;
  /** Id de la ficha de Granja (gallina, conejo, vaca…). */
  speciesId: string;
  count: number;
  breed: string;
  startedOn: IsoDay;
  notes: string;
  /** Corral donde está (como el cantero de una siembra en Huerta). */
  penId?: Id | null;
  events: FarmEvent[];
  production: FarmProduction[];
}
export interface FarmEvent {
  id: Id;
  date: IsoDay;
  kind: 'vaccine' | 'deworm' | 'birth' | 'death' | 'slaughter' | 'bought' | 'sold' | 'note';
  /** Cuántos animales entran (nacimientos, compras) o salen (muertes, faena, ventas). */
  count: number | null;
  note: string;
}
export interface FarmProduction {
  id: Id;
  date: IsoDay;
  product: 'eggs' | 'milk' | 'meat' | 'honey' | 'wool';
  quantity: number;
  unit: string;
  /** Lote del inventario creado al sumarlo (si se sumó). */
  lotId: Id | null;
}
