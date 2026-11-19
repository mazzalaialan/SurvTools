import { create } from 'zustand';
import { isAndroid } from '@/core/platform';

/**
 * Aviso de versión nueva para el paquete portable (ARQUITECTURA §13). La
 * versión de internet se actualiza sola; el paquete es una copia fija, así que
 * con conexión consulta la última Release de GitHub (una vez por día). Lo mismo vale para la app nativa instalada a mano con un APK: la web que
 * lleva dentro no se actualiza sola, así que también consulta la última Release (y ofrece el `.apk` si la Release lo trae).
 */

const REPO = 'mazzalaialan/SurvTools';
export const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;
const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const CHECK_EVERY_MS = 24 * 60 * 60_000;
/** La app nativa consulta en cada apertura y al volver al frente, con un freno corto (la API de GitHub sin clave limita los pedidos por hora). */
const APK_CHECK_EVERY_MS = 15 * 60_000;
const STATE_KEY = 'vikarg-portable-update';

export interface LatestRelease {
  version: string;
  /** Enlace directo al .zip del paquete, o a la página de la versión. */
  downloadUrl: string;
  /** Enlace directo al `.apk` de la Release, si lo trae; si no, la página de la versión. */
  apkUrl: string;
}

interface Stored {
  checkedAt: number;
  latest: LatestRelease | null;
  dismissed: string | null;
}

/** "0.10.2" > "0.9.9"; acepta la "v" del tag. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map((n) => Number.parseInt(n, 10) || 0);
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return Math.sign(d);
  }
  return 0;
}

export function parseRelease(json: unknown): LatestRelease | null {
  const r = json as { tag_name?: string; html_url?: string; assets?: { name?: string; browser_download_url?: string }[] };
  if (!r?.tag_name) return null;
  const zip = r.assets?.find((a) => a.name?.startsWith('vikarg-survival-portable-') && a.name.endsWith('.zip'));
  const apk = r.assets?.find((a) => a.name?.toLowerCase().endsWith('.apk'));
  const page = r.html_url ?? RELEASES_URL;
  return { version: r.tag_name.replace(/^v/, ''), downloadUrl: zip?.browser_download_url ?? page, apkUrl: apk?.browser_download_url ?? page };
}

function readStored(): Stored {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) return JSON.parse(raw) as Stored;
  } catch {
    // Sin almacenamiento: se revisa en cada inicio.
  }
  return { checkedAt: 0, latest: null, dismissed: null };
}

function writeStored(s: Stored) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(s));
  } catch {
    // Sin almacenamiento: no pasa nada.
  }
}

/** El paquete portable trae `portable.json` junto a la app; la versión de internet no. */
async function detectPortable(): Promise<boolean> {
  try {
    const res = await fetch('./portable.json', { cache: 'no-store' });
    return res.ok && ((await res.json()) as { portable?: boolean }).portable === true;
  } catch {
    return false;
  }
}

interface PortableUpdateState {
  portable: boolean;
  /** App nativa instalada con un APK (no por una tienda): también busca versiones nuevas. */
  apk: boolean;
  latest: LatestRelease | null;
  dismissed: string | null;
  checking: boolean;
  error: boolean;
  checkedAt: number;
  init: () => Promise<void>;
  check: (force?: boolean) => Promise<void>;
  dismiss: () => void;
}

export const usePortableUpdate = create<PortableUpdateState>((set, get) => ({
  portable: false,
  apk: false,
  latest: null,
  dismissed: null,
  checking: false,
  error: false,
  checkedAt: 0,

  async init() {
    const stored = readStored();
    set({ latest: stored.latest, dismissed: stored.dismissed, checkedAt: stored.checkedAt });
    // Solo Android: es la app que se instala con un APK (en iPhone no hay APK).
    if (isAndroid()) {
      set({ apk: true });
      // Al volver a la app (desde recientes o desde otra app) se vuelve a mirar.
      void import('@capacitor/app').then(({ App }) => App.addListener('appStateChange', (s) => s.isActive && void get().check()));
    }
    else if (await detectPortable()) set({ portable: true });
    else return;
    await get().check();
  },

  async check(force = false) {
    if (!(get().portable || get().apk) || !navigator.onLine) return;
    if (!force && Date.now() - get().checkedAt < (get().apk ? APK_CHECK_EVERY_MS : CHECK_EVERY_MS)) return;
    set({ checking: true, error: false });
    try {
      const res = await fetch(API_URL, { headers: { Accept: 'application/vnd.github+json' } });
      if (!res.ok) throw new Error(String(res.status));
      const latest = parseRelease(await res.json());
      const checkedAt = Date.now();
      set({ latest, checkedAt });
      writeStored({ checkedAt, latest, dismissed: get().dismissed });
    } catch {
      set({ error: true });
    } finally {
      set({ checking: false });
    }
  },

  dismiss() {
    const version = get().latest?.version ?? null;
    set({ dismissed: version });
    writeStored({ checkedAt: get().checkedAt, latest: get().latest, dismissed: version });
  },
}));

/** Versión más nueva que la instalada, si la hay. */
export function newerRelease(latest: LatestRelease | null, current: string): LatestRelease | null {
  return latest && compareVersions(latest.version, current) > 0 ? latest : null;
}
