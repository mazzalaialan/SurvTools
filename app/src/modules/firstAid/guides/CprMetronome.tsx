import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pause, Play } from 'lucide-react';
import { useWakeLock } from '@/core/power/useWakeLock';
import { Segmented } from '@/ui/Segmented';
import { beep, buzz } from '@/modules/training/cues';

/** Ritmos para las compresiones de la RCP (por minuto): dos canciones conocidas y los extremos del rango recomendado (100 a 120). */
export const CPR_RHYTHMS = { queen: 110, beegees: 103, min: 100, max: 120 } as const;
export type CprRhythm = keyof typeof CPR_RHYTHMS;
/** Cada cuántas compresiones se pueden dar 2 respiraciones (quien sabe darlas). */
export const COMPRESSIONS_PER_CYCLE = 30;

/**
 * Metrónomo de compresiones de la RCP: un pitido por compresión al ritmo de «Another One Bites the Dust» (110) o «Stayin' Alive» (103),
 * o a 100 o 120. Solo marca el compás (no reproduce la canción). Cuenta de 1 a 30 y avisa con otro tono en la 30. Mantiene la pantalla
 * prendida. Si el sonido está bloqueado o apagado, queda la vibración y la cuenta en pantalla.
 */
export function CprMetronome() {
  const { t } = useTranslation();
  const [rhythm, setRhythm] = useState<CprRhythm>('queen');
  const [on, setOn] = useState(false);
  const [count, setCount] = useState(0);
  const [sound, setSound] = useState(true);
  const [vibrate, setVibrate] = useState(false);
  const bpm = CPR_RHYTHMS[rhythm];
  // Lo que lee el ciclo, sin reiniciarlo al tocar los controles.
  const live = useRef({ bpm, sound, vibrate });
  live.current = { bpm, sound, vibrate };
  useWakeLock(on);

  useEffect(() => {
    if (!on) {
      setCount(0);
      return;
    }
    let n = 0;
    let next = performance.now();
    let id: ReturnType<typeof setTimeout>;
    const loop = () => {
      const c = live.current;
      n = (n % COMPRESSIONS_PER_CYCLE) + 1;
      setCount(n);
      const ultima = n === COMPRESSIONS_PER_CYCLE;
      if (c.sound) beep(ultima ? 600 : 1000, ultima ? 160 : 45);
      if (c.vibrate) buzz(ultima ? 200 : 40);
      next += 60_000 / c.bpm;
      id = setTimeout(loop, Math.max(0, next - performance.now()));
    };
    loop();
    return () => clearTimeout(id);
  }, [on]);

  return (
    <div className="cpr-metronome" data-testid="cpr-metronome">
      <h3 className="cpr-metronome-title">{t('guides.cprMetronome.title')}</h3>
      <p className="hint" style={{ margin: 0 }}>
        {t('guides.cprMetronome.intro')}
      </p>
      <Segmented<CprRhythm>
        label={t('guides.cprMetronome.rhythm')}
        value={rhythm}
        options={(Object.keys(CPR_RHYTHMS) as CprRhythm[]).map((r) => ({ value: r, label: t(`guides.cprMetronome.${r}`) }))}
        onChange={setRhythm}
      />
      <p className="live-big" style={{ margin: 0 }} data-testid="cpr-bpm">
        {bpm} <span className="live-unit">{t('guides.cprMetronome.unit')}</span>
      </p>
      {on && (
        <p className="cpr-count" aria-live="off" data-testid="cpr-count">
          {t('guides.cprMetronome.count', { n: count })}
        </p>
      )}
      {on && count === COMPRESSIONS_PER_CYCLE && <p className="hint">{t('guides.cprMetronome.breaths')}</p>}
      <button className="btn primary" type="button" onClick={() => setOn((v) => !v)} data-testid="cpr-toggle">
        {on ? <Pause size={20} aria-hidden /> : <Play size={20} aria-hidden />} {on ? t('guides.cprMetronome.stop') : t('guides.cprMetronome.start')}
      </button>
      <div className="cpr-options">
        <label>
          <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} /> {t('guides.cprMetronome.sound')}
        </label>
        <label>
          <input type="checkbox" checked={vibrate} onChange={(e) => setVibrate(e.target.checked)} /> {t('guides.cprMetronome.vibrate')}
        </label>
      </div>
    </div>
  );
}
