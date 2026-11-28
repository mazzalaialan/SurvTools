import Dexie, { type Table } from 'dexie';
import type { Sealed } from '@/core/crypto/crypto';
import type { EntityTable, IsoDay } from '@/core/model/types';

/** Fila cifrada: solo los metadatos de sincronización quedan en claro. */
export interface EncryptedRow extends Sealed {
  id: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface KeyValueRow<T = unknown> {
  key: string;
  value: T;
}

/** Índice mínimo de alertas, en claro a propósito (ver ARQUITECTURA §5.3). */
export interface AlertIndexRow {
  /** Id del lote, `rec:<id de regla>` (faltante de recomendaciones) o `min:<id de mínimo>` (debajo del stock mínimo) o `doc:<id>` (vencimiento de un documento). */
  lotId: string;
  itemName: string;
  kind: 'expiry' | 'capacity' | 'shortage' | 'minStock';
  /** Solo vencimientos. */
  dueDate: IsoDay | null;
  /** Desde qué día corresponde notificar. */
  notifyFrom: IsoDay;
}

/** Tablas de la versión 1 del esquema: no se modifica (las nuevas van en su propia versión). */
const V1_ENTITY_TABLES = [
  'categories',
  'locations',
  'items',
  'lots',
  'stockMins',
  'documents',
  'attachments',
  'waypoints',
  'householdMembers',
  'recommendationRules',
] as const satisfies readonly EntityTable[];

export const ENTITY_TABLES = [...V1_ENTITY_TABLES, 'medicalProfiles', 'routes', 'contacts', 'tracks', 'gardenBeds', 'plantings', 'workouts', 'outings', 'gear', 'weights', 'farmHerds'] as const satisfies readonly EntityTable[];

/** Binarios cifrados (fotos), separados para no cargarlos a memoria al desbloquear. */
export interface BlobRow extends Sealed {
  id: string;
}

export class UserDb extends Dexie {
  meta!: Table<KeyValueRow, string>;
  blobs!: Table<BlobRow, string>;
  settings!: Table<KeyValueRow, string>;
  alertIndex!: Table<AlertIndexRow, string>;
  categories!: Table<EncryptedRow, string>;
  locations!: Table<EncryptedRow, string>;
  items!: Table<EncryptedRow, string>;
  lots!: Table<EncryptedRow, string>;
  stockMins!: Table<EncryptedRow, string>;
  documents!: Table<EncryptedRow, string>;
  attachments!: Table<EncryptedRow, string>;
  waypoints!: Table<EncryptedRow, string>;
  householdMembers!: Table<EncryptedRow, string>;
  recommendationRules!: Table<EncryptedRow, string>;
  medicalProfiles!: Table<EncryptedRow, string>;
  routes!: Table<EncryptedRow, string>;
  contacts!: Table<EncryptedRow, string>;
  tracks!: Table<EncryptedRow, string>;
  gardenBeds!: Table<EncryptedRow, string>;
  plantings!: Table<EncryptedRow, string>;
  workouts!: Table<EncryptedRow, string>;
  outings!: Table<EncryptedRow, string>;
  gear!: Table<EncryptedRow, string>;
  weights!: Table<EncryptedRow, string>;
  farmHerds!: Table<EncryptedRow, string>;

  constructor(name = 'vikarg-user') {
    super(name);
    // Cada cambio de esquema es una versión nueva con su migración; nunca se edita una versión publicada.
    const encrypted = Object.fromEntries(V1_ENTITY_TABLES.map((t) => [t, 'id, updatedAt']));
    this.version(1).stores({
      meta: 'key',
      settings: 'key',
      blobs: 'id',
      alertIndex: 'lotId, dueDate',
      ...encrypted,
    });
    // v2: el índice de alertas se consulta por fecha de aviso. Se regenera completo al desbloquear.
    this.version(2)
      .stores({ alertIndex: 'lotId, notifyFrom' })
      .upgrade((tx) => tx.table('alertIndex').clear());
    // v3: fichas médicas y rutas de waypoints.
    this.version(3).stores({ medicalProfiles: 'id, updatedAt', routes: 'id, updatedAt' });
    // v4: contactos de emergencia.
    this.version(4).stores({ contacts: 'id, updatedAt' });
    // v5: tracks importados de GPX (Wikiloc y otras apps).
    this.version(5).stores({ tracks: 'id, updatedAt' });
    // v6: huerta (canteros y siembras).
    this.version(6).stores({ gardenBeds: 'id, updatedAt', plantings: 'id, updatedAt' });
    // v7: entrenamiento (sesiones y salidas).
    this.version(7).stores({ workouts: 'id, updatedAt', outings: 'id, updatedAt' });
    // v8: equipo de entrenamiento e historial de peso.
    this.version(8).stores({ gear: 'id, updatedAt', weights: 'id, updatedAt' });
    // v9: granja (lotes de animales con sus eventos y su producción).
    this.version(9).stores({ farmHerds: 'id, updatedAt' });
  }

  entityTable(name: EntityTable): Table<EncryptedRow, string> {
    return this.table(name);
  }
}

export let db = new UserDb();

/** Solo para tests: reemplaza la base por una aislada. */
export function setTestDb(name: string): UserDb {
  db = new UserDb(name);
  return db;
}
