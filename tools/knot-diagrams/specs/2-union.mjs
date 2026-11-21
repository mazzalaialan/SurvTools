import { A, B, coilH, flipX, move, overhand } from '../helpers.mjs';

/**
 * Cruces de dos cuerdas que se retuercen (las dos puntas "se rodean"): cada cruce intercambia los lados y
 * `aOver[i]` dice si en el cruce i va arriba la naranja (a) o la azul (b). Un giro completo son dos cruces
 * que alternan (arriba, abajo) a lo largo de cada cuerda. Las cuerdas salen de abajo del lienzo y las puntas
 * terminan arriba. `gap`: distancia vertical entre cruces; `amp`: cuánto se abren a cada lado.
 */
function twist({ H, gap, amp, aOver, tip = 0, lead = 60 }) {
  const n = aOver.length;
  const ys = aOver.map((_, i) => H - 90 - gap * i);
  const mk = (s, mine) => {
    const p = [[200 + s * 150, H + 15], [200 + s * (amp + 40), ys[0] + lead * 0.8]];
    let side = s;
    for (let i = 0; i < n; i++) {
      p.push([200, ys[i], mine(i) ? 0.5 : -0.5]);
      side = -side;
      const ym = i < n - 1 ? (ys[i] + ys[i + 1]) / 2 : ys[i] - gap / 2;
      p.push([200 + side * amp, ym]);
    }
    p.push([200 + side * (amp + 10), ys[n - 1] - gap / 2 - (tip || 70)]);
    return p;
  };
  return { a: mk(-1, (i) => aOver[i]), b: mk(1, (i) => !aOver[i]), ys };
}

/*
 * Rizo terminado (nudo llano), transcripto del cruce a cruce de "Square knot.svg" (CountingPine, dominio
 * público, Wikimedia Commons): dos senos que se enganchan; cada punta sale del mismo lado que su firme.
 * Naranja desde el firme: arriba, abajo, arriba, arriba, abajo, arriba (6 cruces); azul al revés en cada uno.
 * Con las puntas unidas entre sí y los firmes entre sí da el nudo llano (determinante 9).
 */
const dy = 35; // baja la figura para centrarla
const reefRed = [[-20, 152], [119, 152, 0.5], [152, 152], [196, 181, -0.5], [225, 202], [255, 205], [276, 190], [281, 152, 0.5], [281, 75, 0.5], [279, 48], [262, 28], [237, 22], [212, 33, -0.5], [180, 62, -0.5], [152, 75], [119, 75, 0.5], [30, 75]];
const reefBlue = [[420, 152], [281, 152, -0.5], [248, 152], [196, 181, 0.5], [165, 203], [137, 198], [119, 176], [119, 152, -0.5], [119, 75, -0.5], [122, 48], [138, 28], [162, 22], [182, 32, 0.5], [215, 62, 0.5], [248, 75], [281, 75, -0.5], [370, 75]];
const down = (p) => p.map(([x, y, z]) => [x, y + dy, ...(z === undefined ? [] : [z])]);
const reefA = down(reefRed), reefB = down(reefBlue);
// Rizo-1: solo el medio nudo (las tres primeras vueltas del dibujo de arriba) y las dos puntas sueltas hacia arriba.
const halfA = [...reefA.slice(0, 8), [281, 100], [281, 50]];
const halfB = [...reefB.slice(0, 8), [119, 100], [119, 50]];
// Rizo-2: el mismo nudo que rizo-3 pero flojo (más ancho y más alto, las puntas todavía sin tirar).
const loose = (p) => p.map(([x, y, zz]) => [Math.round(200 + (x - 200) * 1.1), Math.round(160 + (y - 160) * 1.18), ...(zz === undefined ? [] : [zz])]);

/*
 * Nudo de cirujano, transcripto de "Chirurgenknoten 08.svg" (Werneuchen, dominio público, Wikimedia Commons), escalado
 * y bajado para encajar en el lienzo. Ocho cruces: desde el firme la roja (aquí naranja) hace O U O U O | O U O y la
 * azul lo contrario; la doble vuelta son los cinco primeros cruces (la naranja los hace en orden 1 a 5, la azul de 5
 * a 1) y el medio nudo opuesto, los tres últimos. Cada cuerda cerrada con las puntas y los firmes unidos da
 * determinante 15 el nudo completo y 5 la doble vuelta sola.
 */
