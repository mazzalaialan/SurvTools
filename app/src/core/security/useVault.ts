import { create } from 'zustand';
import { isUnlocked, onSessionChange } from './session';
import { biometricEnabled, disableBiometric, enableBiometric, unlockWithBiometric } from './vaultBiometric';
import {
  addPassword,
  changePassword,
  initializeOpenVault,
  initializeVault,
  isOpenVault,
  isVaultInitialized,
  lockVault,
  removePassword,
  unlockOpenVault,
  unlockWithPassword,
  unlockWithRecoveryKey,
} from './vault';

export type VaultStatus = 'loading' | 'uninitialized' | 'locked' | 'unlocked';

interface VaultState {
  status: VaultStatus;
  /** Bóveda sin contraseña: entra sola y no se bloquea. */
  open: boolean;
  /** Tiene activado el desbloqueo con huella, cara o PIN. */
  biometric: boolean;
  setupInProgress: boolean;
  /** Clave recién generada que la UI debe mostrar antes de entrar a la app. */
  pendingRecoveryKey: string | null;
  /** Se desbloqueó con la clave de recuperación: hay que definir contraseña nueva. */
  mustChangePassword: boolean;
  refresh: () => Promise<void>;
  create: (password: string) => Promise<void>;
  /** Configura la bóveda sin contraseña. */
  createOpen: () => Promise<void>;
  /** Sin contraseña → con contraseña (después hay que mostrar la clave de recuperación). */
  addPassword: (password: string) => Promise<void>;
  /** Con contraseña → sin contraseña. Lanza `WrongSecretError` si la contraseña no es correcta. */
  removePassword: (password: string) => Promise<void>;
  acknowledgeRecoveryKey: () => void;
  unlock: (password: string) => Promise<void>;
  recover: (recoveryKey: string) => Promise<void>;
  /** Desbloquea con la biometría del dispositivo (lanza `BiometricError`). */
  unlockBiometric: () => Promise<void>;
  enableBiometric: () => Promise<void>;
  disableBiometric: () => Promise<void>;
  setNewPassword: (password: string) => Promise<void>;
  lock: () => void;
}

export const useVault = create<VaultState>((set, get) => ({
  status: 'loading',
  open: false,
  biometric: false,
  setupInProgress: false,
  pendingRecoveryKey: null,
  mustChangePassword: false,
  async refresh() {
    const open = await isOpenVault();
    const biometric = !open && (await biometricEnabled());
    if (isUnlocked()) return set({ status: 'unlocked', open, biometric });
    // Sin contraseña: se abre sola (abrirla vuelve a llamar a refresh, ya desbloqueada).
    if (open && (await unlockOpenVault())) return;
    set({ status: (await isVaultInitialized()) ? 'locked' : 'uninitialized', open, biometric });
  },
  async create(password) {
    // La bóveda queda desbloqueada antes de tener la clave: el flag evita mostrar la app en ese instante.
    set({ setupInProgress: true });
    try {
      set({ pendingRecoveryKey: await initializeVault(password) });
    } finally {
      set({ setupInProgress: false });
    }
  },
  async createOpen() {
    set({ setupInProgress: true });
    try {
      await initializeOpenVault();
      set({ open: true });
    } finally {
      set({ setupInProgress: false });
    }
  },
  async addPassword(password) {
    const recoveryKey = await addPassword(password);
    // La clave de recuperación se muestra una única vez, como al crear la bóveda.
    set({ open: false, pendingRecoveryKey: recoveryKey });
  },
  async removePassword(password) {
    await removePassword(password);
    set({ open: true });
  },
  acknowledgeRecoveryKey() {
    set({ pendingRecoveryKey: null });
  },
  async unlock(password) {
    await unlockWithPassword(password);
  },
  async recover(recoveryKey) {
    set({ mustChangePassword: true });
    try {
      await unlockWithRecoveryKey(recoveryKey);
    } catch (e) {
      set({ mustChangePassword: false });
      throw e;
    }
  },
  async unlockBiometric() {
    await unlockWithBiometric();
  },
  async enableBiometric() {
    await enableBiometric();
    set({ biometric: true });
  },
  async disableBiometric() {
    await disableBiometric();
    set({ biometric: false });
  },
  async setNewPassword(password) {
    await changePassword(password);
    set({ mustChangePassword: false });
  },
  lock() {
    // Sin contraseña no hay con qué desbloquear: no se bloquea.
    if (get().open) return;
    lockVault();
    if (get().mustChangePassword) set({ mustChangePassword: false });
  },
}));

onSessionChange(() => void useVault.getState().refresh());
