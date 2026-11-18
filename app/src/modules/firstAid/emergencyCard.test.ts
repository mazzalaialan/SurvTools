import { describe, expect, it } from 'vitest';
import type { MedicalProfile } from '@/core/model/types';
import { i18n, initI18n } from '@/core/i18n/i18n';
import { buildEmergencyCard, pregnancyText } from './emergencyCard';

const profile = (over: Partial<MedicalProfile>): MedicalProfile =>
  ({ id: over.id ?? 'p', kind: 'person', name: 'Marta', relationship: 'Yo', isMe: true, birthDate: '1992-03-04', bloodType: '0+', allergies: '', conditions: '', medications: [], emergencyContacts: [], doctors: [], pet: null, createdAt: '', updatedAt: '', deletedAt: null, ...over }) as MedicalProfile;
await initI18n('es');
const t = i18n.t.bind(i18n);

describe('tarjeta de emergencia: embarazo', () => {
  it('sin embarazo no lleva el dato', () => {
    expect(pregnancyText(profile({}), t)).toBe('');
    expect(buildEmergencyCard(new Map([['p', profile({ pregnancy: null })]]), t).people[0]!.pregnancy).toBe('');
  });

  it('con embarazo dice «Embarazo» y, si cargó la fecha probable de parto, la incluye', async () => {
    await i18n.changeLanguage('es');
    expect(pregnancyText(profile({ pregnancy: { dueDate: null } }), t)).toBe('Embarazo');
    expect(pregnancyText(profile({ pregnancy: { dueDate: '2027-03-12' } }), t)).toBe('Embarazo · fecha probable de parto: 12 de marzo de 2027');
    const card = buildEmergencyCard(new Map([['p', profile({ pregnancy: { dueDate: '2027-03-12' } })]]), t);
    expect(card.people[0]!.pregnancy).toContain('12 de marzo de 2027');
  });

  it('las mascotas no llevan embarazo ni entran en la tarjeta', () => {
    const pet = profile({ id: 'q', kind: 'pet', name: 'Firu', pregnancy: { dueDate: null } });
    expect(buildEmergencyCard(new Map([['q', pet]]), t).people).toEqual([]);
  });
});
