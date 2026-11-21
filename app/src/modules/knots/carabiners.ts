import type { L } from './knots';

/**
 * Mosquetones: formas, trabas, cómo se cargan y cuándo se descartan. Textos propios a partir de las
 * normas EN 12275 y UIAA 121 (resistencias mínimas) y del FM 3-97.61 «Military Mountaineering»
 * (Ejército de EE. UU., dominio público). Las cifras en kN son los mínimos de la norma para un
 * mosquetón de escalada; cada fabricante marca las suyas en el cuerpo (y mandan esas).
 */

const l = (es: string, en: string): L => ({ es, en });

/** Silueta que dibuja `CarabinerFigure`. */
export type CarabinerShape = 'oval' | 'd' | 'offset' | 'pear' | 'wide' | 'steel' | 'key';

export interface CarabinerType {
  id: string;
  shape: CarabinerShape;
  name: L;
  summary: L;
  uses: L[];
  pros: L[];
  cons: L[];
  /** El metal que es de verdad (para la regla de «aluminio con aluminio»). */
  metal: 'aluminium' | 'steel' | 'either' | 'none';
}

export const CARABINER_TYPES: CarabinerType[] = [
  {
    id: 'd',
    shape: 'd',
    name: l('En D', 'D-shape'),
    summary: l('El de uso general. La carga cae sobre el lomo recto, que es el lado más fuerte.', 'The all-round one. The load falls on the straight spine, the strongest side.'),
    uses: [l('Anclajes y cintas express', 'Anchors and quickdraws'), l('Unir una cinta o una gaza al arnés', 'Joining a sling or loop to a harness'), l('Armar sistemas de rescate', 'Rescue systems')],
    pros: [l('Muy resistente en su eje largo', 'Very strong along its long axis'), l('Liviano y fácil de conseguir', 'Light and easy to find')],
    cons: [l('Se carga mal si el objeto queda torcido', 'Loads badly if the object sits crooked'), l('Poco espacio para varios elementos', 'Little room for several items')],
    metal: 'aluminium',
  },
  {
    id: 'offset',
    shape: 'offset',
    name: l('En D asimétrica', 'Offset D'),
    summary: l('Una D más ancha abajo y con el lomo inclinado: la boca abre más.', 'A D that is wider at the bottom with a leaning spine: the gate opens wider.'),
    uses: [l('Lo mismo que la D, con guantes o con prisa', 'The same as the D, with gloves or in a hurry'), l('Colgar varios elementos', 'Carrying several items'), l('Equipo de ascenso', 'Climbing gear')],
    pros: [l('Boca grande: entra la cuerda o la cinta más rápido', 'Big opening: rope or sling goes in faster'), l('Más liviano que una D del mismo largo', 'Lighter than a D of the same length')],
    cons: [l('Más delicado en el lado de la boca', 'More delicate on the gate side'), l('El lomo es más corto: carga bien solo en el eje largo', 'Shorter spine: loads well only along the long axis')],
    metal: 'aluminium',
  },
  {
    id: 'pear',
    shape: 'pear',
    name: l('En pera (HMS)', 'Pear (HMS)'),
    summary: l('Ancha arriba y redonda abajo, pensada para el nudo dinámico (Munter) y para asegurar.', 'Wide at the top and round at the bottom, made for the Munter hitch and belaying.'),
    uses: [l('Nudo dinámico (Munter)', 'Munter hitch'), l('Asegurar con descensor o con el nudo', 'Belaying with a device or the hitch'), l('Anclaje con varios pasos de cuerda', 'Anchor with several rope passes')],
    pros: [l('Deja girar el nudo dinámico sin trabarse', 'Lets the Munter hitch flip without jamming'), l('Entran varias cuerdas o cintas', 'Takes several ropes or slings')],
    cons: [l('Más pesado y voluminoso', 'Heavier and bulkier'), l('Sin traba pierde el sentido: usá siempre una con traba', 'Without a lock it loses its point: always use a locking one')],
    metal: 'aluminium',
  },
  {
    id: 'oval',
    shape: 'oval',
    name: l('Ovalado', 'Oval'),
    summary: l('Simétrico: la carga se acomoda al centro, sin lado fuerte ni débil.', 'Symmetric: the load settles in the middle, with no strong or weak side.'),
    uses: [l('Poleas y aparejos', 'Pulleys and hoists'), l('Colgar equipo en el arnés', 'Racking gear on a harness'), l('Sostener cuerda que corre', 'Holding a running rope')],
    pros: [l('No se tuerce la carga', 'The load does not twist'), l('Cuerdas y cintas corren parejas', 'Ropes and slings run evenly')],
    cons: [l('Menos resistente que la D', 'Weaker than the D'), l('Más pesado para lo que aguanta', 'Heavier for what it holds')],
    metal: 'either',
  },
  {
    id: 'wide',
    shape: 'wide',
    name: l('De gran apertura (vía ferrata y trabajo)', 'Large gate (via ferrata and work)'),
    summary: l('Cuerpo grande y boca muy abierta, para enganchar cables, barandas o varias cuerdas.', 'Big body and a very wide gate, to clip cables, rails or several ropes.'),
    uses: [l('Vía ferrata y líneas de vida', 'Via ferrata and lifelines'), l('Cables y barandas', 'Cables and rails'), l('Trabajo en altura', 'Work at height')],
    pros: [l('Se engancha con una mano y con guantes', 'Clips with one hand and gloves'), l('Entra un cable o una baranda gruesa', 'Takes a cable or a thick rail')],
    cons: [l('Pesado y voluminoso', 'Heavy and bulky'), l('Boca grande: más fácil que se abra si el cierre no es de buena calidad', 'Large gate: easier to open if the lock is poor')],
    metal: 'either',
  },
  {
    id: 'steel',
    shape: 'steel',
    name: l('De acero (rescate y trabajo)', 'Steel (rescue and work)'),
    summary: l('El mismo diseño, de acero: más pesado, pero aguanta el desgaste de cuerdas y cables.', 'The same design in steel: heavier, but it stands up to rope and cable wear.'),
    uses: [l('Rescate, polipastos y líneas fijas', 'Rescue, hoists and fixed lines'), l('Dejarlo puesto mucho tiempo', 'Leaving it in place for long'), l('Usarlo contra cables o herrajes de acero', 'Use against steel cables or hardware')],
    pros: [l('Mucha vida útil, casi no se desgasta', 'Very long life, hardly wears'), l('No se marca con herrajes ni cables', 'Not marked by hardware or cables')],
    cons: [l('Pesa dos o tres veces más que uno de aluminio', 'Weighs two or three times an aluminium one'), l('Se oxida si es de acero común y se deja mojado', 'Rusts if it is plain steel and left wet')],
    metal: 'steel',
  },
  {
    id: 'key',
    shape: 'key',
    name: l('De llavero o de bisutería', 'Keyring or novelty'),
    summary: l('Parece un mosquetón pero no está hecho para sostener a nadie ni nada importante.', 'Looks like a carabiner but is not made to hold anyone or anything important.'),
    uses: [l('Llaves, botella, mochila liviana', 'Keys, bottle, light pack')],
    pros: [l('Barato y liviano', 'Cheap and light')],
    cons: [l('Sin resistencia certificada: nunca para cuerda, anclaje, arnés ni personas', 'No certified strength: never for rope, anchors, harness or people'), l('Suele traer inscripciones como «no escalar»', 'Often marked “not for climbing”')],
    metal: 'none',
  },
];