// Se estira (más ancho y mucho más alto) para que cada cruce de la doble vuelta se lea: los puntos son del dibujo original.
// Antes de estirar se intercala un punto Catmull-Rom entre cada par (curvas sin facetas al estirar en vertical).
const cSub = (p) => p.flatMap((q, i) => {
  if (i === p.length - 1) return [q];
  const a = p[Math.max(0, i - 1)], b = q, c = p[i + 1], d = p[Math.min(p.length - 1, i + 2)];
  const m = (k) => Math.round(((-a[k] + 9 * b[k] + 9 * c[k] - d[k]) / 16) * 10) / 10;
  return [q, [m(0), m(1)]];
});
const cDown = (p, k = 1.2, ky = 2, oy = 50) => cSub(p).map(([x, y, zz]) => [Math.round(210 + (x - 210) * k), Math.round((y - 30) * ky + oy), ...(zz === undefined ? [] : [zz])]);
const cirRed = [[92, 164], [91, 139], [103, 124], [119, 118, 1], [138, 112], [159, 133, -1], [180, 143], [213, 122, 1], [231, 112], [261, 133, -1], [278, 143], [293, 137], [295, 123, 1], [298, 108], [301, 89, 1], [297, 73], [272, 59], [241, 58], [205, 65, -1], [169, 84], [119, 85, 1], [94, 83], [61, 43]];
const cirBlue = [[332, 164], [331, 138], [320, 123], [301, 118, -1], [278, 119], [266, 128], [261, 133, 1], [250, 145], [231, 139], [213, 122, -1], [191, 114], [172, 123], [159, 133, 1], [141, 145], [123, 136], [119, 118, -1], [118, 98], [119, 85, -1], [128, 67], [175, 58], [205, 65, 1], [250, 83], [288, 90], [302, 89, -1], [328, 79], [361, 37]];
const cirFirm = (side) => (side === 'a' ? [[88, 250], [88, 215], [90, 185]] : [[326, 250], [327, 215], [330, 188]]);
// Solo la doble vuelta (cinco cruces): las puntas suben sueltas.
const cirTurnA = [...cirFirm('a'), ...cirRed.slice(0, 14), [303, 60]];
const cirTurnB = [...cirFirm('b'), ...cirBlue.slice(0, 16), [118, 60]];

/*
 * Escota doble. Referencias: dibujo de la app escota-doble-1.webp (estilo FM 5-125: la fina entra por debajo de la
 * curva del seno, sube por dentro junto a la curva, pasa por encima de la pata de arriba, da las vueltas por detrás
 * de las DOS patas, a la izquierda de la curva, vuelve por delante de las dos patas y termina pasando por debajo de
 * sí misma), "Sheet bend.svg" y "Double sheet bend.svg" (Lucasbosch, CC BY-SA 3.0) y "Doppelter Schotstek.jpg"
 * (Markus Baerlocher, dominio público). Recorrido de la fina desde el firme, escota simple: abajo (curva), arriba
 * (pata de arriba), abajo (arriba), abajo (abajo), arriba (abajo), arriba (arriba), abajo de sí misma; la doble
 * repite la vuelta (abajo, abajo, arriba, arriba) antes de pasar por debajo de sí misma.
 */
const LT = 115, LB = 205; // patas del seno (arriba / abajo)
// Seno de la cuerda gruesa (naranja): el firme sale por la pata de abajo y la cola termina arriba, con punta visible.
const bight = [[-20, LB], [150, LB], [262, LB + 2], [302, 160], [262, LT - 2], [150, LT], [40, LT]];
// La fina entra por debajo de la curva y sube por dentro del seno, junto a la curva; pasa por encima de la pata de arriba.
const sheetIn = [[420, 262], [350, 246], [318, 222], [292, 188, -0.5], [272, 152], [258, LT, 0.5], [256, 82]];
// Vueltas alrededor de las dos patas (xb: baja por detrás, xf: sube por delante) y el chicote que pasa por debajo de sí misma.
const back = (x) => [[x, LT, -0.5], [x, 160], [x, LB, -0.5]];
const front = (x) => [[x, LB, 0.5], [x, 160], [x, LT, 0.5]];
const bottom = (xb, xf) => [[xb + 1, 225], [xb + 6, 242], [(xb + xf) / 2, 252], [xf - 6, 242], [xf - 1, 225]];
const arcTop1 = (xb) => [[248, 58], [215, 45], [165, 45], [xb + 22, 58], [xb + 2, 84]];
const arcTop2 = (xf, xb) => [[xf, 92], [xf + 6, 78], [(xf + xb) / 2, 72], [xb - 6, 78], [xb, 92]];
const tuck = (x) => [[x, 78, -0.5], [x, 12, -0.5]];
const sheetOne = (xb, xf) => [...sheetIn, ...arcTop1(xb), ...back(xb), ...bottom(xb, xf), ...front(xf), ...tuck(xf)];
const sheetTwo = (xb1, xf1, xb2, xf2) => [...sheetIn, ...arcTop1(xb1), ...back(xb1), ...bottom(xb1, xf1), ...front(xf1), ...arcTop2(xf1, xb2), ...back(xb2), ...bottom(xb2, xf2), ...front(xf2), ...tuck(xf2)];


