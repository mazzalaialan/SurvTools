import { describe, expect, it } from 'vitest';
import type { GardenBed, Planting } from '@/core/model/types';
import { cropCalendar, ESTIMATED_ZONES, harvestMonths, missingInZone, monthPlan, parseMonths, ZONE_TABLES, ZONES, zoneFor } from './calendar';
import { CROP_BY_ID, CROPS, gridFootprint } from './crops';
import { frostDates } from './frostDates';
import { readilyAvailableMm, beforeLastFrost, dueTasks, frostRisk, gridSize, outdoorPlantings, plantsFor, recommendForBed, waterBalance, type WaterDay } from './logic';

const base = { createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', deletedAt: null };

function bed(over: Partial<GardenBed> = {}): GardenBed {
  return { id: 'b1', name: 'Cantero 1', kind: 'bed', greenhouse: false, widthCm: 120, lengthCm: 300, sunHours: 8, waypointId: null, notes: '', order: 0, ...base, ...over };
}

function planting(over: Partial<Planting> = {}): Planting {
  return {
    id: 'p1',
    cropId: 'tomate',
    variety: '',
    bedId: 'b1',
    cells: [0],
    method: 'nursery',
    sownOn: '2026-08-01',
    transplantedOn: '2026-10-01',
    status: 'growing',
    endedOn: null,
    notes: '',
    harvests: [],
    ...base,
    ...over,
  };
}

describe('fichas', () => {
  it('cada asociación, enemigo y zona apunta a un cultivo que existe', () => {
    for (const c of CROPS) {
      for (const id of [...c.companions, ...c.avoid]) expect(CROP_BY_ID.has(id), `${c.id} → ${id}`).toBe(true);
      expect(c.daysToHarvest[0]).toBeLessThanOrEqual(c.daysToHarvest[1]);
      if (c.sowing !== 'direct' && !c.perennial) expect(c.nurseryDays, c.id).toBeDefined();
    }
    for (const z of ZONES) for (const id of Object.keys(ZONE_TABLES[z])) expect(CROP_BY_ID.has(id), `${z}: ${id}`).toBe(true);
  });

  it('en la grilla de 30 cm: zanahorias muchas por cuadro, zapallo varios cuadros', () => {
    expect(gridFootprint(CROP_BY_ID.get('zanahoria')!).perCell).toBe(36);
    expect(gridFootprint(CROP_BY_ID.get('lechuga')!).perCell).toBe(1);
    expect(gridFootprint(CROP_BY_ID.get('zapallo')!).side).toBe(4);
    expect(plantsFor(CROP_BY_ID.get('zapallo')!, 16)).toBe(1);
    expect(plantsFor(CROP_BY_ID.get('rabanito')!, 2)).toBe(72);
    // Por superficie real: tomate a 40 cm son 6,25 plantas por m² (no una por cuadro de 30 cm).
    expect(plantsFor(CROP_BY_ID.get('tomate')!, 4)).toBe(2);
    expect(plantsFor(CROP_BY_ID.get('tomate')!, 11)).toBe(6);
    expect(plantsFor(CROP_BY_ID.get('lechuga')!, 4)).toBe(5);
  });
});

describe('almácigos al aire libre', () => {
  const beds = new Map<string, GardenBed>([['b1', bed()]]);
  const nursery = (over: Partial<Planting> = {}) => planting({ id: 'n1', cropId: 'tomate', bedId: null, status: 'nursery', method: 'nursery', ...over });

  it('un almácigo cuenta para helada y riego solo si se marcó que está afuera, y trae su lugar', () => {
    expect(outdoorPlantings(beds, [nursery()])).toHaveLength(0); // adentro de casa
    const out = outdoorPlantings(beds, [nursery({ nurseryWaypointId: 'wp1' })]);
    expect(out).toHaveLength(1);
    expect(out[0]!.waypointId).toBe('wp1');
  });

  it('un almácigo de afuera sin su lugar no cuenta, y uno terminado tampoco', () => {
    expect(outdoorPlantings(beds, [nursery({ nurseryWaypointId: null })])).toHaveLength(0);
    expect(outdoorPlantings(beds, [nursery({ nurseryWaypointId: 'wp1', status: 'done' })])).toHaveLength(0);
  });
});

describe('reserva de agua según la tierra', () => {
  const tomate = CROP_BY_ID.get('tomate')!;
  it('una tierra arenosa guarda menos que una franca y una arcillosa algo más', () => {
    const franca = readilyAvailableMm(tomate);
    expect(readilyAvailableMm(tomate, 'loam')).toBe(franca);
    expect(readilyAvailableMm(tomate, 'sandy')).toBeLessThan(franca);
    expect(readilyAvailableMm(tomate, 'clay')).toBeGreaterThan(franca);
  });
  it('en arena el aviso de riego salta antes con la misma sequía', () => {
    const days = Array.from({ length: 8 }, (_, i) => ({ date: `2026-11-0${i + 1}`, et0: 5, rain: 0 }));
    const p = planting({ cropId: 'tomate', status: 'growing', bedId: 'b1', sownOn: '2026-10-01', transplantedOn: '2026-10-01' });
    const sandy = waterBalance([{ planting: p, crop: tomate, soil: 'sandy' }], days, '2026-11-08', null)!;
    const clay = waterBalance([{ planting: p, crop: tomate, soil: 'clay' }], days, '2026-11-08', null)!;
    expect(sandy.thresholdMm).toBeLessThan(clay.thresholdMm);
    expect(sandy.deficitMm).toBe(clay.deficitMm);
  });
});

describe('calendario', () => {
  it('lee meses y rangos que cruzan el año', () => {
    expect([...parseMonths('8-11,2')]).toEqual([8, 9, 10, 11, 2]);
    expect([...parseMonths('11-2')]).toEqual([11, 12, 1, 2]);
    expect(parseMonths(undefined).size).toBe(0);
  });

  it('tomate en la Pampeana: almácigo en invierno, trasplante en primavera, cosecha en verano', () => {
    const cal = cropCalendar('pampeana', 'tomate')!;
    expect(cal.nursery.has(7)).toBe(true);
    expect(cal.transplant.has(10)).toBe(true);
    for (const m of [12, 1, 2, 3]) expect(cal.harvest.has(m), `mes ${m}`).toBe(true);
    expect(cal.harvest.has(7)).toBe(false);
  });

  it('la cosecha se calcula desde la siembra más los días a cosecha', () => {
    // Rabanito sembrado en septiembre: se cosecha en octubre.
    expect(harvestMonths(CROP_BY_ID.get('rabanito')!, { S: '9' }).has(10)).toBe(true);
    expect(harvestMonths(CROP_BY_ID.get('ajo')!, { S: '3-5', H: '11-12' })).toEqual(new Set([11, 12]));
  });

  it('en Patagonia sur el tomate va bajo cubierta y el zapallo no figura', () => {
    expect(cropCalendar('patagoniaSur', 'tomate')!.cover).toBe(true);
    expect(missingInZone('patagoniaSur').map((c) => c.id)).toContain('zapallo');
  });

  it('qué hacer en octubre en Alto Valle', () => {
    const plan = monthPlan('patagoniaNorte', 10);
    expect(plan.transplant.map((c) => c.crop.id)).toContain('tomate');
    expect(plan.sow.map((c) => c.crop.id)).toContain('choclo');
  });

  it('zona según el lugar', () => {
    expect(zoneFor(-34.6, -58.4, 'AR')).toBe('pampeana'); // Buenos Aires
    expect(zoneFor(-36.6, -64.3, 'AR')).toBe('pampeana'); // Santa Rosa
    expect(zoneFor(-38.95, -68.06, 'AR')).toBe('patagoniaNorte'); // Neuquén
    expect(zoneFor(-40.8, -63.0, 'AR')).toBe('patagoniaNorte'); // Viedma
    expect(zoneFor(-41.13, -71.3, 'AR')).toBe('patagoniaSur'); // Bariloche
    expect(zoneFor(-51.6, -69.2, 'AR')).toBe('patagoniaSur'); // Río Gallegos
    expect(zoneFor(-32.9, -68.8, 'AR')).toBe('cuyo'); // Mendoza
    expect(zoneFor(-29.4, -66.9, 'AR')).toBe('noa'); // La Rioja
    expect(zoneFor(-24.8, -65.4, 'AR')).toBe('noa'); // Salta
    expect(zoneFor(-27.5, -58.8, 'AR')).toBe('nea'); // Corrientes
    expect(zoneFor(-27.4, -55.9, 'AR')).toBe('nea'); // Posadas
    expect(zoneFor(-31.4, -64.2, 'AR')).toBe('pampeana'); // Córdoba
    expect(zoneFor(-34.9, -56.2, 'UY')).toBe('pampeana'); // Montevideo
    expect(zoneFor(-25.3, -57.6, 'PY')).toBe('nea'); // Asunción
    expect(zoneFor(-33.45, -70.66, 'CL')).toBe('cuyo'); // Santiago
    expect(zoneFor(-41.47, -72.94, 'CL')).toBe('patagoniaSur'); // Puerto Montt
    expect(zoneFor(-23.65, -70.4, 'CL')).toBe('noa'); // Antofagasta
  });
});

describe('canteros y seguimiento', () => {
  it('grilla en cuadros de 30 cm', () => {
    expect(gridSize(bed())).toEqual({ cols: 4, rows: 10 });
    expect(gridSize(bed({ widthCm: 20, lengthCm: 20 }))).toEqual({ cols: 1, rows: 1 });
  });

  it('tareas: trasplantar el almácigo, empezar a cosechar', () => {
    const tasks = dueTasks(
      [
        planting({ id: 'a', status: 'nursery', transplantedOn: null, sownOn: '2026-08-01' }),
        planting({ id: 'b', status: 'growing', transplantedOn: '2026-09-01' }),
        planting({ id: 'c', status: 'growing', transplantedOn: '2026-11-01' }),
      ],
      '2026-12-01',
    );
    expect(tasks.map((t) => t.id)).toEqual(['a:transplant', 'b:harvest']);
  });

  it('recomendaciones: tomate en octubre en la Pampeana, no a la sombra, no en maceta lo que no va', () => {
    const opts = { zone: 'pampeana' as const, today: '2026-10-10', lastFrost: null };
    expect(recommendForBed(bed(), [], opts).map((r) => r.crop.id)).toContain('tomate');
    expect(recommendForBed(bed({ sunHours: 4 }), [], opts).map((r) => r.crop.id)).not.toContain('tomate');
    expect(recommendForBed(bed({ kind: 'pot' }), [], opts).map((r) => r.crop.id)).not.toContain('zapallo');
  });

  it('asociaciones y rotación ordenan las recomendaciones', () => {
    const opts = { zone: 'pampeana' as const, today: '2026-10-10', lastFrost: null };
    const withTomato = recommendForBed(bed(), [planting({ cropId: 'tomate' })], opts);
    const basil = withTomato.find((r) => r.crop.id === 'albahaca')!;
    expect(basil.friends.map((c) => c.id)).toEqual(['tomate']);
    const potato = withTomato.find((r) => r.crop.id === 'papa');
    if (potato) expect(potato.foes.map((c) => c.id)).toContain('tomate');
    // Después de tomates (solanáceas), los pimientos pierden puntos.
    const after = recommendForBed(bed(), [planting({ cropId: 'tomate', status: 'done', endedOn: '2026-04-01' })], opts);
    expect(after.find((r) => r.crop.id === 'pimiento')?.sameFamilyRecently).toBe(true);
  });

  it('antes de la última helada no recomienda sembrar sensibles al aire libre (sí en invernadero)', () => {
    expect(beforeLastFrost('2026-10-05', '10-20')).toBe(true);
    expect(beforeLastFrost('2026-11-05', '10-20')).toBe(false);
    const opts = { zone: 'pampeana' as const, today: '2026-10-05', lastFrost: '10-20' };
    const out = recommendForBed(bed(), [], opts).find((r) => r.crop.id === 'tomate');
    // Al aire libre todavía no se trasplanta: solo el almácigo.
    expect(out?.action).toBe('nursery');
    expect(recommendForBed(bed({ greenhouse: true }), [], opts).find((r) => r.crop.id === 'tomate')?.action).toBe('transplant');
  });
});

describe('helada y riego', () => {
  const beds = new Map([
    ['b1', bed()],
    ['g', bed({ id: 'g', greenhouse: true })],
  ]);

  it('los canteros en invernadero no cuentan', () => {
    const out = outdoorPlantings(beds, [planting(), planting({ id: 'p2', bedId: 'g' }), planting({ id: 'p3', status: 'nursery' })]);
    expect(out.map((o) => o.planting.id)).toEqual(['p1']);
  });

  it('helada: los sensibles con 2 °C, los semirresistentes recién con −2 °C', () => {
    const outdoor = outdoorPlantings(beds, [planting(), planting({ id: 'l', cropId: 'lechuga' })]);
    const r = frostRisk(outdoor, [{ date: '2026-10-11', min: 1 }], '2026-10-10');
    expect(r?.crops.map((c) => c.id)).toEqual(['tomate']);
    expect(frostRisk(outdoor, [{ date: '2026-10-11', min: -3 }], '2026-10-10')?.crops.map((c) => c.id)).toEqual(['tomate', 'lechuga']);
    expect(frostRisk(outdoor, [{ date: '2026-10-14', min: -3 }], '2026-10-10')).toBeNull();
    expect(frostRisk(outdoorPlantings(beds, [planting({ bedId: 'g' })]), [{ date: '2026-10-11', min: -3 }], '2026-10-10')).toBeNull();
  });

  it('riego: sin lluvia el déficit crece hasta pedir agua; la lluvia y el riego lo vuelven a cero', () => {
    const outdoor = outdoorPlantings(beds, [planting({ cropId: 'lechuga', transplantedOn: '2026-11-01' })]);
    const dry: WaterDay[] = Array.from({ length: 10 }, (_, i) => ({ date: `2026-11-${String(11 + i).padStart(2, '0')}`, et0: 5, rain: 0 }));
    const b = waterBalance(outdoor, dry, '2026-11-20', null)!;
    expect(b.needsWater).toBe(true);
    expect(b.thresholdMm).toBe(15);
    const rainy = dry.map((d) => (d.date === '2026-11-19' ? { ...d, rain: 40 } : d));
    expect(waterBalance(outdoor, rainy, '2026-11-20', null)!.needsWater).toBe(false);
    expect(waterBalance(outdoor, dry, '2026-11-20', '2026-11-19')!.needsWater).toBe(false);
    // Una garúa de 2 mm no cuenta.
    const drizzle = dry.map((d) => ({ ...d, rain: 2 }));
    expect(waterBalance(outdoor, drizzle, '2026-11-20', null)!.needsWater).toBe(true);
    expect(waterBalance([], dry, '2026-11-20', null)).toBeNull();
  });
});

describe('lo que se manda al servidor', () => {
  it('un lugar por grupo de canteros a menos de 1 km, sin los de invernadero ni los sin ubicación', async () => {
    const { gardenServerBody } = await import('./serverSync');
    const wp = (id: string, lat: number, lon: number) => ({ id, name: id, lat, lon, alt: null, icon: 'pin', notes: '', rainAlerts: false, ...base });
    const waypoints = new Map([
      ['casa1', wp('casa1', -34.9201, -57.9501)],
      ['casa2', wp('casa2', -34.9203, -57.9502)],
      ['campo', wp('campo', -35.5, -58.5)],
    ]);
    const beds = new Map([
      ['b1', bed({ id: 'b1', waypointId: 'casa1' })],
      ['b2', bed({ id: 'b2', name: 'Cantero 2', waypointId: 'casa2' })],
      ['b3', bed({ id: 'b3', name: 'Campo', waypointId: 'campo' })],
      ['g', bed({ id: 'g', greenhouse: true, waypointId: 'casa1' })],
      ['x', bed({ id: 'x', name: 'Sin lugar' })],
    ]);
    const plantings = new Map(
      [
        planting({ id: 'p1', bedId: 'b1' }),
        planting({ id: 'p2', bedId: 'b2', cropId: 'lechuga' }),
        planting({ id: 'p3', bedId: 'b3', cropId: 'ajo' }),
        planting({ id: 'p4', bedId: 'g' }),
        planting({ id: 'p5', bedId: 'x' }),
        planting({ id: 'p6', bedId: null, status: 'nursery', transplantedOn: null }),
      ].map((p) => [p.id, p]),
    );
    const body = gardenServerBody(beds, plantings, waypoints, { gardenFrostAlerts: true, gardenWaterAlerts: true, gardenWateredAt: {} }, 'es', (k, o) => `${k}:${o?.crop}`, '2026-11-05');
    expect(body.places).toHaveLength(2);
    const casa = body.places.find((p) => p.label === 'casa1, casa2')!;
    expect(casa.frost).toEqual([
      { name: 'Tomate', threshold: 2 },
      { name: 'Lechuga', threshold: -2 },
    ]);
    expect(casa.lat).toBe(-34.92);
    // El ajo resiste la helada: el campo solo tiene riego.
    expect(body.places.find((p) => p.label === 'campo')!.frost).toEqual([]);
    expect(body.tasks.map((t) => t.id)).toContain('p6:transplant');
  });
});

describe('zona estimada del trópico y los Yungas de Bolivia', () => {
  it('tiene los 12 cultivos del cuadro, está marcada como estimada y se elige a mano', () => {
    expect(Object.keys(ZONE_TABLES.tropicoBolivia)).toHaveLength(12);
    expect(ESTIMATED_ZONES.has('tropicoBolivia')).toBe(true);
    expect(zoneFor(-17.4, -66.1, 'BO')).toBeNull();
  });
  it('el rabanito se siembra todo el año y la lechuga de septiembre a enero', () => {
    expect(parseMonths(ZONE_TABLES.tropicoBolivia.rabanito!.S).size).toBe(12);
    expect([...parseMonths(ZONE_TABLES.tropicoBolivia.lechuga!.S)].sort((a, b) => a - b)).toEqual([1, 9, 10, 11, 12]);
  });
});

describe('zona estimada de la sierra de Perú', () => {
  const t = ZONE_TABLES.sierraPeru;
  const sorted = (spec: string | undefined) => [...parseMonths(spec)].sort((a, b) => a - b);
  it('tiene los 7 cultivos andinos del calendario del INIA, está marcada como estimada y se elige a mano', () => {
    expect(Object.keys(t).sort()).toEqual(['canihua', 'cebada', 'haba', 'maiz-amilaceo', 'oca', 'papa', 'quinua']);
    expect(ESTIMATED_ZONES.has('sierraPeru')).toBe(true);
    expect(zoneFor(-13.5, -72, 'PE')).toBeNull();
  });
  it('siembra en los meses del INIA: setiembre, octubre y noviembre', () => {
    expect(sorted(t.quinua!.S)).toEqual([9, 11]);
    expect(sorted(t.papa!.S)).toEqual([9, 11]);
    expect(sorted(t['maiz-amilaceo']!.S)).toEqual([9, 10]);
    expect(sorted(t.oca!.S)).toEqual([9, 10]);
    expect(sorted(t.haba!.S)).toEqual([9, 10]);
    expect(sorted(t.canihua!.S)).toEqual([10, 11]);
    expect(sorted(t.cebada!.S)).toEqual([10, 11]);
  });
  it('la cosecha cae de febrero a junio según el ciclo de cada cultivo', () => {
    for (const id of Object.keys(t)) {
      const h = cropCalendar('sierraPeru', id)!.harvest;
      expect(h.size, id).toBeGreaterThan(0);
      for (const m of h) expect([1, 2, 3, 4, 5, 6, 7], `${id} ${m}`).toContain(m);
    }
    expect(sorted(t.papa!.H)).toEqual([3, 4, 5, 6]);
    // La oca, de setiembre/octubre, se cosecha en abril y mayo (INIA).
    const oca = cropCalendar('sierraPeru', 'oca')!.harvest;
    expect(oca.has(4) && oca.has(5)).toBe(true);
  });
});

describe('mejoras de la huerta (2026-11-12)', () => {
  const tomate = CROP_BY_ID.get('tomate')!;
  const p = planting({ cropId: 'tomate', status: 'growing', bedId: 'b1', sownOn: '2026-10-01', transplantedOn: '2026-10-01' });
  const days: WaterDay[] = Array.from({ length: 8 }, (_, i) => ({ date: `2026-11-0${i + 1}`, et0: 5, rain: 6 }));

  it('noche despejada y sin viento: avisa helada con una mínima de 3 °C a los sensibles', () => {
    const outdoor = [{ planting: p, crop: tomate }];
    expect(frostRisk(outdoor, [{ date: '2026-10-11', min: 3, cloud: 60, wind: 5 }], '2026-10-10')).toBeNull();
    expect(frostRisk(outdoor, [{ date: '2026-10-11', min: 3, cloud: 10, wind: 20 }], '2026-10-10')).toBeNull();
    const r = frostRisk(outdoor, [{ date: '2026-10-11', min: 3, cloud: 10, wind: 5 }], '2026-10-10');
    expect(r?.clearCalm).toBe(true);
    expect(r?.crops.map((c) => c.id)).toEqual(['tomate']);
  });

  it('en maceta la reserva es la mitad que en un cantero', () => {
    expect(readilyAvailableMm(tomate, 'loam', true)).toBeCloseTo(readilyAvailableMm(tomate, 'loam') / 2, 1);
  });

  it('invernadero: la lluvia no cuenta y se evapora menos', () => {
    const afuera = waterBalance([{ planting: p, crop: tomate }], days, '2026-11-08', null)!;
    const adentro = waterBalance([{ planting: p, crop: tomate }], days, '2026-11-08', null, { greenhouse: true })!;
    expect(afuera.rainMm).toBeGreaterThan(0);
    expect(adentro.rainMm).toBe(0);
    expect(adentro.deficitMm).toBeGreaterThan(afuera.deficitMm);
  });

  it('fechas de helada del lugar: promedio, la más tardía y heladas todo el año', () => {
    const times: string[] = [];
    const mins: number[] = [];
    for (const [y, last, first] of [[2021, '09-10', '05-20'], [2022, '09-30', '05-05']] as const) {
      for (let d = new Date(Date.UTC(y, 0, 1)); d.getUTCFullYear() === y; d = new Date(d.getTime() + 86_400_000)) {
        const iso = d.toISOString().slice(0, 10);
        const md = iso.slice(5);
        times.push(iso);
        mins.push(md === last || md === first ? 0 : 10);
      }
    }
    const f = frostDates(times, mins);
    expect(f.years).toBe(2);
    expect(f.lastLatest).toBe('09-30');
    expect(f.lastAvg).toBe('09-20');
    expect(f.firstEarliest).toBe('05-05');
    expect(f.allYear).toBe(false);
    expect(frostDates(['2023-12-20'], [1]).allYear).toBe(true);
  });
});

describe('invernadero sin waypoint', () => {
  it('queda en su propia lista (sin aviso de riego) y no en la de canteros sin lugar', async () => {
    const { placeGroups } = await import('./status');
    const beds = new Map<string, GardenBed>([
      ['g', bed({ id: 'g', greenhouse: true, waypointId: null })],
      ['b1', bed({ id: 'b1', waypointId: null })],
    ]);
    const r = placeGroups(beds, [planting({ id: 'p1', bedId: 'g' }), planting({ id: 'p2', bedId: 'b1' })], () => null);
    expect(r.unplacedGreenhouse.map((b) => b.id)).toEqual(['g']);
    expect(r.unplaced.map((b) => b.id)).toEqual(['b1']);
  });
});
