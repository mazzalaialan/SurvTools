import { TextToSpeech, QueueStrategy } from '@capacitor-community/text-to-speech';

/**
 * Voz en la app nativa. El WebView de Android NO tiene `speechSynthesis` (lo verificamos en el teléfono), y la app lo usa en tres lugares (la
 * lectura de «Mi ubicación», los avisos por kilómetro de la grabación y las marcas del entrenamiento). En vez de reescribirlos, acá se instala una
 * versión compatible de `window.speechSynthesis` y `SpeechSynthesisUtterance` que habla con el motor de voz de Android
 * (`@capacitor-community/text-to-speech`, MIT). Solo lo que usa la app: `speak`, `cancel`, `speaking`, `pending`, `getVoices` y `voiceschanged`.
 */
export interface NativeVoice {
  default: boolean;
  lang: string;
  localService: boolean;
  name: string;
  voiceURI: string;
}

export class NativeUtterance {
  text: string;
  lang = '';
  rate = 1;
  pitch = 1;
  volume = 1;
  voice: NativeVoice | null = null;
  onstart: ((e: unknown) => void) | null = null;
  onend: ((e: unknown) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  constructor(text = '') {
    this.text = text;
  }
}

export interface Tts {
  speak(o: { text: string; lang?: string; rate?: number; pitch?: number; volume?: number; voice?: number; queueStrategy?: QueueStrategy }): Promise<void>;
  stop(): Promise<void>;
  getSupportedVoices(): Promise<{ voices: NativeVoice[] }>;
}

export class NativeSynth extends EventTarget {
  private voices: NativeVoice[] = [];
  private active = 0;
  /** Se sube con cada `cancel()`: lo que estaba hablando cuando se canceló no avisa que terminó. */
  private generation = 0;
  constructor(private readonly tts: Tts = TextToSpeech) {
    super();
    void this.loadVoices();
  }

  private async loadVoices(): Promise<void> {
    try {
      this.voices = (await this.tts.getSupportedVoices()).voices;
      this.dispatchEvent(new Event('voiceschanged'));
    } catch {
      /* sin motor de voz instalado: `getVoices()` queda vacío y la app muestra que no hay voz */
    }
  }

  getVoices(): NativeVoice[] {
    return this.voices;
  }
  get speaking(): boolean {
    return this.active > 0;
  }
  get pending(): boolean {
    return this.active > 1;
  }
  get paused(): boolean {
    return false;
  }

  speak(u: NativeUtterance): void {
    const gen = this.generation;
    this.active++;
    const index = u.voice ? this.voices.findIndex((v) => v.voiceURI === u.voice!.voiceURI && v.lang === u.voice!.lang) : -1;
    u.onstart?.({});
    this.tts
      .speak({
        text: u.text,
        lang: u.voice?.lang ?? (u.lang || undefined),
        rate: u.rate,
        pitch: u.pitch,
        volume: u.volume,
        ...(index >= 0 ? { voice: index } : {}),
        // Se encolan, como en el navegador: lo que se dice enseguida no se pisa.
        queueStrategy: QueueStrategy.Add,
      })
      .then(
        () => {
          // Primero baja el contador y después avisa: quien reacciona a «terminó» ya ve `speaking` en falso.
          if (gen !== this.generation) return;
          this.active = Math.max(0, this.active - 1);
          u.onend?.({});
        },
        (e: unknown) => {
          if (gen !== this.generation) return;
          this.active = Math.max(0, this.active - 1);
          u.onerror?.({ error: e instanceof Error ? e.message : String(e) });
        },
      );
  }

  cancel(): void {
    this.generation++;
    this.active = 0;
    void this.tts.stop().catch(() => undefined);
  }
}

/** Instala la voz del teléfono si el WebView no trae la del navegador. Devuelve `true` si la instaló. */
export function installNativeSpeech(target: Record<string, unknown> = window as unknown as Record<string, unknown>, tts?: Tts): boolean {
  if ('speechSynthesis' in target && target.speechSynthesis) return false;
  target.speechSynthesis = new NativeSynth(tts);
  target.SpeechSynthesisUtterance = NativeUtterance;
  return true;
}
