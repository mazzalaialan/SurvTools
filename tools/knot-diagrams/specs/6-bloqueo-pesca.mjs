import { A, B, G, OHZ, coilH, coilV, move, offset, overhand, rev } from '../helpers.mjs';

const H = { height: 340 };
const HB = { height: 340, rope: 8 };
const HM = { height: 340, rope: 10 }; // vueltas más finas y con más paso para que los cruces se lean
const HP = { height: 340, rope: 9 }; // Prusik: cordino y cuerda más finos para que las vueltas no se pisen
const main = { ...B, path: [[200, -20], [200, 170], [200, 360]], end: false };
const X = 200;
// Vueltas del cordino, de abajo hacia arriba (izquierda adelante).
const wraps = (n, y = 230, pitch = 26, r = 24) => coilV({ x: X, y, n, pitch, r, up: true });

// Mosquetón (pera) dibujado como contorno.
const biner = (x, y, s = 1) => ({ kind: 'path', d: `M${x} ${y}c${-22 * s} 0 ${-30 * s} ${18 * s} ${-28 * s} ${40 * s}l${8 * s} ${70 * s}c${3 * s} ${18 * s} ${37 * s} ${18 * s} ${40 * s} 0l${8 * s} ${-70 * s}c${2 * s} ${-22 * s} ${-6 * s} ${-40 * s} ${-28 * s} ${-40 * s}zm0 ${10 * s}c${14 * s} 0 ${18 * s} ${14 * s} ${17 * s} ${30 * s}l${-7 * s} ${66 * s}c${-2 * s} ${10 * s} ${-18 * s} ${10 * s} ${-20 * s} 0l${-7 * s} ${-66 * s}c${-1 * s} ${-16 * s} ${3 * s} ${-30 * s} ${17 * s} ${-30 * s}z`, fill: '#9aa1ab', stroke: '#5c626b' });

// Ojo del anzuelo y tanza fina.
const eye = { kind: 'ring', x: 330, y: 150, r: 14, w: 7 };
const hook = { kind: 'path', d: 'M330 164 L330 250 C330 290 280 290 278 255 L278 240 L290 248 L290 256 C292 272 318 272 318 250 L318 164 Z', fill: '#9aa1ab', stroke: '#5c626b' };
const L = { rope: 6, zoom: [1.6, 270, 165] };
const LC = { rope: 6, zoom: [1.6, 285, 165] }; // centro corrido a la derecha para que la argolla quede lejos del borde
const LP = { rope: 8 };

