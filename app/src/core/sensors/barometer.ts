/**
 * El barómetro del dispositivo. Los navegadores no lo exponen: solo la app nativa (Android: el sensor de presión; iPhone: CMAltimeter)
 * tiene uno. En la web `available()` es siempre `false` y el altímetro usa el GPS. Ver `modules/altimeter/barometer.ts` y docs/PENDIENTES.md.
 */
export interface BarometerBackend {
  /** ¿El dispositivo tiene barómetro? */
  available(): Promise<boolean>;
  /** Empieza a entregar la presión (hPa). Devuelve la función que lo detiene. */
  watch(onPressure: (hPa: number, at: number) => void): Promise<() => void>;
}

export const noBarometer: BarometerBackend = {
  available: async () => false,
  watch: async () => () => undefined,
};

let current: BarometerBackend = noBarometer;

/** La implementación vigente (ninguna en la web; el sensor en la app nativa). */
export const barometer = (): BarometerBackend => current;

/** Cambia la implementación (la app nativa al arrancar; las pruebas, una falsa). Devuelve la anterior. */
export function setBarometer(next: BarometerBackend): BarometerBackend {
  const previous = current;
  current = next;
  return previous;
}
