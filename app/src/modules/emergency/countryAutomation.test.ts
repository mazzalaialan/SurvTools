import { beforeEach, describe, expect, it, vi } from 'vitest';

const prefetchCountry = vi.fn(async (_country: string) => undefined);
let stored = new Set<string>();
vi.mock('./country', () => ({ prefetchCountry: (c: string) => prefetchCountry(c) }));
const refreshStored = vi.fn(async (_files: string[]) => 0);
vi.mock('./dataFile', () => ({ hasDataFile: async (f: string) => stored.has(f), refreshStored: (f: string[]) => refreshStored(f) }));

const setNetwork = (type: string | undefined, saveData = false) =>
  Object.defineProperty(navigator, 'connection', { value: type === undefined ? undefined : { type, saveData }, configurable: true });

async function load() {
  return import('./countryAutomation');
}

describe('qué hacer al detectar otro país', () => {
  beforeEach(() => {
    prefetchCountry.mockClear();
    refreshStored.mockClear();
    stored = new Set();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  it('se ofrece cambiar el país solo si el detectado es otro y no se dijo «No, gracias»', async () => {
    const { offerFor } = await load();
    expect(offerFor('PE', 'AR', [])).toBe('PE');
    expect(offerFor('AR', 'AR', [])).toBeNull();
    expect(offerFor(null, 'AR', [])).toBeNull();
    expect(offerFor('PE', 'AR', ['PE'])).toBeNull();
    // Un «No, gracias» a Perú no impide ofrecer Chile.
    expect(offerFor('CL', 'AR', ['PE'])).toBe('CL');
  });

  it('la oferta de mapas: otro país, sin «No, gracias», con conexión y sin zona bajada que cubra el punto', async () => {
    const { mapOfferFor } = await load();
    const at = { lat: -12.05, lon: -77.04 };
    const zone = { lat: -12.05, lon: -77.04, radiusKm: 10 };
    expect(mapOfferFor('PE', 'AR', [], [], at, true)).toEqual({ country: 'PE', ...at });
    expect(mapOfferFor('AR', 'AR', [], [], at, true)).toBeNull();
    expect(mapOfferFor('PE', 'AR', ['PE'], [], at, true)).toBeNull();
    expect(mapOfferFor('PE', 'AR', [], [], at, false)).toBeNull();
    expect(mapOfferFor('PE', 'AR', [], [zone], at, true)).toBeNull();
    // Una zona lejana no cubre el punto.
    expect(mapOfferFor('PE', 'AR', [], [{ lat: -13.5, lon: -72, radiusKm: 10 }], at, true)).not.toBeNull();
  });

  it('detectar otro país NO baja nada de ese país: solo se pregunta si querés cambiar (el paquete se baja al aceptar)', async () => {
    const mod = await load();
    // Ya no existe la bajada automática de los países detectados.
    expect('downloadFor' in mod).toBe(false);
    expect(prefetchCountry).not.toHaveBeenCalled();
    expect(mod.offerFor('PE', 'AR', [])).toBe('PE');
  });

  it('lo ya guardado se actualiza solo con Wi-Fi, y solo los archivos de los países que se piden', async () => {
    const { updateStored } = await load();
    const { countryFiles } = await import('./countryDownload');
    setNetwork('wifi');
    stored = new Set([...countryFiles('CL'), ...countryFiles('AR')]);
    await updateStored(['CL']);
    expect(refreshStored).toHaveBeenCalledTimes(1);
    expect(refreshStored.mock.calls[0]![0]).toEqual(expect.arrayContaining(countryFiles('CL')));
    // Sin Wi-Fi seguro (datos móviles, iPhone, ahorro de datos) no actualiza a escondidas.
    refreshStored.mockClear();
    for (const type of ['cellular', undefined]) {
      setNetwork(type);
      expect(await updateStored(['CL'])).toBe(0);
    }
    setNetwork('wifi', true);
    await updateStored(['CL']);
    expect(refreshStored).not.toHaveBeenCalled();
  });

  it('«Ahora no» a un sector de Brasil no insiste en la sesión', async () => {
    const { declineDownload, sectorToDownload } = await load();
    declineDownload(['BR'], 'sul');
    expect(sectorToDownload('sul', [], [])).toBeNull();
    expect(sectorToDownload('sudeste', [], [])).toBe('sudeste');
  });
});
