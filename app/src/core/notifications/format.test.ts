import { describe, expect, it } from 'vitest';
import { COUNT_SEPARATOR, KIT_SEPARATOR, alertsNotification, lightningNotification, officialNotification, rainNotification, volcanoNotification } from './format';

describe('texto de notificaciones', () => {
  it('lista lo más urgente primero y resume el resto', () => {
    const { title, body } = alertsNotification(
      [
        { itemName: 'Agua', kind: 'expiry', dueDate: '2026-12-15' },
        { itemName: 'Atún', kind: 'expiry', dueDate: '2026-10-01' },
        { itemName: 'Filtro', kind: 'capacity', dueDate: null },
        { itemName: 'Pilas', kind: 'expiry', dueDate: '2026-11-02' },
        { itemName: 'Arroz', kind: 'expiry', dueDate: '2027-01-10' },
      ],
      'es',
      '2026-11-02',
    );
    expect(title).toBe('5 alertas pendientes');
    expect(body.split('\n')).toEqual(['Filtro: por agotarse', 'Atún: vencido', 'Pilas: vence hoy', 'y 2 más']);
  });

  it('faltantes de recomendaciones', () => {
    const { body } = alertsNotification([{ itemName: 'Agua para tomar y cocinar', kind: 'shortage', dueDate: null }], 'es', '2026-11-02');
    expect(body).toBe('Agua para tomar y cocinar: falta stock según tus recomendaciones');
  });

  it('debajo del stock mínimo', () => {
    const { body } = alertsNotification([{ itemName: 'Torniquete CAT', kind: 'minStock', dueDate: null }], 'es', '2026-11-02');
    expect(body).toBe('Torniquete CAT: debajo del stock mínimo');
  });

  it('los faltantes de un botiquín se juntan en un solo aviso por botiquín', () => {
    const kit = (item: string, name: string) => ({ itemName: `${item}${KIT_SEPARATOR}${name}`, kind: 'minStock' as const, dueDate: null });
    const { title, body } = alertsNotification([kit('Gasa', 'Botiquín del auto'), kit('Guantes', 'Botiquín del auto'), kit('Torniquete', 'Botiquín del auto'), kit('Venda', 'Mochila')], 'es', '2026-11-02');
    expect(title).toBe('2 alertas pendientes');
    expect(body).toBe('Faltan 3 artículos en Botiquín del auto\nFalta 1 artículo en Mochila');
  });

  it('un botiquín se cuenta como una alerta junto a las demás, y no se escapa el separador al texto', () => {
    const { title, body } = alertsNotification(
      [{ itemName: 'Atún', kind: 'expiry', dueDate: '2026-11-05' }, { itemName: `Gasa${KIT_SEPARATOR}Auto`, kind: 'minStock', dueDate: null }, { itemName: `Venda${KIT_SEPARATOR}Auto`, kind: 'minStock', dueDate: null }],
      'es',
      '2026-11-02',
    );
    expect(title).toBe('2 alertas pendientes');
    expect(body).toBe('Atún: vence el 5 nov\nFaltan 2 artículos en Auto');
    expect(body).not.toContain(KIT_SEPARATOR);
  });

  it('el servidor junta los faltantes de un botiquín en una fila con la cantidad: el aviso suma esa cantidad', () => {
    const { body } = alertsNotification([{ itemName: `Gasa${KIT_SEPARATOR}Auto${COUNT_SEPARATOR}12`, kind: 'minStock', dueDate: null }, { itemName: `Venda${KIT_SEPARATOR}Auto`, kind: 'minStock', dueDate: null }], 'es', '2026-11-02');
    expect(body).toBe('Faltan 13 artículos en Auto');
  });

  it('en inglés los botiquines también se agrupan', () => {
    const { body } = alertsNotification([{ itemName: `Gauze${KIT_SEPARATOR}Car kit`, kind: 'minStock', dueDate: null }, { itemName: `Gloves${KIT_SEPARATOR}Car kit`, kind: 'minStock', dueDate: null }], 'en', '2026-11-02');
    expect(body).toBe('2 items missing in Car kit');
  });

  it('un faltante común (fuera de botiquines) sigue yendo artículo por artículo', () => {
    const { title } = alertsNotification([{ itemName: 'Agua', kind: 'minStock', dueDate: null }, { itemName: 'Atún', kind: 'minStock', dueDate: null }], 'es', '2026-11-02');
    expect(title).toBe('2 alertas pendientes');
  });

  it('en inglés', () => {
    const { title, body } = alertsNotification([{ itemName: 'Water', kind: 'expiry', dueDate: '2026-12-15' }], 'en', '2026-11-02');
    expect(title).toBe('1 pending alert');
    expect(body).toBe('Water: expires Dec 15');
  });

  it('aviso de lluvia: lugar, "donde estás" y antigüedad de la ubicación', () => {
    const now = Date.parse('2026-11-03T15:00:00Z');
    const rain = { placeId: 'w1', label: 'Refugio', state: 'soon' as const, inMinutes: 45, mm: 3.5, fixAt: null };
    expect(rainNotification(rain, 'es', now)).toEqual({ title: 'Lluvia en unos 45 min · Refugio', body: 'Se esperan 3,5 mm en las próximas 2 horas.\nAviso informativo, no oficial: las alertas oficiales son del SMN.' });
    const here = { ...rain, placeId: 'here', label: null, state: 'raining' as const, fixAt: '2026-11-03T12:00:00Z' };
    expect(rainNotification(here, 'es', now)).toEqual({
      title: 'Está lloviendo · Donde estás',
      body: 'Se esperan 3,5 mm en las próximas 2 horas.\nSegún tu última ubicación conocida (hace 3 horas).\nAviso informativo, no oficial: las alertas oficiales son del SMN.',
    });
    // Ubicación reciente: no se aclara.
    expect(rainNotification({ ...here, fixAt: '2026-11-03T14:50:00Z' }, 'en', now).body).toBe('3.5 mm expected in the next 2 hours.\nInformational, not official: official alerts come from the SMN.');
  });

  it('aviso de rayos: distancia, dirección y qué hacer', () => {
    const now = Date.parse('2026-11-04T18:00:00Z');
    const l = { placeId: 'w1', label: 'Casa', distanceKm: 12, bearing: 315, fixAt: null };
    const es = lightningNotification(l, 'es', now);
    expect(es.title).toBe('Rayos a 12 km al noroeste · Casa');
    expect(es.body).toMatch(/^Buscá refugio/);
    expect(es.body).toMatch(/las alertas oficiales son del SMN\.$/);
    expect(lightningNotification({ ...l, label: null, bearing: 359, distanceKm: 0 }, 'en', now).title).toBe('Lightning 1 km north · Where you are');
    expect(lightningNotification({ ...l, fixAt: '2026-11-04T15:00:00Z' }, 'es', now).body).toMatch(/hace 3 horas/);
  });

  it('aviso de lluvia con la hora de inicio: la hora no se vence, la cuenta regresiva la pone la app', () => {
    const startsAt = new Date(2026, 10, 15, 15, 40).getTime();
    const now = new Date(2026, 10, 15, 13, 55).getTime();
    const rain = { placeId: 'w1', label: 'Casa', state: 'soon' as const, inMinutes: 105, mm: 3, fixAt: null, startsAt };
    // El que llega por push dice la hora, no «en 105 min» (que a los pocos minutos ya no es cierto).
    expect(rainNotification(rain, 'es', now).title).toBe('Lluvia a las 15:40 · Casa');
    expect(rainNotification(rain, 'en', now).title).toMatch(/^Rain at \d{1,2}:40/);
    // La app, al recalcular con su reloj, agrega cuánto falta.
    expect(rainNotification(rain, 'es', now, true).title).toBe('Lluvia a las 15:40 (en unos 105 min) · Casa');
    expect(rainNotification(rain, 'es', now + 60 * 60_000, true).title).toBe('Lluvia a las 15:40 (en unos 45 min) · Casa');
    // Sin hora (avisos viejos) queda como antes.
    expect(rainNotification({ ...rain, startsAt: undefined }, 'es', now).title).toBe('Lluvia en unos 105 min · Casa');
    // Cambio a «está lloviendo» y salida del aviso.
    expect(rainNotification({ ...rain, state: 'raining', startsAt: undefined, update: true }, 'es', now).title).toBe('Está lloviendo · Casa');
    expect(rainNotification({ ...rain, clear: true }, 'es', now)).toEqual({ title: 'Dejó de llover · Casa', body: '' });
  });

  it('aviso de lluvia vista por el satélite', () => {
    const rain = { placeId: 'w1', label: 'Casa', state: 'raining' as const, inMinutes: 0, mm: 6, fixAt: null, observedMmH: 6.2 };
    expect(rainNotification(rain, 'es').body).toBe('El satélite ve lluvia de unos 6,2 mm/h ahora (estimación por infrarrojo, orientativa).\nAviso informativo, no oficial: las alertas oficiales son del SMN.');
  });
});

