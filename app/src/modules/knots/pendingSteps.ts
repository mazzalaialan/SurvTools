/**
 * Pasos de nudos con dudas: el dibujo o el texto todavía no se pudieron verificar contra una referencia real legible
 * (foto o diagrama). Se muestra un cartel «pendiente de verificar» en ese paso (ficha y modo práctica). Cuando una
 * persona (guía de montaña) lo revise, se saca el paso de acá y se actualiza docs/PENDIENTES.md.
 * Los números son de paso (empieza en 1); 'all' = todos los pasos del nudo.
 * El detalle de cada duda está en docs/PENDIENTES.md y en tools/knot-diagrams/refs/<id>.json (campos notas/pendiente/deducido).
 */
export const PENDING_STEPS: Record<string, number[] | 'all'> = {
  'ocho-dos-gazas': 'all', // sin referencia legible ni diagrama
  mula: 'all', // bloqueo sin referencia
  'atadura-diagonal': 'all', // arranque (leñador o ballestrinque) y frapeo sin referencia
  'ocho-doble': 'all', // validado solo por topología
  'ocho-gaza': [2, 3],
  'ocho-direccional': [2, 3],
  'as-de-guia-doble': [3],
  mariposa: [2],
  'pescador-doble': [3],
  pescador: [2, 3],
  prusik: [2, 3, 4],
  klemheist: [1, 2, 3],
  bachmann: [2, 3],
  palomar: [2, 3, 4],
  clinch: [3, 4],
  uni: [3, 4],
  camionero: [3, 4],
  cadena: [2, 3, 4],
  guarda: [3, 4],
  'asiento-rappel': [2, 5],
  'silla-bombero': [3],
  cornamusa: [3],
  margarita: [3],
  'atadura-cuadrada': [3],
  'atadura-tripode': [2, 3],
};

/** ¿El paso `n` (desde 1) de este nudo está pendiente de verificar? */
export function isStepPending(knotId: string, n: number): boolean {
  const p = PENDING_STEPS[knotId];
  return p === 'all' || (Array.isArray(p) && p.includes(n));
}
