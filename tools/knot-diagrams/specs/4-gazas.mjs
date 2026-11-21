import { A, E8, move, offset, overhand, rev, scale } from '../helpers.mjs';

// As de guía (firme arriba), con la profundidad en cada cruce: el firme es lo
// de más abajo; el chicote sube por debajo de la gaza chica y baja por encima.
const base = { width: 400, height: 420, rope: 14 };
const baseD = { width: 440, height: 540 };
const small = [[200, -20], [200, 56, 0.5], [203, 94, -0.5], [258, 150, -0.5], [262, 208, 0.5], [200, 242, 0.5], [138, 212], [130, 150], [165, 100, -0.5], [215, 88, 0.5], [262, 96], [296, 132]];
const big = [[308, 220], [310, 320], [250, 395], [160, 388], [112, 330], [125, 282], [168, 262], [169, 234, -0.5], [168, 205], [164, 150], [158, 100, 0.5], [160, 65]];
const around = [[175, 32], [200, 22, -0.5], [226, 32], [240, 66]];
const down = [[240, 92, 1], [236, 170], [231, 235, -0.5], [238, 290]];
export const bowline = [...small, ...big, ...around, ...down];

/** Cuerda doble: ida por `p` y vuelta en paralelo (el seno queda en la punta). */
const doubled = (p, d = 15) => [...p, ...rev(offset(p, d))];

// Corredizo: el firme llega por la izquierda (y = 150), da la vuelta a la derecha y el chicote vuelve por arriba (y = 112).
const nooseLoop = [[-20, 150], [100, 150], [250, 150], [300, 200], [360, 192], [372, 110], [330, 62], [288, 92], [250, 112]];
const nooseKnot = (k) => overhand({ x: 150, y: 150, k, mirror: true, flip: true });

// Ocho sobre seno: el ocho de siempre hecho con la cuerda doble; la gaza sale a la derecha.
const e8 = move(E8, 0, -30);
const eye = [[392, 155], [430, 140], [425, 85], [385, 85], [362, 105]];

