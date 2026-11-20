/**
 * Texto de las notificaciones. Lo usa el service worker, que no carga
 * i18next: por eso los textos viven acá y no en locales/*.json.
 */

export interface AlertSummary {
  itemName: string;
  kind: 'expiry' | 'capacity' | 'shortage' | 'minStock' | string;
  dueDate: string | null;
}

type Lang = 'es' | 'en' | 'pt';

/**
 * Los faltantes de un botiquín viajan como `artículo␟botiquín` en el nombre del artículo (separador U+001F): así el aviso se agrupa
 * («Faltan 12 artículos en Botiquín del auto») sin cambiar el formato del índice ni lo que acepta el servidor, que guarda el nombre tal cual.
 */
export const KIT_SEPARATOR = '\u001f';
/** El servidor junta los faltantes de un botiquín en una fila con la cantidad: `artículo␟botiquín␞N` (server/src/alertPayload.ts). */
export const COUNT_SEPARATOR = '\u001e';

const TEXT = {
  es: {
    title: (n: number) => (n === 1 ? '1 alerta pendiente' : `${n} alertas pendientes`),
    expired: 'vencido',
    today: 'vence hoy',
    on: (d: string) => `vence el ${d}`,
    capacity: 'por agotarse',
    shortage: 'falta stock según tus recomendaciones',
    minStock: 'debajo del stock mínimo',
    kitMissing: (n: number, kit: string) => (n === 1 ? `Falta 1 artículo en ${kit}` : `Faltan ${n} artículos en ${kit}`),
    more: (n: number) => `y ${n} más`,
    pushGenericBody: 'Tenés avisos nuevos',
    testTitle: 'Herramientas de Supervivencia por VikArg',
    testBody: 'Las notificaciones funcionan correctamente.',
    here: 'Donde estás',
    rainSoon: (min: number, place: string) => `Lluvia en unos ${min} min · ${place}`,
    rainSoonAt: (time: string, place: string) => `Lluvia a las ${time} · ${place}`,
    rainSoonAtIn: (time: string, min: number, place: string) => `Lluvia a las ${time} (en unos ${min} min) · ${place}`,
    rainStopped: (place: string) => `Dejó de llover · ${place}`,
    raining: (place: string) => `Está lloviendo · ${place}`,
    rainStronger: (place: string) => `La lluvia se intensifica · ${place}`,
    rainBody: (mm: string) => `Se esperan ${mm} mm en las próximas 2 horas.`,
    rainObserved: (rate: string) => `El satélite ve lluvia de unos ${rate} mm/h ahora (estimación por infrarrojo, orientativa).`,
    lastFix: (ago: string) => `Según tu última ubicación conocida (${ago}).`,
    lightning: (km: number, dir: string, place: string) => `Rayos a ${km} km al ${dir} · ${place}`,
    lightningBody: 'Buscá refugio: un edificio o un auto cerrado. Alejate de árboles, alambrados y lugares altos. Detectado por satélite (±8 km).',
    dirs: ['norte', 'noreste', 'este', 'sudeste', 'sur', 'sudoeste', 'oeste', 'noroeste'],
    informative: 'Aviso informativo, no oficial: las alertas oficiales son del SMN.',
    updateTap: 'Tocá para abrir la app y actualizarla.',
    quake: (mag: string, km: number, dir: string, place: string) => `Sismo de magnitud ${mag} a ${km} km al ${dir} · ${place}`,
    quakeBody: (where: string) => `${where}. Datos de USGS (Servicio Geológico de EE. UU.), sin revisar por el INPRES.`,
    tsunami: 'USGS indica posible tsunami: si estás cerca de la costa, alejate y buscá un lugar alto.',
    hazard: (kind: string, km: number, dir: string, place: string) => `${kind} a ${km} km al ${dir} · ${place}`,
    hazardKinds: { TC: 'Ciclón tropical', FL: 'Inundación', WF: 'Incendio forestal', VO: 'Erupción volcánica' },
    hazardBody: (name: string, level: string) => `${name}. Alerta ${level} de GDACS (ONU y Comisión Europea).`,
    levels: { Green: 'verde', Orange: 'naranja', Red: 'roja' },
    hazardInformative: 'Aviso informativo, no oficial: seguí las indicaciones de los organismos oficiales (INPRES, SMN, Protección Civil).',
    hazardStock: (places: string) => `Tenés reserva cerca: ${places}. Si podés, ponela a resguardo.`,
    volcano: (name: string, level: string, km: number, dir: string, place: string) => `Volcán ${name}: alerta técnica ${level} · a ${km} km al ${dir} de ${place}`,
    volcanoBody: 'Según el Observatorio Argentino de Vigilancia Volcánica (OAVV, SEGEMAR). Tocá para ver el reporte. Seguí las indicaciones de Protección Civil.',
    volcanoBodyCENVUL: 'Según el Centro Vulcanológico Nacional del Instituto Geofísico del Perú (CENVUL). Tocá para ver el reporte. Seguí las indicaciones de Defensa Civil (INDECI).',
    sources: { INMET: 'INMET', SENAMHI_BO: 'SENAMHI Bolivia', SENAMHI_PE: 'SENAMHI Perú', SIGMET: 'SIGMET' } as Record<string, string>,
    volcanoLevels: { yellow: 'amarilla', orange: 'naranja', red: 'roja' },
    river: (river: string, station: string, level: string, status: string, km: string, dir: string, place: string) => `${river} en ${station}: ${level} m, ${status} · a ${km} km al ${dir} de ${place}`,
    riverStates: { attention: (m: string) => `sobre el nivel de atención (${m} m)`, alert: (m: string) => `sobre el nivel de alerta (${m} m)`, evac: (m: string) => `sobre el nivel de evacuación (${m} m)`, low: (m: string) => `en aguas bajas (bajo ${m} m)` },
    riverForecast: (river: string, station: string, status: string, when: string, km: string, dir: string, place: string) => `Pronóstico: ${river} en ${station} llegaría ${status} el ${when} · a ${km} km al ${dir} de ${place}`,
    riverForecastStates: { attention: (m: string) => `al nivel de atención (${m} m)`, alert: (m: string) => `al nivel de alerta (${m} m)`, evac: (m: string) => `al nivel de evacuación (${m} m)`, low: (m: string) => `a aguas bajas (bajo ${m} m)` },
    riverForecastBody: (level: string) => `Altura prevista: ${level} m. Pronóstico del INA (Alerta Hidrológico), puede cambiar con la lluvia. Aviso informativo, no oficial: seguí las indicaciones de Defensa Civil y de Prefectura. Tocá para ver el pronóstico.`,
    riverBodyBR: (at: string) => `Medido ${at}. Dato de la ANA (telemetría) con las cotas del SGB/CPRM. Aviso informativo, no oficial: seguí las indicaciones de la Defesa Civil (199). Tocá para ver los niveles.`,
    riverStatesBR: { attention: (m: string) => `sobre la cota de atención (${m} m)`, alert: (m: string) => `sobre la cota de alerta (${m} m)`, evac: (m: string) => `sobre la cota de inundación (${m} m)` },
    riverBody: (at: string) => `Medido ${at}. Dato del INA (Alerta Hidrológico). Aviso informativo, no oficial: seguí las indicaciones de Defensa Civil y de Prefectura. Tocá para ver los niveles.`,
    official: (source: string, headline: string) => `${source}: ${headline}`,
    officialWhere: (places: string) => `Incluye ${places}.`,
    officialHere: 'tu ubicación',
    officialValid: (from: string, to: string) => `Rige desde ${from} hasta ${to}.`,
    officialFooter: (sender: string) => `Alerta oficial de ${sender}. Tocá para ver la zona y las indicaciones.`,
    severities: { Extreme: 'extrema', Severe: 'severa', Moderate: 'moderada', Minor: 'leve', Unknown: '' },
    gardenFrost: (when: string, min: number) => `Helada ${when}: mínima de ${min} °C`,
    gardenFrostBody: (crops: string, place: string | null) => `Tapá ${crops}${place ? ` (${place})` : ''}.`,
    gardenTonight: 'esta noche',
    gardenWater: (place: string | null) => `Hay que regar la huerta${place ? ` · ${place}` : ''}`,
    gardenWaterBody: (mm: number, rain: number) => `Al suelo le faltan unos ${mm} mm (llovieron ${rain} mm en 10 días).`,
    gardenTasks: (n: number) => (n === 1 ? 'Huerta: 1 tarea para hoy' : `Huerta: ${n} tareas para hoy`),
  },
  en: {
    title: (n: number) => (n === 1 ? '1 pending alert' : `${n} pending alerts`),
    expired: 'expired',
    today: 'expires today',
    on: (d: string) => `expires ${d}`,
    capacity: 'running low',
    shortage: 'short of your recommended stock',
    minStock: 'below minimum stock',
    kitMissing: (n: number, kit: string) => (n === 1 ? `1 item missing in ${kit}` : `${n} items missing in ${kit}`),
    more: (n: number) => `and ${n} more`,
    pushGenericBody: 'You have new alerts',
    testTitle: 'Survival Tools By VikArg',
    testBody: 'Notifications are working.',
    here: 'Where you are',
    rainSoon: (min: number, place: string) => `Rain in about ${min} min · ${place}`,
    rainSoonAt: (time: string, place: string) => `Rain at ${time} · ${place}`,
    rainSoonAtIn: (time: string, min: number, place: string) => `Rain at ${time} (in about ${min} min) · ${place}`,
    rainStopped: (place: string) => `The rain stopped · ${place}`,
    raining: (place: string) => `It's raining · ${place}`,
    rainStronger: (place: string) => `The rain is getting heavier · ${place}`,
    rainBody: (mm: string) => `${mm} mm expected in the next 2 hours.`,
    rainObserved: (rate: string) => `The satellite sees about ${rate} mm/h of rain now (infrared estimate, approximate).`,
    lastFix: (ago: string) => `Based on your last known location (${ago}).`,
    lightning: (km: number, dir: string, place: string) => `Lightning ${km} km ${dir} · ${place}`,
    lightningBody: 'Take shelter: a building or a closed car. Stay away from trees, wire fences and high ground. Detected by satellite (±8 km).',
    dirs: ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'],
    informative: 'Informational, not official: official alerts come from the SMN.',
    updateTap: 'Tap to open the app and update it.',
    quake: (mag: string, km: number, dir: string, place: string) => `Magnitude ${mag} earthquake ${km} km ${dir} · ${place}`,
    quakeBody: (where: string) => `${where}. Data from USGS, not reviewed by the national seismic agency.`,
    tsunami: 'USGS reports a possible tsunami: if you are near the coast, move away and to high ground.',
    hazard: (kind: string, km: number, dir: string, place: string) => `${kind} ${km} km ${dir} · ${place}`,
    hazardKinds: { TC: 'Tropical cyclone', FL: 'Flood', WF: 'Wildfire', VO: 'Volcanic eruption' },
    hazardBody: (name: string, level: string) => `${name}. GDACS ${level} alert (UN and European Commission).`,
    levels: { Green: 'green', Orange: 'orange', Red: 'red' },
    hazardInformative: 'Informational, not official: follow the instructions of the official agencies.',
    hazardStock: (places: string) => `You have supplies nearby: ${places}. If you can, move them to safety.`,
    volcano: (name: string, level: string, km: number, dir: string, place: string) => `${name} volcano: ${level} technical alert · ${km} km ${dir} of ${place}`,
    volcanoBody: 'According to the Argentine Volcano Observatory (OAVV, SEGEMAR). Tap to see the report. Follow civil protection instructions.',
    volcanoBodyCENVUL: 'According to the National Volcano Center of the Geophysical Institute of Peru (CENVUL). Tap to see the report. Follow civil defense (INDECI) instructions.',
    sources: { INMET: 'INMET', SENAMHI_BO: 'SENAMHI Bolivia', SENAMHI_PE: 'SENAMHI Peru', SIGMET: 'SIGMET' } as Record<string, string>,
    volcanoLevels: { yellow: 'yellow', orange: 'orange', red: 'red' },
    river: (river: string, station: string, level: string, status: string, km: string, dir: string, place: string) => `${river} at ${station}: ${level} m, ${status} · ${km} km ${dir} of ${place}`,
    riverStates: { attention: (m: string) => `above the attention level (${m} m)`, alert: (m: string) => `above the alert level (${m} m)`, evac: (m: string) => `above the evacuation level (${m} m)`, low: (m: string) => `at low water (below ${m} m)` },
    riverForecast: (river: string, station: string, status: string, when: string, km: string, dir: string, place: string) => `Forecast: ${river} at ${station} would reach ${status} on ${when} · ${km} km ${dir} of ${place}`,
    riverForecastStates: { attention: (m: string) => `the attention level (${m} m)`, alert: (m: string) => `the alert level (${m} m)`, evac: (m: string) => `the evacuation level (${m} m)`, low: (m: string) => `low water (below ${m} m)` },
    riverForecastBody: (level: string) => `Expected height: ${level} m. INA forecast (Alerta Hidrológico); it can change with rain. Informational, not official: follow civil defense and coast guard instructions. Tap to see the forecast.`,
    riverBodyBR: (at: string) => `Measured ${at}. Data from ANA (telemetry) with the SGB/CPRM reference levels. Informational, not official: follow the instructions of Defesa Civil (199). Tap to see the levels.`,
    riverStatesBR: { attention: (m: string) => `above the attention mark (${m} m)`, alert: (m: string) => `above the alert mark (${m} m)`, evac: (m: string) => `above the flood mark (${m} m)` },
    riverBody: (at: string) => `Measured ${at}. Data from INA (Alerta Hidrológico). Informational, not official: follow civil defense and coast guard instructions. Tap to see the levels.`,
    official: (source: string, headline: string) => `${source}: ${headline}`,
    officialWhere: (places: string) => `Includes ${places}.`,
    officialHere: 'your location',
    officialValid: (from: string, to: string) => `In effect from ${from} to ${to}.`,
    officialFooter: (sender: string) => `Official alert from ${sender}. Tap to see the area and instructions.`,
    severities: { Extreme: 'extreme', Severe: 'severe', Moderate: 'moderate', Minor: 'minor', Unknown: '' },
    gardenFrost: (when: string, min: number) => `Frost ${when}: low of ${min} °C`,
    gardenFrostBody: (crops: string, place: string | null) => `Cover ${crops}${place ? ` (${place})` : ''}.`,
    gardenTonight: 'tonight',
    gardenWater: (place: string | null) => `Time to water the garden${place ? ` · ${place}` : ''}`,
    gardenWaterBody: (mm: number, rain: number) => `The soil is short about ${mm} mm (${rain} mm of rain in 10 days).`,
    gardenTasks: (n: number) => (n === 1 ? 'Garden: 1 task for today' : `Garden: ${n} tasks for today`),
  },
  pt: {
    title: (n: number) => (n === 1 ? '1 alerta pendente' : `${n} alertas pendentes`),
    expired: 'vencido',
    today: 'vence hoje',
    on: (d: string) => `vence em ${d}`,
    capacity: 'quase acabando',
    shortage: 'falta estoque segundo as suas recomendações',
    minStock: 'abaixo do estoque mínimo',
    kitMissing: (n: number, kit: string) => (n === 1 ? `Falta 1 item em ${kit}` : `Faltam ${n} itens em ${kit}`),
    more: (n: number) => `e mais ${n}`,
    pushGenericBody: 'Você tem avisos novos',
    testTitle: 'Ferramentas de Sobrevivência por VikArg',
    testBody: 'As notificações estão funcionando corretamente.',
    here: 'Onde você está',
    rainSoon: (min: number, place: string) => `Chuva em cerca de ${min} min · ${place}`,
    rainSoonAt: (time: string, place: string) => `Chuva às ${time} · ${place}`,
    rainSoonAtIn: (time: string, min: number, place: string) => `Chuva às ${time} (em cerca de ${min} min) · ${place}`,
    rainStopped: (place: string) => `A chuva parou · ${place}`,
    raining: (place: string) => `Está chovendo · ${place}`,
    rainStronger: (place: string) => `A chuva está ficando mais forte · ${place}`,
    rainBody: (mm: string) => `Esperados ${mm} mm nas próximas 2 horas.`,
    rainObserved: (rate: string) => `O satélite vê chuva de cerca de ${rate} mm/h agora (estimativa por infravermelho, aproximada).`,
    lastFix: (ago: string) => `Com base na sua última localização conhecida (${ago}).`,
    lightning: (km: number, dir: string, place: string) => `Raios a ${km} km ao ${dir} · ${place}`,
    lightningBody: 'Procure abrigo: um prédio ou um carro fechado. Afaste-se de árvores, cercas de arame e lugares altos. Detectado por satélite (±8 km).',
    dirs: ['norte', 'nordeste', 'leste', 'sudeste', 'sul', 'sudoeste', 'oeste', 'noroeste'],
    informative: 'Aviso informativo, não oficial: os alertas oficiais vêm dos órgãos meteorológicos e da Defesa Civil.',
    updateTap: 'Toque para abrir o app e atualizá-lo.',
    quake: (mag: string, km: number, dir: string, place: string) => `Terremoto de magnitude ${mag} a ${km} km ao ${dir} · ${place}`,
    quakeBody: (where: string) => `${where}. Dados do USGS (Serviço Geológico dos EUA), sem revisão do órgão sismológico nacional.`,
    tsunami: 'O USGS indica possível tsunami: se você estiver perto da costa, afaste-se e procure um lugar alto.',
    hazard: (kind: string, km: number, dir: string, place: string) => `${kind} a ${km} km ao ${dir} · ${place}`,
    hazardKinds: { TC: 'Ciclone tropical', FL: 'Inundação', WF: 'Incêndio florestal', VO: 'Erupção vulcânica' },
    hazardBody: (name: string, level: string) => `${name}. Alerta ${level} do GDACS (ONU e Comissão Europeia).`,
    levels: { Green: 'verde', Orange: 'laranja', Red: 'vermelho' },
    hazardInformative: 'Aviso informativo, não oficial: siga as orientações dos órgãos oficiais (Defesa Civil e serviços meteorológicos).',
    hazardStock: (places: string) => `Você tem reserva por perto: ${places}. Se puder, coloque-a em local seguro.`,
    volcano: (name: string, level: string, km: number, dir: string, place: string) => `Vulcão ${name}: alerta técnico ${level} · a ${km} km ao ${dir} de ${place}`,
    volcanoBody: 'Segundo o Observatório Argentino de Vigilância Vulcânica (OAVV, SEGEMAR). Toque para ver o relatório. Siga as orientações da Defesa Civil.',
    volcanoBodyCENVUL: 'Segundo o Centro Vulcanológico Nacional do Instituto Geofísico do Peru (CENVUL). Toque para ver o relatório. Siga as orientações da Defesa Civil (INDECI).',
    sources: { INMET: 'INMET', SENAMHI_BO: 'SENAMHI Bolívia', SENAMHI_PE: 'SENAMHI Peru', SIGMET: 'SIGMET' } as Record<string, string>,
    volcanoLevels: { yellow: 'amarelo', orange: 'laranja', red: 'vermelho' },
    river: (river: string, station: string, level: string, status: string, km: string, dir: string, place: string) => `${river} em ${station}: ${level} m, ${status} · a ${km} km ao ${dir} de ${place}`,
    riverStates: { attention: (m: string) => `acima do nível de atenção (${m} m)`, alert: (m: string) => `acima do nível de alerta (${m} m)`, evac: (m: string) => `acima do nível de evacuação (${m} m)`, low: (m: string) => `em águas baixas (abaixo de ${m} m)` },
    riverForecast: (river: string, station: string, status: string, when: string, km: string, dir: string, place: string) => `Previsão: ${river} em ${station} chegaria ${status} em ${when} · a ${km} km ao ${dir} de ${place}`,
    riverForecastStates: { attention: (m: string) => `ao nível de atenção (${m} m)`, alert: (m: string) => `ao nível de alerta (${m} m)`, evac: (m: string) => `ao nível de evacuação (${m} m)`, low: (m: string) => `a águas baixas (abaixo de ${m} m)` },
    riverForecastBody: (level: string) => `Altura prevista: ${level} m. Previsão do INA (Alerta Hidrológico), pode mudar com a chuva. Aviso informativo, não oficial: siga as orientações da Defesa Civil e das autoridades. Toque para ver os níveis.`,
    riverBodyBR: (at: string) => `Medido ${at}. Dado da ANA (telemetria) com as cotas de referência do SGB/CPRM. Aviso informativo, não oficial: siga as orientações da Defesa Civil (199). Toque para ver os níveis.`,
    riverStatesBR: { attention: (m: string) => `acima da cota de atenção (${m} m)`, alert: (m: string) => `acima da cota de alerta (${m} m)`, evac: (m: string) => `acima da cota de inundação (${m} m)` },
    riverBody: (at: string) => `Medido ${at}. Dado do INA (Alerta Hidrológico). Aviso informativo, não oficial: siga as orientações da Defesa Civil e das autoridades. Toque para ver os níveis.`,
    official: (source: string, headline: string) => `${source}: ${headline}`,
    officialWhere: (places: string) => `Inclui ${places}.`,
    officialHere: 'sua localização',
    officialValid: (from: string, to: string) => `Vigora de ${from} até ${to}.`,
    officialFooter: (sender: string) => `Alerta oficial de ${sender}. Toque para ver a área e as orientações.`,
    severities: { Extreme: 'extrema', Severe: 'severa', Moderate: 'moderada', Minor: 'leve', Unknown: '' },
    gardenFrost: (when: string, min: number) => `Geada ${when}: mínima de ${min} °C`,
    gardenFrostBody: (crops: string, place: string | null) => `Cubra ${crops}${place ? ` (${place})` : ''}.`,
    gardenTonight: 'esta noite',
    gardenWater: (place: string | null) => `Hora de regar a horta${place ? ` · ${place}` : ''}`,
    gardenWaterBody: (mm: number, rain: number) => `Ao solo faltam cerca de ${mm} mm (choveram ${rain} mm em 10 dias).`,
    gardenTasks: (n: number) => (n === 1 ? 'Horta: 1 tarefa para hoje' : `Horta: ${n} tarefas para hoje`),
  },
} as const;

