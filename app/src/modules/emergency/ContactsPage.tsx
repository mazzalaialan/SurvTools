import { pregnancyText } from '@/modules/firstAid/emergencyCard';
import { Fragment, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Pencil, Plus, Search, Stethoscope, User } from 'lucide-react';
import { ageOn, useMedical } from '@/modules/firstAid/medicalStore';
import { doctorLabel, doctorUses, fichaContacts, insurancePhones, medScheduleText, resolveEmergencyContacts } from '@/modules/firstAid/medText';
import { today } from '@/modules/inventory/domain/dates';
import type { Country } from '@/core/settings/settings';
import { CountrySwitch } from './CountrySwitch';
import { useCountry } from './currentCountry';
import { NATIONAL_NUMBERS } from './national';
import { KindIcon, MapLink, PhoneActions } from './parts';
import { useContacts } from './store';
import type { ContactKind, EmergencyContact as Contact } from '@/core/model/types';

/**
 * Servicios (lo que trae "Buscar cercanos" o se carga a mano): van en su propia sección.
 * El veterinario queda en "mis contactos": suele ser el de la familia.
 */
const SERVICE_KINDS: ContactKind[] = ['police', 'fire', 'medical', 'hospital', 'civilDefense', 'pharmacy', 'aed', 'fuel', 'tyres', 'carRepair', 'water', 'shelter', 'atm'];
export const isService = (c: Pick<Contact, 'kind'>) => SERVICE_KINDS.includes(c.kind);

export function ContactsPage() {
  const { t, i18n } = useTranslation();
  const contacts = useContacts((s) => s.contacts);
  // Las frecuencias de radio se ven en Radio; los servicios de emergencia, en su sección.
  const saved = useMemo(
    () => [...contacts.values()].filter((c) => c.kind !== 'radio').sort((a, b) => a.name.localeCompare(b.name, i18n.language)),
    [contacts, i18n.language],
  );
  const services = saved.filter(isService);
  const mine = saved.filter((c) => !isService(c));
  // Médicos compartidos: en qué fichas están ("Pediatra de Tomi").
  const profiles = useMedical((s) => s.profiles);
  const uses = useMemo(() => doctorUses(profiles, t), [profiles, t]);
  const country = useCountry();

  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="page-title" style={{ flex: 1 }}>{t('modules.contacts.title')}</h1>
      </div>

      <MyDataSection />

      <section className="card stack" aria-labelledby="national-title">
        <h2 id="national-title" className="section-title" style={{ margin: 0 }}>{t('emergency.nationalTitle')}</h2>
        {/* Los números son los del país elegido (el selector de acá abajo es el mismo de Ajustes). Si el GPS detecta otro país, la app pregunta si querés cambiarlo. */}
        <NationalList country={country} />
        <p className="hint" style={{ margin: 0 }}>{t('emergency.countrySwitchHint')}</p>
        <CountrySwitch />
      </section>

      <section className="card stack" aria-labelledby="services-title">
        <h2 id="services-title" className="section-title" style={{ margin: 0 }}>{t('emergency.servicesTitle')}</h2>
        {services.length === 0 ? (
          <p className="hint" style={{ margin: 0 }}>{t('emergency.servicesEmpty')}</p>
        ) : (
          <SavedContacts contacts={services} uses={uses} testId="my-services" />
        )}
        <div className="row-end wrap">
          <Link className="btn btn-primary" to="/first-aid/contacts/nearby">
            <Search size={18} /> {t('emergency.searchNearby')}
          </Link>
        </div>
      </section>

      <section className="card stack" aria-labelledby="mine-title">
        <h2 id="mine-title" className="section-title" style={{ margin: 0 }}>{t('emergency.mineTitle')}</h2>
        <div className="row-end wrap">
          <Link className="btn btn-primary" to="/first-aid/contacts/new">
            <Plus size={20} /> {t('emergency.newContact')}
          </Link>
        </div>
        <FamilyGroup />
        <FichaContactsGroup />
        {mine.length === 0 ? (
          <p className="empty" style={{ margin: 0 }}>{t('emergency.noContacts')}</p>
        ) : (
          <>
            <h3 className="contact-group-title">{t('emergency.savedTitle')}</h3>
            <SavedContacts contacts={mine} uses={uses} testId="my-contacts" />
          </>
        )}
      </section>
    </div>
  );
}