/** Cómo se dibuja la traba sobre la boca. */
export type LockKind = 'none' | 'screw' | 'twist' | 'triple';

export interface CarabinerLock {
  id: string;
  kind: LockKind;
  name: L;
  how: L;
  pros: L[];
  cons: L[];
}

export const CARABINER_LOCKS: CarabinerLock[] = [
  {
    id: 'none',
    kind: 'none',
    name: l('Sin traba (de gatillo)', 'Non-locking (snap gate)'),
    how: l('La boca se abre empujando y la cierra un resorte. Puede ser recta, curva o de alambre.', 'The gate opens when pushed and a spring closes it. It can be straight, bent or wire.'),
    pros: [l('Se abre y se cierra con una mano, rápido', 'Opens and closes with one hand, fast'), l('Liviano (el de alambre, más)', 'Light (wire even more)')],
    cons: [l('Se puede abrir sola por roce o vibración', 'Can open on its own from rubbing or vibration'), l('No sirve donde un descuido es grave: arnés, anclaje, rappel', 'Not for where a slip is serious: harness, anchor, rappel')],
  },
  {
    id: 'screw',
    kind: 'screw',
    name: l('De rosca', 'Screw-gate'),
    how: l('Un manguito roscado se atornilla sobre la boca. Se cierra a mano, girando.', 'A threaded sleeve screws over the gate. You close it by hand, turning.'),
    pros: [l('Sencillo, barato y muy confiable', 'Simple, cheap and very reliable'), l('No depende de resortes', 'No springs involved')],
    cons: [l('Hay que acordarse de cerrarlo', 'You have to remember to close it'), l('Con vibración puede aflojarse', 'Vibration can loosen it'), l('Más lento y difícil con guantes', 'Slower and harder with gloves')],
  },
  {
    id: 'twist',
    kind: 'twist',
    name: l('Automático de doble acción', 'Twist-lock (auto-locking)'),
    how: l('Para abrirlo hay que girar el manguito y después empujar la boca. Al soltar, se cierra y traba solo.', 'To open it you twist the sleeve and then push the gate. On release it closes and locks itself.'),
    pros: [l('Se traba solo: no hay que acordarse', 'Locks by itself: nothing to remember'), l('Muy usado para asegurar y rappel', 'Widely used for belaying and rappel')],
    cons: [l('Con arena, barro o hielo puede no cerrar bien', 'Sand, mud or ice can stop it from closing'), l('Más caro que el de rosca', 'More expensive than the screw-gate'), l('Con guantes gruesos cuesta abrirlo', 'Hard to open with thick gloves')],
  },
  {
    id: 'triple',
    kind: 'triple',
    name: l('De triple acción', 'Triple-action (triple-lock)'),
    how: l('Tres movimientos para abrirlo (por ejemplo empujar, girar y empujar). Se cierra y traba solo.', 'Three movements to open it (for example push, twist and push). It closes and locks by itself.'),
    pros: [l('Es el más difícil de abrir sin querer', 'Hardest to open by accident'), l('Se usa en rescate, trabajo en altura y para una persona colgada', 'Used in rescue, work at height and for a hanging person')],
    cons: [l('Lento de abrir, sobre todo con una mano', 'Slow to open, especially one-handed'), l('Más pesado y caro', 'Heavier and more expensive')],
  },
];