export default {
  'as-de-guia': [
    { ...base, ropes: [{ ...A, path: [...small, [305, 230], [310, 320]] }], arrows: [[[305, 350], [255, 392], [160, 380], [150, 320], [168, 275]]] },
    { ...base, ropes: [{ ...A, path: [...small, ...big] }], arrows: [[[150, 45], [180, 8], [230, 10], [252, 50]]] },
    { ...base, ropes: [{ ...A, path: [...small, ...big, ...around] }], arrows: [[[246, 82], [238, 140], [234, 205]]] },
    { ...base, ropes: [{ ...A, path: bowline }] },
    (() => {
      // Seguro (FM 3-97.61, último cuadro): el chicote sale del nudo y se ata un nudo simple chico alrededor de la pata de la
      // gaza que queda al lado: da una vuelta a la pata (por delante y por detrás) y vuelve a cruzarse bajo sí mismo.
      const hitch = [[230, 235, -0.5], [244, 256], [268, 262, -0.5], [284, 266], [309, 270, 0.5], [338, 278], [344, 300], [326, 318], [309, 312, -0.5], [286, 298], [272, 284], [268, 262, 0.5], [282, 236]];
      return { ...base, height: 440, ropes: [{ ...A, path: [...bowline.slice(0, -1), ...hitch] }] };
    })(),
  ],
  'as-de-guia-doble': (() => {
    // As de guía sobre seno (ABOK 1080), TRANSCRIPTO del trazado vectorial "Bowline on a bight-noeud de chaise double sur son double.svg"
    // (SuperManu / Emmanuel Boutet, CC BY-SA 3.0, Wikimedia Commons): una sola cuerda, recorrida de punta a punta desde el firme (arriba a
    // la izquierda) por la gaza chica, las dos gazas grandes, el seno que abraza al firme y la vuelta en paralelo hasta el chicote.
    // Puntos = cuentas de la cuerda en coordenadas del SVG (11..1051 x 15..476), escalados x0,95. 18 cruces; en los 8 donde el tramo que
    // se recorre primero va por ARRIBA se marca `under` (el resto: lo que se hizo después va arriba). Secuencia del paso 4 (refs/):
    // ABBBBAABAABBBBAAAABBAABBAABABAAABBBA. Los pasos 1 a 3 son la misma cuerda dibujada hasta cierto punto.
    const RAW = [[11,15],[19,29],[32,40],[49,51],[66,62],[82,73],[99,85],[115,96],[132,107],[149,118],[166,129],[182,140],[200,150],[217,160],[235,169],[253,178],[271,186],[290,193],[309,199],[328,204],[348,209],[368,212],[388,215],[408,218],[428,219],[448,221],[468,222],[488,222],[508,222],[528,222],[548,222],[568,221],[586,218],[609,213],[623,205],[627,187],[622,161],[612,144],[600,128],[585,114],[570,101],[554,89],[538,78],[521,68],[503,60],[485,54],[467,53],[442,57],[428,68],[420,87],[416,108],[415,128],[414,148],[415,168],[417,188],[420,208],[423,228],[430,248],[439,266],[448,283],[459,300],[471,317],[483,333],[496,348],[510,362],[524,376],[539,389],[555,402],[571,414],[588,424],[606,434],[624,443],[642,451],[661,458],[680,464],[699,469],[719,472],[739,475],[759,476],[779,475],[799,474],[819,471],[838,467],[859,461],[878,454],[896,446],[913,436],[927,421],[940,406],[951,390],[961,372],[969,354],[975,335],[980,316],[983,296],[984,276],[983,256],[981,236],[976,215],[968,196],[959,179],[947,163],[932,150],[916,139],[897,130],[878,125],[858,121],[838,118],[818,116],[798,115],[778,114],[758,114],[738,115],[718,117],[698,120],[678,124],[658,129],[639,136],[620,143],[602,152],[585,161],[568,172],[551,183],[535,194],[519,206],[505,221],[493,238],[481,254],[470,271],[458,288],[444,305],[426,316],[398,318],[386,308],[373,295],[363,278],[354,260],[348,239],[345,218],[344,197],[349,177],[362,166],[385,161],[403,159],[423,159],[442,160],[462,160],[481,160],[500,157],[521,149],[537,138],[555,128],[572,118],[590,109],[608,99],[626,91],[644,83],[663,75],[681,68],[701,62],[720,56],[740,51],[760,47],[779,44],[799,41],[819,40],[840,40],[860,40],[880,43],[900,46],[919,51],[938,58],[956,66],[974,75],[990,87],[1005,100],[1019,114],[1030,131],[1040,148],[1046,169],[1050,189],[1051,209],[1048,229],[1043,248],[1034,266],[1023,282],[1010,297],[995,310],[979,322],[961,331],[943,340],[924,347],[905,353],[885,358],[865,362],[845,364],[825,366],[805,367],[785,368],[765,368],[745,367],[725,366],[705,364],[685,361],[666,359],[645,355],[625,351],[607,343],[589,334],[573,323],[556,311],[541,299],[526,285],[512,271],[500,255],[488,239],[477,222],[469,204],[462,183],[459,163],[459,142],[465,121],[482,112],[503,115],[517,124],[532,137],[545,152],[557,168],[567,185],[576,203],[582,225],[583,248],[575,263],[559,271],[536,276],[517,278],[498,279],[478,278],[458,277],[437,277],[417,275],[398,272],[378,268],[359,263],[340,258],[320,254],[301,250],[281,247],[262,245],[242,245],[222,247],[202,250],[182,255]];
    const UN = [[345,208],[613,146],[583,112],[445,277],[490,242],[466,277],[459,160],[519,278]];
    // Deformación suave (una ampliación radial que baja con la distancia) alrededor del centro del nudo: separa los cruces apretados
    // (los pares de #3/#4/#13 y #9/#10/#14, a ~20 px) sin cambiar ninguno (es una función continua e inyectiva: el orden de la
    // secuencia ABBBB… no se toca). Después se escala 0,95 y se corre para que el dibujo quede en el lienzo.
    const warp = ([x, y, z]) => {
      const dx = x - 490, dy = y - 240, u = Math.hypot(dx, dy) / 230, f = 1 + 0.75 * Math.exp(-u * u);
      return z === undefined ? [490 + dx * f, 240 + dy * f] : [490 + dx * f, 240 + dy * f, z];
    };
    // fit(puntos): T (warp + escala + corrimiento) y el tamaño del lienzo para ese conjunto de puntos.
    const fit = (pts) => {
      const w = pts.map(warp), xs = w.map((p) => p[0]), ys = w.map((p) => p[1]);
      const x0 = Math.min(...xs) - 25, y0 = Math.min(...ys) - 25;
      const T = (p) => { const q = warp(p); const r = [Math.round((q[0] - x0) * 0.95), Math.round((q[1] - y0) * 0.95)]; return q[2] === undefined ? r : [...r, q[2]]; };
      return { T, width: Math.round((Math.max(...xs) - x0) * 0.95 + 30), height: Math.round((Math.max(...ys) - y0) * 0.95 + 30) };
    };
    const F4 = fit(RAW), T = F4.T;
    const g = { width: F4.width, height: F4.height, rope: 12 };
    const cut = (n) => RAW.slice(0, n).map(T);
    const under = UN.map(T);
    // Paso 3 (DEDUCIDO hacia atrás del paso 4: se deshace el último movimiento, el seno que abraza al firme): el seno (el vaivén de la
    // cuerda entre las dos gazas grandes, del 126 al 146 de las cuentas, ≈50 % del recorrido) todavía está abierto como un aro grande que
    // rodea las dos gazas grandes por afuera y pasa por ENCIMA de todo (z = 1); sale del nudo por abajo, da la vuelta a la derecha y
    // vuelve por arriba. Después se lo baja, por encima de las gazas, hasta el firme (flecha) y queda como en el paso 4.
    const ring = [[485, 300, 1], [472, 350, 1], [478, 430, 1], [560, 510, 1], [760, 550, 1], [980, 525, 1], [1100, 400, 1], [1130, 230, 1], [1090, 80, 1], [950, -10, 1], [740, -30, 1], [540, -5, 1], [450, 50, 1], [447, 120, 1], [470, 152, 1]];
    const open3 = [...RAW.slice(0, 129), ...ring, ...RAW.slice(147)];
    const F3 = fit(open3), T3 = F3.T;
    // Pasos 1 y 2 (revisados a ojo, 2026-11-12): el texto pide trabajar con la cuerda DOBLE, así que se dibuja el par (ida por el
    // trazado de la referencia y vuelta en paralelo, el seno en la punta). Paso 2: con el par se hace la gaza chica de la referencia
    // (el firme a la derecha, la curva arriba y la bajada que lo cruza por encima) y el seno sube por dentro de ella desde atrás
    // (pasa por debajo del firme). La z de cada cruce va en los puntos y la copia en paralelo la hereda.
    const at = (x, y) => RAW.findIndex(([a, b]) => a === x && b === y);
    // Paso 2, rehecho (2026-11-21, crítico): par bien separado (28 px entre cuerdas, ≈2,3 grosores), figura recortada sobre el nudo y
    // profundidades explícitas. En el nudo terminado la cuerda sigue así (DEDUCIDO): el par llega por la izquierda, sigue a la derecha,
    // sube, vuelve por arriba hacia la izquierda y BAJA por el lado izquierdo cruzando por ENCIMA del par horizontal (esa bajada es el
    // lado de la gaza chica); sigue por debajo del nudo y SUBE por la derecha pasando por DEBAJO del par horizontal, por dentro de la
    // gaza chica, hasta el seno (la punta, arriba). Las pasadas a la derecha del par horizontal llevan z = 1 (arriba) y la subida z = -1.
    const hz = (x) => (x >= 468 && x <= 548 ? 1 : undefined);
    const withZ = (pts, f) => pts.map(([x, y, z]) => { const v = f(x, y) ?? z; return v === undefined ? [x, y] : [x, y, v]; });
    const firme = withZ([...RAW.slice(14, at(388, 215) + 1), [402, 217, -1], [408, 218], [421, 219, -1], ...RAW.slice(at(428, 219), at(508, 222) + 1), [518, 222, 1], [528, 222], [538, 222, 1], ...RAW.slice(at(548, 222), at(420, 208) + 1)], (x, y) => (y > 215 && y < 225 ? hz(x) : x < 425 && y > 160 ? 1 : undefined));
    const seno = [[422, 219, 1], [423, 230, 1], [426, 244, 1], [434, 262], [448, 282], [478, 298], [506, 286], [516, 240, -1], [519, 222, -1], [521, 190, -1], [521, 160, -1], [520, 128, 0]];
    const raw2 = [...firme, ...seno];
    const F2 = fit(raw2);
    const pair0 = ((m) => [...m, ...rev(offset(m, 28))])(raw2.map(F2.T));
    const xs2 = pair0.map((p) => p[0]), ys2 = pair0.map((p) => p[1]);
    const [dx2, dy2] = [30 - Math.min(...xs2), 30 - Math.min(...ys2)];
    const pair2 = pair0.map(([x, y, z]) => (z === undefined ? [x + dx2, y + dy2] : [x + dx2, y + dy2, z]));
    const W2 = Math.round(Math.max(...xs2) + dx2 + 30), H2 = Math.round(Math.max(...ys2) + dy2 + 30);
    const dbl = (p) => [...p, ...rev(offset(p, 24))];
    return [
      { ...g, ropes: [{ ...A, path: dbl(cut(30)), end: false }] },
      { width: W2, height: H2, rope: 14, ropes: [{ ...A, path: pair2, end: false }] },
      { width: F3.width, height: F3.height, rope: 12, ropes: [{ ...A, path: open3.map(T3), end: false }], under: UN.map(T3), arrows: [[[F3.width - 30, 300], [F3.width - 80, 300]]] },
      { ...g, ropes: [{ ...A, path: cut(RAW.length), end: false }], under },
    ];
  })(),
  corredizo: [
    { ropes: [{ ...A, path: [...nooseLoop, [150, 112], [90, 112]] }], arrows: [[[70, 95], [40, 80]]] },
    { ropes: [{ ...A, path: [...nooseLoop, ...nooseKnot(0.55).path, [80, 185]] }], under: [[147, 150], [120, 150], ...nooseKnot(0.55).under] },
    { ropes: [{ ...A, path: [...nooseLoop.slice(0, -1), [230, 120], ...nooseKnot(0.56).path.slice(1), [100, 175]] }], under: [[147, 150], [120, 150], ...nooseKnot(0.56).under], arrows: [[[160, 232], [230, 232]]] },
    { ropes: [{ ...A, path: [[-20, 150], [100, 150], [250, 150], [280, 185], [320, 185], [330, 140], [305, 105], [270, 112], [230, 120], ...nooseKnot(0.56).path.slice(1), [100, 175]] }], under: [[147, 150], [120, 150], ...nooseKnot(0.56).under], arrows: [[[60, 125], [10, 125]]] },
  ],
  'ocho-gaza': (() => {
    // Ocho sobre seno (ABOK 1085 sin la segunda gaza): el ocho de siempre (4 cruces alternados, "FigureOfEightLoop.jpg",
    // CC BY-SA 3.0) hecho con la cuerda doble; el par se dibuja con 18 px entre cuerdas para que cada cruce de pares se lea.
    const rope = 10, d = 20, g = { width: 540, rope };
    // Paso 2: el seno ya pasó POR DEBAJO del lado derecho de la gaza (último cruce) y asoma por la derecha; todavía no se tiró de él.
    const e8c = e8.slice(0, 20); // hasta el lado derecho de la gaza (296,135); de ahí la gaza sale redonda, sin onda
    const e8r = rev(offset(e8, d)).slice(1); // vuelta paralela (sin la punta, que se dibuja a mano)
    const tip = [[330, 142], [352, 138], [352, 112], [330, 111]];
    const eyeD = [[335, 142], [380, 150], [425, 153], [466, 146], [484, 130], [466, 113], [425, 107], [380, 107], [335, 111]];
    const full = [...e8c, ...eyeD, ...e8r];
    return [
      { ...g, ropes: [{ ...A, path: [[-20, 190], [200, 190], [380, 190], ...rev(offset([[-20, 190], [200, 190], [380, 190]], d))], end: false }] },
      { ...g, ropes: [{ ...A, path: [...e8c, ...tip, ...e8r], end: false }], arrows: [[[330, 70], [385, 62], [440, 75]]] },
      { ...g, ropes: [{ ...A, path: full, end: false }], arrows: [[[40, 235], [5, 235]], [[488, 132], [528, 132]]] },
    ];
  })(),

  'ocho-doble': (() => {
    // Ocho doble (ocho "repasado"): ocho simple, el chicote pasa por el anillo y vuelve a recorrer el ocho en sentido contrario, paralelo
    // a la primera cuerda (mismas profundidades en cada cruce, par a 18 px). El ocho es el mismo que el de ocho-gaza
    // ("FigureOfEightLoop.jpg", CC BY-SA 3.0).
    const rope = 10, d = 20;
    const bulb = [[335, 142], [380, 150], [425, 154], [457, 152, 0], [482, 133, -1], [457, 112, -1], [425, 107], [380, 107], [335, 111]];
    const ring = { kind: 'ring', x: 474, y: 133, r: 26 };
    const back = rev(offset(e8, d)).slice(1);
    const head = e8.slice(0, 20);
    const g = { width: 520, rope, poles: [ring] };
    return [
      { width: 520, rope, ropes: [{ ...A, path: [...head, [335, 142], [390, 158], [450, 190], [500, 200]] }] },
      { ...g, ropes: [{ ...A, path: [...head, ...bulb.slice(0, 8)] }] },
      { ...g, ropes: [{ ...A, path: [...head, ...bulb, ...back.slice(0, 11)] }] },
      { ...g, ropes: [{ ...A, path: [...head, ...bulb, ...back.slice(0, -1), [70, 172]] }], arrows: [[[40, 140], [5, 140]]] },
    ];
  })(),
  'ocho-direccional': (() => {
    // Ocho directional = ocho sobre seno (la gaza sale del nudo apuntando hacia donde se va a tirar). Se ata con un seno en el medio de la
    // cuerda, sin usar las puntas: con las puntas cerradas el nudo es trivial (Alexander 1, comprobado con el par de ocho-gaza).
    // Fuentes: Wikimedia Commons "Directional figure 8 knot.svg" (LadyofHats, dominio público) y fotos ocho-direccional-1..3.webp (FM 3-97.61):
    // la cuerda entra por la izquierda, atraviesa el nudo con dos pasadas paralelas, la gaza sale a la derecha y el otro tramo del firme
    // sale por arriba, rodeando el nudo, hacia la derecha.
    const rope = 10, d = 20;
    const eyeD = [[385, 148], [418, 164], [452, 160], [476, 133], [452, 101], [418, 96], [385, 94]];
    // Revisado a ojo (2026-11-12) contra ocho-direccional-1..3.webp: la cuerda entra por la izquierda y sale por la DERECHA, en línea;
    // la vuelta (paso 1) se retuerce alrededor del tramo de la izquierda y su punta (el seno) pasa por dentro: el cuerpo es un ocho con la
    // cuerda doble que abraza al tramo de la izquierda (simple), y el otro tramo sale del nudo hacia la derecha, por abajo de la gaza.
    // Antes el tramo de la derecha salía por la izquierda junto al otro y daba la vuelta por encima de todo el nudo (no es así en las fotos).
    const single = e8.slice(0, 4); // tramo de la izquierda, simple: lo cruzan las dos pasadas dobles del ocho
    const right = [[275, 222], [340, 234], [450, 238], [580, 238]];
    const g = { width: 560, height: 300, rope };
    const loopOne = [[-20, 262], [120, 258], [300, 248], [400, 238], [432, 200], [440, 120], [400, 50], [300, 22], [170, 30], [95, 80], [82, 150], [130, 205], [250, 218], [380, 214], [440, 205], [490, 196], [580, 190]];
    const dFull = e8.slice(4);
    const tipD = [[368, 113], [390, 109], [402, 102], [390, 95], [368, 92]]; // punta del seno asomando, ya fuera del lóbulo (paso 2)
    return [
      { ...g, ropes: [{ ...A, path: loopOne, end: false }] },
      // Paso 2 (DEDUCIDO hacia atrás del paso 3: se tira del seno hacia atrás, de la gaza, hasta dejarlo apenas asomando): la punta ya salió
      // del lóbulo de arriba; pasa por ABAJO del tramo exterior (14-15 %) y por ABAJO del interior (81-82 %), igual que en el paso 3
      // (cruces #6, #7, #11, #12 de ese paso), y la flecha sigue hacia la derecha.
      { ...g, ropes: [{ ...A, path: [...single, ...dFull, ...tipD, ...rev(offset(dFull, d)), ...right], end: false }], arrows: [[[372, 102], [415, 96], [470, 104]]] },
      { ...g, ropes: [{ ...A, path: [...single, ...dFull, ...eyeD, ...rev(offset(dFull, d)), ...right], end: false }], arrows: [[[480, 150], [520, 160], [545, 190]], [[40, 135], [5, 135]]] },
    ];
  })(),
  // Ocho de dos gazas: SIN diagrama paso a paso hasta tener uno verificado contra una referencia real (ver refs/ocho-dos-gazas.json):
  // el dibujo anterior era un ocho con una sola gaza retorcida y no el nudo (le faltaba el seno sobrante que abraza el cuello).
  // Mientras tanto la ficha muestra la foto del manual y el texto.
  'ocho-dos-gazas': [],
  mariposa: (() => {
    const hand = { x: 110, y: 105, w: 230, h: 90, rx: 40, fill: '#e8c3a0', stroke: '#a77b58' };
    // Los dedos (a la derecha de la mano): la vuelta "del lado de los dedos" es la tercera, la más cercana a ellos.
    const fingers = [0, 1, 2, 3].map((k) => ({ x: 330, y: 108 + k * 22, w: 62, h: 16, rx: 8, fill: '#e8c3a0', stroke: '#a77b58' }));
    const wraps = [[-20, 280], [60, 250], [130, 220], ...((h) => h)(coilH3())];
    function coilH3() {
      const out = [];
      for (let i = 0; i < 3; i++) {
        const x = 160 + i * 55;
        out.push([x, 215, 0], [x + 10, 150, 1], [x + 20, 85, 0], [x + 32, 150, -1]);
      }
      out.push([325, 215, 0], [380, 250], [420, 280]);
      return out;
    }
    // Mariposa terminada: la forma (dos orejas arriba, dos lóbulos a los lados y la gaza colgando, con el firme cruzando) está transcripta
    // del cuadro 4 de "Alpine butterfly steps.png" (Ryan Flegel, CC BY-SA 3.0) y de la foto mariposa-2.webp; el recorrido es una sola
    // cuerda de punta a punta y, cerrando las puntas, da el nudo trivial (nudo atado sobre seno, sin usar las puntas, comprobado con
    // Alexander). Ese dibujo no deja ver a ojo cuál cuerda va arriba en cada cruce de la referencia (es muy chica): el orden de los
    // cruces se eligió con esa condición (trivial al cerrar, tramos colgantes por debajo de los lóbulos) y falta confirmarlo contra una
    // foto grande.
    // Transcripto cruce por cruce del cuadro 3 de "Alpine butterfly knot diagram.png" (LadyofHats, dominio publico): coordenadas de la imagen
    // (cuadro recortado) x3. Una cuerda de punta a punta (arriba a la derecha hasta abajo a la derecha), 12 cruces: BABAABBABBAAAABBABBBAAAB.
    const flyRaw = [[225,22],[200,24],[178,36],[158,50],[140,62],[125,76],[108,86],[92,90],[72,88],[55,78],[44,60],[46,40],[60,22],[82,10],[110,8],[140,13],[165,24],[177,36],[172,48],[155,56],[138,61],[120,60],[95,56],[65,52],[40,42],[20,42],[8,55],[14,70],[35,78],[65,73],[100,66],[130,64],[158,68],[175,80],[181,95],[172,108],[150,118],[125,122],[100,118],[78,106],[64,88],[58,65],[60,40],[72,22],[92,15],[110,20],[125,38],[138,60],[148,72],[162,86],[185,98],[205,102],[225,106]];
    // Mismos puntos con z (+1 la pasada que va por arriba, -1 la de abajo) en cada cruce: los cruces del centro estan a menos de 14 px
    // y `under` no los distingue.
    const flyT = [[675,76],[641.6,76.8],[600,82],[566.1,97.8],[534,118,-1],[503.2,138.8],[474,160,1],[446.1,179.3],[420,199,-1],[397.3,222.1,1],[375,244],[349.7,261.1],[324,274],[300.6,282.6],[276,286],[246.2,282.6],[216,274],[188.8,261.6,1],[165,244,-1],[144.9,218.9],[132,190],[130.3,160.0],[138,130,-1],[155.2,101.5],[180,76],[210.4,55.0],[246,40],[286.5,33.8],[330,34],[375.6,39.1],[420,49],[460.9,64.2],[495,82],[518.2,100.2],[531,118,1],[531.4,134.5],[526,160],[506,176],[468,172,-1],[448.1,160.4],[414,160,-1],[384.2,162.6],[354,166],[321.4,169.8],[285,172],[240.4,171.2],[195,166],[155.6,150.6,1],[120,136,1],[87.6,131.7],[60,136],[37.1,152.7],[24,175],[26.8,198.4],[42,220],[69.0,235.6],[105,244],[147.4,240.2,1],[195,232,1],[247.5,225.2],[300,220],[346.3,218.5],[390,220,-1],[434.4,224.1,-1],[474,232],[503.6,245.3],[525,262],[538.9,280.9],[543,301,1],[534.8,321.2],[516,340],[486.0,355.2],[450,367],[413.1,375.6],[375,379],[336.9,374.5],[300,364],[264.9,348.4],[234,328],[226,300],[218,272,-1],[212,242,-1],[204,205],[200,166.6,-1],[196,130],[204,100],[216,76],[244.9,61.2],[276,55],[303.9,57.8],[330,70],[353.4,94.6],[375,124],[395.4,151.4,1],[414,178],[428.8,202.8,1],[444,226,1],[462.6,247.8],[486,268],[519.4,287.9],[555,304,-1],[585.6,311.5],[615,316],[648.8,322.8],[675,328]];
    const flyUnder = [];
    return [
      { poles: [hand, ...fingers], ropes: [{ ...A, path: wraps }] },
      // Paso 2 (SIN REFERENCIA, solo el texto «pasala por encima de las otras dos y por debajo de todas»): la tercera vuelta (la del lado de los
      // dedos) se levanta, va hacia la izquierda POR ENCIMA de la 2 y la 1 (z alto), da la vuelta en el borde de la mano y vuelve hacia los dedos
      // ENTRE la mano y las tres vueltas: POR DEBAJO de las tres (tramos tapados) hasta salir del lado de los dedos.
      (() => {
        const moved = [...wraps.slice(0, 3 + 8), [270, 215, 0], [280, 160, 1], [286, 128, 2], [240, 124, 2], [186, 128, 2], [138, 134, 2], [116, 150, 0], [112, 170, -0.5], [140, 180, -0.5], [200, 182, -0.5], [270, 182, -0.5], [322, 182, -0.5], [338, 212, 0], [380, 250], [420, 280]];
        return { poles: [hand, ...fingers], ropes: [{ ...A, path: moved }], arrows: [[[300, 62], [230, 50], [160, 58], [120, 74]]] };
      })(),
      { width: 690, height: 400, rope: 14, ropes: [{ ...A, path: flyT, end: false }], under: flyUnder, arrows: [[[60, 150], [15, 150]], [[630, 50], [680, 50]]] },
    ];
  })(),
  'as-de-guia-corredizo': (() => {
    // As de guía corredizo (ABOK 1117), TRANSCRIPTO del trazado vectorial "Running bowline.svg" (Whidou, CC BY-SA 4.0, Wikimedia Commons):
    // una sola cuerda de 300 cuentas, numerada de punta a punta; se recorre del firme (a la derecha) al chicote (el del falcaceado, en el
    // centro) y, en cada cruce, arriba está la cuerda cuyas cuentas se dibujan después (votación entre las cuentas vecinas; todas con
    // mayoría clara). 9 cruces, secuencia desde el firme: ABABBAABBABABABAAB. Los 4 en que lo que se recorre PRIMERO va por arriba llevan
    // `under`. El firme cruza la gaza chica (la lobulo de la derecha): por DEBAJO de su lado de arriba y por ENCIMA del de abajo.
    // Puntos = cuentas (cada 2) con un promedio de 3, x 0,34 y corridos 30 px a la derecha.
    const rope = 15;
    const RAW = [[537,164],[524,160],[511,155],[498,151],[486,146],[473,141],[460,137],[447,132],[434,126],[423,120],[411,113],[400,104],[390,96],[379,87],[369,78],[358,70],[346,63],[334,56],[323,49],[311,43],[298,37],[286,32],[273,28],[259,25],[246,22],[232,21],[219,20],[205,18],[191,17],[178,16],[164,16],[151,16],[137,17],[124,19],[110,23],[97,28],[85,34],[74,41],[63,49],[52,58],[43,68],[34,78],[27,90],[21,102],[18,115],[19,129],[20,143],[21,156],[24,170],[29,182],[38,192],[49,200],[61,206],[74,210],[88,212],[101,214],[115,216],[129,216],[142,217],[156,217],[170,216],[183,214],[197,212],[210,209],[224,207],[237,207],[251,208],[264,208],[278,206],[289,200],[296,189],[300,175],[301,162],[300,148],[298,135],[293,122],[283,114],[270,111],[256,114],[244,120],[236,129],[234,142],[237,156],[244,168],[252,179],[262,188],[273,195],[286,200],[299,202],[313,200],[326,197],[339,193],[352,188],[364,182],[377,176],[389,170],[401,164],[414,158],[426,152],[437,144],[445,134],[449,121],[449,108],[444,94],[437,84],[427,74],[415,67],[402,63],[389,62],[375,64],[363,70],[352,78],[341,87],[331,96],[320,104],[310,113],[299,122],[288,130],[277,137],[265,143],[252,148],[239,152],[226,156],[213,160],[200,165],[188,171],[176,178],[166,187],[158,198],[154,210],[154,224],[158,237],[168,245],[181,247],[195,244],[208,238],[217,229],[223,216],[228,203],[238,194],[249,186],[260,179],[273,173],[285,167],[297,162],[310,156],[322,150],[335,146],[348,142],[361,138],[368,136]];
    const T = ([x, y]) => [x + 30, y];
    const full = [[580, 176], ...RAW].map(T);
    const under = [[300, 160], [153, 214], [297, 124], [447, 131]].map(T);
    const h = { width: 600, height: 270, rope };
    // Paso 1 (DEDUCIDO hacia atrás del nudo terminado: sacar el firme de la gaza chica): el mismo as de guía, y el firme sale libre hacia
    // la derecha por arriba, sin cruzar la gaza chica.
    const free = [[600, 14], [540, 13], [470, 13], [400, 14], [330, 16], [270, 19]];
    const bowl = [...free, ...RAW.slice(27).map(T)];
    return [
      { ...h, ropes: [{ ...A, path: bowl }], under },
      // Paso 2 (DEDUCIDO: es el nudo terminado, sin tirar todavía del firme): el seno del firme ya pasó por la gaza chica y se abre la gaza grande.
      { ...h, ropes: [{ ...A, path: full }], under, arrows: [[[60, 50], [28, 70]]] },
      { ...h, ropes: [{ ...A, path: full }], under, arrows: [[[535, 205], [575, 222]]] },
      null,
    ];
  })(),
};
