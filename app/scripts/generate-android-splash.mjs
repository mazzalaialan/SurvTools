// Pantalla de inicio de la app de Android (Capacitor) con el emblema de la marca, a partir del logo original (assets-src/logo.jpg).
// - Android 12 o más: el sistema muestra un color de fondo y un ícono (`splash_icon.png`, ver values/splash.xml y styles.xml).
// - Android 11 o menos: usa las imágenes `splash.png` de cada tamaño (se regeneran con las medidas de las que ya hay).
// Uso: npm run splash:android
import sharp from 'sharp';
import { readdirSync, existsSync } from 'node:fs';

const SRC = 'assets-src/logo.jpg';
const RES = 'android/app/src/main/res';
const BG = '#121a24';

async function emblem(size) {
  const mask = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`);
  return sharp(SRC).resize(size, size).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
}

// Android 12+: lienzo de 288 dp (a 4x = 1152 px); el sistema recorta en un círculo de 192 dp: el emblema ocupa ese círculo.
await sharp({ create: { width: 1152, height: 1152, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: await emblem(768), gravity: 'center' }])
  .png()
  .toFile(`${RES}/drawable/splash_icon.png`);

// Android 11 o menos: mismas medidas que las imágenes que trae la plantilla.
let count = 0;
for (const dir of readdirSync(RES).filter((d) => /^drawable(-(port|land)-\w+)?$/.test(d))) {
  const file = `${RES}/${dir}/splash.png`;
  if (!existsSync(file)) continue;
  const { width, height } = await sharp(file).metadata();
  const size = Math.round(Math.min(width, height) * 0.55);
  await sharp({ create: { width, height, channels: 3, background: BG } })
    .composite([{ input: await emblem(size), gravity: 'center' }])
    .png()
    .toFile(`${file}.tmp`);
  await sharp(`${file}.tmp`).toFile(file);
  count++;
}
import { rmSync } from 'node:fs';
for (const dir of readdirSync(RES)) rmSync(`${RES}/${dir}/splash.png.tmp`, { force: true });
console.log(`Pantalla de inicio generada: ${count} imágenes y el ícono de Android 12`);
