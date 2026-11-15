import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '@/core/settings/settings';
import { elapsedS, useRecorder } from '@/modules/tracks/recorder';
import { say } from './cues';
import { kmAnnouncement } from './kmSpeech';
import { analyzeRecording } from './stats';

export { kmAnnouncement, spokenDuration } from './kmSpeech';

/** Un kilómetro que se pasó hace más que esto (con la pantalla apagada no llegan posiciones) ya no se anuncia: llegaría tarde y confunde. */
export const STALE_KM_S = 120;

/**
 * Aviso por voz al cerrar cada kilómetro, en cualquier pantalla mientras se graba (antes solo andaba dentro de la pantalla «en vivo»).
 * Con el celular bloqueado el navegador no da posiciones ni deja hablar: ahí no hay aviso (eso lo resuelve la app nativa).
 * Se monta una vez, en la barra de la grabación.
 */
export function useKmVoice(): void {
  const { t, i18n } = useTranslation();
  const voice = useSettings((s) => s.settings.trainingVoice);
  const status = useRecorder((s) => s.status);
  // Conduciendo, un aviso por kilómetro sería cada medio minuto: no se habla.
  const driving = useRecorder((s) => !!s.track?.vehicle);
  const trackId = useRecorder((s) => s.track?.id ?? null);
  // Se recalcula solo cuando cambia el kilómetro entero, no con cada punto del GPS.
  const km = useRecorder((s) => Math.floor((s.track?.distanceM ?? 0) / 1000));
  const spoken = useRef<{ id: string | null; km: number }>({ id: null, km: 0 });
  useEffect(() => {
    if (!trackId || status === 'idle') {
      spoken.current = { id: null, km: 0 };
      return;
    }
    // Al empezar a mirar una grabación (o al volver a abrir la app) no se repite lo ya recorrido.
    if (spoken.current.id !== trackId) {
      spoken.current = { id: trackId, km };
      return;
    }
    if (km <= spoken.current.km) {
      spoken.current.km = Math.min(spoken.current.km, km);
      return;
    }
    spoken.current.km = km;
    if (!voice || driving || status !== 'recording' || !('speechSynthesis' in window)) return;
    const s = useRecorder.getState();
    const segments = s.track?.segments ?? [];
    // ¿El último punto es reciente? Si no, el kilómetro se pasó con la pantalla apagada: no se anuncia.
    const lastTime = segments.at(-1)?.at(-1)?.[3];
    if (lastTime !== undefined && Date.now() / 1000 - lastTime > STALE_KM_S) return;
    const stats = analyzeRecording(segments.map((seg) => (seg.length > 1 ? seg : [])));
    const split = stats.splitsS[km - 1] ?? stats.splitsS.at(-1);
    const text = kmAnnouncement(km, elapsedS(s), split, t);
    say(text, i18n.language);
  }, [km, trackId, status, voice]); // eslint-disable-line react-hooks/exhaustive-deps
}
