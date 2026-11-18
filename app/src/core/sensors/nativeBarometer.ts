import { CapacitorBarometer } from '@capgo/capacitor-barometer';
import { plausiblePressure } from '@/modules/altimeter/barometer';
import { setBarometer, type BarometerBackend } from './barometer';

/** Barómetro de la app nativa con `@capgo/capacitor-barometer` (MPL-2.0). Las lecturas imposibles se descartan. */
export const nativeBarometer: BarometerBackend = {
  async available() {
    try {
      return (await CapacitorBarometer.isAvailable()).isAvailable === true;
    } catch {
      return false;
    }
  },
  async watch(onPressure) {
    const handle = await CapacitorBarometer.addListener('measurement', (m) => {
      if (plausiblePressure(m.pressure)) onPressure(m.pressure, m.timestamp);
    });
    await CapacitorBarometer.startMeasurementUpdates();
    return () => {
      void CapacitorBarometer.stopMeasurementUpdates().catch(() => undefined);
      void handle.remove();
    };
  },
};

/** Se llama una vez al arrancar la app nativa: el altímetro puede usar el barómetro. */
export function startNativeBarometer(): void {
  setBarometer(nativeBarometer);
}
