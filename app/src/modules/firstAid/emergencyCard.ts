import { useEffect } from 'react';
import { i18n } from '@/core/i18n/i18n';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import type { Id, MedicalProfile } from '@/core/model/types';
import { writeEmergencyCard, type EmergencyCard, type EmergencyCardPerson } from '@/core/security/emergencyCard';
import { useVault } from '@/core/security/useVault';
import { useSettings } from '@/core/settings/settings';
import { today } from '@/modules/inventory/domain/dates';
import { ageOn, isMeRelationship, useMedical } from './medicalStore';
import { doctorLabel, insurancePhones, medLine, resolveEmergencyContacts } from './medText';

/**
 * Arma la tarjeta de emergencia (core/security/emergencyCard.ts) con las fichas
 * de las personas (las mascotas no): primero la tuya, después el resto por
 * nombre. Solo lo que sirve para asistir: sin notas, fotos ni fecha de nacimiento.
 */
/** «Embarazo» o, si cargó la fecha probable de parto, «Embarazo · fecha probable de parto: 12 de marzo de 2027». */
export function pregnancyText(p: MedicalProfile, t: TFunction): string {
  if (!p.pregnancy) return '';
  const due = p.pregnancy.dueDate;
  if (!due) return t('medical.pregnancyShort');
  const date = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${due}T12:00:00Z`));
  return t('medical.pregnancyDue', { date });
}

export function buildEmergencyCard(profiles: Map<Id, MedicalProfile>, t: TFunction, now = new Date()): EmergencyCard {
  const day = today(now);
  const isMe = (p: MedicalProfile) => !!p.isMe || isMeRelationship(p.relationship);
  const people = [...profiles.values()]
    .filter((p) => p.kind === 'person' && !p.deletedAt)
    .sort((a, b) => Number(isMe(b)) - Number(isMe(a)) || a.name.localeCompare(b.name))
    .map((p): EmergencyCardPerson => {
      const ins = p.insurance;
      return {
        name: p.name,
        relationship: p.relationship ?? '',
        isMe: isMe(p),
        age: p.birthDate ? ageOn(p.birthDate, day) : null,
        bloodType: p.bloodType,
        allergies: p.allergies,
        conditions: p.conditions,
        pregnancy: pregnancyText(p, t),
        medications: p.medications.filter((m) => m.name.trim()).map((m) => medLine(m, t)),
        contacts: resolveEmergencyContacts(p, profiles),
        doctors: (p.doctors ?? []).filter((d) => d.name.trim() || d.phone.trim()).map((d) => ({ label: doctorLabel(d), phone: d.phone.trim() || null })),
        insurance: ins ? [ins.name, ins.plan, ins.memberNumber && `N.º ${ins.memberNumber}`].filter(Boolean).join(' · ') : '',
        insurancePhones: insurancePhones(ins).map((ph) => ({ label: ph.label, phone: ph.number })),
      };
    });
  return { updatedAt: now.toISOString(), people };
}

/**
 * Mientras la app está desbloqueada y la opción está activa, mantiene la
 * tarjeta al día con las fichas; con la opción apagada (o sin contraseña, que
 * no hay pantalla de bloqueo), la borra.
 */
export function useEmergencyCardSync(): void {
  const { t } = useTranslation();
  const enabled = useSettings((s) => s.settings.emergencyOnLock);
  const open = useVault((s) => s.open);
  const loaded = useMedical((s) => s.loaded);
  const profiles = useMedical((s) => s.profiles);
  const active = enabled && !open;

  useEffect(() => {
    if (!active) {
      void writeEmergencyCard(null);
      return;
    }
    if (!loaded) return;
    // Se espera un momento: al editar una ficha se guarda varias veces seguidas.
    const timer = setTimeout(() => void writeEmergencyCard(buildEmergencyCard(profiles, t)), 500);
    return () => clearTimeout(timer);
  }, [active, loaded, profiles, t]);
}
