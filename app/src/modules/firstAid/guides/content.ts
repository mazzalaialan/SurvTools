import type { L, Step, Topic } from './types';

/**
 * Guía de primeros auxilios, paso a paso y según el entorno (ciudad o zona
 * agreste). Basada en las recomendaciones de primeros auxilios del Consejo
 * Europeo de Resucitación (ERC 2021), la Federación Internacional de la Cruz
 * Roja (IFRC 2020), la AHA y la guía de envenenamiento por ofidios del
 * Ministerio de Salud de la Nación. No reemplaza un curso.
 */

const l = (es: string, en: string): L => ({ es, en });
/** Paso para los dos entornos. */
const s = (es: string, en: string): Step => ({ text: l(es, en) });
/** Solo en ciudad (la ayuda llega en minutos). */
const sc = (es: string, en: string): Step => ({ text: l(es, en), env: 'city' });
/** Solo en zona agreste (la ayuda puede tardar horas). */
const sw = (es: string, en: string): Step => ({ text: l(es, en), env: 'wild' });
/** Lo que no hay que hacer. */
const no = (es: string, en: string): Step => ({ text: l(es, en), dont: true });

const CALL_SPEAKER = s('Llamá al {medical} y poné el altavoz: te van a ir guiando.', 'Call {medical} on speaker: they will guide you.');
const WILD_RESCUE = sw(
  'Pedí rescate al {emergency} (Policía / rescate de montaña) y pasá las coordenadas de "Mi ubicación". Si no hay señal, probá desde un punto alto o mandá un SMS; si son varios, que alguien vaya a buscar ayuda con la ubicación anotada.',
  'Ask for rescue on {emergency} (police / mountain rescue) and give the coordinates from "My location". With no signal, try from higher ground or send an SMS; if there are several of you, send someone for help with the location written down.',
);
const KEEP_WARM = s('Abrigala y aislala del suelo (campera, manta, mochila debajo): pierde calor rápido aunque no haga frío.', 'Keep them warm and insulated from the ground (jacket, blanket, backpack underneath): they lose heat fast even when it is not cold.');
const WATCH = s('Controlá cada pocos minutos si responde y si respira. Anotá la hora y los cambios.', 'Check every few minutes whether they respond and breathe. Write down times and changes.');

