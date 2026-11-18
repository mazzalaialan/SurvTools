import { describe, expect, it, vi } from 'vitest';
import { installNativeSpeech, NativeSynth, NativeUtterance, type NativeVoice, type Tts } from './nativeSpeech';

const voice = (lang: string, name: string): NativeVoice => ({ default: false, lang, localService: true, name, voiceURI: name });
const fakeTts = (voices: NativeVoice[] = [voice('es-AR', 'Argentina'), voice('en-US', 'US')]) => {
  const calls: Parameters<Tts['speak']>[0][] = [];
  let finish: (() => void)[] = [];
  const tts: Tts = {
    speak: vi.fn((o) => {
      calls.push(o);
      return new Promise<void>((res) => finish.push(res));
    }),
    stop: vi.fn(async () => {
      finish = [];
    }),
    getSupportedVoices: vi.fn(async () => ({ voices })),
  };
  return { tts, calls, done: () => finish.shift()?.() };
};
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('voz en la app nativa', () => {
  it('se instala solo si el WebView no trae speechSynthesis', () => {
    const target: Record<string, unknown> = {};
    expect(installNativeSpeech(target, fakeTts().tts)).toBe(true);
    expect(target.speechSynthesis).toBeInstanceOf(NativeSynth);
    expect(target.SpeechSynthesisUtterance).toBe(NativeUtterance);
    const existing = { speechSynthesis: { x: 1 } };
    expect(installNativeSpeech(existing, fakeTts().tts)).toBe(false);
    expect(existing.speechSynthesis).toEqual({ x: 1 });
  });

  it('las voces llegan de a poco y avisa con «voiceschanged», como el navegador', async () => {
    const { tts } = fakeTts();
    const synth = new NativeSynth(tts);
    let changed = 0;
    synth.addEventListener('voiceschanged', () => changed++);
    expect(synth.getVoices()).toEqual([]);
    await tick();
    expect(synth.getVoices().map((v) => v.lang)).toEqual(['es-AR', 'en-US']);
    expect(changed).toBe(1);
  });

  it('si no hay motor de voz, no falla: queda sin voces', async () => {
    const tts = { ...fakeTts().tts, getSupportedVoices: vi.fn(async () => { throw new Error('sin motor'); }) };
    const synth = new NativeSynth(tts);
    await tick();
    expect(synth.getVoices()).toEqual([]);
  });

  it('habla con la voz elegida (por su posición), el idioma, la velocidad y encolando', async () => {
    const { tts, calls } = fakeTts();
    const synth = new NativeSynth(tts);
    await tick();
    const u = new NativeUtterance('Vamos por el kilómetro 3');
    u.voice = synth.getVoices()[0]!;
    u.lang = u.voice.lang;
    u.rate = 0.95;
    synth.speak(u);
    expect(calls[0]).toMatchObject({ text: 'Vamos por el kilómetro 3', lang: 'es-AR', rate: 0.95, voice: 0, queueStrategy: 1 });
  });

  it('sin voz elegida usa el idioma que se le pidió', async () => {
    const { tts, calls } = fakeTts();
    const synth = new NativeSynth(tts);
    const u = new NativeUtterance('hola');
    u.lang = 'es-AR';
    synth.speak(u);
    expect(calls[0]!.voice).toBeUndefined();
    expect(calls[0]!.lang).toBe('es-AR');
  });

  it('«speaking» y «pending» reflejan lo que se está diciendo y lo que espera; al terminar avisa', async () => {
    const { tts, done } = fakeTts();
    const synth = new NativeSynth(tts);
    const ended: string[] = [];
    const a = new NativeUtterance('uno');
    a.onend = () => ended.push('uno');
    const b = new NativeUtterance('dos');
    b.onend = () => ended.push('dos');
    expect(synth.speaking).toBe(false);
    synth.speak(a);
    synth.speak(b);
    expect(synth.speaking).toBe(true);
    expect(synth.pending).toBe(true);
    done();
    await tick();
    expect(ended).toEqual(['uno']);
    expect(synth.pending).toBe(false);
    done();
    await tick();
    expect(ended).toEqual(['uno', 'dos']);
    expect(synth.speaking).toBe(false);
  });

  it('al avisar «terminó», «speaking» ya está en falso', async () => {
    const { tts, done } = fakeTts();
    const synth = new NativeSynth(tts);
    const seen: boolean[] = [];
    const u = new NativeUtterance('x');
    u.onend = () => seen.push(synth.speaking);
    synth.speak(u);
    done();
    await tick();
    expect(seen).toEqual([false]);
  });

  it('cancelar corta todo y lo que estaba hablando no avisa que terminó', async () => {
    const { tts, done } = fakeTts();
    const synth = new NativeSynth(tts);
    const ended: string[] = [];
    const u = new NativeUtterance('largo');
    u.onend = () => ended.push('terminó');
    synth.speak(u);
    synth.cancel();
    expect(synth.speaking).toBe(false);
    expect(tts.stop).toHaveBeenCalled();
    done();
    await tick();
    expect(ended).toEqual([]);
  });

  it('un error del motor lo avisa en «onerror» sin romper', async () => {
    const tts = { ...fakeTts().tts, speak: vi.fn(async () => { throw new Error('motor caído'); }) };
    const synth = new NativeSynth(tts);
    const errors: string[] = [];
    const u = new NativeUtterance('x');
    u.onerror = (e) => errors.push(e.error);
    synth.speak(u);
    await tick();
    expect(errors).toEqual(['motor caído']);
    expect(synth.speaking).toBe(false);
  });
});
