import { useTranslation } from 'react-i18next';
import { Phone } from 'lucide-react';
import type { EmergencyCard, EmergencyCardPhone } from '@/core/security/emergencyCard';
import { dialable, NATIONAL_NUMBERS } from '@/modules/emergency/national';
import { useCurrentCountry } from '@/modules/emergency/currentCountry';

/** Un teléfono que se toca para llamar. */
function Call({ item }: { item: EmergencyCardPhone }) {
  // Un contacto escrito a mano ya trae el teléfono en el texto ("Juan (hermano) 11 5555-1234"): no se repite.
  const label = item.phone ? item.label.replace(item.phone, '').trim() : item.label;
  return (
    <li>
      {label}
      {item.phone && (
        <>
          {label ? ' ' : ''}
          <a href={`tel:${dialable(item.phone)}`}>{item.phone}</a>
        </>
      )}
    </li>
  );
}

/**
 * Datos de emergencia en la pantalla de bloqueo: los números nacionales del
 * país y, de cada persona, grupo sanguíneo, alergias, enfermedades,
 * medicación, a quién avisar, médicos y obra social. Solo lectura.
 */
export function EmergencyCardView({ card }: { card: EmergencyCard | null }) {
  const { t, i18n } = useTranslation();
  // Los primeros números del país donde estás (el detectado con la última ubicación; si no hay, el de Ajustes): emergencias, ambulancia, bomberos.
  const { here: country } = useCurrentCountry();
  const national = NATIONAL_NUMBERS[country].slice(0, 3);

  return (
    <div className="stack" data-testid="emergency-card">
      <ul className="list">
        {national.map((n) => (
          <li key={n.id}>
            <a className="list-row" href={`tel:${dialable(n.number)}`}>
              <Phone size={20} aria-hidden style={{ color: 'var(--danger)' }} />
              <span className="list-main">
                <span className="list-title">{n.number}</span>
                <span className="list-sub">{t(`emergency.national.${n.id}.name`)}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
      {!card || card.people.length === 0 ? (
        <p className="hint">{t('lockCard.empty')}</p>
      ) : (
        card.people.map((p, i) => (
          <section key={i} className="card stack" aria-label={p.name}>
            <h3 style={{ margin: 0 }}>
              {p.name}
              {(p.relationship || p.age !== null) && (
                <span className="hint" style={{ fontWeight: 'normal' }}>
                  {' '}
                  · {[p.relationship, p.age !== null && t('medical.age', { count: p.age })].filter(Boolean).join(' · ')}
                </span>
              )}
            </h3>
            <dl className="lock-card-fields">
              {p.bloodType && (
                <>
                  <dt>{t('medical.bloodType')}</dt>
                  <dd>
                    <strong>{p.bloodType}</strong>
                  </dd>
                </>
              )}
              {p.allergies && (
                <>
                  <dt>{t('medical.allergies')}</dt>
                  <dd>{p.allergies}</dd>
                </>
              )}
              {p.conditions && (
                <>
                  <dt>{t('medical.conditions')}</dt>
                  <dd>{p.conditions}</dd>
                </>
              )}
              {p.pregnancy && (
                <>
                  <dt>{t('medical.pregnancy')}</dt>
                  <dd data-testid="lock-card-pregnancy">{p.pregnancy}</dd>
                </>
              )}
              {p.medications.length > 0 && (
                <>
                  <dt>{t('medical.medications')}</dt>
                  <dd>
                    <ul>{p.medications.map((m, j) => <li key={j}>{m}</li>)}</ul>
                  </dd>
                </>
              )}
              {p.contacts.length > 0 && (
                <>
                  <dt>{t('medical.emergencyContacts')}</dt>
                  <dd>
                    <ul>{p.contacts.map((c, j) => <Call key={j} item={c} />)}</ul>
                  </dd>
                </>
              )}
              {p.doctors.length > 0 && (
                <>
                  <dt>{t('medical.doctors.title')}</dt>
                  <dd>
                    <ul>{p.doctors.map((c, j) => <Call key={j} item={c} />)}</ul>
                  </dd>
                </>
              )}
              {(p.insurance || p.insurancePhones.length > 0) && (
                <>
                  <dt>{t('medical.insurance.title')}</dt>
                  <dd>
                    {p.insurance}
                    {p.insurancePhones.length > 0 && <ul>{p.insurancePhones.map((c, j) => <Call key={j} item={c} />)}</ul>}
                  </dd>
                </>
              )}
            </dl>
          </section>
        ))
      )}
      {card && (
        <p className="hint" style={{ margin: 0 }}>
          {t('lockCard.updated', { date: new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(card.updatedAt)) })}
        </p>
      )}
    </div>
  );
}
