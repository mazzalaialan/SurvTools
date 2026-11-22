import type { Rgba } from './pixels.ts';

/**
 * Ruido que no se mueve: una tormenta real avanza, un eco de suelo, de relieve o de interferencia queda siempre en el mismo lugar. Se compara
 * cada imagen con las de ±30 y ±60 minutos: si los píxeles «fuertes» (verde, amarillo, rojo) de una mancha vuelven a estar en el mismo
 * lugar en todas, la mancha es fija y se quita. Medido con cuadros reales (2026-11-22): el ruido repite el 92 a 97 % de sus píxeles fuertes
 * una hora después; una tormenta real (Mar del Plata), el 45 %.
 */

export const STATIC_MIN_OVERLAP = 0.8; // fracción de píxeles fuertes que tiene que repetirse en cada imagen de referencia
export const STATIC_MIN_OVERLAP_ONE = 0.85; // si solo hay una referencia se pide más
export const STATIC_MIN_STRONG_PX = 30; // una mancha con menos píxeles fuertes no se juzga

/** Un píxel es «fuerte» si no es del azul/turquesa de la lluvia flojísima. */
function esFuerte(r: number, g: number, b: number): boolean {
  return !(r < 100 && b >= g * 0.7);
}

/** Mapa de bits (1 bit por píxel) de los píxeles fuertes de la imagen tal como llegó del servicio. */
export function packStrong(img: Rgba): Uint8Array {
  const n = img.width * img.height;
  const bits = new Uint8Array((n + 7) >> 3);
  for (let i = 0; i < n; i++) {
    if (img.data[i * 4 + 3]! > 0 && esFuerte(img.data[i * 4]!, img.data[i * 4 + 1]!, img.data[i * 4 + 2]!)) bits[i >> 3]! |= 1 << (i & 7);
  }
  return bits;
}

const bit = (bits: Uint8Array, i: number) => (bits[i >> 3]! >> (i & 7)) & 1;

/** ¿Hay un píxel fuerte en `ref` en (x, y) o a un píxel de distancia? */
function cerca(ref: Uint8Array, x: number, y: number, w: number, h: number): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < w && ny < h && bit(ref, ny * w + nx)) return true;
    }
  }
  return false;
}

/** Quita de la imagen las manchas cuyos píxeles fuertes se repiten en todas las referencias. Devuelve una copia y los píxeles quitados. */
export function removeStaticEchoes(img: Rgba, refs: Uint8Array[]): { img: Rgba; removed: number } {
  const { width: w, height: h } = img;
  const out = { width: w, height: h, data: new Uint8Array(img.data) };
  if (!refs.length) return { img: out, removed: 0 };
  const d = out.data;
  const minOverlap = refs.length === 1 ? STATIC_MIN_OVERLAP_ONE : STATIC_MIN_OVERLAP;
  const etiqueta = new Int32Array(w * h);
  let removed = 0;
  let n = 0;
  for (let s0 = 0; s0 < w * h; s0++) {
    if (d[s0 * 4 + 3]! === 0 || etiqueta[s0]) continue;
    n++;
    const pila = [s0];
    etiqueta[s0] = n;
    const pixeles: number[] = [];
    const repite = new Array<number>(refs.length).fill(0);
    let fuertes = 0;
    while (pila.length) {
      const i = pila.pop()!;
      pixeles.push(i);
      const x = i % w;
      const y = (i - x) / w;
      if (esFuerte(d[i * 4]!, d[i * 4 + 1]!, d[i * 4 + 2]!)) {
        fuertes++;
        for (let k = 0; k < refs.length; k++) if (cerca(refs[k]!, x, y, w, h)) repite[k]!++;
      }
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (etiqueta[j] || d[j * 4 + 3]! === 0) continue;
          etiqueta[j] = n;
          pila.push(j);
        }
      }
    }
    if (fuertes < STATIC_MIN_STRONG_PX) continue;
    if (repite.every((r) => r / fuertes >= minOverlap)) {
      for (const i of pixeles) {
        d[i * 4 + 3] = 0;
        removed++;
      }
    }
  }
  return { img: out, removed };
}
