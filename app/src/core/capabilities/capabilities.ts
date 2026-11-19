import { needsSensorPermission } from '@/core/sensors/orientationSource';
import { isNativePlatform } from '@/core/platform';
import { create } from 'zustand';

/**
 * Detección de capacidades del dispositivo (ver ARQUITECTURA §2.1).
 * Se detecta cada capacidad, nunca "es PC" o "es celular".
 */
export type Capability =
  | 'geolocation'
  | 'orientation'
  | 'motion'
  | 'barometer'
  | 'camera'
  | 'barcode'
  | 'notifications'
  | 'periodicSync'
  | 'push'
  | 'webauthn'
  | 'opfs'
  | 'shareFiles'
  | 'serviceWorker';

export const CAPABILITIES: Capability[] = [
  'geolocation',
  'orientation',
  'motion',
  'barometer',
  'camera',
  'barcode',
  'notifications',
  'periodicSync',
  'push',
  'webauthn',
  'opfs',
  'shareFiles',
  'serviceWorker',
];

export type CapabilityMap = Record<Capability, boolean>;

/**
 * Los navegadores de escritorio exponen los eventos de orientación aunque no
 * haya sensor; solo se considera disponible si llega una lectura real.
 */
function probeEvent(event: 'deviceorientationabsolute' | 'devicemotion', timeoutMs = 1500): Promise<boolean> {
  if (!(`on${event}` in window)) return Promise.resolve(false);
  return new Promise((resolve) => {
    const done = (value: boolean) => {
      window.removeEventListener(event, handler);
      clearTimeout(timer);
      resolve(value);
    };
    const handler = (e: Event) => {
      const hasData =
        e instanceof DeviceOrientationEvent ? e.alpha !== null : (e as DeviceMotionEvent).accelerationIncludingGravity?.x != null;
      done(hasData);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    window.addEventListener(event, handler);
  });
}

async function hasCamera(): Promise<boolean> {
  try {
    const devices = await navigator.mediaDevices?.enumerateDevices();
    return devices?.some((d) => d.kind === 'videoinput') ?? false;
  } catch {
    return false;
  }
}

function canShareFiles(): boolean {
  try {
    return navigator.canShare?.({ files: [new File([''], 'x.vikarg')] }) ?? false;
  } catch {
    return false;
  }
}

export async function detectCapabilities(): Promise<CapabilityMap> {
  const native = isNativePlatform();
  const [orientation, motion, camera, barometerOk, nativeBiometric] = await Promise.all([
    // Un celular quieto manda pocos eventos de orientación (Chrome solo avisa cuando cambian) y el primero puede tardar más que el plazo de la
    // prueba al arrancar: con la prueba, la brújula y el inclinómetro quedaban «no disponibles» toda la sesión aunque el sensor anduviera. En la
    // app nativa un teléfono siempre los tiene: alcanza con que el WebView los exponga y no se hace la prueba.
    // iPhone: no existe `deviceorientationabsolute` y los eventos no llegan hasta dar el permiso: alcanza con que exista la forma de pedirlo.
    needsSensorPermission() ? Promise.resolve(true) : native ? Promise.resolve('ondeviceorientationabsolute' in window) : probeEvent('deviceorientationabsolute'),
    native ? Promise.resolve('ondevicemotion' in window) : probeEvent('devicemotion'),
    hasCamera(),
    // Los navegadores no exponen el barómetro: solo la app nativa lo lee (se pregunta directo al sensor, sin depender de que ya esté instalado).
    native ? import('./nativeBarometerProbe').then((m) => m.barometerAvailable()) : Promise.resolve(false),
    native ? import('@/core/security/nativeBiometric').then((m) => m.nativeAvailable()) : Promise.resolve(false),
  ]);
  return {
    geolocation: 'geolocation' in navigator,
    orientation,
    motion,
    barometer: barometerOk,
    camera,
    barcode: 'BarcodeDetector' in window,
    // App nativa: los avisos van por Firebase y los avisos locales del sistema (core/notifications/nativeBackend.ts), no por el navegador.
    notifications: native || 'Notification' in window,
    periodicSync: 'serviceWorker' in navigator && 'periodicSync' in ServiceWorkerRegistration.prototype,
    push: native || ('serviceWorker' in navigator && 'PushManager' in window),
    // App nativa: la huella va por el Keystore de Android (core/security/nativeBiometric.ts), no por WebAuthn.
    webauthn: native ? nativeBiometric : 'PublicKeyCredential' in window,
    opfs: typeof navigator.storage?.getDirectory === 'function',
    // App nativa: se comparte con el menú del sistema (ui/nativeFiles.ts), no con `navigator.share`.
    shareFiles: native || canShareFiles(),
    // «Funcionamiento sin conexión»: en la app nativa los archivos de la app van dentro del paquete (no hace falta service worker).
    serviceWorker: native || 'serviceWorker' in navigator,
  };
}

interface CapabilitiesState {
  caps: CapabilityMap | null;
  detect: () => Promise<void>;
}

export const useCapabilities = create<CapabilitiesState>((set) => ({
  caps: null,
  async detect() {
    set({ caps: await detectCapabilities() });
  },
}));

/**
 * Una capacidad puntual. Mientras dura la detección (las de sensores tardan
 * hasta 1,5 s) responde lo que se sabe al instante: el GPS existe si el
 * navegador lo expone; el resto se asume ausente hasta confirmarlo.
 */
export function useCapability(name: Capability): boolean {
  return useCapabilities((s) => s.caps?.[name] ?? (name === 'geolocation' && 'geolocation' in navigator));
}