const MAX_LISTED = 3;

function shortDate(day: string, lang: Lang): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y!, m! - 1, d!)));
}

export function alertsNotification(alerts: AlertSummary[], lang: Lang, today: string): { title: string; body: string } {
  const tx = TEXT[lang];
  const describe = (a: AlertSummary) => {
    if (a.kind === 'shortage') return `${a.itemName}: ${tx.shortage}`;
    if (a.kind === 'minStock') return `${a.itemName}: ${tx.minStock}`;
    if (a.kind === 'capacity' || !a.dueDate) return `${a.itemName}: ${tx.capacity}`;
    if (a.dueDate < today) return `${a.itemName}: ${tx.expired}`;
    if (a.dueDate === today) return `${a.itemName}: ${tx.today}`;
    return `${a.itemName}: ${tx.on(shortDate(a.dueDate, lang))}`;
  };
  // Los faltantes de un mismo botiquín se juntan en un solo aviso: una línea por botiquín, no una por artículo.
  const perKit = new Map<string, number>();
  const single: AlertSummary[] = [];
  for (const a of alerts) {
    const at = a.kind === 'minStock' ? a.itemName.indexOf(KIT_SEPARATOR) : -1;
    if (at < 0) single.push(a);
    else {
      const rest = a.itemName.slice(at + 1);
      const c = rest.indexOf(COUNT_SEPARATOR);
      const kit = c < 0 ? rest : rest.slice(0, c);
      const n = c < 0 ? 1 : Math.max(1, Number(rest.slice(c + 1)) || 1);
      perKit.set(kit, (perKit.get(kit) ?? 0) + n);
    }
  }
  // Lo más urgente primero: vencidos y los que vencen antes; los botiquines, después.
  const sorted = [...single].sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
  const all = [...sorted.map(describe), ...[...perKit.entries()].map(([kit, n]) => tx.kitMissing(n, kit))];
  const lines = all.slice(0, MAX_LISTED);
  if (all.length > MAX_LISTED) lines.push(tx.more(all.length - MAX_LISTED));
  return { title: tx.title(all.length), body: lines.join('\n') };
}