/** Resistencia mínima de la norma para un mosquetón de escalada (kN). */
export const CARABINER_LOADS: { how: L; kn: string; note: L }[] = [
  { how: l('Cerrado, tirando del lomo (eje largo)', 'Closed, pulled along the spine (long axis)'), kn: '≥ 20 kN', note: l('La forma correcta de usarlo.', 'The right way to use it.') },
  { how: l('Con la boca abierta', 'Gate open'), kn: '≥ 7 kN', note: l('Pierde más de la mitad: por eso importa la traba.', 'Loses over half: that is why the lock matters.') },
  { how: l('Cargado de costado (eje corto)', 'Loaded sideways (short axis)'), kn: '≥ 7 kN', note: l('Pasa si el mosquetón queda torcido contra una cinta o una roca.', 'Happens when the carabiner is twisted against a sling or a rock.') },
];

export const CARABINER_CARE: L[] = [
  l('Revisalo antes de usarlo: la boca tiene que cerrar sola y a fondo, y la traba tiene que funcionar.', 'Check it before use: the gate must close by itself and fully, and the lock must work.'),
  l('Descartalo si tiene grietas, deformación, rebabas o filos, marcas hondas de cuerda, corrosión o la boca floja.', 'Retire it if it has cracks, deformation, burrs or sharp edges, deep rope grooves, corrosion or a loose gate.'),
  l('Descartalo si cayó desde mucha altura sobre piedra o cemento, aunque no se vea nada.', 'Retire it if it fell a long way onto rock or concrete, even if nothing shows.'),
  l('Si la boca se pega por arena, sal o barro, lavalo con agua tibia, secalo y ponele una gota de lubricante liviano en el eje (que no toque la cuerda).', 'If the gate sticks from sand, salt or mud, wash it in warm water, dry it and put a drop of light lubricant on the hinge (keep it off the rope).'),
  l('Tienen que decir su resistencia en kN y la norma (CE, UIAA) en el cuerpo. Si no lo dicen, no sostienen personas.', 'They must show their strength in kN and the standard (CE, UIAA) on the body. If they do not, they do not hold people.'),
  l('La carga va por el lomo, con la boca cerrada y trabada. Si el mosquetón queda torcido contra una cinta, una roca o el borde de otro, reacomodalo antes de cargarlo.', 'The load goes along the spine, with the gate closed and locked. If the carabiner ends up twisted against a sling, a rock or another carabiner’s edge, reposition it before loading.'),
];

export const CARABINER_METAL = {
  title: l('El metal importa: aluminio con aluminio', 'The metal matters: aluminium on aluminium'),
  body: l(
    'Si un mosquetón es de aluminio, tiene que correr sobre aluminio, no sobre acero. El acero lo va comiendo: abre surcos con filo que después cortan la cuerda, y con humedad o sal se corroen entre sí (corrosión galvánica). Si va a deslizar sobre un cable, un herraje o un anillo de acero, usá uno de acero. Y si lo vas a dejar puesto mucho tiempo (anclaje fijo), que sean del mismo metal.',
    'If a carabiner is aluminium, it has to run on aluminium, not on steel. Steel wears it away: it cuts sharp grooves that later cut the rope, and with moisture or salt the two corrode each other (galvanic corrosion). If it will slide over a steel cable, fitting or ring, use a steel one. And if it will stay in place a long time (fixed anchor), make both the same metal.',
  ),
};

export const CARABINER_WARNING = l(
  'Un mosquetón que no dice su resistencia en kN y su norma no es para sostener personas ni cargas que importen. Si dudás, no lo uses para eso.',
  'A carabiner that does not state its strength in kN and its standard is not for holding people or loads that matter. If in doubt, do not use it for that.',
);

export const CARABINER_SOURCES = l(
  'Fuentes: normas EN 12275 y UIAA 121 (resistencias mínimas) y FM 3-97.61 «Military Mountaineering» (Ejército de EE. UU., dominio público). Textos propios; las cifras de cada mosquetón son las que marca su fabricante.',
  'Sources: EN 12275 and UIAA 121 standards (minimum strengths) and FM 3-97.61 “Military Mountaineering” (US Army, public domain). Own text; each carabiner’s figures are those marked by its maker.',
);
