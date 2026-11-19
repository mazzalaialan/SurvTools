import { useEffect, useState } from 'react';

/**
 * Lectura en voz alta con la síntesis de voz del sistema (Web Speech API).
 * En Android usa las voces de Google instaladas en el celular, que funcionan
 * sin conexión. No hay forma de elegir altavoz o auricular desde la web: sale
 * por donde el sistema manda el audio multimedia.
 */

const synth = (): SpeechSynthesis | null => (typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null);

/** La mejor voz para el idioma: primero las que andan sin conexión, en español las de Argentina y en portugués las de Brasil. */
export function pickVoice(voices: SpeechSynthesisVoice[], lang: 'es' | 'en' | 'pt'): SpeechSynthesisVoice | null {
  const own = voices.filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith(lang));
  if (own.length === 0) return null;
  const preferred = lang === 'es' ? ['es-ar', 'es-419', 'es-us', 'es-mx', 'es-es'] : lang === 'pt' ? ['pt-br', 'pt-pt'] : ['en-us', 'en-gb'];
  const rank = (v: SpeechSynthesisVoice) => {
    const i = preferred.indexOf(v.lang.toLowerCase().replace('_', '-'));
    return (v.localService ? 0 : 100) + (i === -1 ? preferred.length : i);
  };
  return [...own].sort((a, b) => rank(a) - rank(b))[0]!;
}

/** ¿Hay voz para este idioma? `null` mientras el sistema todavía carga las voces. */
export function useSpeechVoice(lang: 'es' | 'en' | 'pt'): SpeechSynthesisVoice | null | undefined {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[] | null>(() => {
    const list = synth()?.getVoices() ?? [];
    return list.length ? list : null;
  });
  useEffect(() => {
    const s = synth();
    if (!s) return;
    const load = () => {
      const list = s.getVoices();
      if (list.length) setVoices(list);
    };
    s.addEventListener('voiceschanged', load);
    load();
    // Algunos navegadores nunca avisan si no tienen voces: pasado un rato, se da por vacío.
    const timer = setTimeout(() => setVoices((v) => v ?? []), 3000);
    return () => {
      s.removeEventListener('voiceschanged', load);
      clearTimeout(timer);
    };
  }, []);
  if (!synth()) return null;
  if (voices === null) return undefined;
  return pickVoice(voices, lang);
}

/**
 * Texto listo para la voz: sin «:». Algunos sintetizadores dicen «dos puntos» (o leen «10:40» como una hora). Una hora o un ritmo
 * entre números queda con un espacio («10 40»; mejor decirlo con palabras, ver `spokenDuration`) y cualquier otro «:» pasa a coma
 * (pausa corta).
 */
export function forSpeech(text: string): string {
  return text
    .replace(/(\d):(?=\d)/g, '$1 ')
    // Un «:» al final (anuncia lo que sigue en otra frase) pasa a punto; en el medio, a coma.
    .replace(/\s*:\s*$/, '.')
    .replace(/\s*:\s*/g, ', ')
    .replace(/,\s*,/g, ',')
    .trim();
}

/** Lee las frases en orden, con una pausa natural entre cada una. Corta lo que se estuviera leyendo. */
export function speak(lines: string[], voice: SpeechSynthesisVoice, rate = 0.95): void {
  const s = synth();
  if (!s) return;
  s.cancel();
  // Chrome en Android a veces descarta lo que se encola justo después de cancelar.
  setTimeout(() => {
    for (const text of lines) {
      if (!text.trim()) continue;
      const u = new SpeechSynthesisUtterance(forSpeech(text));
      u.voice = voice;
      u.lang = voice.lang;
      u.rate = rate;
      s.speak(u);
    }
  }, 60);
}

export function stopSpeaking(): void {
  synth()?.cancel();
}
