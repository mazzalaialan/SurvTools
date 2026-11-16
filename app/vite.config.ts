/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { writeFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

// En GitHub Pages la app vive en /<repo>/; el workflow de deploy define BASE_PATH.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    react(),
    VitePWA({
      // 'prompt': la app avisa que hay una versión nueva en lugar de recargar sola.
      registerType: 'prompt',
      // Service worker propio (src/sw.ts): además de offline, recibe push y hace el aviso diario.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        // .mjs: el worker de MapLibre (los mapas tienen que andar sin conexión).
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,webp,woff2,json}'],
        // data/: paquetes por país (Chile, Uruguay); se bajan solo si se elige ese país.
        globIgnores: ['sw.mjs', 'data/**', 'update-info.json'],
        // Peso de cada archivo que se guarda en el teléfono (dist/update-info.json): el service worker lo usa para decir cuánto pesa una
        // actualización antes de bajarla (src/sw.ts, src/app/UpdatePrompt.tsx). Se devuelven las entradas tal cual.
        manifestTransforms: [
          async (entries) => {
            const files: Record<string, number> = {};
            for (const e of entries) files[e.url] = (e as { size?: number }).size ?? 0;
            writeFileSync(fileURLToPath(new URL('./dist/update-info.json', import.meta.url)), JSON.stringify({ version: process.env.npm_package_version ?? '0.0.0', files }));
            return { manifest: entries, warnings: [] };
          },
        ],
      },
      includeAssets: ['favicon.svg', 'brand/*.png'],
      manifest: {
        name: 'Herramientas de Supervivencia por VikArg',
        short_name: 'SurvTools',
        description: 'Hay que estar listo para que no te agarre un imprevisto.',
        lang: 'es',
        theme_color: '#121a24',
        background_color: '#121a24',
        display: 'standalone',
        orientation: 'any',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'brand/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'brand/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'brand/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
  },
});
