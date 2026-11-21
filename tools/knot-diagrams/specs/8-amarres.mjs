import { A, coilAlong, coilH, coilV } from '../helpers.mjs';

const H = { height: 340 };

/**
 * Ballestrinque verificado (BAAB, refs/ballestrinque.json; el mismo de specs/5-cotes.mjs «cloveParts») sobre un palo.
 * Coordenadas del palo: px = distancia al eje (el firme entra por px < 0, el chicote sale por px > 0), py = a lo largo del palo.
 * Con (cx, cy) el centro, (ux, uy) la dirección del eje del palo y `flip` invierte de qué lado entra el firme.
 * Devuelve { up, down, tuck } ya colocados; el firme llega al primer punto de `up` y el chicote sale por el último de `tuck`.
 */
const cloveAt = (cx, cy, [ux, uy], { r = 30, h = 50, flip = false } = {}) => {
  const f = (a) => (a * h) / 100;
  const raw = {
    up: [[-r, 0, 1], [0, f(-25), 1], [r, f(-50), 1], [r + 7, f(-54)], [0, f(-62), -1], [-r, f(-58), 0]],
    down: [[0, f(-4), 2], [r, f(50), 2], [r + 7, f(54)], [0, f(58), -1], [-r, f(55), 0]],
    tuck: [[0, f(40), 1], [45, f(18), 1]],
  };
  const s = flip ? -1 : 1;
  const put = ([px, py, zz]) => [cx + py * ux + s * px * uy, cy + py * uy - s * px * ux, ...(zz === undefined ? [] : [zz])];
  return { up: raw.up.map(put), down: raw.down.map(put), tuck: raw.tuck.map(put), put };
};
/** Ballestrinque completo (firme + vueltas + chicote). */
const cloveFull = (cx, cy, axis, opts) => {
  const c = cloveAt(cx, cy, axis, opts);
  return [...c.up, ...c.down, ...c.tuck];
};
/** Punta libre con su tapa: una cuerda corta aparte que termina en el extremo (p0) y se pega al inicio de la cuerda principal. */
const tailCap = (p0, p1) => ({ ...A, path: [p1, p0] });

const wood = (x, y, w, h, rotate = 0) => ({ x, y, w, h, rx: Math.min(w, h) / 2.5, rotate });
const VERT = [0, 1], HORIZ = [1, 0];

// ---------------------------------------------------------------------------------------------------------------
// ATADURA CUADRADA (FM 5-125, fig. 2-36, dominio público; fotos de Commons «Lashing square.jpg», CC BY-SA 3.0, y «Square Lashing.jpg», CC BY-SA 4.0).
// Cruz: el palo horizontal queda por delante del vertical (eje x = 200); el horizontal tiene el eje en y = 170.
//  1) Ballestrinque en el palo vertical, justo debajo del cruce.
//  2) Cuatro vueltas completas alrededor de los dos palos: por delante del horizontal a cada lado del vertical, por detrás del vertical
//     arriba y por delante del vertical abajo (así la vuelta abraza al vertical y aprieta al horizontal contra él); cada vuelta
//     queda por fuera de la anterior sobre el horizontal.
//  3) Dos vueltas de ajuste (frapeo): rodean al vertical pegadas al cruce, por dentro de las vueltas: por delante del vertical arriba,
//     por detrás abajo, y por delante del horizontal a los costados.
//  4) Ballestrinque final en el palo OPUESTO al del comienzo (el horizontal), al lado de las vueltas.
// ---------------------------------------------------------------------------------------------------------------
const vert = wood(176, -10, 48, 380);
const horiz = wood(-10, 146, 420, 48);
const CROSS = [vert, horiz]; // el horizontal se dibuja después: queda por delante
const HS = { height: 360 };

