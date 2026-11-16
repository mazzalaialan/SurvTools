/** Colores por período geológico (paleta de la Comisión Internacional de Estratigrafía, suavizada) para pintar el mapa. */
export const PERIODS: [string, string][] = [
  ['Holoceno', '#f6e8a0'],
  ['Pleistoceno', '#f9f0a8'],
  ['Cuaternario', '#f9f27f'],
  ['Neógeno', '#ffe619'],
  ['Plioceno', '#ffee66'],
  ['Mioceno', '#ffe94d'],
  ['Paleógeno', '#fd9a52'],
  ['Oligoceno', '#fdb46c'],
  ['Eoceno', '#fda75f'],
  ['Paleoceno', '#fdc07a'],
  ['Cretácico', '#7fc64e'],
  ['Jurásico', '#34b2c9'],
  ['Triásico', '#a064a8'],
  ['Pérmico', '#f04028'],
  ['Carbonífero', '#67a599'],
  ['Devónico', '#cb8c37'],
  ['Silúrico', '#b3e1b6'],
  ['Ordovícico', '#009270'],
  ['Cámbrico', '#7fa056'],
  ['Proterozoico', '#f73563'],
  ['Neoproterozoico', '#fea8a8'],
  ['Mesoproterozoico', '#fdb462'],
  ['Paleoproterozoico', '#f7677e'],
  ['Arqueano', '#f0047f'],
];
const OTHER = '#bdbdbd';
/** Color del período más joven que nombra la edad («Proterozoico superior» → Proterozoico). */
export function periodColor(age: string | null | undefined): string {
  const a = String(age ?? '').toLowerCase();
  if (!a) return OTHER;
  // «Neoproterozoico» antes que «Proterozoico»: el más específico primero.
  const hit = [...PERIODS].sort((x, y) => y[0].length - x[0].length).find(([n]) => a.includes(n.toLowerCase()));
  return hit ? hit[1] : OTHER;
}
