import { A, B, E8, OHZ, coilH, move, offset, rev, scale } from '../helpers.mjs';

// Referencia (ocho-union, nudo-cinta, union-rappel): fotos de la app ocho-union-1/3.webp, nudo-cinta-1.webp y
// union-rappel-1.webp (One_Sided_Overhand_Bend, WikipedianYknOK, CC BY-SA 3.0) y Wikimedia Commons water-loose.jpg
// (nudo de agua, licencia libre). Los recorridos son esquemas propios: cada cuerda sigue el camino de la otra al
// revés, copiando en cada cruce el arriba/abajo de la naranja.

/** Densifica una curva (Catmull-Rom cada `step` px) y reparte la z solo cerca de los puntos que la traen (radio R),
 *  para que el arriba/abajo no cambie de lado al desplazar la copia paralela de la otra cuerda. */
function dense(pts, step = 7, R = 26) {
  const P = [pts[0], ...pts, pts[pts.length - 1]];
  const out = [], ctl = [];
  let s = 0;
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      const q = [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])];
      if (out.length) s += Math.hypot(q[0] - out.at(-1)[0], q[1] - out.at(-1)[1]);
      if (k === 0 && p1[2] !== undefined) ctl.push([s, p1[2]]);
      out.push([q[0], q[1], 0, s]);
    }
  }
  const last = pts[pts.length - 1];
  s += Math.hypot(last[0] - out.at(-1)[0], last[1] - out.at(-1)[1]);
  out.push([last[0], last[1], 0, s]);
  return out.map(([x, y, , ss]) => {
    let best = null;
    for (const [cs, cz] of ctl) if (Math.abs(ss - cs) <= R && (!best || Math.abs(ss - cs) < Math.abs(ss - best[0]))) best = [cs, cz];
    return [x, y, best ? best[1] : 0];
  });
}

const SX = 1.3, DX = 218, DY = -26;
const T = ([x, y, z]) => [Math.round(DX + (x - DX) * SX), y + DY, ...(z === undefined ? [] : [z])];
const WROPE = 11, GAP = 13;
// Mismo recorrido que E8 (helpers), con la gaza chica más redonda para que la copia paralela no haga un pico.
// Cambios respecto de E8: el lado izquierdo de la gaza grande y la diagonal que sube de la gaza chica se cruzan más arriba
// (y ≈ 158 en vez de 182), así sus 4 x 4 copias no se amontonan con las de la base (y ≈ 220).
const e8c = [
  [-20, 220 + DY],
  ...[...E8.slice(1, 9), [186, 76], [163, 112], [168, 150, -0.5], [188, 215, 0.5], [194, 227, 0.5], [208, 246], [216, 272], [202, 300], [178, 310], [152, 300], [140, 274], [146, 247], [151, 227, -0.5], [154, 198], [160, 176, 0.5], [172, 156], [205, 146], ...E8.slice(18, -1)].map(T),
  [372, 130 + DY],
];
const e8 = dense(e8c);
const e8b = offset(rev(e8), GAP);

const bEnd = [420, e8.at(-1)[1] + GAP];
// Cola azul corta: termina con punta visible en x = 36 (no se va por el borde).
const shortTail = (pts) => { const i = pts.findIndex((p) => p[0] < 36); return [...pts.slice(0, i), [36, pts[i][1], pts[i][2]]]; };
const cut = e8b.findIndex((p) => p[0] < 175 && p[1] < 140);

// Nudo de cinta: mismo método con el simple (OHZ): el recorrido de la naranja, la azul lo sigue al revés.
const CY = -15, CX = 1.2, CGAP = 16, CW = 14;
const TC = ([x, y, z]) => [Math.round(215 + (x - 215) * CX), y + CY, ...(z === undefined ? [] : [z])];
const ohc = dense([
  [-20, 210 + CY],
  ...[...OHZ.slice(1, 10), [172, 216, 0.5], [176, 236], [190, 261], [213, 273], [236, 264], [252, 250], [255, 230], [243, 214, -0.5], [232, 190], ...OHZ.slice(15, 17), [281, 101, 0.5]].map(TC),
  [372, 108 + CY],
]);
const ohcb = offset(rev(ohc), CGAP);
const cBeg = [420, ohc.at(-1)[1] + CGAP];
const cCut = ohcb.findIndex((p, i) => i > 30 && p[0] < 175 && p[1] < 130);