const startClove = cloveAt(200, 312, VERT, { r: 32, h: 44 });
// Chicote corto del comienzo (a la izquierda) y salida del ballestrinque hacia la derecha; sube por el costado derecho.
const sqStart = [[134, 316, 0], ...startClove.up, ...startClove.down, ...startClove.tuck, [263, 313], [264, 282], [248, 240], [232, 206]];
// Una vuelta alrededor de los dos palos. i = 0 es la que abraza al cruce; cada una queda por fuera de la anterior.
// Sentido: sube por la derecha, cruza por arriba hacia la izquierda, baja por la izquierda, cruza por abajo hacia la derecha.
// topZ/botZ: profundidad de la parte de arriba y de abajo respecto del palo vertical (-1 detrás, 1 y 2 delante).
const sqTurn = (i, topZ, botZ) => {
  const d = i * 12, R = 232 + d, L = 168 - d, T = 137 - d, B = 203 + d;
  return [[R, B - 6, 0], [R, 170, 1], [R, T + 8, 0], [R - 9, T, topZ], [200, T - 3, topZ], [L + 9, T, topZ], [L, T + 8, 0], [L, 170, 1], [L, B - 6, 0], [L + 9, B, botZ], [200, B + 3, botZ]];
};
// Cuatro vueltas: arriba por detrás del vertical, abajo por delante.
const sqWraps = (n) => Array.from({ length: n }, (_, i) => sqTurn(i, -1, 1)).flat();
// Frapeo (2 vueltas de ajuste), por fuera de las anteriores y con la inclinación contraria: arriba por delante del vertical,
// abajo por detrás; así abrazan las vueltas y las aprietan contra los palos.
const sqFrap = (n, from = 4) => Array.from({ length: n }, (_, j) => sqTurn(from + j, 2, -1)).flat();
const endClove = cloveAt(352, 170, HORIZ, { r: 32, h: 44 });
const sqEnd = [[306, 268, 2], [352, 262, 2], [352, 214], ...endClove.up, ...endClove.down, ...endClove.tuck];
const sqRopes = (...parts) => [{ ...A, path: parts.flat() }, tailCap([134, 316], [150, 316])];

// ---------------------------------------------------------------------------------------------------------------
// ATADURA DE TIJERA (FM 5-125, 2-24/2-25, fig. 2-37, dominio público; Commons «Shear-lashing-2pole.JPG», Lwan98, CC BY-SA 3.0;
// «Shear lashing 0 Thumb.jpg», Zaripov999, CC BY-SA 4.0).
//  1) Los dos palos juntos (un poco separados); ballestrinque en uno, cerca de la punta.
//  2) Ocho vueltas apretadas alrededor de los dos palos.
//  3) Dos vueltas de ajuste (frapeo) ENTRE los palos, alrededor de las vueltas: la cuerda pasa por la rendija, por delante de las vueltas
//     (el tramo vertical que se ve), vuelve por detrás y otra vez por la rendija; se repite.
//  4) Ballestrinque final en el palo OPUESTO al del comienzo.
// ---------------------------------------------------------------------------------------------------------------
const X = [wood(-30, 146, 460, 48, 35), wood(-30, 146, 460, 48, -35)]; // palos en X (diagonal)
const SH = { height: 400 };
const shPoles = [wood(124, -10, 44, 420), wood(232, -10, 44, 420)]; // ejes en x = 146 y 254; rendija de 64 (en la realidad es 1/3 del diámetro: se ensancha para que se vean las dos vueltas de ajuste)
const shClove = cloveAt(146, 100, VERT, { r: 30, h: 50 });
const shStart = [[82, 104, 0], ...shClove.up, ...shClove.down, ...shClove.tuck, [242, 108], [284, 120]];
const shWraps = coilV({ x: 200, y: 120, n: 8, pitch: 15, r: 84, from: 'right' });
// Frapeo: dos vueltas por la rendija, cada una un aro que rodea el atado de vueltas (eje horizontal): la tira de adelante baja (z = 2, por encima de las 8 vueltas) y la
// de atrás sube (z = -2, por debajo), y en cada extremo giran en una U por el borde del atado. Entra por la derecha por debajo del atado, sube por detrás (x = 220),
// baja por delante (x = 206), pasa a la otra vuelta, sube por detrás (x = 194), baja por delante (x = 180) y sale por abajo hacia el palo derecho.
const shFrap = [
  [268, 254, 0], [246, 266, 0], [230, 268, 0],
  [221, 262, -2], [220, 200, -2], [220, 130, -2], [220, 104, -2], [213, 92, 0],
  [206, 104, 2], [206, 200, 2], [206, 254, 2], [200, 268, 0],
  [194, 256, -2], [194, 200, -2], [194, 130, -2], [194, 104, -2], [187, 92, 0],
  [180, 104, 2], [180, 200, 2], [180, 254, 2], [184, 274, 0], [196, 292, 0],
];
const shEndClove = cloveAt(254, 330, VERT, { r: 30, h: 50 });
const shEnd = [[204, 308], [214, 328], ...shEndClove.up, ...shEndClove.down, ...shEndClove.tuck];
const shRopes = (...parts) => [{ ...A, path: parts.flat() }, tailCap([82, 104], [98, 102])];

