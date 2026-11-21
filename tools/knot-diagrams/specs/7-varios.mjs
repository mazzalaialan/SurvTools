import { A, B, G, coilH, coilV, move, rev } from '../helpers.mjs';

const H = { height: 340 };
const biner = (x, y, s = 1) => ({ kind: 'path', d: `M${x} ${y}c${-22 * s} 0 ${-30 * s} ${18 * s} ${-28 * s} ${40 * s}l${8 * s} ${70 * s}c${3 * s} ${18 * s} ${37 * s} ${18 * s} ${40 * s} 0l${8 * s} ${-70 * s}c${2 * s} ${-22 * s} ${-6 * s} ${-40 * s} ${-28 * s} ${-40 * s}zm0 ${10 * s}c${14 * s} 0 ${18 * s} ${14 * s} ${17 * s} ${30 * s}l${-7 * s} ${66 * s}c${-2 * s} ${10 * s} ${-18 * s} ${10 * s} ${-20 * s} 0l${-7 * s} ${-66 * s}c${-1 * s} ${-16 * s} ${3 * s} ${-30 * s} ${17 * s} ${-30 * s}z`, fill: '#9aa1ab', stroke: '#5c626b' });
const anchorBar = { x: 120, y: 0, w: 160, h: 22, rx: 6, fill: '#8f949b', stroke: '#585c62' };

// Dos gazas iguales en la mano (la de adelante, igual a la de atrás).
const loopAt = (cx) => [[cx - 40, 225], [cx - 5, 215], [cx + 25, 175], [cx + 10, 125], [cx - 35, 120], [cx - 52, 165], [cx - 30, 210, 1], [cx + 10, 228]];
const munter = [[140, 345], [168, 230], [186, 150], [196, 122, 1], [210, 96, -1], [226, 122], [214, 150, 1], [186, 140, 1], [180, 118, -1], [198, 98], [222, 135, 2], [236, 200], [262, 345]];

// Cornamusa: base y cuernos.
const cleat = { kind: 'path', d: 'M70 150c0-14 50-20 80-20h100c30 0 80 6 80 20s-50 20-80 20h-100c-30 0-80-6-80-20z', fill: '#9aa1ab', stroke: '#5c626b' };
const cleatBase = { x: 165, y: 140, w: 70, h: 40, rx: 8, fill: '#7e848c', stroke: '#5c626b' };

// Cuerpo esquemático para el arnés.
const body = [
  { x: 120, y: 60, w: 160, h: 80, rx: 36, fill: '#e8c3a0', stroke: '#a77b58' },
  { x: 125, y: 120, w: 62, h: 210, rx: 26, fill: '#e8c3a0', stroke: '#a77b58' },
  { x: 213, y: 120, w: 62, h: 210, rx: 26, fill: '#e8c3a0', stroke: '#a77b58' },
];

// Cadena: cada seno (lágrima con la punta a la derecha) pasa por la punta del anterior, que lo rodea por encima.
const link = (x, first = false) => [
  ...(first ? [] : [[x, 150]]),
  [x + 30, 136], [x + 72, 126], [x + 108, 134], [x + 122, 150, 1], [x + 108, 166], [x + 72, 174], [x + 44, 166], [x + 58, 155],
];
const chain = (n, end = false) => {
  const out = [[-20, 150], [20, 150]];
  for (let k = 0; k < n; k++) out.push(...link(30 + 70 * k, k === 0));
  if (end) out.push([30 + 70 * n, 150], [30 + 70 * n + 80, 152], [30 + 70 * n + 150, 160]);
  else out.push([30 + 70 * n + 40, 190], [30 + 70 * n + 90, 230]);
  return out;
};

// Dinámico (Munter) leído de la foto «Munter Hitch.jpg» (ver refs/dinamico.json): carga abajo a la izquierda, freno abajo a la derecha.
const MUNTER = [[120, 345], [160, 288], [190, 240, 0.5], [200, 205], [203, 182, -1], [203, 160, -1], [195, 140], [172, 128], [150, 134], [140, 158], [140, 180, 1], [143, 210, 1], [160, 228], [190, 240, -0.5], [215, 248], [235, 235], [238, 205], [236, 178, 1], [232, 150, 1], [238, 132], [255, 128], [266, 145], [266, 165, -1], [266, 182, -1], [264, 230], [262, 290], [262, 345]];

