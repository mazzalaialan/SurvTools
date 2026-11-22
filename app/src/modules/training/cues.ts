/**
 * Avisos de los intervalos: un pitido, vibración y, si está prendida la voz,
 * el nombre de la etapa. Todo es opcional y falla en silencio (el navegador
 * puede bloquear el sonido hasta que la persona toque la pantalla).
 */
import { forSpeech } from '@/core/speech/speech';

let ctx: AudioContext | null = null;

/** El contexto de audio compartido (se crea la primera vez, tras un toque en pantalla); `null` si el dispositivo no tiene. */
export function audioContext(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function beep(freq = 880, ms = 150): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    gain.gain.value = 0.2;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + ms / 1000);
  } catch {
    /* sin sonido */
  }
}

export function buzz(pattern: number | number[] = 200): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* sin vibración */
  }
}

export function say(text: string, lang: string, opts: { rate?: number; interrupt?: boolean } = {}): void {
  try {
    if (!('speechSynthesis' in window)) return;
    // Para avisos que tienen que caer en un momento justo: se corta lo que siga sonando para que no se acumulen y se atrasen.
    if (opts.interrupt) window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(forSpeech(text));
    u.lang = lang;
    if (opts.rate) u.rate = opts.rate;
    window.speechSynthesis.speak(u);
  } catch {
    /* sin voz */
  }
}
