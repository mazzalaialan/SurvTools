import { CountryPackPicker } from './CountryPackPicker';

/**
 * País de los números de emergencia (y de la guía de primeros auxilios). Queda guardado. Es el mismo selector de Ajustes (mismo orden y
 * diseño) en modo «elegir»: sin descargas ni borrado, solo cambia el país actual de la app.
 */
export function CountrySwitch() {
  return <CountryPackPicker mode="choose" />;
}
