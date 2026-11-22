/**
 * Base rítmica propia para las compresiones de la RCP (bombo, bajo y platillo sintetizados con el audio del dispositivo: sin archivos y sin
 * conexión). Es una base original y genérica a un solo compás de 4 tiempos: NO es la línea de ninguna canción. Cada compresión es un tiempo.
 */

/** Notas del bajo en cada tiempo del compás (Hz): la, la, do, re. */
export const GROOVE_BASS = [55, 55, 65.41, 73.42] as const;

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 0.05);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}
let noise: AudioBuffer | null = null;

/**
 * Programa los sonidos de un tiempo: bombo y bajo en el tiempo y un platillo a la mitad (contratiempo). `when` es la hora del `AudioContext`
 * (segundos); `beatSeconds` la duración del tiempo; `index` la compresión (0, 1, 2…); `accent` marca la última de cada tanda de 30 (bajo una octava abajo).
 */
export function scheduleGrooveBeat(ctx: AudioContext, when: number, beatSeconds: number, index: number, accent: boolean): void {
  try {
    // Bombo: seno que cae de 130 a 45 Hz.
    const kick = ctx.createOscillator();
    const kg = ctx.createGain();
    kick.frequency.setValueAtTime(130, when);
    kick.frequency.exponentialRampToValueAtTime(45, when + 0.12);
    kg.gain.setValueAtTime(0.5, when);
    kg.gain.exponentialRampToValueAtTime(0.001, when + 0.18);
    kick.connect(kg).connect(ctx.destination);
    kick.start(when);
    kick.stop(when + 0.2);

    // Bajo: triángulo con caída corta (una octava más abajo en la compresión 30).
    const bass = ctx.createOscillator();
    const bg = ctx.createGain();
    bass.type = 'triangle';
    bass.frequency.value = GROOVE_BASS[index % GROOVE_BASS.length]! * (accent ? 0.5 : 1);
    bg.gain.setValueAtTime(0.3, when);
    bg.gain.exponentialRampToValueAtTime(0.001, when + Math.min(0.35, beatSeconds * 0.8));
    bass.connect(bg).connect(ctx.destination);
    bass.start(when);
    bass.stop(when + 0.4);

    // Platillo cerrado en el contratiempo: ruido filtrado muy corto.
    noise ??= noiseBuffer(ctx);
    const hat = ctx.createBufferSource();
    const hf = ctx.createBiquadFilter();
    const hg = ctx.createGain();
    hat.buffer = noise;
    hf.type = 'highpass';
    hf.frequency.value = 7000;
    const at = when + beatSeconds / 2;
    hg.gain.setValueAtTime(0.12, at);
    hg.gain.exponentialRampToValueAtTime(0.001, at + 0.05);
    hat.connect(hf).connect(hg).connect(ctx.destination);
    hat.start(at);
  } catch {
    /* sin sonido */
  }
}