const oh = move(OHZ, 20, -30);

// Simple flojo (OHZ con la gaza de abajo más redonda y los cruces de la segunda pasada corridos un poco, para que
// ningún punto de control caiga justo sobre la otra cuerda). `cx`: centro, `fy`: altura del firme, `k`: escala.
const OHR = [[173, 211, -0.5], [227, 208, 0.5], [270, 175], [286, 125], [279, 97, -0.5], [235, 60], [170, 72], [148, 130], [173, 218, 0.5], [179, 240], [191, 263], [213, 273], [237, 262], [248, 240], [236, 216, -0.5], [215, 150], [232, 112], [281, 101, 0.5]];
const simple = (cx, fy, k) => OHR.map(([x, y, zz]) => [cx + (x - 215) * k, fy + (y - 210) * k, zz]);

// Paso 3: el mismo nudo que el paso 2 (mismo lugar y escala de firmes y colas), pero apretado: la gaza más chica.
const r3 = dense([[0, 180], [100, 180], ...simple(235, 180, 0.88), [365, 76]]);
// Paso 4: dos simples seguidos, escalonados (el segundo arranca donde sale la cola del primero); la azul es una copia
// paralela de toda la naranja (misma z), así cada cuerda hace sus dos simples sin enroscarse en la unión.
const K4 = 0.66;
const fy1 = 224, fy2 = fy1 - 113 * K4;
const r4 = dense([[-20, fy1], ...simple(95, fy1, K4), ...simple(218, fy2, K4), [380, fy2 - 113 * K4 + 5]]);

export default {
  'ocho-union': [
    { rope: WROPE, ropes: [{ ...A, path: e8 }] },
    { rope: WROPE, ropes: [{ ...A, path: e8 }, { ...B, path: [bEnd, ...e8b.slice(1, cut)] }], arrows: [[e8b[cut].slice(0, 2).map((v) => Math.round(v)), [135, 60], [165, 14], [245, 10]]] },
    { rope: WROPE, ropes: [{ ...A, path: e8 }, { ...B, path: shortTail([bEnd, ...e8b.slice(1)]) }], arrows: [[[70, 172], [20, 172]], [[355, 84], [392, 84]]] },
  ],
  'nudo-cinta': [
    { rope: CW, ropes: [{ ...A, path: ohc }] },
    { rope: CW, ropes: [{ ...A, path: ohc }, { ...B, path: [cBeg, ...ohcb.slice(1, cCut)] }], arrows: [[ohcb[cCut].slice(0, 2).map(Math.round), [120, 70], [150, 20], [230, 8]]] },
    { rope: CW, ropes: [{ ...A, path: ohc }, { ...B, path: shortTail([cBeg, ...ohcb.slice(1)]) }], arrows: [[[70, 174], [20, 174]], [[340, 72], [392, 72]]] },
  ],
  // Unión para rappel (nudo simple desplazado, «offset overhand bend»): las dos cuerdas van JUNTAS, en el mismo sentido
  // (de izquierda a derecha: los dos firmes a la izquierda, los dos chicotes a la derecha) y se atan con un solo simple.
  // `deducido`: pasos 1, 2 y 4 sin foto propia (ver refs/union-rappel.json).
  'union-rappel': [
    { ropes: [{ ...A, path: [[-20, 180], [250, 180], [330, 180]] }, { ...B, path: [[-20, 200], [250, 200], [330, 200]] }] },
    { ropes: [{ ...A, path: oh }, { ...B, path: offset(oh, -17) }] },
    { ropes: [{ ...A, path: r3 }, { ...B, path: offset(r3, -16) }], arrows: [[[75, 156], [25, 156]], [[325, 52], [385, 52]]] },
    { rope: 12, ropes: [{ ...A, path: r4 }, { ...B, path: offset(r4, -14) }] },
  ],
};
