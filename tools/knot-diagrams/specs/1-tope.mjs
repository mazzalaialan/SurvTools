import { A, coilH, move, offset, rev, scale } from '../helpers.mjs';

const loop = [[-20, 210], [100, 210], [200, 210], [270, 175], [285, 110], [235, 60], [170, 72], [148, 130], [172, 210]];
const thru = [[185, 250], [212, 270], [238, 248], [228, 205], [215, 150], [232, 112], [290, 95]];
const U = [[228, 205]]; // el chicote pasa por debajo del firme

// Ocho: gaza, vuelta por detrás del firme y entra a la gaza desde adelante.
const eight = [[-20, 220], [120, 220], [230, 218], [290, 180], [295, 110], [245, 65], [185, 80], [170, 140], [195, 225], [215, 265], [180, 290], [140, 270], [150, 220], [190, 170], [245, 140], [300, 135], [350, 142]];


// Escape: puntos tomados del diagrama de referencia (coordenadas de la imagen) y llevados al lienzo (x0,24 + 40; y0,24 + 60).
const escT = (pts) => pts.map(([x, y]) => [Math.round(x * 0.24 + 40), Math.round(y * 0.24 + 60)]);
// Firme (a la izquierda), óvalo de la derecha, arco de abajo, gaza grande y arco de arriba.
const escapeBody = [[-80, 580], [60, 570], [300, 552], [450, 520], [590, 470], [700, 420], [800, 375], [900, 325], [1000, 270], [1100, 235], [1180, 228], [1240, 270], [1275, 350], [1262, 430], [1225, 500], [1160, 545], [1100, 580], [1040, 612], [900, 660], [760, 650], [650, 590], [600, 500], [598, 400], [640, 310], [710, 250], [780, 240], [840, 275]];
// El seno: la pata que baja en diagonal, la vuelta abajo a la derecha y la pata que vuelve hasta la punta (arriba).
const escapeBight = [[900, 335], [960, 400], [1030, 490], [1100, 580], [1180, 660], [1260, 725], [1335, 740], [1375, 700], [1350, 625], [1290, 540], [1220, 460], [1140, 385], [1060, 315], [980, 245], [900, 170], [840, 100], [800, 66]];
const escapeFull = escT([...escapeBody, ...escapeBight]);
// Dónde el firme pasa POR ENCIMA de las patas del seno (el resto lo decide el orden: lo que se hizo después va arriba).
const escapeUnder = escT([[880, 335], [1010, 262]]);
// Paso 1: la punta se dobla en un seno (una U bien abierta, con las dos patas separadas), todavía sin pasar por la vuelta.
const escapeStart = escT([...escapeBody, [880, 200], [925, 115], [985, 30], [1070, -25], [1150, -5], [1190, 60], [1195, 115]]);

export default {
  simple: [
    { ropes: [{ ...A, path: [...loop, [190, 252], [205, 280]] }], arrows: [[[222, 273], [262, 258], [262, 232]]] },
    { ropes: [{ ...A, path: [...loop, ...thru, [345, 105]] }], under: U },
    { ropes: [{ ...A, path: [[-20, 170], [60, 170], ...scale(loop.slice(2).concat(thru), 0.75).map(([x, y]) => [x + 45, y + 25]), [320, 104], [420, 108]] }], under: [[216, 179]],
      arrows: [[[45, 215], [5, 215]], [[350, 155], [390, 155]]] },
  ],
  // Escape (simple corredizo, ABOK #529): recorrido transcrito del diagrama "slip knot" de Wikimedia Commons
  // (Overhand-slip-noose.png, CC BY-SA 4.0, Buz11) y de la foto ABOK 529 (USCG, CC BY-SA 4.0), cruce por cruce:
  // el firme pasa por debajo de la gaza y por encima del seno y de la punta; el óvalo pasa por debajo de las dos patas del seno.
  escape: [
    // 1) El nudo simple empezado (firme, óvalo y gaza); la punta se dobla en seno sin cruzar todavía.
    { ropes: [{ ...A, path: escapeStart }], arrows: [[[258, 150], [280, 164], [302, 182]]] },
    // 2) El seno pasa por dentro de la vuelta (las dos patas cruzan el firme y el óvalo): ajustar tirando del firme y del seno.
    { ropes: [{ ...A, path: escapeFull }], under: escapeUnder, arrows: [[[75, 225], [30, 225]], [[330, 262], [368, 255]]] },
    // 3) Para soltarlo, se tira de la punta: el seno sale por donde entró.
    { ropes: [{ ...A, path: escapeFull }], under: escapeUnder, arrows: [[[222, 62], [198, 38], [175, 30]]] },
  ],
  'ocho-simple': [
    { ropes: [{ ...A, path: [...eight.slice(0, 9), [215, 265], [230, 292]] }], arrows: [[[210, 294], [180, 292], [150, 276], [140, 252]]] },
    { ropes: [{ ...A, path: [...eight.slice(0, 13), [160, 202]] }], under: [[150, 220]], arrows: [[[198, 185], [230, 162], [262, 148]]] },
    { ropes: [{ ...A, path: eight }], under: [[150, 220], [298, 135]] },
  ],
  // Tope (doble simple, ABOK #516 / 5_1): el chicote se enrolla dos veces en el firme y vuelve por dentro de las vueltas.
  // Referencia: fotos de dominio público de Markus Bärlocher en Wikimedia Commons, Doppelter_Spierenstich-1..4.jpg
  // (Public domain): la punta se enrolla dos veces y vuelve por dentro de las vueltas en sentido contrario; en -4 (nudo
  // ajustado) las dos vueltas quedan paralelas, lado a lado. Esquema propio del recorrido (no es copia de la foto).
  // Paso 3: pitch 64, r 38, tilt 0 (con menos pitch o con tilt los cruces de firme y retorno se pisan: ⚠ AMBIGUO).
  tope: [
    { ropes: [{ ...A, path: [[-20, 150], [100, 150], [300, 150], [340, 160], [352, 196], [326, 226], ...coilH({ x: 290, y: 150, n: 2, pitch: 110, r: 56, from: 'bottom', left: true, tilt: 0.2 }).map(([x, y, z]) => [x, y, z / 2]), [60, 214], [38, 222]] }],
      arrows: [[[150, 252], [95, 252]]] },
    { ropes: [{ ...A, path: [[-20, 150], [100, 150], [300, 150], [340, 160], [352, 196], [326, 226], ...coilH({ x: 290, y: 150, n: 2, pitch: 110, r: 56, from: 'bottom', left: true, tilt: 0.2 }).map(([x, y, z]) => [x, y, z / 2]), [58, 208, 0], [46, 192, 0], [70, 183, 0], [150, 183, 0], [250, 183, 0], [305, 178, 0], [326, 130], [338, 90]] }],
      arrows: [[[110, 262], [190, 262], [262, 262]]] },
    // Ajustado: las dos vueltas quedan pegadas, una al lado de la otra (el barril), centradas en el haz firme + vuelta del chicote.
    { ropes: [{ ...A, path: [[-20, 150], [100, 150], [250, 150], [330, 150], [350, 174], [324, 202], ...coilH({ x: 290, y: 166, n: 2, pitch: 64, r: 38, from: 'bottom', left: true, tilt: 0 }).map(([x, y, z]) => [x, y, z / 2]), [150, 206, 0], [128, 196, 0], [134, 184, 0], [170, 183, 0], [230, 183, 0], [305, 181, 0], [326, 130], [338, 90]] }],
      arrows: [[[110, 150], [60, 150]], [[312, 128], [345, 100]]] },
  ],
};
