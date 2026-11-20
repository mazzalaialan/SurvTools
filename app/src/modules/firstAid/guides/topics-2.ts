import type { Topic } from './types';
import { CALL_SPEAKER, KEEP_WARM, l, no, s, sc, sw, WILD_RESCUE } from './helpers';

/** MARCH, mal de altura, atragantamiento, serpientes, picaduras y anafilaxia. */
export const TOPICS_2: Topic[] = [
  {
    id: 'march',
    title: l('Trauma grave: método MARCH', 'Serious trauma: the MARCH method', 'Trauma grave: método MARCH'),
    keywords: l(
      'march tccc trauma hemorragia vía aérea respiración circulación hipotermia herida grave ifak',
      'march tccc trauma hemorrhage airway breathing circulation hypothermia serious injury ifak',
      'march tccc trauma hemorragia via aérea respiração circulação hipotermia ferimento grave ifak',
    ),
    start: 'intro',
    nodes: {
      intro: {
        title: l('Qué es MARCH', 'What MARCH is', 'O que é o MARCH'),
        steps: [
          s(
            'MARCH es un orden para atender a alguien muy lastimado: primero lo que mata más rápido.',
            'MARCH is an order for treating a seriously injured person: first what kills fastest.',
            'MARCH é uma ordem para atender alguém muito ferido: primeiro o que mata mais rápido.',
          ),
          s(
            'M: hemorragia masiva. A: vía aérea. R: respiración. C: circulación. H: hipotermia y cabeza.',
            'M: massive bleeding. A: airway. R: breathing. C: circulation. H: hypothermia and head.',
            'M: hemorragia maciça. A: vias aéreas. R: respiração. C: circulação. H: hipotermia e cabeça.',
          ),
          s(
            'Antes de nada, mirá que el lugar sea seguro y protegete (guantes o una bolsa en las manos).',
            'First check the scene is safe and protect yourself (gloves or a bag on your hands).',
            'Antes de tudo, veja se o local é seguro e proteja-se (luvas ou um saco plástico nas mãos).',
          ),
          s(
            'Si hay un peligro que seguís, no te acerques: pedí ayuda.',
            'If a danger remains, do not approach: call for help.',
            'Se ainda houver perigo, não se aproxime: peça ajuda.',
          ),
          sc(
            'Llamá al {medical} apenas puedas (o que otra persona llame mientras vos atendés).',
            'Call {medical} as soon as you can (or have someone call while you treat).',
            'Ligue para o {medical} assim que puder (ou peça que outra pessoa ligue enquanto você atende).',
          ),
          WILD_RESCUE,
        ],
        calls: ['same', 'emergency'],
        options: [
          { label: l('Empezar por M: sangrado', 'Start with M: bleeding', 'Começar pelo M: sangramento'), next: 'm' },
          { label: l('De dónde sale esta guía', 'Where this guide comes from', 'De onde vem este guia'), next: 'about' },
        ],
      },
      about: {
        title: l('De dónde sale esta guía', 'Where this guide comes from', 'De onde vem este guia'),
        steps: [
          s(
            'Sale de las guías de trauma de combate civiles y militares (TCCC 2026 del Committee on TCCC y TECC 2024 de C-TECC).',
            'It comes from civilian and military trauma-care guidelines (TCCC 2026 by the Committee on TCCC and TECC 2024 by C-TECC).',
            'Vem das diretrizes de trauma de combate civis e militares (TCCC 2026, do Committee on TCCC, e TECC 2024, do C-TECC).',
          ),
          s(
            'Está adaptada para quien no es médico: no reemplaza un curso.',
            'It is adapted for non-medical people: it does not replace a course.',
            'Foi adaptada para quem não é médico: não substitui um curso.',
          ),
        ],
        options: [{ label: l('Empezar por M: sangrado', 'Start with M: bleeding', 'Começar pelo M: sangramento'), next: 'm' }],
      },
      m: {
        title: l('M · Hemorragia masiva', 'M · Massive bleeding', 'M · Hemorragia maciça'),
        steps: [
          s(
            'Buscá sangrado fuerte en todo el cuerpo (también bajo la ropa o la espalda).',
            'Look for heavy bleeding all over the body (also under clothing and on the back).',
            'Procure sangramento forte no corpo todo (também embaixo da roupa e nas costas).',
          ),
          s(
            'Es lo primero: se muere por desangrado en minutos.',
            'It comes first: people bleed to death in minutes.',
            'É a primeira coisa: a pessoa pode morrer por perda de sangue em minutos.',
          ),
          s('Presión directa fuerte con gasa o tela.', 'Strong direct pressure with gauze or cloth.', 'Pressão direta forte com gaze ou pano.'),
        ],
        calls: ['same', 'emergency'],
        options: [
          { label: l('Seguir: torniquete y relleno', 'Continue: tourniquet and packing', 'Continuar: torniquete e preenchimento'), next: 'm2' },
          { label: l('Ver el paso a paso de sangrado', 'See the step-by-step bleeding guide', 'Ver o passo a passo de sangramento'), next: 'topic:bleeding' },
        ],
      },
      m2: {
        title: l('M · Torniquete y relleno', 'M · Tourniquet and packing', 'M · Torniquete e preenchimento'),
        steps: [
          s(
            'Si no para en un brazo o pierna y sigue saliendo en chorro: torniquete 5 a 7 cm por encima de la herida, sobre la piel, y anotá la hora.',
            'If it does not stop on an arm or leg and keeps spurting: tourniquet 5 to 7 cm above the wound, on the skin, and write down the time.',
            'Se não parar em um braço ou perna e continuar esguichando: torniquete 5 a 7 cm acima do ferimento, sobre a pele, e anote o horário.',
          ),
          s(
            'Donde no va torniquete (ingle, axila, cuello) o si la presión no alcanza: rellená la herida con gasa hemostática y apretá al menos 3 minutos sin soltar.',
            'Where a tourniquet does not fit (groin, armpit, neck) or pressure is not enough: pack the wound with hemostatic gauze and press at least 3 minutes without letting go.',
            'Onde o torniquete não cabe (virilha, axila, pescoço) ou se a pressão não bastar: preencha o ferimento com gaze hemostática e aperte por pelo menos 3 minutos sem soltar.',
          ),
          s(
            'Después, un vendaje de presión encima, firme, sin sacar lo anterior.',
            'Then a firm pressure bandage on top, without removing what is underneath.',
            'Depois, uma atadura de pressão firme por cima, sem tirar o que está embaixo.',
          ),
          s(
            'Las fuentes difieren sobre el torniquete en heridas comunes (Manual del Ministerio de Salud 2016: no usar; TCCC 2026 y TECC 2024: usar si el sangrado grave de un miembro no cede). La guía de sangrado de la app lo explica.',
            'Sources differ on tourniquets for ordinary wounds (Ministry of Health manual 2016: do not use; TCCC 2026 and TECC 2024: use if severe limb bleeding does not stop). The app’s bleeding guide explains it.',
            'As fontes divergem sobre o torniquete em ferimentos comuns (manual do Ministério da Saúde 2016: não usar; TCCC 2026 e TECC 2024: usar se o sangramento grave de um membro não ceder). O guia de sangramento do app explica isso.',
          ),
          no('No aflojes un torniquete puesto: eso lo decide el médico.', 'Do not loosen a tourniquet once applied: a doctor decides that.', 'Não afrouxe um torniquete colocado: isso quem decide é o médico.'),
        ],
        calls: ['same', 'emergency'],
        options: [
          { label: l('Ver el paso a paso de sangrado', 'See the step-by-step bleeding guide', 'Ver o passo a passo de sangramento'), next: 'topic:bleeding' },
          { label: l('Seguir con A: vía aérea', 'Continue with A: airway', 'Continuar com o A: vias aéreas'), next: 'a' },
        ],
      },
      a: {
        title: l('A · Vía aérea', 'A · Airway', 'A · Vias aéreas'),
        steps: [
          s(
            'Si habla o llora, la vía aérea está abierta.',
            'If they speak or cry, the airway is open.',
            'Se a pessoa fala ou chora, as vias aéreas estão abertas.',
          ),
          s(
            'Dejala en la posición en que respire mejor (sentada o inclinada hacia adelante si hay sangre en la boca).',
            'Let them stay in the position where they breathe best (sitting or leaning forward if there is blood in the mouth).',
            'Deixe-a na posição em que respire melhor (sentada ou inclinada para a frente, se houver sangue na boca).',
          ),
          s(
            'Si está inconsciente pero respira: posición de recuperación (de costado, cabeza apenas hacia atrás, boca hacia abajo para que drene).',
            'If unconscious but breathing: recovery position (on their side, head slightly back, mouth down so it drains).',
            'Se estiver inconsciente, mas respirando: posição de recuperação (de lado, cabeça um pouco para trás, boca para baixo para escoar).',
          ),
          s(
            'Sacá lo que se vea y moleste en la boca (sangre, vómito, un diente) sin meter los dedos a ciegas.',
            'Remove what you can see blocking the mouth (blood, vomit, a tooth) without poking blindly with your fingers.',
            'Tire o que estiver visível e atrapalhando na boca (sangue, vômito, um dente), sem enfiar os dedos às cegas.',
          ),
          s(
            'Dispositivos como la cánula nasofaríngea o abrir la vía aérea con un corte son solo para personal entrenado.',
            'Devices such as a nasopharyngeal airway or a surgical airway are for trained personnel only.',
            'Dispositivos como a cânula nasofaríngea ou abrir a via aérea com um corte são só para pessoal treinado.',
          ),
        ],
        calls: ['same', 'emergency'],
        options: [
          { label: l('No respira', 'Not breathing', 'Não respira'), next: 'topic:cpr' },
          { label: l('Seguir con R: respiración', 'Continue with R: breathing', 'Continuar com o R: respiração'), next: 'r' },
        ],
      },
      r: {
        title: l('R · Respiración', 'R · Breathing', 'R · Respiração'),
        steps: [
          s(
            'Descubrí el pecho y mirá si hay heridas, si respira con dificultad o si un lado sube menos que el otro.',
            'Expose the chest and look for wounds, labored breathing or one side rising less than the other.',
            'Descubra o peito e veja se há ferimentos, se a respiração está difícil ou se um lado sobe menos que o outro.',
          ),
          s(
            'Herida en el pecho que «sopla» aire: tapala con un sello torácico ventilado, apretando al exhalar.',
            'A chest wound that “sucks” air: cover it with a vented chest seal, pressing as they breathe out.',
            'Ferimento no peito que “sopra” ar: cubra com um selo torácico ventilado, pressionando quando a pessoa expirar.',
          ),
          s(
            'Si no tenés, taparla con la mano y una gasa sin sellarla del todo.',
            'If you have none, cover it with your hand and gauze without fully sealing it.',
            'Se não tiver, cubra com a mão e uma gaze, sem vedar por completo.',
          ),
          s(
            'Si le cuesta cada vez más respirar y se pone azul o muy agitada, puede ser un neumotórax a tensión.',
            'If breathing gets harder, and they turn blue or very agitated, it may be a tension pneumothorax.',
            'Se a respiração ficar cada vez mais difícil e a pessoa ficar azulada ou muito agitada, pode ser um pneumotórax hipertensivo.',
          ),
          s(
            'Es una urgencia que resuelve solo personal entrenado (descompresión con aguja). Pedí ayuda ya.',
            'It is an emergency that only trained personnel can resolve (needle decompression). Call for help now.',
            'É uma emergência que só pessoal treinado resolve (descompressão com agulha). Peça ajuda já.',
          ),
        ],
        calls: ['same', 'emergency'],
        options: [
          { label: l('Más sobre heridas en el pecho', 'More about chest wounds', 'Mais sobre ferimentos no peito'), next: 'topic:chest' },
          { label: l('Seguir con C: circulación', 'Continue with C: circulation', 'Continuar com o C: circulação'), next: 'c' },
        ],
      },
      c: {
        title: l('C · Circulación', 'C · Circulation', 'C · Circulação'),
        steps: [
          s(
            'Volvé a mirar los sangrados: ¿se empapó algo? ¿el torniquete sigue firme?',
            'Check the bleeding again: has anything soaked through? Is the tourniquet still tight?',
            'Olhe de novo os sangramentos: algo encharcou? O torniquete continua firme?',
          ),
          s(
            'Anotá la hora del torniquete en la piel o en su ropa.',
            'Write the tourniquet time on the skin or clothing.',
            'Anote o horário do torniquete na pele ou na roupa da pessoa.',
          ),
          s(
            'Señales de shock: pálida, fría, sudorosa, pulso rápido y débil, confundida. Acostala, abrigala y hablale.',
            'Signs of shock: pale, cold, sweaty, fast weak pulse, confused. Lay them down, keep them warm and talk to them.',
            'Sinais de choque: pálida, fria, suando, pulso rápido e fraco, confusa. Deite a pessoa, agasalhe e converse com ela.',
          ),
          s(
            'Si sospechás una fractura de pelvis (golpe fuerte en la cadera, dolor al presionar): no la muevas más de lo necesario.',
            'If you suspect a broken pelvis (hard hit to the hip, pain on pressing): do not move them more than necessary.',
            'Se suspeitar de fratura de pelve (pancada forte no quadril, dor ao pressionar): não mova a pessoa mais que o necessário.',
          ),
          no('No le des de comer ni de beber.', 'Do not give food or drink.', 'Não dê nada para comer nem para beber.'),
        ],
        calls: ['same', 'emergency'],
        options: [{ label: l('Seguir con H: frío y cabeza', 'Continue with H: cold and head', 'Continuar com o H: frio e cabeça'), next: 'h' }],
      },
      h: {
        title: l('H · Hipotermia y cabeza', 'H · Hypothermia and head', 'H · Hipotermia e cabeça'),
        steps: [
          s(
            'Una persona herida pierde calor muy rápido y el frío empeora el sangrado.',
            'An injured person loses heat very fast and cold worsens bleeding.',
            'Uma pessoa ferida perde calor muito rápido e o frio piora o sangramento.',
          ),
          s(
            'Aislala del suelo, sacale la ropa mojada y envolvela con una manta de emergencia o ropa seca, cabeza incluida.',
            'Insulate from the ground, remove wet clothes and wrap with an emergency blanket or dry clothing, head included.',
            'Isole a pessoa do chão, tire a roupa molhada e envolva com uma manta de emergência ou roupa seca, incluindo a cabeça.',
          ),
          s(
            'Golpe en la cabeza: controlá cada pocos minutos si está despierta y responde.',
            'Head injury: check every few minutes that they are awake and responding.',
            'Pancada na cabeça: verifique a cada poucos minutos se ela está acordada e responde.',
          ),
          s(
            'Si se pone cada vez más dormida, confundida o vomita, es grave.',
            'If they get drowsier, confused or vomit, it is serious.',
            'Se ela ficar cada vez mais sonolenta, confusa ou vomitar, é grave.',
          ),
          s(
            'Cabeza apenas elevada si está acostada y respira bien.',
            'Head slightly raised if lying down and breathing well.',
            'Cabeça um pouco elevada se estiver deitada e respirando bem.',
          ),
        ],
        calls: ['same', 'emergency'],
        options: [
          { label: l('Hipotermia', 'Hypothermia', 'Hipotermia'), next: 'topic:hypothermia' },
          { label: l('Después de MARCH', 'After MARCH', 'Depois do MARCH'), next: 'after' },
        ],
      },
      after: {
        title: l('Después: heridas y huesos', 'Afterwards: wounds and bones', 'Depois: ferimentos e ossos'),
        steps: [
          s(
            'Con la persona estable: cubrí las demás heridas con apósitos limpios.',
            'With the person stable: cover other wounds with clean dressings.',
            'Com a pessoa estável: cubra os outros ferimentos com curativos limpos.',
          ),
          s('Un objeto clavado no se saca, se fija.', 'An impaled object is not removed, it is secured.', 'Um objeto cravado não se tira, se fixa.'),
          s('Ojo lastimado: un escudo rígido sin apretarlo.', 'Injured eye: a rigid shield without pressing.', 'Olho ferido: um protetor rígido, sem apertar.'),
          s(
            'Órganos del abdomen a la vista: cubrir con tela limpia y húmeda, sin empujarlos.',
            'Organs showing from the belly: cover with a clean damp cloth without pushing them back.',
            'Órgãos do abdômen expostos: cubra com um pano limpo e úmido, sem empurrá-los de volta.',
          ),
          s(
            'Inmovilizá las fracturas con férulas o lo que haya, sin forzar el hueso.',
            'Immobilize fractures with splints or whatever you have, without forcing the bone.',
            'Imobilize as fraturas com talas ou o que houver, sem forçar o osso.',
          ),
        ],
        calls: ['same', 'emergency'],
        options: [
          { label: l('Seguir: dolor y anotaciones', 'Continue: pain and notes', 'Continuar: dor e anotações'), next: 'after2' },
          { label: l('Fracturas', 'Fractures', 'Fraturas'), next: 'topic:fracture' },
        ],
      },
      after2: {
        title: l('Después: dolor y anotaciones', 'Afterwards: pain and notes', 'Depois: dor e anotações'),
        steps: [
          s(
            'Para el dolor, consultá a un profesional.',
            'For pain, ask a professional.',
            'Para a dor, consulte um profissional.',
          ),
          s(
            'En un trauma con sangrado se evitan algunos analgésicos comunes (como la aspirina y el ibuprofeno).',
            'With trauma and bleeding some common pain relievers (such as aspirin and ibuprofen) are avoided.',
            'Em um trauma com sangramento, evitam-se alguns analgésicos comuns (como a aspirina e o ibuprofeno).',
          ),
          s(
            'Anotá la hora de cada cosa que hiciste y los cambios que viste, y dáselo a quien llegue.',
            'Write down the time of everything you did and the changes you saw, and hand it to whoever arrives.',
            'Anote o horário de tudo o que fez e as mudanças que viu, e entregue a quem chegar.',
          ),
          s(
            'Repetí MARCH cada pocos minutos: lo que estaba bien puede empeorar.',
            'Repeat MARCH every few minutes: what was fine can get worse.',
            'Repita o MARCH a cada poucos minutos: o que estava bem pode piorar.',
          ),
        ],
        calls: ['same', 'emergency'],
        options: [{ label: l('Fracturas', 'Fractures', 'Fraturas'), next: 'topic:fracture' }],
      },
    },
  },

  {
    id: 'altitude',
    title: l('Mal de altura (soroche)', 'Altitude sickness', 'Mal da altitude (mal de montanha)'),
    keywords: l(
      'soroche altura mal de montaña apunamiento edema cerebral pulmonar puna',
      'altitude sickness mountain sickness acute hace hape',
      'mal da altitude mal de montanha soroche edema cerebral pulmonar altura',
    ),
    start: 'start',
    nodes: {
      start: {
        title: l('Mal agudo de montaña', 'Acute mountain sickness', 'Mal agudo da montanha'),
        steps: [
          s(
            'Aparece desde unos 2.500 m, sobre todo si se subió rápido: dolor de cabeza, náuseas, mareo, cansancio, mal sueño.',
            'It appears from about 2,500 m, especially after a fast ascent: headache, nausea, dizziness, fatigue, poor sleep.',
            'Aparece a partir de cerca de 2.500 m, sobretudo após uma subida rápida: dor de cabeça, náuseas, tontura, cansaço, sono ruim.',
          ),
          s(
            'Parar y no subir más: reposo, líquidos y comidas livianas. Si los síntomas son leves, suelen ceder en uno o dos días a la misma altura.',
            'Stop and do not climb higher: rest, fluids and light meals. If symptoms are mild they usually ease in a day or two at the same altitude.',
            'Pare e não suba mais: descanso, líquidos e refeições leves. Se os sintomas forem leves, costumam ceder em um ou dois dias na mesma altitude.',
          ),
          s(
            'Si empeora o no mejora, lo más efectivo es bajar: aunque sean unos cientos de metros.',
            'If it worsens or does not improve, the most effective thing is to go down: even a few hundred meters.',
            'Se piorar ou não melhorar, o mais eficaz é descer: mesmo que sejam algumas centenas de metros.',
          ),
          no(
            'No sigas subiendo con síntomas, ni te automediques: consultá a un médico antes de tomar medicación para la altura.',
            'Do not keep climbing with symptoms and do not self-medicate: ask a doctor before taking altitude medication.',
            'Não continue subindo com sintomas nem se automedique: consulte um médico antes de tomar remédio para altitude.',
          ),
          s(
            'Llevá siempre quien te acompañe: los síntomas graves confunden a quien los tiene.',
            'Always have someone with you: severe symptoms confuse the person who has them.',
            'Tenha sempre alguém com você: os sintomas graves deixam confuso quem os sente.',
          ),
        ],
        question: l('¿Hay alguna de estas señales graves?', 'Is there any of these severe signs?', 'Há algum destes sinais graves?'),
        options: [
          {
            answer: 'yes',
            label: l('Sí: confusión, tambalea al caminar, falta de aire en reposo o tos con espuma', 'Yes: confusion, stumbling, breathless at rest or frothy cough', 'Sim: confusão, cambaleia ao andar, falta de ar em repouso ou tosse com espuma'),
            next: 'severe',
          },
          { answer: 'no', label: l('No, solo síntomas leves', 'No, only mild symptoms', 'Não, só sintomas leves'), next: 'start' },
        ],
      },
      severe: {
        title: l('Señales graves: bajar ya', 'Severe signs: go down now', 'Sinais graves: desça já'),
        steps: [
          s(
            'Confusión, no poder caminar en línea recta, mucha falta de aire estando quieto o tos con espuma pueden ser edema cerebral o pulmonar: son urgencias que matan.',
            'Confusion, not being able to walk in a straight line, strong breathlessness at rest or a frothy cough may be cerebral or pulmonary edema: life-threatening emergencies.',
            'Confusão, não conseguir andar em linha reta, muita falta de ar em repouso ou tosse com espuma podem ser edema cerebral ou pulmonar: emergências que matam.',
          ),
          s(
            'Bajar de inmediato, acompañado, y lo más posible: es el tratamiento que sirve. No esperes a ver si pasa.',
            'Descend immediately, accompanied, as far as you can: it is the treatment that works. Do not wait to see if it passes.',
            'Desça imediatamente, acompanhado e o máximo possível: é o tratamento que funciona. Não espere para ver se passa.',
          ),
          sw(
            'Pedí rescate al {emergency} y pasá las coordenadas de «Mi ubicación». Si hay oxígeno o una cámara portátil de altura, que la use quien sepa.',
            'Ask for rescue on {emergency} and give the coordinates from “My location”. If oxygen or a portable altitude chamber is available, someone who knows how should use it.',
            'Peça resgate pelo {emergency} e informe as coordenadas de “Minha localização”. Se houver oxigênio ou uma câmara hiperbárica portátil, que use quem souber.',
          ),
          sc('Llamá al {medical}.', 'Call {medical}.', 'Ligue para o {medical}.'),
          KEEP_WARM,
        ],
        calls: ['same', 'emergency'],
        options: [{ label: l('Dejó de responder', 'Stopped responding', 'Parou de responder'), next: 'topic:assess' }],
      },
    },
  },

  {
    id: 'choking',
    title: l('Atragantamiento', 'Choking', 'Engasgo'),
    keywords: l(
      'se ahoga atorado comida obstrucción heimlich',
      'choking food obstruction heimlich',
      'engasgo engasgada comida obstrução heimlich sufocando',
    ),
    start: 'start',
    nodes: {
      start: {
        title: l('¿Puede toser o hablar?', 'Can they cough or speak?', 'Ela consegue tossir ou falar?'),
        steps: [s('Preguntale: "¿Te estás ahogando?"', 'Ask: "Are you choking?"', 'Pergunte: “Você está engasgada?”')],
        question: l('¿Tose con fuerza o puede hablar?', 'Are they coughing hard or able to speak?', 'Ela tosse com força ou consegue falar?'),
        options: [
          { answer: 'yes', label: l('Sí, tose', 'Yes, coughing', 'Sim, tosse'), next: 'cough' },
          { answer: 'no', label: l('No puede toser, hablar ni respirar (adulto o niño)', 'Cannot cough, speak or breathe (adult or child)', 'Não consegue tossir, falar nem respirar (adulto ou criança)'), next: 'adult' },
          { label: l('Es un bebé (menos de 1 año)', 'It is a baby (under 1 year)', 'É um bebê (menos de 1 ano)'), next: 'baby' },
        ],
      },
      cough: {
        title: l('Que siga tosiendo', 'Keep them coughing', 'Deixe-a continuar tossindo'),
        steps: [
          s(
            'Animala a toser fuerte. No le pegues en la espalda mientras tose bien.',
            'Encourage strong coughing. Do not slap their back while they cough effectively.',
            'Incentive a pessoa a tossir forte. Não bata nas costas dela enquanto ela tosse bem.',
          ),
          s(
            'Quedate con ella: si deja de toser o se pone morada, pasá a los golpes.',
            'Stay with them: if they stop coughing or turn blue, go to back blows.',
            'Fique com ela: se parar de tossir ou ficar roxa, passe para as pancadas nas costas.',
          ),
        ],
        options: [{ label: l('Ya no puede toser', 'Can no longer cough', 'Não consegue mais tossir'), next: 'adult' }],
      },
      adult: {
        title: l('Golpes en la espalda y compresiones abdominales', 'Back blows and abdominal thrusts', 'Pancadas nas costas e compressões abdominais'),
        steps: [
          s(
            'Inclinala hacia adelante y dale hasta 5 golpes fuertes entre los omóplatos con el talón de la mano.',
            'Lean them forward and give up to 5 sharp blows between the shoulder blades with the heel of your hand.',
            'Incline a pessoa para a frente e dê até 5 pancadas fortes entre as omoplatas com a base da mão.',
          ),
          s(
            'Si no sale: parate detrás, puño arriba del ombligo, la otra mano encima, y tirá fuerte hacia adentro y arriba hasta 5 veces (maniobra de Heimlich).',
            'If it does not come out: stand behind, fist above the belly button, other hand on top, and pull sharply in and up up to 5 times (Heimlich maneuver).',
            'Se não sair: fique atrás, com o punho acima do umbigo e a outra mão por cima, e puxe forte para dentro e para cima até 5 vezes (manobra de Heimlich).',
          ),
          s(
            'Embarazadas o personas muy obesas: las compresiones van en el centro del pecho.',
            'Pregnant or very obese people: do the thrusts on the center of the chest.',
            'Grávidas ou pessoas muito obesas: as compressões vão no centro do peito.',
          ),
          s('Alterná 5 y 5 hasta que salga.', 'Alternate 5 and 5 until it comes out.', 'Alterne 5 e 5 até sair.'),
          s(
            'Después de las compresiones abdominales tiene que verla un médico.',
            'After abdominal thrusts a doctor must check them.',
            'Depois das compressões abdominais, um médico precisa examinar a pessoa.',
          ),
        ],
        calls: ['same', 'emergency'],
        options: [{ label: l('Dejó de responder', 'Stopped responding', 'Parou de responder'), next: 'topic:cpr' }],
      },
      baby: {
        title: l('Bebé que se ahoga', 'Choking baby', 'Bebê engasgado'),
        steps: [
          s(
            'Ponelo boca abajo sobre tu antebrazo, la cabeza más baja que el cuerpo, sosteniéndole la mandíbula.',
            'Lay the baby face down along your forearm, head lower than the body, supporting the jaw.',
            'Coloque o bebê de bruços sobre o seu antebraço, com a cabeça mais baixa que o corpo, apoiando a mandíbula.',
          ),
          s(
            'Dale 5 golpes en la espalda entre los omóplatos con el talón de la mano.',
            'Give 5 back blows between the shoulder blades with the heel of your hand.',
            'Dê 5 pancadas nas costas entre as omoplatas com a base da mão.',
          ),
          s(
            'Si no sale, dalo vuelta y hacé 5 compresiones en el centro del pecho con dos dedos.',
            'If it does not come out, turn the baby over and give 5 chest thrusts on the center of the chest with two fingers.',
            'Se não sair, vire o bebê e faça 5 compressões no centro do peito com dois dedos.',
          ),
          s(
            'Alterná 5 y 5. Si deja de responder, empezá la RCP.',
            'Alternate 5 and 5. If the baby stops responding, start CPR.',
            'Alterne 5 e 5. Se ele parar de responder, comece a RCP.',
          ),
          no(
            'No hagas compresiones abdominales en bebés ni metas el dedo a ciegas en la boca.',
            'Do not do abdominal thrusts on babies or sweep blindly in the mouth.',
            'Não faça compressões abdominais em bebês nem enfie o dedo às cegas na boca.',
          ),
        ],
        calls: ['same', 'emergency'],
        options: [{ label: l('Dejó de responder', 'Stopped responding', 'Parou de responder'), next: 'topic:cpr' }],
      },
    },
  },

  {
    id: 'snakebite',
    title: l('Mordedura de serpiente', 'Snakebite', 'Picada de cobra'),
    keywords: l(
      'víbora yarará cascabel coral ofidio veneno',
      'snake viper rattlesnake coral venom',
      'cobra serpente jararaca cascavel coral peçonhenta veneno picada',
    ),
    start: 'start',
    nodes: {
      // Pantalla 1 de 3: qué hacer ya. Las pantallas 2 y 3 llevan la inmovilización y el traslado; los «No hacer» van completos en la 2.
      start: {
        title: l('Mordedura de serpiente: qué hacer ya', 'Snakebite: what to do now', 'Picada de cobra: o que fazer agora'),
        steps: [
          s(
            'Alejate de la serpiente; no intentes atraparla ni matarla. Si se puede sin riesgo, sacale una foto de lejos.',
            'Move away from the snake; do not try to catch or kill it. If it is safe, take a photo from a distance.',
            'Afaste-se da cobra; não tente pegá-la nem matá-la. Se der sem risco, tire uma foto de longe.',
          ),
          s(
            'Toda mordedura se trata como venenosa. En Argentina las peligrosas son la yarará, la cascabel y la coral.',
            'Treat every bite as venomous. In Argentina the dangerous ones are the pit vipers (yarará), rattlesnake and coral snake.',
            'Toda picada é tratada como peçonhenta. Na Argentina, as perigosas são as jararacas (yarará), a cascavel e a coral.',
          ),
          s(
            'Calmala y que no se mueva: el movimiento esparce el veneno.',
            'Keep them calm and still: movement spreads the venom.',
            'Acalme a pessoa e peça que não se mexa: o movimento espalha o veneno.',
          ),
          s(
            'Sacale anillos, relojes y pulseras antes de que se hinche.',
            'Remove rings, watches and bracelets before it swells.',
            'Tire anéis, relógios e pulseiras antes que inche.',
          ),
          s(
            'Llamá al {poison}: te dicen a qué hospital ir, el que tiene el antiveneno (suero).',
            'Call {poison}: they will tell you which hospital to go to, the one with antivenom.',
            'Ligue para {poison}: eles dizem a qual hospital ir, o que tem o soro antiofídico.',
          ),
          no('No hagas torniquete.', 'Do not use a tourniquet.', 'Não faça torniquete.'),
        ],
        calls: ['poison', 'same', 'emergency'],
        options: [
          { label: l('Seguir: inmovilizar', 'Continue: immobilize', 'Continuar: imobilizar'), next: 'splint' },
          { label: l('Le cuesta respirar o deja de responder', 'Trouble breathing or stops responding', 'Dificuldade para respirar ou parou de responder'), next: 'topic:assess' },
        ],
      },
      splint: {
        title: l('Mordedura de serpiente: inmovilizar', 'Snakebite: immobilize', 'Picada de cobra: imobilizar'),
        steps: [
          s(
            'Inmovilizá el miembro con una férula (como una fractura), a la altura del corazón.',
            'Immobilize the limb with a splint (like a fracture), at heart level.',
            'Imobilize o membro com uma tala (como numa fratura), na altura do coração.',
          ),
          s(
            'Marcá con birome el borde de la hinchazón y anotá la hora; repetilo cada 30 minutos.',
            'Mark the edge of the swelling with a pen and write the time; repeat every 30 minutes.',
            'Marque com caneta a borda do inchaço e anote o horário; repita a cada 30 minutos.',
          ),
          no('No hagas torniquete.', 'Do not use a tourniquet.', 'Não faça torniquete.'),
          no('No cortes la herida.', 'Do not cut the wound.', 'Não corte o ferimento.'),
          no('No chupes el veneno.', 'Do not suck out the venom.', 'Não chupe o veneno.'),
          no('No pongas hielo ni calor.', 'Do not apply ice or heat.', 'Não coloque gelo nem calor.'),
          no('No des alcohol ni remedios caseros.', 'Do not give alcohol or home remedies.', 'Não dê álcool nem remédios caseiros.'),
        ],
        calls: ['poison', 'same', 'emergency'],
        options: [
          { label: l('Seguir: llevarla al hospital', 'Continue: get them to hospital', 'Continuar: levar ao hospital'), next: 'hospital' },
          { label: l('Le cuesta respirar o deja de responder', 'Trouble breathing or stops responding', 'Dificuldade para respirar ou parou de responder'), next: 'topic:assess' },
        ],
      },
      hospital: {
        title: l('Mordedura de serpiente: al hospital', 'Snakebite: to the hospital', 'Picada de cobra: ao hospital'),
        steps: [
          sc(
            'Llevala ya a ese hospital (o llamá al {same}).',
            'Take them to that hospital now (or call {same}).',
            'Leve a pessoa já a esse hospital (ou ligue para o {same}).',
          ),
          s('El antiveneno es el único tratamiento.', 'Antivenom is the only treatment.', 'O soro antiofídico é o único tratamento.'),
          sw(
            'Lo ideal es que la saquen otros (camilla, vehículo).',
            'Ideally others carry them out (stretcher, vehicle).',
            'O ideal é que outras pessoas a tirem do local (maca, veículo).',
          ),
          sw(
            'Si está sola y tiene que caminar, que lo haga despacio, descansando.',
            'If they are alone and must walk, walk slowly and rest.',
            'Se estiver sozinha e tiver que andar, que ande devagar, descansando.',
          ),
          sw('Pedí rescate y avisá que es una mordedura de serpiente.', 'Ask for rescue and say it is a snakebite.', 'Peça resgate e avise que é uma picada de cobra.'),
        ],
        calls: ['poison', 'same', 'emergency'],
        options: [{ label: l('Le cuesta respirar o deja de responder', 'Trouble breathing or stops responding', 'Dificuldade para respirar ou parou de responder'), next: 'topic:assess' }],
      },
    },
  },

  {
    id: 'stings',
    title: l('Picaduras: alacrán, araña, abeja', 'Stings: scorpion, spider, bee', 'Picadas: escorpião, aranha, abelha'),
    keywords: l(
      'alacrán escorpión araña viuda negra rincón abeja avispa picadura',
      'scorpion spider black widow recluse bee wasp sting',
      'escorpião aranha viúva-negra marrom abelha vespa picada',
    ),
    start: 'start',
    nodes: {
      start: {
        title: l('¿Qué la picó?', 'What stung them?', 'O que picou a pessoa?'),
        steps: [
          s(
            'Si aparece hinchazón de labios o lengua, falta de aire o mareo, es una alergia grave.',
            'If lips or tongue swell, they get short of breath or dizzy, it is a severe allergy.',
            'Se aparecer inchaço nos lábios ou na língua, falta de ar ou tontura, é uma alergia grave.',
          ),
        ],
        question: l('¿Qué fue?', 'What was it?', 'O que foi?'),
        options: [
          { label: l('Le cuesta respirar o se hincha la cara', 'Trouble breathing or face swelling', 'Dificuldade para respirar ou o rosto está inchando'), next: 'topic:anaphylaxis' },
          { label: l('Alacrán', 'Scorpion', 'Escorpião'), next: 'scorpion' },
          { label: l('Araña', 'Spider', 'Aranha'), next: 'spider' },
          { label: l('Abeja o avispa', 'Bee or wasp', 'Abelha ou vespa'), next: 'bee' },
        ],
      },
      scorpion: {
        title: l('Picadura de alacrán', 'Scorpion sting', 'Picada de escorpião'),
        steps: [
          s(
            'Lavá con agua y jabón y poné frío (hielo envuelto en un trapo).',
            'Wash with soap and water and apply cold (ice wrapped in a cloth).',
            'Lave com água e sabão e aplique frio (gelo envolto em um pano).',
          ),
          s(
            'Es grave en chicos menores de 14 años y en mayores: llevalos ya a un hospital. Puede necesitar antiveneno.',
            'It is serious in children under 14 and in the elderly: take them to a hospital now. They may need antivenom.',
            'É grave em crianças menores de 14 anos e em idosos: leve-os já a um hospital. Podem precisar de soro.',
          ),
          s(
            'Signos de alarma: vómitos, sudor, babeo, temblores, agitación, dolor de panza.',
            'Warning signs: vomiting, sweating, drooling, tremors, agitation, belly pain.',
            'Sinais de alarme: vômitos, suor, baba, tremores, agitação, dor de barriga.',
          ),
          s(
            'Llamá al {poison} para saber dónde hay antiveneno.',
            'Call {poison} to find out where there is antivenom.',
            'Ligue para {poison} para saber onde há soro.',
          ),
          sw(
            'En un chico es una evacuación urgente: no esperes a ver si aparecen síntomas.',
            'In a child it is an urgent evacuation: do not wait to see if symptoms appear.',
            'Em uma criança é uma evacuação urgente: não espere para ver se aparecem sintomas.',
          ),
          no('No cortes ni chupes la picadura.', 'Do not cut or suck the sting.', 'Não corte nem chupe a picada.'),
        ],
        calls: ['poison', 'poisonKids', 'same'],
      },
      spider: {
        title: l('Picadura de araña', 'Spider bite', 'Picada de aranha'),
        steps: [
          s(
            'Lavá y poné frío. Si se puede, guardá la araña (en un frasco) o sacale una foto.',
            'Wash and apply cold. If possible, keep the spider (in a jar) or photograph it.',
            'Lave e aplique frio. Se possível, guarde a aranha (em um pote) ou tire uma foto.',
          ),
          s(
            'Viuda negra: dolor que se extiende, calambres, panza dura, sudor. Araña del rincón: herida dolorosa que se pone violeta en horas. Las dos necesitan hospital.',
            'Black widow: spreading pain, cramps, rigid belly, sweating. Recluse spider: painful wound turning purple within hours. Both need a hospital.',
            'Viúva-negra: dor que se espalha, cãibras, barriga dura, suor. Aranha-marrom: ferida dolorosa que fica arroxeada em horas. As duas precisam de hospital.',
          ),
          s('Llamá al {poison}.', 'Call {poison}.', 'Ligue para {poison}.'),
          no('No cortes, no chupes, no pongas calor.', 'Do not cut, suck or apply heat.', 'Não corte, não chupe, não coloque calor.'),
        ],
        calls: ['poison', 'same'],
      },
      bee: {
        title: l('Abeja o avispa', 'Bee or wasp', 'Abelha ou vespa'),
        steps: [
          s(
            'Si quedó el aguijón, sacalo raspando con una tarjeta o la uña, sin apretarlo.',
            'If the stinger is left in, scrape it out with a card or fingernail, without squeezing.',
            'Se o ferrão ficou, retire raspando com um cartão ou a unha, sem apertar.',
          ),
          s('Lavá y poné frío 10 a 20 minutos.', 'Wash and apply cold for 10 to 20 minutes.', 'Lave e aplique frio por 10 a 20 minutos.'),
          s(
            'Controlala 30 minutos: si se le hincha la cara o le falta el aire, es anafilaxia.',
            'Watch them for 30 minutes: if the face swells or they get short of breath, it is anaphylaxis.',
            'Observe a pessoa por 30 minutos: se o rosto inchar ou faltar ar, é anafilaxia.',
          ),
          s(
            'Muchas picaduras juntas o en la boca o garganta: hospital.',
            'Many stings at once or in the mouth or throat: hospital.',
            'Muitas picadas juntas ou na boca ou garganta: hospital.',
          ),
        ],
        options: [{ label: l('Se le hincha la cara o le falta el aire', 'Face swelling or short of breath', 'O rosto está inchando ou falta ar'), next: 'topic:anaphylaxis' }],
      },
    },
  },

  {
    id: 'anaphylaxis',
    title: l('Reacción alérgica grave (anafilaxia)', 'Severe allergic reaction (anaphylaxis)', 'Reação alérgica grave (anafilaxia)'),
    keywords: l(
      'alergia anafilaxia adrenalina epipen hinchazón',
      'allergy anaphylaxis adrenaline epinephrine epipen swelling',
      'alergia anafilaxia adrenalina epinefrina epipen inchaço',
    ),
    start: 'start',
    nodes: {
      start: {
        title: l('Anafilaxia', 'Anaphylaxis', 'Anafilaxia'),
        steps: [
          s(
            'Señales: hinchazón de labios, lengua o garganta, ronquera, silbido al respirar, falta de aire, ronchas con mareo o desmayo.',
            'Signs: swollen lips, tongue or throat, hoarseness, wheezing, shortness of breath, hives with dizziness or fainting.',
            'Sinais: inchaço nos lábios, na língua ou na garganta, rouquidão, chiado ao respirar, falta de ar, urticária com tontura ou desmaio.',
          ),
          CALL_SPEAKER,
          s(
            'Si tiene adrenalina autoinyectable (EpiPen), usala ya en la cara externa del muslo, aun sobre la ropa. Anotá la hora.',
            'If they have an adrenaline auto-injector (EpiPen), use it now on the outer thigh, even through clothing. Write down the time.',
            'Se a pessoa tiver adrenalina autoinjetável (EpiPen), use já na parte externa da coxa, mesmo por cima da roupa. Anote o horário.',
          ),
          s(
            'Si no mejora en 5 minutos y tiene otra dosis, ponela.',
            'If there is no improvement in 5 minutes and there is another dose, give it.',
            'Se não melhorar em 5 minutos e houver outra dose, aplique.',
          ),
          s(
            'Si le falta el aire, que se siente; si está mareada o pálida, acostada con las piernas levantadas.',
            'If short of breath, let them sit up; if dizzy or pale, lying down with legs raised.',
            'Se faltar ar, que fique sentada; se estiver tonta ou pálida, deitada com as pernas elevadas.',
          ),
          no(
            'No la hagas parar ni caminar de golpe: puede desmayarse.',
            'Do not make them stand or walk suddenly: they may collapse.',
            'Não faça a pessoa levantar nem andar de repente: ela pode desmaiar.',
          ),
          sw(
            'Aunque mejore con la adrenalina, el efecto dura poco y la reacción puede volver: es una evacuación urgente.',
            'Even if they improve with adrenaline, the effect is short and the reaction can come back: it is an urgent evacuation.',
            'Mesmo que melhore com a adrenalina, o efeito dura pouco e a reação pode voltar: é uma evacuação urgente.',
          ),
          WILD_RESCUE,
        ],
        calls: ['same', 'emergency'],
        options: [{ label: l('Deja de responder o de respirar', 'Stops responding or breathing', 'Parou de responder ou de respirar'), next: 'topic:cpr' }],
      },
    },
  },
];
