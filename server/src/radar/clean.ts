import type { Rgba } from './pixels.ts';

/**
 * Limpieza del ruido de las imágenes de radar (SINARAME). Dos tipos de ruido que no son lluvia:
 *
 *  1. **Rayas radiales** (el sol entrando por la antena, haces bloqueados, interferencia): cuñas finas y larguísimas que salen del radar hacia
 *     el borde, de eco débil (azul) y sin nada fuerte adentro. La lluvia real no se alinea así con el radar: en coordenadas polares (ángulo,
 *     distancia) una raya es una mancha angosta en ángulo y larga en distancia.
 *  2. **Clutter del centro** (ecos de suelo, edificios, torres): una nube chica pegada al radar, con puntitos fuertes sueltos, que no sigue
 *     hacia afuera. Una lluvia real sobre el radar se conecta con un sistema más grande o trae núcleos intensos.
 *
 * Se aplica una vez por imagen al bajarla (no en cada consulta). No se conoce la escala exacta en dBZ, así que «débil» se decide por el
 * color (azules) y «intenso» por amarillo o rojo. Lo que no se puede clasificar con seguridad se deja: ante la duda, el eco se conserva.
 */

/** El radar está en el centro de la imagen de 512 × 512 (240 km de radio): cada píxel ≈ 0,94 km. */
const MAX_RAYA_ANGULO_BINS = 75; // ancho angular máximo de una raya o cuña (en bins de 1°)
const MIN_RAYA_LARGO_PX = 90; // largo radial mínimo
const MIN_ALARGADA = 1.0; // largo radial / ancho del arco a la distancia media: tiene que ser bastante más larga que ancha
const CENTRO_TOCA_PX = 12; // un componente que llega hasta aquí del radar «toca» el radar
const MAX_RESTOS_AFUERA_PX = 1500; // superficie máxima, fuera del disco del centro, para seguir tratándolo como clutter
const MAX_COSTADOS = 0.35; // fracción tolerada de eco en los costados de una raya (más que eso: es parte de una nube)
const MAX_FUERTES = 0.05; // fracción tolerada de píxeles no débiles adentro (puntitos verdes sueltos de la cuña)
export const CLUTTER_RADIO_PX = 50; // ≈ 47 km: el centro donde se busca clutter, y desde donde se buscan rayas
const DISCO_RADIO_MAX_PX = 135; // ≈ 127 km: un disco de eco débil centrado en el radar que no pasa de aquí es clutter o propagación anómala
const DISCO_COBERTURA_MIN = 0.85; // fracción de los 36 sectores de 10° que ocupa: un disco rodea al radar, la lluvia real casi nunca
const DISCO_MAX_FUERTES = 0.08; // fracción tolerada de píxeles no débiles (puntos verdes sueltos)
const DISCO_MAX_INTENSOS = 100; // píxeles amarillos o rojos tolerados (núcleos fijos chicos) y, además, como mucho el 2 % del área
const BINS = 360;

/** Color débil: azules y turquesas (la lluvia flojísima y el ruido). Verde, amarillo y rojo son «fuertes». */
function esDebil(r: number, g: number, b: number): boolean {
  return r < 100 && b >= g * 0.7;
}

/** Color intenso: amarillo hacia el rojo. Nunca se borra. */
function esIntenso(r: number, _g: number, b: number): boolean {
  return r >= 180 && b < 120;
}

export interface CleanStats {
  rayas: number;
  centro: number;
}

