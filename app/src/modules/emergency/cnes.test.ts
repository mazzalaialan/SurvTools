import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { mergeNearby, officialNearby, type EmergencyData, type NearbyPlace, type Place } from './data';

/** Herramienta de generación (JS sin tipos): se carga con un especificador variable para que tsc no la analice. */
const toolPath = new URL('../../../../tools/country-data/cnes-br.mjs', import.meta.url).href;
interface Tool {
  readCnes(file: string): Promise<{ rows: { sector: string; place: Place }[]; stats: Record<string, number> }>;
  mergeHealth(previous: Place[], cnes: Place[]): { health: Place[]; droppedOsm: number; keptOsm: number };
  creditText(date: string, coverage: string): string;
  TYPES: Record<string, string>;
}
const tool = (await import(/* @vite-ignore */ toolPath)) as Tool;

const HEAD =
  'CO_CNES;"CO_UNIDADE";CO_UF;CO_IBGE;"NO_RAZAO_SOCIAL";"NO_FANTASIA";TP_UNIDADE;"NO_LOGRADOURO";"NU_ENDERECO";"NO_BAIRRO";NU_TELEFONE;NU_LATITUDE;NU_LONGITUDE;"CO_TURNO_ATENDIMENTO";"CO_MOTIVO_DESAB";"CO_AMBULATORIAL_SUS"';
const row = (c: Record<string, string>) =>
  [c.cnes, '"0"', c.uf ?? '41', c.mun ?? '410690', `"${c.razao ?? 'RAZAO'}"`, `"${c.fantasia ?? ''}"`, c.tp, '"RUA A"', '"10"', '"CENTRO"', `"${c.tel ?? ''}"`, `"${c.lat}"`, `"${c.lon}"`, `"${c.turno ?? '03'}"`, c.baja ? `"${c.baja}"` : '', `"${c.sus ?? 'NAO'}"`].join(';');

