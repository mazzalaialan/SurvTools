import { describe, expect, it } from 'vitest';
import { resolveNext, TOPIC_BY_ID, TOPICS } from './content';
import { COUNTRIES } from '@/core/settings/settings';
import { fillGuideText, type L } from './types';

const texts = (l: L) => [l.es, l.en, l.pt ?? ''];

describe('guía de primeros auxilios', () => {
  it('cada opción lleva a un paso que existe', () => {
    for (const topic of TOPICS) {
      expect(topic.nodes[topic.start], `${topic.id}: inicio`).toBeDefined();
      for (const [id, node] of Object.entries(topic.nodes)) {
        for (const o of node.options ?? []) {
          const { topic: t, node: n } = resolveNext(topic.id, o.next);
          expect(TOPIC_BY_ID.get(t)?.nodes[n], `${topic.id}/${id} → ${o.next}`).toBeDefined();
        }
      }
    }
  });

  it('todos los pasos se pueden alcanzar desde el inicio del tema', () => {
    for (const topic of TOPICS) {
      const seen = new Set([topic.start]);
      const queue = [topic.start];
      while (queue.length) {
        for (const o of topic.nodes[queue.shift()!]!.options ?? []) {
          if (!o.next.startsWith('topic:') && !seen.has(o.next)) {
            seen.add(o.next);
            queue.push(o.next);
          }
        }
      }
      // Los pasos a los que se entra desde otro tema (topic:x#paso) también cuentan.
      for (const other of TOPICS)
        for (const node of Object.values(other.nodes))
          for (const o of node.options ?? []) {
            const r = resolveNext(other.id, o.next);
            if (r.topic === topic.id) seen.add(r.node);
          }
      expect(Object.keys(topic.nodes).filter((n) => !seen.has(n)), topic.id).toEqual([]);
    }
  });

  it('todo está escrito en español, inglés y portugués', () => {
    for (const topic of TOPICS) {
      const all = [topic.title, topic.keywords, ...Object.values(topic.nodes).flatMap((n) => [n.title, ...(n.question ? [n.question] : []), ...n.steps.map((s) => s.text), ...(n.options ?? []).map((o) => o.label)])];
      for (const l of all) for (const text of texts(l)) expect(text.trim(), topic.id).not.toBe('');
    }
  });

  it('en cada país el texto queda completo, con sus números', () => {
    for (const country of COUNTRIES) {
      for (const topic of TOPICS) {
        for (const node of Object.values(topic.nodes)) {
          for (const step of node.steps) {
            for (const lang of ['es', 'en', 'pt'] as const) {
              const text = fillGuideText(step.text[lang], country, lang);
              expect(text, `${country} ${topic.id}: ${text}`).not.toMatch(/[{}]/);
            }
          }
        }
      }
    }
    expect(fillGuideText('Llamá al {medical}.', 'AR', 'es')).toBe('Llamá al 107 o al 911.');
    expect(fillGuideText('Llamá al {medical}.', 'CL', 'es')).toBe('Llamá al 131 o al 133.');
    expect(fillGuideText('Llamá al {medical}.', 'UY', 'es')).toBe('Llamá al 911.');
    expect(fillGuideText('Llamá al {poison}.', 'UY', 'es')).toBe('Llamá al CIAT (centro toxicológico).');
  });

  it('la evaluación inicial lleva a todas las guías (siguiendo los pasos del propio árbol de evaluación)', () => {
    const assess = TOPIC_BY_ID.get('assess')!;
    const seen = new Set([assess.start]);
    const queue = [assess.start];
    const reached = new Set<string>();
    while (queue.length) {
      for (const o of assess.nodes[queue.shift()!]!.options ?? []) {
        const r = resolveNext('assess', o.next);
        if (r.topic !== 'assess') reached.add(r.topic);
        else if (!seen.has(r.node)) {
          seen.add(r.node);
          queue.push(r.node);
        }
      }
    }
    expect(TOPICS.filter((t) => t.id !== 'assess' && !reached.has(t.id)).map((t) => t.id)).toEqual([]);
  });

  it('«¿Qué le pasó?» tiene dos niveles y las 18 situaciones de siempre siguen a mano', () => {
    const assess = TOPIC_BY_ID.get('assess')!;
    const first = assess.nodes.what!.options!;
    // Lo más urgente, a un toque desde el primer nivel.
    const direct = first.map((o) => resolveNext('assess', o.next)).filter((r) => r.topic !== 'assess' || r.node === 'breathing');
    expect(direct.map((r) => `${r.topic}/${r.node}`)).toEqual(expect.arrayContaining(['assess/breathing', 'bleeding/pressure', 'choking/start']));
    // Las 18 situaciones originales siguen apareciendo con el mismo texto de botón.
    const second = first.filter((o) => !o.next.startsWith('topic:') && !['breathing', 'other'].includes(o.next)).flatMap((o) => assess.nodes[o.next]!.options!);
    const labels = [...first, ...second].map((o) => o.label.es);
    for (const label of [
      'Se ahoga con algo (atragantamiento)',
      'Dolor de pecho',
      'Cara torcida, no puede hablar o mover un brazo',
      'Hinchazón de labios o lengua, le cuesta respirar',
      'Caída de altura o golpe fuerte',
      'Posible fractura o esguince',
      'Quemadura',
      'Mordedura de serpiente',
      'Picadura (alacrán, araña, abeja)',
      'Convulsión',
      'Intoxicación o gas',
      'Mucho frío (hipotermia)',
      'Mucho calor (golpe de calor)',
      'Diabético confundido o sudoroso',
      'Casi se ahoga en el agua',
      'Herida grave o accidente con varios daños (método MARCH)',
      'Síntomas por la altura (soroche)',
      'Otra cosa o no sé',
    ])
      expect(labels, label).toContain(label);
  });

  it('en portugués, el centro toxicológico y la ambulancia salen con los números de cada país', () => {
    expect(fillGuideText('Ligue para o {medical}.', 'BR', 'pt')).toBe('Ligue para o 192 ou 190.');
    expect(fillGuideText('Ligue para {poison}.', 'BR', 'pt')).toContain('Disque-Intoxicação');
    expect(fillGuideText('Ligue para {poison}.', 'UY', 'pt')).toBe('Ligue para o CIAT (centro toxicológico).');
  });

  it('el ritmo de RCP se da con dos canciones (Queen y Bee Gees) en los tres idiomas, y también en números', () => {
    const cpr = JSON.stringify(TOPIC_BY_ID.get('cpr'));
    expect(cpr).not.toMatch(/Bamba/);
    expect(cpr.match(/Another One Bites the Dust/g)).toHaveLength(3);
    expect(cpr.match(/Stayin\\' Alive|Stayin' Alive/g)).toHaveLength(3);
    expect(TOPIC_BY_ID.get('cpr')!.nodes.start!.steps.map((s) => s.text.es).join(' ')).toContain('100 a 120 por minuto');
  });

  it('el metrónomo de compresiones está en los tres pasos de la RCP (así sigue sonando al pasar del desfibrilador a seguir)', () => {
    const nodes = TOPIC_BY_ID.get('cpr')!.nodes;
    for (const k of ['start', 'aed', 'continue']) expect(nodes[k]!.tool).toBe('cprMetronome');
  });

  it('el portugués no repite el español por descuido (salvo siglas, números y nombres)', () => {
    const same: string[] = [];
    for (const topic of TOPICS)
      for (const node of Object.values(topic.nodes))
        for (const x of [node.title, ...node.steps.map((s) => s.text), ...(node.options ?? []).map((o) => o.label)])
          if (x.pt === x.es && /[a-záéíóú]{4,}/i.test(x.es) && !/^(Hipotermia|Anafilaxia|Torniquete|Fracturas|Golpe de calor|Responde|Químico)$/.test(x.es)) same.push(x.es);
    expect(same).toEqual([]);
  });

  it('ninguna pantalla recorre más de 5 pasos numerados, salvo las que siguen pendientes de partir', () => {
    // Lista de pendientes (ver docs/investigaciones/guia-primeros-auxilios-simplificada.md): se achica a medida que se parten.
    const PENDING = new Set(['unconscious/start', 'bleeding/tourniquet', 'fall/conscious', 'fracture/start', 'burns/start', 'anaphylaxis/start', 'chest/start', 'stroke/start', 'hypothermia/start', 'heat/start', 'cpr/start', 'altitude/start', 'choking/adult', 'choking/baby', 'stings/scorpion', 'fall/start', 'seizure/start', 'burns/severity']);
    const long: string[] = [];
    for (const topic of TOPICS)
      for (const [id, node] of Object.entries(topic.nodes))
        for (const env of ['city', 'wild'] as const) {
          const n = node.steps.filter((s) => !s.dont && (!s.env || s.env === env)).length;
          if (n > 5 && !PENDING.has(`${topic.id}/${id}`)) long.push(`${topic.id}/${id} (${env}): ${n}`);
        }
    expect(long).toEqual([]);
  });
});
