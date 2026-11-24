/**
 * Técnicas de pesca para una emergencia de supervivencia (cuando ya no rigen los reglamentos). Texto propio, basado en el manual de
 * supervivencia del Ejército de EE. UU. (FM 3-05.70, «Survival», cap. 8; obra federal, dominio público) y en lo que ya tiene la app
 * sobre los peces de la Patagonia. No incluye venenos para peces ni explosivos (peligrosos y contaminan el agua para todos).
 * Hoy, fuera de una emergencia, casi todo esto está prohibido por el reglamento de pesca (redes, espineles, trampas, cebado).
 */

type T = { es: string; en: string; pt: string };

export interface SurvivalTechnique {
  id: string;
  title: T;
  /** Para qué sirve, en una línea. */
  summary: T;
  steps: T[];
  /** Lo que no hay que hacer (se muestra resaltado). */
  dont?: T[];
}

export const SURVIVAL_SOURCE = {
  name: 'FM 3-05.70 «Survival» (Ejército de EE. UU., 2002), cap. 8 — dominio público',
  libraryHint: 'Manual de supervivencia del Ejército de EE. UU. (FM 3-05.70)',
};

export const SURVIVAL_TECHNIQUES: SurvivalTechnique[] = [
  {
    id: 'where',
    title: { es: 'Dónde y cuándo pescar', en: 'Where and when to fish', pt: 'Onde e quando pescar' },
    summary: { es: 'Buscar el pez antes de gastar energía', en: 'Find the fish before spending energy', pt: 'Encontrar o peixe antes de gastar energia' },
    steps: [
      { es: 'Las mejores horas son el amanecer y el atardecer, y antes de una tormenta. Con sol fuerte los peces bajan a lo hondo o a la sombra.', en: 'The best times are dawn, dusk and before a storm. In strong sun fish go deep or into the shade.', pt: 'Os melhores horários são o amanhecer, o entardecer e antes de uma tempestade. Com sol forte os peixes vão para o fundo ou para a sombra.' },
      { es: 'En el río, buscá los pozones, las curvas, abajo de las rocas y troncos caídos, y donde la corriente rápida se junta con agua quieta.', en: 'In a river, look in pools, bends, under rocks and fallen logs, and where fast current meets slack water.', pt: 'No rio, procure poços, curvas, debaixo de pedras e troncos caídos, e onde a corrente rápida encontra água parada.' },
      { es: 'En el lago, en las desembocaduras de los arroyos, los bordes de juncos y las costas con piedras; con frío, más hondo.', en: 'In a lake, at stream mouths, reed edges and rocky shores; when it is cold, deeper.', pt: 'No lago, nas fozes dos riachos, nas bordas de juncos e nas margens com pedras; com frio, mais fundo.' },
      { es: 'Usá de carnada lo que hay en el lugar: lombrices, larvas bajo las piedras, insectos, pancoras o tripas de un pez ya pescado.', en: 'Use local bait: worms, larvae under stones, insects, crayfish or the guts of a fish you already caught.', pt: 'Use isca do lugar: minhocas, larvas debaixo das pedras, insetos, caranguejos de água doce ou as vísceras de um peixe já pescado.' },
    ],
  },
  {
    id: 'hooks',
    title: { es: 'Anzuelos improvisados', en: 'Improvised hooks', pt: 'Anzóis improvisados' },
    summary: { es: 'Con alfileres, alambre, espinas o madera', en: 'From pins, wire, thorns or wood', pt: 'Com alfinetes, arame, espinhos ou madeira' },
    steps: [
      { es: 'Alfiler de gancho, clip, alambre o un clavo chico: doblalo en forma de J y afilá la punta contra una piedra.', en: 'Safety pin, paper clip, wire or a small nail: bend it into a J and sharpen the point on a stone.', pt: 'Alfinete de segurança, clipe, arame ou um prego pequeno: dobre em forma de J e afie a ponta numa pedra.' },
      { es: 'Espina de arbusto (por ejemplo, de calafate o espino) atada a un palito en ángulo: sirve para peces chicos.', en: 'A shrub thorn tied at an angle to a small stick works for small fish.', pt: 'Um espinho de arbusto amarrado em ângulo a um pauzinho serve para peixes pequenos.' },
      { es: 'Anzuelo de tranca: un palito o hueso de 2–3 cm con las dos puntas afiladas, atado por el medio. Se esconde en la carnada, paralelo a la línea; cuando el pez la traga y tirás, queda atravesado en la garganta.', en: 'Gorge hook: a 2–3 cm stick or bone sharpened at both ends, tied at the middle. Hide it in the bait; when the fish swallows and you pull, it lodges crosswise.', pt: 'Anzol de travamento: um pauzinho ou osso de 2–3 cm com as duas pontas afiadas, amarrado no meio. Esconda na isca; quando o peixe engole e você puxa, ele fica atravessado.' },
      { es: 'Cuanto más chico el anzuelo, más peces pican; los grandes también comen carnada chica.', en: 'The smaller the hook, the more fish bite; big fish also take small bait.', pt: 'Quanto menor o anzol, mais peixes mordem; os grandes também comem isca pequena.' },
    ],
  },
  {
    id: 'handline',
    title: { es: 'Línea de mano y caña improvisada', en: 'Handline and improvised rod', pt: 'Linha de mão e vara improvisada' },
    summary: { es: 'Lo más simple y lo que más rinde', en: 'The simplest and most productive', pt: 'O mais simples e o que mais rende' },
    steps: [
      { es: 'Línea: los hilos interiores de un paracord, hilo de coser o de una prenda, o fibras vegetales retorcidas.', en: 'Line: the inner strands of paracord, sewing thread or thread from clothing, or twisted plant fibres.', pt: 'Linha: os fios internos de um paracord, linha de costura ou de uma roupa, ou fibras vegetais torcidas.' },
      { es: 'Plomada: una piedrita atada o un tornillo; boya: un trozo de madera seca, corcho o una pluma, para ver cuándo pican.', en: 'Sinker: a small tied stone or a screw; float: dry wood, cork or a feather, to see bites.', pt: 'Chumbada: uma pedrinha amarrada ou um parafuso; boia: madeira seca, cortiça ou uma pena, para ver quando mordem.' },
      { es: 'Caña: una rama larga y flexible con la línea atada en la punta. Dejá la carnada cerca del fondo o a media agua según el pez.', en: 'Rod: a long flexible branch with the line tied at the tip. Keep the bait near the bottom or mid-water depending on the fish.', pt: 'Vara: um galho longo e flexível com a linha amarrada na ponta. Deixe a isca perto do fundo ou a meia-água conforme o peixe.' },
    ],
  },
  {
    id: 'setline',
    title: { es: 'Líneas fijas (espinel)', en: 'Set lines', pt: 'Linhas fixas (espinhel)' },
    summary: { es: 'Pescan solas mientras hacés otra cosa', en: 'They fish while you do other things', pt: 'Pescam sozinhas enquanto você faz outra coisa' },
    steps: [
      { es: 'Atá varias líneas con carnada a ramas que cuelguen sobre el agua, o a estacas clavadas en la orilla.', en: 'Tie several baited lines to branches overhanging the water, or to stakes driven into the bank.', pt: 'Amarre várias linhas com isca a galhos sobre a água, ou a estacas fincadas na margem.' },
      { es: 'Espinel: una cuerda entre dos puntos de la orilla (o con una piedra en cada punta) con líneas cortas y anzuelos cada 1 o 2 metros.', en: 'Trotline: a cord between two points on the bank (or weighted with a stone at each end) with short lines and hooks every 1–2 m.', pt: 'Espinhel: uma corda entre dois pontos da margem (ou com uma pedra em cada ponta) com linhas curtas e anzóis a cada 1 ou 2 metros.' },
      { es: 'Revisalas al amanecer y al atardecer: un pez enganchado mucho tiempo se suelta o se lo comen otros.', en: 'Check them at dawn and dusk: a fish hooked for long gets loose or eaten by others.', pt: 'Confira ao amanhecer e ao entardecer: um peixe preso muito tempo se solta ou é comido por outros.' },
    ],
  },
  {
    id: 'traps',
    title: { es: 'Trampas para peces', en: 'Fish traps', pt: 'Armadilhas para peixes' },
    summary: { es: 'Corrales de piedra y nasas', en: 'Stone pens and funnel traps', pt: 'Currais de pedra e covos' },
    steps: [
      { es: 'Corral de piedras: en un arroyo poco hondo, armá con piedras un embudo con la boca ancha mirando aguas abajo y el corral cerrado aguas arriba (los peces suben contra la corriente). Que las puntas del embudo entren un poco en el corral: así el pez entra y no encuentra la salida.', en: 'Stone pen: in a shallow stream, build a stone funnel with its wide mouth facing downstream and the closed pen upstream (fish move against the current). Let the funnel tips reach a little into the pen so fish get in but cannot find the way out.', pt: 'Curral de pedras: num riacho raso, monte com pedras um funil com a boca larga virada rio abaixo e o curral fechado rio acima (os peixes sobem contra a corrente). As pontas do funil entram um pouco no curral: assim o peixe entra e não acha a saída.' },
      { es: 'Nasa de botella: cortá una botella grande por el hombro, dá vuelta el pico hacia adentro como embudo, poné carnada y hundila con una piedra.', en: 'Bottle trap: cut a large bottle at the shoulder, invert the neck inward as a funnel, bait it and sink it with a stone.', pt: 'Covo de garrafa: corte uma garrafa grande no ombro, vire o gargalo para dentro como funil, coloque isca e afunde com uma pedra.' },
      { es: 'Nasa de ramas: palitos atados en forma de cono, con la boca mirando aguas abajo (el pez entra nadando contra la corriente).', en: 'Twig trap: sticks tied into a cone with the mouth facing downstream (fish swim in against the current).', pt: 'Covo de galhos: gravetos amarrados em forma de cone, com a boca virada rio abaixo (o peixe entra nadando contra a corrente).' },
    ],
  },
  {
    id: 'spear',
    title: { es: 'Fija (arpón) y pesca a mano', en: 'Spear and hand fishing', pt: 'Fisga (arpão) e pesca com as mãos' },
    summary: { es: 'En agua baja y clara', en: 'In shallow, clear water', pt: 'Em água rasa e clara' },
    steps: [
      { es: 'Fija: una rama recta de 1,5 a 2 m con la punta partida en dos o tres, separadas con una cuña y afiladas.', en: 'Spear: a straight 1.5–2 m branch with the tip split into two or three prongs, spread with a wedge and sharpened.', pt: 'Fisga: um galho reto de 1,5 a 2 m com a ponta partida em duas ou três, separadas com uma cunha e afiadas.' },
      { es: 'Apuntá un poco más abajo de donde ves el pez (el agua engaña la vista) y empujá, no la tires.', en: 'Aim a little below where you see the fish (water bends light) and thrust, do not throw.', pt: 'Mire um pouco abaixo de onde vê o peixe (a água engana a vista) e empurre, não jogue.' },
      { es: 'En pozones chicos, se puede acorralar al pez con las manos contra la orilla o las piedras.', en: 'In small pools you can corner a fish with your hands against the bank or stones.', pt: 'Em poços pequenos, dá para encurralar o peixe com as mãos contra a margem ou as pedras.' },
    ],
    dont: [{ es: 'No te metas al agua fría de los ríos patagónicos más de unos minutos: la hipotermia llega rápido.', en: 'Do not stay in cold Patagonian rivers for more than a few minutes: hypothermia comes fast.', pt: 'Não fique na água fria dos rios patagônicos mais do que uns minutos: a hipotermia chega rápido.' }],
  },
  {
    id: 'food',
    title: { es: 'Limpiar, cocinar y guardar', en: 'Clean, cook and keep', pt: 'Limpar, cozinhar e guardar' },
    summary: { es: 'Para que no te enferme', en: 'So it does not make you sick', pt: 'Para que não te faça mal' },
    steps: [
      { es: 'Limpialo enseguida: abrí la panza, sacá las tripas y las agallas, y lavalo. Usá las tripas de carnada.', en: 'Clean it right away: open the belly, remove the guts and gills, and wash it. Use the guts as bait.', pt: 'Limpe logo: abra a barriga, tire as vísceras e as guelras e lave. Use as vísceras como isca.' },
      { es: 'Cocinalo bien (a la brasa, envuelto en hojas o hervido): el pescado de agua dulce puede tener parásitos.', en: 'Cook it well (on embers, wrapped in leaves or boiled): freshwater fish can carry parasites.', pt: 'Cozinhe bem (na brasa, enrolado em folhas ou cozido): o peixe de água doce pode ter parasitas.' },
      { es: 'Para guardarlo varios días, cortalo en tiras finas y secalo o ahumalo junto al fuego.', en: 'To keep it for several days, cut it into thin strips and dry or smoke it by the fire.', pt: 'Para guardar por vários dias, corte em tiras finas e seque ou defume junto ao fogo.' },
    ],
    dont: [
      { es: 'No lo comas crudo.', en: 'Do not eat it raw.', pt: 'Não coma cru.' },
      { es: 'No comas un pescado con olor fuerte o raro, ojos hundidos, carne blanda que no vuelve al apretarla o agallas grises.', en: 'Do not eat fish with a strong or odd smell, sunken eyes, soft flesh that does not spring back, or grey gills.', pt: 'Não coma peixe com cheiro forte ou estranho, olhos afundados, carne mole que não volta ao apertar ou guelras cinzentas.' },
    ],
  },
];
