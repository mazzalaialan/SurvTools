import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useEffect, useRef, type MouseEvent } from 'react';
import { Ban, Check, ChevronRight, LocateFixed, Repeat, RotateCcw, Undo2, Volume2, VolumeX, X } from 'lucide-react';
import { speak, stopSpeaking, useSpeechVoice } from '@/core/speech/speech';
import { useSettings } from '@/core/settings/settings';
import { useCountry } from '@/modules/emergency/currentCountry';
import { PhoneActions } from '@/modules/emergency/parts';
import { resolveNext, TOPIC_BY_ID } from './content';
import { EnvSwitch, TOPIC_ICON, useLang } from './parts';
import { CALLS, fillGuideText } from './types';
import { Notice } from '@/ui/Notice';

/** Un tema de la guía, paso a paso: cada respuesta lleva al paso siguiente (y "volver" deshace). */
export function GuideTopicPage() {
  const { topicId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const lang = useLang();
  const env = useSettings((s) => s.settings.firstAidEnv);
  const country = useCountry();
  const voiceOn = useSettings((s) => s.settings.guideVoice);
  const update = useSettings((s) => s.update);
  const voice = useSpeechVoice(lang);
  const topic = topicId ? TOPIC_BY_ID.get(topicId) : undefined;
  const nodeId = params.get('paso') ?? topic?.start ?? '';
  const node = topic?.nodes[nodeId];

  // Lo que se lee del paso actual: título, instrucciones, pregunta y opciones.
  const spoken = useRef<string[]>([]);
  const fillText = (text: string) => fillGuideText(text, country, lang);
  spoken.current = node
    ? [
        fillText(node.title[lang]),
        ...node.steps.filter((s) => !s.env || s.env === env).map((s) => fillText(s.text[lang])),
        node.question ? fillText(node.question[lang]) : '',
        node.options && node.options.length > 1
          ? t('guides.optionsSpoken', {
              options: node.options.map((o) => fillText(o.label[lang])).join(', '),
            })
          : '',
      ]
    : [];

  // Al llegar a un paso, se lee (si está activado y la app está a la vista).
  useEffect(() => {
    if (!voiceOn || !voice || document.visibilityState !== 'visible') return;
    speak(spoken.current, voice);
    return stopSpeaking;
  }, [voiceOn, voice, topicId, nodeId, env, lang]);

  // Si la app pasa a segundo plano (se abrió el marcador, otra app) se corta, y al volver no sigue sola.
  useEffect(() => {
    const hide = () => document.visibilityState === 'hidden' && stopSpeaking();
    document.addEventListener('visibilitychange', hide);
    return () => {
      document.removeEventListener('visibilitychange', hide);
      stopSpeaking();
    };
  }, []);

  /** Al tocar un botón de llamar se calla enseguida: no puede sonar encima de la llamada. */
  const stopOnCall = (e: MouseEvent) => {
    if ((e.target as Element).closest('a[href^="tel:"]')) stopSpeaking();
  };

  if (!topic || !node) {
    return (
      <p className="empty">
        {t('guides.notFound')} <Link to="/first-aid/guides">{t('common.back')}</Link>
      </p>
    );
  }

  // El recorrido de pasos de esta evaluación (en el estado de la navegación): permite «Volver al paso anterior» si se eligió mal, aunque se haya
  // pasado a otra guía, sin depender del botón «atrás» del teléfono. Al llegar de otro lado (la lista, un enlace) no hay recorrido y no se ofrece.
  const stateTrail = (location.state as { trail?: unknown } | null)?.trail;
  const trail = Array.isArray(stateTrail) ? stateTrail.filter((x): x is string => typeof x === 'string') : [];
  const here = `${location.pathname}${location.search}`;
  const go = (next: string) => {
    const target = resolveNext(topic.id, next);
    const startOfTopic = TOPIC_BY_ID.get(target.topic)?.start;
    navigate(`/first-aid/guides/${target.topic}${target.node === startOfTopic ? '' : `?paso=${target.node}`}`, {
      state: { trail: [...trail, here].slice(-40) },
    });
  };
  const goBack = () => {
    const previous = trail.at(-1);
    if (previous) navigate(previous, { state: { trail: trail.slice(0, -1) } });
  };
  const steps = node.steps.filter((s) => !s.env || s.env === env);
  const fill = fillText;
  // Los números del país, sin repetir (en Uruguay casi todo es el 911).
  const calls = (node.calls ?? [])
    .map((k) => ({ key: k, number: CALLS[country][k] }))
    .filter((c, i, all): c is { key: typeof c.key; number: string } => !!c.number && all.findIndex((x) => x.number === c.number) === i);

  return (
    <div className="stack guide" onClickCapture={stopOnCall}>
      <div className="page-head">
        <h1 className="page-title guide-topic">{topic.title[lang]}</h1>
        {voice && voiceOn && (
          <button
            className="icon-btn"
            type="button"
            onClick={() => speak(spoken.current, voice)}
            aria-label={t('guides.voiceRepeat')}
            title={t('guides.voiceRepeat')}
          >
            <Repeat size={20} />
          </button>
        )}
        {voice && (
          <button
            className="icon-btn"
            type="button"
            aria-pressed={voiceOn}
            onClick={() => {
              if (voiceOn) stopSpeaking();
              void update({ guideVoice: !voiceOn });
            }}
            aria-label={t('guides.voice')}
            title={t('guides.voice')}
          >
            {voiceOn ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>
        )}
      </div>

      <EnvSwitch compact />

      <section className="card guide-node" aria-labelledby="guide-node-title" data-testid="guide-node">
        {/* Dónde está: «Paso N» según lo recorrido (solo cuenta si se llegó contestando; desde la lista es el 1). */}
        <p className="guide-eyebrow">{t('guides.step', { n: trail.length + 1 })}</p>
        <h2 id="guide-node-title" className="guide-node-title">
          {fill(node.title[lang])}
        </h2>

        {/* Lo vital arriba: a quién llamar, antes de leer los pasos. El primero (el que más urge) va sólido. */}
        {calls.length > 0 && (
          <div className="guide-calls" data-testid="guide-calls">
            {calls.map((c) => (
              <span key={c.key} className="guide-call">
                <span className="guide-call-label">{t(`guides.call.${c.key}`)}</span>
                <PhoneActions phone={c.number} />
              </span>
            ))}
            {env === 'wild' && (
              <Link className="btn guide-location" to="/first-aid/location">
                <LocateFixed size={20} aria-hidden /> {t('guides.myLocation')}
              </Link>
            )}
          </div>
        )}

        {steps.length > 0 && (
          <ol className="guide-steps">
            {steps.map((s, i) => (
              <li key={i} className={s.dont ? 'guide-dont' : undefined} data-env={s.env}>
                {s.dont && (
                  <span className="guide-dont-tag">
                    <Ban size={20} aria-hidden /> {t('guides.dont')}
                  </span>
                )}
                <span>{fill(s.text[lang])}</span>
              </li>
            ))}
          </ol>
        )}

        {node.question && <p className="guide-question">{fill(node.question[lang])}</p>}
        {node.options && (
          <div className={`guide-options${node.options.length > 6 ? ' many' : ''}`} data-testid="guide-options">
            {node.options.map((o) => {
              // Solo las respuestas marcadas `answer` en el contenido llevan tilde (sí) o cruz (no); las demás, el ícono de su tema (o ninguno). Siempre decorativo: el texto manda.
              const Icon = o.answer === 'yes' ? Check : o.answer === 'no' ? X : TOPIC_ICON[o.next.replace(/^topic:/, '').split('#')[0]!];
              return (
                <button
                  key={o.next + o.label.es}
                  className={`btn guide-option${o.answer ? ` answer-${o.answer}` : ''}`}
                  type="button"
                  onClick={() => go(o.next)}
                >
                  {Icon && <Icon className="guide-option-icon" size={o.answer ? 20 : 24} strokeWidth={o.answer ? 3 : 2} aria-hidden />}
                  <span className="guide-option-text">{fill(o.label[lang])}</span>
                  <ChevronRight className="guide-option-go" size={20} aria-hidden />
                </button>
              );
            })}
          </div>
        )}
        {trail.length > 0 && (
          <button className="btn guide-back" type="button" onClick={goBack} data-testid="guide-back">
            <Undo2 size={20} aria-hidden /> {t('guides.back')}
          </button>
        )}
      </section>

      {/* Secundarios y discretos: salir de este recorrido. */}
      <div className="guide-foot">
        <Link className="btn btn-link" to="/first-aid/guides/assess">
          <RotateCcw size={16} aria-hidden /> {t('guides.restart')}
        </Link>
        <Link className="btn btn-link" to="/first-aid/guides">
          {t('guides.all')}
        </Link>
      </div>
      <Notice id="guides.disclaimer">{t('guides.disclaimer', { medical: fill('{medical}') })}</Notice>
    </div>
  );
}
