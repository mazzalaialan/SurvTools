import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/core/settings/settings', () => ({ useSettings: { getState: () => ({ settings: { serverUrl: 'https://srv.test/' } }) } }));

/** Cache Storage mínimo en memoria. */
function fakeCaches() {
  const store = new Map<string, string>();
  const cache = {
    match: async (url: string) => (store.has(url) ? new Response(store.get(url)!) : undefined),
    put: async (url: string, res: Response) => void store.set(url, await res.text()),
    delete: async (url: string) => store.delete(url),
  };
  vi.stubGlobal('caches', { open: async () => cache });
  return store;
}

const base = (file: string) => new URL(`${import.meta.env.BASE_URL}data/${file}`, location.href).href;
const idx = (files: Record<string, string>, bytes = 1000) => ({ files: Object.fromEntries(Object.entries(files).map(([f, date]) => [f, { date, bytes }])) });

/** Responde por URL; guarda qué se pidió. */
function fakeNet(routes: Record<string, unknown>) {
  const asked: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      asked.push(url);
      return url in routes ? new Response(JSON.stringify(routes[url])) : new Response('no', { status: 404 });
    }),
  );
  return asked;
}

describe('actualización incremental de los paquetes guardados', () => {
  beforeEach(() => {
    vi.resetModules();
    // El entorno de pruebas es `node`: sin localStorage ni location.
    const mem = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) });
    vi.stubGlobal('location', { href: 'https://app.test/' });
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  it('newerSource: la fuente con la fecha más nueva, solo si supera a la guardada', async () => {
    const { newerSource } = await import('./dataFile');
    const app = idx({ 'CL.json': '2026-11-01', 'sin.json': '' });
    const server = idx({ 'CL.json': '2026-11-10' });
    expect(newerSource('CL.json', '2026-10-01', { app, server })).toBe('server');
    expect(newerSource('CL.json', '2026-11-10', { app, server })).toBeNull();
    expect(newerSource('CL.json', '2026-10-01', { app, server: null })).toBe('app');
    expect(newerSource('CL.json', '2026-11-05', { app, server: null })).toBeNull();
    // Un archivo sin fecha en el índice no se puede comparar.
    expect(newerSource('sin.json', '2026-01-01', { app, server })).toBeNull();
    expect(newerSource('otro.json', '', { app: null, server: null })).toBeNull();
  });

  it('baja solo el archivo que cambió: con los índices iguales no baja ningún paquete', async () => {
    const store = fakeCaches();
    store.set(base('CL.json'), JSON.stringify({ generatedAt: '2026-11-10', n: 1 }));
    store.set(base('UY.json'), JSON.stringify({ generatedAt: '2026-10-01', n: 1 }));
    const asked = fakeNet({
      [base('index.json')]: idx({ 'CL.json': '2026-11-10', 'UY.json': '2026-10-01' }),
      'https://srv.test/api/data/index.json': idx({ 'CL.json': '2026-11-10' }),
    });
    const { refreshStored } = await import('./dataFile');
    expect(await refreshStored(['CL.json', 'UY.json'], true)).toBe(0);
    // Solo los dos índices: ningún paquete.
    expect(asked.sort()).toEqual([base('index.json'), 'https://srv.test/api/data/index.json'].sort());
  });

  it('si el servidor tiene uno más nuevo baja solo ese, del servidor, y lo guarda', async () => {
    const store = fakeCaches();
    store.set(base('CL.json'), JSON.stringify({ generatedAt: '2026-10-01', n: 1 }));
    store.set(base('UY.json'), JSON.stringify({ generatedAt: '2026-10-01', n: 1 }));
    const asked = fakeNet({
      [base('index.json')]: idx({ 'CL.json': '2026-10-01', 'UY.json': '2026-10-01' }),
      'https://srv.test/api/data/index.json': idx({ 'CL.json': '2026-11-12', 'UY.json': '2026-10-01' }),
      'https://srv.test/api/data/CL.json': { generatedAt: '2026-11-12', n: 2 },
    });
    const { refreshStored } = await import('./dataFile');
    expect(await refreshStored(['CL.json', 'UY.json'], true)).toBe(1);
    expect(asked).toContain('https://srv.test/api/data/CL.json');
    expect(asked.filter((u) => u.includes('UY.json'))).toEqual([]);
    expect(JSON.parse(store.get(base('CL.json'))!).n).toBe(2);
    expect(JSON.parse(store.get(base('UY.json'))!).n).toBe(1);
  });

  it('un archivo que no está guardado no se baja (eso lo hace la descarga del país)', async () => {
    fakeCaches();
    const asked = fakeNet({ [base('index.json')]: idx({ 'CL.json': '2026-11-12' }) });
    const { refreshStored } = await import('./dataFile');
    expect(await refreshStored(['CL.json'], true)).toBe(0);
    expect(asked.filter((u) => u.includes('CL.json'))).toEqual([]);
  });

  it('no revisa más de una vez cada 12 horas, salvo que se fuerce, y sin conexión no hace nada', async () => {
    const store = fakeCaches();
    store.set(base('CL.json'), JSON.stringify({ generatedAt: '2026-10-01' }));
    const asked = fakeNet({ [base('index.json')]: idx({ 'CL.json': '2026-10-01' }) });
    const { refreshStored } = await import('./dataFile');
    await refreshStored(['CL.json']);
    const first = asked.length;
    expect(first).toBeGreaterThan(0);
    await refreshStored(['CL.json']);
    expect(asked.length).toBe(first);
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    expect(await refreshStored(['CL.json'], true)).toBe(0);
    expect(asked.length).toBe(first);
  });

  it('si el servidor es viejo y no tiene índice, igual se usa el de la app y no se rompe', async () => {
    const store = fakeCaches();
    store.set(base('CL.json'), JSON.stringify({ generatedAt: '2026-10-01', n: 1 }));
    fakeNet({ [base('index.json')]: idx({ 'CL.json': '2026-11-12' }), [base('CL.json')]: { generatedAt: '2026-11-12', n: 3 } });
    const { refreshStored } = await import('./dataFile');
    expect(await refreshStored(['CL.json'], true)).toBe(1);
    expect(JSON.parse(store.get(base('CL.json'))!).n).toBe(3);
  });

  it('fileStates: bajado y al día, desactualizado, sin bajar, y un archivo que ningún índice conoce no cuenta como faltante', async () => {
    const store = fakeCaches();
    // La fecha está entre los primeros bytes de cada paquete: se lee sin traer el archivo entero.
    store.set(base('CL.json'), JSON.stringify({ country: 'CL', generatedAt: '2026-11-10', fire: [] }));
    store.set(base('UY.json'), JSON.stringify({ country: 'UY', generatedAt: '2026-10-01', fire: [] }));
    fakeNet({
      [base('index.json')]: idx({ 'CL.json': '2026-11-10', 'UY.json': '2026-11-10', 'BO.json': '2026-11-10' }),
      'https://srv.test/api/data/index.json': 'no',
    });
    const { fileStates, storedDate } = await import('./dataFile');
    expect(await storedDate('CL.json')).toBe('2026-11-10');
    expect(await storedDate('BO.json')).toBeNull();
    const states = await fileStates(['CL.json', 'UY.json', 'BO.json', 'nunca-existio.json'], true);
    expect(states).toEqual({ 'CL.json': 'ok', 'UY.json': 'stale', 'BO.json': 'missing', 'nunca-existio.json': 'ok' });
  });

  it('fileStates sin conexión: lo guardado queda al día (no se puede saber) y lo que falta, faltante', async () => {
    const store = fakeCaches();
    store.set(base('CL.json'), JSON.stringify({ generatedAt: '2020-01-01' }));
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const { fileStates } = await import('./dataFile');
    expect(await fileStates(['CL.json', 'UY.json'])).toEqual({ 'CL.json': 'ok', 'UY.json': 'missing' });
  });
});

