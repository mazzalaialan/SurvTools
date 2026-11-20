/**
 * Rutas del MISMO sitio que el servidor propio sirve como páginas HTML (no son la app): la ubicación en vivo (`/l/<id>`), la salida compartida
 * (`/o/<id>`) y la API. El service worker de la app responde a toda navegación con la app (`index.html`): sin esta lista, abrir uno de esos enlaces en
 * un teléfono que ya tiene la app instalada o registrada para ese sitio mostraba la app en vez de la página con el recorrido.
 */
export const SERVER_PAGES = /^\/(?:l|o|api)\//;

/** ¿Esta navegación va al servidor (y no a la app)? */
export const isServerPage = (pathname: string): boolean => SERVER_PAGES.test(pathname);
