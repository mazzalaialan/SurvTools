// Íconos de la app de Android (Capacitor) a partir del logo original (assets-src/logo.jpg), igual que los de la PWA (generate-icons.mjs).
// Genera el ícono ADAPTABLE (emblema sobre el fondo de la marca, dentro de la zona segura) y los clásicos (cuadrado redondeado y redondo, para
// Android 7). Los APK de prueba llevan una cinta «APK <versión>» (la versión sale de package.json) para distinguirlos de la app de la tienda.
// Uso: npm run icons:android            (con la cinta, en src/debug/res: solo para los APK de prueba, ignorada por git)
//      npm run icons:android:release    (sin la cinta, en src/main/res: los de la versión de la tienda, los que van en el repositorio)
import sharp from 'sharp';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const SRC = 'assets-src/logo.jpg';
const MAIN_RES = 'android/app/src/main/res';
// Los APK de prueba (build «debug») usan los íconos de src/debug/res, que Android prefiere a los de src/main/res.
const BG = '#121a24';
const release = process.argv.includes('--release');
const RES = release ? MAIN_RES : 'android/app/src/debug/res';
const fullVersion = JSON.parse(readFileSync('package.json', 'utf8')).version;
const version = fullVersion.split('.').slice(0, 2).join('.');

/**
 * Número de compilación: cuántos cambios hay desde la última versión publicada (el commit «Versión x.y.z»). La versión de package.json solo
 * cambia al publicar, así que entre una publicación y otra todos los APK de prueba dirían lo mismo: con este número se distinguen. En una
 * versión recién publicada es 0 y la cinta dice solo «APK 0.88».
 */
function buildNumber() {
  try {
    const last = execSync("git log --grep='^Versión ' --format=%H -1", { encoding: 'utf8' }).trim();
    return last ? Number(execSync(`git rev-list --count ${last}..HEAD`, { encoding: 'utf8' }).trim()) || 0 : 0;
  } catch {
    return 0; // sin git (otra copia del proyecto): solo la versión
  }
}
const build = buildNumber();
const LABEL = build > 0 ? `APK ${version}+${build}` : `APK ${version}`;
// Lo que figura en Ajustes → Aplicaciones del teléfono (lo lee android/app/build.gradle).
writeFileSync('android/app/version-name.txt', build > 0 ? `${fullVersion}+${build}` : fullVersion);
const RIBBON = '#c62828';

/**
 * La cinta con el texto, como imagen del tamaño del lienzo (`canvasDp` dp): su ancho se ajusta al largo del texto entre `minW` y `maxW` dp (el
 * máximo es lo que entra en el círculo visible del lanzador), de alto `h`, centrada en horizontal y con su centro a `cy` dp de arriba. La
 * letra se achica si hace falta para que entre.
 */
function ribbon(canvasDp, k, minW, maxW, h, cy) {
  const px = (dp) => Math.round(dp * k * 100) / 100;
  const size = Math.round(canvasDp * k);
  const glyph = 0.62; // ancho medio de una letra en negrita, en tamaños de letra
  const w = Math.min(maxW, Math.max(minW, LABEL.length * glyph * h * 0.6 + 4));
  const font = Math.min(h * 0.6, (w - 4) / (LABEL.length * glyph));
  return Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect x="${px((canvasDp - w) / 2)}" y="${px(cy - h / 2)}" width="${px(w)}" height="${px(h)}" rx="${px(h * 0.25)}" fill="${RIBBON}"/>` +
      `<text x="${size / 2}" y="${px(cy + font * 0.35)}" text-anchor="middle" font-family="DejaVu Sans, Liberation Sans, Arial, sans-serif" font-weight="700" ` +
      `font-size="${px(font)}" fill="#fff">${LABEL}</text></svg>`,
  );
}

// dp de cada densidad: mdpi 1x, hdpi 1,5x, xhdpi 2x, xxhdpi 3x, xxxhdpi 4x.
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

/** El emblema recortado en círculo, con fondo transparente. */
async function emblem(size) {
  const mask = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`);
  return sharp(SRC).resize(size, size).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
}

for (const [name, k] of Object.entries(DENSITIES)) {
  const dir = `${RES}/mipmap-${name}`;
  mkdirSync(dir, { recursive: true });

  // Adaptable: lienzo de 108 dp; la zona segura es un círculo de 66 dp, el emblema ocupa 69 dp.
  const canvas = Math.round(108 * k);
  const inner = Math.round(69 * k);
  // La cinta va abajo, dentro del círculo visible de 72 dp del lanzador (44 dp de ancho a 76 dp del borde de arriba).
  await sharp({ create: { width: canvas, height: canvas, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await emblem(inner), gravity: 'center' }, ...(release ? [] : [{ input: ribbon(108, k, 44, 54, 13, 76) }])])
    .png()
    .toFile(`${dir}/ic_launcher_foreground.png`);

  // Clásico cuadrado redondeado (48 dp): fondo de la marca y el emblema al 80 %.
  const size = Math.round(48 * k);
  const rounded = Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${Math.round(size * 0.22)}"/></svg>`);
  const square = await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: await emblem(Math.round(size * 0.8)), gravity: 'center' }, ...(release ? [] : [{ input: ribbon(48, k, 38, 46, 11, 40) }])])
    .png()
    .toBuffer();
  await sharp(square).composite([{ input: rounded, blend: 'dest-in' }]).png().toFile(`${dir}/ic_launcher.png`);

  // Clásico redondo: el emblema ocupa todo el círculo.
  await sharp(await emblem(size))
    .composite(release ? [] : [{ input: ribbon(48, k, 30, 38, 10, 37) }])
    .toFile(`${dir}/ic_launcher_round.png`);
}

// Ícono chico de las notificaciones (24 dp): Android lo pinta de una sola tinta, así que tiene que ser una silueta (blanca sobre transparente);
// con el ícono de la app saldría un cuadrado gris. A ese tamaño el emblema no se reconoce: se dibuja un anillo con la estrella de ocho puntas
// del compás. Va siempre en src/main/res: no cambia con la versión.
const STAT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round">
<circle cx="12" cy="12" r="10"/><path d="M12 3.5v17M3.5 12h17M6 6l12 12M18 6L6 18"/></g><circle cx="12" cy="12" r="2.4" fill="#fff"/></svg>`;
for (const [name, k] of Object.entries(DENSITIES)) {
  const size = Math.round(24 * k);
  mkdirSync(`${MAIN_RES}/drawable-${name}`, { recursive: true });
  await sharp(Buffer.from(STAT_SVG), { density: 72 * k }).resize(size, size).png().toFile(`${MAIN_RES}/drawable-${name}/ic_stat_vikarg.png`);
}

// Color de fondo del ícono adaptable.
writeFileSync(`${MAIN_RES}/values/ic_launcher_background.xml`, `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG}</color>\n</resources>\n`);
console.log('Íconos de Android generados en', RES);