/** Contactos guardados: nombre, tipo, dirección, notas, teléfonos y editar. */
function SavedContacts({ contacts, uses, testId }: { contacts: Contact[]; uses: Map<string, string[]>; testId: string }) {
  const { t } = useTranslation();
  return (
    <ul className="list contact-list" data-testid={testId}>
      {contacts.map((c) => (
        <li key={c.id} className="contact-row">
          <KindIcon kind={c.kind} />
          <span className="list-main">
            <span className="list-title">{c.name}</span>
            <span className="list-sub">{[t(`emergency.kind.${c.kind}`), c.specialty, ...(uses.get(c.id) ?? [])].filter(Boolean).join(' · ')}</span>
            <MapLink address={c.address} lat={c.lat} lon={c.lon} />
            {c.notes && <span className="list-sub">{c.notes}</span>}
          </span>
          <span className="contact-actions">
            {c.phones?.length ? (
              // Obra social: cada teléfono con su nombre ("Riesgo de vida", "Emergencias").
              c.phones.map((p, i) => (
                <span key={i} className="labeled-phone" data-testid="saved-insurance-phone">
                  <span className="hint">{p.label || t('medical.insurance.emergencyPhone')}</span>
                  <PhoneActions phone={p.number} />
                </span>
              ))
            ) : (
              <PhoneActions phone={c.phone} />
            )}
            {c.phone2 && <PhoneActions phone={c.phone2} />}
            <Link className="icon-btn" to={`/first-aid/contacts/${c.id}`} aria-label={t('emergency.editContact', { name: c.name })}>
              <Pencil size={18} />
            </Link>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Médicos, veterinarios y contactos de emergencia escritos en las fichas médicas. */
function FichaContactsGroup() {
  const { t } = useTranslation();
  const profiles = useMedical((s) => s.profiles);
  const items = useMemo(() => fichaContacts(profiles, t), [profiles, t]);
  if (items.length === 0) return null;
  return (
    <>
      <h3 className="contact-group-title">{t('emergency.fichaContactsTitle')}</h3>
      <ul className="list contact-list" data-testid="ficha-contacts">
        {items.map((c) => (
          <li key={c.phone} className="contact-row">
            <Stethoscope size={22} aria-hidden className="contact-icon" />
            <span className="list-main">
              <span className="list-title">{c.text}</span>
              <span className="list-sub">{c.roles.join(' · ')}</span>
            </span>
            <PhoneActions phone={c.phone} />
          </li>
        ))}
      </ul>
    </>
  );
}

/** Mi ficha ("Soy yo"): lo que necesita saber quien me asiste, arriba de todo. */
function MyDataSection() {
  const { t } = useTranslation();
  const profiles = useMedical((s) => s.profiles);
  const me = useMemo(() => [...profiles.values()].find((p) => p.kind === 'person' && p.isMe), [profiles]);
  const savedContacts = useContacts((s) => s.contacts);
  const loaded = useMedical((s) => s.loaded);
  if (!loaded) return null;
  if (!me) {
    return (
      <p className="hint" data-testid="my-data-missing">
        {t('emergency.myDataMissing')} <Link to="/first-aid/medical">{t('emergency.myDataGo')}</Link>
      </p>
    );
  }
  const age = me.birthDate ? ageOn(me.birthDate, today()) : null;
  const contacts = resolveEmergencyContacts(me, profiles);
  const rows: [string, string][] = [
    [t('medical.bloodType'), me.bloodType],
    [t('medical.allergies'), me.allergies],
    [t('medical.conditions'), me.conditions],
    [t('medical.pregnancy'), pregnancyText(me, t)],
  ];
  // Obra social compartida: nombre y teléfonos actuales del contacto.
  const insContact = me.insurance?.contactId ? savedContacts.get(me.insurance.contactId) : undefined;
  const ins = me.insurance && insContact ? { ...me.insurance, name: insContact.name, phones: insContact.phones ?? [] } : me.insurance;
  const insPhones = insurancePhones(ins);
  const insuranceText = ins
    ? [ins.name, ins.plan && t('medical.insurance.planShort', { plan: ins.plan }), ins.memberNumber && t('medical.insurance.memberShort', { n: ins.memberNumber })].filter(Boolean).join(' · ')
    : '';
  return (
    <section className="card stack my-data" aria-labelledby="my-data-title" data-testid="my-data">
      <div className="row-between">
        <h2 id="my-data-title" className="section-title" style={{ margin: 0 }}>{t('emergency.myDataTitle')}</h2>
        <Link className="icon-btn" to={`/first-aid/medical/${me.id}`} aria-label={t('emergency.openMedical', { name: me.name })}>
          <Pencil size={18} />
        </Link>
      </div>
      <p className="my-data-name">
        <strong>{me.name}</strong>
        {age !== null && ` · ${t('medical.age', { count: age })}`}
      </p>
      <dl className="my-data-list">
        {rows
          .filter(([, value]) => value.trim())
          .map(([label, value]) => (
            <Fragment key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </Fragment>
          ))}
        {me.medications.length > 0 && (
          <>
            <dt>{t('medical.medications')}</dt>
            <dd>
              <ul className="my-data-meds">
                {me.medications.map((m, i) => (
                  <li key={i}>
                    <strong>{[m.name, m.dose].filter(Boolean).join(' ')}</strong>
                    {[medScheduleText(m, t), m.schedule].filter(Boolean).map((s) => ` · ${s}`)}
                  </li>
                ))}
              </ul>
            </dd>
          </>
        )}
        {(me.doctors ?? []).length > 0 && (
          <>
            <dt>{t('medical.doctors.title')}</dt>
            {me.doctors!.map((d, i) => {
              // Compartido: los datos actuales están en el contacto.
              const live = d.contactId ? savedContacts.get(d.contactId) : undefined;
              const doctor = live ? { ...d, name: live.name, phone: live.phone } : d;
              return (
                <dd key={i}>
                  {doctorLabel(doctor)}
                  {doctor.phone && <PhoneActions phone={doctor.phone} />}
                </dd>
              );
            })}
          </>
        )}
        {(insuranceText || insPhones.length > 0) && (
          <>
            <dt>{t('medical.insurance.title')}</dt>
            {insuranceText && <dd data-testid="my-insurance">{insuranceText}</dd>}
            {insPhones.map((p, i) => (
              <dd key={i} data-testid="my-insurance-phone">
                {p.label || t('medical.insurance.emergencyPhone')}
                <PhoneActions phone={p.number} />
              </dd>
            ))}
          </>
        )}
        {contacts.length > 0 && (
          <>
            <dt>{t('medical.emergencyContacts')}</dt>
            {contacts.map((c, i) => (
              <dd key={i} data-testid="my-emergency-contact">
                {c.label}
                {c.phone && <PhoneActions phone={c.phone} />}
              </dd>
            ))}
          </>
        )}
      </dl>
    </section>
  );
}

/** Mayor de edad: a quién tiene sentido llamar en una emergencia. */
const ADULT_AGE = 18;

/** Personas de las fichas médicas, de mayor a menor edad, con su parentesco. */
function FamilyGroup() {
  const { t, i18n } = useTranslation();
  const profiles = useMedical((s) => s.profiles);
  const todayStr = today();
  const people = useMemo(
    () =>
      [...profiles.values()]
        .filter((p) => p.kind === 'person' && p.inContacts !== false && !p.isMe)
        .map((p) => ({ p, age: p.birthDate ? ageOn(p.birthDate, todayStr) : null }))
        // Sin fecha de nacimiento, entre los adultos y los menores (no se sabe).
        .sort((a, b) => (b.age ?? ADULT_AGE - 0.5) - (a.age ?? ADULT_AGE - 0.5) || a.p.name.localeCompare(b.p.name, i18n.language)),
    [profiles, todayStr, i18n.language],
  );
  if (people.length === 0) return null;

  return (
    <>
      <h3 className="contact-group-title">{t('emergency.familyTitle')}</h3>
      <ul className="list contact-list" data-testid="family-contacts">
        {people.map(({ p, age }) => {
          const minor = age !== null && age < ADULT_AGE;
          return (
            <li key={p.id} className="contact-row" data-minor={minor}>
              <User size={22} aria-hidden className="contact-icon" />
              <span className="list-main">
                <span className="list-title">{p.name}</span>
                <span className="list-sub">
                  {[p.relationship, age !== null ? t('medical.age', { count: age }) : null, minor ? t('emergency.minor') : null].filter(Boolean).join(' · ')}
                </span>
                {!p.phone && <span className="list-sub">{t('emergency.familyNoPhone')}</span>}
              </span>
              <span className="contact-actions">
                {p.phone && <PhoneActions phone={p.phone} />}
                <Link className="icon-btn" to={`/first-aid/medical/${p.id}`} aria-label={t('emergency.openMedical', { name: p.name })}>
                  <Pencil size={18} />
                </Link>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="hint" style={{ margin: 0 }}>{t('emergency.familyHint')}</p>
    </>
  );
}

/** Los números nacionales de un país. `home`: el de Ajustes cuando no es donde estás (ids aparte para distinguirlos). */
function NationalList({ country, home = false }: { country: Country; home?: boolean }) {
  const { t } = useTranslation();
  const tag = home ? 'home-' : '';
  return (
    <>
      <ul className={`list contact-list${home ? ' contact-list-home' : ''}`} data-testid={home ? 'national-numbers-home' : 'national-numbers'}>
        {NATIONAL_NUMBERS[country].map((n) => (
          <li key={n.id} className="contact-row" data-testid={`national-${tag}${n.id}`}>
            <KindIcon kind={n.kind} />
            <span className="list-main">
              <span className="list-title">{t(`emergency.national.${n.id}.name`)}</span>
              <span className="list-sub">{t(`emergency.national.${n.id}.desc`)}</span>
              {n.unconfirmed && (
                <span className="list-sub national-unconfirmed" data-testid={`unconfirmed-${tag}${n.id}`}>
                  {t('emergency.unconfirmed')}{' '}
                  <Link to={`/about?tipo=bug&texto=${encodeURIComponent(t('emergency.unconfirmedReport', { name: t(`emergency.national.${n.id}.name`), number: n.number }))}`}>
                    {t('emergency.unconfirmedLink')}
                  </Link>
                </span>
              )}
            </span>
            <PhoneActions phone={n.number} />
          </li>
        ))}
      </ul>
      <p className="hint" style={{ margin: 0 }}>{t(`emergency.localNote${country}`)}</p>
    </>
  );
}
