import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanWithSatellite } from '../src/radar/clean.ts';
import { cleanRadarPng } from '../src/radar/sinarame.ts';
import { SAT_BOUNDS, SAT_SIZE, coldMaskOf, FRIO_DILATA_PX, type SatMask, type SatelliteSource } from '../src/radar/satellite.ts';
import { encodePng } from '../src/rain/map.ts';
import { decodePng, type Rgba } from '../src/radar/pixels.ts';

const N = 512;
// Un radar ficticio en el centro de la zona del satélite: sus 512 px caen en un cuadrado de la máscara.
const cLat = (SAT_BOUNDS.north + SAT_BOUNDS.south) / 2;
const cLon = (SAT_BOUNDS.east + SAT_BOUNDS.west) / 2;
const bounds = { south: cLat - 2, north: cLat + 2, west: cLon - 2, east: cLon + 2 };
const AZUL: [number, number, number] = [32, 96, 160];
const ROJO: [number, number, number] = [230, 40, 40];

function vacia(): Rgba {
  return { width: N, height: N, data: new Uint8Array(N * N * 4) };
}
function mancha(img: Rgba, cx: number, cy: number, r: number, c: [number, number, number]) {
  for (let y = cy - r; y <= cy + r; y++)
    for (let x = cx - r; x <= cx + r; x++)
      if (Math.hypot(x - cx, y - cy) <= r) {
        const i = (y * N + x) * 4;
        img.data[i] = c[0];
        img.data[i + 1] = c[1];
        img.data[i + 2] = c[2];
        img.data[i + 3] = 255;
      }
}
/** Máscara de satélite con un cuadrado frío en el píxel de radar (x, y) de lado `lado` (en píxeles de radar). */
function mascara(x: number, y: number, lado: number): SatMask {
  const cold = new Uint8Array(SAT_SIZE * SAT_SIZE);
  const lat = bounds.north - ((y + 0.5) / N) * (bounds.north - bounds.south);
  const lon = bounds.west + ((x + 0.5) / N) * (bounds.east - bounds.west);
  const sx = Math.floor(((lon - SAT_BOUNDS.west) / (SAT_BOUNDS.east - SAT_BOUNDS.west)) * SAT_SIZE);
  const sy = Math.floor(((SAT_BOUNDS.north - lat) / (SAT_BOUNDS.north - SAT_BOUNDS.south)) * SAT_SIZE);
  const k = Math.ceil((lado / N) * (4 / (SAT_BOUNDS.east - SAT_BOUNDS.west)) * SAT_SIZE);
  for (let j = sy - k; j <= sy + k; j++) for (let i = sx - k; i <= sx + k; i++) cold[j * SAT_SIZE + i] = 1;
  return { at: 0, cold };
}
const alfa = (img: Rgba, x: number, y: number) => img.data[(y * N + x) * 4 + 3]!;

test('quita un eco sobre suelo despejado, aunque tenga núcleos intensos', () => {
  const img = vacia();
  mancha(img, 256, 256, 40, AZUL);
  mancha(img, 256, 256, 6, ROJO);
  const { img: out, removed } = cleanWithSatellite(img, bounds, { at: 0, cold: new Uint8Array(SAT_SIZE * SAT_SIZE) });
  assert.ok(removed > 4000);
  assert.equal(alfa(out, 256, 256), 0);
});

test('conserva el eco que tiene nube fría encima', () => {
  const img = vacia();
  mancha(img, 256, 256, 40, AZUL);
  const { removed } = cleanWithSatellite(img, bounds, mascara(256, 256, 60));
  assert.equal(removed, 0);
});

test('solo juzga cada mancha por separado: quita la despejada y deja la nublada', () => {
  const img = vacia();
  mancha(img, 150, 256, 25, AZUL);
  mancha(img, 380, 256, 25, AZUL);
  const { img: out } = cleanWithSatellite(img, bounds, mascara(380, 256, 40));
  assert.equal(alfa(out, 150, 256), 0);
  assert.equal(alfa(out, 380, 256), 255);
});

test('conserva un eco con muchísimos píxeles intensos aunque el satélite no vea nube (tormenta nueva)', () => {
  const img = vacia();
  mancha(img, 256, 256, 30, ROJO); // ~2800 px intensos
  mancha(img, 256, 256, 60, AZUL);
  mancha(img, 256, 256, 30, ROJO);
  const { removed } = cleanWithSatellite(img, bounds, { at: 0, cold: new Uint8Array(SAT_SIZE * SAT_SIZE) });
  assert.equal(removed, 0);
});

test('lo que está fuera de la zona del satélite no se toca', () => {
  const img = vacia();
  mancha(img, 256, 256, 40, AZUL);
  const lejos = { south: -80, north: -76, west: 10, east: 14 };
  const { removed } = cleanWithSatellite(img, lejos, { at: 0, cold: new Uint8Array(SAT_SIZE * SAT_SIZE) });
  assert.equal(removed, 0);
});

test('coldMaskOf: gris claro y colores son frío, el suelo oscuro no, y se agranda', () => {
  const w = SAT_SIZE;
  const sat: Rgba = { width: w, height: w, data: new Uint8Array(w * w * 4) };
  for (let i = 0; i < w * w; i++) sat.data.set([80, 80, 80, 255], i * 4); // suelo
  const c = 600;
  sat.data.set([220, 220, 220, 255], (c * w + c) * 4); // nube fría
  sat.data.set([20, 200, 40, 255], (c * w + 100) * 4); // color: tope muy frío
  const m = coldMaskOf(sat);
  assert.equal(m[c * w + c], 1);
  assert.equal(m[c * w + c + FRIO_DILATA_PX], 1);
  assert.equal(m[c * w + c + FRIO_DILATA_PX + 2], 0);
  assert.equal(m[c * w + 100], 1);
  assert.equal(m[10 * w + 10], 0);
});

test('cleanRadarPng: con satélite que dice «despejado» deja la imagen vacía; sin satélite o si falla, la deja como está', async () => {
  const img = vacia();
  mancha(img, 420, 256, 30, AZUL); // lejos del radar: el filtro del centro no la toca
  const png = encodePng(N, N, img.data);
  const radar = { id: 'RMA1', name: 'x', lat: cLat, lon: cLon };
  const despejado: SatelliteSource = { maskFor: async () => ({ at: 0, cold: new Uint8Array(SAT_SIZE * SAT_SIZE) }) };
  const roto: SatelliteSource = { maskFor: async () => Promise.reject(new Error('sin red')) };
  const nulo: SatelliteSource = { maskFor: async () => null };
  const out = decodePng(await cleanRadarPng(png, { radar, at: 0, satellite: despejado }))!;
  assert.equal(alfa(out, 420, 256), 0);
  for (const sat of [roto, nulo, null]) {
    const igual = decodePng(await cleanRadarPng(png, { radar, at: 0, satellite: sat }))!;
    assert.ok(igual.data.some((v, i) => i % 4 === 3 && v > 0));
  }
});