// Nudo llano (rizo) de «Square knot.svg» (CountingPine, dominio público; mismas coordenadas que specs/2-union.mjs, ya verificadas cruce por cruce),
// achicado y puesto sobre la cadera de la mano libre: cada punta llega por su lado (la de la izquierda por la izquierda, la de la derecha por la derecha).
const reefRed = [[-20, 152], [119, 152, 0.5], [152, 152], [196, 181, -0.5], [225, 202], [255, 205], [276, 190], [281, 152, 0.5], [281, 75, 0.5], [279, 48], [262, 28], [237, 22], [212, 33, -0.5], [180, 62, -0.5], [152, 75], [119, 75, 0.5], [70, 75]];
const reefBlue = [[420, 152], [281, 152, -0.5], [248, 152], [196, 181, 0.5], [165, 203], [137, 198], [119, 176], [119, 152, -0.5], [119, 75, -0.5], [122, 48], [138, 28], [162, 22], [182, 32, 0.5], [215, 62, 0.5], [248, 75], [285, 75, -0.5], [330, 75]];
const reefTie = (p, cut = 0) => p.slice(1, p.length - cut).map(([x, y, zz]) => [350 + (x - 200) * 0.52, 103 + (y - 150) * 0.52, ...(zz === undefined ? [] : [zz + 2])]);

