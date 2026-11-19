import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettings } from '@/core/settings/settings';

const downloadSector = vi.fn(async (_id: string) => undefined);
vi.mock('./countryDelete', () => ({ downloadSector: (id: string) => downloadSector(id), deleteSector: vi.fn(), filesToDelete: () => [], deleteCountryPack: vi.fn() }));
vi.mock('./countryDownload', async (orig) => ({ ...(await orig<typeof import('./countryDownload')>()), sectorPackState: async () => ({ state: 'missing', files: [], bytes: 0, total: 3_000_000 }) }));

const { downloadSectorFor, sectorToDownload, useCountryNotices } = await import('./countryAutomation');

const CURITIBA = { lat: -25.43, lon: -49.27 };
const BUENOS_AIRES = { lat: -34.6, lon: -58.4 };

function network(type: string | undefined) {
  Object.defineProperty(navigator, 'connection', { value: type ? { type } : undefined, configurable: true });
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
}

beforeEach(() => {
  downloadSector.mockClear();
  useCountryNotices.setState({ ask: null });
  useSettings.setState({ settings: { ...useSettings.getState().settings, brSectors: [], brSectorsDeclined: [] } });
});

describe('qué sector de Brasil bajar según dónde estás', () => {
  it('el de donde estás, salvo que ya lo tengas, lo hayas borrado a mano o hayas dicho «Ahora no»', () => {
    expect(sectorToDownload('sul', [], [], new Set())).toBe('sul');
    expect(sectorToDownload('sul', ['sul'], [], new Set())).toBeNull();
    expect(sectorToDownload('sul', [], ['sul'], new Set())).toBeNull();
    expect(sectorToDownload('sul', [], [], new Set(['BR:sul']))).toBeNull();
    expect(sectorToDownload(null, [], [], new Set())).toBeNull();
    // Tener otro sector no impide bajar el de donde estás.
    expect(sectorToDownload('norte', ['sul'], [], new Set())).toBe('norte');
  });

  it('con Wi-Fi baja el sector de Curitiba (Sul) sin preguntar', async () => {
    network('wifi');
    await downloadSectorFor(CURITIBA);
    expect(downloadSector).toHaveBeenCalledWith('sul');
    expect(useCountryNotices.getState().ask).toBeNull();
  });

  it('con datos móviles o conexión desconocida pregunta antes, con el sector y su peso', async () => {
    network('cellular');
    await downloadSectorFor(CURITIBA);
    expect(downloadSector).not.toHaveBeenCalled();
    expect(useCountryNotices.getState().ask).toEqual({ countries: ['BR'], bytes: 3_000_000, sector: 'sul' });
    useCountryNotices.setState({ ask: null });
    network(undefined);
    await downloadSectorFor(CURITIBA);
    expect(useCountryNotices.getState().ask?.sector).toBe('sul');
  });

  it('fuera de Brasil no hace nada, y sin conexión tampoco', async () => {
    network('wifi');
    await downloadSectorFor(BUENOS_AIRES);
    expect(downloadSector).not.toHaveBeenCalled();
    expect(useCountryNotices.getState().ask).toBeNull();
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    await downloadSectorFor(CURITIBA);
    expect(downloadSector).not.toHaveBeenCalled();
  });

  it('un sector que ya tenés no se vuelve a bajar', async () => {
    network('wifi');
    useSettings.setState({ settings: { ...useSettings.getState().settings, brSectors: ['sul'] } });
    await downloadSectorFor(CURITIBA);
    expect(downloadSector).not.toHaveBeenCalled();
  });
});
