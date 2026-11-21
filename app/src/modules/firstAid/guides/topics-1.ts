import type { Topic } from './types';
import { CALL_SPEAKER, KEEP_WARM, l, no, s, sc, sw, WATCH, WILD_RESCUE } from './helpers';

/** Evaluación inicial, pedir rescate, RCP, no responde pero respira y sangrado. */
export const TOPICS_1: Topic[] = [
  {
    id: 'assess',
    title: l('Evaluación inicial', 'First assessment', 'Avaliação inicial'),
    keywords: l('empezar evaluar qué hago', 'start assess what do I do', 'começar avaliar o que fazer'),
    start: 'safe',
    nodes: {
      safe: {
        title: l('¿El lugar es seguro?', 'Is the scene safe?', 'O local é seguro?'),
        steps: [
          s(
            'Mirá alrededor antes de acercarte: tránsito, fuego, humo, cables, gas, agua, piedras que caen, animales.',
            'Look around before approaching: traffic, fire, smoke, wires, gas, water, falling rocks, animals.',
            'Olhe ao redor antes de se aproximar: trânsito, fogo, fumaça, fios, gás, água, pedras caindo, animais.',
          ),
          s('Si hay sangre, ponete guantes o una bolsa en las manos.', 'If there is blood, put gloves or a plastic bag on your hands.', 'Se houver sangue, coloque luvas ou um saco plástico nas mãos.'),
        ],
        question: l('¿Podés acercarte sin ponerte en peligro?', 'Can you get close without putting yourself in danger?', 'Você consegue se aproximar sem se colocar em perigo?'),
        options: [
          { answer: 'yes', label: l('Sí, es seguro', 'Yes, it is safe', 'Sim, é seguro'), next: 'responds' },
          { answer: 'no', label: l('No', 'No', 'Não'), next: 'unsafe' },
        ],
      },
      unsafe: {
        title: l('No es seguro', 'It is not safe', 'Não é seguro'),
        steps: [
          s('No te acerques: si te lastimás, son dos para rescatar.', 'Do not go in: if you get hurt, there are two people to rescue.', 'Não se aproxime: se você se machucar, serão duas pessoas para resgatar.'),
          sc(
            'Llamá al {emergency} (o al {fire} si hay fuego) y esperá a los que tienen equipo.',
            'Call {emergency} (or {fire} for fire) and wait for equipped responders.',
            'Ligue para o {emergency} (ou para o {fire}, se houver fogo) e espere quem tem equipamento.',
          ),
          WILD_RESCUE,
          s(
            'Si podés sin riesgo, eliminá el peligro: cortá la luz, señalizá el accidente o alejá el fuego.',
            'If you can do it without risk, remove the danger: cut the power, signal the crash or move the fire away.',
            'Se der sem risco, elimine o perigo: desligue a energia, sinalize o acidente ou afaste o fogo.',
          ),
        ],
        calls: ['emergency', 'fire'],
        options: [
          { label: l('Ya es seguro', 'It is safe now', 'Agora é seguro'), next: 'responds' },
          { label: l('Cómo pedir rescate', 'How to ask for rescue', 'Como pedir resgate'), next: 'topic:rescue' },
        ],
      },
      responds: {
        title: l('¿Responde?', 'Do they respond?', 'A pessoa responde?'),
        steps: [
          s(
            'Tocale los hombros y preguntale fuerte: «¿Me escuchás?»',
            'Tap their shoulders and ask loudly: “Can you hear me?”',
            'Toque nos ombros da pessoa e pergunte em voz alta: “Você está me ouvindo?”',
          ),
        ],
        question: l('¿Responde, se mueve o abre los ojos?', 'Do they answer, move or open their eyes?', 'Ela responde, se mexe ou abre os olhos?'),
        options: [
          { answer: 'yes', label: l('Sí', 'Yes', 'Sim'), next: 'bleeding' },
          { answer: 'no', label: l('No responde', 'No response', 'Não responde'), next: 'breathing' },
        ],
      },
      breathing: {
        title: l('¿Respira normalmente?', 'Are they breathing normally?', 'Ela respira normalmente?'),
        steps: [
          s(
            'Pedí ayuda a gritos. Que alguien llame al {medical} y traiga el desfibrilador (DEA) si hay.',
            'Shout for help. Someone should call {medical} and bring a defibrillator (AED) if there is one.',
            'Peça ajuda em voz alta. Que alguém ligue para o {medical} e traga o desfibrilador (DEA), se houver.',
          ),
          s(
            'Una mano en la frente: inclinale la cabeza hacia atrás y levantale el mentón con dos dedos.',
            'One hand on the forehead: tilt the head back and lift the chin with two fingers.',
            'Uma mão na testa: incline a cabeça para trás e levante o queixo com dois dedos.',
          ),
          s('Mirá el pecho, escuchá y sentí el aire hasta 10 segundos.', 'Look at the chest, listen and feel for air for up to 10 seconds.', 'Olhe o peito, ouça e sinta o ar por até 10 segundos.'),
          s(
            'Unas pocas bocanadas o ruidos al respirar NO son respirar normalmente.',
            'Occasional gasps or noisy breaths are NOT normal breathing.',
            'Algumas arfadas ou ruídos ao respirar NÃO são respirar normalmente.',
          ),
        ],
        calls: ['same', 'emergency'],
        question: l('¿Respira normalmente?', 'Are they breathing normally?', 'Ela respira normalmente?'),
        options: [
          { answer: 'no', label: l('No, o solo bocanadas', 'No, or only gasps', 'Não, ou só arfadas'), next: 'topic:cpr' },
          { answer: 'yes', label: l('Sí, respira', 'Yes, breathing', 'Sim, respira'), next: 'topic:unconscious' },
        ],
      },
      bleeding: {
        title: l('¿Sangra mucho?', 'Is there heavy bleeding?', 'Está sangrando muito?'),
        steps: [
          s(
            'Buscá sangre en todo el cuerpo, también debajo de la ropa y de la persona.',
            'Look for blood all over the body, also under clothing and underneath the person.',
            'Procure sangue no corpo todo, também embaixo da roupa e embaixo da pessoa.',
          ),
        ],
        question: l('¿Sale en chorro, empapa la ropa o forma un charco?', 'Is it spurting, soaking the clothes or pooling?', 'O sangue esguicha, encharca a roupa ou forma uma poça?'),
        options: [
          { answer: 'yes', label: l('Sí, sangra mucho', 'Yes, heavy bleeding', 'Sim, sangra muito'), next: 'topic:bleeding' },
          { answer: 'no', label: l('No', 'No', 'Não'), next: 'what' },
        ],
      },
      // Primer nivel de «¿Qué le pasó?»: lo más urgente a un toque (los tres primeros llevan directo a su guía) y después categorías.
      what: {
        title: l('¿Qué le pasó?', 'What happened?', 'O que aconteceu?'),
        steps: [
          s(
            'Preguntale qué pasó, qué le duele, si tiene alguna enfermedad o alergia y si toma medicación (mirá su ficha médica si la tenés).',
            'Ask what happened, what hurts, whether they have any illness or allergy and take medication (check their medical record if you have it).',
            'Pergunte o que aconteceu, o que dói, se tem alguma doença ou alergia e se toma remédios (veja a ficha médica dela, se tiver).',
          ),
          s('Mantenela tranquila y abrigada mientras tanto.', 'Keep them calm and warm meanwhile.', 'Mantenha a pessoa calma e agasalhada enquanto isso.'),
        ],
        question: l('Elegí lo que más se parece:', 'Pick what fits best:', 'Escolha o que mais se parece:'),
        options: [
          { label: l('No responde o no respira', 'Unresponsive or not breathing', 'Não responde ou não respira'), next: 'breathing' },
          { label: l('Sangrado grave', 'Severe bleeding', 'Sangramento grave'), next: 'topic:bleeding' },
          { label: l('Se ahoga con algo (atragantamiento)', 'Choking on something', 'Engasgo: algo preso na garganta'), next: 'topic:choking' },
          { label: l('Ahogo, dolor de pecho o desmayo', 'Breathing trouble, chest pain or fainting', 'Falta de ar, dor no peito ou desmaio'), next: 'heart' },
          { label: l('Golpe, caída o hueso roto', 'Blow, fall or broken bone', 'Pancada, queda ou osso quebrado'), next: 'injury' },
          { label: l('Quemadura, frío o calor', 'Burn, cold or heat', 'Queimadura, frio ou calor'), next: 'temp' },
          { label: l('Veneno, picadura o mordedura', 'Poison, sting or bite', 'Veneno, picada ou mordida'), next: 'venom' },
          { label: l('Otra cosa o no sé', 'Something else or not sure', 'Outra coisa ou não sei'), next: 'other' },
        ],
      },
      // Segundo nivel: cada situación conserva el texto de botón que tenía en la lista única de 18.
      heart: {
        title: l('Ahogo, dolor de pecho o desmayo', 'Breathing trouble, chest pain or fainting', 'Falta de ar, dor no peito ou desmaio'),
        steps: [],
        question: l('Elegí lo que más se parece:', 'Pick what fits best:', 'Escolha o que mais se parece:'),
        options: [
          { label: l('Dolor de pecho', 'Chest pain', 'Dor no peito'), next: 'topic:chest' },
          { label: l('Cara torcida, no puede hablar o mover un brazo', 'Face drooping, cannot speak or move an arm', 'Rosto torto, não consegue falar ou mexer um braço'), next: 'topic:stroke' },
          { label: l('Hinchazón de labios o lengua, le cuesta respirar', 'Swollen lips or tongue, trouble breathing', 'Lábios ou língua inchados, dificuldade para respirar'), next: 'topic:anaphylaxis' },
          { label: l('Convulsión', 'Seizure', 'Convulsão'), next: 'topic:seizure' },
          { label: l('Diabético confundido o sudoroso', 'Confused or sweaty diabetic', 'Diabético confuso ou suando'), next: 'topic:hypoglycemia' },
          { label: l('Casi se ahoga en el agua', 'Near drowning', 'Quase se afogou na água'), next: 'topic:drowning' },
          { label: l('Síntomas por la altura (soroche)', 'Altitude symptoms (mountain sickness)', 'Sintomas por causa da altitude (mal de montanha)'), next: 'topic:altitude' },
        ],
      },
      injury: {
        title: l('Golpe, caída o hueso roto', 'Blow, fall or broken bone', 'Pancada, queda ou osso quebrado'),
        steps: [],
        question: l('Elegí lo que más se parece:', 'Pick what fits best:', 'Escolha o que mais se parece:'),
        options: [
          { label: l('Caída de altura o golpe fuerte', 'Fall from height or heavy blow', 'Queda de altura ou pancada forte'), next: 'topic:fall' },
          { label: l('Posible fractura o esguince', 'Possible fracture or sprain', 'Possível fratura ou entorse'), next: 'topic:fracture' },
          { label: l('Herida grave o accidente con varios daños (método MARCH)', 'Serious injury or crash with several injuries (MARCH method)', 'Ferimento grave ou acidente com várias lesões (método MARCH)'), next: 'topic:march' },
        ],
      },
      temp: {
        title: l('Quemadura, frío o calor', 'Burn, cold or heat', 'Queimadura, frio ou calor'),
        steps: [],
        question: l('Elegí lo que más se parece:', 'Pick what fits best:', 'Escolha o que mais se parece:'),
        options: [
          { label: l('Quemadura', 'Burn', 'Queimadura'), next: 'topic:burns' },
          { label: l('Mucho frío (hipotermia)', 'Very cold (hypothermia)', 'Muito frio (hipotermia)'), next: 'topic:hypothermia' },
          { label: l('Mucho calor (golpe de calor)', 'Very hot (heat stroke)', 'Muito calor (insolação)'), next: 'topic:heat' },
        ],
      },
      venom: {
        title: l('Veneno, picadura o mordedura', 'Poison, sting or bite', 'Veneno, picada ou mordida'),
        steps: [],
        question: l('Elegí lo que más se parece:', 'Pick what fits best:', 'Escolha o que mais se parece:'),
        options: [
          { label: l('Mordedura de serpiente', 'Snakebite', 'Picada de cobra'), next: 'topic:snakebite' },
          { label: l('Picadura (alacrán, araña, abeja)', 'Sting or bite (scorpion, spider, bee)', 'Picada (escorpião, aranha, abelha)'), next: 'topic:stings' },
          { label: l('Intoxicación o gas', 'Poisoning or gas', 'Intoxicação ou gás'), next: 'topic:poisoning' },
        ],
      },
      other: {
        title: l('Otra cosa', 'Something else', 'Outra coisa'),
        steps: [
          sc(
            'Si empeora, tiene dolor intenso, está confundida o dormida, llamá al {same}.',
            'If they get worse, are in severe pain, confused or drowsy, call {same}.',
            'Se piorar, tiver dor intensa, estiver confusa ou sonolenta, ligue para o {same}.',
          ),
          sw(
            'Si empeora o no puede caminar, pedí rescate en lugar de intentar sacarla vos.',
            'If they get worse or cannot walk, ask for rescue instead of trying to carry them out yourself.',
            'Se piorar ou não conseguir andar, peça resgate em vez de tentar tirar a pessoa sozinho.',
          ),
          s(
            'Dejala en la posición más cómoda para ella y no le des de comer ni de beber hasta saber qué tiene.',
            'Let them rest in the most comfortable position and do not give food or drink until you know what is wrong.',
            'Deixe a pessoa na posição mais confortável para ela e não dê comida nem bebida até saber o que ela tem.',
          ),
          KEEP_WARM,
          WATCH,
        ],
        calls: ['same', 'emergency'],
        options: [{ label: l('Cómo pedir rescate', 'How to ask for rescue', 'Como pedir resgate'), next: 'topic:rescue' }],
      },
    },
  },

  // El detalle del pedido de rescate (en las demás pantallas de zona agreste va solo una frase corta).
  {
    id: 'rescue',
    title: l('Pedir rescate', 'Ask for rescue', 'Pedir resgate'),
    keywords: l('rescate zona agreste sin señal sms coordenadas ubicación ayuda montaña', 'rescue remote area no signal sms coordinates location help mountain', 'resgate zona remota sem sinal sms coordenadas localização ajuda montanha'),
    start: 'start',
    nodes: {
      start: {
        title: l('Cómo pedir rescate', 'How to ask for rescue', 'Como pedir resgate'),
        steps: [
          s(
            'Llamá al {emergency} y pedí rescate (Policía o rescate de montaña).',
            'Call {emergency} and ask for rescue (police or mountain rescue).',
            'Ligue para o {emergency} e peça resgate (Polícia ou resgate em montanha).',
          ),
          s(
            'Pasá tu ubicación: las coordenadas del botón «Mi ubicación».',
            'Give your location: the coordinates from the “My location” button.',
            'Informe sua localização: as coordenadas do botão “Minha localização”.',
          ),
          s('Sin señal: probá desde un punto alto o mandá un SMS.', 'No signal: try from higher ground or send an SMS.', 'Sem sinal: tente de um ponto alto ou mande um SMS.'),
          s(
            'Si son varios, que alguien vaya a buscar ayuda con la ubicación anotada.',
            'If there are several of you, send someone for help with the location written down.',
            'Se forem várias pessoas, que alguém vá buscar ajuda com a localização anotada.',
          ),
        ],
        calls: ['emergency'],
      },
    },
  },

  {
    id: 'cpr',
    title: l('No responde y no respira: RCP', 'Unresponsive and not breathing: CPR', 'Não responde e não respira: RCP'),
    keywords: l(
      'rcp reanimación paro cardíaco masaje cardíaco desfibrilador dea',
      'cpr resuscitation cardiac arrest compressions defibrillator aed',
      'rcp reanimação parada cardíaca massagem cardíaca compressões torácicas desfibrilador dea',
    ),
    start: 'start',
    nodes: {
      start: {
        title: l('Empezá la RCP ya', 'Start CPR now', 'Comece a RCP agora'),
        steps: [
          CALL_SPEAKER,
          s(
            'Si hay un desfibrilador (DEA) cerca, que alguien lo traiga.',
            'If there is a defibrillator (AED) nearby, have someone bring it.',
            'Se houver um desfibrilador (DEA) por perto, peça que alguém o traga.',
          ),
          s('Acostala boca arriba sobre algo firme.', 'Lay them on their back on something firm.', 'Deite a pessoa de barriga para cima em uma superfície firme.'),
          s(
            'Una mano sobre la otra, en el centro del pecho. Brazos rectos.',
            'One hand on top of the other, on the center of the chest. Arms straight.',
            'Uma mão sobre a outra, no centro do peito. Braços esticados.',
          ),
          s(
            'Hundí el pecho 5 a 6 cm, rápido: 100 a 120 por minuto (al ritmo de «Another One Bites the Dust», de Queen). Dejá que el pecho vuelva a subir.',
            'Push down 5 to 6 cm, fast: 100 to 120 per minute (the beat of “Another One Bites the Dust” by Queen). Let the chest come back up.',
            'Comprima o peito 5 a 6 cm, rápido: 100 a 120 por minuto (no ritmo de “Another One Bites the Dust”, do Queen). Deixe o peito voltar a subir.',
          ),
          s(
            'Si sabés dar respiraciones: 30 compresiones y 2 respiraciones. Si no, solo compresiones sin parar.',
            'If you know rescue breaths: 30 compressions and 2 breaths. If not, compressions only, nonstop.',
            'Se você sabe dar respirações: 30 compressões torácicas e 2 respirações. Se não, só compressões, sem parar.',
          ),
          s('Si son varios, túrnense cada 2 minutos sin frenar.', 'If there are several of you, swap every 2 minutes without stopping.', 'Se forem várias pessoas, revezem a cada 2 minutos sem parar.'),
        ],
        calls: ['same', 'emergency'],
        question: l('¿Tienen un desfibrilador (DEA)?', 'Do you have a defibrillator (AED)?', 'Vocês têm um desfibrilador (DEA)?'),
        options: [
          { answer: 'yes', label: l('Sí', 'Yes', 'Sim'), next: 'aed' },
          { answer: 'no', label: l('No', 'No', 'Não'), next: 'continue' },
        ],
      },
      aed: {
        title: l('Usar el desfibrilador', 'Using the AED', 'Usar o desfibrilador'),
        steps: [
          s('Prendelo y seguí sus instrucciones de voz.', 'Turn it on and follow its voice prompts.', 'Ligue o aparelho e siga as instruções de voz.'),
          s(
            'Pegá los parches sobre el pecho desnudo y seco como muestra el dibujo; seguí con las compresiones mientras tanto.',
            'Stick the pads on the bare, dry chest as shown on the drawing; keep doing compressions meanwhile.',
            'Cole as pás no peito nu e seco, como mostra o desenho; continue as compressões enquanto isso.',
          ),
          s('Cuando lo indique, que nadie toque a la persona.', 'When it tells you to, make sure nobody touches the person.', 'Quando o aparelho mandar, que ninguém toque na pessoa.'),
          s(
            'Después de la descarga (o si no la indica), seguí con compresiones enseguida.',
            'After the shock (or if none is advised), resume compressions right away.',
            'Depois do choque (ou se ele não indicar), volte às compressões imediatamente.',
          ),
        ],
        options: [{ label: l('Seguir', 'Continue', 'Continuar'), next: 'continue' }],
      },
      continue: {
        title: l('No frenes', 'Do not stop', 'Não pare'),
        steps: [
          s(
            'Seguí hasta que llegue la ayuda, la persona empiece a respirar normalmente o ya no puedas más.',
            'Keep going until help arrives, the person starts breathing normally or you cannot go on.',
            'Continue até a ajuda chegar, a pessoa voltar a respirar normalmente ou você não aguentar mais.',
          ),
          s(
            'Si empieza a respirar: ponela de costado (posición lateral de seguridad) y controlala.',
            'If they start breathing: put them on their side (recovery position) and watch them.',
            'Se ela voltar a respirar: coloque-a de lado (posição lateral de segurança) e fique de olho.',
          ),
          s(
            'En chicos: si sabés, empezá con 5 respiraciones; hundí un tercio del pecho (con una mano, o dos dedos en bebés).',
            'In children: if you know how, start with 5 breaths; push down one third of the chest (one hand, or two fingers in babies).',
            'Em crianças: se souber, comece com 5 respirações; comprima um terço do peito (com uma mão, ou dois dedos em bebês).',
          ),
          sw(
            'Lejos de un hospital la RCP sola rara vez alcanza, pero hacela igual: si la persona está muy fría (hipotermia), no abandones; puede recuperarse aun después de mucho tiempo.',
            'Far from a hospital CPR alone rarely succeeds, but do it anyway: if the person is very cold (hypothermia) do not give up; they can recover even after a long time.',
            'Longe de um hospital, a RCP sozinha raramente basta, mas faça mesmo assim: se a pessoa estiver muito fria (hipotermia), não desista; ela pode se recuperar mesmo depois de muito tempo.',
          ),
          WILD_RESCUE,
        ],
        calls: ['same', 'emergency'],
      },
    },
  },

  {
    id: 'unconscious',
    title: l('No responde pero respira', 'Unresponsive but breathing', 'Não responde, mas respira'),
    keywords: l(
      'desmayo inconsciente posición lateral de seguridad',
      'faint unconscious recovery position',
      'desmaio inconsciente posição lateral de segurança',
    ),
    start: 'start',
    nodes: {
      start: {
        title: l('Posición lateral de seguridad', 'Recovery position', 'Posição lateral de segurança'),
        steps: [
          CALL_SPEAKER,
          s(
            'Ponela de costado: el brazo de tu lado en ángulo recto, el otro con el dorso de la mano contra su mejilla, doblale la rodilla de afuera y girala hacia vos.',
            'Roll them on their side: near arm at a right angle, the other with the back of the hand against their cheek, bend the far knee and roll them towards you.',
            'Coloque a pessoa de lado: o braço do seu lado em ângulo reto, o outro com as costas da mão contra a bochecha dela, dobre o joelho do lado de lá e gire-a na sua direção.',
          ),
          s(
            'Inclinale la cabeza hacia atrás para que la boca quede hacia abajo y pueda salir el vómito.',
            'Tilt the head back so the mouth points down and vomit can drain.',
            'Incline a cabeça para trás para que a boca fique voltada para baixo e o vômito possa sair.',
          ),
          s(
            'Si sospechás golpe en la columna (caída, choque), dejala boca arriba sosteniendo la cabeza, salvo que vomite o le cueste respirar.',
            'If you suspect a spinal injury (fall, crash), leave them on their back holding the head, unless they vomit or struggle to breathe.',
            'Se suspeitar de lesão na coluna (queda, batida), deixe a pessoa de barriga para cima segurando a cabeça, a menos que vomite ou tenha dificuldade para respirar.',
          ),
          KEEP_WARM,
          s(
            'Controlá la respiración cada minuto: si deja de respirar normalmente, empezá la RCP.',
            'Check breathing every minute: if they stop breathing normally, start CPR.',
            'Verifique a respiração a cada minuto: se ela parar de respirar normalmente, comece a RCP.',
          ),
          no('No le des nada de beber ni de comer.', 'Do not give anything to drink or eat.', 'Não dê nada para beber nem para comer.'),
          WILD_RESCUE,
        ],
        calls: ['same', 'emergency'],
        options: [{ label: l('Dejó de respirar', 'Stopped breathing', 'Parou de respirar'), next: 'topic:cpr' }],
      },
    },
  },

  {
    id: 'bleeding',
    title: l('Sangrado abundante', 'Heavy bleeding', 'Sangramento intenso'),
    keywords: l(
      'hemorragia sangre corte herida torniquete pierna brazo',
      'hemorrhage blood cut wound tourniquet leg arm',
      'hemorragia sangue corte ferida torniquete perna braço',
    ),
    start: 'pressure',
    nodes: {
      pressure: {
        title: l('Apretá fuerte sobre la herida', 'Press hard on the wound', 'Aperte forte sobre o ferimento'),
        steps: [
          s('Protegete las manos (guantes, bolsa).', 'Protect your hands (gloves, plastic bag).', 'Proteja as mãos (luvas, saco plástico).'),
          s(
            'Acostala. Apretá directo sobre la herida con gasa, un trapo o la ropa, con las dos manos y todo tu peso.',
            'Lay them down. Press directly on the wound with gauze, a cloth or clothing, with both hands and your body weight.',
            'Deite a pessoa. Aperte direto sobre o ferimento com gaze, um pano ou a roupa, com as duas mãos e todo o seu peso.',
          ),
          s(
            'No levantes la gasa para mirar. Si se empapa, poné más encima y apretá más fuerte, al menos 10 minutos.',
            'Do not lift the gauze to look. If it soaks through, add more on top and press harder, for at least 10 minutes.',
            'Não levante a gaze para olhar. Se encharcar, coloque mais por cima e aperte mais forte, por pelo menos 10 minutos.',
          ),
          sc(
            'Llamá al {medical} (o que otro llame mientras vos apretás).',
            'Call {medical} (or have someone call while you press).',
            'Ligue para o {medical} (ou peça que outra pessoa ligue enquanto você aperta).',
          ),
          WILD_RESCUE,
        ],
        calls: ['same', 'emergency'],
        question: l('¿Dónde sangra?', 'Where is it bleeding?', 'Onde está sangrando?'),
        options: [
          { label: l('Brazo o pierna', 'Arm or leg', 'Braço ou perna'), next: 'limb' },
          { label: l('Ingle, axila o cuello', 'Groin, armpit or neck', 'Virilha, axila ou pescoço'), next: 'junction' },
          { label: l('Pecho, abdomen o cabeza', 'Chest, belly or head', 'Peito, abdômen ou cabeça'), next: 'trunk' },
        ],
      },
      limb: {
        title: l('Brazo o pierna', 'Arm or leg', 'Braço ou perna'),
        steps: [s('Seguí apretando fuerte.', 'Keep pressing hard.', 'Continue apertando forte.')],
        question: l('¿Cuánta sangre pierde?', 'How much blood is it losing?', 'Quanta sangue está perdendo?'),
        options: [
          { answer: 'no', label: l('Mucha: en chorro o en un charco grande', 'A lot: spurting or a large pool', 'Muita: esguichando ou em uma poça grande'), next: 'tourniquet' },
          { answer: 'yes', label: l('Poca: paró o baja con la presión', 'Little: it stopped or slows with pressure', 'Pouca: parou ou diminui com a pressão'), next: 'stopped' },
          { answer: 'no', label: l('No cede con la presión, sigue empapando', 'Pressure does not stop it, still soaking', 'Não cede com a pressão, continua encharcando'), next: 'tourniquet' },
        ],
      },
      tourniquet: {
        title: l('Torniquete', 'Tourniquet', 'Torniquete'),
        steps: [
          s(
            'Poné el torniquete solo si hiciste un curso de primeros auxilios. Si no, seguí con presión directa fuerte, sin soltar, y pedí ayuda. En niños no arriesgues: presión directa y torniquete solo como última instancia.',
            'Use a tourniquet only if you have taken a first-aid course. If not, keep pressing hard without letting go, and ask for help. In children take no risks: direct pressure, and a tourniquet only as a last resort.',
            'Use o torniquete só se você fez um curso de primeiros socorros. Se não, continue com pressão direta forte, sem soltar, e peça ajuda. Em crianças não arrisque: pressão direta e torniquete só em última instância.',
          ),
          s(
            'Si tenés un torniquete de botiquín (el CAT Gen 7 o el SOF-TT Wide son los recomendados), ponelo 5 a 7 cm por encima de la herida, nunca sobre una articulación.',
            'If you have a kit tourniquet (the CAT Gen 7 or the SOF-TT Wide are the recommended ones), put it 5 to 7 cm above the wound, never over a joint.',
            'Se você tiver um torniquete de kit (o CAT Gen 7 ou o SOF-TT Wide são os recomendados), coloque-o 5 a 7 cm acima do ferimento, nunca sobre uma articulação.',
          ),
          s(
            'Último recurso, si no tenés uno: una tira ancha (4 cm o más, como un pañuelo doblado o un cinturón), un nudo, un palo encima y girá hasta que pare el sangrado. Atá el palo para que no se desenrosque. Nunca uses cuerda ni alambre.',
            'Last resort, if you have none: a wide strip (4 cm or more, like a folded scarf or a belt), a knot, a stick on top and twist until the bleeding stops. Tie the stick so it does not unwind. Never use cord or wire.',
            'Último recurso, se não tiver um: uma tira larga (4 cm ou mais, como um lenço dobrado ou um cinto), um nó, um pedaço de pau por cima e gire até o sangramento parar. Amarre o pau para que não desenrosque. Nunca use corda nem arame.',
          ),
          s(
            'Apretalo hasta que pare el sangrado, y no más: duele mucho, es normal.',
            'Tighten until the bleeding stops, no more: it hurts a lot, that is normal.',
            'Aperte até o sangramento parar, e não mais: dói muito, é normal.',
          ),
          s('Anotá la hora en que lo pusiste, en la piel o en el torniquete.', 'Write the time you put it on, on the skin or the tourniquet.', 'Anote o horário em que o colocou, na pele ou no torniquete.'),
          s(
            'Si con uno no para, poné otro justo arriba del primero.',
            'If one is not enough, put a second one just above the first.',
            'Se um não bastar, coloque outro logo acima do primeiro.',
          ),
          no('No lo aflojes ni lo saques: lo saca el médico en un centro de atención.', 'Do not loosen or remove it: the doctor takes it off at a care center.', 'Não afrouxe nem tire: quem tira é o médico em um centro de atendimento.'),
          s(
            'Ojo, las fuentes difieren: el Manual de Primeros Auxilios del Ministerio de Salud de la Nación (2016) desaconseja el torniquete en heridas comunes; las guías TCCC 2026 y TECC 2024 lo recomiendan cuando un sangrado grave de brazo o pierna no cede con presión directa. Por eso acá: sangrado menor, presión primero; sangrado grande, torniquete directo.',
            'Note, sources differ: the Argentine Ministry of Health first-aid manual (2016) advises against tourniquets for ordinary wounds; TCCC 2026 and TECC 2024 recommend them when severe arm or leg bleeding does not respond to direct pressure. That is why here: minor bleeding, pressure first; heavy bleeding, tourniquet straight away.',
            'Atenção, as fontes divergem: o manual de primeiros socorros do Ministério da Saúde da Argentina (2016) desaconselha o torniquete em ferimentos comuns; as diretrizes TCCC 2026 e TECC 2024 o recomendam quando um sangramento grave de braço ou perna não cede com pressão direta. Por isso, aqui: sangramento menor, pressão primeiro; sangramento grande, torniquete direto.',
          ),
          sw(
            'Es una evacuación urgente: que llegue a un centro de atención lo más rápido que se pueda. Pedí rescate ya.',
            'This is an urgent evacuation: get them to a care center as fast as you can. Ask for rescue now.',
            'É uma evacuação urgente: leve a pessoa a um centro de atendimento o mais rápido possível. Peça resgate já.',
          ),
        ],
        calls: ['same', 'emergency'],
        options: [{ label: l('Seguir', 'Continue', 'Continuar'), next: 'shock' }],
      },
      junction: {
        title: l('Ingle, axila o cuello', 'Groin, armpit or neck', 'Virilha, axila ou pescoço'),
        steps: [
          s(
            'Ahí no va torniquete (solo en brazos y piernas). Empaquetá la herida con gasa hemostática, empujándola hacia adentro (si no tenés, gasa o tela limpia), y apretá fuerte encima con todo tu peso.',
            'No tourniquet there (arms and legs only). Pack the wound with hemostatic gauze, pushing it in (if you have none, gauze or clean cloth), and press hard on top with your full weight.',
            'Ali não vai torniquete (só em braços e pernas). Preencha o ferimento com gaze hemostática, empurrando para dentro (se não tiver, gaze ou pano limpo), e aperte forte por cima com todo o seu peso.',
          ),
          s(
            'En el cuello apretá solo de un lado, sin rodearlo.',
            'On the neck press on one side only, never around it.',
            'No pescoço, aperte só de um lado, sem envolvê-lo.',
          ),
          s('No sueltes hasta que llegue la ayuda.', 'Do not let go until help arrives.', 'Não solte até a ajuda chegar.'),
        ],
        calls: ['same', 'emergency'],
        options: [{ label: l('Seguir', 'Continue', 'Continuar'), next: 'shock' }],
      },
      trunk: {
        title: l('Pecho, abdomen o cabeza', 'Chest, belly or head', 'Peito, abdômen ou cabeça'),
        steps: [
          s(
            'Apretá con la mano y gasas, sin meter nada en la herida.',
            'Press with your hand and gauze, without packing anything into the wound.',
            'Aperte com a mão e gazes, sem enfiar nada no ferimento.',
          ),
          s(
            'Si hay un objeto clavado, no lo saques: apretá alrededor y fijalo.',
            'If an object is stuck in, do not pull it out: press around it and secure it.',
            'Se houver um objeto cravado, não o retire: aperte ao redor e fixe-o.',
          ),
          s(
            'Herida en el pecho que "sopla" aire: dejala tapada con la mano y una gasa, sin sellarla del todo.',
            'A chest wound that "sucks" air: cover it with your hand and gauze, without fully sealing it.',
            'Ferimento no peito que “sopra” ar: deixe-o coberto com a mão e uma gaze, sem vedar por completo.',
          ),
          s(
            'Si se ven órganos en el abdomen, no los empujes: tapalos con tela limpia y húmeda.',
            'If organs show in the belly, do not push them back: cover them with a clean damp cloth.',
            'Se aparecerem órgãos no abdômen, não os empurre de volta: cubra com um pano limpo e úmido.',
          ),
        ],
        calls: ['same', 'emergency'],
        options: [{ label: l('Seguir', 'Continue', 'Continuar'), next: 'shock' }],
      },
      stopped: {
        title: l('Paró el sangrado', 'Bleeding stopped', 'O sangramento parou'),
        steps: [
          s('Vendá firme encima de las gasas sin sacarlas.', 'Bandage firmly over the gauze without removing it.', 'Faça uma atadura firme por cima das gazes, sem tirá-las.'),
          s(
            'Si se vuelve a empapar, apretá otra vez o pasá al torniquete.',
            'If it soaks through again, press again or go to the tourniquet.',
            'Se encharcar de novo, aperte outra vez ou passe ao torniquete.',
          ),
          sc(
            'Igual tiene que verla un médico: puede necesitar puntos.',
            'A doctor still needs to see it: it may need stitches.',
            'Mesmo assim um médico precisa ver: pode precisar de pontos.',
          ),
          sw(
            'Una herida grande lejos de un hospital puede infectarse: limpiala con agua potable abundante cuando ya no sangre y cubrila; salí en cuanto se pueda.',
            'A large wound far from a hospital may get infected: rinse it with plenty of drinking water once it stops bleeding and cover it; get out as soon as you can.',
            'Um ferimento grande longe de um hospital pode infeccionar: quando parar de sangrar, lave com bastante água potável e cubra; saia do local assim que puder.',
          ),
        ],
        options: [{ label: l('Seguir', 'Continue', 'Continuar'), next: 'shock' }],
      },
      shock: {
        title: l('Prevenir el shock', 'Prevent shock', 'Prevenir o choque'),
        steps: [
          s(
            'Si está pálida, fría, sudorosa, con el pulso rápido o confundida, está en shock: es grave.',
            'If they are pale, cold, sweaty, with a fast pulse or confused, they are in shock: it is serious.',
            'Se ela estiver pálida, fria, suando, com pulso rápido ou confusa, está em choque: é grave.',
          ),
          s(
            'Acostada, abrigada y aislada del suelo. Hablale y tranquilizala.',
            'Lying down, warm and insulated from the ground. Talk to them and reassure them.',
            'Deitada, agasalhada e isolada do chão. Converse com ela e tranquilize-a.',
          ),
          no('No le des de beber ni de comer.', 'Do not give food or drink.', 'Não dê nada para beber nem para comer.'),
          WATCH,
        ],
        calls: ['same', 'emergency'],
        options: [{ label: l('Dejó de responder', 'Stopped responding', 'Parou de responder'), next: 'topic:assess' }],
      },
    },
  },
];
