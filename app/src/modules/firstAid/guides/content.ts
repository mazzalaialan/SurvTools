import type { Topic } from './types';
import { TOPICS_1 } from './topics-1';
import { TOPICS_2 } from './topics-2';
import { TOPICS_3 } from './topics-3';

/**
 * Guía de primeros auxilios, paso a paso y según el entorno (ciudad o zona
 * agreste). Basada en las recomendaciones de primeros auxilios del Consejo
 * Europeo de Resucitación (ERC 2021), la Federación Internacional de la Cruz
 * Roja (IFRC 2020), la AHA y la guía de envenenamiento por ofidios del
 * Ministerio de Salud de la Nación. No reemplaza un curso.
 *
 * Cada texto va en español, inglés y portugués de Brasil (`LG`: los tres son obligatorios).
 * El contenido está repartido en `topics-1/2/3.ts` por tamaño; los atajos están en `helpers.ts`.
 * La traducción al portugués está pendiente de revisión humana (ver docs/TRADUCCION-PT-BR.md).
 */

export const TOPICS: Topic[] = [...TOPICS_1, ...TOPICS_2, ...TOPICS_3];

export const TOPIC_BY_ID = new Map(TOPICS.map((t) => [t.id, t]));

/** A dónde lleva una opción: tema y paso. */
export function resolveNext(currentTopic: string, next: string): { topic: string; node: string } {
  if (!next.startsWith('topic:')) return { topic: currentTopic, node: next };
  const [topic, node] = next.slice(6).split('#') as [string, string | undefined];
  return { topic, node: node ?? TOPIC_BY_ID.get(topic)?.start ?? '' };
}
