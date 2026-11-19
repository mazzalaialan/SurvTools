// Catálogo de estaciones de los ríos de Brasil (telemetría de la ANA) → app/public/data/rivers-BR.json.
// Estaciones (33):
//  - 29 de la cuenca del río Uruguay del Sistema de Alerta Hidrológico del SGB/CPRM (SAH-Uruguai): 24 con cotas de referencia
//    (atención / alerta / inundación, en cm) y 5 sin ellas (solo nivel). Cotas transcritas a mano de la Tabla 2 del «Relatório de operação
//    do Sistema de Alerta Hidrológico da Bacia do Rio Uruguai» (SGB, dic. 2023, pág. 18 del PDF), comparadas fila por fila contra la imagen de
//    la página: https://rigeo.sgb.gov.br/server/api/core/bitstreams/54adf121-0c5a-4453-ab98-db1f062c590e/content
//    Son de 2023 y pueden haber cambiado. Quedaron afuera 3 de las 32 del SAH: Fazenda Encerra (la tabla no trae nada), Passo do Sarmento y
//    Ponte do Sargento (no están en el catálogo de telemetría).
//  - 2 del Iguazú (Hotel Cataratas y Porto Capanema, de Itaipú) y 2 del Paraná de frontera (Guaíra y Paulistânia, de Itaipú): solo nivel,
//    SIN umbrales (no hay cotas oficiales publicadas: no se inventan). Las demás estaciones del Iguazú y del Paraná del catálogo no
//    devolvieron datos en las pruebas (IAT-PR) o no son de frontera.
// Coordenadas, río y municipio: catálogo de la ANA (ListaEstacoesTelemetricas), validadas acá (UF del municipio y caja de coordenadas).
// Uso: node tools/river-data/brasil.mjs [catalogo-ana.xml]   (sin argumento baja el catálogo, 4 MB, una sola vez)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../../app/public/data/rivers-BR.json', import.meta.url));
const CATALOG_URL = 'http://telemetriaws1.ana.gov.br/ServiceANA.asmx/ListaEstacoesTelemetricas?statusEstacoes=0&origem=0';
const UA = 'VikArg-Prepping-Tools/1.0';

// [código ANA, nombre, [atención, alerta, inundación] en cm o null, cuenca]
const ROWS = [
  ['76750000', 'Alegrete', [750, 850, 970], 'uruguai'],
  ['74500000', 'Alto Uruguai', [1700, 1900, 2100], 'uruguai'],
  ['73960000', 'Barra do Chapecó (aux.)', [520, 630, 700], 'uruguai'],
  ['76251000', 'Dom Pedrito', null, 'uruguai'],
  ['71350001', 'Encruzilhada II', [400, 500, 600], 'uruguai'],
  ['75550000', 'Garruchos', [1300, 1400, 1500], 'uruguai'],
  ['74300000', 'Guatapará de Baixo', [700, 900, 1100], 'uruguai'],
  ['74100000', 'Iraí', [500, 600, 800], 'uruguai'],
  ['74329000', 'Itapiranga', [500, 600, 730], 'uruguai'],
  ['75900000', 'Itaqui', [630, 730, 830], 'uruguai'],
  ['72849000', 'Joaçaba I', [700, 800, 900], 'uruguai'],
  ['74295000', 'Linha Jataí', [600, 700, 800], 'uruguai'],
  ['76560000', 'Manoel Viana', [760, 860, 960], 'uruguai'],
  ['76742000', 'Passo do Osório', null, 'uruguai'],
  ['76800000', 'Passo Mariano Pinto', [700, 750, null], 'uruguai'],
  ['75780000', 'Passo São Borja', [700, 800, 1000], 'uruguai'],
  ['76300000', 'Ponte Ibicuí da Armada', [600, 650, null], 'uruguai'],
  ['73770000', 'Porto Fae Novo', null, 'uruguai'],
  ['74800000', 'Porto Lucena', [800, 900, 1000], 'uruguai'],
  ['74720000', 'Porto Mauá', [800, 950, 1050], 'uruguai'],
  ['77500000', 'Quaraí', [600, 750, 950], 'uruguai'],
  ['71300000', 'Rio Bonito', null, 'uruguai'],
  ['72715000', 'Rio das Antas', [250, 350, 450], 'uruguai'],
  ['76310000', 'Rosário do Sul', [450, 550, 650], 'uruguai'],
  ['75230000', 'Santo Ângelo', null, 'uruguai'],
  ['73900000', 'Saudades', [300, 400, 560], 'uruguai'],
  ['72810000', 'Tangará', [350, 450, 550], 'uruguai'],
  ['77150000', 'Uruguaiana', [650, 750, 850], 'uruguai'],
  ['71200000', 'Vila Canoas', [500, 600, 700], 'uruguai'],
  ['65992500', 'Hotel Cataratas (Itaipú)', null, 'iguacu'],
  ['65987000', 'Porto Capanema (Itaipú)', null, 'iguacu'],
  ['64838000', 'Guaíra (Itaipú)', null, 'parana'],
  ['64899500', 'Paulistânia (Itaipú)', null, 'parana'],
];