/** Devuelve una copia limpia de la imagen (la original no se toca) y cuántos píxeles se quitaron de cada tipo. */
export function cleanRadarImage(img: Rgba): { img: Rgba; stats: CleanStats } {
  const { width: w, height: h } = img;
  const out = { width: w, height: h, data: new Uint8Array(img.data) };
  const d = out.data;
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const maxR = Math.floor(Math.min(w, h) / 2);
  const stats: CleanStats = { rayas: 0, centro: 0 };

  const occupied = (i: number) => d[i * 4 + 3]! > 0;
  const weak = (i: number) => occupied(i) && esDebil(d[i * 4]!, d[i * 4 + 1]!, d[i * 4 + 2]!);

  // Polar de cada píxel: radio entero y bin de ángulo.
  const radius = new Int16Array(w * h);
  const bin = new Int16Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx;
      const dy = y - cy;
      radius[y * w + x] = Math.round(Math.hypot(dx, dy));
      const a = (Math.atan2(dy, dx) * 180) / Math.PI;
      bin[y * w + x] = Math.floor((a + 360) % 360) % BINS;
    }
  }

  // 1) Rayas: componentes de píxeles débiles más allá del centro, conectados en el plano polar (bin, radio), con vecinos ±1 bin y ±1 radio.
  const R0 = CLUTTER_RADIO_PX;
  const cell = (a: number, r: number) => a * (maxR + 2) + r;
  const grid = new Map<number, number[]>(); // celda polar -> píxeles de la imagen
  for (let i = 0; i < w * h; i++) {
    if (radius[i]! < R0 || radius[i]! > maxR || !occupied(i)) continue;
    const k = cell(bin[i]!, radius[i]!);
    const l = grid.get(k);
    if (l) l.push(i);
    else grid.set(k, [i]);
  }
  // Por cada ángulo, el tramo radial continuo más largo de eco (se toleran huecos de hasta 3 px: las cuñas vienen a rayitas).
  const GAP = 3;
  const tramo: ({ r1: number; r2: number } | null)[] = new Array(BINS).fill(null);
  for (let a = 0; a < BINS; a++) {
    let best: { r1: number; r2: number } | null = null;
    let ini = -1;
    let ult = -1;
    const cierra = () => {
      if (ini >= 0 && ult - ini >= MIN_RAYA_LARGO_PX && (!best || ult - ini > best.r2 - best.r1)) best = { r1: ini, r2: ult };
    };
    for (let r = R0; r <= maxR; r++) {
      if (!grid.has(cell(a, r))) continue;
      if (ini >= 0 && r - ult > GAP + 1) {
        cierra();
        ini = -1;
      }
      if (ini < 0) ini = r;
      ult = r;
    }
    cierra();
    if (best) {
      const t: { r1: number; r2: number } = best;
      // Si adentro hay muchos píxeles fuertes, es lluvia y no una raya.
      let total = 0;
      let fuertes = 0;
      for (let r = t.r1; r <= t.r2; r++) for (const i of grid.get(cell(a, r)) ?? []) (total++, weak(i) || fuertes++);
      if (fuertes <= MAX_FUERTES * total) tramo[a] = t;
    }
  }
  // Grupos de ángulos seguidos con tramo largo (se pasan por alto 2 ángulos sueltos sin tramo): si el grupo es angosto, es raya o cuña.
  let a0 = 0;
  while (a0 < BINS && tramo[a0]) a0++; // empezar en un ángulo sin tramo para no partir un grupo por el cero
  if (a0 < BINS) {
    let i = 0;
    while (i < BINS) {
      const a = (a0 + i) % BINS;
      if (!tramo[a]) {
        i++;
        continue;
      }
      const grupo: number[] = [];
      let sinTramo = 0;
      let j = i;
      while (j < BINS) {
        const aj = (a0 + j) % BINS;
        if (tramo[aj]) {
          grupo.push(aj);
          sinTramo = 0;
        } else if (++sinTramo > 2) break;
        j++;
      }
      const ancho = grupo.length;
      const largoMedio = grupo.reduce((s2, g) => s2 + (tramo[g]!.r2 - tramo[g]!.r1), 0) / ancho;
      const rMedio = grupo.reduce((s2, g) => s2 + (tramo[g]!.r1 + tramo[g]!.r2) / 2, 0) / ancho;
      // Una raya sobresale: a sus costados (3 a 6° más allá) casi no hay eco a esas distancias. Si los costados están llenos, es un sector
      // de una nube grande y se conserva.
      const rA = Math.min(...grupo.map((g) => tramo[g]!.r1));
      const rB = Math.max(...grupo.map((g) => tramo[g]!.r2));
      const primero = grupo[0]!;
      const ultimo = grupo[grupo.length - 1]!;
      let celdas = 0;
      let llenas = 0;
      for (let k = 3; k <= 6; k++) {
        for (const lado of [(primero - k + BINS) % BINS, (ultimo + k) % BINS]) {
          for (let r = rA; r <= rB; r++) {
            celdas++;
            if (grid.has(cell(lado, r))) llenas++;
          }
        }
      }
      const aislada = llenas <= MAX_COSTADOS * celdas;
      if (aislada && ancho <= MAX_RAYA_ANGULO_BINS && largoMedio >= MIN_ALARGADA * ((ancho * Math.PI) / 180) * rMedio) {
        for (const g of grupo) {
          const t = tramo[g]!;
          for (let r = t.r1; r <= t.r2; r++) {
            for (const px of grid.get(cell(g, r)) ?? []) {
              d[px * 4 + 3] = 0;
              stats.rayas++;
            }
          }
        }
      }
      i = j;
    }
  }

  // 2) Clutter del centro: componentes (8 vecinos, en la imagen) que quedaron y no salen del centro ni tienen núcleos intensos.
  const etiqueta = new Int32Array(w * h);
  let n = 0;
  for (let s = 0; s < w * h; s++) {
    if (!occupied(s) || etiqueta[s]) continue;
    n++;
    const pila = [s];
    etiqueta[s] = n;
    const pixeles: number[] = [];
    let rMax = 0;
    let rMin = Infinity;
    let afuera = 0;
    let intenso = false;
    let nIntensos = 0;
    let fuertes = 0;
    const sectores = new Set<number>();
    while (pila.length) {
      const i = pila.pop()!;
      pixeles.push(i);
      if (radius[i]! > rMax) rMax = radius[i]!;
      if (radius[i]! < rMin) rMin = radius[i]!;
      if (radius[i]! > R0 + 2) afuera++;
      if (esIntenso(d[i * 4]!, d[i * 4 + 1]!, d[i * 4 + 2]!)) (intenso = true, nIntensos++);
      if (!esDebil(d[i * 4]!, d[i * 4 + 1]!, d[i * 4 + 2]!)) fuertes++;
      sectores.add(Math.floor(bin[i]! / 10));
      const x = i % w;
      const y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (etiqueta[j] || !occupied(j)) continue;
          etiqueta[j] = n;
          pila.push(j);
        }
      }
    }
    // Chico y pegado al centro: o no sale del disco, o toca el radar y lo que asoma afuera son restos finos de rayas (poca superficie).
    const pegadoAlRadar = rMin <= CENTRO_TOCA_PX && afuera < MAX_RESTOS_AFUERA_PX;
    // Disco centrado: rodea al radar, no pasa de ~127 km, es casi todo débil y casi sin núcleos intensos.
    // Radio que deja afuera el 3 % más lejano: unas rayas finas pegadas al disco no lo convierten en una nube grande.
    const radios = pixeles.map((i) => radius[i]!).sort((a, b) => a - b);
    const radioP97 = radios[Math.floor(0.97 * (radios.length - 1))]!;
    const disco =
      rMin <= CENTRO_TOCA_PX &&
      radioP97 <= DISCO_RADIO_MAX_PX &&
      sectores.size >= DISCO_COBERTURA_MIN * (BINS / 10) &&
      fuertes <= DISCO_MAX_FUERTES * pixeles.length &&
      nIntensos <= Math.min(DISCO_MAX_INTENSOS, 0.02 * pixeles.length);
    if (disco || ((rMax <= R0 + 2 || pegadoAlRadar) && !intenso)) {
      for (const i of pixeles) {
        d[i * 4 + 3] = 0;
        stats.centro++;
      }
    }
  }
  return { img: out, stats };
}