describe('aviso de actualización', () => {
  it('en el idioma del usuario, con la indicación para actualizar', async () => {
    const { updateNotification } = await import('./format');
    const u = { version: '0.23.0', title: { es: 'VikArg 0.23', en: 'VikArg 0.23 is out' }, body: { es: 'Avisos de actualizaciones.', en: 'Update notices.' } };
    expect(updateNotification(u, 'es')).toEqual({ title: 'VikArg 0.23', body: 'Avisos de actualizaciones.\nTocá para abrir la app y actualizarla.' });
    expect(updateNotification(u, 'en').title).toBe('VikArg 0.23 is out');
  });
});

describe('aviso de peligro natural', () => {
  const base = { placeId: 'w1', label: 'Casa', fixAt: null, name: '50 km NW of Mendoza', distanceKm: 84, bearing: 300, url: 'u' };
  it('sismo, con magnitud, distancia y rumbo, y la aclaración de que no es oficial', async () => {
    const { hazardNotification } = await import('./format');
    const n = hazardNotification({ ...base, kind: 'quake', magnitude: 5.1 }, 'es');
    expect(n.title).toBe('Sismo de magnitud 5,1 a 84 km al noroeste · Casa');
    expect(n.body).toMatch(/^50 km NW of Mendoza\. Datos de USGS/);
    expect(n.body).toMatch(/no oficial/);
    expect(n.body).not.toMatch(/tsunami/);
    expect(hazardNotification({ ...base, kind: 'quake', magnitude: 7, tsunami: true }, 'es').body).toMatch(/posible tsunami/);
  });
  it('evento de GDACS con su nivel', async () => {
    const { hazardNotification } = await import('./format');
    const n = hazardNotification({ ...base, kind: 'WF', name: 'Incendio en Córdoba', level: 'Orange', label: null }, 'es');
    expect(n.title).toBe('Incendio forestal a 84 km al noroeste · Donde estás');
    expect(n.body).toMatch(/^Incendio en Córdoba\. Alerta naranja de GDACS/);
  });
});

