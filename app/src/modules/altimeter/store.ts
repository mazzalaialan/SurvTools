import { create } from 'zustand';
import { addClimb, EMPTY_CLIMB, pushSample, type Alarm, type AltSample, type ClimbState } from './altimeter';

/** Corrección que se suma a la altura del GPS. */
export interface Calibration {
  offset: number;
  kind: 'map' | 'manual' | 'baro';
  at: number;
}

/**
 * Estado del altímetro en la sesión: sobrevive a ir y volver de la pantalla
 * (el GPS se apaga al salir), pero no se guarda en la bóveda.
 */
interface AltimeterState {
  samples: AltSample[];
  climb: ClimbState;
  calibration: Calibration | null;
  alarm: Alarm | null;
  /** La alarma sonó y todavía no se cerró el aviso. */
  ringing: boolean;
  add: (s: AltSample) => void;
  calibrate: (c: Calibration | null) => void;
  setAlarm: (a: Alarm | null) => void;
  ring: () => void;
  reset: () => void;
}

export const useAltimeter = create<AltimeterState>((set, get) => ({
  samples: [],
  climb: EMPTY_CLIMB,
  calibration: null,
  alarm: null,
  ringing: false,
  add(s) {
    const { samples, climb } = get();
    set({ samples: pushSample(samples, s), climb: addClimb(climb, s.alt) });
  },
  calibrate(calibration) {
    // Cambia la escala de todas las alturas: el recorrido se empieza de nuevo
    // (y una alarma de subida, que cuenta desde ese recorrido, se cancela).
    const alarm = get().alarm;
    set({ calibration, samples: [], climb: EMPTY_CLIMB, alarm: alarm?.kind === 'climb' ? null : alarm });
  },
  setAlarm(alarm) {
    set({ alarm, ringing: false });
  },
  ring() {
    set({ alarm: null, ringing: true });
  },
  reset() {
    set({ samples: [], climb: EMPTY_CLIMB, ringing: false, alarm: null });
  },
}));
