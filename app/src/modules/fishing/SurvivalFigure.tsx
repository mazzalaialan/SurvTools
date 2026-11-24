import type { CSSProperties, ReactNode } from 'react';

/**
 * Diagramas esquemáticos propios para «Pesca de supervivencia» (uno por técnica de survival.ts).
 * Todo en currentColor y variables del tema, sin textos largos: los pasos los explica la lista.
 */

const WATER = 'color-mix(in srgb, var(--info) 22%, var(--surface))';
const WATER_DEEP = 'color-mix(in srgb, var(--info) 40%, var(--surface))';
const FISH_FILL = 'color-mix(in srgb, var(--accent) 45%, var(--surface))';
const LINE: CSSProperties = { stroke: 'currentColor', fill: 'none', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
const THIN: CSSProperties = { ...LINE, strokeWidth: 1.2 };
const ACC: CSSProperties = { ...LINE, stroke: 'var(--accent)', strokeWidth: 2.5 };
const MUTED: CSSProperties = { stroke: 'var(--text-muted)', fill: 'none', strokeWidth: 1.4, strokeLinecap: 'round', strokeDasharray: '4 4' };

function Svg({ h, children }: { h: number; children: ReactNode }) {
  return (
    <svg className="survival-figure" viewBox={`0 0 360 ${h}`} role="img" aria-hidden="true" focusable="false" style={{ color: 'var(--text)' }}>
      {children}
    </svg>
  );
}

function Txt({ x, y, children, anchor = 'start', bold = false }: { x: number; y: number; children: ReactNode; anchor?: 'start' | 'middle' | 'end'; bold?: boolean }) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontSize="12" fontWeight={bold ? 700 : 400} style={{ fill: bold ? 'var(--text)' : 'var(--text-muted)' }}>
      {children}
    </text>
  );
}

function Num({ x, y, n }: { x: number; y: number; n: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r="10" style={{ fill: 'var(--accent)' }} />
      <text x={x} y={y + 4} textAnchor="middle" fontSize="12" fontWeight={700} style={{ fill: 'var(--surface)' }}>
        {n}
      </text>
    </g>
  );
}

