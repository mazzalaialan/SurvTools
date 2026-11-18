import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Check, FileText, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useDocuments } from '@/modules/documents/store';
import { emptyContact } from '@/modules/emergency/ContactEditPage';
import { PhoneActions } from '@/modules/emergency/parts';
import { useContacts } from '@/modules/emergency/store';
import { newEntity } from '@/core/model/entity';
import type { Doctor, EmergencyContact, EmergencyContactRef, HealthInsurance, Medication, MedicalProfile, PetHealth, PetSpecies, ProfileKind } from '@/core/model/types';
import { today } from '@/modules/inventory/domain/dates';
import { Segmented } from '@/ui/Segmented';
import { SinglePhoto } from '@/ui/SinglePhoto';
import { emptyInsurance, emptyPetHealth, insurerKey, isMeRelationship, MED_FREQUENCIES, medTimes, monthsSince, useMedical } from './medicalStore';
import { InsurancePhonesEditor } from './InsurancePhonesEditor';
import { COMMON_INSURERS } from './insurers';
import { doctorLabel, medLine, phoneIn } from './medText';
import { confirmAction } from '@/ui/confirm';

const BLOOD_TYPES = ['0+', '0-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];

function emptyProfile(): MedicalProfile {
  return newEntity<MedicalProfile>({
    kind: 'person',
    pet: null,
    name: '',
    relationship: '',
    phone: '',
    inContacts: true,
    birthDate: null,
    bloodType: '',
    allergies: '',
    conditions: '',
    medications: [],
    emergencyContact: '',
    emergencyContacts: [],
    doctors: [],
    insurance: emptyInsurance(),
    doctor: '',
    notes: '',
  });
}

export function MedicalEditPage() {
  const { id } = useParams();
  const stored = useMedical((s) => (id ? s.profiles.get(id) : undefined));
  const loaded = useMedical((s) => s.loaded);
  const { t } = useTranslation();

  if (!loaded) return null;
  if (id !== 'new' && !stored) {
    return (
      <p className="empty">
        {t('medical.notFound')} <Link to="/first-aid/medical">{t('common.back')}</Link>
      </p>
    );
  }
  return <ProfileForm key={stored?.id ?? 'new'} stored={stored} />;
}

function ProfilePhoto({ profileId, name }: { profileId: string; name: string }) {
  const photo = useMedical((s) => s.photos.get(profileId));
  const setPhoto = useMedical((s) => s.setPhoto);
  const removePhoto = useMedical((s) => s.removePhoto);
  return (
    <SinglePhoto
      photo={photo}
      alt={name}
      onSet={(image) => setPhoto(profileId, image)}
      onRemove={() => removePhoto(profileId)}
      testId="person-photo-file"
    />
  );
}

/** Documentos de esta persona o mascota (estudios, recetas, carnet de vacunas…). */
function ProfileDocuments({ profileId }: { profileId: string }) {
  const { t, i18n } = useTranslation();
  const documents = useDocuments((s) => s.documents);
  const docs = useMemo(
    () =>
      [...documents.values()]
        .filter((d) => d.profileId === profileId)
        // El mismo orden que eligió en Documentos.
        .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || a.title.localeCompare(b.title, i18n.language)),
    [documents, profileId, i18n.language],
  );
  return (
    <section className="card stack" aria-labelledby="profile-docs-title">
      <h2 id="profile-docs-title" className="section-title" style={{ margin: 0 }}>{t('medical.documents')}</h2>
      {docs.length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>{t('medical.noDocuments')}</p>
      ) : (
        <ul className="list" data-testid="profile-documents">
          {docs.map((d) => (
            <li key={d.id}>
              <Link className="list-row" to={`/documents/${d.id}?profile=${profileId}`}>
                <FileText size={20} aria-hidden />
                <span className="list-main">
                  <span className="list-title">{d.title}</span>
                  {d.category === 'medical' && <span className="list-sub">{t('documents.categories.medical')}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="row-end">
        <Link className="btn" to={`/documents/new?profile=${profileId}&category=medical`}>
          <Plus size={18} /> {t('medical.addDocument')}
        </Link>
      </div>
    </section>
  );
}

function withLiveInsurance(p: MedicalProfile, contacts: Map<string, EmergencyContact>): MedicalProfile {
  const c = p.insurance?.contactId ? contacts.get(p.insurance.contactId) : undefined;
  return c ? { ...p, insurance: { ...p.insurance!, name: c.name, phones: c.phones ?? [] } } : p;
}


function ProfileForm({ stored }: { stored: MedicalProfile | undefined }) {
  // La obra social compartida se muestra con sus datos actuales (pudieron cambiar desde otra ficha).
  const [initial] = useState(() => (stored ? withLiveInsurance(stored, useContacts.getState().contacts) : emptyProfile()));
  const isNew = !stored;
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { saveProfile, deleteProfile } = useMedical();
  const [draft, setDraft] = useState(initial);
  const [saved, setSaved] = useState(false);

  const set = (changes: Partial<MedicalProfile>) => {
    setDraft((d) => ({ ...d, ...changes }));
    setSaved(false);
  };
  const setMed = (index: number, changes: Partial<Medication>) =>
    set({ medications: draft.medications.map((m, i) => (i === index ? { ...m, ...changes } : m)) });
  // Las ya cargadas se ven en una línea; se abren para editarlas.
  const [openMeds, setOpenMeds] = useState<Set<number>>(() => new Set());
  const addMed = () => {
    setOpenMeds((s) => new Set(s).add(draft.medications.length));
    set({ medications: [...draft.medications, { name: '', dose: '', schedule: '', everyHours: 24, firstTime: null }] });
  };
  const removeMed = (index: number) => {
    setOpenMeds((s) => new Set([...s].filter((i) => i !== index).map((i) => (i > index ? i - 1 : i))));
    set({ medications: draft.medications.filter((_, j) => j !== index) });
  };
  const isPet = draft.kind === 'pet';
  const isMe = !isPet && isMeRelationship(draft.relationship);
  const allProfiles = useMedical((s) => s.profiles);
  // Para el contacto de emergencia: las otras personas con ficha.
  const others = useMemo(
    () => [...allProfiles.values()].filter((p) => p.kind === 'person' && p.id !== draft.id).sort((a, b) => a.name.localeCompare(b.name, i18n.language)),
    [allProfiles, draft.id, i18n.language],
  );
  const contactName = (id: string) => {
    const p = allProfiles.get(id);
    return p ? [p.name, p.relationship && `(${p.relationship})`, p.phone].filter(Boolean).join(' ') : '';
  };
  const contacts = draft.emergencyContacts ?? [];
  const doctors = draft.doctors ?? [];
  const setDoctor = (index: number, changes: Partial<Doctor>) => set({ doctors: doctors.map((d, i) => (i === index ? { ...d, ...changes } : d)) });
  // Médicos (o veterinarios) ya cargados, para elegirlos en lugar de escribirlos otra vez.
  const savedContacts = useContacts((s) => s.contacts);
  const saveContact = useContacts((s) => s.save);
  const professionals = useMemo(
    () => [...savedContacts.values()].filter((c) => c.kind === (isPet ? 'vet' : 'doctor')).sort((a, b) => a.name.localeCompare(b.name, i18n.language)),
    [savedContacts, isPet, i18n.language],
  );
  /** Otras fichas que comparten este médico. */
  const sharedWith = (contactId: string | null | undefined) =>
    contactId
      ? [...allProfiles.values()].filter((p) => p.id !== draft.id && (p.doctors ?? []).some((d) => d.contactId === contactId)).map((p) => p.name)
      : [];
  // Igual que la medicación: los ya cargados en una línea, se abren para editarlos.
  const [openDoctors, setOpenDoctors] = useState<Set<number>>(() => new Set());
  // Teléfonos de la obra social: cargados se ven en una línea con el botón para llamar.
  const [editInsPhones, setEditInsPhones] = useState(false);
  // Filas agregadas en esta edición: solo en ellas se puede elegir un médico ya cargado.
  const [addedDoctors, setAddedDoctors] = useState<Set<number>>(() => new Set());
  const shiftOut = (s: Set<number>, index: number) => new Set([...s].filter((i) => i !== index).map((i) => (i > index ? i - 1 : i)));
  const addDoctor = () => {
    setOpenDoctors((s) => new Set(s).add(doctors.length));
    setAddedDoctors((s) => new Set(s).add(doctors.length));
    set({ doctors: [...doctors, { contactId: null, role: doctors.length === 0 && !isPet ? t('medical.doctors.primary') : '', name: '', phone: '' }] });
  };
  const removeDoctor = (index: number) => {
    setOpenDoctors((s) => shiftOut(s, index));
    setAddedDoctors((s) => shiftOut(s, index));
    set({ doctors: doctors.filter((_, j) => j !== index) });
  };
  /** Abrir para editar con los datos actuales (pudieron cambiar desde otra ficha). */
  const openDoctor = (index: number) => {
    setDoctor(index, liveDoctor(doctors[index]!));
    setOpenDoctors((s) => new Set(s).add(index));
  };
  /** Los datos actuales del médico compartido (nombre y teléfono viven en el contacto). */
  const liveDoctor = (d: Doctor): Doctor => {
    const c = d.contactId ? savedContacts.get(d.contactId) : undefined;
    return c ? { ...d, name: c.name, phone: c.phone } : d;
  };
  const pickDoctor = (index: number, contactId: string) => {
    const c = contactId ? savedContacts.get(contactId) : undefined;
    setDoctor(index, c ? { contactId: c.id, name: c.name, phone: c.phone, role: doctors[index]!.role || c.specialty || '' } : { contactId: null, name: '', phone: '' });
  };
  const insurance = draft.insurance ?? emptyInsurance();
  const setInsurance = (changes: Partial<HealthInsurance>) => set({ insurance: { ...insurance, ...changes } });
  const insPhones = insurance.phones ?? [];
  // Obras sociales ya cargadas (de esta u otras fichas): se eligen en lugar de volver a cargar los teléfonos.
  const insurers = useMemo(
    () => [...savedContacts.values()].filter((c) => c.kind === 'insurance').sort((a, b) => a.name.localeCompare(b.name, i18n.language)),
    [savedContacts, i18n.language],
  );
  // Para escribir el nombre: las ya cargadas primero y después las comunes (sin repetir "OSDE" y "Osde").
  const insurerNames = useMemo(() => {
    const seen = new Set<string>();
    return [...insurers.map((c) => c.name), ...COMMON_INSURERS].filter((n) => {
      const key = insurerKey(n);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [insurers]);
  const pickInsurer = (contactId: string) => {
    const c = contactId ? savedContacts.get(contactId) : undefined;
    setInsurance(c ? { contactId: c.id, name: c.name, phones: c.phones ?? [] } : { contactId: null, name: '', phones: [] });
  };
  const insuranceShared = insurance.contactId
    ? [...allProfiles.values()].filter((p) => p.id !== draft.id && p.insurance?.contactId === insurance.contactId).map((p) => p.name)
    : [];
  const setContact = (index: number, changes: Partial<EmergencyContactRef>) =>
    set({ emergencyContacts: contacts.map((c, i) => (i === index ? { ...c, ...changes } : c)) });
  const pet = draft.pet ?? emptyPetHealth();
  const setPet = (changes: Partial<PetHealth>) => set({ pet: { ...pet, ...changes } });
  // Al pasar a mascota se crean sus datos; si se vuelve a persona, se descartan al guardar.
  const setKind = (kind: ProfileKind) => set({ kind, pet: kind === 'pet' ? (draft.pet ?? emptyPetHealth()) : draft.pet });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // Los vacíos no se guardan. Cada médico queda como contacto compartido: si ya
    // existía se actualizan sus datos (valen para todas las fichas), si no se crea.
    const doctors: Doctor[] = [];
    for (const d of draft.doctors ?? []) {
      const entry = { contactId: d.contactId ?? null, role: d.role.trim(), name: d.name.trim(), phone: d.phone.trim() };
      if (!entry.name && !entry.phone) continue;
      const existing = entry.contactId ? savedContacts.get(entry.contactId) : undefined;
      // Sin tocar en esta ficha: vale lo del contacto (pudo cambiar desde otra ficha), no la copia vieja.
      const before = (initial.doctors ?? []).find((x) => x.contactId && x.contactId === entry.contactId);
      if (existing && before && before.name === entry.name && before.phone === entry.phone) {
        entry.name = existing.name;
        entry.phone = existing.phone;
      } else if (existing) {
        if (existing.name !== entry.name || existing.phone !== entry.phone) await saveContact({ ...existing, name: entry.name, phone: entry.phone });
      } else {
        const created = { ...emptyContact(isPet ? 'vet' : 'doctor'), name: entry.name || entry.phone, phone: entry.phone, specialty: entry.role };
        await saveContact(created);
        entry.contactId = created.id;
      }
      doctors.push(entry);
    }
    const ins = draft.insurance ?? emptyInsurance();
    let insName = ins.name.trim();
    let insPhones = (ins.phones ?? []).map((p) => ({ label: p.label.trim(), number: p.number.trim() })).filter((p) => p.number);
    // La obra social (nombre y teléfonos) es un contacto compartido por la familia: si
    // ya existe (elegida o con el mismo nombre) se actualiza, si no se crea.
    let insContactId: string | null = null;
    if (!isPet && (insName || insPhones.length)) {
      const linked = ins.contactId ? savedContacts.get(ins.contactId) : undefined;
      const sameName = linked ? undefined : [...savedContacts.values()].find((c) => c.kind === 'insurance' && insName && insurerKey(c.name) === insurerKey(insName));
      if (linked) {
        const changed = linked.name !== insName || JSON.stringify(linked.phones ?? []) !== JSON.stringify(insPhones);
        if (changed) await saveContact({ ...linked, name: insName || linked.name, phones: insPhones, phone: insPhones[0]?.number ?? '' });
        insContactId = linked.id;
      } else if (sameName) {
        // Escrita a mano igual que una ya cargada: es la misma; se suman los teléfonos que falten.
        const phones = [...(sameName.phones ?? [])];
        for (const p of insPhones) if (!phones.some((x) => x.number.replace(/\D/g, '') === p.number.replace(/\D/g, ''))) phones.push(p);
        if (phones.length !== (sameName.phones ?? []).length) await saveContact({ ...sameName, phones, phone: phones[0]?.number ?? '' });
        insContactId = sameName.id;
        insName = sameName.name;
        insPhones = phones;
      } else {
        const created = { ...emptyContact('insurance'), name: insName || t('medical.insurance.title'), phones: insPhones, phone: insPhones[0]?.number ?? '' };
        await saveContact(created);
        insContactId = created.id;
      }
    }
    const insurance = isPet
      ? emptyInsurance()
      : {
          contactId: insContactId,
          name: insName,
          plan: ins.plan.trim(),
          memberNumber: ins.memberNumber.trim(),
          phones: insPhones,
          // Copia para versiones anteriores, que tenían un solo teléfono.
          emergencyPhone: insPhones[0]?.number ?? '',
        };
    const contacts = (draft.emergencyContacts ?? [])
      .map((c) => ({ profileId: c.profileId, text: c.profileId ? '' : c.text.trim() }))
      .filter((c) => c.profileId || c.text);
    const toSave: MedicalProfile = {
      ...draft,
      name: draft.name.trim(),
      pet: isPet ? { ...pet, speciesOther: pet.species === 'other' ? pet.speciesOther.trim() : '' } : null,
      bloodType: isPet ? '' : draft.bloodType,
      weightKg: isPet ? null : (draft.weightKg ?? null),
      heightCm: isPet ? null : (draft.heightCm ?? null),
      relationship: isPet ? '' : (draft.relationship ?? '').trim(),
      phone: isPet ? '' : (draft.phone ?? '').trim(),
      isMe: isMe,
      emergencyContacts: contacts,
      doctors,
      insurance,
      // Respaldo en texto para versiones anteriores.
      doctor: [...doctors.map((d) => [doctorLabel(d), d.phone].filter(Boolean).join(' ')), [insurance.name, insurance.plan, insurance.memberNumber].filter(Boolean).join(' ')]
        .filter(Boolean)
        .join(' / '),
      // Respaldo en texto para versiones anteriores de la app.
      emergencyContact: contacts.map((c) => (c.profileId ? contactName(c.profileId) : c.text)).join(' / '),
      // Las filas de medicación vacías no se guardan.
      medications: draft.medications
        .map((m) => ({
          name: m.name.trim(),
          dose: m.dose.trim(),
          schedule: m.schedule.trim(),
          everyHours: m.everyHours ?? null,
          firstTime: m.everyHours ? (m.firstTime ?? null) : null,
        }))
        .filter((m) => m.name),
    };
    await saveProfile(toSave);
    if (isNew) navigate(`/first-aid/medical/${draft.id}`, { replace: true });
    else {
      // Lo guardado (con los médicos y la obra social ya vinculados a sus contactos): si se
      // vuelve a guardar sin salir, no se crean contactos repetidos.
      setDraft(toSave);
      setEditInsPhones(false);
      setSaved(true);
      setOpenMeds(new Set());
      setOpenDoctors(new Set());
      setAddedDoctors(new Set());
    }
  }

  async function handleDelete() {
    if (!stored || !(await confirmAction(t('medical.confirmDelete', { name: stored.name })))) return;
    await deleteProfile(stored.id);
    navigate('/first-aid/medical', { replace: true });
  }

  // En mascotas algunos textos cambian ("Veterinario" en lugar de "Médico / obra social").
  const label = (key: string) => t(isPet && i18n.exists(`medical.pet.${key}`) ? `medical.pet.${key}` : `medical.${key}`);
  const text = (key: 'allergies' | 'conditions' | 'emergencyContact' | 'doctor' | 'notes', multiline = true) => (
    <div className="field">
      <label htmlFor={key}>{label(key)}</label>
      {multiline ? (
        <textarea id={key} className="input textarea" value={draft[key]} onChange={(e) => set({ [key]: e.target.value })} placeholder={label(`${key}Placeholder`)} />
      ) : (
        <input id={key} className="input" value={draft[key]} onChange={(e) => set({ [key]: e.target.value })} placeholder={label(`${key}Placeholder`)} />
      )}
    </div>
  );
  const todayStr = today();
  const petDate = (key: 'lastRabiesVaccine' | 'lastSpeciesVaccine' | 'lastDeworming' | 'lastFleaTreatment', labelText: string) => (
    <div className="field">
      <label htmlFor={key}>{labelText}</label>
      <input id={key} className="input" type="date" max={todayStr} value={pet[key] ?? ''} onChange={(e) => setPet({ [key]: e.target.value || null })} />
      {pet[key] && <p className="hint" style={{ margin: 0 }}>{ago(pet[key]!)}</p>}
    </div>
  );
  const ago = (day: string) => {
    const months = monthsSince(day, todayStr);
    return months === 0 ? t('medical.pet.thisMonth') : t('medical.pet.monthsAgo', { count: months });
  };

  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="page-title" style={{ flex: 1 }}>{stored ? stored.name : t('medical.new')}</h1>
      </div>

      {stored ? <ProfilePhoto profileId={stored.id} name={stored.name} /> : <p className="hint">{t('medical.photoAfterSave')}</p>}

      {stored && <ProfileDocuments profileId={stored.id} />}

      <form className="stack" onSubmit={handleSubmit}>
        <section className="card stack">
          <Segmented<ProfileKind>
            label={t('medical.kind')}
            value={draft.kind}
            options={[
              { value: 'person', label: t('medical.kinds.person') },
              { value: 'pet', label: t('medical.kinds.pet') },
            ]}
            onChange={setKind}
          />
          <div className="field">
            <label htmlFor="name">{t('medical.name')}</label>
            <input id="name" className="input" required value={draft.name} onChange={(e) => set({ name: e.target.value })} autoFocus={isNew} />
          </div>
          {!isPet && (
            <div className="grid-2">
              <div className="field">
                <label htmlFor="relationship">{t('medical.relationship')}</label>
                <input
                  id="relationship"
                  className="input"
                  list="relationship-options"
                  value={draft.relationship ?? ''}
                  onChange={(e) => set({ relationship: e.target.value })}
                  placeholder={t('medical.relationshipPlaceholder')}
                />
                <datalist id="relationship-options">
                  {(t('medical.relationshipOptions', { returnObjects: true }) as string[]).map((r) => (
                    <option key={r} value={r} />
                  ))}
                </datalist>
              </div>
              <div className="field">
                <label htmlFor="phone">{t('medical.phone')}</label>
                <input id="phone" className="input" type="tel" inputMode="tel" value={draft.phone ?? ''} onChange={(e) => set({ phone: e.target.value })} />
                {draft.phone?.trim() && <PhoneActions phone={draft.phone} testId="profile-call" />}
              </div>
            </div>
          )}
          {isMe && <p className="hint" style={{ margin: 0 }}>{t('medical.isMeHint')}</p>}
          {!isPet && !isMe && (
            <label className="check">
              <input type="checkbox" checked={draft.inContacts ?? true} onChange={(e) => set({ inContacts: e.target.checked })} />
              {t('medical.inContacts')}
            </label>
          )}
          {isPet && (
            <div className="grid-2">
              <div className="field">
                <label htmlFor="species">{t('medical.pet.species')}</label>
                <select id="species" className="select" value={pet.species} onChange={(e) => setPet({ species: e.target.value as PetSpecies })}>
                  {(['dog', 'cat', 'other'] as const).map((s) => (
                    <option key={s} value={s}>
                      {t(`medical.pet.speciesOptions.${s}`)}
                    </option>
                  ))}
                </select>
              </div>
              {pet.species === 'other' && (
                <div className="field">
                  <label htmlFor="species-other">{t('medical.pet.speciesOther')}</label>
                  <input id="species-other" className="input" value={pet.speciesOther} onChange={(e) => setPet({ speciesOther: e.target.value })} placeholder={t('medical.pet.speciesOtherPlaceholder')} />
                </div>
              )}
            </div>
          )}
          <div className="grid-2">
            <div className="field">
              <label htmlFor="birth">{t('medical.birthDate')}</label>
              <input id="birth" className="input" type="date" value={draft.birthDate ?? ''} onChange={(e) => set({ birthDate: e.target.value || null })} />
            </div>
            {!isPet && (
              <div className="field">
                <label htmlFor="blood">{t('medical.bloodType')}</label>
                <select id="blood" className="select" value={draft.bloodType} onChange={(e) => set({ bloodType: e.target.value })}>
                  <option value="">{t('medical.unknown')}</option>
                  {BLOOD_TYPES.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {!isPet && (
            <div className="field">
              <label htmlFor="weight">{t('medical.weightKg')}</label>
              <input
                id="weight"
                className="input"
                type="number"
                inputMode="decimal"
                min={20}
                max={400}
                step={0.1}
                value={draft.weightKg ?? ''}
                onChange={(e) => set({ weightKg: e.target.value === '' ? null : Number(e.target.value) })}
              />
              <p className="hint" style={{ margin: 0 }}>{t('medical.weightHint')}</p>
            </div>
          )}
          {!isPet && (
            <div className="field">
              <label htmlFor="height">{t('medical.heightCm')}</label>
              <input
                id="height"
                className="input"
                type="number"
                inputMode="decimal"
                min={50}
                max={250}
                step={1}
                value={draft.heightCm ?? ''}
                onChange={(e) => set({ heightCm: e.target.value === '' ? null : Number(e.target.value) })}
              />
            </div>
          )}
          {text('allergies')}
          {text('conditions')}
          {!isPet && (
            <div className="field" data-testid="pregnancy-field">
              <label className="check">
                <input type="checkbox" checked={draft.pregnancy != null} onChange={(e) => set({ pregnancy: e.target.checked ? { dueDate: null } : null })} data-testid="pregnancy-toggle" /> {t('medical.pregnant')}
              </label>
              {draft.pregnancy != null && (
                <>
                  <label htmlFor="due-date">{t('medical.dueDate')}</label>
                  <input id="due-date" className="input" type="date" min={todayStr} value={draft.pregnancy.dueDate ?? ''} onChange={(e) => set({ pregnancy: { dueDate: e.target.value || null } })} />
                  <p className="hint" style={{ margin: 0 }}>{t('medical.pregnancyHint')}</p>
                </>
              )}
            </div>
          )}
        </section>

        {isPet && (
          <section className="card stack" aria-labelledby="pet-health-title">
            <h2 id="pet-health-title" className="section-title" style={{ margin: 0 }}>{t('medical.pet.healthTitle')}</h2>
            <div className="grid-2">
              {petDate('lastRabiesVaccine', t('medical.pet.lastRabiesVaccine'))}
              {petDate('lastSpeciesVaccine', t(`medical.pet.lastSpeciesVaccine.${pet.species}`))}
              {petDate('lastDeworming', t('medical.pet.lastDeworming'))}
              {petDate('lastFleaTreatment', t('medical.pet.lastFleaTreatment'))}
            </div>
            <div className="field">
              <label htmlFor="neutered">{t('medical.pet.neutered')}</label>
              <select
                id="neutered"
                className="select"
                value={pet.neutered === null ? '' : pet.neutered ? 'yes' : 'no'}
                onChange={(e) => setPet({ neutered: e.target.value === '' ? null : e.target.value === 'yes' })}
              >
                <option value="">{t('medical.unknown')}</option>
                <option value="yes">{t('medical.pet.yes')}</option>
                <option value="no">{t('medical.pet.no')}</option>
              </select>
            </div>
          </section>
        )}

        <section className="card stack">
          <h2 className="section-title" style={{ margin: 0 }}>{t('medical.medications')}</h2>
          {draft.medications.length === 0 && <p className="hint">{t('medical.noMedications')}</p>}
          {draft.medications.map((m, i) => {
            const times = medTimes(m.everyHours, m.firstTime);
            if (!openMeds.has(i) && m.name.trim()) {
              return (
                <div key={i} className="med-line" data-testid="med-line">
                  <span className="med-line-text">{medLine(m, t)}</span>
                  <button className="icon-btn" type="button" onClick={() => setOpenMeds((s) => new Set(s).add(i))} aria-label={t('medical.editMedication', { name: m.name })}>
                    <Pencil size={16} />
                  </button>
                  <button className="icon-btn" type="button" onClick={() => removeMed(i)} aria-label={t('medical.removeMedication')} title={t('medical.removeMedication')}>
                    <X size={16} />
                  </button>
                </div>
              );
            }
            return (
              <fieldset key={i} className="fieldset med-row">
                <legend>{t('medical.medicationN', { n: i + 1 })}</legend>
                <div className="med-head">
                  <input className="input" aria-label={t('medical.medName')} placeholder={t('medical.medName')} value={m.name} onChange={(e) => setMed(i, { name: e.target.value })} />
                  <input className="input" aria-label={t('medical.medDose')} placeholder={t('medical.medDosePlaceholder')} value={m.dose} onChange={(e) => setMed(i, { dose: e.target.value })} />
                  <button className="icon-btn" type="button" onClick={() => removeMed(i)} aria-label={t('medical.removeMedication')} title={t('medical.removeMedication')}>
                    <X size={18} />
                  </button>
                </div>
                <div className="grid-2">
                  <select
                    className="select"
                    aria-label={t('medical.medEvery')}
                    value={m.everyHours ?? ''}
                    onChange={(e) => setMed(i, { everyHours: e.target.value === '' ? null : Number(e.target.value) })}
                  >
                    <option value="">{t('medical.medEveryUnset')}</option>
                    {MED_FREQUENCIES.map((h) => (
                      <option key={h} value={h}>
                        {t(`medical.freq.${h}`)}
                      </option>
                    ))}
                  </select>
                  {!!m.everyHours && (
                    <label className="med-first">
                      <span>{t('medical.medFirstTime')}</span>
                      <input className="input" type="time" value={m.firstTime ?? ''} onChange={(e) => setMed(i, { firstTime: e.target.value || null })} />
                    </label>
                  )}
                </div>
                {times.length > 0 && (
                  <p className="hint med-times" data-testid="med-times" style={{ margin: 0 }}>
                    {t('medical.medTimes', { times: times.join(' · ') })}
                  </p>
                )}
                <input className="input" aria-label={t('medical.medSchedule')} placeholder={t('medical.medSchedulePlaceholder')} value={m.schedule} onChange={(e) => setMed(i, { schedule: e.target.value })} />
                {m.name.trim() && (
                  <div className="row-end">
                    <button className="btn" type="button" onClick={() => setOpenMeds((s) => new Set([...s].filter((j) => j !== i)))}>
                      <Check size={16} /> {t('medical.medDone')}
                    </button>
                  </div>
                )}
              </fieldset>
            );
          })}
          <div className="row-end">
            <button className="btn" type="button" onClick={addMed}>
              <Plus size={18} /> {t('medical.addMedication')}
            </button>
          </div>
        </section>

        <section className="card stack">
          <h2 className="section-title" style={{ margin: 0 }}>{t('medical.emergencyContacts')}</h2>
          {contacts.length === 0 && <p className="hint" style={{ margin: 0 }}>{t('medical.noEmergencyContacts')}</p>}
          {contacts.map((c, i) => (
            <div key={i} className="ec-row" data-testid="emergency-contact-row">
              <select
                className="select"
                aria-label={t('medical.emergencyContactN', { n: i + 1 })}
                value={c.profileId ?? ''}
                onChange={(e) => setContact(i, { profileId: e.target.value || null })}
              >
                <option value="">{t('medical.emergencyContactOther')}</option>
                {others.map((p) => (
                  <option key={p.id} value={p.id}>
                    {[p.name, p.relationship && `(${p.relationship})`].filter(Boolean).join(' ')}
                  </option>
                ))}
              </select>
              {c.profileId ? (
                allProfiles.get(c.profileId)?.phone ? (
                  <span className="ec-phone">
                    <PhoneActions phone={allProfiles.get(c.profileId)!.phone!} />
                  </span>
                ) : (
                  <span className="hint ec-phone">{t('medical.emergencyContactNoPhone')}</span>
                )
              ) : (
                <input
                  className="input"
                  aria-label={t('medical.emergencyContactText', { n: i + 1 })}
                  placeholder={t('medical.emergencyContactPlaceholder')}
                  value={c.text}
                  onChange={(e) => setContact(i, { text: e.target.value })}
                />
              )}
              {!c.profileId && phoneIn(c.text) && (
                <span className="ec-phone">
                  <PhoneActions phone={phoneIn(c.text)!} />
                </span>
              )}
              <button className="icon-btn" type="button" onClick={() => set({ emergencyContacts: contacts.filter((_, j) => j !== i) })} aria-label={t('medical.removeEmergencyContact')}>
                <X size={16} />
              </button>
            </div>
          ))}
          <div className="row-end">
            <button className="btn" type="button" onClick={() => set({ emergencyContacts: [...contacts, { profileId: others[0]?.id ?? null, text: '' }] })}>
              <Plus size={18} /> {t('medical.addEmergencyContact')}
            </button>
          </div>
        </section>

        <section className="card stack" aria-labelledby="doctors-title">
          <h2 id="doctors-title" className="section-title" style={{ margin: 0 }}>{label('doctors.title')}</h2>
          {doctors.length === 0 && <p className="hint" style={{ margin: 0 }}>{label('doctors.empty')}</p>}
          <datalist id="doctor-roles">
            {(t(isPet ? 'medical.pet.doctors.roles' : 'medical.doctors.roles', { returnObjects: true }) as string[]).map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
          {doctors.map((d, i) => {
            const shared = sharedWith(d.contactId);
            if (!openDoctors.has(i) && (d.name.trim() || d.phone.trim())) {
              const live = liveDoctor(d);
              return (
                <div key={i} className="med-line" data-testid="doctor-line">
                  <span className="med-line-text">{doctorLabel(live)}</span>
                  {live.phone && <PhoneActions phone={live.phone} />}
                  <button className="icon-btn" type="button" onClick={() => openDoctor(i)} aria-label={t('medical.doctors.edit', { name: live.name })}>
                    <Pencil size={16} />
                  </button>
                  <button className="icon-btn" type="button" onClick={() => removeDoctor(i)} aria-label={label('doctors.remove')}>
                    <X size={16} />
                  </button>
                </div>
              );
            }
            return (
              <fieldset key={i} className="fieldset doctor-row" data-testid="doctor-row">
                <legend>{t(isPet ? 'medical.pet.doctors.n' : 'medical.doctors.n', { n: i + 1 })}</legend>
                {/* Elegir uno ya cargado solo al agregar: en uno guardado reemplazaría al médico sin querer. */}
                {addedDoctors.has(i) && professionals.length > 0 && (
                  <select className="select doctor-pick" aria-label={label('doctors.pick')} value={d.contactId ?? ''} onChange={(e) => pickDoctor(i, e.target.value)}>
                    <option value="">{label('doctors.new')}</option>
                    {professionals.map((c) => (
                      <option key={c.id} value={c.id}>
                        {[c.name, c.specialty && `(${c.specialty})`].filter(Boolean).join(' ')}
                      </option>
                    ))}
                  </select>
                )}
                <input className="input" list="doctor-roles" aria-label={t('medical.doctors.role')} placeholder={label('doctors.rolePlaceholder')} value={d.role} onChange={(e) => setDoctor(i, { role: e.target.value })} />
                <input className="input" aria-label={label('doctors.name')} placeholder={label('doctors.name')} value={d.name} onChange={(e) => setDoctor(i, { name: e.target.value })} />
                <input className="input" type="tel" inputMode="tel" aria-label={t('medical.doctors.phone')} placeholder={t('medical.doctors.phone')} value={d.phone} onChange={(e) => setDoctor(i, { phone: e.target.value })} />
                <button className="icon-btn" type="button" onClick={() => removeDoctor(i)} aria-label={label('doctors.remove')}>
                  <X size={16} />
                </button>
                {shared.length > 0 && (
                  <p className="hint doctor-shared" style={{ margin: 0 }}>
                    {t('medical.doctors.shared', { names: shared.join(', ') })}
                  </p>
                )}
                {(d.name.trim() || d.phone.trim()) && (
                  <div className="row-end doctor-done">
                    <button className="btn" type="button" onClick={() => setOpenDoctors((s) => new Set([...s].filter((j) => j !== i)))}>
                      <Check size={16} /> {t('medical.medDone')}
                    </button>
                  </div>
                )}
              </fieldset>
            );
          })}
          <div className="row-end">
            <button className="btn" type="button" onClick={addDoctor}>
              <Plus size={18} /> {label('doctors.add')}
            </button>
          </div>
        </section>

        {!isPet && (
          <section className="card stack" aria-labelledby="insurance-title">
            <h2 id="insurance-title" className="section-title" style={{ margin: 0 }}>{t('medical.insurance.title')}</h2>
            {insurers.length > 0 && (
              <div className="field">
                <label htmlFor="ins-pick">{t('medical.insurance.pick')}</label>
                <select id="ins-pick" className="select" value={insurance.contactId ?? ''} onChange={(e) => pickInsurer(e.target.value)}>
                  <option value="">{t('medical.insurance.other')}</option>
                  {insurers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {insuranceShared.length > 0 && (
              <p className="hint" style={{ margin: 0 }} data-testid="insurance-shared">
                {t('medical.insurance.shared', { names: insuranceShared.join(', ') })}
              </p>
            )}
            <div className="grid-2">
              <div className="field">
                <label htmlFor="ins-name">{t('medical.insurance.name')}</label>
                <input
                  id="ins-name"
                  className="input"
                  list="insurer-names"
                  value={insurance.name}
                  onChange={(e) => setInsurance({ name: e.target.value })}
                  placeholder={t('medical.insurance.namePlaceholder')}
                />
                <datalist id="insurer-names" data-testid="insurer-names">
                  {insurerNames.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </div>
              <div className="field">
                <label htmlFor="ins-plan">{t('medical.insurance.plan')}</label>
                <input id="ins-plan" className="input" value={insurance.plan} onChange={(e) => setInsurance({ plan: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="ins-member">{t('medical.insurance.memberNumber')}</label>
                <input id="ins-member" className="input" value={insurance.memberNumber} onChange={(e) => setInsurance({ memberNumber: e.target.value })} />
              </div>
            </div>
            {!editInsPhones && insPhones.some((p) => p.number.trim()) ? (
              <>
                <h3 className="contact-group-title">{t('medical.insurance.phones')}</h3>
                {insPhones.map((p, i) => (
                  <div key={i} className="med-line" data-testid="insurance-phone-line">
                    <span className="med-line-text">{p.label || t('medical.insurance.emergencyPhone')}</span>
                    <PhoneActions phone={p.number} />
                  </div>
                ))}
                <div className="row-end">
                  <button className="btn" type="button" onClick={() => setEditInsPhones(true)}>
                    <Pencil size={16} /> {t('medical.insurance.editPhones')}
                  </button>
                </div>
              </>
            ) : (
              <InsurancePhonesEditor
                phones={insPhones}
                onChange={(phones) => {
                  setEditInsPhones(true);
                  setInsurance({ phones });
                }}
              />
            )}
          </section>
        )}

        <section className="card stack">
          {text('notes')}
        </section>

        {saved && <p className="success" role="status">{t('common.saved')}</p>}
        <div className="row-end">
          {!isNew && (
            <button className="btn btn-danger-outline" type="button" onClick={handleDelete}>
              <Trash2 size={18} /> {t('common.delete')}
            </button>
          )}
          <button className="btn btn-primary" type="submit">
            {t('common.save')}
          </button>
        </div>
      </form>
    </div>
  );
}