/** Aviso genérico de Firebase (la app nativa lo muestra ella cuando está abierta: el sistema no lo hace con la app en pantalla). */
export function genericPushNotification(lang: Lang): { title: string; body: string } {
  return { title: 'VikArg', body: TEXT[lang].pushGenericBody };
}

export function testNotification(lang: Lang): { title: string; body: string } {
  return { title: TEXT[lang].testTitle, body: TEXT[lang].testBody };
}

/** Actualización importante que manda el servidor (ver server/src/announce.ts). */
export interface UpdatePush {
  version: string;
  title: { es: string; en: string; pt?: string };
  body: { es: string; en: string; pt?: string };
}

export function updateNotification(u: UpdatePush, lang: Lang): { title: string; body: string } {
  return { title: u.title[lang] || u.title.es, body: `${u.body[lang] || u.body.es}\n${TEXT[lang].updateTap}` };
}

/** Aviso de lluvia que manda el servidor (ver server/src/rain/watch.ts). */
export interface RainPush {
  placeId: string;
  /** null = "donde estoy". */
  label: string | null;
  state: 'raining' | 'soon';
  inMinutes: number;
  mm: number;
  /** De cuándo es la ubicación de "donde estoy". */
  fixAt: string | null;
  /** Lluvia vista por el satélite en el lugar (mm/h), si la hubo. */
  observedMmH?: number;
  /** Hora en que empieza a llover (ms desde 1970), cuando todavía no llueve: la hora no se vence, «en 105 min» sí. */
  startsAt?: number;
  /** Cambio de «va a llover» a «está lloviendo»: reemplaza el aviso anterior sin volver a sonar. */
  update?: boolean;
  /** Dejó de llover: se saca el aviso (no se muestra nada). */
  clear?: boolean;
  /** Mismo episodio, pero la lluvia subió de nivel (ver server/src/rain/episode.ts). */
  stronger?: boolean;
}