describe('CNES (tools/country-data/cnes-br.mjs)', () => {
  it('se queda con los activos, de los tipos elegidos y con coordenadas válidas; guarda 24 h, SUS y CNES sin alterar los valores', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cnes-'));
    try {
      const file = join(dir, 'c.csv');
      const lines = [
        HEAD,
        row({ cnes: '1', tp: '5', fantasia: 'HOSPITAL SÃO JOSÉ', lat: '-25.43', lon: '-49.27', tel: '(41)33334444', turno: '06', sus: 'SIM' }),
        row({ cnes: '2', tp: '2', fantasia: '', razao: 'PREFEITURA X', lat: '-25.44', lon: '-49.28' }), // sin fantasía: razón social
        row({ cnes: '3', tp: '5', fantasia: 'DADO DE BAJA', lat: '-25.5', lon: '-49.3', baja: '3' }),
        row({ cnes: '4', tp: '70', fantasia: 'CAPS', lat: '-25.5', lon: '-49.3' }),
        row({ cnes: '5', tp: '22', fantasia: 'CONSULTORIO', lat: '-25.5', lon: '-49.3' }),
        row({ cnes: '6', tp: '62', fantasia: 'HOSPITAL DIA', lat: '-25.5', lon: '-49.3' }),
        row({ cnes: '7', tp: '5', fantasia: 'SIN COORDENADAS', lat: '', lon: '' }),
        row({ cnes: '8', tp: '5', fantasia: 'EN EL MAR', lat: '0', lon: '0' }),
        row({ cnes: '9', tp: '5', fantasia: 'EN EUROPA', lat: '48.8', lon: '2.3' }),
        row({ cnes: '10', tp: '73', uf: '35', mun: '355030', fantasia: 'UPA SP', lat: '-23.55', lon: '-46.63' }),
        row({ cnes: '11', tp: '15', uf: '13', mun: '130260', fantasia: 'UNIDADE MISTA', lat: '-3.1', lon: '-60.0' }),
      ];
      writeFileSync(file, lines.join('\n') + '\n', 'latin1');
      const { rows, stats } = await tool.readCnes(file);
      const bySector = (s: string) => rows.filter((r) => r.sector === s).map((r) => r.place);
      expect(stats.inactive).toBe(1);
      expect(stats.noCoords).toBe(2);
      expect(stats.outsideBrazil).toBe(1);
      expect(bySector('sul').map((p) => p.cnes)).toEqual(['1', '2']);
      expect(bySector('sudeste').map((p) => p.cnes)).toEqual(['10']);
      expect(bySector('norte').map((p) => p.cnes)).toEqual(['11']);
      const [h, c] = bySector('sul');
      // Los valores se guardan tal cual (nombre en mayúsculas, con tildes; teléfono con su formato).
      expect(h).toMatchObject({ name: 'HOSPITAL SÃO JOSÉ', type: 'Hospital geral', phone: '(41)33334444', address: 'RUA A 10, CENTRO', h24: true, sus: true });
      expect(c!.name).toBe('PREFEITURA X');
      expect(c).not.toHaveProperty('h24');
      expect(c).not.toHaveProperty('sus');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('tipos confirmados con el cadastro oficial: sin CAPS, consultorios, hospital-día ni farmacias', () => {
    expect(Object.keys(tool.TYPES).sort()).toEqual(['01', '02', '04', '05', '07', '15', '20', '21', '72', '73']);
  });

  it('pin doble: el de OpenStreetMap a ≤150 m de uno del CNES se oculta; el resto queda; no se mezclan campos', () => {
    const cnes: Place[] = [{ name: 'HOSPITAL X', lat: -25.4, lon: -49.2, type: 'Hospital geral', cnes: '100' }];
    const osm: Place[] = [
      { name: 'Hospital X', lat: -25.4009, lon: -49.2, phone: '+55 41 3333-4444', type: 'Hospital' }, // ~100 m
      { name: 'Clínica lejos', lat: -25.403, lon: -49.2, type: 'Centro de saúde' }, // ~330 m
    ];
    const r = tool.mergeHealth(osm, cnes);
    expect(r.droppedOsm).toBe(1);
    expect(r.health.map((p) => p.name)).toEqual(['HOSPITAL X', 'Clínica lejos']);
    // El pin del CNES no hereda el teléfono de OSM.
    expect(r.health[0]).not.toHaveProperty('phone');
  });

  it('es repetible: los pins del CNES de una corrida anterior se reemplazan, no se duplican', () => {
    const osm: Place = { name: 'Posto', lat: -10, lon: -50, type: 'Centro de saúde' };
    const first = tool.mergeHealth([osm], [{ name: 'A', lat: -20, lon: -50, cnes: '1' }]).health;
    const again = tool.mergeHealth(first, [{ name: 'A', lat: -20, lon: -50, cnes: '1' }]).health;
    expect(again).toEqual(first);
    expect(again).toHaveLength(2);
  });

  it('en la app: el pin del CNES es oficial aunque el paquete sea de OSM, y un OSM en vivo del mismo lugar no lo completa', () => {
    const data: EmergencyData = {
      sources: { fire: '', police: '', health: '', radio: '' },
      osm: true,
      fire: [],
      police: [],
      health: [
        { name: 'UPA CENTRO', lat: -25.4, lon: -49.2, type: 'Pronto atendimento (UPA)', cnes: '55', h24: true, sus: true },
        { name: 'Clínica OSM', lat: -25.5, lon: -49.2, type: 'Clinic' },
      ],
      radio: [],
    };
    const known = officialNearby(data, -25.4, -49.2, 50_000);
    const upa = known.find((p) => p.name === 'UPA CENTRO')!;
    expect(upa).toMatchObject({ source: 'official', kind: 'hospital', cnes: '55', h24: true, sus: true });
    expect(known.find((p) => p.name === 'Clínica OSM')!.source).toBe('osm');
    const live: NearbyPlace = { ...upa, key: 'live', name: 'Upa (OSM)', source: 'osm', phone: '+55 41 9999-0000', address: 'Otra calle', distance: 80 };
    delete live.cnes;
    const merged = mergeNearby(known, [live]);
    const shown = merged.filter((p) => p.name.toLowerCase().includes('upa'));
    expect(shown).toHaveLength(1);
    expect(shown[0]!.name).toBe('UPA CENTRO');
    expect(shown[0]!.phone).toBe('');
    expect(shown[0]!.address).toBe('');
  });
});

describe('paquetes BR-<sector>.json con salud del CNES', () => {
  const dir = new URL('../../../public/data/', import.meta.url);
  for (const sector of ['sul', 'sudeste', 'centro-oeste', 'nordeste', 'norte']) {
    it(`${sector}: crédito visible al Ministério da Saúde / CNES, pins válidos y peso razonable`, () => {
      const raw = readFileSync(new URL(`BR-${sector}.json`, dir), 'utf8');
      const d = JSON.parse(raw) as { health: Place[]; sources: Record<string, string>; cnesDate?: string };
      const cnes = d.health.filter((p) => p.cnes);
      if (cnes.length === 0) return; // paquete todavía sin CNES
      // CC BY-ND 3.0: crédito (organismo, enlace, fecha del dato).
      expect(d.sources.health).toContain('Ministério da Saúde / CNES');
      expect(d.sources.health).toContain('https://dadosabertos.saude.gov.br/');
      expect(d.sources.health).toContain('CC BY-ND 3.0');
      expect(d.cnesDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(d.sources.health).toContain(d.cnesDate!);
      expect(cnes.every((p) => p.name && p.lat < 6 && p.lat > -34 && p.lon < -28 && p.lon > -74)).toBe(true);
      // Un pin de OSM nunca queda a ≤150 m de uno del CNES.
      const osm = d.health.filter((p) => !p.cnes);
      const near = (a: Place, b: Place) => Math.hypot((a.lat - b.lat) * 111_320, (a.lon - b.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180)) <= 150;
      for (const o of osm.slice(0, 400)) expect(cnes.some((c) => Math.abs(c.lat - o.lat) < 0.002 && near(c, o))).toBe(false);
      // Peso: por sector, por debajo de ~3 MB comprimidos.
      expect(gzipSync(raw).length).toBeLessThan(3_000_000);
    });
  }

  it('docs/FUENTES-DE-DATOS.md acredita al CNES', () => {
    const doc = readFileSync(new URL('../../../../docs/FUENTES-DE-DATOS.md', import.meta.url), 'utf8');
    expect(doc).toContain('Ministério da Saúde / CNES');
    expect(doc).toContain('CC BY-ND');
  });
});
