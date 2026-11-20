import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { covers } from '../src/official/cap.ts';
import { createPeCache, fetchSenamhiPe, parsePeList, parseSenamhiBo, peAlerts, sentence } from '../src/official/senamhi.ts';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/official/${name}`, import.meta.url), 'utf8');

describe('SENAMHI Bolivia y Perú', () => {
  it('Bolivia: color, evento, vigencia en hora boliviana y zona', () => {
    const alerts = parseSenamhiBo(JSON.parse(fixture('senamhi-bo.json')));
    assert.equal(alerts.length, 3);
    const a = alerts.find((x) => x.key === 'SENAMHI_BO:648')!;
    assert.equal(a.source, 'SENAMHI_BO');
    assert.equal(a.severity, 'Severe'); // naranja
    assert.equal(a.event, 'Lluvia con tormenta eléctrica');
    assert.match(a.headline, /^Alerta naranja N\.° 93\/26 · Lluvia con tormenta eléctrica$/);
    assert.match(a.description, /LUIS CALVO/);
    assert.equal(a.onset, '2026-11-07T04:00:00.000Z');
    assert.equal(a.expires, '2026-11-08T03:59:59.000Z');
    assert.ok(a.areas[0]!.polygons.length > 0);
    // Un punto de la zona (cerca de Vallegrande) está adentro; La Paz, no.
    const [lat, lon] = a.areas[0]!.polygons[0]![0]!;
    assert.ok(Number.isFinite(lat) && lat < -10 && lon < -57);
    assert.equal(covers(a, -16.5, -68.15), false);
  });

  it('Perú: avisos emitidos o vigentes de la tabla, sin los cancelados, con sus mapas', () => {
    const list = parsePeList(fixture('senamhi-pe-list.html'));
    assert.deepEqual(
      list.map((a) => a.number),
      [461, 460, 459, 458, 457, 456, 454, 453],
    );
    const a461 = list[0]!;
    assert.equal(a461.title, 'INCREMENTO DE VIENTO EN LA SELVA CENTRO Y SUR - DECIMO QUINTO FRIAJE');
    assert.equal(a461.issued, '2026-11-06');
    // La tabla no dice cuántos mapas tiene cada aviso: se buscan después.
    assert.deepEqual(a461.maps, []);
    assert.match(a461.web, /^https:\/\/www\.senamhi\.gob\.pe\/\?p=aviso-meteorologico-vigente&a=2026&b=29358/);
  });

  it('Perú: una alerta por nivel (sin el verde), con la vigencia de cada mapa', () => {
    const aviso = { number: 461, title: 'INCREMENTO DE VIENTO EN LA SELVA CENTRO Y SUR (EXTENSIÓN DEL AVISO 455)', issued: '2026-11-06', web: 'https://x', maps: [1] };
    const square = (lon: number, lat: number) => [[[[lon, lat], [lon + 1, lat], [lon + 1, lat + 1], [lon, lat + 1], [lon, lat]]]];
    const f = (nivel: string, lon: number) => ({
      properties: { nivel, nro_mapa: 1, fech_ini: '2026-11-08T05:00:00Z', fech_fin: '2026-11-09T04:59:59Z' },
      geometry: { type: 'MultiPolygon', coordinates: square(lon, -12) },
    });
    const alerts = peAlerts(aviso, [f('Nivel 1', -80), f('Nivel 2', -76), f('Nivel 3', -74), f('Nivel 3', -72)]);
    assert.equal(alerts.length, 2);
    const orange = alerts.find((a) => a.severity === 'Severe')!;
    assert.equal(orange.key, 'SENAMHI_PE:461:1:3');
    assert.equal(orange.event, 'Incremento de viento en la selva centro y sur');
    assert.equal(orange.headline, 'Aviso N.° 461, nivel naranja · Incremento de viento en la selva centro y sur');
    assert.equal(orange.expires, '2026-11-09T04:59:59.000Z');
    assert.equal(orange.areas[0]!.polygons.length, 2);
    assert.equal(covers(orange, -11.5, -73.5), true);
    assert.equal(covers(orange, -11.5, -79.5), false); // el verde no es alerta
  });

  it('Perú: baja cada mapa una sola vez mientras el aviso siga publicado', async () => {
    const cache = createPeCache();
    const asked: string[] = [];
    const future = new Date(Date.now() + 86_400_000).toISOString();
    // Cada aviso tiene dos mapas: el tercero viene vacío.
    const fake = (async (url: string) => {
      asked.push(url);
      if (url.includes('aviso-meteorologico')) return new Response(fixture('senamhi-pe-list.html'));
      if (/qry:\d+_3_/.test(url)) return Response.json({ features: [] });
      return Response.json({ features: [{ properties: { nivel: 'Nivel 2', nro_mapa: Number(url.match(/qry:\d+_(\d)_/)![1]), fech_ini: '2026-11-08T05:00:00Z', fech_fin: future }, geometry: { type: 'Polygon', coordinates: [[[-75, -12], [-74, -12], [-74, -11], [-75, -11], [-75, -12]]] } }] });
    }) as typeof fetch;
    const first = await fetchSenamhiPe(cache, fake);
    const wfs = asked.filter((u) => u.includes('geoserver')).length;
    assert.equal(wfs, 8 * 3); // 8 avisos × (2 mapas + el vacío)
    assert.equal(first.length, 8 * 2);
    await fetchSenamhiPe(cache, fake);
    assert.equal(asked.filter((u) => u.includes('geoserver')).length, wfs);
  });

  it('textos en mayúsculas → oración', () => {
    assert.equal(sentence('  DESCENSO BRUSCO  DE TEMPERATURAS '), 'Descenso brusco de temperaturas');
  });
});

describe('volcanes de Perú (CENVUL)', () => {
  it('lee el color de cada volcán y devuelve los que no están en verde, ubicados', async () => {
    const { parseCenvul } = await import('../src/volcanoes/cenvul.ts');
    const list = parseCenvul(fixture('cenvul.html'));
    assert.deepEqual(list.map((v) => [v.name, v.level, v.source]), [['VOLCÁN SABANCAYA', 'orange', 'CENVUL']]);
    assert.equal(list[0]!.lat, -15.787);
    assert.throws(() => parseCenvul('<html></html>'), /no trae los datos/);
  });

  // Muestra REAL bajada el 2026-11-20: el servicio "status-volcanos" de la fuente responde 401 y solo queda el último boletín.
  it('si el estado de los volcanes da 401, usa el último boletín (si es reciente)', async () => {
    const { parseCenvul } = await import('../src/volcanoes/cenvul.ts');
    const html = fixture('cenvul-sin-estado-2026-11-20.html');
    const list = parseCenvul(html, Date.parse('2026-11-20T15:00:00Z'));
    assert.deepEqual(list.map((v) => [v.name, v.level, v.source]), [['VOLCÁN SABANCAYA', 'orange', 'CENVUL']]);
    // Boletín viejo: ya no sirve y se informa la falla.
    assert.throws(() => parseCenvul(html, Date.parse('2027-01-20T00:00:00Z')), /lista de volcanes vacía/);
  });
});
