// Íconos de la app de Android (Capacitor) a partir del logo original (assets-src/logo.jpg), igual que los de la PWA (generate-icons.mjs).
// Genera el ícono ADAPTABLE (emblema sobre el fondo de la marca, dentro de la zona segura) y los clásicos (cuadrado redondeado y redondo, para
// Android 7). Uso: npm run icons:android
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const SRC = 'assets-src/logo.jpg';
const RES = 'android/app/src/main/res';
const BG = '#121a24';
// dp de cada densidad: mdpi 1x, hdpi 1,5x, xhdpi 2x, xxhdpi 3x, xxxhdpi 4x.
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

/** El emblema recortado en círculo, con fondo transparente. */
async function emblem(size) {
  const mask = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`);
  return sharp(SRC).resize(size, size).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
}

for (const [name, k] of Object.entries(DENSITIES)) {
  const dir = `${RES}/mipmap-${name}`;

  // Adaptable: lienzo de 108 dp; la zona segura es un círculo de 66 dp, el emblema ocupa 69 dp.
  const canvas = Math.round(108 * k);
  const inner = Math.round(69 * k);
  await sharp({ create: { width: canvas, height: canvas, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await emblem(inner), gravity: 'center' }])
    .png()
    .toFile(`${dir}/ic_launcher_foreground.png`);

  // Clásico cuadrado redondeado (48 dp): fondo de la marca y el emblema al 80 %.
  const size = Math.round(48 * k);
  const rounded = Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${Math.round(size * 0.22)}"/></svg>`);
  const square = await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: await emblem(Math.round(size * 0.8)), gravity: 'center' }])
    .png()
    .toBuffer();
  await sharp(square).composite([{ input: rounded, blend: 'dest-in' }]).png().toFile(`${dir}/ic_launcher.png`);

  // Clásico redondo: el emblema ocupa todo el círculo.
  await sharp(await emblem(size)).toFile(`${dir}/ic_launcher_round.png`);
}

// Color de fondo del ícono adaptable.
writeFileSync(`${RES}/values/ic_launcher_background.xml`, `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG}</color>\n</resources>\n`);
console.log('Íconos de Android generados en', RES);
