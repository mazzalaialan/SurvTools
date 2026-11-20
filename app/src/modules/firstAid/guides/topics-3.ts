import type { Topic } from './types';
import { CALL_SPEAKER, KEEP_WARM, l, no, s, sc, sw, WATCH, WILD_RESCUE } from './helpers';

/** Caídas, fracturas, quemaduras, pecho, ACV, convulsión, intoxicación, frío, calor, azúcar y ahogamiento. */
export const TOPICS_3: Topic[] = [
  {
    id: 'fall',
    title: l('Caída de altura o golpe fuerte', 'Fall from height or heavy blow', 'Queda de altura ou pancada forte'),
    keywords: l(
      'caída escalada pared columna cuello espalda accidente choque golpe cabeza',
      'fall climbing wall spine neck back accident crash head injury',
      'queda escalada parede coluna pescoço costas acidente batida pancada cabeça',
    ),
    start: 'start',
    nodes: {
      start: {
        title: l('Posible lesión de columna', 'Possible spinal injury', 'Possível lesão na coluna'),
        steps: [
          s(
            'Después de una caída de altura o un golpe fuerte, pensá que puede tener la columna lesionada.',
            'After a fall from height or a heavy blow, assume the spine may be injured.',
            'Depois de uma queda de altura ou de uma pancada forte, considere que a coluna pode estar lesionada.',
          ),
          s(
            'No la muevas, salvo que corra peligro (fuego, agua, piedras): en ese caso movela en bloque, cabeza, cuello y cuerpo alineados.',
            'Do not move them, unless they are in danger (fire, water, rocks): then move them as a block, head, neck and body aligned.',
            'Não mova a pessoa, a menos que ela corra perigo (fogo, água, pedras): nesse caso, mova-a em bloco, com cabeça, pescoço e corpo alinhados.',
          ),
          s(
            'Pedile que no se mueva. Sostené la cabeza con tus manos a los costados, alineada con el cuerpo.',
            'Ask them not to move. Hold the head with your hands on both sides, in line with the body.',
            'Peça que ela não se mexa. Segure a cabeça com as mãos nas laterais, alinhada com o corpo.',
          ),
          sw(
            'Si colgaba del arnés, bajala lo antes posible; una vez abajo, acostala.',
            'If they were hanging in a harness, get them down as soon as possible; once down, lay them flat.',
            'Se ela estava pendurada no arnês, desça-a o quanto antes; depois de descer, deite-a.',
          ),
        ],
        question: l('¿Responde y respira normalmente?', 'Do they respond and breathe normally?', 'Ela responde e respira normalmente?'),
        options: [
          { label: l('Responde', 'They respond', 'Responde'), next: 'conscious' },
          { label: l('No responde pero respira', 'Unresponsive but breathing', 'Não responde, mas respira'), next: 'unconscious' },
          { label: l('No respira', 'Not breathing', 'Não respira'), next: 'topic:cpr' },
        ],
      },
      conscious: {
        title: l('Responde', 'They respond', 'Responde'),
        steps: [
          s(
            'Preguntale dónde le duele y si siente y mueve manos y pies (sin que se levante).',
            'Ask where it hurts and whether they can feel and move hands and feet (without getting up).',
            'Pergunte onde dói e se ela sente e mexe as mãos e os pés (sem se levantar).',
          ),
          s('Buscá sangrado y controlalo.', 'Look for bleeding and control it.', 'Procure sangramento e controle-o.'),
          s(
            'Alarma: dolor de cuello o espalda, hormigueo o no sentir las piernas, confusión, vómitos, sueño, pupilas distintas, sangre o líquido por oído o nariz.',
            'Warning signs: neck or back pain, tingling or no feeling in the legs, confusion, vomiting, drowsiness, unequal pupils, blood or fluid from ears or nose.',
            'Sinais de alarme: dor no pescoço ou nas costas, formigamento ou não sentir as pernas, confusão, vômitos, sonolência, pupilas diferentes, sangue ou líquido saindo do ouvido ou do nariz.',
          ),
          sc(
            'Con cualquier señal de alarma, llamá al {same} y que no se mueva hasta que lleguen.',
            'With any warning sign, call {same} and keep them still until help arrives.',
            'Com qualquer sinal de alarme, ligue para o {same} e mantenha a pessoa imóvel até a ajuda chegar.',
          ),
          WILD_RESCUE,
          sw(
            'Prepará una espera larga: abrigo, aislamiento del suelo, reparo del viento y la lluvia. Que no camine con dolor de columna o golpe en la cabeza.',
            'Prepare for a long wait: warmth, insulation from the ground, shelter from wind and rain. They must not walk with spinal pain or a head injury.',
            'Prepare-se para uma espera longa: agasalho, isolamento do chão, abrigo do vento e da chuva. Ela não deve andar com dor na coluna ou pancada na cabeça.',
          ),
          KEEP_WARM,
          WATCH,
          no(
            'No le des de comer ni de beber (puede necesitar cirugía).',
            'Do not give food or drink (they may need surgery).',
            'Não dê nada para comer nem para beber (ela pode precisar de cirurgia).',
          ),
        ],
        calls: ['same', 'emergency'],
        options: [
          { label: l('Sangra mucho', 'Heavy bleeding', 'Sangra muito'), next: 'topic:bleeding' },
          { label: l('Tiene algo roto', 'Something is broken', 'Tem algo quebrado'), next: 'topic:fracture' },
        ],
      },
      unconscious: {
        title: l('No responde pero respira', 'Unresponsive but breathing', 'Não responde, mas respira'),
        steps: [
          CALL_SPEAKER,
          s(
            'Dejala boca arriba sosteniendo la cabeza alineada. Si vomita o le cuesta respirar, girala de costado en bloque (mejor entre dos o tres).',
            'Leave them on their back holding the head aligned. If they vomit or struggle to breathe, roll them on their side as a block (ideally two or three people).',
            'Deixe a pessoa de barriga para cima, segurando a cabeça alinhada. Se vomitar ou tiver dificuldade para respirar, gire-a de lado em bloco (de preferência entre duas ou três pessoas).',
          ),
          s(
            'Controlá la respiración todo el tiempo: si deja de respirar, RCP.',
            'Keep checking breathing: if it stops, CPR.',
            'Verifique a respiração o tempo todo: se parar de respirar, RCP.',
          ),
          KEEP_WARM,
          WILD_RESCUE,
        ],
        calls: ['same', 'emergency'],
        options: [{ label: l('Dejó de respirar', 'Stopped breathing', 'Parou de respirar'), next: 'topic:cpr' }],
      },
    },
  },

  {
    id: 'fracture',
    title: l('Fractura, luxación o esguince', 'Fracture, dislocation or sprain', 'Fratura, luxação ou entorse'),
    keywords: l(
      'hueso roto fractura quebradura esguince torcedura entablillar férula',
      'broken bone fracture sprain splint',
      'osso quebrado fratura luxação entorse torção tala imobilizar',
    ),
    start: 'start',
    nodes: {
      start: {
        title: l('Inmovilizar', 'Immobilize', 'Imobilizar'),
        steps: [
          s(
            'Señales: dolor fuerte, deformidad, hinchazón, no puede mover o apoyar.',
            'Signs: severe pain, deformity, swelling, cannot move or bear weight.',
            'Sinais: dor forte, deformidade, inchaço, não consegue mover ou apoiar.',
          ),
          s(
            'Si el hueso asoma o hay herida, tapala con gasa limpia y controlá el sangrado sin empujar el hueso.',
            'If bone shows or there is a wound, cover it with clean gauze and control bleeding without pushing the bone.',
            'Se o osso aparecer ou houver ferimento, cubra com gaze limpa e controle o sangramento sem empurrar o osso.',
          ),
          s(
            'Inmovilizalo como está, sin enderezarlo: la férula toma la articulación de arriba y la de abajo. Acolchá con ropa.',
            'Immobilize it as it is, without straightening it: the splint spans the joint above and below. Pad with clothing.',
            'Imobilize como está, sem endireitar: a tala pega a articulação de cima e a de baixo. Acolchoe com roupa.',
          ),
          s(
            'Brazo: cabestrillo con un pañuelo o la campera. Pierna: atala a la otra pierna con algo rígido en el medio.',
            'Arm: sling with a scarf or jacket. Leg: tie it to the other leg with something rigid in between.',
            'Braço: tipoia com um lenço ou o casaco. Perna: amarre-a à outra perna com algo rígido no meio.',
          ),
          s(
            'Controlá que los dedos sigan tibios y rosados; si se ponen fríos, azules o con hormigueo, aflojá las ataduras.',
            'Check that fingers or toes stay warm and pink; if they turn cold, blue or tingly, loosen the ties.',
            'Verifique se os dedos continuam quentes e rosados; se ficarem frios, azulados ou com formigamento, afrouxe as amarras.',
          ),
          s(
            'Frío envuelto en un trapo 20 minutos para el dolor y la hinchazón.',
            'Cold wrapped in a cloth for 20 minutes for pain and swelling.',
            'Frio envolto em um pano por 20 minutos para a dor e o inchaço.',
          ),
          sw(
            'Improvisá la férula con bastones, ramas, el aislante o la mochila. Con una pierna lastimada no camines: pedí rescate. Con un brazo inmovilizado, en general se puede caminar.',
            'Improvise the splint with poles, branches, the sleeping pad or a backpack. With an injured leg do not walk: ask for rescue. With an immobilized arm you can usually walk.',
            'Improvise a tala com bastões, galhos, o isolante térmico ou a mochila. Com a perna machucada não ande: peça resgate. Com o braço imobilizado, em geral dá para andar.',
          ),
          s(
            'Fémur (muslo) o pelvis: pueden sangrar mucho por dentro; no la muevas y tratá el shock.',
            'Thigh bone or pelvis: they can bleed a lot internally; do not move them and treat for shock.',
            'Fêmur (coxa) ou pelve: podem sangrar muito por dentro; não mova a pessoa e trate o choque.',
          ),
          no(
            'No intentes acomodar el hueso ni la articulación.',
            'Do not try to set the bone or the joint.',
            'Não tente recolocar o osso nem a articulação.',
          ),
        ],
        calls: ['same'],
        options: [{ label: l('Está pálida, fría y sudorosa', 'Pale, cold and sweaty', 'Está pálida, fria e suando'), next: 'topic:bleeding#shock' }],
      },
    },
  },

  {
    id: 'burns',
    title: l('Quemaduras', 'Burns', 'Queimaduras'),
    keywords: l(
      'quemadura fuego agua hirviendo aceite químico eléctrica',
      'burn fire scald boiling oil chemical electrical',
      'queimadura fogo água fervendo óleo químico elétrica',
    ),
    start: 'start',
    nodes: {
      start: {
        title: l('Frenar la quemadura y enfriar', 'Stop the burning and cool', 'Parar a queimadura e resfriar'),
        steps: [
          s(
            'Si la ropa se prende fuego: que se tire al piso y ruede, o apagalo con una manta.',
            'If clothing catches fire: stop, drop and roll, or smother it with a blanket.',
            'Se a roupa pegar fogo: a pessoa deve se jogar no chão e rolar, ou apague o fogo com um cobertor.',
          ),
          s(
            'Enfriá con agua corriente fresca (no helada) durante 20 minutos. Sirve aunque haya pasado un rato.',
            'Cool with cool (not ice-cold) running water for 20 minutes. It helps even if some time has passed.',
            'Resfrie com água corrente fresca (não gelada) por 20 minutos. Adianta mesmo que já tenha passado um tempo.',
          ),
          s(
            'Sacale anillos, relojes y la ropa que no esté pegada.',
            'Remove rings, watches and any clothing that is not stuck.',
            'Tire anéis, relógios e a roupa que não estiver grudada.',
          ),
          s(
            'Tapá con film de cocina o un trapo limpio, sin apretar.',
            'Cover loosely with cling film or a clean cloth.',
            'Cubra sem apertar, com filme plástico de cozinha ou um pano limpo.',
          ),
          s(
            'Abrigá el resto del cuerpo: enfriar mucho puede dar hipotermia, sobre todo en chicos.',
            'Keep the rest of the body warm: too much cooling can cause hypothermia, especially in children.',
            'Agasalhe o resto do corpo: resfriar demais pode causar hipotermia, sobretudo em crianças.',
          ),
          no(
            'No pongas hielo, manteca, aceite, pasta de dientes ni cremas. No revientes las ampollas.',
            'Do not apply ice, butter, oil, toothpaste or creams. Do not pop blisters.',
            'Não coloque gelo, manteiga, óleo, pasta de dente nem pomadas. Não estoure as bolhas.',
          ),
        ],
        question: l('¿Cómo fue?', 'What kind of burn?', 'Como foi?'),
        options: [
          { label: l('Fuego, agua o aceite caliente', 'Fire, hot water or oil', 'Fogo, água ou óleo quente'), next: 'severity' },
          { label: l('Químico', 'Chemical', 'Químico'), next: 'chemical' },
          { label: l('Electricidad o rayo', 'Electricity or lightning', 'Eletricidade ou raio'), next: 'electrical' },
        ],
      },
      severity: {
        title: l('¿Necesita médico?', 'Does it need a doctor?', 'Precisa de médico?'),
        steps: [
          s(
            'Va al médico si: es más grande que la palma de su mano, está en cara, manos, pies, genitales o articulaciones, se ve blanca o negra, o es un chico o un mayor.',
            'See a doctor if: it is larger than their palm, on the face, hands, feet, genitals or joints, looks white or charred, or the person is a child or elderly.',
            'Vá ao médico se: for maior que a palma da mão da pessoa, estiver no rosto, nas mãos, nos pés, nos genitais ou nas articulações, parecer branca ou preta, ou se for uma criança ou um idoso.',
          ),
          s(
            'Si respiró humo, tiene hollín en la nariz, ronquera o tos: urgencia, aunque se vea bien.',
            'If they breathed smoke, have soot in the nose, hoarseness or cough: emergency, even if they look fine.',
            'Se respirou fumaça, tem fuligem no nariz, rouquidão ou tosse: urgência, mesmo que pareça estar bem.',
          ),
          sc(
            'Quemaduras graves: llamá al {same}; te derivan a un centro de quemados.',
            'Severe burns: call {same}; they will refer you to a burns center.',
            'Queimaduras graves: ligue para o {same}; eles encaminham para um centro de queimados.',
          ),
          sw(
            'Si el agua es poca, usala para enfriar (es lo más importante) y guardá para beber. Quemaduras grandes, en la cara o por humo: evacuación.',
            'If water is scarce, use it to cool the burn (it matters most) and keep some for drinking. Large burns, on the face or from smoke: evacuate.',
            'Se houver pouca água, use-a para resfriar (é o mais importante) e guarde um pouco para beber. Queimaduras grandes, no rosto ou por fumaça: evacuação.',
          ),
          sw(
            'Dale de beber de a sorbos si está consciente: las quemaduras grandes deshidratan.',
            'Give sips of water if they are conscious: large burns dehydrate.',
            'Dê água em golinhos se estiver consciente: queimaduras grandes desidratam.',
          ),
        ],
        calls: ['same', 'burns'],
      },
      chemical: {
        title: l('Quemadura química', 'Chemical burn', 'Queimadura química'),
        steps: [
          s(
            'Protegete las manos. Si es polvo, sacudilo antes de mojar.',
            'Protect your hands. If it is a powder, brush it off before wetting.',
            'Proteja as mãos. Se for pó, sacuda antes de molhar.',
          ),
          s(
            'Lavá con mucha agua corriente al menos 20 minutos; en los ojos, con el ojo abierto, desde adentro hacia afuera.',
            'Rinse with plenty of running water for at least 20 minutes; for eyes, keep the eye open and rinse from the inside out.',
            'Lave com bastante água corrente por pelo menos 20 minutos; nos olhos, com o olho aberto, de dentro para fora.',
          ),
          s(
            'Sacale la ropa contaminada. Guardá el envase del producto.',
            'Remove contaminated clothing. Keep the product container.',
            'Tire a roupa contaminada. Guarde a embalagem do produto.',
          ),
          s('Llamá al {poison}.', 'Call {poison}.', 'Ligue para {poison}.'),
        ],
        calls: ['poison', 'same'],
      },
      electrical: {
        title: l('Electricidad o rayo', 'Electricity or lightning', 'Eletricidade ou raio'),
        steps: [
          s(
            'Cortá la luz antes de tocarla. Si no podés, separala con algo seco que no conduzca (madera, plástico).',
            'Cut the power before touching them. If you cannot, push them away with something dry and non-conductive (wood, plastic).',
            'Desligue a energia antes de tocar na pessoa. Se não puder, afaste-a com algo seco que não conduza eletricidade (madeira, plástico).',
          ),
          s(
            'Cables de alta tensión: no te acerques, llamá al {emergency}.',
            'High-voltage lines: do not approach, call {emergency}.',
            'Fios de alta tensão: não se aproxime, ligue para o {emergency}.',
          ),
          s(
            'Siempre va al médico: puede tener lesiones por dentro y alteraciones del ritmo del corazón.',
            'Always see a doctor: there can be internal injuries and heart rhythm problems.',
            'Sempre deve ir ao médico: pode haver lesões por dentro e alterações do ritmo do coração.',
          ),
          s(
            'Alguien alcanzado por un rayo no queda "cargado": se lo puede tocar y reanimar enseguida.',
            'A lightning victim is not "charged": you can touch them and resuscitate right away.',
            'Quem foi atingido por um raio não fica “carregado”: pode-se tocar na pessoa e reanimá-la imediatamente.',
          ),
        ],
        calls: ['same', 'emergency'],
        options: [{ label: l('Dejó de responder', 'Stopped responding', 'Parou de responder'), next: 'topic:assess' }],
      },
    },
  },

  {
    id: 'chest',
    title: l('Dolor de pecho', 'Chest pain', 'Dor no peito'),
    keywords: l('infarto corazón dolor pecho brazo', 'heart attack chest pain arm', 'infarto coração dor no peito braço'),
    start: 'start',
    nodes: {
      start: {
        title: l('Posible infarto', 'Possible heart attack', 'Possível infarto'),
        steps: [
          s(
            'Señales: dolor u opresión en el pecho que puede ir al brazo, cuello, mandíbula o espalda; falta de aire, sudor frío, náuseas.',
            'Signs: chest pain or pressure that may spread to the arm, neck, jaw or back; shortness of breath, cold sweat, nausea.',
            'Sinais: dor ou aperto no peito que pode irradiar para o braço, o pescoço, a mandíbula ou as costas; falta de ar, suor frio, náuseas.',
          ),
          CALL_SPEAKER,
          s(
            'Que deje todo y se siente cómoda, semisentada.',
            'Have them stop everything and sit comfortably, half sitting.',
            'Peça que pare tudo e se sente confortavelmente, meio sentada.',
          ),
          s(
            'Si es adulto, no es alérgico a la aspirina y no tiene riesgo de sangrado, que mastique una aspirina (300 mg).',
            'If adult, not allergic to aspirin and with no bleeding risk, have them chew one aspirin (300 mg).',
            'Se for adulto, não tiver alergia à aspirina e não tiver risco de sangramento, peça que mastigue uma aspirina (300 mg).',
          ),
          s(
            'Si tiene nitroglicerina recetada, ayudala a tomarla.',
            'If they have prescribed nitroglycerin, help them take it.',
            'Se tiver nitroglicerina receitada, ajude-a a tomar.',
          ),
          s(
            'Buscá un desfibrilador (DEA) por si hace falta.',
            'Look for a defibrillator (AED) in case it is needed.',
            'Procure um desfibrilador (DEA), caso seja preciso.',
          ),
          sw(
            'Que no camine ni cargue peso: el esfuerzo empeora el infarto. Pedí rescate.',
            'They must not walk or carry weight: effort worsens a heart attack. Ask for rescue.',
            'Ela não deve andar nem carregar peso: o esforço piora o infarto. Peça resgate.',
          ),
          WILD_RESCUE,
        ],
        calls: ['same', 'emergency'],
        options: [{ label: l('Deja de responder o de respirar', 'Stops responding or breathing', 'Parou de responder ou de respirar'), next: 'topic:cpr' }],
      },
    },
  },

  {
    id: 'stroke',
    title: l('ACV (ataque cerebral)', 'Stroke', 'AVC (derrame)'),
    keywords: l(
      'acv ataque cerebral derrame cara torcida brazo habla',
      'stroke face drooping arm weakness speech',
      'avc acidente vascular cerebral derrame rosto torto braço fala',
    ),
    start: 'start',
    nodes: {
      start: {
        title: l('Posible ACV: cada minuto cuenta', 'Possible stroke: every minute counts', 'Possível AVC: cada minuto conta'),
        steps: [
          s(
            'Pedile que sonría (¿se le tuerce la cara?), que levante los dos brazos (¿uno cae?) y que repita una frase (¿habla mal?).',
            'Ask them to smile (does the face droop?), raise both arms (does one drift down?) and repeat a sentence (is speech slurred?).',
            'Peça que sorria (o rosto entorta?), que levante os dois braços (um cai?) e que repita uma frase (a fala está enrolada?).',
          ),
          s(
            'Con cualquiera de las tres, llamá ya al {same}: hay tratamientos que solo sirven en las primeras horas.',
            'With any of the three, call {same} now: some treatments only work in the first hours.',
            'Com qualquer um dos três, ligue já para o {same}: há tratamentos que só funcionam nas primeiras horas.',
          ),
          s(
            'Anotá la hora en que empezó (o la última vez que se la vio bien).',
            'Write down when it started (or the last time they were seen well).',
            'Anote a hora em que começou (ou a última vez em que a pessoa foi vista bem).',
          ),
          s(
            'Si se desvanece pero respira, posición lateral de seguridad.',
            'If they pass out but breathe, recovery position.',
            'Se a pessoa desmaiar mas respirar, posição lateral de segurança.',
          ),
          no(
            'No le des de comer, de beber ni remedios: puede atragantarse.',
            'Do not give food, drink or medication: they may choke.',
            'Não dê comida, bebida nem remédios: ela pode engasgar.',
          ),
          sw(
            'Es una evacuación urgente: el tiempo hasta el hospital define las secuelas.',
            'This is an urgent evacuation: time to hospital determines the damage.',
            'É uma evacuação urgente: o tempo até o hospital define as sequelas.',
          ),
          WILD_RESCUE,
        ],
        calls: ['same', 'emergency'],
        options: [{ label: l('Dejó de responder', 'Stopped responding', 'Parou de responder'), next: 'topic:assess' }],
      },
    },
  },

  {
    id: 'seizure',
    title: l('Convulsión', 'Seizure', 'Convulsão'),
    keywords: l('convulsión epilepsia ataque', 'seizure epilepsy fit', 'convulsão epilepsia crise'),
    start: 'start',
    nodes: {
      start: {
        title: l('Durante la convulsión', 'During the seizure', 'Durante a convulsão'),
        steps: [
          s(
            'Alejá lo que la pueda lastimar y poné algo blando bajo la cabeza.',
            'Move away anything that could hurt them and put something soft under the head.',
            'Afaste o que possa machucar a pessoa e coloque algo macio embaixo da cabeça.',
          ),
          s('Mirá la hora: importa cuánto dura.', 'Check the time: duration matters.', 'Olhe o relógio: importa quanto tempo dura.'),
          no(
            'No la sujetes ni le metas nada en la boca (no se traga la lengua).',
            'Do not hold them down or put anything in their mouth (they will not swallow their tongue).',
            'Não segure a pessoa nem coloque nada na boca dela (ela não engole a língua).',
          ),
          s(
            'Cuando termina, ponela de costado y dejala descansar: es normal que esté confundida un rato.',
            'When it stops, put them on their side and let them rest: confusion for a while is normal.',
            'Quando terminar, coloque-a de lado e deixe-a descansar: é normal ficar confusa por um tempo.',
          ),
          s(
            'Llamá al {same} si dura más de 5 minutos, se repite, es la primera vez, se lastimó, pasó en el agua, está embarazada, es diabética o no se despierta.',
            'Call {same} if it lasts more than 5 minutes, repeats, is the first one, they got hurt, it happened in water, they are pregnant, diabetic or do not wake up.',
            'Ligue para o {same} se durar mais de 5 minutos, se repetir, se for a primeira vez, se ela se machucou, se aconteceu na água, se estiver grávida, for diabética ou não acordar.',
          ),
          s(
            'En un chico con fiebre: sacale ropa y bajá la fiebre de a poco, sin bañarlo en agua fría.',
            'In a child with fever: remove clothing and lower the fever gradually, without a cold bath.',
            'Em uma criança com febre: tire a roupa e baixe a febre aos poucos, sem dar banho em água fria.',
          ),
        ],
        calls: ['same'],
        options: [{ label: l('No respira después', 'Not breathing afterwards', 'Não respira depois'), next: 'topic:cpr' }],
      },
    },
  },

  {
    id: 'poisoning',
    title: l('Intoxicación o gas', 'Poisoning or gas', 'Intoxicação ou gás'),
    keywords: l(
      'intoxicación veneno pastillas lavandina monóxido brasero gas hongos plantas',
      'poisoning pills bleach carbon monoxide gas mushrooms plants',
      'intoxicação veneno comprimidos água sanitária monóxido de carbono gás cogumelos plantas',
    ),
    start: 'start',
    nodes: {
      start: {
        title: l('¿Cómo fue?', 'How did it happen?', 'Como foi?'),
        steps: [
          s(
            'Averiguá qué fue, cuánto y a qué hora. Guardá el envase, la planta o el hongo.',
            'Find out what, how much and when. Keep the container, plant or mushroom.',
            'Descubra o que foi, quanto e a que horas. Guarde a embalagem, a planta ou o cogumelo.',
          ),
        ],
        question: l('¿Cómo se intoxicó?', 'How were they poisoned?', 'Como a pessoa se intoxicou?'),
        options: [
          { label: l('Lo tragó', 'Swallowed it', 'Engoliu'), next: 'swallowed' },
          { label: l('Respiró gas o humo (brasero, estufa, auto)', 'Breathed gas or smoke (brazier, heater, car)', 'Respirou gás ou fumaça (braseiro, aquecedor, carro)'), next: 'gas' },
          { label: l('En la piel o los ojos', 'On the skin or in the eyes', 'Na pele ou nos olhos'), next: 'skin' },
        ],
      },
      swallowed: {
        title: l('Lo tragó', 'Swallowed', 'Engoliu'),
        steps: [
          s('Llamá al {poison} y seguí sus indicaciones.', 'Call {poison} and follow their advice.', 'Ligue para {poison} e siga as orientações.'),
          no(
            'No la hagas vomitar, no le des leche, aceite ni nada sin que te lo indiquen.',
            'Do not make them vomit or give milk, oil or anything unless told to.',
            'Não provoque vômito, não dê leite, óleo nem nada sem que mandem.',
          ),
          s(
            'Si se duerme pero respira, posición lateral de seguridad.',
            'If they become drowsy but breathe, recovery position.',
            'Se ficar sonolenta mas respirar, posição lateral de segurança.',
          ),
        ],
        calls: ['poison', 'poisonKids', 'same'],
        options: [{ label: l('Dejó de responder', 'Stopped responding', 'Parou de responder'), next: 'topic:assess' }],
      },
      gas: {
        title: l('Gas o humo', 'Gas or smoke', 'Gás ou fumaça'),
        steps: [
          s(
            'El monóxido (braseros, estufas, calefones, autos en lugares cerrados) no tiene olor: si varios tienen dolor de cabeza, mareos o náuseas a la vez, sospechalo.',
            'Carbon monoxide (braziers, heaters, water heaters, cars in closed spaces) has no smell: if several people have headache, dizziness or nausea at once, suspect it.',
            'O monóxido de carbono (braseiros, aquecedores, boilers, carros em lugares fechados) não tem cheiro: se várias pessoas tiverem dor de cabeça, tontura ou náuseas ao mesmo tempo, suspeite dele.',
          ),
          s(
            'Abrí puertas y ventanas y sacá a todos al aire libre, sin exponerte de más.',
            'Open doors and windows and get everyone outside, without exposing yourself too much.',
            'Abra portas e janelas e tire todos para o ar livre, sem se expor demais.',
          ),
          no(
            'No prendas ni apagues luces ni nada que haga chispa si huele a gas.',
            'Do not switch lights or anything that sparks if you smell gas.',
            'Não ligue nem desligue luzes nem nada que faça faísca se houver cheiro de gás.',
          ),
          s(
            'Llamá al {same}: aunque se recupere, necesita oxígeno y control.',
            'Call {same}: even if they recover, they need oxygen and a checkup.',
            'Ligue para o {same}: mesmo que a pessoa se recupere, ela precisa de oxigênio e de acompanhamento.',
          ),
        ],
        calls: ['same', 'emergency', 'poison'],
        options: [{ label: l('Dejó de responder', 'Stopped responding', 'Parou de responder'), next: 'topic:assess' }],
      },
      skin: {
        title: l('Piel u ojos', 'Skin or eyes', 'Pele ou olhos'),
        steps: [
          s(
            'Sacale la ropa contaminada y lavá con mucha agua 15 a 20 minutos.',
            'Remove contaminated clothing and rinse with plenty of water for 15 to 20 minutes.',
            'Tire a roupa contaminada e lave com bastante água por 15 a 20 minutos.',
          ),
          s(
            'Ojos: con el ojo abierto, agua corriente desde adentro hacia afuera; sacale las lentes de contacto.',
            'Eyes: keep the eye open, running water from the inside out; remove contact lenses.',
            'Olhos: com o olho aberto, água corrente de dentro para fora; tire as lentes de contato.',
          ),
          s('Llamá al {poison} con el envase a mano.', 'Call {poison} with the container at hand.', 'Ligue para {poison} com a embalagem em mãos.'),
        ],
        calls: ['poison', 'same'],
      },
    },
  },

  {
    id: 'hypothermia',
    title: l('Hipotermia (mucho frío)', 'Hypothermia (very cold)', 'Hipotermia (muito frio)'),
    keywords: l(
      'hipotermia frío congelamiento nieve temblor',
      'hypothermia cold frostbite snow shivering',
      'hipotermia frio congelamento neve tremor',
    ),
    start: 'start',
    nodes: {
      start: {
        title: l('Hipotermia', 'Hypothermia', 'Hipotermia'),
        steps: [
          s(
            'Señales: tiembla, torpe, habla arrastrada, confundida. Grave: deja de temblar, somnolienta, apática.',
            'Signs: shivering, clumsy, slurred speech, confused. Severe: stops shivering, drowsy, apathetic.',
            'Sinais: treme, desajeitada, fala arrastada, confusa. Grave: para de tremer, sonolenta, apática.',
          ),
          s(
            'Llevala a un reparo del viento y la humedad. Sacale la ropa mojada y poné ropa seca.',
            'Move them out of the wind and wet. Replace wet clothes with dry ones.',
            'Leve a pessoa para um abrigo do vento e da umidade. Tire a roupa molhada e coloque roupa seca.',
          ),
          s(
            'Aislala del suelo y envolvela entera (bolsa de dormir, mantas, manta térmica), cabeza incluida.',
            'Insulate from the ground and wrap them fully (sleeping bag, blankets, emergency blanket), head included.',
            'Isole-a do chão e envolva-a inteira (saco de dormir, cobertores, manta térmica), incluindo a cabeça.',
          ),
          s(
            'Si está despierta y traga bien: bebidas tibias y dulces, y algo de comer.',
            'If awake and able to swallow: warm sweet drinks and some food.',
            'Se estiver acordada e engolir bem: bebidas mornas e doces, e algo para comer.',
          ),
          s(
            'Calor en el pecho, axilas e ingle (botellas tibias envueltas), no en brazos y piernas.',
            'Heat on the chest, armpits and groin (wrapped warm bottles), not on arms and legs.',
            'Calor no peito, nas axilas e na virilha (garrafas mornas embrulhadas), não nos braços e nas pernas.',
          ),
          s(
            'Con hipotermia grave, movela con mucho cuidado y horizontal: los golpes pueden alterar el corazón.',
            'With severe hypothermia, move them very gently and horizontally: jolts can upset the heart rhythm.',
            'Com hipotermia grave, mova a pessoa com muito cuidado e na horizontal: solavancos podem alterar o coração.',
          ),
          no(
            'No la frotes, no le des alcohol ni la metas en agua caliente.',
            'Do not rub them, give alcohol or put them in hot water.',
            'Não esfregue a pessoa, não dê álcool nem a coloque em água quente.',
          ),
          sc(
            'Si está confundida o dejó de temblar, llamá al {same}.',
            'If confused or no longer shivering, call {same}.',
            'Se estiver confusa ou parou de tremer, ligue para o {same}.',
          ),
          WILD_RESCUE,
        ],
        calls: ['same', 'emergency'],
        options: [{ label: l('No responde o no respira', 'Unresponsive or not breathing', 'Não responde ou não respira'), next: 'topic:cpr' }],
      },
    },
  },

  {
    id: 'heat',
    title: l('Golpe de calor', 'Heat stroke', 'Insolação (golpe de calor)'),
    keywords: l(
      'golpe de calor insolación deshidratación temperatura',
      'heat stroke sunstroke dehydration',
      'golpe de calor insolação desidratação temperatura',
    ),
    start: 'start',
    nodes: {
      start: {
        title: l('Golpe de calor', 'Heat stroke', 'Golpe de calor'),
        steps: [
          s(
            'Señales: piel muy caliente, confusión, mareo, dolor de cabeza, vómitos, puede dejar de sudar.',
            'Signs: very hot skin, confusion, dizziness, headache, vomiting, may stop sweating.',
            'Sinais: pele muito quente, confusão, tontura, dor de cabeça, vômitos, pode parar de suar.',
          ),
          s(
            'Con confusión es una emergencia: enfriala ya, es lo que le salva la vida.',
            'With confusion it is an emergency: cool them now, that is what saves their life.',
            'Com confusão é uma emergência: resfrie a pessoa já, é isso que salva a vida dela.',
          ),
          s(
            'Lo mejor: sumergirla hasta el cuello en agua fría (río, arroyo, bañera). Si no: mojala entera y abanicá, y poné frío en cuello, axilas e ingle.',
            'Best: immerse up to the neck in cold water (river, stream, bathtub). Otherwise: soak them all over and fan, and put cold on the neck, armpits and groin.',
            'O melhor: mergulhar a pessoa até o pescoço em água fria (rio, riacho, banheira). Se não der: molhe-a inteira e abane, e coloque frio no pescoço, nas axilas e na virilha.',
          ),
          s(
            'Si está despierta, que tome agua fresca o con sales de a sorbos.',
            'If awake, give cool water or oral rehydration salts in sips.',
            'Se estiver acordada, que tome água fresca ou com sais de reidratação em golinhos.',
          ),
          s(
            'Parás de enfriar cuando vuelve a estar lúcida.',
            'Stop cooling when they are clear-headed again.',
            'Pare de resfriar quando ela voltar a ficar lúcida.',
          ),
          sc('Llamá al {same}.', 'Call {same}.', 'Ligue para o {same}.'),
          WILD_RESCUE,
        ],
        calls: ['same', 'emergency'],
        options: [{ label: l('Dejó de responder', 'Stopped responding', 'Parou de responder'), next: 'topic:assess' }],
      },
    },
  },

  {
    id: 'hypoglycemia',
    title: l('Diabético con baja de azúcar', 'Low blood sugar (diabetic)', 'Diabético com açúcar baixo'),
    keywords: l(
      'diabetes hipoglucemia azúcar insulina',
      'diabetes hypoglycemia sugar insulin',
      'diabetes hipoglicemia açúcar insulina',
    ),
    start: 'start',
    nodes: {
      start: {
        title: l('Baja de azúcar', 'Low blood sugar', 'Açúcar baixo no sangue'),
        steps: [
          s(
            'Señales en un diabético: sudor, temblor, palidez, confusión o comportamiento raro.',
            'Signs in a diabetic: sweating, shaking, paleness, confusion or odd behavior.',
            'Sinais em um diabético: suor, tremor, palidez, confusão ou comportamento estranho.',
          ),
          s(
            'Si está despierta y traga bien: azúcar rápida (3 o 4 caramelos, un vaso de gaseosa común o jugo, 2 cucharadas de azúcar en agua).',
            'If awake and able to swallow: fast sugar (3 or 4 candies, a glass of regular soda or juice, 2 tablespoons of sugar in water).',
            'Se estiver acordada e engolir bem: açúcar de ação rápida (3 ou 4 balas, um copo de refrigerante comum ou suco, 2 colheres de sopa de açúcar em água).',
          ),
          s(
            'Si a los 15 minutos no mejora, repetí. Cuando mejora, que coma algo (pan, galletitas).',
            'If not better in 15 minutes, repeat. Once better, have them eat something (bread, crackers).',
            'Se em 15 minutos não melhorar, repita. Quando melhorar, peça que coma algo (pão, bolacha).',
          ),
          no(
            'Si no traga o no responde, no le des nada por boca: posición lateral y llamá al {same}.',
            'If they cannot swallow or do not respond, give nothing by mouth: recovery position and call {same}.',
            'Se não engolir ou não responder, não dê nada pela boca: posição lateral e ligue para o {same}.',
          ),
        ],
        calls: ['same'],
        options: [{ label: l('Dejó de responder', 'Stopped responding', 'Parou de responder'), next: 'topic:assess' }],
      },
    },
  },

  {
    id: 'drowning',
    title: l('Ahogamiento', 'Drowning', 'Afogamento'),
    keywords: l(
      'ahogado agua río pileta mar rescate',
      'drowning water river pool sea rescue',
      'afogado água rio piscina mar resgate afogamento',
    ),
    start: 'start',
    nodes: {
      start: {
        title: l('Sacarla del agua sin ahogarte vos', 'Get them out without drowning yourself', 'Tirar a pessoa da água sem se afogar'),
        steps: [
          s(
            'No te tires si no sabés rescatar: alcanzale un palo, una soga o algo que flote, desde la orilla.',
            'Do not jump in unless trained: reach out with a stick or rope or throw something that floats, from the shore.',
            'Não se jogue se não sabe resgatar: estenda um pau, uma corda ou algo que flutue, a partir da margem.',
          ),
          s(
            'Afuera del agua: si no respira, empezá con 5 respiraciones y seguí con la RCP.',
            'Out of the water: if not breathing, start with 5 rescue breaths and continue with CPR.',
            'Fora da água: se não respira, comece com 5 respirações e continue com a RCP.',
          ),
          s(
            'Si respira, posición lateral de seguridad, sacale la ropa mojada y abrigala.',
            'If breathing, recovery position, remove wet clothes and keep them warm.',
            'Se respira, posição lateral de segurança, tire a roupa molhada e agasalhe.',
          ),
          s(
            'Aunque se recupere, tiene que verla un médico: puede complicarse horas después.',
            'Even if they recover, a doctor must check them: it can get worse hours later.',
            'Mesmo que se recupere, um médico precisa examinar a pessoa: pode piorar horas depois.',
          ),
        ],
        calls: ['same', 'emergency'],
        options: [{ label: l('No respira', 'Not breathing', 'Não respira'), next: 'topic:cpr' }],
      },
    },
  },
];
