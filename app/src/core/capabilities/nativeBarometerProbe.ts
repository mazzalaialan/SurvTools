import { nativeBarometer } from '@/core/sensors/nativeBarometer';

/** ¿El teléfono tiene barómetro? Solo la app nativa lo pregunta (carga el plugin recién ahí). */
export const barometerAvailable = (): Promise<boolean> => nativeBarometer.available();