/** Pez de costado, nariz a la izquierda, de ~34 px de largo. */
function Fish({ x, y, s = 1, flip = false, rot = 0 }: { x: number; y: number; s?: number; flip?: boolean; rot?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${flip ? -s : s} ${s})`}>
      <path d="M-17,0 C-9,-8 5,-8 12,0 C5,8 -9,8 -17,0Z M11,0 L20,-6 L20,6Z" style={{ ...LINE, strokeWidth: 1.6 / s, fill: FISH_FILL }} />
      <circle cx="-11" cy="-1.5" r="1.3" style={{ fill: 'currentColor' }} />
    </g>
  );
}

function Arrow({ x1, y1, x2, y2, style = THIN }: { x1: number; y1: number; x2: number; y2: number; style?: CSSProperties }) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const hx = (d: number) => x2 - 7 * Math.cos(a + d);
  const hy = (d: number) => y2 - 7 * Math.sin(a + d);
  return (
    <path d={`M${x1},${y1} L${x2},${y2} M${hx(0.45)},${hy(0.45)} L${x2},${y2} L${hx(-0.45)},${hy(-0.45)}`} style={style} />
  );
}

function Stones({ pts, r = 6 }: { pts: [number, number][]; r?: number }) {
  const out: ReactNode[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i]!;
    const [bx, by] = pts[i + 1]!;
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / (r * 1.7)));
    for (let k = 0; k < n; k++) {
      const x = ax + ((bx - ax) * k) / n;
      const y = ay + ((by - ay) * k) / n;
      out.push(<circle key={`${i}-${k}`} cx={x} cy={y} r={r - (k % 2)} style={{ ...THIN, fill: 'var(--surface)', strokeWidth: 1.6 }} />);
    }
  }
  return <g>{out}</g>;
}

/* ---------------------------------------------------------------- dónde pescar */
function Where() {
  return (
    <Svg h={290}>
      <Txt x={6} y={14} bold>Río, visto desde arriba</Txt>
      <path d="M0,28 C100,28 160,38 210,72 C250,100 300,110 360,110 L360,154 C280,154 205,150 175,120 C140,86 95,78 0,78Z" style={{ fill: WATER }} />
      <path d="M0,28 C100,28 160,38 210,72 C250,100 300,110 360,110" style={LINE} />
      <path d="M0,78 C95,78 140,86 175,120 C205,150 280,154 360,154" style={LINE} />
      {/* corriente */}
      <Arrow x1={14} y1={52} x2={60} y2={52} style={MUTED} />
      <Arrow x1={300} y1={130} x2={344} y2={132} style={MUTED} />
      {/* 1 pozón en la curva */}
      <ellipse cx="186" cy="102" rx="24" ry="15" transform="rotate(35 186 102)" style={{ fill: WATER_DEEP, stroke: 'var(--info)', strokeWidth: 1.4 }} />
      <Fish x={186} y={102} s={0.8} rot={35} />
      <Txt x={226} y={138}>pozón</Txt>
      {/* 2 abajo de una roca */}
      <ellipse cx="62" cy="40" rx="11" ry="9" style={{ ...LINE, fill: 'var(--surface)' }} />
      <Fish x={96} y={42} s={0.8} flip />
      <Txt x={80} y={68}>roca</Txt>
      {/* 4 corriente rápida junto a agua quieta */}
      <path d="M112,52 H150 M116,60 H158" style={{ ...LINE, stroke: 'var(--info)' }} />
      <path d="M126,76 q6,-6 12,0 t12,0" style={{ ...LINE, stroke: 'var(--info)', strokeWidth: 1.4 }} />
      <Fish x={122} y={69} s={0.7} />
      <Txt x={10} y={112}>corriente rápida junto</Txt>
      <Txt x={10} y={126}>a agua quieta</Txt>
      <path d="M60,100 L114,76" style={THIN} />
      {/* 3 tronco caído */}
      <path d="M312,98 L268,134" style={{ ...LINE, strokeWidth: 9, stroke: 'var(--text-muted)' }} />
      <path d="M312,98 L268,134" style={{ ...LINE, strokeWidth: 3, stroke: 'var(--surface)' }} />
      <Fish x={252} y={142} s={0.8} />
      <Txt x={298} y={148}>tronco</Txt>
      <path d="M0,170 H360" style={{ stroke: 'var(--border)', strokeWidth: 1 }} />
      {/* lago */}
      <Txt x={6} y={190} bold>Lago</Txt>
      <path d="M0,216 C60,204 140,210 200,204 C280,198 330,206 360,214 V290 H0Z" style={{ fill: WATER }} />
      <path d="M0,216 C60,204 140,210 200,204 C280,198 330,206 360,214" style={LINE} />
      <path d="M232,176 H276 L284,206 H224Z" style={{ fill: WATER }} />
      <path d="M232,176 L224,206 M276,176 L284,206" style={LINE} />
      <Arrow x1={254} y1={180} x2={254} y2={202} style={MUTED} />
      <Fish x={254} y={226} s={0.8} rot={90} />
      <Fish x={218} y={236} s={0.8} rot={60} />
      <Fish x={292} y={236} s={0.8} rot={120} />
      <Txt x={216} y={196} anchor="end">boca del arroyo</Txt>
    </Svg>
  );
}

/* ---------------------------------------------------------- anzuelos improvisados */
function Hooks() {
  return (
    <Svg h={205}>
      <path d="M120,12 V190 M240,12 V190" style={{ stroke: 'var(--border)', strokeWidth: 1, strokeDasharray: '3 5' }} />
      <Num x={14} y={16} n={1} />
      <Num x={134} y={16} n={2} />
      <Num x={254} y={16} n={3} />
      {/* 1: alfiler o alambre en J */}
      <path d="M62,24 V118 C62,158 22,158 24,118 L34,102" style={{ ...LINE, strokeWidth: 4 }} />
      <path d="M34,102 L40,112" style={{ ...LINE, strokeWidth: 3, stroke: 'var(--accent)' }} />
      <circle cx="62" cy="24" r="5" style={LINE} />
      <Txt x={60} y={188} anchor="middle">alambre en J</Txt>
      {/* 2: espina atada a un palito */}
      <path d="M180,26 V138" style={{ ...LINE, strokeWidth: 7, stroke: 'var(--text-muted)' }} />
      <path d="M176,134 L187,142 L218,96Z" style={{ ...LINE, fill: 'var(--surface)', strokeWidth: 1.8 }} />
      <path d="M173,118 l14,5 M173,126 l14,5" style={ACC} />
      <Txt x={180} y={188} anchor="middle">espina y palito</Txt>
      {/* 3: anzuelo de tranca */}
      <path d="M254,82 L322,56" style={{ ...LINE, strokeWidth: 5 }} />
      <path d="M248,84 L254,82 L254,86Z M328,54 L322,56 L322,52Z" style={{ ...LINE, fill: 'currentColor' }} />
      <path d="M288,69 V30" style={LINE} />
      <path d="M283,64 l10,8" style={ACC} />
      <path d="M244,150 C262,124 312,122 338,148 C312,176 262,176 244,150Z" style={{ ...LINE, fill: FISH_FILL }} />
      <path d="M244,150 L266,146 M244,150 L266,156" style={THIN} />
      <circle cx="318" cy="142" r="2" style={{ fill: 'currentColor' }} />
      <path d="M286,132 L298,168" style={{ ...LINE, strokeWidth: 4 }} />
      <path d="M292,150 C270,150 252,140 250,100 V60" style={{ ...THIN, strokeWidth: 1.6 }} />
      <Txt x={296} y={190} anchor="middle">de tranca</Txt>
    </Svg>
  );
}

/* ----------------------------------------------------------- línea de mano / caña */
function Handline() {
  return (
    <Svg h={235}>
      <path d="M0,92 H360 V235 H0Z" style={{ fill: WATER }} />
      <path d="M60,92 H360" style={LINE} />
      <path d="M0,86 H60 L82,92 V235 H0Z" style={{ fill: 'color-mix(in srgb, var(--text-muted) 25%, var(--surface))', stroke: 'currentColor', strokeWidth: 2 }} />
      <path d="M30,86 C100,62 170,34 236,22" style={{ ...LINE, strokeWidth: 4, stroke: 'var(--accent)' }} />
      <Txt x={96} y={82} bold>caña de rama</Txt>
      {/* línea, boya, plomada y anzuelo */}
      <path d="M236,22 C240,50 238,76 238,88" style={THIN} />
      <ellipse cx="238" cy="96" rx="6" ry="9" style={{ ...LINE, fill: 'var(--surface)' }} />
      <path d="M232,94 H244" style={ACC} />
      <Txt x={254} y={86}>boya</Txt>
      <path d="M238,105 V176" style={THIN} />
      <path d="M232,150 l6,-6 l8,3 l2,8 l-8,5 l-8,-3Z" style={{ ...LINE, fill: 'color-mix(in srgb, var(--text-muted) 40%, var(--surface))', strokeWidth: 1.6 }} />
      <Txt x={254} y={158}>plomada</Txt>
      <path d="M238,176 V192 C238,208 224,208 224,194" style={{ ...LINE, strokeWidth: 2.4 }} />
      <path d="M222,198 q-8,2 -14,-6 q4,-8 12,-4" style={{ ...ACC, strokeWidth: 3 }} />
      <Txt x={254} y={206}>anzuelo y carnada</Txt>
      <path d="M82,222 H360" style={{ stroke: 'var(--border)', strokeWidth: 1.5 }} />
      <Fish x={150} y={196} s={0.9} />
      <Arrow x1={176} y1={196} x2={198} y2={196} style={MUTED} />
    </Svg>
  );
}

/* ------------------------------------------------------------------- espinel */
function Setline() {
  const xs = [100, 150, 200, 250, 300];
  return (
    <Svg h={265}>
      <Txt x={6} y={14} bold>Espinel</Txt>
      <path d="M0,76 H360 V135 H0Z" style={{ fill: WATER }} />
      <path d="M0,76 H360" style={LINE} />
      <path d="M0,70 H50 V135 H0Z M310,70 H360 V135 H310Z" style={{ fill: 'color-mix(in srgb, var(--text-muted) 25%, var(--surface))', stroke: 'currentColor', strokeWidth: 2 }} />
      <path d="M40,70 V32 M320,70 V32" style={{ ...LINE, strokeWidth: 5, stroke: 'var(--text-muted)' }} />
      <path d="M40,36 Q180,52 320,36" style={{ ...LINE, strokeWidth: 2.4 }} />
      {xs.map((x, i) => {
        const y0 = 36 + 16 * Math.sin(((x - 40) / 280) * Math.PI) + 2;
        return (
          <g key={x}>
            <path d={`M${x},${y0} V${108 + (i % 2) * 6}`} style={THIN} />
            <path d={`M${x},${108 + (i % 2) * 6} v6 c0,8 -9,8 -9,1`} style={{ ...LINE, strokeWidth: 2 }} />
          </g>
        );
      })}
      <path d="M100,28 H150 M100,24 V32 M150,24 V32" style={THIN} />
      <Txt x={125} y={22} anchor="middle">1–2 m</Txt>
      <Fish x={228} y={124} s={0.7} />
      {/* a una rama */}
      <path d="M0,150 H360" style={{ stroke: 'var(--border)', strokeWidth: 1 }} />
      <Txt x={6} y={168} bold>Línea en una rama</Txt>
      <path d="M0,230 H360 V265 H0Z" style={{ fill: WATER }} />
      <path d="M0,230 H360" style={LINE} />
      <path d="M0,230 V176 M0,176 H0" style={LINE} />
      <path d="M8,230 V184 C8,176 12,174 20,176 L250,182" style={{ ...LINE, strokeWidth: 7, stroke: 'var(--text-muted)' }} />
      <path d="M130,181 l30,-12 M190,183 l20,-14" style={{ ...LINE, strokeWidth: 3, stroke: 'var(--text-muted)' }} />
      <path d="M250,182 V238 v6 c0,8 -9,8 -9,1" style={THIN} />
      <path d="M250,242 v6 c0,8 -9,8 -9,1" style={{ ...LINE, strokeWidth: 2 }} />
      <Txt x={266} y={214}>línea con carnada</Txt>
      <Fish x={300} y={248} s={0.7} />
      <path d="M0,150 H0" style={LINE} />
    </Svg>
  );
}

/* -------------------------------------------------------------------- trampas */
function Traps() {
  return (
    <Svg h={285}>
      <Txt x={6} y={14} bold>Corral de piedras, visto desde arriba</Txt>
      <path d="M0,28 H360 V124 H0Z" style={{ fill: WATER }} />
      <path d="M0,28 H360 M0,124 H360" style={LINE} />
      <Arrow x1={14} y1={76} x2={64} y2={76} style={MUTED} />
      <Stones pts={[[96, 30], [182, 62]]} />
      <Stones pts={[[96, 122], [182, 90]]} />
      <Stones pts={[[182, 62], [208, 40], [262, 38], [292, 76], [262, 114], [208, 112], [182, 90]]} />
      <Fish x={218} y={74} s={0.7} flip />
      <Fish x={254} y={90} s={0.7} flip />
      <Fish x={126} y={72} s={0.7} flip />
      <Txt x={298} y={80}>corral</Txt>
      <Txt x={30} y={110}>embudo</Txt>
      <path d="M0,142 H360" style={{ stroke: 'var(--border)', strokeWidth: 1 }} />
      <Txt x={6} y={160} bold>Nasa de botella</Txt>
      <path d="M0,170 H360 V285 H0Z" style={{ fill: WATER }} />
      <path d="M96,196 H252 Q268,196 268,212 V234 Q268,250 252,250 H96" style={{ ...LINE, strokeWidth: 2.4, fill: 'color-mix(in srgb, var(--surface) 55%, transparent)' }} />
      <path d="M96,196 L146,214 M96,250 L146,232" style={{ ...LINE, strokeWidth: 2.4, stroke: 'var(--accent)' }} />
      <path d="M146,214 V232" style={{ ...MUTED, strokeDasharray: '2 3' }} />
      <circle cx="214" cy="226" r="9" style={{ ...LINE, fill: 'color-mix(in srgb, var(--text-muted) 35%, var(--surface))' }} />
      <path d="M208,222 l3,2 M216,230 l3,-1 M213,221 l1,4" style={THIN} />
      <Txt x={196} y={190}>carnada</Txt>
      <Txt x={100} y={190}>embudo</Txt>
      <Fish x={48} y={222} s={0.9} flip />
      <Arrow x1={72} y1={222} x2={116} y2={222} style={MUTED} />
      <path d="M180,252 V272" style={THIN} />
      <path d="M172,270 l8,-6 l10,2 l2,9 l-9,4 l-10,-3Z" style={{ ...LINE, fill: 'color-mix(in srgb, var(--text-muted) 40%, var(--surface))', strokeWidth: 1.6 }} />
      <Txt x={206} y={278}>piedra para hundirla</Txt>
    </Svg>
  );
}

/* ----------------------------------------------------------------------- fija */
function Spear() {
  return (
    <Svg h={245}>
      {/* punta partida */}
      <path d="M70,238 V112" style={{ ...LINE, strokeWidth: 8, stroke: 'var(--text-muted)' }} />
      <path d="M70,112 L40,40 M70,112 V30 M70,112 L100,40" style={{ ...LINE, strokeWidth: 5, stroke: 'var(--text-muted)' }} />
      <path d="M36,40 l4,-18 l4,18 M66,30 l4,-18 l4,18 M96,40 l4,-18 l4,18" style={{ ...LINE, fill: 'currentColor', strokeWidth: 1.5 }} />
      <path d="M54,76 L86,76" style={{ ...LINE, strokeWidth: 5, stroke: 'var(--accent)' }} />
      <path d="M62,106 l16,-6 M62,116 l16,-6" style={ACC} />
      <Txt x={104} y={82}>cuña</Txt>
      <Txt x={90} y={132}>atadura</Txt>
      <Txt x={70} y={14} anchor="middle" bold>Fija</Txt>
      <path d="M140,10 V240" style={{ stroke: 'var(--border)', strokeWidth: 1 }} />
      {/* refracción */}
      <path d="M150,100 H360 V245 H150Z" style={{ fill: WATER }} />
      <path d="M150,100 H360" style={LINE} />
      <circle cx="180" cy="34" r="9" style={{ ...LINE, fill: 'var(--surface)' }} />
      <circle cx="183" cy="34" r="3" style={{ fill: 'currentColor' }} />
      <Txt x={166} y={14} bold>Refracción</Txt>
      <path d="M186,40 L262,100" style={LINE} />
      <path d="M262,100 L334,142" style={{ ...MUTED }} />
      <path d="M262,100 L318,196" style={{ ...LINE, stroke: 'var(--info)' }} />
      <g opacity="0.55">
        <Fish x={334} y={142} s={0.8} />
      </g>
      <Txt x={358} y={118} anchor="end">lo que ves</Txt>
      <Fish x={322} y={206} s={0.9} />
      <Txt x={336} y={236} anchor="end">donde está</Txt>
      <path d="M232,18 L318,196" style={{ ...LINE, strokeWidth: 3.5, stroke: 'var(--accent)' }} />
      <path d="M318,196 l-3,-12 m3,12 l-10,-7" style={ACC} />
      <Txt x={152} y={64}>apuntá acá</Txt>
    </Svg>
  );
}

/* ------------------------------------------------------- limpiar, cocinar, guardar */
function Food() {
  return (
    <Svg h={265}>
      <Txt x={6} y={14} bold>Limpiar</Txt>
      <path d="M30,78 C70,34 150,34 212,62 L252,40 V104 L212,82 C150,116 70,116 30,78Z" style={{ ...LINE, fill: FISH_FILL }} />
      <circle cx="52" cy="70" r="3" style={{ fill: 'currentColor' }} />
      <path d="M88,56 C80,70 80,84 88,98" style={THIN} />
      <path d="M96,100 C130,106 170,102 204,86" style={{ ...MUTED, stroke: 'var(--accent)', strokeWidth: 2.6, strokeDasharray: '6 4' }} />
      <path d="M118,106 c6,10 14,-4 20,8 s14,-6 20,6 s10,-4 14,2" style={{ ...ACC, strokeWidth: 3 }} />
      <Txt x={84} y={34} anchor="middle">agallas</Txt>
      <Txt x={150} y={134} anchor="middle">tripas</Txt>
      <Txt x={228} y={118}>corte</Txt>
      <path d="M0,148 H360" style={{ stroke: 'var(--border)', strokeWidth: 1 }} />
      <Txt x={6} y={166} bold>Cocinar y guardar</Txt>
      <path d="M0,245 H360" style={{ stroke: 'var(--border)', strokeWidth: 1.5 }} />
      {/* brasas, fuego y espetón */}
      <path d="M60,240 L130,236 M70,246 L140,242" style={{ ...LINE, strokeWidth: 6, stroke: 'var(--text-muted)' }} />
      <path d="M72,236 C58,218 82,206 80,190 C94,204 112,214 104,236Z" style={{ fill: 'var(--accent)', stroke: 'currentColor', strokeWidth: 1.5, strokeLinejoin: 'round' }} />
      <path d="M44,208 V240 M44,208 l-6,-8 M44,208 l6,-8 M136,208 V240 M136,208 l-6,-8 M136,208 l6,-8" style={{ ...LINE, strokeWidth: 3, stroke: 'var(--text-muted)' }} />
      <path d="M32,202 H148" style={{ ...LINE, strokeWidth: 3 }} />
      <Fish x={90} y={190} s={1.5} />
      <Txt x={90} y={262} anchor="middle">a la brasa</Txt>
      {/* tiras secándose */}
      <path d="M200,172 V244 M330,172 V244 M192,178 H338" style={{ ...LINE, strokeWidth: 3.5, stroke: 'var(--text-muted)' }} />
      {[214, 240, 266, 292, 316].map((x, i) => (
        <rect key={x} x={x - 5} y={180} width="10" height={38 - (i % 2) * 8} rx="4" style={{ ...LINE, fill: FISH_FILL, strokeWidth: 1.6 }} />
      ))}
      <Txt x={265} y={262} anchor="middle">tiras secándose</Txt>
    </Svg>
  );
}

const FIGURES: Record<string, () => ReactNode> = {
  where: Where,
  hooks: Hooks,
  handline: Handline,
  setline: Setline,
  traps: Traps,
  spear: Spear,
  food: Food,
};

export function SurvivalFigure({ id }: { id: string }) {
  const F = FIGURES[id];
  return F ? <F /> : null;
}
