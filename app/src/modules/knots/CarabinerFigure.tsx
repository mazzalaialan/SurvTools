import type { CarabinerShape, LockKind } from './carabiners';

/**
 * Dibujo esquemático de un mosquetón (silueta de frente): el lomo grueso a la izquierda y la boca,
 * más fina, a la derecha. Todo en `currentColor` y variables del tema, así sigue el modo oscuro y el
 * rojo nocturno. La traba se dibuja como un manguito sobre la boca.
 */
const BODIES: Record<CarabinerShape, { body: string; gate: string; weight?: number; gateWeight?: number }> = {
  // Referencias: fotos de Wikimedia Commons (Klettern karabinerformen / genormte karabinertypen). En todos
  // el lomo es el lado de la izquierda y la boca el de la derecha (bisagra abajo, nariz arriba).
  // La boca es SOLO el tramo recto del lado derecho (~40 % de la altura); arriba el cuerpo termina en la
  // nariz (con un hueco chico) y abajo sigue como cuerpo hasta la bisagra, donde empalma con la boca.
  d: {
    body: 'M65 36 L66 28 Q67 14 50 14 H38 Q20 14 20 34 V94 Q20 112 38 112 H46 Q58 112 59.5 96 L60.5 86',
    gate: 'M64.5 46 L60.5 86',
  },
  offset: {
    body: 'M68 34 Q70 12 50 12 H34 Q20 12 18 32 L26 92 Q28 112 42 112 H48 Q58 112 59 100 L60 90',
    gate: 'M66 44 L60 90',
  },
  // HMS/pera: gota con el lado de la boca recto y el lomo con la curva grande y ancha; angosta en la nariz.
  pear: {
    body: 'M64 34 Q64 12 44 12 C22 12 8 28 14 48 L30 104 Q34 112 44 112 H48 Q58 112 59 100 L60 86',
    gate: 'M64 46 L60 86',
  },
  oval: {
    body: 'M62 38 V32 C62 18 54 12 40 12 C24 12 18 22 18 40 V84 C18 102 24 112 40 112 C54 112 62 106 62 92 V86',
    gate: 'M62 46 V86',
  },
  wide: {
    body: 'M70 36 V32 Q70 14 52 14 H36 Q16 14 16 36 V90 Q16 112 38 112 H50 Q70 112 70 94 V86',
    gate: 'M70 46 V86',
    gateWeight: 9,
  },
  steel: {
    body: 'M65 36 L66 28 Q67 14 50 14 H38 Q20 14 20 34 V94 Q20 112 38 112 H46 Q58 112 59.5 96 L60.5 86',
    gate: 'M64.5 46 L60.5 86',
    weight: 11,
  },
  key: {
    body: 'M50 52 V48 Q50 40 42 40 H38 Q28 40 28 50 V84 Q28 94 38 94 H42 Q50 94 50 86 V80',
    gate: 'M50 58 V80',
    weight: 4,
  },
};

export function CarabinerFigure({ shape, lock = 'none', crossed = false, className = 'carabiner-fig' }: { shape: CarabinerShape; lock?: LockKind; crossed?: boolean; className?: string }) {
  const b = BODIES[shape];
  const w = b.weight ?? 7;
  return (
    <svg className={className} viewBox="0 0 84 124" role="img" aria-hidden fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d={b.body} strokeWidth={w} />
      <path d={b.gate} strokeWidth={b.gateWeight ?? Math.max(3, w - 3)} />
      {lock !== 'none' && (
        <g stroke="var(--accent)" transform="rotate(-6 62 57)">
          <rect x="57.5" y="49" width="9" height="16" rx="2" fill="var(--surface)" strokeWidth={2} />
          {lock === 'screw' && <path d="M58 53 H66 M58 57 H66 M58 61 H66" strokeWidth={1.4} />}
          {lock === 'twist' && <path d="M58.5 63 L65.5 51" strokeWidth={2} />}
          {lock === 'triple' && (
            <>
              <path d="M58.5 63 L65.5 51" strokeWidth={2} />
              {/* Pestaña que sobresale: el seguro extra de la triple acción, visible aun a tamaño chico. */}
              <rect x="66.5" y="54" width="4" height="5" rx="1" fill="var(--accent)" strokeWidth={0.5} />
            </>
          )}
        </g>
      )}
      {crossed && <path d="M10 112 L74 12" stroke="var(--danger)" strokeWidth={6} />}
    </svg>
  );
}
