import type { CarabinerShape, LockKind } from './carabiners';

/**
 * Dibujo esquemático de un mosquetón (silueta de frente): el lomo grueso a la izquierda y la boca,
 * más fina, a la derecha. Todo en `currentColor` y variables del tema, así sigue el modo oscuro y el
 * rojo nocturno. La traba se dibuja como un manguito sobre la boca.
 */
const BODIES: Record<CarabinerShape, { body: string; gate: string; weight?: number }> = {
  d: {
    body: 'M40 14 H28 Q22 14 22 20 V100 Q22 112 34 112 H46 Q58 112 58 100 L58 70',
    gate: 'M58 70 V28 Q58 17 50 14',
  },
  offset: {
    body: 'M36 14 H30 Q24 14 24 20 V96 Q24 112 42 112 H58 Q82 112 76 90 L58 60',
    gate: 'M58 60 L46 28 Q44 17 40 14',
  },
  pear: {
    body: 'M37 14 Q29 16 25 32 Q10 70 14 92 Q18 112 43 112 Q68 112 72 92 Q76 70 61 44',
    gate: 'M61 44 Q56 24 49 15',
  },
  oval: {
    body: 'M36 12 C22 12 18 34 18 60 C18 86 22 108 40 108 C58 108 62 86 62 60',
    gate: 'M62 60 C62 36 58 14 46 12',
  },
  wide: {
    body: 'M36 12 H27 Q18 12 18 22 V100 Q18 112 30 112 H58 Q72 112 72 98 V64',
    gate: 'M72 64 V28 Q72 16 60 13',
  },
  steel: {
    body: 'M40 14 H28 Q22 14 22 20 V100 Q22 112 34 112 H46 Q58 112 58 100 L58 70',
    gate: 'M58 70 V28 Q58 17 50 14',
    weight: 11,
  },
  key: {
    body: 'M38 40 H34 Q28 40 28 46 V84 Q28 94 36 94 H48 Q58 94 56 84 L55 70',
    gate: 'M55 70 L50 50 Q49 42 45 40',
    weight: 4,
  },
};

export function CarabinerFigure({ shape, lock = 'none', crossed = false, className = 'carabiner-fig' }: { shape: CarabinerShape; lock?: LockKind; crossed?: boolean; className?: string }) {
  const b = BODIES[shape];
  const w = b.weight ?? 7;
  return (
    <svg className={className} viewBox="0 0 84 124" role="img" aria-hidden fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d={b.body} strokeWidth={w} />
      <path d={b.gate} strokeWidth={Math.max(3, w - 3)} />
      {lock !== 'none' && (
        <g strokeWidth={2.5} stroke="var(--accent)">
          <rect x="38" y="8" width="26" height="30" rx="5" fill="var(--surface)" transform="rotate(8 51 23)" />
          {lock === 'screw' && (
            <>
              <path d="M44 17 H58 M44 23 H58 M44 29 H58" transform="rotate(8 51 23)" />
            </>
          )}
          {lock === 'twist' && <path d="M44 24 A7 7 0 1 1 51 31 M47 31 H51 V27" transform="rotate(8 51 23)" />}
          {lock === 'triple' && (
            <>
              <path d="M44 20 A5 5 0 1 1 49 27 M46 27 H49 V24" transform="rotate(8 51 23)" />
              <path d="M57 30 V18 M53 22 L57 18 L61 22" transform="rotate(8 51 23)" />
            </>
          )}
        </g>
      )}
      {crossed && <path d="M10 112 L74 12" stroke="var(--danger)" strokeWidth={6} />}
    </svg>
  );
}
