// La app nativa (APK) solo trae los datos de Argentina: los de los demás países se bajan al elegirlos (desde la web publicada o desde el servidor
// propio, ver `loadDataFile` en src/modules/emergency/dataFile.ts) y no engordan el APK. Corre después de `cap sync` y poda la copia de `data/`
// que Capacitor dejó dentro del proyecto de Android (`android/app/src/main/assets/public/data`): no toca `dist/` ni `public/data/`.
// Uso: node scripts/prune-native-data.mjs [carpeta-data]
import { readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Qué archivos de `data/` quedan dentro de la app nativa: el índice, lo de Argentina (`*-AR.json`) y lo que usa Argentina o todos los países:
 * ecorregiones, mareas, estaciones del IOC y los parques y repetidoras de Chile (Argentina los muestra cerca de la cordillera).
 */
export function keepInNativeApp(file) {
  return file === 'index.json' || /-AR\.json$/.test(file) || ['ecoregions.json', 'tides.json', 'tides-official.json', 'ioc-stations.json', 'parks-CL.json', 'repeaters-CL.json'].includes(file);
}

export function pruneNativeData(dir) {
  let removed = 0;
  let kept = 0;
  let freed = 0;
  for (const file of readdirSync(dir)) {
    const path = join(dir, file);
    if (!statSync(path).isFile()) continue;
    if (keepInNativeApp(file)) {
      kept++;
      continue;
    }
    freed += statSync(path).size;
    rmSync(path);
    removed++;
  }
  return { removed, kept, freed };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2] ?? 'android/app/src/main/assets/public/data';
  const { removed, kept, freed } = pruneNativeData(dir);
  console.log(`datos de la app nativa: quedan ${kept} archivos (Argentina y compartidos), se sacaron ${removed} (${(freed / 1048576).toFixed(1)} MB sin comprimir)`);
}
