import type { CapacitorConfig } from '@capacitor/cli';

/**
 * App nativa de Android (y más adelante iPhone) con Capacitor. La app es la misma de la web (`dist/`, construida con la ruta base `/`):
 * los archivos van dentro del paquete, así que no hay service worker (ver docs/PENDIENTES.md, «App nativa»).
 * El identificador se registró en Firebase (proyecto vikarg-survtools): cambiarlo obliga a registrar la app de nuevo.
 */
const config: CapacitorConfig = {
  appId: 'ar.vikarg.survtools',
  appName: 'SurvTools',
  webDir: 'dist',
  plugins: {
    // Los avisos locales (altímetro, lluvia, hora límite) usan el mismo ícono chico y color que los de Firebase.
    LocalNotifications: { smallIcon: 'ic_stat_vikarg', iconColor: '#b87333' },
  },
  android: {
    // Solo https: el servidor propio exige https (excepto pruebas en la red local, que se hacen con otro perfil).
    allowMixedContent: false,
  },
};

export default config;
