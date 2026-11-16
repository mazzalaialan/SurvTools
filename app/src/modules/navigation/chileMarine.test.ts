import { describe, expect, it } from 'vitest';
import { parseChileForecast, sentenceCase, zoneIdFor } from './chileMarine';
import { NAV_SOURCES, sourceEnabled, visibleSources } from './sources';

const raw = {
  titulo: 'Pronóstico',
  pronostico: {
    periodo_validez: { inicio: '141200 UTC', fin: '151200 UTC' },
    pronostico_detallado: [
      { 'id-zona': 3, zona: 'Zona Tres (Valparaíso a Constitución)', viento: 'N/NW 15/25 KT OCASIONAL 30 KT', mar_oceanico: 'MAREJADILLA A MAREJADA (1.0/2.5 M) COMO MAR DE FONDO DEL W/SW', mar_bahia: 'RIZADA A MAREJADILLA EN BAHIAS.', visibilidad: 'BUENA (10 KM)', nubosidad: 'NUBLADO A CUBIERTO', situacion_sinoptica: 'CIRCULACION CICLONICA.' },
      { 'id-zona': '8.1', zona: 'Zona Ocho (1) (F.Evangelistas a Lat 56 GDS Sur)', viento: 'N/NW 20/25 KT RACHAS 35 KT', mar_oceanico: 'MAR MUY GRUESA A ARBOLADA (5.0/7.0 M)' },
      { 'id-zona': 9, viento: 'sin zona' },
    ],
  },
};

describe('pronóstico marítimo de la Armada de Chile', () => {
  it('lee las zonas y la validez, y pasa el texto de mayúsculas a oración', () => {
    const f = parseChileForecast(raw, 7)!;
    expect(f.from).toBe('141200 UTC');
    expect(f.to).toBe('151200 UTC');
    expect(f.fetchedAt).toBe(7);
    expect(f.zones.map((z) => z.id)).toEqual(['3', '8.1']);
    expect(f.zones[0]).toMatchObject({
      name: 'Zona Tres (Valparaíso a Constitución)',
      wind: 'N/NW 15/25 kt ocasional 30 kt',
      ocean: 'Marejadilla a marejada (1.0/2.5 m) como mar de fondo del W/SW',
      synoptic: 'Circulacion ciclonica.',
    });
    expect(f.zones[1]!.bay).toBe('');
  });

  it('un formato desconocido da null', () => {
    expect(parseChileForecast(null)).toBeNull();
    expect(parseChileForecast({ pronostico: {} })).toBeNull();
    expect(parseChileForecast({ pronostico: { pronostico_detallado: [] } })).toBeNull();
  });

  it('el texto en mayúsculas: oración y puntos cardinales', () => {
    expect(sentenceCase('  CALMA A S/SW 5/15 KT  ')).toBe('Calma a S/SW 5/15 kt');
    expect(sentenceCase('NUBLADO. DESPEJADO AL SUR.')).toBe('Nublado. Despejado al sur.');
  });

  it('la zona de la costa según la latitud', () => {
    expect([-18.5, -29, -31, -33.5, -36, -40, -43, -50, -54].map(zoneIdFor)).toEqual(['1', '1', '2', '3', '4', '5', '6', '7', '8.1']);
  });
});

describe('fuentes de Navegación y copia comercial', () => {
  it('la copia gratuita usa todas; la comercial apaga las de licencia no comercial', () => {
    for (const s of NAV_SOURCES) expect(sourceEnabled(s.id, false)).toBe(true);
    expect(sourceEnabled('open-meteo', true)).toBe(false);
    expect(sourceEnabled('ioc', true)).toBe(false);
    expect(sourceEnabled('ina', true)).toBe(true);
    expect(sourceEnabled('tides', true)).toBe(true);
    expect(sourceEnabled('armada-cl', true)).toBe(true);
    expect(sourceEnabled('senamhi-bo', false)).toBe(true);
    expect(sourceEnabled('senamhi-bo', true)).toBe(false);
    expect(visibleSources(true).map((s) => s.id)).toEqual(['ina', 'tides', 'armada-cl', 'inumet', 'caru', 'dinagua', 'dmh-py']);
  });
  it('cada fuente trae su licencia, su enlace y su cita', () => {
    for (const s of NAV_SOURCES) {
      expect(s.licenseText.length).toBeGreaterThan(10);
      expect(s.url).toMatch(/^https:\/\//);
      expect(s.cite.length).toBeGreaterThan(10);
    }
  });
});