export default {
  dinamico: (() => {
    // Mosquetón grande (pera) visto de frente: la cuerda trabaja sobre su barra de abajo (y ≈ 170).
    const pear = { kind: 'path', d: 'M200 15c-60 0-85 40-80 90l8 70c4 30 140 30 144 0l8-70c5-50-20-90-80-90zm0 18c45 0 63 32 60 72l-8 66c-3 18-101 18-104 0l-8-66c-3-40 15-72 60-72z', fill: '#9aa1ab', stroke: '#5c626b' };
    // Leído de la foto «Munter Hitch.jpg» (CC BY-SA 4.0): son dos senos con vueltas de mano contraria alrededor de la barra, con UN cruce debajo.
    // La carga (abajo a la izquierda) sube POR DETRÁS de la barra, pasa por encima, baja POR DELANTE (primer seno), cruza POR DEBAJO de su propio tramo ascendente,
    // sube de nuevo POR DELANTE de la barra, pasa por encima y baja POR DETRÁS: sale el freno.
    const munter = MUNTER;
    const flat = munter.map(([x, y, zz]) => (zz === undefined || Math.abs(zz) < 1 ? [x, y, zz] : [x, y]));
    return [
      { height: 420, rope: 10, ropes: [{ ...A, path: flat }], arrows: [[[300, 120], [255, 160]], [[100, 120], [145, 160]]] },
      { height: 420, rope: 10, zoom: [1.3, 200, 100], poles: [anchorBar, pear], ropes: [{ ...A, path: munter }], arrows: [[[330, 150], [285, 120]]] },
      { height: 420, rope: 10, zoom: [1.3, 200, 100], poles: [anchorBar, pear], ropes: [{ ...A, path: munter }] },
      { height: 420, rope: 10, zoom: [1.3, 200, 100], poles: [anchorBar, pear], ropes: [{ ...A, path: [...munter.slice(0, -3), [250, 250], [215, 300], [170, 345]] }], arrows: [[[95, 300], [95, 340]], [[300, 300], [230, 335]]] },
    ];
  })(),
  mula: (() => {
    const pear = { kind: 'path', d: 'M200 15c-60 0-85 40-80 90l8 70c4 30 140 30 144 0l8-70c5-50-20-90-80-90zm0 18c45 0 63 32 60 72l-8 66c-3 18-101 18-104 0l-8-66c-3-40 15-72 60-72z', fill: '#9aa1ab', stroke: '#5c626b' };
    const munter = MUNTER.slice(0, -3);
    // El freno baja, pasa un seno por detrás de la carga y lo cierra como un cote corredizo alrededor de ella.
    const behind = [[262, 262], [200, 278, -1], [130, 285, -1], [95, 290], [92, 312], [118, 318]];
    const slip = [[150, 312, 2], [200, 305, 2], [222, 290], [210, 268], [185, 270, 2], [175, 300, 2], [195, 330], [245, 340]];
    return [
      { height: 420, rope: 10, zoom: [1.3, 200, 100], poles: [anchorBar, pear], ropes: [{ ...A, path: [...munter, ...behind, [160, 320], [250, 330]] }] },
      { height: 420, rope: 10, zoom: [1.3, 200, 100], poles: [anchorBar, pear], ropes: [{ ...A, path: [...munter, ...behind, ...slip] }] },
      { height: 420, rope: 10, zoom: [1.3, 200, 100], poles: [anchorBar, pear], ropes: [{ ...A, path: [...munter, ...behind, ...slip.slice(0, -2), [182, 298, 3], [194, 326, 3], [226, 346], [264, 352]] }] },
      { height: 420, rope: 10, zoom: [1.3, 200, 100], poles: [anchorBar, pear], ropes: [{ ...A, path: [...munter, ...behind, ...slip] }], arrows: [[[300, 300], [345, 280]]] },
    ];
  })(),
  guarda: (() => {
    // Dos mosquetones iguales pegados (en la foto se ven casi superpuestos, uno detrás del otro): se dibujan apenas corridos.
    const two = [anchorBar, biner(228, 22, 1.5), biner(192, 22, 1.5)];
    // Paso 2 (foto del manual y VDiff, ver refs/guarda.json): el seno entra por el ojo de los DOS mosquetones: el tramo izquierdo (el de la carga) sube por DETRAS de las barras, da la vuelta adentro y baja por DELANTE (guarda-1.webp ampliada 5x: izquierdo atras, derecho adelante; las fotos guarda-1..4 estan corridas un paso respecto del texto).
    const clip = [[140, 345], [160, 290], [186, 208, -1], [194, 160, -1], [210, 130], [226, 160, 1], [232, 208, 1], [246, 290], [262, 345]];
    // Paso 3: del lado que no carga (derecha) se saca una gaza de la cuerda y se mete por el ojo del mosquetón de la izquierda (por delante), sin tocar el otro.
    const loopTail = [[246, 290], [236, 262], [200, 246, -0.5], [165, 226], [158, 208, 1], [156, 160, 1], [166, 122], [176, 160, -1], [172, 208, -1], [200, 250, 0.5], [250, 290], [275, 345]];
    return [
      { ...H, poles: two },
      { ...H, poles: two, ropes: [{ ...A, path: clip }] },
      { ...H, poles: two, ropes: [{ ...A, path: [...clip.slice(0, 7), ...loopTail] }] },
      { ...H, poles: two, ropes: [{ ...A, path: [...clip.slice(0, 7), ...loopTail] }], arrows: [[[100, 300], [100, 340]], [[310, 340], [310, 290]]] },
    ];
  })(),
  cornamusa: (() => {
    // Vista desde arriba como en el dibujo del manual (cornamusa-1.webp): cuerno de arriba y de abajo, la cuerda firme baja por la derecha.
    // Coordenadas del dibujo (x, y, z) pasadas al lienzo; z = -1: la cuerda pasa por DETRÁS del cuerno (por debajo de la pieza).
    const T = ([x, y, zz]) => (zz === undefined ? [(x - 300) * 0.5 + 200, y * 0.27 + 8] : [(x - 300) * 0.5 + 200, y * 0.27 + 8, zz]);
    const horn = (y0, y1) => ({ kind: 'path', d: `M205 ${y0}C233 ${y0 + 36} 233 ${y1 - 36} 205 ${y1}C177 ${y1 - 36} 177 ${y0 + 36} 205 ${y0}z`, fill: '#9aa1ab', stroke: '#5c626b' });
    const poles = [{ x: 191, y: 172, w: 28, h: 26, rx: 4, fill: '#7e848c', stroke: '#5c626b' }, horn(66, 183), horn(190, 305)];
    // Paso 1 (leído del manual): la firme baja por la derecha, da la vuelta por detrás del cuerno de abajo (el más lejano), sube por la izquierda,
    // pasa por detrás del cuerno de arriba y baja en diagonal POR DELANTE de la cintura de la cornamusa hacia abajo a la izquierda.
    const base = [[525, -10], [495, 200], [470, 330], [440, 450], [425, 560], [410, 680], [395, 760], [385, 830], [365, 872, -1], [320, 892, -1], [270, 880, -1], [235, 850], [215, 790], [205, 720], [200, 640], [200, 540], [210, 460], [235, 405], [270, 384, -1], [320, 378, -1], [370, 390, -1], [405, 432], [405, 500], [380, 570]];
    const d1 = [[335, 640], [285, 700], [235, 770], [185, 835]];
    // Paso 2: sigue la diagonal, da una vuelta por detrás del cuerno de abajo (por la izquierda del primer cote), sube por la derecha y vuelve en diagonal
    // por delante hacia arriba a la izquierda: la 1.ª diagonal queda cruzada con esta, formando el ocho.
    const loop2 = [[165, 900], [185, 965], [250, 1008, -1], [320, 1016, -1], [385, 1000, -1], [430, 950], [445, 880], [430, 800], [410, 735]];
    const d2 = [[380, 690], [330, 650], [260, 600], [190, 540], [135, 440], [105, 330]];
    // Paso 3 (texto: «un cote: una gaza dada vuelta para que el chicote quede por DEBAJO y paralelo al último cruce»; SIN foto legible, ver refs/cornamusa.json):
    // tras la 2.ª diagonal la punta rodea por detrás el cuerno de arriba, baja por la derecha y cruza la cintura en una diagonal paralela a la 1.ª, apenas corrida;
    // en el cruce con su propio tramo (la diagonal que sube al cuerno de arriba) pasa por ABAJO y sigue paralela a la 1.ª diagonal.
    const loop3 = [[120, 255], [200, 232], [270, 240, -1], [340, 240, -1], [420, 255], [485, 300], [500, 370]];
    const d3 = [[490, 408], [443, 443], [405, 480], [350, 545], [300, 595], [262, 640], [225, 690], [185, 750], [150, 810], [120, 862]];
    const fig = (pts, extra = {}) => ({ width: 400, height: 330, rope: 11, poles, ropes: [{ ...A, path: pts.map(T) }], ...extra });
    return [
      fig([...base, ...d1]),
      fig([...base, ...d1, ...loop2, ...d2]),
      fig([...base, ...d1, ...loop2, ...d2, ...loop3, ...d3], { under: [[191, 174]] }),
    ];
  })(),
  'asiento-rappel': [
    { ...H, rope: 10, poles: body, ropes: [{ ...A, path: [[60, 345], [70, 200], [95, 110], [120, 95, -1], [125, 115], [100, 205], [95, 345]] }] },
    { ...H, rope: 10, poles: body, ropes: [{ ...A, path: [[180, 210], [195, 150], [200, 120, 1], [150, 118, 1], [110, 112], [115, 90], [200, 88, -1], [285, 92], [290, 112], [250, 118, 1], [200, 120, 1], [205, 150], [220, 210]] }] },
    { ...H, rope: 10, poles: body, ropes: [{ ...A, path: [[290, 112], [250, 118, 1], [200, 120, 1], [150, 118, 1], [110, 112], [115, 90], [200, 88, -1], [285, 92], [290, 112]], end: false }, { ...A, path: [[193, 122], [190, 160], [189, 190], [188, 232]] }, { ...A, path: [[207, 122], [210, 160], [211, 190], [212, 232]] }], arrows: [[[240, 200], [240, 260]]] },
    { ...H, rope: 10, poles: body, ropes: [{ ...A, path: [[290, 112], [250, 118, 1], [200, 120, 1], [150, 118, 1], [110, 112], [115, 90], [200, 88, -1], [285, 92], [290, 112]], end: false }, { ...A, path: [[193, 122], [190, 160], [186, 195, -1], [140, 215, -1], [112, 190], [118, 140], [140, 112, 0.5], [160, 125, 2]] }, { ...A, path: [[207, 122], [210, 160], [214, 195, -1], [260, 215, -1], [288, 190], [282, 140], [262, 112, 0.5], [240, 125, 2]] }] },
    { ...H, width: 460, rope: 10, poles: [...body, biner(200, 100, 0.9)], ropes: [{ ...A, path: [[290, 112], [250, 118, 1], [200, 120, 1], [150, 118, 1], [110, 112], [115, 90], [200, 88, -1], [285, 92], [290, 112]], end: false }, { ...A, path: [[193, 122], [190, 160], [186, 195, -1], [140, 215, -1], [112, 190], [118, 140], [140, 112, 0.5], [130, 98, 2], [128, 66, 2], [150, 30, 2], [250, 20, 2], [400, 20, 2], [440, 45, 2], [446, 90, 2], [430, 104, 2], ...reefTie(reefBlue)] }, { ...A, path: [[207, 122], [210, 160], [214, 195, -1], [260, 215, -1], [288, 190], [282, 140], [270, 124, 0.5], [264, 112, 0.5], [270, 98, 2], [282, 86, 2], [298, 80, 2], [306, 90, 2], ...reefTie(reefRed)] }] },
  ],
  'silla-bombero': (() => {
    // Nudo de esposas (ABOK 1140), leído de la foto «Handcuff-knot-ABOK-1140.jpg» (ver refs/silla-bombero.json): las puntas salen hacia ABAJO.
    // Recorrido de la punta izquierda a la derecha (coordenadas de la foto; z = 1 pasa por arriba, z = -1 por abajo en el cruce):
    //  sube en diagonal (sobre el tramo que baja del aro a la derecha) -> sobre el tramo que sale hacia la gaza izquierda del fondo -> sobre el aro derecho
    //  -> gaza derecha (vuelta antihoraria) -> arco de arriba hacia la izquierda -> baja por el costado izquierdo del aro (sobre la gaza izquierda de abajo)
    //  -> por debajo de la diagonal -> fondo del aro hacia la derecha -> sube por el costado derecho del aro (por debajo del arco) -> sale hacia la izquierda por debajo del aro
    //  -> gaza izquierda (vuelta antihoraria) -> vuelve al centro por debajo del aro, por debajo de la diagonal y por debajo del fondo del aro -> baja a la punta derecha.
    // Paso 3: las gazas se ajustan con el cote, así que cada una tiene el CUELLO angosto (las dos patas casi juntas, a ~20 px, apenas afuera del aro) y se abre en una gaza redonda
    // más allá. Mismos cruces del nudo de esposas; solo cambia la forma de las dos gazas (en coordenadas finales). Izquierda: de la esquina de arriba del aro (151, 88) a la de abajo (153, 160).
    const PINCH_L = [[134, 100], [112, 111], [88, 111], [62, 100], [38, 104], [22, 128], [32, 152], [58, 160], [78, 147], [90, 137], [112, 137], [132, 149]].map(([x, y]) => [x, y, undefined, 1]);
    // Derecha: de la esquina de abajo (262, 152) a la de arriba (265, 72): la izquierda reflejada (x -> 426 - x) y recorrida al revés.
    const PINCH_R = PINCH_L.map(([x, y]) => [426 - x, y, undefined, 1]).reverse();
    const cuffs = (kL, kR, pinch = false) => {
      const L = (x) => 350 - (350 - x) * kL, R = (x) => 640 + (x - 640) * kR;
      const pts = [
        [330, 640], [345, 520], [375, 430], [392, 395, 1], [440, 330], [490, 303, 1], [550, 285], [612, 302, 1],
        ...(pinch ? PINCH_R : [[R(700), 342], [R(820), 362], [R(900), 300], [R(915), 220], [R(870), 150], [R(800), 120], [R(700), 128]]),
        [620, 112], [520, 108], [420, 108], [352, 150, 1], [336, 225], [350, 312, 1], [378, 372, -1], [440, 402], [500, 398], [550, 372, 1],
        [585, 338], [622, 305, -1], [652, 250], [655, 200], [630, 160], [560, 152], [450, 156], [380, 150], [348, 150, -1],
        ...(pinch ? PINCH_L : [[L(250), 112], [L(150), 100], [L(85), 160], [L(85), 250], [L(130), 330], [L(220), 365], [L(300), 345]]),
        [352, 322, -1], [430, 295], [490, 303, -1], [528, 330], [552, 350, -1], [580, 420], [612, 520], [640, 640],
      ];
      // Los puntos de PINCH_L / PINCH_R ya están en coordenadas finales (se marcan con un 4.º valor).
      return pts.map(([x, y, zz, fin]) => (fin ? (zz === undefined ? [x, y] : [x, y, zz]) : zz === undefined ? [x * 0.42 + 5, y * 0.42 + 25] : [x * 0.42 + 5, y * 0.42 + 25, zz]));
    };
    // Paso 3 (SIN REFERENCIA fotográfica, ver refs/silla-bombero.json): cote de cada punta alrededor de las DOS patas de la gaza de su lado, apenas afuera del aro (ABOK 1141).
    // De la cuerda hacia la punta: sube por AFUERA del aro pasando por ARRIBA de las dos patas, da la vuelta arriba, vuelve por DEBAJO de las dos y termina por DEBAJO de su propio tramo.
    // Versión compacta (ronda 3 del crítico): la cola sube pegada al borde del aro hasta la gaza, la rodea por arriba de las dos patas (x = 112), da la vuelta arriba,
    // vuelve por detrás de las dos (x = 126) y termina cruzando por debajo de su propio tramo; no hay una segunda U larga que parezca otra gaza.
    // La cola sale del nudo hacia abajo y gira enseguida hacia el cuello de su gaza (no baja hasta el final): sube por AFUERA pasando por ARRIBA de las dos patas (x = 100),
    // da la vuelta arriba, baja por DETRÁS de las dos (x = 124) y termina cruzando por DEBAJO de su propio tramo (sin una segunda U larga que parezca otra gaza).
    const wrapL = [[155, 210], [134, 214], [110, 200], [100, 176, 1], [100, 145, 1], [100, 110, 1], [102, 92, 1], [110, 84, 1], [118, 92, -1], [124, 110, -1], [124, 144, -1], [120, 168, -1], [108, 182, -1], [94, 188, -1]];
    const wrapR = wrapL.map(([x, y, zz]) => [426 - x, y, zz]);
    // Sin los tramos de cola de abajo (los reemplazan las colas con su cote).
    const body3 = cuffs(0.72, 1.12, true).slice(2, -2);
    return [
      { width: 420, height: 320, ropes: [{ ...A, path: cuffs(1, 1) }] },
      { width: 420, height: 320, ropes: [{ ...A, path: cuffs(0.72, 1.12) }], arrows: [[[60, 40], [30, 25]], [[360, 40], [390, 25]]] },
      { width: 420, height: 340, ropes: [{ ...A, path: [...rev(wrapL), ...body3, ...wrapR] }] },
    ];
  })(),
  cadena: (() => {
    // Cadeneta (ABOK 1144): cada eslabón nuevo es un seno que atraviesa la gaza anterior de abajo hacia arriba (ver refs/cadena.json).
    // Cada pata del seno cruza el borde de la gaza anterior dos veces: por DEBAJO del borde de entrada y por ARRIBA del borde de salida, y las dos patas hacen lo mismo
    // (en la secuencia quedan pares AA y BB, no ABAB). z = -1 pasa por debajo, z = +1 por arriba de la cuerda de la gaza (que va con z = 0).
    // Gaza 1: oval con un cruce a la izquierda (la punta A baja, la vuelta pasa por arriba), como en el nudo de escape.
    const ring1 = [[5, 165], [45, 190], [70, 212], [105, 245], [160, 252], [215, 240], [235, 210], [215, 178], [160, 168], [105, 172], [75, 190], [50, 215]];
    const S1 = [[35, 245], [40, 285], [95, 305]];
    // Eslabón 2: sube por dentro de la gaza 1 (entra por el borde de abajo, sale por el de arriba), da la punta arriba y baja por el mismo camino.
    const link2 = [[118, 292, -1], [118, 250, -1], [118, 210], [118, 172, 1], [118, 110, 1], [128, 72], [145, 58], [162, 72], [172, 110, 1], [172, 172, 1], [172, 210], [172, 250, -1], [172, 292, -1]];
    const S2 = [[205, 312], [290, 305], [330, 250], [335, 150], [330, 100]];
    // Eslabón 3: pasa por dentro de la gaza del eslabón 2 (la punta de arriba) de derecha a izquierda: entra por su pata derecha (por debajo) y sale por la izquierda (por arriba).
    const link3 = [[300, 95], [230, 95], [172, 95, -1], [145, 95], [118, 95, 1], [80, 97], [52, 108], [80, 120], [118, 120, 1], [145, 120], [172, 120, -1], [230, 120], [262, 120]];
    const W = { width: 420, height: 330 };
    return [
      { ...W, ropes: [{ ...A, path: [...ring1, ...[[35, 245], [32, 275], [60, 300]]] }], arrows: [[[30, 20], [70, 10]]] },
      { ...W, ropes: [{ ...A, path: [...ring1, ...S1, ...link2, [200, 312], [270, 312]] }], arrows: [[[250, 280], [275, 300]]] },
      { ...W, ropes: [{ ...A, path: [...ring1, ...S1, ...link2, ...S2, ...link3] }] },
      // Paso 4: la punta pasa por la gaza libre del eslabón 3 (la que asoma por la izquierda, entre las dos patas): baja a la derecha, vuelve a la izquierda por dentro del seno del eslabón 2 (por debajo de su pata derecha y por arriba de la izquierda, igual que las patas del 3) y sube por la gaza: por DEBAJO de la pata de abajo (85 %) y por ARRIBA de la de arriba (78 %).
      { ...W, ropes: [{ ...A, path: [...ring1, ...S1, ...link2, ...S2, ...link3, [284, 134], [282, 146], [250, 146], [200, 146], [172, 146], [145, 146], [118, 146, 2], [100, 146, 2], [90, 138, -1], [88, 120, -1], [88, 108, -1], [88, 100, 1], [88, 70, 1], [88, 48, 1]] }], arrows: [[[135, 24], [102, 40]]] },
    ];
  })(),
  margarita: (() => {
    // Tres tramos paralelos (arriba, medio, abajo) unidos por dos senos: el izquierdo (medio-abajo) y el derecho (arriba-medio).
    const S = [[-20, 100], [340, 100], [378, 115], [378, 135], [340, 150], [40, 150], [14, 175], [40, 200], [420, 200]];
    // Cada punta da una vuelta (cote) alrededor del cuello de su seno (foto USCG ampliada 4x, ver refs/margarita.json): cote izquierdo (abraza medio y abajo): baja POR DEBAJO de los dos tramos y sube POR ARRIBA (arriba cruza por encima de su propio tramo); cote derecho (abraza arriba y medio) = el izquierdo girado 180°: sube POR ARRIBA de arriba y medio; el tramo de la punta baja por DEBAJO de arriba y medio y POR ARRIBA de su propio tramo (abajo).
    const hitched = [
      [-20, 70], [90, 62], [135, 72], [135, 100, 2], [135, 150, -2], [135, 200, -2], [135, 232, -2], [118, 248, -2], [100, 234, 1], [100, 200, 1], [100, 150, 1], [100, 116, -1], [114, 103, -1], [150, 100, -1],
      [200, 100], [340, 100], [378, 115], [378, 135], [340, 150], [40, 150], [14, 175], [40, 200], [200, 200],
      [290, 200], [300, 184, 1], [300, 150, 1], [300, 100, 1], [300, 70, 1], [285, 56, -2], [265, 68, -2], [265, 100, -2], [265, 150, -2], [265, 200, 2], [265, 232], [285, 238], [330, 230], [420, 230],
    ];
    return [
      { ropes: [{ ...A, path: S, end: false }] },
      { ropes: [{ ...A, path: hitched, end: false }] },
      { ropes: [{ ...A, path: hitched, end: false }], arrows: [[[40, 30], [5, 30]], [[355, 270], [395, 270]]] },
    ];
  })(),
};
