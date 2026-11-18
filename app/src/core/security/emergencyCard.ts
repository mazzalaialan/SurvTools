import { db } from '@/core/db/db';

/**
 * Datos de emergencia visibles sin desbloquear (como la "ficha médica" de los
 * celulares): una copia reducida y SIN CIFRAR de las fichas de las personas,
 * para que quien te asista vea grupo sanguíneo, alergias, medicación y a quién
 * llamar. Es opcional (Ajustes › Seguridad, `emergencyOnLock`): mientras está
 * activa, la app la actualiza cada vez que cambian las fichas (estando
 * desbloqueada); al desactivarla se borra. Va en `meta`, que no se cifra.
 */

export interface EmergencyCardPhone {
  label: string;
  phone: string | null;
}

export interface EmergencyCardPerson {
  name: string;
  /** "Yo", "Hijo", "Madre"… */
  relationship: string;
  isMe: boolean;
  /** Edad en años (no la fecha de nacimiento), si se sabe. */
  age: number | null;
  bloodType: string;
  allergies: string;
  conditions: string;
  /** «Embarazo» o «Embarazo · fecha probable de parto: …»; vacío si no está embarazada (ausente en tarjetas guardadas antes). */
  pregnancy?: string;
  /** Una línea por medicamento: nombre, dosis y cuándo. */
  medications: string[];
  /** A quién avisar, en orden de prioridad. */
  contacts: EmergencyCardPhone[];
  doctors: EmergencyCardPhone[];
  /** Obra social o prepaga: nombre, plan y número de afiliado. */
  insurance: string;
  insurancePhones: EmergencyCardPhone[];
}

export interface EmergencyCard {
  updatedAt: string;
  people: EmergencyCardPerson[];
}

const KEY = 'emergencyCard';

export async function readEmergencyCard(): Promise<EmergencyCard | null> {
  return ((await db.meta.get(KEY))?.value as EmergencyCard | undefined) ?? null;
}

/** Guarda la tarjeta, o la borra con `null`. */
export async function writeEmergencyCard(card: EmergencyCard | null): Promise<void> {
  if (card) await db.meta.put({ key: KEY, value: card });
  else await db.meta.delete(KEY);
}