export const TOPICS: Topic[] = [
  {
    id: 'assess',
    title: l('Evaluación inicial', 'First assessment'),
    keywords: l('empezar evaluar qué hago', 'start assess what do I do'),
    start: 'safe',
    nodes: {
      safe: {
        title: l('¿El lugar es seguro?', 'Is the scene safe?'),
        steps: [
          s('Antes de acercarte mirá alrededor: tránsito, fuego, humo, cables, gas, agua, piedras que caen, animales.', 'Before approaching, look around: traffic, fire, smoke, wires, gas, water, falling rocks, animals.'),
          s('Protegete: guantes o una bolsa en las manos si hay sangre.', 'Protect yourself: gloves or a plastic bag on your hands if there is blood.'),
        ],
        question: l('¿Podés acercarte sin ponerte en peligro?', 'Can you get close without putting yourself in danger?'),
        options: [
          { label: l('Sí, es seguro', 'Yes, it is safe'), next: 'responds' },
          { label: l('No', 'No'), next: 'unsafe' },
        ],
      },
      unsafe: {
        title: l('No es seguro', 'It is not safe'),
        steps: [
          s('No te acerques: si te lastimás vos, ya son dos para rescatar.', 'Do not go in: if you get hurt, there are two people to rescue.'),
          s('Si se puede, eliminá el peligro sin arriesgarte: cortá la luz, señalizá el accidente, alejá el fuego.', 'If you can, remove the danger without risk: cut the power, signal the crash, move the fire away.'),
          sc('Llamá al {emergency} (o al {fire} si hay fuego) y esperá a los que tienen equipo.', 'Call {emergency} (or {fire} for fire) and wait for equipped responders.'),
          WILD_RESCUE,
        ],
        calls: ['emergency', 'fire'],
        options: [{ label: l('Ya es seguro', 'It is safe now'), next: 'responds' }],
      },
      responds: {
        title: l('¿Responde?', 'Do they respond?'),
        steps: [s('Tocale los hombros y hablale fuerte: "¿Me escuchás? ¿Estás bien?"', 'Tap their shoulders and speak loudly: "Can you hear me? Are you OK?"')],
        question: l('¿Responde, se mueve o abre los ojos?', 'Do they answer, move or open their eyes?'),
        options: [
          { label: l('Sí', 'Yes'), next: 'bleeding' },
          { label: l('No responde', 'No response'), next: 'breathing' },
        ],
      },
      breathing: {
        title: l('¿Respira normalmente?', 'Are they breathing normally?'),
        steps: [
          s('Pedí ayuda a gritos: que alguien llame al {medical} y traiga un desfibrilador (DEA) si hay.', 'Shout for help: someone should call {medical} and bring a defibrillator (AED) if there is one.'),
          s('Abrí la vía aérea: una mano en la frente, inclinala hacia atrás y levantá el mentón con dos dedos.', 'Open the airway: one hand on the forehead, tilt the head back and lift the chin with two fingers.'),
          s('Mirá el pecho, escuchá y sentí el aire hasta 10 segundos.', 'Look at the chest, listen and feel for air for up to 10 seconds.'),
          s('Bocanadas aisladas o ruidos (respiración agónica) NO son respirar normalmente.', 'Occasional gasps or noises (agonal breathing) are NOT normal breathing.'),
        ],
        calls: ['same', 'emergency'],
        question: l('¿Respira normalmente?', 'Are they breathing normally?'),
        options: [
          { label: l('No, o solo bocanadas', 'No, or only gasps'), next: 'topic:cpr' },
          { label: l('Sí, respira', 'Yes, breathing'), next: 'topic:unconscious' },
        ],
      },
      bleeding: {
        title: l('¿Sangra mucho?', 'Is there heavy bleeding?'),
        steps: [s('Buscá sangre en todo el cuerpo, también debajo de la ropa y de la persona.', 'Look for blood all over the body, also under clothing and underneath the person.')],
        question: l('¿Sale en chorro, empapa la ropa o forma un charco?', 'Is it spurting, soaking the clothes or pooling?'),
        options: [
          { label: l('Sí, sangra mucho', 'Yes, heavy bleeding'), next: 'topic:bleeding' },
          { label: l('No', 'No'), next: 'what' },
        ],
      },
      what: {
        title: l('¿Qué le pasó?', 'What happened?'),
        steps: [
          s('Preguntale qué pasó, qué le duele, si tiene alguna enfermedad o alergia y si toma medicación (mirá su ficha médica si la tenés).', 'Ask what happened, what hurts, whether they have any illness or allergy and take medication (check their medical record if you have it).'),
          s('Mantenela tranquila y abrigada mientras tanto.', 'Keep them calm and warm meanwhile.'),
        ],
        question: l('Elegí lo que más se parece:', 'Pick what fits best:'),
        options: [
          { label: l('Se ahoga con algo (atragantamiento)', 'Choking on something'), next: 'topic:choking' },
          { label: l('Dolor de pecho', 'Chest pain'), next: 'topic:chest' },
          { label: l('Cara torcida, no puede hablar o mover un brazo', 'Face drooping, cannot speak or move an arm'), next: 'topic:stroke' },
          { label: l('Hinchazón de labios o lengua, le cuesta respirar', 'Swollen lips or tongue, trouble breathing'), next: 'topic:anaphylaxis' },
          { label: l('Caída de altura o golpe fuerte', 'Fall from height or heavy blow'), next: 'topic:fall' },
          { label: l('Posible fractura o esguince', 'Possible fracture or sprain'), next: 'topic:fracture' },
          { label: l('Quemadura', 'Burn'), next: 'topic:burns' },
          { label: l('Mordedura de serpiente', 'Snakebite'), next: 'topic:snakebite' },
          { label: l('Picadura (alacrán, araña, abeja)', 'Sting or bite (scorpion, spider, bee)'), next: 'topic:stings' },
          { label: l('Convulsión', 'Seizure'), next: 'topic:seizure' },
          { label: l('Intoxicación o gas', 'Poisoning or gas'), next: 'topic:poisoning' },
          { label: l('Mucho frío (hipotermia)', 'Very cold (hypothermia)'), next: 'topic:hypothermia' },
          { label: l('Mucho calor (golpe de calor)', 'Very hot (heat stroke)'), next: 'topic:heat' },
          { label: l('Diabético confundido o sudoroso', 'Confused or sweaty diabetic'), next: 'topic:hypoglycemia' },
          { label: l('Casi se ahoga en el agua', 'Near drowning'), next: 'topic:drowning' },
          { label: l('Herida grave o accidente con varios daños (método MARCH)', 'Serious injury or crash with several injuries (MARCH method)'), next: 'topic:march' },
          { label: l('Síntomas por la altura (soroche)', 'Altitude symptoms (mountain sickness)'), next: 'topic:altitude' },
          { label: l('Otra cosa o no sé', 'Something else or not sure'), next: 'other' },
        ],
      },
      other: {
        title: l('Otra cosa', 'Something else'),
        steps: [
          s('Dejala en la posición más cómoda para ella y no le des de comer ni de beber hasta saber qué tiene.', 'Let them rest in the most comfortable position and do not give food or drink until you know what is wrong.'),
          sc('Si empeora, tiene dolor intenso, está confundida o dormida, llamá al {same}.', 'If they get worse, are in severe pain, confused or drowsy, call {same}.'),
          sw('Si empeora o no puede caminar, pedí rescate en lugar de intentar sacarla vos.', 'If they get worse or cannot walk, ask for rescue instead of trying to carry them out yourself.'),
          KEEP_WARM,
          WATCH,
        ],
        calls: ['same', 'emergency'],
      },
    },
  },

  {
    id: 'cpr',
    title: l('No responde y no respira: RCP', 'Unresponsive and not breathing: CPR'),
    keywords: l('rcp reanimación paro cardíaco masaje cardíaco desfibrilador dea', 'cpr resuscitation cardiac arrest compressions defibrillator aed'),
    start: 'start',
    nodes: {
      start: {
        title: l('Empezá la RCP ya', 'Start CPR now'),
        steps: [
          CALL_SPEAKER,
          s('Si hay un desfibrilador (DEA) cerca, que alguien lo traiga.', 'If there is a defibrillator (AED) nearby, have someone bring it.'),
          s('Acostala boca arriba sobre algo firme.', 'Lay them on their back on something firm.'),
          s('Talón de una mano en el centro del pecho, la otra encima, brazos rectos.', 'Heel of one hand on the center of the chest, the other on top, arms straight.'),
          s('Hundí el pecho 5 a 6 cm, rápido: 100 a 120 por minuto (el ritmo de "La Bamba" o "Stayin\' Alive"). Dejá que el pecho vuelva a subir.', 'Push down 5 to 6 cm, fast: 100 to 120 per minute (the beat of "Stayin\' Alive"). Let the chest come back up.'),
          s('Si sabés dar respiraciones: 30 compresiones y 2 respiraciones. Si no, solo compresiones sin parar.', 'If you know rescue breaths: 30 compressions and 2 breaths. If not, compressions only, nonstop.'),
          s('Si son varios, túrnense cada 2 minutos sin frenar.', 'If there are several of you, swap every 2 minutes without stopping.'),
        ],
        calls: ['same', 'emergency'],
        question: l('¿Tienen un desfibrilador (DEA)?', 'Do you have a defibrillator (AED)?'),
        options: [
          { label: l('Sí', 'Yes'), next: 'aed' },
          { label: l('No', 'No'), next: 'continue' },
        ],
      },
      aed: {
        title: l('Usar el desfibrilador', 'Using the AED'),
        steps: [
          s('Prendelo y seguí sus instrucciones de voz.', 'Turn it on and follow its voice prompts.'),
          s('Pegá los parches sobre el pecho desnudo y seco como muestra el dibujo; seguí con las compresiones mientras tanto.', 'Stick the pads on the bare, dry chest as shown on the drawing; keep doing compressions meanwhile.'),
          s('Cuando lo indique, que nadie toque a la persona.', 'When it tells you to, make sure nobody touches the person.'),
          s('Después de la descarga (o si no la indica), seguí con compresiones enseguida.', 'After the shock (or if none is advised), resume compressions right away.'),
        ],
        options: [{ label: l('Seguir', 'Continue'), next: 'continue' }],
      },
      continue: {
        title: l('No frenes', 'Do not stop'),
        steps: [
          s('Seguí hasta que llegue la ayuda, la persona empiece a respirar normalmente o ya no puedas más.', 'Keep going until help arrives, the person starts breathing normally or you cannot go on.'),
          s('Si empieza a respirar: ponela de costado (posición lateral de seguridad) y controlala.', 'If they start breathing: put them on their side (recovery position) and watch them.'),
          s('En chicos: si sabés, empezá con 5 respiraciones; hundí un tercio del pecho (con una mano, o dos dedos en bebés).', 'In children: if you know how, start with 5 breaths; push down one third of the chest (one hand, or two fingers in babies).'),
          sw('Lejos de un hospital la RCP sola rara vez alcanza, pero hacela igual: si la persona está muy fría (hipotermia), no abandones; puede recuperarse aun después de mucho tiempo.', 'Far from a hospital CPR alone rarely succeeds, but do it anyway: if the person is very cold (hypothermia) do not give up; they can recover even after a long time.'),
          WILD_RESCUE,
        ],
        calls: ['same', 'emergency'],
      },
    },
  },

  {
    id: 'unconscious',
    title: l('No responde pero respira', 'Unresponsive but breathing'),
    keywords: l('desmayo inconsciente posición lateral de seguridad', 'faint unconscious recovery position'),
    start: 'start',
    nodes: {
      start: {
        title: l('Posición lateral de seguridad', 'Recovery position'),
        steps: [
          CALL_SPEAKER,
          s('Ponela de costado: el brazo de tu lado en ángulo recto, el otro con el dorso de la mano contra su mejilla, doblale la rodilla de afuera y girala hacia vos.', 'Roll them on their side: near arm at a right angle, the other with the back of the hand against their cheek, bend the far knee and roll them towards you.'),
          s('Inclinale la cabeza hacia atrás para que la boca quede hacia abajo y pueda salir el vómito.', 'Tilt the head back so the mouth points down and vomit can drain.'),
          s('Si sospechás golpe en la columna (caída, choque), dejala boca arriba sosteniendo la cabeza, salvo que vomite o le cueste respirar.', 'If you suspect a spinal injury (fall, crash), leave them on their back holding the head, unless they vomit or struggle to breathe.'),
          KEEP_WARM,
          s('Controlá la respiración cada minuto: si deja de respirar normalmente, empezá la RCP.', 'Check breathing every minute: if they stop breathing normally, start CPR.'),
          no('No le des nada de beber ni de comer.', 'Do not give anything to drink or eat.'),
          WILD_RESCUE,
        ],
        calls: ['same', 'emergency'],
        options: [{ label: l('Dejó de respirar', 'Stopped breathing'), next: 'topic:cpr' }],
      },
    },
  },

  {
    id: 'bleeding',
    title: l('Sangrado abundante', 'Heavy bleeding'),
    keywords: l('hemorragia sangre corte herida torniquete pierna brazo', 'hemorrhage blood cut wound tourniquet leg arm'),
    start: 'pressure',
    nodes: {
      pressure: {
        title: l('Apretá fuerte sobre la herida', 'Press hard on the wound'),
        steps: [
          s('Protegete las manos (guantes, bolsa).', 'Protect your hands (gloves, plastic bag).'),
          s('Acostala. Apretá directo sobre la herida con gasa, un trapo o la ropa, con las dos manos y todo tu peso.', 'Lay them down. Press directly on the wound with gauze, a cloth or clothing, with both hands and your body weight.'),
          s('No levantes la gasa para mirar: si se empapa, poné más encima y apretá más fuerte, al menos 10 minutos.', 'Do not lift the gauze to look: if it soaks through, add more on top and press harder, for at least 10 minutes.'),
          sc('Llamá al {medical} (o que otro llame mientras vos apretás).', 'Call {medical} (or have someone call while you press).'),
          WILD_RESCUE,
        ],
        calls: ['same', 'emergency'],
        question: l('¿Dónde sangra?', 'Where is it bleeding?'),
        options: [
          { label: l('Brazo o pierna', 'Arm or leg'), next: 'limb' },
          { label: l('Ingle, axila o cuello', 'Groin, armpit or neck'), next: 'junction' },
          { label: l('Pecho, abdomen o cabeza', 'Chest, belly or head'), next: 'trunk' },
        ],
      },
      limb: {
        title: l('Brazo o pierna', 'Arm or leg'),
        steps: [s('Seguí apretando fuerte.', 'Keep pressing hard.')],
        question: l('¿Paró o bajó mucho con la presión?', 'Did it stop or slow down a lot with pressure?'),
        options: [
          { label: l('Sí, paró', 'Yes, it stopped'), next: 'stopped' },
          { label: l('No, sigue saliendo en chorro o empapando', 'No, still spurting or soaking'), next: 'tourniquet' },
        ],
      },
      tourniquet: {
        title: l('Torniquete', 'Tourniquet'),
        steps: [
          s('Si tenés un torniquete (del botiquín), ponelo 5 a 7 cm por encima de la herida, nunca sobre una articulación.', 'If you have a tourniquet (from the kit), put it 5 to 7 cm above the wound, never over a joint.'),
          s('Si no tenés, improvisalo: una tira ancha (4 cm o más, como un pañuelo doblado o un cinturón), un nudo, un palo encima y girá hasta que pare el sangrado. Atá el palo para que no se desenrosque.', 'If you do not have one, improvise: a wide strip (4 cm or more, like a folded scarf or a belt), a knot, a stick on top and twist until the bleeding stops. Tie the stick so it does not unwind.'),
          s('Apretalo hasta que pare el sangrado: duele mucho, es normal.', 'Tighten until the bleeding stops: it hurts a lot, that is normal.'),
          s('Anotá la hora en la piel o en el torniquete.', 'Write the time on the skin or the tourniquet.'),
          s('Si con uno no para, poné otro justo arriba del primero.', 'If one is not enough, put a second one just above the first.'),
          no('No lo aflojes ni lo saques: eso lo hace el médico.', 'Do not loosen or remove it: the doctor does that.'),
          s('Ojo, las fuentes difieren: el Manual de Primeros Auxilios del Ministerio de Salud de la Nación (2016) desaconseja el torniquete en heridas comunes; las guías TCCC 2026 y TECC 2024 lo recomiendan cuando un sangrado grave de brazo o pierna no cede con presión directa. Por eso acá va después de la presión y solo si sigue saliendo en chorro.', 'Note, sources differ: the Argentine Ministry of Health first-aid manual (2016) advises against tourniquets for ordinary wounds; TCCC 2026 and TECC 2024 recommend them when severe arm or leg bleeding does not respond to direct pressure. That is why here it comes after pressure and only if it keeps spurting.'),
          sw('Es una evacuación urgente: con torniquete tiene que llegar a un hospital en pocas horas. Pedí rescate ya.', 'This is an urgent evacuation: with a tourniquet they must reach a hospital within a few hours. Ask for rescue now.'),
        ],
        calls: ['same', 'emergency'],
        options: [{ label: l('Seguir', 'Continue'), next: 'shock' }],
      },
      junction: {
        title: l('Ingle, axila o cuello', 'Groin, armpit or neck'),
        steps: [
          s('Ahí no sirve el torniquete. Rellená la herida con gasa o tela limpia, empujándola hacia adentro, y apretá fuerte encima con todo tu peso.', 'A tourniquet does not work there. Pack the wound with gauze or clean cloth, pushing it in, and press hard on top with your full weight.'),
          s('En el cuello apretá solo de un lado, sin rodearlo.', 'On the neck press on one side only, never around it.'),
          s('No sueltes hasta que llegue la ayuda.', 'Do not let go until help arrives.'),
        ],
        calls: ['same', 'emergency'],
        options: [{ label: l('Seguir', 'Continue'), next: 'shock' }],
      },
      trunk: {
        title: l('Pecho, abdomen o cabeza', 'Chest, belly or head'),
        steps: [
          s('Apretá con la mano y gasas, sin meter nada en la herida.', 'Press with your hand and gauze, without packing anything into the wound.'),
          s('Si hay un objeto clavado, no lo saques: apretá alrededor y fijalo.', 'If an object is stuck in, do not pull it out: press around it and secure it.'),
          s('Herida en el pecho que "sopla" aire: dejala tapada con la mano y una gasa, sin sellarla del todo.', 'A chest wound that "sucks" air: cover it with your hand and gauze, without fully sealing it.'),
          s('Si se ven órganos en el abdomen, no los empujes: tapalos con tela limpia y húmeda.', 'If organs show in the belly, do not push them back: cover them with a clean damp cloth.'),
        ],
        calls: ['same', 'emergency'],
        options: [{ label: l('Seguir', 'Continue'), next: 'shock' }],
      },
      stopped: {
        title: l('Paró el sangrado', 'Bleeding stopped'),
        steps: [
          s('Vendá firme encima de las gasas sin sacarlas.', 'Bandage firmly over the gauze without removing it.'),
          s('Si se vuelve a empapar, apretá otra vez o pasá al torniquete.', 'If it soaks through again, press again or go to the tourniquet.'),
          sc('Igual tiene que verla un médico: puede necesitar puntos.', 'A doctor still needs to see it: it may need stitches.'),
          sw('Una herida grande lejos de un hospital puede infectarse: limpiala con agua potable abundante cuando ya no sangre y cubrila; salí en cuanto se pueda.', 'A large wound far from a hospital may get infected: rinse it with plenty of drinking water once it stops bleeding and cover it; get out as soon as you can.'),
        ],
        options: [{ label: l('Seguir', 'Continue'), next: 'shock' }],
      },
      shock: {
        title: l('Prevenir el shock', 'Prevent shock'),
        steps: [
          s('Si está pálida, fría, sudorosa, con el pulso rápido o confundida, está en shock: es grave.', 'If they are pale, cold, sweaty, with a fast pulse or confused, they are in shock: it is serious.'),
          s('Acostada, abrigada y aislada del suelo. Hablale y tranquilizala.', 'Lying down, warm and insulated from the ground. Talk to them and reassure them.'),
          no('No le des de beber ni de comer.', 'Do not give food or drink.'),
          WATCH,
        ],
        calls: ['same', 'emergency'],
        options: [{ label: l('Deja de responder', 'Stops responding'), next: 'topic:assess' }],
      },
    },
  },

  {
    id: 'march',
    title: l('Trauma grave: método MARCH', 'Serious trauma: the MARCH method'),
    keywords: l('march tccc trauma hemorragia vía aérea respiración circulación hipotermia herida grave ifak', 'march tccc trauma hemorrhage airway breathing circulation hypothermia serious injury ifak'),
    start: 'intro',
    nodes: {
      intro: {
        title: l('Qué es MARCH', 'What MARCH is'),
        steps: [
          s('MARCH es un orden para atender a alguien muy lastimado: primero lo que mata más rápido. M: hemorragia masiva. A: vía aérea. R: respiración. C: circulación. H: hipotermia y cabeza.', 'MARCH is an order for treating a seriously injured person: first what kills fastest. M: massive bleeding. A: airway. R: breathing. C: circulation. H: hypothermia and head.'),
          s('Antes de nada, mirá que el lugar sea seguro y protegete (guantes o una bolsa en las manos). Si hay un peligro que seguís, no te acerques: pedí ayuda.', 'First check the scene is safe and protect yourself (gloves or a bag on your hands). If a danger remains, do not approach: call for help.'),
          sc('Llamá al {medical} apenas puedas (o que otra persona llame mientras vos atendés).', 'Call {medical} as soon as you can (or have someone call while you treat).'),
          WILD_RESCUE,
          s('Sale de las guías de trauma de combate civiles y militares (TCCC 2026 del Committee on TCCC y TECC 2024 de C-TECC), adaptadas para quien no es médico: no reemplaza un curso.', 'It comes from civilian and military trauma-care guidelines (TCCC 2026 by the Committee on TCCC and TECC 2024 by C-TECC), adapted for non-medical people: it does not replace a course.'),
        ],
        calls: ['same', 'emergency'],
        options: [{ label: l('Empezar por M: sangrado', 'Start with M: bleeding'), next: 'm' }],
      },
      m: {
        title: l('M · Hemorragia masiva', 'M · Massive bleeding'),
        steps: [
          s('Buscá sangrado fuerte en todo el cuerpo (también bajo la ropa o la espalda). Es lo primero: se muere por desangrado en minutos.', 'Look for heavy bleeding all over the body (also under clothing and on the back). It comes first: people bleed to death in minutes.'),
          s('Presión directa fuerte con gasa o tela. Si no para en un brazo o pierna y sigue saliendo en chorro: torniquete 5 a 7 cm por encima de la herida, sobre la piel, y anotá la hora.', 'Strong direct pressure with gauze or cloth. If it does not stop on an arm or leg and keeps spurting: tourniquet 5 to 7 cm above the wound, on the skin, and write down the time.'),
          s('Donde no va torniquete (ingle, axila, cuello) o si la presión no alcanza: rellená la herida con gasa hemostática y apretá al menos 3 minutos sin soltar.', 'Where a tourniquet does not fit (groin, armpit, neck) or pressure is not enough: pack the wound with hemostatic gauze and press at least 3 minutes without letting go.'),
          s('Después, un vendaje de presión encima, firme, sin sacar lo anterior.', 'Then a firm pressure bandage on top, without removing what is underneath.'),
          s('Las fuentes difieren sobre el torniquete en heridas comunes (Manual del Ministerio de Salud 2016: no usar; TCCC 2026 y TECC 2024: usar si el sangrado grave de un miembro no cede). La guía de sangrado de la app lo explica.', 'Sources differ on tourniquets for ordinary wounds (Ministry of Health manual 2016: do not use; TCCC 2026 and TECC 2024: use if severe limb bleeding does not stop). The app’s bleeding guide explains it.'),
          no('No aflojes un torniquete puesto: eso lo decide el médico.', 'Do not loosen a tourniquet once applied: a doctor decides that.'),
        ],
        calls: ['same', 'emergency'],
        options: [
          { label: l('Ver el paso a paso de sangrado', 'See the step-by-step bleeding guide'), next: 'topic:bleeding' },
          { label: l('Seguir con A: vía aérea', 'Continue with A: airway'), next: 'a' },
        ],
      },
      a: {
        title: l('A · Vía aérea', 'A · Airway'),
        steps: [
          s('Si habla o llora, la vía aérea está abierta. Dejala en la posición en que respire mejor (sentada o inclinada hacia adelante si hay sangre en la boca).', 'If they speak or cry, the airway is open. Let them stay in the position where they breathe best (sitting or leaning forward if there is blood in the mouth).'),
          s('Si está inconsciente pero respira: posición de recuperación (de costado, cabeza apenas hacia atrás, boca hacia abajo para que drene).', 'If unconscious but breathing: recovery position (on their side, head slightly back, mouth down so it drains).'),
          s('Sacá lo que se vea y moleste en la boca (sangre, vómito, un diente) sin meter los dedos a ciegas.', 'Remove what you can see blocking the mouth (blood, vomit, a tooth) without poking blindly with your fingers.'),
          s('Dispositivos como la cánula nasofaríngea o abrir la vía aérea con un corte son solo para personal entrenado.', 'Devices such as a nasopharyngeal airway or a surgical airway are for trained personnel only.'),
        ],
        calls: ['same', 'emergency'],
        options: [
          { label: l('No respira', 'Not breathing'), next: 'topic:cpr' },
          { label: l('Seguir con R: respiración', 'Continue with R: breathing'), next: 'r' },
        ],
      },
      r: {
        title: l('R · Respiración', 'R · Breathing'),
        steps: [
          s('Descubrí el pecho y mirá si hay heridas, si respira con dificultad o si un lado sube menos que el otro.', 'Expose the chest and look for wounds, labored breathing or one side rising less than the other.'),
          s('Herida en el pecho que «sopla» aire: tapala con un sello torácico ventilado, apretando al exhalar. Si no tenés, taparla con la mano y una gasa sin sellarla del todo.', 'A chest wound that «sucks» air: cover it with a vented chest seal, pressing as they breathe out. If you have none, cover it with your hand and gauze without fully sealing it.'),
          s('Si le cuesta cada vez más respirar y se pone azul o muy agitada, puede ser un neumotórax a tensión: es una urgencia que resuelve solo personal entrenado (descompresión con aguja). Pedí ayuda ya.', 'If breathing gets harder, and they turn blue or very agitated, it may be a tension pneumothorax: an emergency that only trained personnel can resolve (needle decompression). Call for help now.'),
        ],
        calls: ['same', 'emergency'],
        options: [
          { label: l('Más sobre heridas en el pecho', 'More about chest wounds'), next: 'topic:chest' },
          { label: l('Seguir con C: circulación', 'Continue with C: circulation'), next: 'c' },
        ],
      },
      c: {
        title: l('C · Circulación', 'C · Circulation'),
        steps: [
          s('Volvé a mirar los sangrados: ¿se empapó algo? ¿el torniquete sigue firme? Anotá la hora del torniquete en la piel o en su ropa.', 'Check the bleeding again: has anything soaked through? Is the tourniquet still tight? Write the tourniquet time on the skin or clothing.'),
          s('Señales de shock: pálida, fría, sudorosa, pulso rápido y débil, confundida. Acostala, abrigala y hablale.', 'Signs of shock: pale, cold, sweaty, fast weak pulse, confused. Lay them down, keep them warm and talk to them.'),
          s('Si sospechás una fractura de pelvis (golpe fuerte en la cadera, dolor al presionar): no la muevas más de lo necesario.', 'If you suspect a broken pelvis (hard hit to the hip, pain on pressing): do not move them more than necessary.'),
          no('No le des de comer ni de beber.', 'Do not give food or drink.'),
        ],
        calls: ['same', 'emergency'],
        options: [{ label: l('Seguir con H: frío y cabeza', 'Continue with H: cold and head'), next: 'h' }],
      },
      h: {
        title: l('H · Hipotermia y cabeza', 'H · Hypothermia and head'),
        steps: [
          s('Una persona herida pierde calor muy rápido y el frío empeora el sangrado: aislala del suelo, sacale la ropa mojada y envolvela con una manta de emergencia o ropa seca, cabeza incluida.', 'An injured person loses heat very fast and cold worsens bleeding: insulate from the ground, remove wet clothes and wrap with an emergency blanket or dry clothing, head included.'),
          s('Golpe en la cabeza: controlá cada pocos minutos si está despierta y responde; si se pone cada vez más dormida, confundida o vomita, es grave. Cabeza apenas elevada si está acostada y respira bien.', 'Head injury: check every few minutes that they are awake and responding; if they get drowsier, confused or vomit, it is serious. Head slightly raised if lying down and breathing well.'),
        ],
        calls: ['same', 'emergency'],
        options: [
          { label: l('Hipotermia', 'Hypothermia'), next: 'topic:hypothermia' },
          { label: l('Después de MARCH', 'After MARCH'), next: 'after' },
        ],
      },
      after: {
        title: l('Después: dolor, heridas y huesos', 'Afterwards: pain, wounds and bones'),
        steps: [
          s('Con la persona estable: cubrí las demás heridas con apósitos limpios; un objeto clavado no se saca, se fija; ojo lastimado: un escudo rígido sin apretarlo; órganos del abdomen a la vista: cubrir con tela limpia y húmeda, sin empujarlos.', 'With the person stable: cover other wounds with clean dressings; an impaled object is not removed, it is secured; injured eye: a rigid shield without pressing; organs showing from the belly: cover with a clean damp cloth without pushing them back.'),
          s('Inmovilizá las fracturas con férulas o lo que haya, sin forzar el hueso.', 'Immobilize fractures with splints or whatever you have, without forcing the bone.'),
          s('Para el dolor, consultá a un profesional: en un trauma con sangrado se evitan algunos analgésicos comunes (como la aspirina y el ibuprofeno).', 'For pain, ask a professional: with trauma and bleeding some common pain relievers (such as aspirin and ibuprofen) are avoided.'),
          s('Anotá la hora de cada cosa que hiciste y los cambios que viste, y dáselo a quien llegue.', 'Write down the time of everything you did and the changes you saw, and hand it to whoever arrives.'),
          s('Repetí MARCH cada pocos minutos: lo que estaba bien puede empeorar.', 'Repeat MARCH every few minutes: what was fine can get worse.'),
        ],
        calls: ['same', 'emergency'],
        options: [{ label: l('Fracturas', 'Fractures'), next: 'topic:fracture' }],
      },
    },
  },

  {
    id: 'altitude',
    title: l('Mal de altura (soroche)', 'Altitude sickness'),
    keywords: l('soroche altura mal de montaña apunamiento edema cerebral pulmonar puna', 'altitude sickness mountain sickness acute hace hape'),
    start: 'start',
    nodes: {
      start: {
        title: l('Mal agudo de montaña', 'Acute mountain sickness'),
        steps: [
          s('Aparece desde unos 2.500 m, sobre todo si se subió rápido: dolor de cabeza, náuseas, mareo, cansancio, mal sueño.', 'It appears from about 2,500 m, especially after a fast ascent: headache, nausea, dizziness, fatigue, poor sleep.'),
          s('Parar y no subir más: reposo, líquidos y comidas livianas. Si los síntomas son leves, suelen ceder en uno o dos días a la misma altura.', 'Stop and do not climb higher: rest, fluids and light meals. If symptoms are mild they usually ease in a day or two at the same altitude.'),
          s('Si empeora o no mejora, lo más efectivo es bajar: aunque sean unos cientos de metros.', 'If it worsens or does not improve, the most effective thing is to go down: even a few hundred meters.'),
          no('No sigas subiendo con síntomas, ni te automediques: consultá a un médico antes de tomar medicación para la altura.', 'Do not keep climbing with symptoms and do not self-medicate: ask a doctor before taking altitude medication.'),
          s('Llevá siempre quien te acompañe: los síntomas graves confunden a quien los tiene.', 'Always have someone with you: severe symptoms confuse the person who has them.'),
        ],
        question: l('¿Hay alguna de estas señales graves?', 'Is there any of these severe signs?'),
        options: [
          { label: l('Sí: confusión, tambalea al caminar, falta de aire en reposo o tos con espuma', 'Yes: confusion, stumbling, breathless at rest or frothy cough'), next: 'severe' },
          { label: l('No, solo síntomas leves', 'No, only mild symptoms'), next: 'start' },
        ],
      },
      severe: {
        title: l('Señales graves: bajar ya', 'Severe signs: go down now'),
        steps: [
          s('Confusión, no poder caminar en línea recta, mucha falta de aire estando quieto o tos con espuma pueden ser edema cerebral o pulmonar: son urgencias que matan.', 'Confusion, not being able to walk in a straight line, strong breathlessness at rest or a frothy cough may be cerebral or pulmonary edema: life-threatening emergencies.'),
          s('Bajar de inmediato, acompañado, y lo más posible: es el tratamiento que sirve. No esperes a ver si pasa.', 'Descend immediately, accompanied, as far as you can: it is the treatment that works. Do not wait to see if it passes.'),
          sw('Pedí rescate al {emergency} y pasá las coordenadas de «Mi ubicación». Si hay oxígeno o una cámara portátil de altura, que la use quien sepa.', 'Ask for rescue on {emergency} and give the coordinates from “My location”. If oxygen or a portable altitude chamber is available, someone who knows how should use it.'),
          sc('Llamá al {medical}.', 'Call {medical}.'),
          KEEP_WARM,
        ],
        calls: ['same', 'emergency'],
        options: [{ label: l('Deja de responder', 'Stops responding'), next: 'topic:assess' }],
      },
    },
  },

  {
    id: 'choking',
    title: l('Atragantamiento', 'Choking'),
    keywords: l('se ahoga atorado comida obstrucción heimlich', 'choking food obstruction heimlich'),
    start: 'start',
    nodes: {
      start: {
        title: l('¿Puede toser o hablar?', 'Can they cough or speak?'),
        steps: [s('Preguntale: "¿Te estás ahogando?"', 'Ask: "Are you choking?"')],
        question: l('¿Tose con fuerza o puede hablar?', 'Are they coughing hard or able to speak?'),
        options: [
          { label: l('Sí, tose', 'Yes, coughing'), next: 'cough' },
          { label: l('No puede toser, hablar ni respirar (adulto o niño)', 'Cannot cough, speak or breathe (adult or child)'), next: 'adult' },
          { label: l('Es un bebé (menos de 1 año)', 'It is a baby (under 1 year)'), next: 'baby' },
        ],
      },
      cough: {
        title: l('Que siga tosiendo', 'Keep them coughing'),
        steps: [
          s('Animala a toser fuerte. No le pegues en la espalda mientras tose bien.', 'Encourage strong coughing. Do not slap their back while they cough effectively.'),
          s('Quedate con ella: si deja de toser o se pone morada, pasá a los golpes.', 'Stay with them: if they stop coughing or turn blue, go to back blows.'),
        ],
        options: [{ label: l('Ya no puede toser', 'Can no longer cough'), next: 'adult' }],
      },
      adult: {
        title: l('Golpes en la espalda y compresiones abdominales', 'Back blows and abdominal thrusts'),
        steps: [
          s('Inclinala hacia adelante y dale hasta 5 golpes fuertes entre los omóplatos con el talón de la mano.', 'Lean them forward and give up to 5 sharp blows between the shoulder blades with the heel of your hand.'),
          s('Si no sale: parate detrás, puño arriba del ombligo, la otra mano encima, y tirá fuerte hacia adentro y arriba hasta 5 veces (maniobra de Heimlich).', 'If it does not come out: stand behind, fist above the belly button, other hand on top, and pull sharply in and up up to 5 times (Heimlich maneuver).'),
          s('Embarazadas o personas muy obesas: las compresiones van en el centro del pecho.', 'Pregnant or very obese people: do the thrusts on the center of the chest.'),
          s('Alterná 5 y 5 hasta que salga.', 'Alternate 5 and 5 until it comes out.'),
          s('Después de las compresiones abdominales tiene que verla un médico.', 'After abdominal thrusts a doctor must check them.'),
        ],
        calls: ['same', 'emergency'],
        options: [{ label: l('Dejó de responder', 'Stopped responding'), next: 'topic:cpr' }],
      },
      baby: {
        title: l('Bebé que se ahoga', 'Choking baby'),
        steps: [
          s('Ponelo boca abajo sobre tu antebrazo, la cabeza más baja que el cuerpo, sosteniéndole la mandíbula.', 'Lay the baby face down along your forearm, head lower than the body, supporting the jaw.'),
          s('Dale 5 golpes en la espalda entre los omóplatos con el talón de la mano.', 'Give 5 back blows between the shoulder blades with the heel of your hand.'),
          s('Si no sale, dalo vuelta y hacé 5 compresiones en el centro del pecho con dos dedos.', 'If it does not come out, turn the baby over and give 5 chest thrusts on the center of the chest with two fingers.'),
          s('Alterná 5 y 5. Si deja de responder, empezá la RCP.', 'Alternate 5 and 5. If the baby stops responding, start CPR.'),
          no('No hagas compresiones abdominales en bebés ni metas el dedo a ciegas en la boca.', 'Do not do abdominal thrusts on babies or sweep blindly in the mouth.'),
        ],
        calls: ['same', 'emergency'],
        options: [{ label: l('Dejó de responder', 'Stopped responding'), next: 'topic:cpr' }],
      },
    },
  },

  {
    id: 'snakebite',
    title: l('Mordedura de serpiente', 'Snakebite'),
    keywords: l('víbora yarará cascabel coral ofidio veneno', 'snake viper rattlesnake coral venom'),
    start: 'start',
    nodes: {
      start: {
        title: l('Mordedura de serpiente', 'Snakebite'),
        steps: [
          s('Alejate de la serpiente; no intentes atraparla ni matarla. Si se puede sin riesgo, sacale una foto de lejos.', 'Move away from the snake; do not try to catch or kill it. If it is safe, take a photo from a distance.'),
          s('En Argentina las peligrosas son la yarará, la cascabel y la coral. Toda mordedura se trata como venenosa.', 'In Argentina the dangerous ones are the pit vipers (yarará), rattlesnake and coral snake. Treat every bite as venomous.'),
          s('Calmala y que no se mueva: el movimiento esparce el veneno.', 'Keep them calm and still: movement spreads the venom.'),
          s('Sacale anillos, relojes y pulseras antes de que se hinche.', 'Remove rings, watches and bracelets before it swells.'),
          s('Inmovilizá el miembro con una férula (como una fractura), a la altura del corazón.', 'Immobilize the limb with a splint (like a fracture), at heart level.'),
          s('Marcá con birome el borde de la hinchazón y anotá la hora; repetilo cada 30 minutos.', 'Mark the edge of the swelling with a pen and write the time; repeat every 30 minutes.'),
          s('Llamá al {poison}: te dicen a qué hospital ir, el que tiene el antiveneno (suero).', 'Call {poison}: they will tell you which hospital to go to, the one with antivenom.'),
          sc('Llevala ya a ese hospital (o llamá al {same}). El antiveneno es el único tratamiento.', 'Take them to that hospital now (or call {same}). Antivenom is the only treatment.'),
          sw('Lo ideal es que la saquen otros (camilla, vehículo). Si está sola y tiene que caminar, que lo haga despacio, descansando. Pedí rescate y avisá que es una mordedura de serpiente.', 'Ideally others carry them out (stretcher, vehicle). If they are alone and must walk, walk slowly and rest. Ask for rescue and say it is a snakebite.'),
          no('No hagas torniquete, no cortes, no chupes el veneno, no pongas hielo ni calor, no des alcohol ni remedios caseros.', 'Do not use a tourniquet, cut, suck out the venom, apply ice or heat, or give alcohol or home remedies.'),
        ],
        calls: ['poison', 'same', 'emergency'],
        options: [{ label: l('Le cuesta respirar o deja de responder', 'Trouble breathing or stops responding'), next: 'topic:assess' }],
      },
    },
  },

  {
    id: 'stings',
    title: l('Picaduras: alacrán, araña, abeja', 'Stings: scorpion, spider, bee'),
    keywords: l('alacrán escorpión araña viuda negra rincón abeja avispa picadura', 'scorpion spider black widow recluse bee wasp sting'),
    start: 'start',
    nodes: {
      start: {
        title: l('¿Qué la picó?', 'What stung them?'),
        steps: [s('Si aparece hinchazón de labios o lengua, falta de aire o mareo, es una alergia grave.', 'If lips or tongue swell, they get short of breath or dizzy, it is a severe allergy.')],
        question: l('¿Qué fue?', 'What was it?'),
        options: [
          { label: l('Le cuesta respirar o se hincha la cara', 'Trouble breathing or face swelling'), next: 'topic:anaphylaxis' },
          { label: l('Alacrán', 'Scorpion'), next: 'scorpion' },
          { label: l('Araña', 'Spider'), next: 'spider' },
          { label: l('Abeja o avispa', 'Bee or wasp'), next: 'bee' },
        ],
      },
      scorpion: {
        title: l('Picadura de alacrán', 'Scorpion sting'),
        steps: [
          s('Lavá con agua y jabón y poné frío (hielo envuelto en un trapo).', 'Wash with soap and water and apply cold (ice wrapped in a cloth).'),
          s('Es grave en chicos menores de 14 años y en mayores: llevalos ya a un hospital. Puede necesitar antiveneno.', 'It is serious in children under 14 and in the elderly: take them to a hospital now. They may need antivenom.'),
          s('Signos de alarma: vómitos, sudor, babeo, temblores, agitación, dolor de panza.', 'Warning signs: vomiting, sweating, drooling, tremors, agitation, belly pain.'),
          s('Llamá al {poison} para saber dónde hay antiveneno.', 'Call {poison} to find out where there is antivenom.'),
          sw('En un chico es una evacuación urgente: no esperes a ver si aparecen síntomas.', 'In a child it is an urgent evacuation: do not wait to see if symptoms appear.'),
          no('No cortes ni chupes la picadura.', 'Do not cut or suck the sting.'),
        ],
        calls: ['poison', 'poisonKids', 'same'],
      },
      spider: {
        title: l('Picadura de araña', 'Spider bite'),
        steps: [
          s('Lavá y poné frío. Si se puede, guardá la araña (en un frasco) o sacale una foto.', 'Wash and apply cold. If possible, keep the spider (in a jar) or photograph it.'),
          s('Viuda negra: dolor que se extiende, calambres, panza dura, sudor. Araña del rincón: herida dolorosa que se pone violeta en horas. Las dos necesitan hospital.', 'Black widow: spreading pain, cramps, rigid belly, sweating. Recluse spider: painful wound turning purple within hours. Both need a hospital.'),
          s('Llamá al {poison}.', 'Call {poison}.'),
          no('No cortes, no chupes, no pongas calor.', 'Do not cut, suck or apply heat.'),
        ],
        calls: ['poison', 'same'],
      },
      bee: {
        title: l('Abeja o avispa', 'Bee or wasp'),
        steps: [
          s('Si quedó el aguijón, sacalo raspando con una tarjeta o la uña, sin apretarlo.', 'If the stinger is left in, scrape it out with a card or fingernail, without squeezing.'),
          s('Lavá y poné frío 10 a 20 minutos.', 'Wash and apply cold for 10 to 20 minutes.'),
          s('Controlala 30 minutos: si se le hincha la cara o le falta el aire, es anafilaxia.', 'Watch them for 30 minutes: if the face swells or they get short of breath, it is anaphylaxis.'),
          s('Muchas picaduras juntas o en la boca o garganta: hospital.', 'Many stings at once or in the mouth or throat: hospital.'),
        ],
        options: [{ label: l('Se le hincha la cara o le falta el aire', 'Face swelling or short of breath'), next: 'topic:anaphylaxis' }],
      },
    },
  },

  {
    id: 'anaphylaxis',
    title: l('Reacción alérgica grave (anafilaxia)', 'Severe allergic reaction (anaphylaxis)'),
    keywords: l('alergia anafilaxia adrenalina epipen hinchazón', 'allergy anaphylaxis adrenaline epinephrine epipen swelling'),
    start: 'start',
    nodes: {
      start: {
        title: l('Anafilaxia', 'Anaphylaxis'),
        steps: [
          s('Señales: hinchazón de labios, lengua o garganta, ronquera, silbido al respirar, falta de aire, ronchas con mareo o desmayo.', 'Signs: swollen lips, tongue or throat, hoarseness, wheezing, shortness of breath, hives with dizziness or fainting.'),
          CALL_SPEAKER,
          s('Si tiene adrenalina autoinyectable (EpiPen), usala ya en la cara externa del muslo, aun sobre la ropa. Anotá la hora.', 'If they have an adrenaline auto-injector (EpiPen), use it now on the outer thigh, even through clothing. Write down the time.'),
          s('Si no mejora en 5 minutos y tiene otra dosis, ponela.', 'If there is no improvement in 5 minutes and there is another dose, give it.'),
          s('Si le falta el aire, que se siente; si está mareada o pálida, acostada con las piernas levantadas.', 'If short of breath, let them sit up; if dizzy or pale, lying down with legs raised.'),
          no('No la hagas parar ni caminar de golpe: puede desmayarse.', 'Do not make them stand or walk suddenly: they may collapse.'),
          sw('Aunque mejore con la adrenalina, el efecto dura poco y la reacción puede volver: es una evacuación urgente.', 'Even if they improve with adrenaline, the effect is short and the reaction can come back: it is an urgent evacuation.'),
          WILD_RESCUE,
        ],
        calls: ['same', 'emergency'],
        options: [{ label: l('Deja de responder o de respirar', 'Stops responding or breathing'), next: 'topic:cpr' }],
      },
    },
  },

  {
    id: 'fall',
    title: l('Caída de altura o golpe fuerte', 'Fall from height or heavy blow'),
    keywords: l('caída escalada pared columna cuello espalda accidente choque golpe cabeza', 'fall climbing wall spine neck back accident crash head injury'),
    start: 'start',
    nodes: {
      start: {
        title: l('Posible lesión de columna', 'Possible spinal injury'),
        steps: [
          s('Después de una caída de altura o un golpe fuerte, pensá que puede tener la columna lesionada.', 'After a fall from height or a heavy blow, assume the spine may be injured.'),
          s('No la muevas, salvo que corra peligro (fuego, agua, piedras): en ese caso movela en bloque, cabeza, cuello y cuerpo alineados.', 'Do not move them, unless they are in danger (fire, water, rocks): then move them as a block, head, neck and body aligned.'),
          s('Pedile que no se mueva. Sostené la cabeza con tus manos a los costados, alineada con el cuerpo.', 'Ask them not to move. Hold the head with your hands on both sides, in line with the body.'),
          sw('Si colgaba del arnés, bajala lo antes posible; una vez abajo, acostala.', 'If they were hanging in a harness, get them down as soon as possible; once down, lay them flat.'),
        ],
        question: l('¿Responde y respira normalmente?', 'Do they respond and breathe normally?'),
        options: [
          { label: l('Responde', 'They respond'), next: 'conscious' },
          { label: l('No responde pero respira', 'Unresponsive but breathing'), next: 'unconscious' },
          { label: l('No respira', 'Not breathing'), next: 'topic:cpr' },
        ],
      },
      conscious: {
        title: l('Responde', 'They respond'),
        steps: [
          s('Preguntale dónde le duele y si siente y mueve manos y pies (sin que se levante).', 'Ask where it hurts and whether they can feel and move hands and feet (without getting up).'),
          s('Buscá sangrado y controlalo.', 'Look for bleeding and control it.'),
          s('Alarma: dolor de cuello o espalda, hormigueo o no sentir las piernas, confusión, vómitos, sueño, pupilas distintas, sangre o líquido por oído o nariz.', 'Warning signs: neck or back pain, tingling or no feeling in the legs, confusion, vomiting, drowsiness, unequal pupils, blood or fluid from ears or nose.'),
          sc('Con cualquier señal de alarma, llamá al {same} y que no se mueva hasta que lleguen.', 'With any warning sign, call {same} and keep them still until help arrives.'),
          WILD_RESCUE,
          sw('Prepará una espera larga: abrigo, aislamiento del suelo, reparo del viento y la lluvia. Que no camine con dolor de columna o golpe en la cabeza.', 'Prepare for a long wait: warmth, insulation from the ground, shelter from wind and rain. They must not walk with spinal pain or a head injury.'),
          KEEP_WARM,
          WATCH,
          no('No le des de comer ni de beber (puede necesitar cirugía).', 'Do not give food or drink (they may need surgery).'),
        ],
        calls: ['same', 'emergency'],
        options: [
          { label: l('Sangra mucho', 'Heavy bleeding'), next: 'topic:bleeding' },
          { label: l('Tiene algo roto', 'Something is broken'), next: 'topic:fracture' },
        ],
      },
      unconscious: {
        title: l('No responde pero respira', 'Unresponsive but breathing'),
        steps: [
          CALL_SPEAKER,
          s('Dejala boca arriba sosteniendo la cabeza alineada. Si vomita o le cuesta respirar, girala de costado en bloque (mejor entre dos o tres).', 'Leave them on their back holding the head aligned. If they vomit or struggle to breathe, roll them on their side as a block (ideally two or three people).'),
          s('Controlá la respiración todo el tiempo: si deja de respirar, RCP.', 'Keep checking breathing: if it stops, CPR.'),
          KEEP_WARM,
          WILD_RESCUE,
        ],
        calls: ['same', 'emergency'],
        options: [{ label: l('Dejó de respirar', 'Stopped breathing'), next: 'topic:cpr' }],
      },
    },
  },

  {
    id: 'fracture',
    title: l('Fractura, luxación o esguince', 'Fracture, dislocation or sprain'),
    keywords: l('hueso roto fractura quebradura esguince torcedura entablillar férula', 'broken bone fracture sprain splint'),
    start: 'start',
    nodes: {
      start: {
        title: l('Inmovilizar', 'Immobilize'),
        steps: [
          s('Señales: dolor fuerte, deformidad, hinchazón, no puede mover o apoyar.', 'Signs: severe pain, deformity, swelling, cannot move or bear weight.'),
          s('Si el hueso asoma o hay herida, tapala con gasa limpia y controlá el sangrado sin empujar el hueso.', 'If bone shows or there is a wound, cover it with clean gauze and control bleeding without pushing the bone.'),
          s('Inmovilizalo como está, sin enderezarlo: la férula toma la articulación de arriba y la de abajo. Acolchá con ropa.', 'Immobilize it as it is, without straightening it: the splint spans the joint above and below. Pad with clothing.'),
          s('Brazo: cabestrillo con un pañuelo o la campera. Pierna: atala a la otra pierna con algo rígido en el medio.', 'Arm: sling with a scarf or jacket. Leg: tie it to the other leg with something rigid in between.'),
          s('Controlá que los dedos sigan tibios y rosados; si se ponen fríos, azules o con hormigueo, aflojá las ataduras.', 'Check that fingers or toes stay warm and pink; if they turn cold, blue or tingly, loosen the ties.'),
          s('Frío envuelto en un trapo 20 minutos para el dolor y la hinchazón.', 'Cold wrapped in a cloth for 20 minutes for pain and swelling.'),
          sw('Improvisá la férula con bastones, ramas, el aislante o la mochila. Con una pierna lastimada no camines: pedí rescate. Con un brazo inmovilizado, en general se puede caminar.', 'Improvise the splint with poles, branches, the sleeping pad or a backpack. With an injured leg do not walk: ask for rescue. With an immobilized arm you can usually walk.'),
          s('Fémur (muslo) o pelvis: pueden sangrar mucho por dentro; no la muevas y tratá el shock.', 'Thigh bone or pelvis: they can bleed a lot internally; do not move them and treat for shock.'),
          no('No intentes acomodar el hueso ni la articulación.', 'Do not try to set the bone or the joint.'),
        ],
        calls: ['same'],
        options: [{ label: l('Está pálida, fría y sudorosa', 'Pale, cold and sweaty'), next: 'topic:bleeding#shock' }],
      },
    },
  },

  {
    id: 'burns',
    title: l('Quemaduras', 'Burns'),
    keywords: l('quemadura fuego agua hirviendo aceite químico eléctrica', 'burn fire scald boiling oil chemical electrical'),
    start: 'start',
    nodes: {
      start: {
        title: l('Frenar la quemadura y enfriar', 'Stop the burning and cool'),
        steps: [
          s('Si la ropa se prende fuego: que se tire al piso y ruede, o apagalo con una manta.', 'If clothing catches fire: stop, drop and roll, or smother it with a blanket.'),
          s('Enfriá con agua corriente fresca (no helada) durante 20 minutos. Sirve aunque haya pasado un rato.', 'Cool with cool (not ice-cold) running water for 20 minutes. It helps even if some time has passed.'),
          s('Sacale anillos, relojes y la ropa que no esté pegada.', 'Remove rings, watches and any clothing that is not stuck.'),
          s('Tapá con film de cocina o un trapo limpio, sin apretar.', 'Cover loosely with cling film or a clean cloth.'),
          s('Abrigá el resto del cuerpo: enfriar mucho puede dar hipotermia, sobre todo en chicos.', 'Keep the rest of the body warm: too much cooling can cause hypothermia, especially in children.'),
          no('No pongas hielo, manteca, aceite, pasta de dientes ni cremas. No revientes las ampollas.', 'Do not apply ice, butter, oil, toothpaste or creams. Do not pop blisters.'),
        ],
        question: l('¿Cómo fue?', 'What kind of burn?'),
        options: [
          { label: l('Fuego, agua o aceite caliente', 'Fire, hot water or oil'), next: 'severity' },
          { label: l('Químico', 'Chemical'), next: 'chemical' },
          { label: l('Electricidad o rayo', 'Electricity or lightning'), next: 'electrical' },
        ],
      },
      severity: {
        title: l('¿Necesita médico?', 'Does it need a doctor?'),
        steps: [
          s('Va al médico si: es más grande que la palma de su mano, está en cara, manos, pies, genitales o articulaciones, se ve blanca o negra, o es un chico o un mayor.', 'See a doctor if: it is larger than their palm, on the face, hands, feet, genitals or joints, looks white or charred, or the person is a child or elderly.'),
          s('Si respiró humo, tiene hollín en la nariz, ronquera o tos: urgencia, aunque se vea bien.', 'If they breathed smoke, have soot in the nose, hoarseness or cough: emergency, even if they look fine.'),
          sc('Quemaduras graves: llamá al {same}; te derivan a un centro de quemados.', 'Severe burns: call {same}; they will refer you to a burns center.'),
          sw('Si el agua es poca, usala para enfriar (es lo más importante) y guardá para beber. Quemaduras grandes, en la cara o por humo: evacuación.', 'If water is scarce, use it to cool the burn (it matters most) and keep some for drinking. Large burns, on the face or from smoke: evacuate.'),
          sw('Dale de beber de a sorbos si está consciente: las quemaduras grandes deshidratan.', 'Give sips of water if they are conscious: large burns dehydrate.'),
        ],
        calls: ['same', 'burns'],
      },
      chemical: {
        title: l('Quemadura química', 'Chemical burn'),
        steps: [
          s('Protegete las manos. Si es polvo, sacudilo antes de mojar.', 'Protect your hands. If it is a powder, brush it off before wetting.'),
          s('Lavá con mucha agua corriente al menos 20 minutos; en los ojos, con el ojo abierto, desde adentro hacia afuera.', 'Rinse with plenty of running water for at least 20 minutes; for eyes, keep the eye open and rinse from the inside out.'),
          s('Sacale la ropa contaminada. Guardá el envase del producto.', 'Remove contaminated clothing. Keep the product container.'),
          s('Llamá al {poison}.', 'Call {poison}.'),
        ],
        calls: ['poison', 'same'],
      },
      electrical: {
        title: l('Electricidad o rayo', 'Electricity or lightning'),
        steps: [
          s('Cortá la luz antes de tocarla. Si no podés, separala con algo seco que no conduzca (madera, plástico).', 'Cut the power before touching them. If you cannot, push them away with something dry and non-conductive (wood, plastic).'),
          s('Cables de alta tensión: no te acerques, llamá al {emergency}.', 'High-voltage lines: do not approach, call {emergency}.'),
          s('Siempre va al médico: puede tener lesiones por dentro y alteraciones del ritmo del corazón.', 'Always see a doctor: there can be internal injuries and heart rhythm problems.'),
          s('Alguien alcanzado por un rayo no queda "cargado": se lo puede tocar y reanimar enseguida.', 'A lightning victim is not "charged": you can touch them and resuscitate right away.'),
        ],
        calls: ['same', 'emergency'],
        options: [{ label: l('No responde', 'Unresponsive'), next: 'topic:assess' }],
      },
    },
  },

  {
    id: 'chest',
    title: l('Dolor de pecho', 'Chest pain'),
    keywords: l('infarto corazón dolor pecho brazo', 'heart attack chest pain arm'),
    start: 'start',
    nodes: {
      start: {
        title: l('Posible infarto', 'Possible heart attack'),
        steps: [
          s('Señales: dolor u opresión en el pecho que puede ir al brazo, cuello, mandíbula o espalda; falta de aire, sudor frío, náuseas.', 'Signs: chest pain or pressure that may spread to the arm, neck, jaw or back; shortness of breath, cold sweat, nausea.'),
          CALL_SPEAKER,
          s('Que deje todo y se siente cómoda, semisentada.', 'Have them stop everything and sit comfortably, half sitting.'),
          s('Si es adulto, no es alérgico a la aspirina y no tiene riesgo de sangrado, que mastique una aspirina (300 mg).', 'If adult, not allergic to aspirin and with no bleeding risk, have them chew one aspirin (300 mg).'),
          s('Si tiene nitroglicerina recetada, ayudala a tomarla.', 'If they have prescribed nitroglycerin, help them take it.'),
          s('Buscá un desfibrilador (DEA) por si hace falta.', 'Look for a defibrillator (AED) in case it is needed.'),
          sw('Que no camine ni cargue peso: el esfuerzo empeora el infarto. Pedí rescate.', 'They must not walk or carry weight: effort worsens a heart attack. Ask for rescue.'),
          WILD_RESCUE,
        ],
        calls: ['same', 'emergency'],
        options: [{ label: l('Deja de responder o de respirar', 'Stops responding or breathing'), next: 'topic:cpr' }],
      },
    },
  },

  {
    id: 'stroke',
    title: l('ACV (ataque cerebral)', 'Stroke'),
    keywords: l('acv ataque cerebral derrame cara torcida brazo habla', 'stroke face drooping arm weakness speech'),
    start: 'start',
    nodes: {
      start: {
        title: l('Posible ACV: cada minuto cuenta', 'Possible stroke: every minute counts'),
        steps: [
          s('Pedile que sonría (¿se le tuerce la cara?), que levante los dos brazos (¿uno cae?) y que repita una frase (¿habla mal?).', 'Ask them to smile (does the face droop?), raise both arms (does one drift down?) and repeat a sentence (is speech slurred?).'),
          s('Con cualquiera de las tres, llamá ya al {same}: hay tratamientos que solo sirven en las primeras horas.', 'With any of the three, call {same} now: some treatments only work in the first hours.'),
          s('Anotá la hora en que empezó (o la última vez que se la vio bien).', 'Write down when it started (or the last time they were seen well).'),
          s('Si se desvanece pero respira, posición lateral de seguridad.', 'If they pass out but breathe, recovery position.'),
          no('No le des de comer, de beber ni remedios: puede atragantarse.', 'Do not give food, drink or medication: they may choke.'),
          sw('Es una evacuación urgente: el tiempo hasta el hospital define las secuelas.', 'This is an urgent evacuation: time to hospital determines the damage.'),
          WILD_RESCUE,
        ],
        calls: ['same', 'emergency'],
        options: [{ label: l('Deja de responder', 'Stops responding'), next: 'topic:assess' }],
      },
    },
  },

  {
    id: 'seizure',
    title: l('Convulsión', 'Seizure'),
    keywords: l('convulsión epilepsia ataque', 'seizure epilepsy fit'),
    start: 'start',
    nodes: {
      start: {
        title: l('Durante la convulsión', 'During the seizure'),
        steps: [
          s('Alejá lo que la pueda lastimar y poné algo blando bajo la cabeza.', 'Move away anything that could hurt them and put something soft under the head.'),
          s('Mirá la hora: importa cuánto dura.', 'Check the time: duration matters.'),
          no('No la sujetes ni le metas nada en la boca (no se traga la lengua).', 'Do not hold them down or put anything in their mouth (they will not swallow their tongue).'),
          s('Cuando termina, ponela de costado y dejala descansar: es normal que esté confundida un rato.', 'When it stops, put them on their side and let them rest: confusion for a while is normal.'),
          s('Llamá al {same} si dura más de 5 minutos, se repite, es la primera vez, se lastimó, pasó en el agua, está embarazada, es diabética o no se despierta.', 'Call {same} if it lasts more than 5 minutes, repeats, is the first one, they got hurt, it happened in water, they are pregnant, diabetic or do not wake up.'),
          s('En un chico con fiebre: sacale ropa y bajá la fiebre de a poco, sin bañarlo en agua fría.', 'In a child with fever: remove clothing and lower the fever gradually, without a cold bath.'),
        ],
        calls: ['same'],
        options: [{ label: l('No respira después', 'Not breathing afterwards'), next: 'topic:cpr' }],
      },
    },
  },

  {
    id: 'poisoning',
    title: l('Intoxicación o gas', 'Poisoning or gas'),
    keywords: l('intoxicación veneno pastillas lavandina monóxido brasero gas hongos plantas', 'poisoning pills bleach carbon monoxide gas mushrooms plants'),
    start: 'start',
    nodes: {
      start: {
        title: l('¿Cómo fue?', 'How did it happen?'),
        steps: [s('Averiguá qué fue, cuánto y a qué hora. Guardá el envase, la planta o el hongo.', 'Find out what, how much and when. Keep the container, plant or mushroom.')],
        question: l('¿Cómo se intoxicó?', 'How were they poisoned?'),
        options: [
          { label: l('Lo tragó', 'Swallowed it'), next: 'swallowed' },
          { label: l('Respiró gas o humo (brasero, estufa, auto)', 'Breathed gas or smoke (brazier, heater, car)'), next: 'gas' },
          { label: l('En la piel o los ojos', 'On the skin or in the eyes'), next: 'skin' },
        ],
      },
      swallowed: {
        title: l('Lo tragó', 'Swallowed'),
        steps: [
          s('Llamá al {poison} y seguí sus indicaciones.', 'Call {poison} and follow their advice.'),
          no('No la hagas vomitar, no le des leche, aceite ni nada sin que te lo indiquen.', 'Do not make them vomit or give milk, oil or anything unless told to.'),
          s('Si se duerme pero respira, posición lateral de seguridad.', 'If they become drowsy but breathe, recovery position.'),
        ],
        calls: ['poison', 'poisonKids', 'same'],
        options: [{ label: l('No responde', 'Unresponsive'), next: 'topic:assess' }],
      },
      gas: {
        title: l('Gas o humo', 'Gas or smoke'),
        steps: [
          s('El monóxido (braseros, estufas, calefones, autos en lugares cerrados) no tiene olor: si varios tienen dolor de cabeza, mareos o náuseas a la vez, sospechalo.', 'Carbon monoxide (braziers, heaters, water heaters, cars in closed spaces) has no smell: if several people have headache, dizziness or nausea at once, suspect it.'),
          s('Abrí puertas y ventanas y sacá a todos al aire libre, sin exponerte de más.', 'Open doors and windows and get everyone outside, without exposing yourself too much.'),
          no('No prendas ni apagues luces ni nada que haga chispa si huele a gas.', 'Do not switch lights or anything that sparks if you smell gas.'),
          s('Llamá al {same}: aunque se recupere, necesita oxígeno y control.', 'Call {same}: even if they recover, they need oxygen and a checkup.'),
        ],
        calls: ['same', 'emergency', 'poison'],
        options: [{ label: l('No responde', 'Unresponsive'), next: 'topic:assess' }],
      },
      skin: {
        title: l('Piel u ojos', 'Skin or eyes'),
        steps: [
          s('Sacale la ropa contaminada y lavá con mucha agua 15 a 20 minutos.', 'Remove contaminated clothing and rinse with plenty of water for 15 to 20 minutes.'),
          s('Ojos: con el ojo abierto, agua corriente desde adentro hacia afuera; sacale las lentes de contacto.', 'Eyes: keep the eye open, running water from the inside out; remove contact lenses.'),
          s('Llamá al {poison} con el envase a mano.', 'Call {poison} with the container at hand.'),
        ],
        calls: ['poison', 'same'],
      },
    },
  },

  {
    id: 'hypothermia',
    title: l('Hipotermia (mucho frío)', 'Hypothermia (very cold)'),
    keywords: l('hipotermia frío congelamiento nieve temblor', 'hypothermia cold frostbite snow shivering'),
    start: 'start',
    nodes: {
      start: {
        title: l('Hipotermia', 'Hypothermia'),
        steps: [
          s('Señales: tiembla, torpe, habla arrastrada, confundida. Grave: deja de temblar, somnolienta, apática.', 'Signs: shivering, clumsy, slurred speech, confused. Severe: stops shivering, drowsy, apathetic.'),
          s('Llevala a un reparo del viento y la humedad. Sacale la ropa mojada y poné ropa seca.', 'Move them out of the wind and wet. Replace wet clothes with dry ones.'),
          s('Aislala del suelo y envolvela entera (bolsa de dormir, mantas, manta térmica), cabeza incluida.', 'Insulate from the ground and wrap them fully (sleeping bag, blankets, emergency blanket), head included.'),
          s('Si está despierta y traga bien: bebidas tibias y dulces, y algo de comer.', 'If awake and able to swallow: warm sweet drinks and some food.'),
          s('Calor en el pecho, axilas e ingle (botellas tibias envueltas), no en brazos y piernas.', 'Heat on the chest, armpits and groin (wrapped warm bottles), not on arms and legs.'),
          s('Con hipotermia grave, movela con mucho cuidado y horizontal: los golpes pueden alterar el corazón.', 'With severe hypothermia, move them very gently and horizontally: jolts can upset the heart rhythm.'),
          no('No la frotes, no le des alcohol ni la metas en agua caliente.', 'Do not rub them, give alcohol or put them in hot water.'),
          sc('Si está confundida o dejó de temblar, llamá al {same}.', 'If confused or no longer shivering, call {same}.'),
          WILD_RESCUE,
        ],
        calls: ['same', 'emergency'],
        options: [{ label: l('No responde o no respira', 'Unresponsive or not breathing'), next: 'topic:cpr' }],
      },
    },
  },

  {
    id: 'heat',
    title: l('Golpe de calor', 'Heat stroke'),
    keywords: l('golpe de calor insolación deshidratación temperatura', 'heat stroke sunstroke dehydration'),
    start: 'start',
    nodes: {
      start: {
        title: l('Golpe de calor', 'Heat stroke'),
        steps: [
          s('Señales: piel muy caliente, confusión, mareo, dolor de cabeza, vómitos, puede dejar de sudar.', 'Signs: very hot skin, confusion, dizziness, headache, vomiting, may stop sweating.'),
          s('Con confusión es una emergencia: enfriala ya, es lo que le salva la vida.', 'With confusion it is an emergency: cool them now, that is what saves their life.'),
          s('Lo mejor: sumergirla hasta el cuello en agua fría (río, arroyo, bañera). Si no: mojala entera y abanicá, y poné frío en cuello, axilas e ingle.', 'Best: immerse up to the neck in cold water (river, stream, bathtub). Otherwise: soak them all over and fan, and put cold on the neck, armpits and groin.'),
          s('Si está despierta, que tome agua fresca o con sales de a sorbos.', 'If awake, give cool water or oral rehydration salts in sips.'),
          s('Parás de enfriar cuando vuelve a estar lúcida.', 'Stop cooling when they are clear-headed again.'),
          sc('Llamá al {same}.', 'Call {same}.'),
          WILD_RESCUE,
        ],
        calls: ['same', 'emergency'],
        options: [{ label: l('No responde', 'Unresponsive'), next: 'topic:assess' }],
      },
    },
  },

  {
    id: 'hypoglycemia',
    title: l('Diabético con baja de azúcar', 'Low blood sugar (diabetic)'),
    keywords: l('diabetes hipoglucemia azúcar insulina', 'diabetes hypoglycemia sugar insulin'),
    start: 'start',
    nodes: {
      start: {
        title: l('Baja de azúcar', 'Low blood sugar'),
        steps: [
          s('Señales en un diabético: sudor, temblor, palidez, confusión o comportamiento raro.', 'Signs in a diabetic: sweating, shaking, paleness, confusion or odd behavior.'),
          s('Si está despierta y traga bien: azúcar rápida (3 o 4 caramelos, un vaso de gaseosa común o jugo, 2 cucharadas de azúcar en agua).', 'If awake and able to swallow: fast sugar (3 or 4 candies, a glass of regular soda or juice, 2 tablespoons of sugar in water).'),
          s('Si a los 15 minutos no mejora, repetí. Cuando mejora, que coma algo (pan, galletitas).', 'If not better in 15 minutes, repeat. Once better, have them eat something (bread, crackers).'),
          no('Si no traga o no responde, no le des nada por boca: posición lateral y llamá al {same}.', 'If they cannot swallow or do not respond, give nothing by mouth: recovery position and call {same}.'),
        ],
        calls: ['same'],
        options: [{ label: l('No responde', 'Unresponsive'), next: 'topic:assess' }],
      },
    },
  },

  {
    id: 'drowning',
    title: l('Ahogamiento', 'Drowning'),
    keywords: l('ahogado agua río pileta mar rescate', 'drowning water river pool sea rescue'),
    start: 'start',
    nodes: {
      start: {
        title: l('Sacarla del agua sin ahogarte vos', 'Get them out without drowning yourself'),
        steps: [
          s('No te tires si no sabés rescatar: alcanzale un palo, una soga o algo que flote, desde la orilla.', 'Do not jump in unless trained: reach out with a stick or rope or throw something that floats, from the shore.'),
          s('Afuera del agua: si no respira, empezá con 5 respiraciones y seguí con la RCP.', 'Out of the water: if not breathing, start with 5 rescue breaths and continue with CPR.'),
          s('Si respira, posición lateral de seguridad, sacale la ropa mojada y abrigala.', 'If breathing, recovery position, remove wet clothes and keep them warm.'),
          s('Aunque se recupere, tiene que verla un médico: puede complicarse horas después.', 'Even if they recover, a doctor must check them: it can get worse hours later.'),
        ],
        calls: ['same', 'emergency'],
        options: [{ label: l('No respira', 'Not breathing'), next: 'topic:cpr' }],
      },
    },
  },
];

export const TOPIC_BY_ID = new Map(TOPICS.map((t) => [t.id, t]));

/** A dónde lleva una opción: tema y paso. */
export function resolveNext(currentTopic: string, next: string): { topic: string; node: string } {
  if (!next.startsWith('topic:')) return { topic: currentTopic, node: next };
  const [topic, node] = next.slice(6).split('#') as [string, string | undefined];
  return { topic, node: node ?? TOPIC_BY_ID.get(topic)?.start ?? '' };
}
