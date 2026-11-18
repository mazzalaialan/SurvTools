import { create } from 'zustand';
import { blobStore, repos } from '@/core/db/repository';
import type { CompressedImage } from '@/core/images/compress';
import { newEntity, touch } from '@/core/model/entity';
import i18n from 'i18next';
import type { Attachment, Doctor, HealthInsurance, Id, MedicalProfile, PetHealth } from '@/core/model/types';
import { isUnlocked, onSessionChange } from '@/core/security/session';

interface MedicalState {
  loaded: boolean;
  profiles: Map<Id, MedicalProfile>;
  /** Foto de cada persona, por id de ficha (solo metadatos). */
  photos: Map<Id, Attachment>;
  load: () => Promise<void>;
  clear: () => void;
  saveProfile: (p: MedicalProfile) => Promise<void>;
  deleteProfile: (id: Id) => Promise<void>;
  setPhoto: (profileId: Id, image: CompressedImage) => Promise<void>;
  removePhoto: (profileId: Id) => Promise<void>;
}

let loading: Promise<void> | null = null;

export const useMedical = create<MedicalState>((set, get) => ({
  loaded: false,
  profiles: new Map(),
  photos: new Map(),

  load() {
    // Una sola carga a la vez: si al desbloquear se pide dos veces, la segunda no
    // debe pisar con datos viejos una ficha guardada mientras tanto.
    loading ??= (async () => {
      const [profiles, attachments] = await Promise.all([repos.medicalProfiles.loadAll(), repos.attachments.loadAll()]);
      set({
        loaded: true,
        profiles: new Map(profiles.map((p) => [p.id, normalizeProfile(p)])),
        photos: new Map(attachments.filter((a) => a.ownerType === 'medicalProfile').map((a) => [a.ownerId, a])),
      });
    })().finally(() => {
      loading = null;
    });
    return loading;
  },

  clear() {
    set({ loaded: false, profiles: new Map(), photos: new Map() });
  },

  async saveProfile(p) {
    if (loading) await loading;
    const saved = touch(p);
    await repos.medicalProfiles.put(saved);
    const profiles = new Map(get().profiles).set(saved.id, saved);
    // "Yo" hay uno solo: la ficha que lo era pasa a "Otros".
    if (saved.isMe) {
      for (const other of profiles.values()) {
        if (other.id === saved.id || !(other.isMe || isMeRelationship(other.relationship))) continue;
        const unmarked = touch({ ...other, isMe: false, relationship: isMeRelationship(other.relationship) ? i18n.t('medical.relationshipOthers') : other.relationship });
        await repos.medicalProfiles.put(unmarked);
        profiles.set(unmarked.id, unmarked);
      }
    }
    set({ profiles });
  },

  async deleteProfile(id) {
    await get().removePhoto(id);
    await repos.medicalProfiles.remove(id);
    const profiles = new Map(get().profiles);
    profiles.delete(id);
    set({ profiles });
  },

  async setPhoto(profileId, image) {
    // Una foto por persona: la nueva reemplaza a la anterior.
    await get().removePhoto(profileId);
    const photo = newEntity<Attachment>({
      ownerType: 'medicalProfile',
      ownerId: profileId,
      mime: image.mime,
      width: image.width,
      height: image.height,
      order: 0,
      sizeBytes: image.bytes.byteLength,
    });
    await blobStore.put(photo.id, image.bytes);
    await repos.attachments.put(photo);
    set({ photos: new Map(get().photos).set(profileId, photo) });
  },

  async removePhoto(profileId) {
    const photo = get().photos.get(profileId);
    if (!photo) return;
    await repos.attachments.remove(photo.id);
    await blobStore.remove(photo.id);
    const photos = new Map(get().photos);
    photos.delete(profileId);
    set({ photos });
  },
}));

onSessionChange(() => {
  if (isUnlocked()) {
    if (!useMedical.getState().loaded) void useMedical.getState().load();
  } else {
    useMedical.getState().clear();
  }
});