export default {
  prusik: (() => {
    // Estructura leída de la foto del manual («Prusik knot.jpg», Commons; también «Three turn Prusik knot.jpg»):
    // UN solo cordino. Una pata sale por el costado, da vueltas a la cuerda hacia arriba, hace una D por la izquierda
    // (afuera de la cuerda), baja y vuelve con vueltas hacia el medio, donde sale la otra pata. Las dos patas
    // quedan juntas, entre los dos grupos de vueltas, y las vueltas no se cruzan entre sí.
    // Tres vueltas = 7 cruces con la cuerda por grupo, de la D a la pata (y de la pata a la D): ABAJO, ARRIBA, ABAJO, ARRIBA,
    // ABAJO, ARRIBA, ABAJO (4 por detrás, 3 por delante). Empieza y termina por DETRÁS, como el anillo del paso 1.
    const back = (pts) => pts.map(([x, y, zz]) => [x, y, -zz]);
    const cord = ({ n = 3.5, r = 26, pitch = 26, legA = 186, legB = 214 } = {}) => {
      const upA = back(coilV({ x: X, y: legA, n, pitch, r, from: 'right', up: true }));
      const topY = upA[upA.length - 1][1];
      const lowY = legB + n * pitch;
      const upB = back(coilV({ x: X, y: lowY, n, pitch, r, from: 'left', up: true }));
      const dx = X - r - 52;
      return [[X + 150, legA], [X + 100, legA], [X + r + 30, legA], ...upA, [X - r - 14, topY - 12], [dx, topY + 2], [dx - 6, (topY + lowY) / 2], [dx, lowY - 2], [X - r - 14, lowY + 12], ...upB, [X + r + 30, legB], [X + 100, legB], [X + 150, legB]];
    };
    const mainP = { ...B, path: [[200, -20], [200, 200], [200, 420]], end: false };
    const loose = { ...G, path: cord({ r: 30, pitch: 44 }), end: false };
    const tight = { ...G, path: cord({ r: 28, pitch: 34 }), end: false };
    const HQ = { ...HP, height: 400 };
    return [
      // Paso 1: el anillo (dos tramos y el seno a la izquierda) se apoya POR DETRÁS de la cuerda, cruzándola de costado.
      { ...HQ, ropes: [mainP, { ...G, path: [[340, 214], [240, 214], [214, 214, 0], [200, 214, -1], [186, 214, 0], [160, 214], [110, 214], [62, 214], [44, 200], [62, 186], [110, 186], [160, 186], [186, 186, 0], [200, 186, -1], [214, 186, 0], [240, 186], [270, 186], [340, 186]], end: false }] },
      { ...HQ, ropes: [mainP, loose] },
      { ...HQ, ropes: [mainP, tight] },
      { ...HQ, ropes: [mainP, tight], arrows: [[[352, 215], [392, 215]]] },
    ];
  })(),
  machard: (() => {
    // Estructura de las fotos del manual (machard-1 y machard-2): las vueltas suben en espiral alrededor de la cuerda;
    // una pata del anillo sale de la vuelta de abajo y la otra de la de arriba, que baja POR AFUERA de las vueltas
    // (por el costado derecho, sin cruzarlas) hasta juntarse con la primera en el mosquetón.
    // 3,5 vueltas: cuatro pasadas por delante y la última termina a la derecha, del lado por donde baja la pata.
    const coil = coilV({ x: X, y: 270, n: 3.5, pitch: 32, r: 22, up: true });
    const plate = { x: 170, y: 20, w: 60, h: 40, rx: 10, fill: '#c0c4ca', stroke: '#6b7079' };
    const open = { ...G, path: [[175, 335], [180, 296], ...coil, [232, 150], [236, 240], [232, 300], [228, 335]], end: false };
    const clip = { ...G, path: [[195, 308], [180, 296], ...coil, [232, 150], [236, 240], [222, 290], [205, 308]], end: false };
    return [
      { ...HM, ropes: [main, { ...G, path: [[160, 300], [170, 270], [200, 250, -1], [230, 270], [240, 300]], end: false }], poles: [plate] },
      { ...HM, ropes: [main, open], poles: [plate] },
      { ...HM, ropes: [main, clip], poles: [plate, biner(200, 300, 0.7)] },
      { ...HM, ropes: [main, clip], poles: [plate, biner(200, 300, 0.7)], arrows: [[[150, 270], [150, 325]]] },
    ];
  })(),
  klemheist: (() => {
    // Foto del manual (klemheist-1, tres cuadros): el anillo va DOBLE, como cinta de dos hebras que dan las vueltas juntas (en el
    // cuadro 1 se ven las dos hebras en cada vuelta, 3-4 vueltas); arriba queda la gaza (el seno del anillo, un ojo chico) y abajo el
    // seno largo, con las dos hebras juntas, que cuelga. Cuadro 2: el seno largo sube y pasa POR DENTRO de la gaza de arriba
    // (por encima del brazo de abajo y por debajo del de arriba: entra por delante y sale por detrás) y cuadro 3: se tira hacia abajo.
    // Como el anillo es cerrado, una hebra sube enroscando y la otra baja, así que el número de enlace con la cuerda da 0.
    const rB = coilV({ x: X, y: 300, n: 4, pitch: 24, r: 26, from: 'right', up: true });
    const rA = coilV({ x: X, y: 291, n: 4, pitch: 24, r: 26, from: 'right', up: true });
    // Gaza de arriba: sale de las dos hebras (la de abajo hacia la derecha, la otra vuelve por la izquierda).
    const eyeLoop = [[246, 224], [282, 226], [306, 204], [312, 166], [298, 130], [272, 114], [248, 124], [240, 150], [236, 176]];
    const coilRing = [...rB, ...eyeLoop, ...[...rA].reverse()];
    // Patas del seno largo que suben por dentro de la gaza: x = 276 (pata 1, de la hebra de abajo) y 262 (pata 2).
    // z = 1 al cruzar el brazo de abajo de la gaza (pasa por encima); z = -1 al cruzar el de arriba (pasa por debajo).
    const leg1 = (top) => [...top, [276, 106, -1], [276, 128, -1], [276, 152], [276, 180], [276, 214, 1], [276, 232, 1], [276, 262], [270, 292], [250, 300], [238, 300]];
    const leg2 = (top) => [[240, 284], [256, 262], [262, 236, 1], [262, 214, 1], [262, 180], [262, 152], [262, 128, -1], [262, 106, -1], ...top];
    const hangs = [[[276, 362], [268, 332], [248, 306], [238, 300]], [[240, 284], [262, 288], [292, 318], [296, 362]]];
    return [
      { ...HM, ropes: [main, { ...G, path: [...hangs[0], ...coilRing, ...hangs[1]], end: false }] },
      { ...HM, ropes: [main, { ...G, path: [...leg1([[276, -20]]), ...coilRing, ...leg2([[262, -20]])], end: false }], arrows: [[[320, 270], [320, 100]]] },
      { ...HM, ropes: [main, { ...G, path: [[330, 362], [330, 130], [326, 82], [310, 52], [290, 48], ...leg1([[276, 60]]), ...coilRing, ...leg2([[262, 60], [275, 28], [310, 12], [344, 40], [344, 100], [344, 362]])], end: false }], arrows: [[[372, 270], [372, 335]]] },
    ];
  })(),
  bachmann: (() => {
    // Foto del manual (bachmann-1): el anillo colgado del mosquetón da vueltas alrededor de la cuerda y del lomo del
    // mosquetón juntos; la gaza de carga sale de la vuelta de abajo, del mismo lado. 3,5 vueltas: la última termina a
    // la derecha y sube por dentro del mosquetón hasta donde está enganchado, sin cruzar las vueltas.
    // El anillo va DOBLE (cinta de dos hebras que dan las vueltas juntas, una al lado de la otra a lo largo de la cuerda) y su
    // seno enlaza la barra de arriba del mosquetón: una hebra sube por DELANTE de la barra, el seno pasa por encima y la otra
    // baja por DETRÁS. Las dos salen abajo a la izquierda como la gaza de carga.
    const rB = coilV({ x: 205, y: 262, n: 3.5, pitch: 30, r: 34, up: true });
    const rA = coilV({ x: 205, y: 253, n: 3.5, pitch: 30, r: 34, up: true });
    const wrapped = { ...G, path: [[186, 335], [183, 290], ...rB, [246, 150], [246, 128, -1], [246, 108, -1], [242, 88], [236, 80], [230, 88], [230, 108, 1], [231, 128, 1], [234, 140], ...[...rA].reverse(), [158, 262], [156, 300], [160, 360]], end: false };
    return [
      { ...HB, ropes: [main, { ...G, path: [[220, 330], [222, 250], [225, 195], [236, 170, -1], [250, 195], [246, 250], [240, 330]], end: false }], poles: [biner(235, 100)] },
      { ...HB, ropes: [main, wrapped], poles: [biner(235, 100)] },
      { ...HB, ropes: [main, wrapped], poles: [biner(235, 100)], arrows: [[[290, 250], [290, 320]], [[300, 180], [300, 110]]] },
    ];
  })(),
  palomar: (() => {
    // Nudo simple hecho con la tanza doble; el seno (la punta del doble) queda libre y el anzuelo cuelga dentro del nudo.
    const hookAt = (x, y) => [{ kind: 'ring', x: x - 6, y, r: 15, w: 6 }, { kind: 'path', d: `M${x} ${y + 12} L${x} ${y + 95} C${x} ${y + 135} ${x - 50} ${y + 135} ${x - 52} ${y + 100} L${x - 52} ${y + 85} L${x - 40} ${y + 93} L${x - 40} ${y + 101} C${x - 38} ${y + 117} ${x - 12} ${y + 117} ${x - 12} ${y + 95} L${x - 12} ${y + 12} Z`, fill: '#9aa1ab', stroke: '#5c626b' }];
    const oh = move(OHZ, 0, -5);
    // El seno del nudo (la parte de abajo del simple) pasa por el ojo: baja por dentro de la argolla, una pata POR ENCIMA del arco
    // de arriba y la otra POR DEBAJO, y la punta asoma por debajo del arco de abajo (el anzuelo es un poste: queda detrás de lo que tiene z >= 0).
    const lobe = [[185, 245], [196, 268, 1], [205, 292], [214, 308], [222, 292, -1], [231, 266, -1], [238, 243]];
    const a = [...oh.slice(0, 11), ...lobe, ...oh.slice(14, -1)];
    // La tanza doble se dibuja con dos hebras de dos tonos (naranja y ocre) separadas 16 px, para que cada cruce del simple se lea.
    // El seno es la gaza del pliegue de la tanza doble: sale del nudo con las dos hebras juntas y se abre en una gaza ancha
    // (paso 2: colgando a la derecha; paso 3: se baja por encima del anzuelo; paso 4: abraza la pata, debajo del ojo).
    const P = a[a.length - 1];
    const G2 = offset(a, -16);
    const Q = G2[G2.length - 1];
    const O2 = { color: '#d9742c', light: '#f3b985' };
    const knotEnd1 = [[P[0] + 24, P[1] - 4, 1]];
    const dblRopes = (out, tip, back) => [{ ...A, path: [...a, ...knotEnd1, ...out, tip], end: false }, { ...O2, path: [tip, ...back, ...rev(G2)], end: false }];
    // Paso 2-3: gaza abierta colgando a la derecha (hebra de afuera a la derecha, la de adentro por la izquierda).
    const out2 = [[P[0] + 62, P[1] + 22], [P[0] + 92, P[1] + 70], [P[0] + 94, P[1] + 130]];
    const back2 = [[P[0] + 52, P[1] + 128], [P[0] + 42, P[1] + 72], [Q[0] + 38, Q[1] + 32, 1], [Q[0] + 20, Q[1] + 6, 1]];
    const tip2 = [P[0] + 76, P[1] + 160];
    // Paso 4: la gaza pasó por encima del anzuelo y abraza la pata: brazo de abajo por delante, el de arriba por detrás.
    const out4 = [[P[0] + 62, P[1] + 22], [P[0] + 98, P[1] + 90], [356, 312], [300, 372], [214, 370, 1], [186, 364]];
    const back4 = [[180, 356, 0], [214, 350, -1], [296, 346], [334, 300], [338, 210], [328, 150], [Q[0] + 30, Q[1] + 14, 1]];
    return [
      { ...LP, poles: [eye], ropes: [{ ...A, path: [[-20, 140], [200, 140], [300, 142], [322, 140, 1], [345, 150], [322, 160, -1], [300, 158], [200, 160], [-20, 160]], end: false }] },
      { ...LP, height: 400, poles: hookAt(214, 280), ropes: dblRopes(out2, tip2, back2) },
      { ...LP, height: 400, poles: hookAt(214, 280), ropes: dblRopes(out2, tip2, back2), arrows: [[[360, 250], [320, 300], [250, 335]]] },
      { ...LP, height: 400, poles: hookAt(214, 280), ropes: dblRopes(out4, [176, 360], back4), arrows: [[[60, 250], [10, 250]]] },
    ];
  })(),
  clinch: (() => {
    const thru = [[-20, 150], [200, 150], [300, 150], [318, 145, 1], [342, 150], [325, 162, -1], [300, 165]];
    const coil = coilH({ x: 280, y: 150, n: 5, pitch: 28, r: 14, from: 'bottom', left: true });
    // Remate: la punta vuelve por debajo hasta el lazo chico (entre el ojo y la primera vuelta) y lo atraviesa de abajo hacia
    // arriba (por encima de una tanza y por debajo de la otra); da la vuelta arriba y baja DIRECTO por delante, a la derecha del
    // grupo de vueltas, entrando al lazo grande (pasa por delante de las dos tanzas y por detrás de la pasada de abajo).
    const remate = (xe) => [[xe, 182], [xe + 30, 208], [250, 212], [292, 202], [304, 172, 0.5], [304, 150, -0.5], [304, 130], [298, 117], [289, 124], [289, 142, 2], [289, 172, 2], [289, 204, -0.5], [287, 232], [285, 262]];
    const tight = coilH({ x: 274, y: 150, n: 5, pitch: 22, r: 10, from: 'bottom', left: true });
    return [
      { ...LC, poles: [eye, hook], ropes: [{ ...A, path: [...thru, [200, 175], [150, 190]] }] },
      { ...LC, poles: [eye, hook], ropes: [{ ...A, path: [...thru, ...coil, [140, 182]] }] },
      { ...LC, poles: [eye, hook], ropes: [{ ...A, path: [...thru, ...coil, ...remate(140)] }] },
      { ...LC, poles: [eye, hook], ropes: [{ ...A, path: [[-20, 150], [200, 150], [292, 150], [318, 145, 1], [342, 150], [325, 162, -1], [300, 165], [288, 165], ...tight, ...remate(164)] }], arrows: [[[60, 190], [10, 190]]] },
    ];
  })(),
  uni: (() => {
    // Estructura de la foto del manual (uni-1): la punta vuelve junto a la tanza y hace una gaza que se cruza por ENCIMA
    // de las dos tanzas cerca del ojo, con el arco colgando por debajo; ese cruce de la gaza es la PRIMERA pasada de la
    // espiral (por delante); después la punta sigue POR DETRÁS de las dos tanzas y las vueltas las rodean DENTRO de la gaza,
    // alejándose del ojo (sin pico: la punta no sube y baja antes de empezar a enroscar).
    // Las dos tanzas van separadas 32 px (paso de vuelta 40) para que cada cruce se lea.
    const back = (pts) => pts.map(([x, y, zz]) => [x, y, -zz]);
    const LU = { rope: 6, height: 340 };
    const thru = [[-20, 150], [200, 150], [300, 150], [318, 145, 1], [342, 150], [325, 162, -1], [305, 172], [270, 182], [200, 183], [110, 184]];
    const loop = [[60, 186], [28, 206], [24, 240], [60, 262], [130, 268], [210, 266], [274, 256], [292, 220], [285, 188, 1], [282, 150, 1], [274, 132]];
    const coil = back(coilH({ x: 258, y: 166, n: 5, pitch: 34, r: 32, from: 'top', left: true }));
    const end3 = [[80, 122], [74, 98]];
    // Uni apretado: las vueltas abrazan las DOS tanzas (la principal en y = 150 y la que vuelve del ojo en y = 164, paralelas) hasta cerca
    // del ojo. La gaza ya achicada queda a la izquierda y su otra pata vuelve por debajo, sube por delante de las dos tanzas y empieza a enroscar.
    const tight = back(coilH({ x: 268, y: 157, n: 5, pitch: 30, r: 17, from: 'top', left: true }));
    const ret = [[306, 172], [290, 168], [270, 165], [200, 164], [130, 164], [100, 166], [84, 180], [92, 198], [130, 202], [200, 202], [270, 200], [292, 190], [294, 172, 1], [289, 150, 1], [281, 140]];
    return [
      { ...LU, poles: [eye, hook], ropes: [{ ...A, path: [...thru, [90, 184]] }] },
      { ...LU, poles: [eye, hook], ropes: [{ ...A, path: [...thru, ...loop, [262, 120]] }] },
      { ...LU, poles: [eye, hook], ropes: [{ ...A, path: [...thru, ...loop, ...coil, ...end3] }] },
      { ...LU, rope: 5, poles: [eye, hook], ropes: [{ ...A, path: [[-20, 150], [200, 150], [292, 150], [318, 145, 1], [342, 150], [325, 162, -1], ...ret, ...tight, [112, 128], [104, 108]] }], arrows: [[[60, 205], [10, 205]]] },
    ];
  })(),
};