// Pescador: dos puntas paralelas, cada una con un simple alrededor de la otra.
// Referencia: "Fisherman's knot diagram.png" (Hereford Brooke George, dominio público) y las fotos de la app pescador-1..3.webp.
export default {
  rizo: (() => {
    // Primer medio nudo: derecha sobre izquierda (azul arriba) y vuelta por debajo; segundo, al revés (naranja arriba).
    return [
      { ropes: [{ ...A, path: halfA }, { ...B, path: halfB }], arrows: [[[196, 216], [165, 238], [137, 233], [119, 211], [119, 172]]] },
      { ropes: [{ ...A, path: loose(reefA) }, { ...B, path: loose(reefB) }], arrows: [loose([[205, 92], [248, 110], [281, 110], [325, 110]])] },
      { ropes: [{ ...A, path: reefA }, { ...B, path: reefB }], arrows: [[[75, 187], [30, 187]], [[345, 187], [390, 187]], [[88, 110], [50, 110]], [[312, 110], [350, 110]]] },
    ];
  })(),
  cirujano: (() => {
    // Paso 1: la doble vuelta (cinco cruces); paso 2: lo mismo apretado y con las puntas largas; paso 3: parte del 2 y
    // completa el nudo (los tres cruces del medio nudo opuesto), con la misma escala.
    const T = [0.85, 1.6, 60];
    const pullA = cDown([[88, 200], [88, 246]], ...T), pullB = cDown([[327, 200], [327, 246]], ...T);
    const pull = [pullA, pullB];
    const full = (pts, side) => cDown([...cirFirm(side), ...pts], ...T);
    return [
      { height: 420, ropes: [{ ...A, path: cDown(cirTurnA) }, { ...B, path: cDown(cirTurnB) }], arrows: [cDown([[213, 106], [262, 106], [296, 98], [300, 72]], 1.2, 2)] },
      { height: 420, ropes: [{ ...A, path: cDown(cirTurnA, ...T) }, { ...B, path: cDown(cirTurnB, ...T) }], arrows: pull },
      { height: 420, ropes: [{ ...A, path: full(cirRed, 'a') }, { ...B, path: full(cirBlue, 'b') }], arrows: pull },
    ];
  })(),
  'escota-doble': [
    { ropes: [{ ...A, path: bight }] },
    { ropes: [{ ...A, path: bight }, { ...B, path: sheetIn }], arrows: [[[250, 72], [208, 46], [150, 56], [118, 100], [114, 160]]] },
    { ropes: [{ ...A, path: bight }, { ...B, path: sheetOne(100, 140) }] },
    { ropes: [{ ...A, path: bight }, { ...B, path: sheetTwo(100, 140, 180, 222) }] },
    { ropes: [{ ...A, path: bight }, { ...B, path: sheetTwo(100, 140, 180, 222) }], arrows: [[[60, LB], [25, LB]], [[338, 238], [368, 250]]] },
  ],
  pescador: (() => {
    const oa = overhand({ x: 250, y: 130, k: 0.55 }); // firme naranja en y = 168
    const ob = overhand({ x: 150, y: 168, k: 0.55, mirror: true, flip: true }); // firme azul en y = 130
    const blueLine = [[420, 130], [300, 130], [120, 130], [60, 130]];
    return [
      { ropes: [{ ...A, path: [[-20, 168], [120, 168], [300, 168], [340, 168]] }, { ...B, path: [[420, 130], [280, 130], [100, 130], [60, 130]] }] },
      // Cada punta hace su simple alrededor de la otra cuerda (las flechas van sobre cada nudo, hacia donde pasa la punta).
      { ropes: [{ ...A, path: [[-20, 168], [80, 168], ...oa.path, [330, 90]] }, { ...B, path: [[420, 130], [320, 130], ...ob.path, [70, 208]] }], under: [[253, 130], [111, 168], [214, 130], ...oa.under, ...ob.under],
        arrows: [[[215, 62], [262, 46], [312, 66]], [[185, 236], [138, 252], [88, 232]]] },
      // Las flechas van sobre los firmes: naranja (y = 168) a la izquierda, azul (y = 130) a la derecha.
      { ropes: [{ ...A, path: [[-20, 168], [80, 168], ...oa.path, [330, 90]] }, { ...B, path: [[420, 130], [320, 130], ...ob.path, [70, 208]] }], under: [[253, 130], [111, 168], [214, 130], ...oa.under, ...ob.under],
        arrows: [[[75, 168], [30, 168]], [[345, 130], [392, 130]]] },
    ];
  })(),
  'pescador-doble': (() => {
    /*
     * Cada mitad es un double overhand alrededor de la otra cuerda (control de knots.ts: "dos X de un lado y cuatro trazos
     * paralelos del otro"). Referencias: fotos de la app pescador-doble-2/3.webp, "Double fisherman's knot cordelette.png"
     * (ScrubbedFalcon, CC BY-SA 4.0) y "Noeud de pecheur double serre.jpg" (Malta, CC BY-SA 2.5).
     * Recorrido de la naranja: el firme (y = YS) sigue recto, da una U, da DOS vueltas hacia la izquierda alrededor de tres
     * cuerdas (la azul arriba, su propia punta en el medio y su propio firme abajo; por delante al subir, por detrás al
     * bajar) y la punta vuelve por dentro de las dos vueltas hasta salir a la derecha.
     * Dibujo flojo, visto de frente: las vueltas son anchas (R grande, paso P largo) y las tres cuerdas están a 34 unidades
     * una de otra, así cada pasada cruza en diagonal y las pasadas de adelante y de atrás quedan a más de 2 grosores en cada línea.
     * Cada mitad cerrada sola da determinante 5 y las dos juntas (enlace) 8.
     */
    const W = 700, C = 149, G = 34, R = 78, P = 110, XR = 621, YS = C + G, XL = XR - 2 * P;
    const half = () => {
      // U del firme (a la derecha) hasta el fondo de la primera vuelta.
      const path = [[-20, YS], [XR - 120, YS], [XR - 80, YS], [XR - 40, YS], [XR, YS], [XR + 30, YS + 4], [XR + 44, YS + 20], [XR + 46, (YS + C + R) / 2 + 4], [XR + 36, C + R - 6], [XR + 18, C + R + 1], [XR, C + R]];
      for (let i = 1; i <= 16; i++) {
        const th = (i / 8) * Math.PI * 2, sn = Math.sin(th);
        path.push([XR - P * (th / (2 * Math.PI)), C + R * Math.cos(th), Math.abs(sn) < 1e-9 ? 0 : sn > 0 ? 1 : -1]);
      }
      // U de la punta a la izquierda: sube por fuera de las vueltas, pasa por encima del firme y entra por el medio (y = C).
      path.push([XL - 16, C + R - 4, 0.3], [XL - 36, C + R - 14, 0.3], [XL - 46, YS + 6, 0.3], [XL - 44, YS - 16, 0.3], [XL - 32, C + 6, 0.3], [XL - 16, C, 0.3], [XL, C, 0.3], [XR, C, 0.3], [XR + 60, C, 0.3]);
      return path;
    };
    const a = half();
    const mirror = (p) => p.map(([x, y, zz]) => [W - x, 2 * C - y, ...(zz === undefined ? [] : [zz])]);
    const yb = 2 * C - YS;
    return [
      { width: W, ropes: [{ ...A, path: [[-20, YS], [300, YS], [520, YS], [560, YS]] }, { ...B, path: [[W + 20, yb], [400, yb], [180, yb], [140, yb]] }] },
      { width: W, ropes: [{ ...A, path: a }, { ...B, path: [[W + 20, yb], [450, yb], [250, yb], [19, yb]] }], arrows: [[[610, 44], [520, 30], [430, 44]], [[635, C], [672, C]]] },
      { width: W, ropes: [{ ...A, path: a }, { ...B, path: mirror(a) }], arrows: [[[70, YS], [30, YS]], [[630, yb], [670, yb]]] },
    ];
  })(),
};
