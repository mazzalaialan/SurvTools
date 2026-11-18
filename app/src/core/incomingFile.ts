import { App } from '@capacitor/app';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { create } from 'zustand';

/**
 * Archivos que llegan a la app nativa desde afuera («Abrir con VikArg» o «Compartir» desde el administrador de archivos, WhatsApp, el correo…):
 * un recorrido (.gpx, .kml, .kmz, .tcx) o un backup (.vikarg). El plugin propio `IncomingFile` (Java) copia el archivo a la caché y acá se lo
 * lee, se lo clasifica y queda pendiente en `useIncoming` hasta que lo atienda quien corresponde: `IncomingFileHandler` para los recorridos
 * (con la bóveda abierta) y el formulario de restaurar para los backups (con o sin bóveda). Si la app estaba bloqueada, queda esperando.
 */
export type IncomingKind = 'track' | 'backup';

export interface IncomingFile {
  kind: IncomingKind;
  name: string;
  bytes: Uint8Array;
}

interface IncomingState {
  file: IncomingFile | null;
  /** Se quita el pendiente (ya se atendió o se descartó). */
  clear: () => void;
}

export const useIncoming = create<IncomingState>((set) => ({ file: null, clear: () => set({ file: null }) }));

interface IncomingPlugin {
  take(): Promise<{ path?: string; name?: string; mime?: string }>;
}

const TRACK_EXT = /\.(gpx|kml|kmz|tcx)(\.gz)?$/i;
const BACKUP_EXT = /\.vikarg$/i;

/** Qué es el archivo: por la extensión y, si el nombre no ayuda (un «Compartir» a veces no la trae), por su contenido. */
export function classifyIncoming(name: string, bytes: Uint8Array): IncomingKind | null {
  if (BACKUP_EXT.test(name)) return 'backup';
  if (TRACK_EXT.test(name)) return 'track';
  const head = new TextDecoder().decode(bytes.subarray(0, 512));
  if (/<gpx\b|<kml\b|<TrainingCenterDatabase\b/i.test(head)) return 'track';
  // Un KMZ es un zip y un .gz empieza con 1f 8b: son recorridos comprimidos.
  if ((bytes[0] === 0x50 && bytes[1] === 0x4b) || (bytes[0] === 0x1f && bytes[1] === 0x8b)) return 'track';
  return null;
}

/** Pide al plugin el archivo pendiente (si hay), lo lee y lo deja en `useIncoming`. */
export async function checkIncoming(plugin: IncomingPlugin = registerPlugin<IncomingPlugin>('IncomingFile')): Promise<IncomingFile | null> {
  const got = await plugin.take();
  if (!got.path) return null;
  const res = await fetch(Capacitor.convertFileSrc(got.path));
  if (!res.ok) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  const name = got.name ?? 'archivo';
  const kind = classifyIncoming(name, bytes);
  // Un archivo que no es ni recorrido ni backup se ignora (el sistema ofrece VikArg para cualquier octet-stream compartido).
  if (!kind) return null;
  const file = { kind, name, bytes };
  useIncoming.setState({ file });
  return file;
}

/** App nativa: revisa al arrancar y cada vez que la app vuelve al frente (un archivo abierto con la app ya andando llega por ahí). */
export function startIncomingFiles(): void {
  const run = () => void checkIncoming().catch((e) => console.error('[archivos] no se pudo recibir el archivo', e));
  run();
  void App.addListener('appStateChange', (s) => {
    if (s.isActive) run();
  });
}