/** Aviso de rayos cercanos que manda el servidor (ver server/src/lightning/watch.ts). */
export interface LightningPush {
  placeId: string;
  label: string | null;
  distanceKm: number;
  /** Rumbo del lugar hacia el rayo, en grados. */
  bearing: number;
  fixAt: string | null;
}

function lastFixNote(fixAt: string | null, lang: Lang, now: number): string {
  // Con la app cerrada no hay GPS: si la ubicación tiene más de media hora, se aclara.
  const minutes = fixAt ? Math.round((now - Date.parse(fixAt)) / 60_000) : 0;
  if (minutes < 30) return '';
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  return `\n${TEXT[lang].lastFix(minutes < 90 ? rtf.format(-minutes, 'minute') : rtf.format(-Math.round(minutes / 60), 'hour'))}`;
}

/** Peligro natural cerca que manda el servidor (ver server/src/hazards/watch.ts). */
export interface HazardPush {
  placeId: string;
  label: string | null;
  fixAt: string | null;
  kind: 'quake' | 'TC' | 'FL' | 'WF' | 'VO';
  name: string;
  distanceKm: number;
  bearing: number;
  magnitude?: number;
  tsunami?: boolean;
  level?: 'Green' | 'Orange' | 'Red';
  /** Ubicaciones con reserva dentro del radio (ver server/src/hazards/watch.ts). */
  stock?: string[];
  url: string;
}

