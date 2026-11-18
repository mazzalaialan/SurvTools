import { strFromU8, strToU8 } from 'fflate';
import { blobStore } from '@/core/db/repository';
import type { Id } from '@/core/model/types';

/**
 * Lo que la persona dijo «no lo necesito» en cada botiquín: «¿Qué le falta a este botiquín?» no lo vuelve a pedir. Se guarda cifrado con
 * el resto de los datos; la clave es el id del catálogo de la plantilla o `item:<id>` si el artículo no es de la plantilla.
 */
const ID = 'kit-dismissed';
const EVENT = 'vikarg:kit-dismissed';

type Store = Record<Id, string[]>;

async function read(): Promise<Store> {
  const bytes = await blobStore.get(ID);
  if (!bytes) return {};
  try {
    return JSON.parse(strFromU8(bytes)) as Store;
  } catch {
    return {};
  }
}

async function write(all: Store): Promise<void> {
  await blobStore.put(ID, strToU8(JSON.stringify(all)) as Uint8Array<ArrayBuffer>);
  window.dispatchEvent(new Event(EVENT));
}

export async function dismissedOf(kitId: Id): Promise<string[]> {
  return (await read())[kitId] ?? [];
}

export async function addDismissed(kitId: Id, key: string): Promise<void> {
  const all = await read();
  all[kitId] = [...new Set([...(all[kitId] ?? []), key])];
  await write(all);
}

export async function removeDismissed(kitId: Id, key: string): Promise<void> {
  const all = await read();
  all[kitId] = (all[kitId] ?? []).filter((k) => k !== key);
  await write(all);
}

export async function clearDismissed(kitId: Id): Promise<void> {
  const all = await read();
  delete all[kitId];
  await write(all);
}

/** Avisa cuando cambia lo descartado (para que las otras pantallas abiertas se actualicen). */
export function onDismissedChange(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

/** La clave con que se recuerda un artículo descartado: el id de la plantilla si se reconoce, o el del artículo. */
export function dismissKey(catalogId: string | undefined, itemId: Id): string {
  return catalogId ?? `item:${itemId}`;
}
