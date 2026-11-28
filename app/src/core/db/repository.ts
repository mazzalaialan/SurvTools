import { openJson, sealJson, open, seal } from '@/core/crypto/crypto';
import { nowIso } from '@/core/model/entity';
import type { EntityMap, EntityTable, Id } from '@/core/model/types';
import { getDek } from '@/core/security/session';
import { db } from './db';

/**
 * Acceso cifrado a una tabla de entidades. Los campos cifrados no se pueden
 * indexar, así que se carga todo a memoria al desbloquear y se consulta ahí
 * (ver ARQUITECTURA §7.3).
 */
export class Repository<K extends EntityTable> {
  constructor(private readonly name: K) {}

  private get table() {
    return db.entityTable(this.name);
  }

  async loadAll({ includeDeleted = false } = {}): Promise<EntityMap[K][]> {
    const dek = getDek();
    const rows = await this.table.toArray();
    const visible = includeDeleted ? rows : rows.filter((r) => r.deletedAt === null);
    return Promise.all(visible.map((r) => openJson<EntityMap[K]>(dek, r)));
  }

  async get(id: Id): Promise<EntityMap[K] | undefined> {
    const row = await this.table.get(id);
    return row ? openJson<EntityMap[K]>(getDek(), row) : undefined;
  }

  async put(entity: EntityMap[K]): Promise<void> {
    const sealed = await sealJson(getDek(), entity);
    await this.table.put({ id: entity.id, updatedAt: entity.updatedAt, deletedAt: entity.deletedAt, ...sealed });
  }

  /** Borrado lógico: la fila se conserva para sincronización y se purga más adelante. */
  async remove(id: Id): Promise<void> {
    const entity = await this.get(id);
    if (!entity) return;
    const now = nowIso();
    await this.put({ ...entity, updatedAt: now, deletedAt: now });
  }
}

export const repos = {
  categories: new Repository('categories'),
  locations: new Repository('locations'),
  items: new Repository('items'),
  lots: new Repository('lots'),
  stockMins: new Repository('stockMins'),
  documents: new Repository('documents'),
  attachments: new Repository('attachments'),
  waypoints: new Repository('waypoints'),
  householdMembers: new Repository('householdMembers'),
  recommendationRules: new Repository('recommendationRules'),
  medicalProfiles: new Repository('medicalProfiles'),
  routes: new Repository('routes'),
  contacts: new Repository('contacts'),
  tracks: new Repository('tracks'),
  gardenBeds: new Repository('gardenBeds'),
  plantings: new Repository('plantings'),
  workouts: new Repository('workouts'),
  outings: new Repository('outings'),
  gear: new Repository('gear'),
  weights: new Repository('weights'),
  farmHerds: new Repository('farmHerds'),
  farmPens: new Repository('farmPens'),
} satisfies { [K in EntityTable]: Repository<K> };

/** Binarios cifrados (fotos), leídos bajo demanda. */
export const blobStore = {
  async put(id: Id, bytes: Uint8Array<ArrayBuffer>): Promise<void> {
    await db.blobs.put({ id, ...(await seal(getDek(), bytes)) });
  },
  async get(id: Id): Promise<Uint8Array<ArrayBuffer> | undefined> {
    const row = await db.blobs.get(id);
    return row ? open(getDek(), row) : undefined;
  },
  async remove(id: Id): Promise<void> {
    await db.blobs.delete(id);
  },
};