export function hazardNotification(h: HazardPush, lang: Lang, now = Date.now()): { title: string; body: string } {
  const tx = TEXT[lang];
  const dir = tx.dirs[Math.round((((h.bearing % 360) + 360) % 360) / 45) % 8]!;
  const place = h.label ?? tx.here;
  const km = Math.max(1, h.distanceKm);
  const fix = lastFixNote(h.fixAt, lang, now) + (h.stock?.length ? `\n${tx.hazardStock(h.stock.join(', '))}` : '');
  if (h.kind === 'quake') {
    const mag = new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(h.magnitude ?? 0);
    const tsunami = h.tsunami ? `\n${tx.tsunami}` : '';
    return { title: tx.quake(mag, km, dir, place), body: tx.quakeBody(h.name) + tsunami + fix + `\n${tx.hazardInformative}` };
  }
  return {
    title: tx.hazard(tx.hazardKinds[h.kind], km, dir, place),
    body: tx.hazardBody(h.name, tx.levels[h.level ?? 'Green']) + fix + `\n${tx.hazardInformative}`,
  };
}

/** Alerta oficial (SMN, DMC, INUMET, INMET de Brasil, SENAMHI de Bolivia y Perú) que manda el servidor. ⚠ Mismo tipo que `official` en server/src/push.ts. */
export interface OfficialPush {
  key: string;
  source: 'SMN' | 'DMC' | 'INUMET' | 'INMET' | 'SENAMHI_BO' | 'SENAMHI_PE' | 'SIGMET';
  senderName: string;
  event: string;
  headline: string;
  severity: 'Extreme' | 'Severe' | 'Moderate' | 'Minor' | 'Unknown';
  onset: string;
  expires: string;
  here: boolean;
  fixAt: string | null;
  places: string[];
  stock: string[];
  url: string;
}

