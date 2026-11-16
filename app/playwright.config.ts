import { defineConfig, devices } from '@playwright/test';

/**
 * El perfil celular corre solo lo que cambia en una pantalla chica o depende
 * de sensores y del tacto (navegación por "Más", brújula, inclinómetro, mapa
 * estelar, cámara, grilla de la huerta, grabar y seguir tracks). El resto es la
 * misma lógica: alcanza con escritorio. Los mapas se dibujan sin placa de video
 * y son lo más lento: solo en escritorio.
 */
const MOBILE_SPECS = /(layout|inventory|compass|declination|inclinometer|starmap|photo|garden|tracks|emergency|topo-print)\.spec\.ts$/;

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'e2e-results',
  timeout: 60_000,
  use: {
    // Chromium completo (no el "headless shell", que bloquea las notificaciones).
    channel: 'chromium',
    baseURL: 'http://localhost:5179',
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
    screenshot: 'only-on-failure',
    // Para ver qué pasó en los que fallan de a ratos (npx playwright show-trace).
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'android', use: { ...devices['Pixel 7'] }, testMatch: MOBILE_SPECS },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: [
    {
      // Build de producción: incluye el service worker real (offline, push, aviso diario).
      // E2E_REUSE_BUILD=1 usa el build que ya está en dist/ (ahorra ~1 minuto si no cambió nada).
      command: `${process.env.E2E_REUSE_BUILD ? '' : 'npx vite build && '}npx vite preview --port 5179 --strictPort`,
      url: 'http://localhost:5179',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // Servidor VikArg real, con base en memoria: cada corrida arranca limpia.
      command: 'node ../server/src/main.ts',
      url: 'http://127.0.0.1:8099/api/health',
      env: { PORT: '8099', HOST: '127.0.0.1', DATA_DIR: ':memory:', DEVICE_REQUESTS_PER_MIN: '100000', DEVICE_FAILURES_PER_10MIN: '100000', LIBRARY_DIR: 'e2e/fixtures/library', LIBRARY_KEY: 'VikArg-prueba' },
      reuseExistingServer: false,
    },
  ],
});
