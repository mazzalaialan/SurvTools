import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { latestForecastUrl, latestLakeUrl, parseForecastSummary, parseLakeBulletin, type BoExtras } from '../src/rivers/boExtra.ts';
import { loadConfig } from '../src/config.ts';
import { riversRoutes } from '../src/routes/rivers.ts';

// Texto real (recortado) de «RESUMEN DEL BOLETÍN DE PRONÓSTICO HIDROLÓGICO … VIERNES 13-11-2026» tal como lo da unpdf.
const forecastText = `RESUMEN DEL BOLETÍN DE PRONÓSTICO
HIDROLÓGICO
Unidad de Análisis y Pronósticos Hidrológicos
DEL 13 AL 27 NOVIEMBRE DE 2026
SENAMHI, Viernes 13 noviembre de 2026
NOTA:
Amenaza: aportes y ascensos de niveles del 07 AL 09, 14 al 16, 17 al 19, 21 al 23, 23 al 25,
25 al 27 noviembre sobre las cuencas de Tarija , Chuquisaca, Santa Cruz, Cbba, Beni,
La Paz, Pando. Se sugiere tomar precauciones en zonas ribereñas y monitorear
permanentemente el comportamiento de los niveles de agua.
RESUMEN PRONÓSTICO HIDROLÓGICO
Probables Ascensos : Del 13 al 16, 17 al 19, 21 al 23, 23 al 25, 25 al 27/11/2026Nivel Hidrologico de Amenazas
Inundación severa inminente o en curso.`;

// Texto real (recortado) de «LAGO TITICACA - BOLETIN Semanal (Actualizado 06_11_2026)».
const lakeText = `NIVELES LAGO TITICACA
ESTACIÓN HUATAJATA
FECHA: 06 de noviembre de 2026
NIVEL: 3.23 m. (3807.637 m.s.n.m.)
VARIACIÓN ÚLTIMA SEMANA: Descenso 2 cm
- El nivel del Lago Titicaca en la estación hidrométrica de HUATAJATA a
horas 08:00 a.m. es de 3.23 m. y en términos absolutos 3807.637 m.s.n.m.,
los niveles actuales se encuentran 0.87 m por debajo de su promedio
histórico, cabe recalcar que la gráfica es la comparación`;

const link = (p: string) => `<a href="https://senamhi.gob.bo/../meteorologia/boletines/pronostico_hidrologico/2026/NOVIEMBRE/${p}">x</a>`;