// ---------------------------------------------------------------------------------------------------------------
// ATADURA DE TRÍPODE (FM 5-125, 5-5/5-6, fig. 5-4; dominio público). Tres palos, el del medio al revés (las puntas del lado contrario).
//  Método II (fig. 5-4 B, la que usa la app): ballestrinque en un palo de afuera y vueltas entretejidas («por encima del palo del medio,
//  por debajo y alrededor del de afuera, por debajo del del medio, por encima y alrededor del primero»: 8 vueltas) y ballestrinque en el
//  palo de afuera. Método I (fig. 5-4 A): 8 vueltas simples, dos vueltas de ajuste entre cada par de palos y ballestrinque en el palo del medio.
//  Lo dibujado: vueltas entretejidas (Método II) + dos vueltas de ajuste en cada hueco (como en el Método I y en las guías de scouts)
//  + ballestrinque final en el OTRO palo de afuera (el FM lo hace así en el Método II; knots3d: «buena forma»).
// ---------------------------------------------------------------------------------------------------------------
const TH = { height: 420 };
// Palos más finos y más separados que antes (ejes en x = 85, 200 y 315, rendijas de 85 px): así en cada hueco entran las cuatro tiras de las dos vueltas de ajuste
// (a 23 px una de otra) y no se pisan ni se cruzan casi paralelas.
const P1 = 85, P2 = 200, P3 = 315, G1 = (P1 + P2) / 2, G2 = (P2 + P3) / 2;
const tri = [wood(P1 - 15, -10, 30, 440), wood(P2 - 15, -10, 30, 440), wood(P3 - 15, -10, 30, 440)];
const trClove = cloveAt(P1, 96, VERT, { r: 30, h: 50 });
// Una vuelta entretejida (FM 5-125, Método II, al pie de la letra): por ENCIMA del palo del medio, por DEBAJO y alrededor del 3.º (de afuera), por DEBAJO del del medio, por ENCIMA y alrededor del 1.º.
const trTurn = (y, first = false) => [
  ...(first ? [] : [[P1, y, -1], [G1, y + 4, -1]]),
  [P2, y, 1], [G2, y + 4, 1], [P3, y, -1], [P3 + 30, y + 8], [P3, y + 12, 1], [G2, y + 9, -1], [P2, y + 12, -1], [G1, y + 9, 1], [P1, y + 12, 1], [P1 - 30, y + 19],
];
const trWeave = (n) => Array.from({ length: n }, (_, i) => trTurn(116 + i * 22, i === 0)).flat();
const trStart = [[15, 104, 0], ...trClove.up, ...trClove.down, ...trClove.tuck];
// Frapeo: dos vueltas en cada hueco. Cada vuelta es un aro que rodea las ocho vueltas: la tira de atrás sube (z = -2, por DEBAJO de todas) y la de adelante baja (z = 2, por ENCIMA
// de todas); en cada hueco las cuatro tiras van a 23 px una de otra, de izquierda a derecha: atrás 1.ª, adelante 1.ª, atrás 2.ª, adelante 2.ª (sin tiras encimadas).
const trRing = (xb, xf) => [[xb, 290, -2], [xb, 200, -2], [xb, 110, -2], [(xb + xf) / 2, 97, 0], [xf, 110, 2], [xf, 200, 2], [xf, 290, 2]];
const [a1, a2, a3, a4] = [108, 131, 155, 178];
const [c1, c2, c3, c4] = [222, 245, 269, 292];
const trFrap = [
  [76, 300, 0], [94, 308, 0], [104, 302, -2],
  ...trRing(a1, a2), [(a2 + a3) / 2, 304, 0], ...trRing(a3, a4), [183, 306, 0], [192, 314, -1], [210, 316, -1], [217, 308, -1], [221, 300, -2],
  ...trRing(c1, c2), [(c2 + c3) / 2, 304, 0], ...trRing(c3, c4),
];
const trEndClove = cloveAt(P3, 352, VERT, { r: 30, h: 50 });
const trEnd = [[296, 312], [292, 332], ...trEndClove.up, ...trEndClove.down, ...trEndClove.tuck];
const trRopes = (...parts) => [{ ...A, path: parts.flat() }, tailCap([15, 104], [33, 102])];

