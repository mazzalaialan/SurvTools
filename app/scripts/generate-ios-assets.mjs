// Ícono y pantalla de inicio de la app de iPhone (Capacitor) a partir del logo original (assets-src/logo.jpg), igual que los de Android.
// - Ícono: 1024×1024 SIN transparencia (iOS la rechaza); el emblema redondo sobre el fondo de la marca. iOS le pone solo las esquinas redondeadas.
// - Pantalla de inicio: las tres imágenes cuadradas de 2732 px de la plantilla (Splash.imageset), con el emblema al centro.
// Uso: npm run assets:ios
import sharp from 'sharp';
import { existsSync } from 'node:fs';

const SRC = 'assets-src/logo.jpg';
const SET = 'ios/App/App/Assets.xcassets';
const BG = '#121a24';

async function emblem(size) {
  const mask = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`);
  return sharp(SRC).resize(size, size).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
}

async function square(file, size, emblemSize) {
  await sharp({ create: { width: size, height: size, channels: 3, background: BG } })
    .composite([{ input: await emblem(emblemSize), gravity: 'center' }])
    .removeAlpha()
    .png()
    .toFile(`${file}.tmp`);
  await sharp(`${file}.tmp`).toFile(file);
}

if (!existsSync(`${SET}/AppIcon.appiconset`)) throw new Error('Falta el proyecto de iPhone: corré `npx cap add ios` primero.');
await square(`${SET}/AppIcon.appiconset/AppIcon-512@2x.png`, 1024, 800);
let n = 0;
for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  const file = `${SET}/Splash.imageset/${name}`;
  if (!existsSync(file)) continue;
  await square(file, 2732, 900);
  n++;
}
const { rmSync } = await import('node:fs');
for (const f of [`${SET}/AppIcon.appiconset/AppIcon-512@2x.png.tmp`, ...['', '-1', '-2'].map((s) => `${SET}/Splash.imageset/splash-2732x2732${s}.png.tmp`)]) rmSync(f, { force: true });
console.log(`Ícono de iPhone (1024 px, sin transparencia) y ${n} imágenes de pantalla de inicio generados`);