describe('pronóstico hidrológico y boletín del lago (SENAMHI Bolivia)', () => {
  it('lee la fecha, el período, la nota textual y los períodos de ascensos del resumen', () => {
    const f = parseForecastSummary(forecastText, 'https://x/r.pdf')!;
    assert.equal(f.issuedOn, '2026-11-13');
    assert.equal(f.period, 'Del 13 al 27 noviembre de 2026');
    assert.match(f.note, /^Amenaza: aportes y ascensos de niveles del 07 AL 09/);
    assert.match(f.note, /cuencas de Tarija , Chuquisaca, Santa Cruz, Cbba, Beni, La Paz, Pando\. Se sugiere tomar precauciones/);
    assert.equal(f.trend, 'rises');
    assert.equal(f.spans, 'Del 13 al 16, 17 al 19, 21 al 23, 23 al 25, 25 al 27/11/2026');
    assert.equal(f.url, 'https://x/r.pdf');
    // Un resumen de descensos.
    assert.equal(parseForecastSummary(forecastText.replace('Probables Ascensos :', 'Probables Descensos:'))!.trend, 'falls');
  });

  it('un PDF que cambió de formato no se lee', () => {
    assert.equal(parseForecastSummary('hola'), null);
    assert.equal(parseForecastSummary(forecastText.replace('NOTA:', 'NOTITA:')), null);
    assert.equal(parseLakeBulletin('otro texto'), null);
  });

  it('lee el nivel del lago, la variación semanal y la diferencia con el promedio histórico', () => {
    const l = parseLakeBulletin(lakeText, 'https://x/l.pdf')!;
    assert.deepEqual({ date: l.date, levelM: l.levelM, absoluteM: l.absoluteM, weekCm: l.weekCm, vsAverageM: l.vsAverageM }, { date: '2026-11-06', levelM: 3.23, absoluteM: 3807.637, weekCm: -2, vsAverageM: -0.87 });
    assert.equal(parseLakeBulletin(lakeText.replace('Descenso 2 cm', 'Ascenso 5 cm').replace('por debajo', 'por encima'))!.weekCm, 5);
    assert.equal(parseLakeBulletin(lakeText.replace('por debajo', 'por encima'))!.vsAverageM, 0.87);
    assert.equal(parseLakeBulletin(lakeText.replace('Descenso 2 cm', 'Se mantiene'))!.weekCm, 0);
  });

  it('del listado toma el resumen más nuevo, sin los de planilla ni los «(DIRECTOR)», y el boletín del lago más nuevo', () => {
    const html = [
      link('RESUMEN DEL BOLETÍN DE PRONÓSTICO HIDROLÓGICO SENAMHI JUEVES 12-11-2026.pdf'),
      link('RESUMEN DEL BOLETÍN DE PRONÓSTICO HIDROLÓGICO SENAMHI VIERNES 13-11-2026.pdf'),
      link('RESUMEN EN PLANILLA PRONÓSTICO HIDROLÓGICO SENAMHI SÁBADO 14-11-2026.pdf'),
      link('RESUMEN BOLETÍN PRONÓSTICO HIDROLÓGICO SENAMHI MARTES 16-06-2026 (DIRECTOR).pdf'),
      link('BEN-BOLETÍN DE PRONÓSTICO HIDROLÓGICO SENAMHI VIERNES 13-11-2026.pdf'),
    ].join('\n');
    const url = latestForecastUrl(html)!;
    assert.match(decodeURIComponent(url), /RESUMEN DEL BOLETÍN DE PRONÓSTICO HIDROLÓGICO SENAMHI VIERNES 13-11-2026\.pdf$/);
    assert.ok(url.startsWith('https://senamhi.gob.bo/meteorologia/boletines/'), url); // se resuelve el «../»
    assert.equal(latestForecastUrl('<html>sin nada</html>'), null);
    const lakes = ['02_10', '23_10', '06_11'].map((d) => `<a href="https://senamhi.gob.bo/meteorologia/boletines/hidrologico/LagoTiticaca/2026/x/LAGO TITICACA - BOLETIN Semanal (Actualizado ${d}_2026).pdf">x</a>`).join('');
    assert.match(decodeURIComponent(latestLakeUrl(lakes)!), /Actualizado 06_11_2026\)\.pdf$/);
  });
});

describe('GET /api/rivers/bo/extra', () => {
  const extras = (fetchedAt: number): BoExtras => ({ fetchedAt, forecast: parseForecastSummary(forecastText, 'u'), lake: parseLakeBulletin(lakeText, 'u') });
  const build = (get: () => Promise<BoExtras>, clock: { t: number }) => {
    const app = Fastify();
    riversRoutes(app, { ...loadConfig({}), appDir: new URL('../../app/public', import.meta.url).pathname }, { fetch: async () => { throw new Error('no usado'); } }, () => clock.t, get);
    return app;
  };

  it('lee una vez y guarda 6 horas; si falla devuelve lo último bueno como viejo, y 503 si no hay', async () => {
    const clock = { t: 1_000_000 };
    let calls = 0;
    let fail = false;
    const app = build(async () => (calls++, fail ? Promise.reject(new Error('SENAMHI 500')) : extras(clock.t)), clock);
    fail = true;
    assert.equal((await app.inject({ method: 'GET', url: '/api/rivers/bo/extra' })).statusCode, 503);
    fail = false;
    const a = await app.inject({ method: 'GET', url: '/api/rivers/bo/extra' });
    assert.equal(a.statusCode, 200);
    assert.equal(a.json().stale, false);
    assert.equal(a.json().forecast.issuedOn, '2026-11-13');
    assert.equal(a.json().lake.levelM, 3.23);
    assert.equal(a.headers['cache-control'], 'no-store');
    clock.t += 5 * 3_600_000;
    await app.inject({ method: 'GET', url: '/api/rivers/bo/extra' });
    assert.equal(calls, 2); // la primera (503) y esta
    clock.t += 2 * 3_600_000;
    fail = true;
    const stale = await app.inject({ method: 'GET', url: '/api/rivers/bo/extra' });
    assert.equal(stale.json().stale, true);
    clock.t += 15 * 86_400_000;
    assert.equal((await app.inject({ method: 'GET', url: '/api/rivers/bo/extra' })).statusCode, 503);
  });
});
