import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanRadarImage, CLUTTER_RADIO_PX } from '../src/radar/clean.ts';
import type { Rgba } from '../src/radar/pixels.ts';

const N = 512;
const AZUL: [number, number, number] = [32, 96, 160];
const VERDE: [number, number, number] = [64, 192, 32];
const ROJO: [number, number, number] = [230, 40, 40];

function vacia(): Rgba {
  return { width: N, height: N, data: new Uint8Array(N * N * 4) };
}
function pinta(img: Rgba, x: number, y: number, c: [number, number, number]) {
  const i = (y * N + x) * 4;
  img.data[i] = c[0];
  img.data[i + 1] = c[1];
  img.data[i + 2] = c[2];
  img.data[i + 3] = 255;
}
const alfa = (img: Rgba, x: number, y: number) => img.data[(y * N + x) * 4 + 3]!;

/** Pinta un disco (o un círculo) en la imagen. */
function disco(img: Rgba, cx: number, cy: number, r: number, c: [number, number, number]) {
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if (Math.hypot(x - cx, y - cy) <= r) pinta(img, x, y, c);
}

test('quita una cuña azul larga que sale del radar', () => {
  const img = vacia();
  const c = (N - 1) / 2;
  // Cuña de 8° hacia el este, desde 60 hasta 230 px.
  for (let r = 60; r <= 230; r++) for (let a = -4; a <= 4; a += 0.25) pinta(img, Math.round(c + r * Math.cos((a * Math.PI) / 180)), Math.round(c + r * Math.sin((a * Math.PI) / 180)), AZUL);
  const { img: out, stats } = cleanRadarImage(img);
  assert.ok(stats.rayas > 1000);
  assert.equal(alfa(out, Math.round(c + 150), Math.round(c)), 0);
});

test('conserva una nube grande de eco débil', () => {
  const img = vacia();
  disco(img, 330, 256, 90, AZUL);
  const { img: out, stats } = cleanRadarImage(img);
  assert.equal(stats.rayas, 0);
  assert.equal(alfa(out, 330, 256), 255);
});

test('conserva lluvia intensa aunque sea una franja angosta y radial', () => {
  const img = vacia();
  const c = (N - 1) / 2;
  for (let r = 60; r <= 230; r++) for (let a = -3; a <= 3; a += 0.25) pinta(img, Math.round(c + r * Math.cos((a * Math.PI) / 180)), Math.round(c + r * Math.sin((a * Math.PI) / 180)), r % 3 ? VERDE : AZUL);
  const { stats } = cleanRadarImage(img);
  assert.equal(stats.rayas, 0);
});

test('quita la nube chica del centro con puntitos verdes', () => {
  const img = vacia();
  const c = (N - 1) / 2;
  disco(img, Math.round(c), Math.round(c), 30, AZUL);
  pinta(img, Math.round(c) + 5, Math.round(c) + 3, VERDE);
  const { img: out, stats } = cleanRadarImage(img);
  assert.ok(stats.centro > 1000);
  assert.equal(alfa(out, Math.round(c) + 5, Math.round(c) + 3), 0);
});

test('conserva el centro si trae un núcleo intenso', () => {
  const img = vacia();
  const c = Math.round((N - 1) / 2);
  disco(img, c, c, 30, AZUL);
  disco(img, c + 8, c + 3, 8, ROJO); // núcleo grande: más de 100 píxeles intensos
  const { img: out, stats } = cleanRadarImage(img);
  assert.equal(stats.centro, 0);
  assert.equal(alfa(out, c, c), 255);
});

test('quita un disco azul centrado de ~85 km con restos de rayas finas', () => {
  const img = vacia();
  const c = Math.round((N - 1) / 2);
  disco(img, c, c, CLUTTER_RADIO_PX + 40, AZUL);
  pinta(img, c + 20, c + 10, VERDE);
  for (let r = 100; r < 240; r++) pinta(img, c + r, c, AZUL); // raya fina pegada al disco
  const { img: out, stats } = cleanRadarImage(img);
  assert.ok(stats.centro > 5000);
  assert.equal(alfa(out, c + 20, c + 10), 0);
  assert.equal(alfa(out, c + 200, c), 0);
});

test('conserva una nube azul grande centrada que llega más allá de ~127 km', () => {
  const img = vacia();
  const c = Math.round((N - 1) / 2);
  disco(img, c, c, 170, AZUL);
  const { stats } = cleanRadarImage(img);
  assert.equal(stats.centro, 0);
});

test('no modifica la imagen original', () => {
  const img = vacia();
  disco(img, 256, 256, 20, AZUL);
  const antes = new Uint8Array(img.data);
  cleanRadarImage(img);
  assert.deepEqual(img.data, antes);
});
