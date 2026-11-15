import type { Route } from '@playwright/test';

/**
 * La API del INA como es de verdad: con `includeProno=false` las series traen `estacion_id` y no traen datos; con `includeProno=true`
 * traen los datos y NO traen `estacion_id` (solo `series_id`). Una estación, valores diarios (o cada `stepMs`) con banda inferior y superior.
 */
export function inaRunRoute(estacion: number, values: number[], names = { main: 'medio', lo: 'inferior', hi: 'superior' }, stepMs = 86_400_000) {
  const t0 = Math.floor(Date.now() / stepMs) * stepMs;
  const seriesId = 9000 + estacion;
  const pronosticos = values.flatMap((v, i) => [
    { timestart: new Date(t0 + i * stepMs).toISOString(), valor: v, qualifier: names.main },
    { timestart: new Date(t0 + i * stepMs).toISOString(), valor: v - 0.3, qualifier: names.lo },
    { timestart: new Date(t0 + i * stepMs).toISOString(), valor: v + 0.4, qualifier: names.hi },
  ]);
  return (route: Route) => {
    const full = new URL(route.request().url()).searchParams.get('includeProno') === 'true';
    const base = { series_table: 'series', series_id: seriesId, cor_id: 1, tipo: 'puntual' };
    const series = full
      ? [{ ...base, pronosticos, metadata: null }]
      : [{ ...base, pronosticos: [], var_id: 2, begin_date: new Date(t0).toISOString(), end_date: new Date(t0 + (values.length - 1) * stepMs).toISOString(), qualifiers: Object.values(names), count: values.length, estacion_id: estacion, tabla: 'alturas_prefe' }];
    return route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: [{ id: 1, forecast_date: new Date(t0).toISOString(), cal_id: 0, series }] });
  };
}

/**
 * El calibrado 308 del INA (marea astronómica + meteorológica) como es de verdad: la liviana trae `series_id`, `estacion_id` y `var_id`
 * (36 = sobreelevación meteorológica, 2 = altura total) sin datos; la completa, los datos horarios por `series_id`. Dos puntos con
 * la sobreelevación `values` (m, una por hora desde hace una hora) y la altura total.
 */
export function inaSurgeRoute(values: number[]) {
  const t0 = Math.floor(Date.now() / 3_600_000) * 3_600_000 - 3_600_000;
  const at = (i: number) => new Date(t0 + i * 3_600_000).toISOString();
  return (route: Route) => {
    const full = new URL(route.request().url()).searchParams.get('includeProno') === 'true';
    const series = full
      ? [
          { series_id: 6047, pronosticos: values.map((v, i) => ({ timestart: at(i), valor: v, qualifier: 'main' })) },
          { series_id: 6048, pronosticos: values.map((v, i) => ({ timestart: at(i), valor: v, qualifier: 'main' })) },
          { series_id: 6060, pronosticos: values.map((_v, i) => ({ timestart: at(i), valor: 1.1, qualifier: 'main' })) },
        ]
      : [
          { series_id: 6047, estacion_id: 1831, var_id: 36, pronosticos: [] },
          { series_id: 6048, estacion_id: 1832, var_id: 36, pronosticos: [] },
          { series_id: 6060, estacion_id: 1831, var_id: 2, pronosticos: [] },
        ];
    return route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: [{ id: 1, forecast_date: at(0), cal_id: 308, series }] });
  };
}
