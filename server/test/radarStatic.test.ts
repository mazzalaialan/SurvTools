import test from 'node:test';
import assert from 'node:assert/strict';
import { packStrong, removeStaticEchoes } from '../src/radar/static.ts';
import { removeStaticFromFrames, type RadarFrame } from '../src/radar/sinarame.ts';
import { encodePng } from '../src/rain/map.ts';
import { decodePng, type Rgba } from '../src/radar/pixels.ts';

const N = 512;
const AZUL: [number, number, number] = [32, 96, 160];
const VERDE: [number, number, number] = [64, 192, 32];

function vacia(): Rgba {
  return { width: N, height: N, data: new Uint8Array(N * N * 4) };
}
/** Mancha azul con un núcleo verde de radio `rv`. */
function mancha(img: Rgba, cx: number, cy: number, r: number, rv: number) {
  for (let y = cy - r; y <= cy + r; y++)
    for (let x = cx - r; x <= cx + r; x++) {
      const dd = Math.hypot(x - cx, y - cy);
      if (dd > r) continue;
      const c = dd <= rv ? VERDE : AZUL;
      const i = (y * N + x) * 4;
      img.data[i] = c[0];
      img.data[i + 1] = c[1];
      img.data[i + 2] = c[2];
      img.data[i + 3] = 255;
    }
}
const alfa = (img: Rgba, x: number, y: number) => img.data[(y * N + x) * 4 + 3]!;

test('quita la mancha cuyo núcleo fuerte está en el mismo lugar en todas las referencias', () => {
  const ahora = vacia();
  mancha(ahora, 200, 200, 30, 15);
  const ref = vacia();
  mancha(ref, 201, 200, 30, 15); // casi igual: se movió un píxel
  const refs = [packStrong(ref), packStrong(ref)];
  const { img, removed } = removeStaticEchoes(ahora, refs);
  assert.ok(removed > 2000);
  assert.equal(alfa(img, 200, 200), 0);
});

test('conserva la mancha que se movió', () => {
  const ahora = vacia();
  mancha(ahora, 200, 200, 30, 15);
  const antes = vacia();
  mancha(antes, 160, 200, 30, 15); // 40 px más atrás: una tormenta que avanza
  const { removed } = removeStaticEchoes(ahora, [packStrong(antes), packStrong(antes)]);
  assert.equal(removed, 0);
});

test('con dos referencias, si en una se movió se conserva', () => {
  const ahora = vacia();
  mancha(ahora, 200, 200, 30, 15);
  const igual = vacia();
  mancha(igual, 200, 200, 30, 15);
  const lejos = vacia();
  mancha(lejos, 120, 200, 30, 15);
  const { removed } = removeStaticEchoes(ahora, [packStrong(igual), packStrong(lejos)]);
  assert.equal(removed, 0);
});

test('una mancha con pocos píxeles fuertes no se juzga', () => {
  const ahora = vacia();
  mancha(ahora, 200, 200, 30, 2); // núcleo de ~13 px
  const { removed } = removeStaticEchoes(ahora, [packStrong(ahora), packStrong(ahora)]);
  assert.equal(removed, 0);
});

test('sin referencias no toca nada', () => {
  const ahora = vacia();
  mancha(ahora, 200, 200, 30, 15);
  assert.equal(removeStaticEchoes(ahora, []).removed, 0);
});

test('removeStaticFromFrames: compara con ±30 y ±60 min, marca las revisadas y deja la imagen si no es fija', () => {
  const fija = vacia();
  mancha(fija, 200, 200, 30, 15);
  const t0 = Date.parse('2026-11-22T12:00:00Z');
  const frames: RadarFrame[] = [0, 10, 20, 30, 40, 50, 60].map((m) => ({
    stamp: String(m),
    at: t0 + m * 60_000,
    png: encodePng(N, N, fija.data),
    strong: packStrong(fija),
  }));
  const q = removeStaticFromFrames(frames);
  assert.ok(q > 0);
  const medio = decodePng(frames[3]!.png)!; // solo tiene referencias a ±30 (una por lado, cuenta como una distancia)
  assert.equal(alfa(medio, 200, 200), 0);
  assert.equal(frames[3]!.staticChecked, undefined); // le falta la de 60: se reintenta en la vuelta siguiente
  // el primero solo tiene referencias hacia adelante (+30 y +60): también se revisa
  assert.equal(frames[0]!.staticChecked, true);
  // el último solo tiene referencias hacia atrás (-30 y -60)
  assert.equal(frames[6]!.staticChecked, true);
});
