import { registerPlugin, SystemBars, SystemBarsStyle } from '@capacitor/core';

/**
 * Barras del sistema de Android (app nativa): el fondo que se ve detrás de ellas y el color de sus íconos siguen el tema de la app. Capacitor
 * acomoda la web entre las dos barras y esas franjas muestran el fondo de la ventana, que por defecto es un gris que no combina (y en «Rojo
 * nocturno» deslumbra). El color sale de lo que la app dibuja en el borde de arriba, así sigue a cualquier tema sin listar colores acá.
 */
const SystemColor = registerPlugin<{ setBackground(o: { color: string }): Promise<void> }>('SystemColor');

export interface Rgb {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** `rgb()`, `rgba()` o `color(srgb …)` (como los devuelve `getComputedStyle`) → componentes 0–255 y opacidad 0–1. `null` si no se entiende. */
export function parseCssColor(css: string): Rgb | null {
  const s = css.trim();
  const legacy = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(s);
  if (legacy) return { r: +legacy[1]!, g: +legacy[2]!, b: +legacy[3]!, a: alpha(legacy[4]) };
  const srgb = /^color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/i.exec(s);
  if (srgb) return { r: +srgb[1]! * 255, g: +srgb[2]! * 255, b: +srgb[3]! * 255, a: alpha(srgb[4]) };
  return null;
}

function alpha(v: string | undefined): number {
  if (v === undefined) return 1;
  return v.endsWith('%') ? parseFloat(v) / 100 : parseFloat(v);
}

export function toHex({ r, g, b }: Rgb): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** ¿Es un color oscuro? (luminancia relativa menor que la mitad): ahí los íconos de las barras tienen que ser claros. */
export function isDark({ r, g, b }: Rgb): boolean {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) < 0.4;
}

/** El color de fondo que se ve en el borde de arriba de la pantalla: el del primer elemento con fondo, subiendo desde ese punto. */
export function colorAtTop(doc: Document = document): Rgb | null {
  let el: Element | null = doc.elementFromPoint(Math.floor(window.innerWidth / 2), 2) ?? doc.body;
  while (el) {
    const c = parseCssColor(getComputedStyle(el).backgroundColor);
    if (c && c.a > 0.99) return c;
    el = el.parentElement;
  }
  return null;
}

/**
 * Pone el estilo de los íconos y el fondo de las barras según lo que se ve arriba. El orden importa: `SystemBars.setStyle` de Capacitor deja las
 * barras en su gris de siempre (#303030), así que el color va DESPUÉS. Se reaplica siempre (es barato): Capacitor también puede volver a poner
 * su gris al volver a la app.
 */
export async function syncSystemBars(): Promise<void> {
  const color = colorAtTop();
  if (!color) return;
  try {
    // «Dark» = íconos claros sobre fondo oscuro.
    await SystemBars.setStyle({ style: isDark(color) ? SystemBarsStyle.Dark : SystemBarsStyle.Light });
    await SystemColor.setBackground({ color: toHex(color) });
  } catch {
    /* se reintenta en el próximo cambio */
  }
}

let started = false;

/** Se llama una vez al arrancar la app nativa. Se vuelve a sincronizar al cambiar el tema, de pantalla o al volver a la app. */
export function startSystemBars(): void {
  if (started) return;
  started = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const soon = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void syncSystemBars(), 120);
  };
  new MutationObserver(soon).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
  window.addEventListener('hashchange', soon);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && soon());
  window.addEventListener('load', soon);
  soon();
  // La primera pantalla se dibuja después del arranque: se reintenta un par de veces.
  setTimeout(soon, 600);
  setTimeout(soon, 2000);
}