describe('Bolivia y Perú', () => {
  it('alerta del SENAMHI de Perú: el nombre del organismo en el título', () => {
    const n = officialNotification(
      { key: 'SENAMHI_PE:458:1:4', source: 'SENAMHI_PE', senderName: 'Servicio Nacional de Meteorología e Hidrología del Perú (SENAMHI)', event: 'Calor', headline: 'Aviso N.° 458, nivel rojo · Incremento de temperatura diurna', severity: 'Extreme', onset: '2026-11-09T05:00:00Z', expires: '2026-11-10T04:59:59Z', here: true, fixAt: null, places: [], stock: [], url: '' },
      'es',
    );
    expect(n.title).toBe('SENAMHI Perú: Aviso N.° 458, nivel rojo · Incremento de temperatura diurna (extrema)');
    expect(n.body).toMatch(/SENAMHI\)/);
  });

  it('volcán de Perú: según el CENVUL', () => {
    const v = { placeId: 'here', label: null, fixAt: null, name: 'VOLCÁN SABANCAYA', level: 'orange' as const, distanceKm: 70, bearing: 315, url: 'https://cenvul.igp.gob.pe/', source: 'CENVUL' as const };
    expect(volcanoNotification(v, 'es').body).toMatch(/^Según el Centro Vulcanológico Nacional del Instituto Geofísico del Perú/);
    expect(volcanoNotification({ ...v, source: undefined }, 'es').body).toMatch(/OAVV/);
  });
});

