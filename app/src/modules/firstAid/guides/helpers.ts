import type { LG, Step } from './types';

/** Atajos para escribir el contenido de la guía: cada texto va en español, inglés y portugués de Brasil (en ese orden). */
export const l = (es: string, en: string, pt: string): LG => ({ es, en, pt });
/** Paso para los dos entornos. */
export const s = (es: string, en: string, pt: string): Step => ({ text: l(es, en, pt) });
/** Solo en ciudad (la ayuda llega en minutos). */
export const sc = (es: string, en: string, pt: string): Step => ({ text: l(es, en, pt), env: 'city' });
/** Solo en zona agreste (la ayuda puede tardar horas). */
export const sw = (es: string, en: string, pt: string): Step => ({ text: l(es, en, pt), env: 'wild' });
/** Lo que no hay que hacer. */
export const no = (es: string, en: string, pt: string): Step => ({ text: l(es, en, pt), dont: true });

export const CALL_SPEAKER = s('Llamá al {medical} con el altavoz puesto: te guían.', 'Call {medical} on speaker: they will guide you.', 'Ligue para o {medical} com o viva-voz ligado: eles vão orientar você.');
/** Pedido de rescate corto y único (zona agreste). El detalle (sin señal, varios, qué decir) está en la guía «Pedir rescate». */
export const WILD_RESCUE = sw(
  'Pedí rescate al {emergency} y pasá tu ubicación. Sin señal: subí a un punto alto o mandá un SMS.',
  'Ask for rescue on {emergency} and give your location. No signal: go to higher ground or send an SMS.',
  'Peça resgate pelo {emergency} e informe sua localização. Sem sinal: suba a um ponto alto ou mande um SMS.',
);
export const KEEP_WARM = s(
  'Abrigala y aislala del suelo (campera, manta, mochila debajo): pierde calor rápido aunque no haga frío.',
  'Keep them warm and insulated from the ground (jacket, blanket, backpack underneath): they lose heat fast even when it is not cold.',
  'Agasalhe a pessoa e isole do chão (casaco, cobertor, mochila embaixo): ela perde calor rápido mesmo sem frio.',
);
export const WATCH = s(
  'Controlá cada pocos minutos si responde y si respira. Anotá la hora y los cambios.',
  'Check every few minutes whether they respond and breathe. Write down times and changes.',
  'Verifique a cada poucos minutos se ela responde e respira. Anote o horário e as mudanças.',
);
