import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { HeartPulse, PawPrint, Plus, TriangleAlert } from 'lucide-react';
import type { Attachment } from '@/core/model/types';
import { today } from '@/modules/inventory/domain/dates';
import { useBlobUrl } from '@/ui/useBlobUrl';
import { ageOn, monthsSince, useMedical } from './medicalStore';
import { Notice } from '@/ui/Notice';

function Avatar({ photo, pet }: { photo: Attachment | undefined; pet: boolean }) {
  const url = useBlobUrl(photo?.id, photo?.mime);
  const Icon = pet ? PawPrint : HeartPulse;
  return url ? (
    <img className="avatar" src={url} alt="" />
  ) : (
    <span className="avatar avatar-empty">
      <Icon size={22} aria-hidden />
    </span>
  );
}

export function MedicalPage() {
  const { t, i18n } = useTranslation();
  const profiles = useMedical((s) => s.profiles);
  const photos = useMedical((s) => s.photos);
  const rows = useMemo(
    () => [...profiles.values()].sort((a, b) => a.name.localeCompare(b.name, i18n.language)),
    [profiles, i18n.language],
  );
  const todayStr = today();
  const monthsLabel = (day: string) => {
    const m = monthsSince(day, todayStr);
    return m === 0 ? t('medical.pet.thisMonth') : t('medical.pet.monthsAgo', { count: m });
  };

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">{t('modules.medical.title')}</h1>
        <Link className="btn btn-primary" to="/first-aid/medical/new">
          <Plus size={20} /> {t('medical.new')}
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="empty">{t('medical.empty')}</p>
      ) : (
        <ul className="list">
          {rows.map((p) => {
            const species = p.pet ? (p.pet.species === 'other' && p.pet.speciesOther ? p.pet.speciesOther : t(`medical.pet.speciesOptions.${p.pet.species}`)) : null;
            const facts = [
              species,
              p.relationship || null,
              p.birthDate ? t('medical.age', { count: ageOn(p.birthDate, todayStr) }) : null,
              p.pet?.lastRabiesVaccine ? t('medical.pet.rabiesShort', { ago: monthsLabel(p.pet.lastRabiesVaccine) }) : null,
              p.pregnancy ? t('medical.pregnancyShort') : null,
              p.bloodType ? t('medical.bloodShort', { type: p.bloodType }) : null,
              p.medications.length ? t('medical.medCount', { count: p.medications.length }) : null,
            ].filter(Boolean);
            return (
              <li key={p.id}>
                <Link className="list-row" to={`/first-aid/medical/${p.id}`}>
                  <Avatar photo={photos.get(p.id)} pet={p.kind === 'pet'} />
                  <span className="list-main">
                    <span className="list-title">{p.name}</span>
                    {facts.length > 0 && <span className="list-sub">{facts.join(' · ')}</span>}
                    {p.allergies.trim() && (
                      <span className="list-sub allergy">
                        <TriangleAlert size={14} aria-hidden /> {t('medical.allergyShort', { text: p.allergies.trim() })}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <Notice id="medical.privacy" style={{ marginTop: 16 }}>{t('medical.privacy')}</Notice>
    </>
  );
}