export default {
  'atadura-cuadrada': [
    { ...HS, poles: CROSS, ropes: sqRopes(sqStart, [[232, 200, 1], [232, 150, 1], [232, 100, 1]]), arrows: [[[290, 270], [290, 200]]] },
    { ...HS, poles: CROSS, ropes: sqRopes(sqStart, sqWraps(4)) },
    { ...HS, poles: CROSS, ropes: sqRopes(sqStart, sqWraps(4), sqFrap(2)) },
    { ...HS, poles: CROSS, ropes: sqRopes(sqStart, sqWraps(4), sqFrap(2), sqEnd) },
  ],
  'atadura-tijera': [
    { ...SH, poles: shPoles, ropes: shRopes(shStart.slice(0, -1)) },
    { ...SH, poles: shPoles, ropes: shRopes(shStart, shWraps) },
    { ...SH, poles: shPoles, ropes: shRopes(shStart, shWraps, shFrap, shEnd), arrows: [[[146, 372], [106, 395]], [[254, 372], [294, 395]]] },
  ],
  'atadura-diagonal': (() => {
    // ATADURA DIAGONAL (Commons «Lashing diagonal.jpg», CC BY-SA 3.0/GFDL; guías de scouts y knots3d). Cruz: el palo horizontal queda por delante
    // del vertical (cruce en 200, 170). Cada vuelta es un lazo cerrado alrededor de LOS DOS palos, en un plano que corta el cruce en diagonal:
    // pasa por delante (z 1) a lo largo de una diagonal de la cruz y vuelve por detrás (z -1) por el mismo camino, rodeando el borde del cruce.
    // Las vueltas de una diagonal quedan apiladas una al lado de otra (haz); el segundo haz va por la otra diagonal y cruza al primero casi a 90°.
    const [CX, CY] = [200, 170];
    const R2 = Math.SQRT1_2;
    // Vueltas bien separadas (ronda 3 del crítico): cada tira (de adelante y de atrás de cada vuelta) a 23 px de la siguiente, para contar las tres de cada haz.
    const L = 92, CAP = 16, PITCH = 52, BACK = 26;
    const pole1 = wood(176, -10, 48, 410), pole2 = wood(-10, 146, 420, 48); // el horizontal se dibuja después: queda por delante
    const P = (d, n, e, o, zz) => (zz === undefined ? [CX + e * d[0] + o * n[0], CY + e * d[1] + o * n[1]] : [CX + e * d[0] + o * n[0], CY + e * d[1] + o * n[1], zz]);
    /** Haz de `k` vueltas: s = +1 empieza por el extremo + (la vuelta sale por delante desde ahí), o0 = offset de la primera, paso `dir * PITCH`. */
    const bundle = (d, n, s, o0, dir, k, zf = 1, zb = -1) => {
      const out = [];
      for (let i = 0; i < k; i++) {
        const of = o0 + dir * PITCH * i, ob = of + dir * BACK;
        const onext = o0 + dir * PITCH * (i + 1);
        out.push(P(d, n, s * L, of, zf), P(d, n, 0, of, zf), P(d, n, -s * L, of, zf));
        out.push(P(d, n, -s * (L + CAP), (of + ob) / 2, 0.5));
        out.push(P(d, n, -s * L, ob, zb), P(d, n, 0, ob, zb), P(d, n, s * L, ob, zb));
        if (i < k - 1) out.push(P(d, n, s * (L + CAP), (ob + onext) / 2, 0.5));
      }
      return out;
    };
    const D1 = [R2, -R2], N1 = [R2, R2]; // diagonal 1: abajo-izquierda a arriba-derecha
    const D2 = [R2, R2], N2 = [R2, -R2]; // diagonal 2: arriba-izquierda a abajo-derecha
    const startClove = cloveAt(200, 336, VERT, { r: 32, h: 44 });
    const startRope = [[134, 340, 0], ...startClove.up, ...startClove.down, ...startClove.tuck, [263, 336], [280, 290, 1], [306, 240, 1], [326, 196, 1], [332, 166, 1], [324, 148, 1]];
    const b1 = bundle(D1, N1, 1, 65, -1, 3);
    const link = [P(D1, N1, L + CAP, -65, 0.5), [200, 30, -1], P(D2, N2, -L - CAP, 65, 0.5)];
    // Segundo haz: va por fuera del primero, así que por delante queda encima (z 1,5) y por detrás queda debajo (z -2) de las vueltas del primero.
    const b2 = bundle(D2, N2, -1, 65, -1, 3, 1.5, -2);
    // Ajuste (frapeo): dos vueltas horizontales alrededor del palo vertical y de los dos haces, justo encima del palo horizontal, entre los palos:
    // por delante de todo (z 2) hacia la derecha y por detrás de todo (z -3) de vuelta.
    // Cada vuelta de ajuste es un aro: la tira de adelante (z 2) va hacia la derecha y la de atrás (z -3) vuelve; las cuatro tiras van a 24 px una de otra
    // (adelante 1.ª y 2.ª arriba del todo, atrás debajo de cada una), así no se pisan.
    const fr = (yf, yb, x0 = 100, x1 = 300) => [[x0, yf, 2], [200, yf, 2], [x1, yf, 2], [x1 + 16, (yf + yb) / 2, 0.5], [x1, yb, -3], [200, yb, -3], [x0, yb, -3]];
    const frap = [[108, 168, -1], [96, 156, 0], ...fr(142, 118), [80, 106, 0.5], ...fr(94, 70)];
    // Ballestrinque final en el palo OPUESTO al del comienzo (el horizontal), en su brazo izquierdo, lejos de las vueltas.
    const endClove = cloveAt(46, 170, HORIZ, { r: 28, h: 46, flip: true });
    const fin = [[88, 78, 0], [66, 108, 1], ...endClove.up, ...endClove.down, ...endClove.tuck];
    const mk = (...parts) => ({ height: 420, poles: [pole1, pole2], ropes: [{ ...A, path: parts.flat() }, tailCap([134, 340], [150, 340])] });
    return [
      mk(startRope.slice(0, -1)),
      mk(startRope, b1),
      mk(startRope, b1, link, b2),
      mk(startRope, b1, link, b2, frap),
      mk(startRope, b1, link, b2, frap, fin),
    ];
  })(),
  'atadura-tripode': [
    { ...TH, poles: tri },
    { ...TH, poles: tri, ropes: trRopes(trStart, trWeave(8)) },
    { ...TH, poles: tri, ropes: trRopes(trStart, trWeave(8), trFrap, trEnd), arrows: [[[85, 395], [45, 415]], [[315, 395], [355, 415]]] },
  ],
};