describe('aviso de un río cerca de un lugar', () => {
  const r = { placeId: 'w1', label: 'Muelle', fixAt: null, station: 'Buenos Aires', river: 'Río de la Plata', state: 'alert' as const, level: 3.5, threshold: 3.3, at: '2026-11-14T15:00:00Z', distanceKm: 1.2, bearing: 0, stock: undefined };
  it('alerta, evacuación y aguas bajas, con el lugar y el umbral', async () => {
    const { riverNotification } = await import('./format');
    expect(riverNotification(r, 'es').title).toBe('Río de la Plata en Buenos Aires: 3,50 m, sobre el nivel de alerta (3,30 m) · a 1,2 km al norte de Muelle');
    expect(riverNotification({ ...r, state: 'evac', threshold: 3.9, level: 4 }, 'es').title).toContain('sobre el nivel de evacuación (3,90 m)');
    expect(riverNotification({ ...r, state: 'low', threshold: 0.21, level: 0.15 }, 'es').title).toContain('en aguas bajas (bajo 0,21 m)');
    expect(riverNotification(r, 'es').body).toMatch(/INA .*no oficial/);
    // Aviso anticipado: el pronóstico del INA dice que llegará a un nivel.
    const fc = { ...r, forecast: true, level: 5.1, threshold: 5, at: '2026-11-16T15:00:00Z' };
    const f = riverNotification(fc, 'es');
    expect(f.title).toMatch(/^Pronóstico: Río de la Plata en Buenos Aires llegaría al nivel de alerta \(5,00 m\) el .* · a 1,2 km al norte de Muelle$/);
    expect(f.body).toMatch(/Altura prevista: 5,10 m\. Pronóstico del INA.*no oficial/);
    expect(riverNotification({ ...fc, state: 'low', threshold: 1.64 }, 'es').title).toContain('llegaría a aguas bajas (bajo 1,64 m)');
    expect(riverNotification(fc, 'en').title).toMatch(/^Forecast: Río de la Plata at Buenos Aires would reach the alert level \(5\.00 m\) on .* · 1\.2 km north of Muelle$/);
    expect(riverNotification(r, 'en').title).toBe('Río de la Plata at Buenos Aires: 3.50 m, above the alert level (3.30 m) · 1.2 km north of Muelle');
  });
});

describe('Brasil', () => {
  it('aviso de río de la ANA: cota de atención, alerta o inundación, en los tres idiomas, informativo', async () => {
    const { riverNotification } = await import('./format');
    const b = { placeId: 'w1', label: 'Casa', fixAt: null, station: 'Uruguaiana', river: 'Uruguai', state: 'attention' as const, source: 'ANA' as const, level: 6.6, threshold: 6.5, at: '2026-11-14T15:00:00Z', distanceKm: 2, bearing: 90 };
    expect(riverNotification(b, 'es').title).toBe('Uruguai en Uruguaiana: 6,60 m, sobre la cota de atención (6,50 m) · a 2 km al este de Casa');
    expect(riverNotification({ ...b, state: 'evac', threshold: 8.5, level: 8.7 }, 'es').title).toContain('sobre la cota de inundación (8,50 m)');
    expect(riverNotification({ ...b, state: 'alert', threshold: 7.5 }, 'en').title).toContain('above the alert mark (7.50 m)');
    expect(riverNotification(b, 'pt').title).toBe('Uruguai em Uruguaiana: 6,60 m, acima da cota de atenção (6,50 m) · a 2 km ao leste de Casa');
    expect(riverNotification(b, 'es').body).toMatch(/ANA .*SGB\/CPRM.*no oficial.*Defesa Civil \(199\)/);
    expect(riverNotification(b, 'pt').body).toMatch(/não oficial/);
    expect(riverNotification(b, 'en').body).toMatch(/not official/);
    expect(riverNotification(b, 'es').body).not.toMatch(/INA/);
  });

  const inmet = { key: 'INMET:urn:oid:2.49.0.0.76.0.2026.28735.1:0', source: 'INMET' as const, senderName: 'Instituto Nacional de Meteorologia', event: 'Tempestade', headline: 'Aviso de Tempestade. Severidade Grau: Moderate', severity: 'Moderate' as const, onset: '2026-11-22T09:33:00-03:00', expires: '2026-11-22T23:59:00-03:00', here: true, fixAt: null, places: [], stock: [], url: '' };

  it('alerta del INMET: el nombre del organismo en el título, en los tres idiomas', () => {
    for (const lang of ['es', 'en', 'pt'] as const) {
      const n = officialNotification(inmet, lang);
      expect(n.title).toMatch(/^INMET: Aviso de Tempestade\. Severidade Grau: Moderate/);
      expect(n.body).toMatch(/Instituto Nacional de Meteorologia/);
    }
  });
});