export function officialNotification(o: OfficialPush, lang: Lang, now = Date.now()): { title: string; body: string } {
  const tx = TEXT[lang];
  const when = new Intl.DateTimeFormat(lang, { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const where = [...(o.here ? [tx.officialHere] : []), ...o.places];
  const sev = tx.severities[o.severity];
  const title = tx.official(tx.sources[o.source] ?? o.source, o.headline) + (sev ? ` (${sev})` : '');
  const body = [
    where.length ? tx.officialWhere(where.join(', ')) : '',
    tx.officialValid(when.format(new Date(o.onset)), when.format(new Date(o.expires))),
    o.stock.length ? tx.hazardStock(o.stock.join(', ')) : '',
    tx.officialFooter(o.senderName || o.source),
  ]
    .filter(Boolean)
    .join('\n');
  return { title, body: body + (o.here ? lastFixNote(o.fixAt, lang, now) : '') };
}

/** Volcán que subió su alerta técnica cerca (ver server/src/volcanoes/watch.ts). ⚠ Mismo tipo que `volcano` en server/src/push.ts. */
export interface VolcanoPush {
  placeId: string;
  label: string | null;
  fixAt: string | null;
  name: string;
  level: 'yellow' | 'orange' | 'red';
  distanceKm: number;
  bearing: number;
  stock?: string[];
  url: string;
  /** Organismo: OAVV (Argentina) o CENVUL (Perú); sin él, OAVV. */
  source?: 'OAVV' | 'CENVUL';
}

/** "VOLCÁN VILLARRICA" → "Villarrica"; "CV. NEVADOS DE CHILLÁN" → "Nevados De Chillán". */
const volcanoTitle = (name: string) =>
  name
    .replace(/^(CV\.?|C\.V\.|COMPLEJO VOLC[AÁ]NICO|VOLC[AÁ]N)\s+/i, '')
    .toLowerCase()
    .replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());

export function volcanoNotification(v: VolcanoPush, lang: Lang, now = Date.now()): { title: string; body: string } {
  const tx = TEXT[lang];
  const dir = tx.dirs[Math.round((((v.bearing % 360) + 360) % 360) / 45) % 8]!;
  const title = tx.volcano(volcanoTitle(v.name), tx.volcanoLevels[v.level], Math.max(1, v.distanceKm), dir, v.label ?? tx.officialHere);
  const extra = (v.stock?.length ? `\n${tx.hazardStock(v.stock.join(', '))}` : '') + lastFixNote(v.fixAt, lang, now);
  return { title, body: (v.source === 'CENVUL' ? tx.volcanoBodyCENVUL : tx.volcanoBody) + extra };
}

/** Río que llegó a su nivel de alerta, de evacuación o de aguas bajas cerca de un lugar (ver server/src/rivers/watch.ts). ⚠ Mismo tipo que `river` en server/src/push.ts. */
export interface RiverPush {
  placeId: string;
  label: string | null;
  fixAt: string | null;
  station: string;
  river: string;
  state: 'attention' | 'alert' | 'evac' | 'low';
  /** Organismo del dato: ANA (Brasil). Sin él, el INA. En Brasil «alert» es la cota de alerta e «evac», la de inundación. */
  source?: 'ANA';
  level: number;
  threshold: number;
  at: string;
  /** Aviso anticipado: el INA pronostica que llegará a ese nivel (`level` es la altura prevista y `at`, cuándo). */
  forecast?: boolean;
  distanceKm: number;
  bearing: number;
  stock?: string[];
}

export function riverNotification(r: RiverPush, lang: Lang, now = Date.now()): { title: string; body: string } {
  const tx = TEXT[lang];
  const dir = tx.dirs[Math.round((((r.bearing % 360) + 360) % 360) / 45) % 8]!;
  const num = new Intl.NumberFormat(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const km = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
  if (r.forecast) {
    const when = new Date(r.at).toLocaleString(lang, { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const fcExtra = (r.stock?.length ? `\n${tx.hazardStock(r.stock.join(', '))}` : '') + lastFixNote(r.fixAt, lang, now);
    return {
      title: tx.riverForecast(r.river, r.station, tx.riverForecastStates[r.state](num.format(r.threshold)), when, km.format(Math.max(0.1, r.distanceKm)), dir, r.label ?? tx.officialHere),
      body: tx.riverForecastBody(num.format(r.level)) + fcExtra,
    };
  }
  const states = r.source === 'ANA' && r.state !== 'low' ? tx.riverStatesBR[r.state] : tx.riverStates[r.state];
  const title = tx.river(r.river, r.station, num.format(r.level), states(num.format(r.threshold)), km.format(Math.max(0.1, r.distanceKm)), dir, r.label ?? tx.officialHere);
  const measured = new Date(r.at).toLocaleString(lang, { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const extra = (r.stock?.length ? `\n${tx.hazardStock(r.stock.join(', '))}` : '') + lastFixNote(r.fixAt, lang, now);
  if (r.source === 'ANA') return { title, body: tx.riverBodyBR(measured) + extra };
  return { title, body: tx.riverBody(measured) + extra };
}

export function lightningNotification(l: LightningPush, lang: Lang, now = Date.now()): { title: string; body: string } {
  const tx = TEXT[lang];
  const dir = tx.dirs[Math.round((((l.bearing % 360) + 360) % 360) / 45) % 8]!;
  return { title: tx.lightning(Math.max(1, l.distanceKm), dir, l.label ?? tx.here), body: tx.lightningBody + lastFixNote(l.fixAt, lang, now) + `\n${tx.informative}` };
}

/** Hora local del dispositivo, «15:40». */
export const clockTime = (ms: number, lang: Lang): string => new Date(ms).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });

/**
 * Texto del aviso de lluvia. Con la hora de inicio (`startsAt`) el título dice «Lluvia a las 15:40», que sigue siendo cierto
 * horas después; el «en unos N min» (`countdown`) solo lo agrega la app al volver a calcularlo con el reloj de ese momento.
 */
export function rainNotification(rain: RainPush, lang: Lang, now = Date.now(), countdown = false): { title: string; body: string } {
  const tx = TEXT[lang];
  const place = rain.label ?? tx.here;
  const soon =
    rain.startsAt === undefined
      ? tx.rainSoon(rain.inMinutes, place)
      : countdown
        ? tx.rainSoonAtIn(clockTime(rain.startsAt, lang), Math.max(1, Math.round((rain.startsAt - now) / 60_000)), place)
        : tx.rainSoonAt(clockTime(rain.startsAt, lang), place);
  if (rain.clear) return { title: tx.rainStopped(place), body: '' };
  const title = rain.stronger ? tx.rainStronger(place) : rain.state === 'raining' ? tx.raining(place) : soon;
  const fmt = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
  const main = rain.observedMmH !== undefined ? tx.rainObserved(fmt.format(rain.observedMmH)) : tx.rainBody(fmt.format(rain.mm));
  const body = main + lastFixNote(rain.fixAt, lang, now) + `\n${tx.informative}`;
  return { title, body };
}

/** Aviso de la huerta del servidor (helada, riego o tareas). ⚠ Mismo tipo que GardenPush en server/src/push.ts. */
export type GardenPush =
  | { kind: 'frost'; placeId: string; label: string | null; date: string; min: number; crops: string[] }
  | { kind: 'water'; placeId: string; label: string | null; mm: number; rain: number }
  | { kind: 'tasks'; tasks: string[] };

export function gardenNotification(g: GardenPush, lang: Lang): { title: string; body: string } {
  const tx = TEXT[lang];
  if (g.kind === 'frost') {
    // La helada es la de la madrugada del día `date`: se avisa la tarde anterior.
    return { title: tx.gardenFrost(tx.gardenTonight, g.min), body: tx.gardenFrostBody(g.crops.join(', '), g.label) };
  }
  if (g.kind === 'water') return { title: tx.gardenWater(g.label), body: tx.gardenWaterBody(g.mm, g.rain) };
  const lines = g.tasks.slice(0, MAX_LISTED);
  if (g.tasks.length > MAX_LISTED) lines.push(tx.more(g.tasks.length - MAX_LISTED));
  return { title: tx.gardenTasks(g.tasks.length), body: lines.join('\n') };
}
