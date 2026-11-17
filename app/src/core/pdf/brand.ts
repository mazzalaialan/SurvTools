/** Lo que comparten las hojas PDF de la app (mapa topográfico, lista de compras): fuente, puntos por pulgada y el logo. */
export const PDF_FONT = 'system-ui, "Segoe UI", Roboto, Arial, sans-serif';
export const PDF_DPI = 300;
export const MM_PER_IN = 25.4;
/** Píxeles de la hoja por milímetro. */
export const pxPerMm = PDF_DPI / MM_PER_IN;
export const mmToPx = (v: number): number => v * pxPerMm;

/** Lado (mm) del logo en el encabezado de la hoja. */
export const LOGO_MM = 12;

/** El logo de la app (viaja en la app, sirve sin conexión); si no se puede cargar, la hoja sale sin él. */
export function loadLogo(): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `${import.meta.env.BASE_URL}brand/logo-256.webp`;
  });
}