describe('app nativa: los datos de otros países no vienen en el APK', () => {
  const WEB = 'https://mazzalaialan.github.io/SurvTools/data/';
  beforeEach(() => {
    vi.resetModules();
    const mem = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) });
    vi.stubGlobal('location', { href: 'https://localhost/' });
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  it('si el archivo no está dentro de la app (Capacitor contesta con la página de inicio), lo pide a la web publicada y lo guarda', async () => {
    vi.stubGlobal('Capacitor', { isNativePlatform: () => true, getPlatform: () => 'android' });
    const store = fakeCaches();
    const asked: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        asked.push(url);
        if (url === `${WEB}CL.json`) return new Response(JSON.stringify({ generatedAt: '2026-11-19', country: 'CL' }));
        // El WebView de Capacitor devuelve index.html para lo que no existe.
        if (url === base('CL.json')) return new Response('<!doctype html><html></html>');
        return new Response('no', { status: 404 });
      }),
    );
    const { loadDataFile } = await import('./dataFile');
    expect(await loadDataFile<{ country: string }>('CL.json')).toMatchObject({ country: 'CL' });
    expect(asked).toContain(`${WEB}CL.json`);
    expect(store.has(base('CL.json'))).toBe(true);
  });

  it('si el archivo está dentro de la app (Argentina), no sale a la web', async () => {
    vi.stubGlobal('Capacitor', { isNativePlatform: () => true, getPlatform: () => 'android' });
    fakeCaches();
    const asked = fakeNet({ [base('fuel-AR.json')]: { generatedAt: '2026-11-01', places: [] } });
    const { loadDataFile } = await import('./dataFile');
    await loadDataFile('fuel-AR.json');
    expect(asked.some((u) => u.startsWith(WEB))).toBe(false);
  });

  it('en el navegador nunca se usa la copia de la web publicada (la app ya es esa web)', async () => {
    vi.stubGlobal('Capacitor', undefined);
    fakeCaches();
    const asked = fakeNet({});
    const { loadDataFile } = await import('./dataFile');
    await expect(loadDataFile('CL.json')).rejects.toThrow('country-data-unavailable');
    expect(asked.some((u) => u.startsWith(WEB))).toBe(false);
  });

  it('un archivo nuevo en la web se baja al actualizar, aunque el APK no lo traiga', async () => {
    vi.stubGlobal('Capacitor', { isNativePlatform: () => true, getPlatform: () => 'android' });
    const store = fakeCaches();
    store.set(base('CL.json'), JSON.stringify({ generatedAt: '2026-10-01', n: 1 }));
    const asked = fakeNet({ [base('index.json')]: idx({ 'CL.json': '2026-11-19' }), [`${WEB}CL.json`]: { generatedAt: '2026-11-19', n: 2 } });
    const { refreshStored } = await import('./dataFile');
    expect(await refreshStored(['CL.json'], true)).toBe(1);
    expect(asked).toContain(`${WEB}CL.json`);
    expect(JSON.parse(store.get(base('CL.json'))!).n).toBe(2);
  });
});

describe('poda de datos de la app nativa', () => {
  it('quedan el índice, Argentina y lo compartido; se sacan los demás países y los sectores de Brasil', async () => {
    // @ts-expect-error el script es un .mjs sin tipos
    const { keepInNativeApp } = (await import('../../../scripts/prune-native-data.mjs')) as { keepInNativeApp: (f: string) => boolean };
    for (const f of ['index.json', 'fuel-AR.json', 'geology-AR.json', 'rivers-AR.json', 'ecoregions.json', 'tides.json', 'tides-official.json', 'ioc-stations.json', 'parks-CL.json', 'repeaters-CL.json']) expect(keepInNativeApp(f), f).toBe(true);
    for (const f of ['CL.json', 'PY.json', 'fuel-CL.json', 'rivers-BO.json', 'vegetation-CL.json', 'BR-sul.json', 'fuel-BR-sudeste.json', 'parks-BR-norte.json', 'geology-PE.json']) expect(keepInNativeApp(f), f).toBe(false);
  });
});