/** Las fichas anteriores a v0.7.2 eran todas de personas; las anteriores a 0.11 no tenían parentesco ni teléfono. */
export function normalizeProfile(p: MedicalProfile): MedicalProfile {
  return {
    ...p,
    kind: p.kind ?? 'person',
    pet: p.pet ?? null,
    pregnancy: p.pregnancy ?? null,
    relationship: p.relationship ?? '',
    phone: p.phone ?? '',
    inContacts: p.inContacts ?? true,
    isMe: p.isMe ?? false,
    // Antes de 0.11.1 había un solo contacto, en texto.
    emergencyContacts: p.emergencyContacts ?? (p.emergencyContact?.trim() ? [{ profileId: null, text: p.emergencyContact.trim() }] : []),
    // Antes de 0.11.1 médico y obra social (o el veterinario) iban en un texto: pasa como un médico, para revisarlo.
    doctors: p.doctors ?? (p.doctor?.trim() ? [legacyDoctor(p.doctor)] : []),
    insurance: normalizeInsurance(p.insurance),
    medications: (p.medications ?? []).map((m) => ({ ...m, everyHours: m.everyHours ?? null, firstTime: m.firstTime ?? null })),
  };
}

export function emptyInsurance(): HealthInsurance {
  return { name: '', plan: '', memberNumber: '', emergencyPhone: '', phones: [] };
}

/** Antes de 0.13 la obra social tenía un solo teléfono (de emergencias): pasa a ser el primero de la lista. */
function normalizeInsurance(ins: HealthInsurance | undefined): HealthInsurance {
  if (!ins) return emptyInsurance();
  const phones = ins.phones ?? (ins.emergencyPhone.trim() ? [{ label: '', number: ins.emergencyPhone.trim() }] : []);
  return { ...ins, phones };
}

function legacyDoctor(text: string): Doctor {
  const phone = phoneIn(text) ?? '';
  return { role: '', name: (phone ? text.replace(phone, '') : text).replace(/[\s,;-]+$/, '').trim(), phone };
}

/** Teléfono dentro de un texto libre ("María (hermana) 11 5555-1234"). */
export function phoneIn(text: string): string | null {
  return text.match(/\+?\d[\d\s().-]{5,}\d/)?.[0] ?? null;
}

/** Nombre de obra social para comparar: "OSDE" = "Osde" = "O.S.D.E."; "Swiss Medical" = "SwissMedical". */
export function insurerKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Parentesco "Yo" (o "Me"): esa ficha es la del usuario. */
export function isMeRelationship(relationship: string | undefined): boolean {
  return /^\s*(yo|me)\s*$/i.test(relationship ?? '');
}

/** Frecuencias que se ofrecen, en horas (0 = solo si hace falta). */
export const MED_FREQUENCIES = [24, 12, 8, 6, 4, 48, 168, 0] as const;

/** Horarios del día a partir de la primera toma: cada 8 h desde las 08:00 → 08:00, 16:00, 00:00. */
export function medTimes(everyHours: number | null | undefined, firstTime: string | null | undefined): string[] {
  if (!firstTime || !everyHours) return [];
  if (everyHours >= 24) return [firstTime];
  const [h, m] = firstTime.split(':').map(Number);
  const start = h! * 60 + m!;
  return Array.from({ length: Math.floor(24 / everyHours) }, (_, i) => {
    const t = (start + i * everyHours * 60) % (24 * 60);
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  });
}

export function emptyPetHealth(): PetHealth {
  return { species: 'dog', speciesOther: '', lastRabiesVaccine: null, lastSpeciesVaccine: null, lastDeworming: null, neutered: null, lastFleaTreatment: null };
}

/** Meses completos entre una fecha y hoy (para "hace 3 meses"). */
export function monthsSince(day: string, today: string): number {
  const [y1, m1, d1] = day.split('-').map(Number);
  const [y2, m2, d2] = today.split('-').map(Number);
  return Math.max(0, (y2! - y1!) * 12 + (m2! - m1!) - (d2! < d1! ? 1 : 0));
}

/** Edad en años cumplidos a una fecha dada. */
export function ageOn(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  return ty! - by! - (tm! < bm! || (tm === bm && td! < bd!) ? 1 : 0);
}
