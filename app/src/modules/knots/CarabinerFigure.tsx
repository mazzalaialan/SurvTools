import type { CarabinerShape, LockKind } from './carabiners';

/**
 * Dibujo esquemático de un mosquetón (silueta de frente): el lomo grueso a la izquierda y la boca,
 * más fina, a la derecha. Todo en `currentColor` y variables del tema, así sigue el modo oscuro y el
 * rojo nocturno. La traba se dibuja como un manguito sobre la boca.
 */
const BODIES: Record<CarabinerShape, { body: string; gate: string; weight?: number; gateWeight?: number }> = {
  // Referencias: fotos de Wikimedia Commons (Klettern karabinerformen / genormte karabinertypen). En todos
  // el lomo es el lado de la izquierda y la boca el de la derecha (bisagra abajo, nariz arriba).
  d: {
    body: 'M52 14 H40 Q20 14 20 34 V96 Q20 112 36 112 H48 Q58 112 58 102',
    gate: 'M58 102 L66 50 Q68 22 60 15',
  },
  offset: {
    body: 'M46 14 H38 Q18 14 18 38 L22 94 Q23 112 38 112 H46 Q56 112 56 100',
    gate: 'M56 100 L68 52 Q72 24 58 15',
  },
  pear: {
    body: 'M48 13 C26 10 10 28 14 50 C17 68 30 86 36 104 Q39 112 47 111',
    gate: 'M47 111 L70 50 Q76 26 62 15',
  },
  oval: {
    body: 'M38 12 C20 12 18 30 18 60 C18 90 20 108 40 108 C56 108 62 100 62 90',
    gate: 'M62 90 L62 34 C62 18 54 12 46 12',
  },
  wide: {
    body: 'M46 14 H36 Q16 14 16 36 V90 Q16 112 38 112 H56 Q70 112 70 100',
    gate: 'M70 100 L70 36 Q70 20 58 14',
    gateWeight: 9,
  },
  steel: {
    body: 'M52 14 H40 Q20 14 20 34 V96 Q20 112 36 112 H48 Q58 112 58 102',
    gate: 'M58 102 L66 50 Q68 22 60 15',
    weight: 11,
  },
  key: {
    body: 'M46 40 H40 Q28 40 28 50 V84 Q28 94 38 94 H44 Q50 94 50 88',
    gate: 'M50 88 L54 60 Q56 46 50 41',
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
        <g strokeWidth={2.5} stroke="var(--accent)">
          <rect x="48" y="8" width="26" height="30" rx="5" fill="var(--surface)" transform="rotate(6 61 23)" />
          {lock === 'screw' && (
            <>
              <path d="M54 17 H68 M54 23 H68 M54 29 H68" transform="rotate(6 61 23)" />
            </>
          )}
          {lock === 'twist' && <path d="M54 24 A7 7 0 1 1 61 31 M57 31 H61 V27" transform="rotate(6 61 23)" />}
          {lock === 'triple' && (
            <>
              <path d="M54 20 A5 5 0 1 1 59 27 M56 27 H59 V24" transform="rotate(6 61 23)" />
              <path d="M67 30 V18 M63 22 L67 18 L71 22" transform="rotate(6 61 23)" />
            </>
          )}
        </g>
      )}
      {crossed && <path d="M10 112 L74 12" stroke="var(--danger)" strokeWidth={6} />}
    </svg>
  );
}