// Cajas de coordenadas por UF (con margen): una longitud mal puesta queda afuera.
const BOX = { RS: [-33.9, -27.0, -57.7, -49.6], SC: [-29.4, -25.9, -53.9, -48.3], PR: [-26.8, -22.4, -54.7, -48.0], MS: [-24.1, -17.0, -58.2, -50.9] };

const xml = process.argv[2] ? readFileSync(process.argv[2], 'utf8') : await (await fetch(CATALOG_URL, { headers: { 'user-agent': UA } })).text();
const tag = (block, name) => new RegExp(`<${name}>([^<]*)</${name}>`).exec(block)?.[1]?.trim() ?? '';
const byCode = new Map();
for (const m of xml.matchAll(/<Table[ >][\s\S]*?<\/Table>/g)) {
  const code = tag(m[0], 'CodEstacao');
  if (!byCode.has(code)) byCode.set(code, m[0]); // varias redes repiten la estación: la primera alcanza
}
const title = (s) => s.toLowerCase().replace(/(^|[\s(-])([a-zà-ÿ])/g, (_, a, b) => a + b.toUpperCase()).replace(/\b(Do|Da|De|Dos|Das)\b/g, (w) => w.toLowerCase());

const stations = [];
for (const [code, name, th, basin] of ROWS) {
  const block = byCode.get(code);
  if (!block) throw new Error(`${code} ${name}: no está en el catálogo de la ANA`);
  const lat = Number(tag(block, 'Latitude'));
  const lon = Number(tag(block, 'Longitude'));
  const muni = tag(block, 'Municipio-UF');
  const uf = muni.slice(-2);
  const box = BOX[uf];
  if (!box || lat < box[0] || lat > box[1] || lon < box[2] || lon > box[3]) throw new Error(`${code} ${name}: coordenadas ${lat},${lon} fuera de ${uf}`);
  const [a, b, c] = th ?? [null, null, null];
  stations.push({
    code,
    name,
    river: title(tag(block, 'NomeRio').replace(/^RIO\s+/, '')) || '',
    muni: `${title(muni.slice(0, -3))}-${uf}`,
    lat: Math.round(lat * 1e5) / 1e5,
    lon: Math.round(lon * 1e5) / 1e5,
    basin,
    thresholds: th ? { attention: a, alert: b, flood: c } : null,
  });
}

const data = {
  generatedAt: new Date().toISOString().slice(0, 10),
  source: 'Estaciones y niveles: Agência Nacional de Águas e Saneamento Básico (ANA), telemetría. Cotas de referencia de la cuenca del río Uruguay: SGB/CPRM, Relatório de operação do SAH Bacia do Rio Uruguai (dic. 2023)',
  license: 'Sin licencia declarada (ANA y SGB): se usa con crédito',
  thresholdsNote: 'Cotas en cm, de la tabla de 2023 del SGB/CPRM; pueden haber cambiado. Sin cotas oficiales (thresholds null) solo se muestra el nivel.',
  thresholdsUrl: 'https://rigeo.sgb.gov.br/server/api/core/bitstreams/54adf121-0c5a-4453-ab98-db1f062c590e/content',
  stations,
};
writeFileSync(OUT, JSON.stringify(data));
console.log(`${stations.length} estaciones (${stations.filter((s) => s.thresholds).length} con cotas) → ${OUT}`);
