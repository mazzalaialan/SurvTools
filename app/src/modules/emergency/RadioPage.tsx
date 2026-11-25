import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Flag, Pencil, Plus, Radio, RadioTower, Trash2, Upload } from 'lucide-react';
import { distanceMeters } from '@/core/geo/geo';
import { usePlacePicker } from '@/modules/waypoints/PlacePicker';
import type { Country } from '@/core/settings/settings';
import { loadCountryData } from './country';
import { useCountry } from './currentCountry';
import { usePlaceCountries } from './usePlaceCountry';
import { distanceToPark, loadParks, nearestRadio, parkCountry, type EmergencyData, type ParksData } from './data';
import { CopyButton, formatDistance, MapLink, ParkRadioList, PhoneActions } from './parts';
import { distanceToCountry, loadBorders, type BordersData } from './borders';
import { loadOfficialRepeaters, officialFor, withoutDuplicates, type OfficialRepeaterList } from './officialRepeaters';
import { loadRepeaters, locateRepeaters, mergeRepeaters, parseRepeaterFile, repeaterSummary, saveRepeaters, type Repeater, type RepeaterList } from './repeaters';
import { useContacts } from './store';
import { confirmAction } from '@/ui/confirm';
import { DismissNoticeButton, Notice, useNotice } from '@/ui/Notice';

/**
 * Radio en una emergencia: la emisora de Radio Nacional más cercana (para
 * informarse con una radio a pilas) y las frecuencias internacionales de
 * socorro, las de montaña y, dentro de un parque nacional, las que ese parque
 * publica. Las de guardaparques, CONAF y un radioclub van marcadas "solo si
 * tu vida depende de eso". No incluye las de Gendarmería ni policía: no son
 * públicas y muchas están cifradas.
 */
/**
 * Banda de una frecuencia («VHF», «UHF», «HF», «onda media») y modo cuando se sabe (FM, AM, BLU). La banda sale del número; el modo, de
 * la frecuencia: la aeronáutica de 121,5 MHz es AM, el socorro marítimo en onda media y corta es BLU, y el resto de VHF/UHF de voz, FM.
 */
export function bandOf(freq: string): { band: string; mode?: string } | null {
  const m = freq.replace(',', '.').match(/([\d.]+)\s*(k|M)Hz/i);
  if (!m) return null;
  const mhz = Number(m[1]) / (m[2]!.toLowerCase() === 'k' ? 1000 : 1);
  if (!Number.isFinite(mhz)) return null;
  if (mhz >= 300) return { band: 'UHF', mode: 'FM' };
  if (mhz >= 30) return { band: 'VHF', mode: mhz >= 108 && mhz < 137 ? 'AM' : 'FM' };
  if (mhz >= 3) return { band: 'HF', mode: Math.abs(mhz - 4.125) < 0.001 ? 'BLU' : undefined };
  if (mhz >= 0.3) return { band: 'MF', mode: Math.abs(mhz - 2.182) < 0.001 ? 'BLU' : undefined };
  return null;
}

/** Etiqueta chica con la banda y el modo, al lado de la frecuencia. */
function FreqBand({ freq }: { freq: string }) {
  const { t } = useTranslation();
  const b = bandOf(freq);
  if (!b) return null;
  return (
    <span className="radio-band" title={t(`radio.band.${b.band}`)}>
      {b.band}
      {b.mode ? ` · ${b.mode}` : ''}
    </span>
  );
}

const DISTRESS = [
  { id: 'marine', freq: '156,800 MHz' },
  // Socorro marítimo por voz en onda media y corta (BLU), para barcos lejos de la costa donde el VHF no llega (Reglamento de
  // Radiocomunicaciones de la UIT, SMSSM). Hoy pocas estaciones costeras mantienen escucha permanente: el canal 16 sigue primero.
  { id: 'marineMf', freq: '2182 kHz' },
  { id: 'marineHf', freq: '4125 kHz' },
  { id: 'air', freq: '121,500 MHz' },
] as const;

/**
 * Montaña, para Argentina y Chile juntos: en la cordillera se está a pocos km
 * del otro país. Argentina: FEM (Frecuencia de Emergencias en Montaña) y las
 * dos de uso libre de la Resolución 5/2015 (Federación Andinistas Argentinos,
 * 2021). Chile no tiene una frecuencia oficial de montaña: la del Cuerpo de
 * Socorro Andino sale de guías de montaña, sin confirmación oficial.
 */
const MOUNTAIN: { id: string; country: 'AR' | 'CL'; freq: string; emergencyOnly?: boolean }[] = [
  { id: 'fem', country: 'AR', freq: '140,970 MHz' },
  { id: 'free1', country: 'AR', freq: '139,970 MHz' },
  { id: 'free2', country: 'AR', freq: '138,510 MHz' },
  { id: 'csa', country: 'CL', freq: '150,625 MHz' },
  /*
   * De servicios (guardaparques, CONAF) y de un radioclub: no son de uso
   * libre. Se incluyen porque, con la vida en peligro, se puede pedir auxilio
   * por cualquier medio; con aviso de que fuera de eso no se transmite ahí.
   */
  { id: 'rangers', country: 'AR', freq: '142,800 MHz', emergencyOnly: true },
  { id: 'conaf', country: 'CL', freq: '143,950 MHz', emergencyOnly: true },
  { id: 'carabineros', country: 'CL', freq: '146,910 MHz', emergencyOnly: true },
];

/** Hasta qué distancia del borde de un parque se lo considera "donde estás", con todos sus datos. */
const PARK_NEAR_M = 5000;
/**
 * Más allá de esto, las frecuencias de un parque o las de montaña del otro
 * país no sirven: ni se muestran. Se mide desde el lugar elegido arriba (GPS o
 * a mano).
 */
const FAR_M = 50_000;

export function RadioPage() {
  const { t, i18n } = useTranslation();
  const { place, picker } = usePlacePicker();
  // El país es el del lugar elegido, no el de Ajustes: en un lugar de Perú salen las radios, parques y repetidoras de Perú; y a
  // menos de 50 km de la frontera, también las emisoras del país vecino.
  const { country, near } = usePlaceCountries(place);
  const nearKey = near.join(',');
  const [data, setData] = useState<Partial<Record<Country, EmergencyData>>>({});
  const [packageMissing, setPackageMissing] = useState(false);
  useEffect(() => {
    let live = true;
    setPackageMissing(false);
    void Promise.all(
      near.map((c) =>
        loadCountryData(c).then(
          (d) => [c, d.emergency] as const,
          () => [c, null] as const,
        ),
      ),
    ).then((res) => {
      if (!live) return;
      // Sin el paquete del país del lugar (sin conexión y sin bajar) se avisa; el de un vecino que falta simplemente no suma.
      setPackageMissing(res.some(([c, d]) => c === country && d === null));
      setData(Object.fromEntries(res.filter((r): r is readonly [Country, EmergencyData] => r[1] !== null)));
    });
    return () => {
      live = false;
    };
  }, [nearKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // Argentina: "Radio Nacional"; los demás países, con su título y su aclaración.
  const radioKey = (key: 'nacionalTitle') => (country === 'AR' ? `radio.${key}` : `radio.${key}${country}`);
  // Las más cercanas del país del lugar y de los países vecinos a menos de 50 km de su frontera: siempre la más cercana de cada país
  // (aunque del otro lado queden más lejos que las tres de este) y el resto hasta tres, por distancia.
  const stations = useMemo(() => {
    if (!place) return [];
    const perCountry = near.flatMap((c) => (data[c] ? [nearestRadio(data[c]!, place.lat, place.lon).map((s) => ({ ...s, country: c }))] : []));
    const first = perCountry.flatMap((l) => (l[0] ? [l[0]] : []));
    const rest = perCountry.flat().filter((s) => !first.includes(s)).sort((x, y) => x.distance - y.distance);
    return [...first, ...rest].slice(0, Math.max(3, first.length)).sort((x, y) => x.distance - y.distance);
  }, [data, nearKey, place?.lat, place?.lon]); // eslint-disable-line react-hooks/exhaustive-deps
  const several = near.length > 1 && new Set(stations.map((s) => s.country)).size > 1;
  const fm = new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const contacts = useContacts((s) => s.contacts);
  // Mis frecuencias: las que tienen lugar, de la más cercana a la más lejana; después el resto por nombre.
  const mine = useMemo(() => {
    const list = [...contacts.values()].filter((c) => c.kind === 'radio');
    const dist = (c: (typeof list)[number]) => (place && c.lat !== null && c.lon !== null ? distanceMeters(place, { lat: c.lat, lon: c.lon }) : null);
    return list
      .map((c) => ({ c, d: dist(c) }))
      .sort((a, b) => (a.d ?? Infinity) - (b.d ?? Infinity) || a.c.name.localeCompare(b.c.name, i18n.language));
  }, [contacts, place?.lat, place?.lon, i18n.language]);

  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="page-title" style={{ flex: 1 }}>{t('modules.radio.title')}</h1>
      </div>
      {/* Un solo lugar para todo: tus frecuencias, las repetidoras y las emisoras se ordenan por cercanía a él. */}
      {picker}

      <section className="card stack" aria-labelledby="mine-freq-title">
        <h2 id="mine-freq-title" className="section-title" style={{ margin: 0 }}>{t('radio.mineTitle')}</h2>
        {mine.length === 0 ? (
          <p className="hint" style={{ margin: 0 }}>{t('radio.mineEmpty')}</p>
        ) : (
          <ul className="list" data-testid="my-frequencies">
            {mine.map(({ c, d }) => (
              <li key={c.id} className="contact-row">
                <Radio size={22} aria-hidden className="contact-icon" />
                <span className="list-main">
                  <span className="list-title">{c.name}</span>
                  <span className="list-sub">{[c.tone, d !== null && t('radio.distance', { distance: formatDistance(d, i18n.language) })].filter(Boolean).join(' · ')}</span>
                  {c.notes && <span className="list-sub">{c.notes}</span>}
                  {c.lat !== null && <MapLink address="" lat={c.lat} lon={c.lon} />}
                </span>
                <span className="contact-actions">
                  <strong className="radio-freqs">{c.frequency}</strong>
              <FreqBand freq={c.frequency ?? ''} />
                  <CopyButton text={[c.frequency, c.tone].filter(Boolean).join(' ')} label={t('radio.copyFrequency', { name: c.name })} />
                  <Link className="icon-btn" to={`/first-aid/radio/${c.id}`} aria-label={t('emergency.editContact', { name: c.name })}>
                    <Pencil size={18} />
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link className="btn btn-primary" to="/first-aid/radio/new">
          <Plus size={20} /> {t('radio.newFrequency')}
        </Link>
      </section>

      <section className="card stack" aria-labelledby="rn-title">
        <h2 id="rn-title" className="section-title" style={{ margin: 0 }}>{t(several ? 'radio.nacionalTitleMany' : radioKey('nacionalTitle'))}</h2>
        <p className="hint" style={{ margin: 0 }}>{t('radio.nacionalHint')}</p>
        {packageMissing ? (
          <p className="empty">{t('radio.packageMissing', { country: t(`country.${country}`) })}</p>
        ) : !place ? (
          <p className="empty">{t('emergency.needPlace')}</p>
        ) : (
          <ul className="list" data-testid="radio-stations">
            {stations.map((s, i) => (
              <li key={`${s.call}-${s.city}`} className="contact-row">
                <Radio size={22} aria-hidden className={i === 0 ? 'contact-icon contact-icon-fire' : 'contact-icon'} />
                <span className="list-main">
                  <span className="list-title">
                    {s.call} · {s.city}
                  </span>
                  <span className="list-sub">
                    {[several ? t(`country.${s.country}`) : null, s.province, t('radio.distance', { distance: formatDistance(s.distance, i18n.language) })].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="radio-freqs">
                  {s.am !== null && <strong>AM {s.am}</strong>}
                  {s.fm !== null && <strong>FM {fm.format(s.fm)}</strong>}
                </span>
              </li>
            ))}
          </ul>
        )}
        {(several ? [...new Set(stations.map((s) => s.country))] : [country]).map((c) => (
          <p key={c} className="hint" style={{ margin: 0 }}>{t(c === 'AR' ? 'radio.nacionalNote' : `radio.nacionalNote${c}`)}</p>
        ))}
      </section>

      <section className="card stack" aria-labelledby="distress-title">
        <h2 id="distress-title" className="section-title" style={{ margin: 0 }}>{t('radio.distressTitle')}</h2>
        <ul className="list">
          {DISTRESS.map((d) => (
            <li key={d.id} className="contact-row">
              <span className="list-main">
                <span className="list-title">{t(`radio.distress.${d.id}.name`)}</span>
                <span className="list-sub">{t(`radio.distress.${d.id}.desc`)}</span>
              </span>
              <strong className="radio-freqs">{d.freq}</strong>
              <FreqBand freq={d.freq} />
            </li>
          ))}
        </ul>
        <Notice id="radio.distress">{t('radio.distressNote')}</Notice>
      </section>

      <ParkSection place={place} country={country} />

      {(country === 'AR' || country === 'CL') && <MountainSection place={place} />}

      <RenerSection place={place} />

      <BrazilRadioSection place={place} />

      <RepeatersSection place={place} country={country} />

      <HamSection country={country} />

      <Notice id="radio.security">{t('radio.securityNote')}</Notice>
    </div>
  );
}

/**
 * Frecuencias de montaña: las de cada país, solo si el lugar elegido arriba
 * (GPS o a mano) está en ese país o a menos de 50 km de su frontera: en la
 * cordillera sirven las de los dos lados; en Mendoza capital, las de Chile no.
 * Sin lugar, todas.
 */
function MountainSection({ place }: { place: { lat: number; lon: number } | null }) {
  const { t } = useTranslation();
  const [borders, setBorders] = useState<BordersData | null>(null);
  useEffect(() => {
    void loadBorders().then(setBorders);
  }, []);
  const shown = useMemo(() => {
    if (!place || !borders) return MOUNTAIN;
    const near = { AR: distanceToCountry(borders, 'AR', place.lat, place.lon) <= FAR_M, CL: distanceToCountry(borders, 'CL', place.lat, place.lon) <= FAR_M };
    return MOUNTAIN.filter((m) => near[m.country]);
  }, [borders, place?.lat, place?.lon]);
  if (shown.length === 0) return null;
  const both = shown.some((m) => m.country === 'AR') && shown.some((m) => m.country === 'CL');
  return (
    <section className="card stack" aria-labelledby="mountain-title" data-testid="mountain-frequencies">
      <h2 id="mountain-title" className="section-title" style={{ margin: 0 }}>{t(both ? 'radio.mountainTitle' : 'radio.mountainTitleOne')}</h2>
      <p className="hint" style={{ margin: 0 }}>{both ? `${t('radio.mountainIntroBoth')} ${t('radio.mountainIntro')}` : t('radio.mountainIntro')}</p>
      <ul className="list">
        {shown.map((m) => (
          <li key={m.id} className="contact-row">
            <span className="list-main">
              <span className="list-title">
                {t(`country.${m.country}`)} · {t(`radio.mountain.${m.id}.name`)}
              </span>
              {m.emergencyOnly && (
                <span className="list-sub emergency-only" data-testid="emergency-only">
                  {t('radio.emergencyOnly')}
                </span>
              )}
              <span className="list-sub">{t(`radio.mountain.${m.id}.desc`)}</span>
            </span>
            <span className="contact-actions">
              <strong className="radio-freqs">{m.freq}</strong>
              <FreqBand freq={m.freq} />
              <CopyButton text={m.freq} label={t('radio.copyFrequency', { name: t(`radio.mountain.${m.id}.name`) })} />
            </span>
          </li>
        ))}
      </ul>
      <Notice id="radio.mountainNote">{t('radio.mountainNote')}</Notice>
      <p className="hint" style={{ margin: 0 }}>{t('radio.mountainSources')}</p>
    </section>
  );
}

/**
 * Red Nacional de Emergencia de Radioaficionados de Perú (RENER, Radio Club
 * Peruano e INDECI): manual de procedimientos de operación 2024 ("sujeta a
 * variaciones"), oa4o.pe. Son frecuencias de radioaficionados: la señal es
 * para quien tiene licencia; con la vida en peligro se puede pedir auxilio
 * por cualquier medio. Se muestran con Perú elegido o a menos de 50 km de su
 * frontera.
 */
const RENER: { id: string; freq: string }[] = [
  { id: 'hf', freq: '7.100 kHz LSB' },
  { id: 'hf80', freq: '3.730 kHz LSB' },
  { id: 'hf20', freq: '14.137 kHz USB' },
  { id: 'indeci', freq: '10.345 kHz USB' },
  { id: 'rpt1', freq: '146,960 MHz (−600 kHz, 82,5 Hz)' },
  { id: 'rpt2', freq: '147,050 MHz (+600 kHz, 82,5 Hz)' },
  { id: 'coord', freq: '147,635 MHz' },
  { id: 'call', freq: '146,520 MHz' },
];

/**
 * Servicio colectivo familiar de Perú: equipos de hasta 500 mW exceptuados de
 * licencia (art. 28 del TUO del Reglamento de la Ley de Telecomunicaciones,
 * canalización del MTC, 14 canales). Versión del reglamento de 2012: sin
 * confirmar que siga vigente. PMR446 (446 MHz) no figura como uso libre.
 */
const PE_FREE: { id: string; freq: string }[] = [
  { id: 'fam1', freq: '462,5625 – 462,7125 MHz' },
  { id: 'fam2', freq: '467,5625 – 467,7125 MHz' },
];

/**
 * Radio de Brasil, con fuente oficial: la frecuencia nacional de emergencia de la LABRE (146,520 MHz FM y el grupo DMR 724193, comunicado
 * del 23/07/2026), las bandas de llamada de la RENER (Portaria MI 307/2009, ítem 8) y los canales de la banda ciudadana (PX, 27 MHz) que
 * la Anatel reserva a emergencias, llamada y rutas (Res. 444/2006; la Anatel dice hoy que la canalización pasó a una norma de 2025: sin
 * confirmar). Repetidoras: no hay listado oficial ni abierto (ver docs/FUENTES-DE-DATOS.md), por eso no hay.
 */
const BR_FREQS: { id: string; freq: string }[] = [
  { id: 'labre', freq: '146,520 MHz' },
  { id: 'dmr', freq: 'TG 724193' },
  { id: 'hf', freq: '3.500–3.550 / 3.600–3.700 · 7.000–7.100 · 14.000–14.350 kHz' },
  { id: 'vhf', freq: '146,390–146,600 MHz (FM simplex) · 146,600–146,990 y 147,000–147,330 MHz (repetidoras)' },
  { id: 'px9', freq: '27,065 MHz' },
  { id: 'px11', freq: '27,085 MHz' },
  { id: 'px19', freq: '27,185 MHz' },
];

function BrazilRadioSection({ place }: { place: { lat: number; lon: number } | null }) {
  const { t } = useTranslation();
  const country = useCountry();
  const [borders, setBorders] = useState<BordersData | null>(null);
  useEffect(() => {
    void loadBorders().then(setBorders);
  }, []);
  const show = useMemo(() => {
    if (place && borders) return distanceToCountry(borders, 'BR', place.lat, place.lon) <= FAR_M;
    return country === 'BR';
  }, [borders, place?.lat, place?.lon, country]);
  if (!show) return null;
  return (
    <section className="card stack" aria-labelledby="br-radio-title" data-testid="br-frequencies">
      <h2 id="br-radio-title" className="section-title" style={{ margin: 0 }}>{t('radio.br.title')}</h2>
      <p className="hint" style={{ margin: 0 }}>{t('radio.br.intro')}</p>
      <ul className="list">
        {BR_FREQS.map((r) => (
          <li key={r.id} className="contact-row">
            <span className="list-main">
              <span className="list-title">{t(`radio.br.${r.id}.name`)}</span>
              <span className="list-sub">{t(`radio.br.${r.id}.desc`)}</span>
            </span>
            <span className="contact-actions">
              <strong className="radio-freqs">{r.freq}</strong>
              <FreqBand freq={r.freq} />
              <CopyButton text={r.freq} label={t('radio.copyFrequency', { name: t(`radio.br.${r.id}.name`) })} />
            </span>
          </li>
        ))}
      </ul>
      <Notice id="radio.brNote">{t('radio.br.note')}</Notice>
      <p className="hint" style={{ margin: 0 }}>{t('radio.br.sources')}</p>
    </section>
  );
}

/** Aviso de radioaficionados: se puede dar por leído y la tarjeta deja de ocupar lugar. */
function HamSection({ country }: { country: string }) {
  const { t } = useTranslation();
  const { hidden, dismiss } = useNotice('radio.ham');
  if (hidden) return null;
  return (
    <section className="card stack" aria-labelledby="ham-title">
      <h2 id="ham-title" className="section-title" style={{ margin: 0 }}>{t('radio.hamTitle')}</h2>
      <p className="hint" style={{ margin: 0 }}>{t('radio.hamText')}</p>
      <p className="hint" style={{ margin: 0 }} data-testid="ham-license">{t(`radio.hamLicense.${country}`)}</p>
      <DismissNoticeButton onClick={dismiss} />
    </section>
  );
}

function RenerSection({ place }: { place: { lat: number; lon: number } | null }) {
  const { t } = useTranslation();
  const country = useCountry();
  const [borders, setBorders] = useState<BordersData | null>(null);
  useEffect(() => {
    void loadBorders().then(setBorders);
  }, []);
  const show = useMemo(() => {
    if (place && borders) return distanceToCountry(borders, 'PE', place.lat, place.lon) <= FAR_M;
    return country === 'PE';
  }, [borders, place?.lat, place?.lon, country]);
  if (!show) return null;
  return (
    <>
    <section className="card stack" aria-labelledby="rener-title" data-testid="rener-frequencies">
      <h2 id="rener-title" className="section-title" style={{ margin: 0 }}>{t('radio.rener.title')}</h2>
      <p className="hint" style={{ margin: 0 }}>{t('radio.rener.intro')}</p>
      <p className="list-sub emergency-only" style={{ margin: 0 }}>{t('radio.emergencyOnly')}</p>
      <ul className="list">
        {RENER.map((r) => (
          <li key={r.id} className="contact-row">
            <span className="list-main">
              <span className="list-title">{t(`radio.rener.${r.id}.name`)}</span>
              <span className="list-sub">{t(`radio.rener.${r.id}.desc`)}</span>
            </span>
            <span className="contact-actions">
              <strong className="radio-freqs">{r.freq}</strong>
              <FreqBand freq={r.freq} />
              <CopyButton text={r.freq} label={t('radio.copyFrequency', { name: t(`radio.rener.${r.id}.name`) })} />
            </span>
          </li>
        ))}
      </ul>
      <Notice id="radio.renerNote">{t('radio.rener.note')}</Notice>
      <p className="hint" style={{ margin: 0 }}>{t('radio.rener.sources')}</p>
    </section>
    <section className="card stack" aria-labelledby="pe-free-title" data-testid="pe-free-radios">
      <h2 id="pe-free-title" className="section-title" style={{ margin: 0 }}>{t('radio.peFree.title')}</h2>
      <p className="hint" style={{ margin: 0 }}>{t('radio.peFree.intro')}</p>
      <ul className="list">
        {PE_FREE.map((r) => (
          <li key={r.id} className="contact-row">
            <span className="list-main">
              <span className="list-title">{t(`radio.peFree.${r.id}.name`)}</span>
              <span className="list-sub">{t(`radio.peFree.${r.id}.desc`)}</span>
            </span>
            <span className="contact-actions">
              <strong className="radio-freqs">{r.freq}</strong>
              <FreqBand freq={r.freq} />
              <CopyButton text={r.freq} label={t('radio.copyFrequency', { name: t(`radio.peFree.${r.id}.name`) })} />
            </span>
          </li>
        ))}
      </ul>
      <Notice id="radio.peFreeNote">{t('radio.peFree.note')}</Notice>
    </section>
    </>
  );
}

/** Cuántos otros parques con frecuencia se listan. */
const OTHER_PARKS_SHOWN = 10;

/**
 * Frecuencias de parques (Argentina y Chile): primero el parque donde se está
 * (o a menos de 5 km), con todos sus teléfonos; después los otros parques que
 * publican una frecuencia, del más cercano al más lejano, para tenerlas antes
 * de salir.
 */
function ParkSection({ place, country }: { place: { lat: number; lon: number } | null; country: Country }) {
  const { t, i18n } = useTranslation();
  const [parks, setParks] = useState<ParksData | null>(null);
  useEffect(() => {
    void loadParks(country).then(setParks);
  }, [country]);
  const { here, others } = useMemo(() => {
    if (!parks) return { here: [], others: [] };
    const all = place
      ? parks.parks.map((park) => ({ park, distance: distanceToPark(park, place.lat, place.lon) })).sort((a, b) => a.distance - b.distance)
      : parks.parks.map((park) => ({ park, distance: null as number | null })).sort((a, b) => a.park.name.localeCompare(b.park.name, i18n.language));
    const here = all.filter((p) => p.distance !== null && p.distance <= PARK_NEAR_M);
    // Los otros, solo a menos de 50 km del límite (sin lugar no se sabe: ninguno).
    const others = all.filter((p) => !here.includes(p) && p.park.radio?.length && p.distance !== null && p.distance <= FAR_M);
    return { here, others: others.slice(0, OTHER_PARKS_SHOWN) };
  }, [parks, place?.lat, place?.lon, i18n.language]);
  if (!parks || (here.length === 0 && others.length === 0)) return null;
  const where = (distance: number | null) =>
    distance === null ? '' : distance === 0 ? t('radio.park.inside') : t('radio.park.near', { distance: formatDistance(distance, i18n.language) });
  return (
    <section className="card stack" aria-labelledby="park-title" data-testid="park-section">
      <h2 id="park-title" className="section-title" style={{ margin: 0 }}>{t('radio.park.title')}</h2>
      <p className="hint" style={{ margin: 0 }}>{t('radio.park.intro')}</p>
      {here.map(({ park, distance }) => (
        <div key={`${park.country ?? ''}${park.name}`} className="stack park-block" data-testid="park-here">
          <p style={{ margin: 0 }}>
            <strong>{park.name}</strong> · {where(distance)}
          </p>
          {park.radio?.length ? (
            <ParkRadioList radio={park.radio} />
          ) : (
            <p className="hint" style={{ margin: 0 }}>{t(`radio.park.noRadio${parkCountry(park)}`)}</p>
          )}
          {park.emergency?.map((e) => (
            <span key={e.phone} className="list-sub park-phone">
              {e.label}: <PhoneActions phone={e.phone} />
            </span>
          ))}
          {park.phone && (
            <span className="list-sub park-phone">
              {park.office ?? t('radio.park.office')}: <PhoneActions phone={park.phone} />
            </span>
          )}
          {park.phones && park.phones.replace(/\D/g, '') !== park.phone.replace(/\D/g, '') && <span className="list-sub">{park.phones}</span>}
          {park.address && <MapLink address={park.address} lat={park.lat} lon={park.lon} />}
        </div>
      ))}
      {others.length > 0 && (
        <>
          <h3 className="list-title" style={{ margin: 0 }}>{t(here.length ? 'radio.park.othersTitle' : 'radio.park.allTitle')}</h3>
          <ul className="list" data-testid="park-others">
            {others.map(({ park, distance }) => (
              <li key={`${park.country ?? ''}${park.name}`} className="contact-row">
                <span className="list-main">
                  <span className="list-title">{park.name}</span>
                  {distance !== null && <span className="list-sub">{where(distance)}</span>}
                  {park.radio && <ParkRadioList radio={park.radio} />}
                  {park.phone && (
                    <span className="list-sub park-phone">
                      {park.office ?? t('radio.park.office')}: <PhoneActions phone={park.phone} />
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <Notice id="radio.parkNote">{t('radio.park.note')}</Notice>
      <p className="hint" style={{ margin: 0 }}>
        {t('radio.park.sourcesLead')} {[...new Set(parks.parks.map(parkCountry))].map((c) => t(`radio.park.sourceOf${c}`)).join(' ')}
      </p>
    </section>
  );
}

/** Siempre en km (lo que se usa para saber si llega la señal): "0,8 km", "12 km". */
function formatKm(m: number, locale: string): string {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: m < 10_000 ? 1 : 0 }).format(m / 1000)} km`;
}

/** Cuántas repetidoras cercanas se muestran (con un archivo de todo el país pueden ser cientos). */
const REPEATERS_SHOWN = 25;

function RepeatersSection({ place, country }: { place: { lat: number; lon: number } | null; country: Country }) {
  const { t, i18n } = useTranslation();
  const [list, setList] = useState<RepeaterList | null>(null);
  const [official, setOfficial] = useState<OfficialRepeaterList[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  // Listados oficiales (Chile): guardados en el dispositivo; sin conexión y sin bajar, no hay.
  useEffect(() => {
    loadOfficialRepeaters(country).then(setOfficial, () => setOfficial([]));
  }, [country]);

  useEffect(() => {
    void (async () => {
      const saved = await loadRepeaters();
      setList(saved);
      // Listas importadas antes de que existiera el nomenclátor: se ubican una vez.
      const located = saved && (await locateRepeaters(saved.items));
      if (saved && located) {
        const next = { ...saved, items: located };
        await saveRepeaters(next);
        setList(next);
      }
    })();
  }, []);

  async function handleFile(f: File) {
    const parsed = parseRepeaterFile(f.name, await f.text());
    if (parsed.length === 0) {
      setMessage(t('radio.repeaters.importNone'));
      return;
    }
    const incoming = (await locateRepeaters(parsed)) ?? parsed;
    const next: RepeaterList = { importedAt: new Date().toISOString(), source: f.name, items: mergeRepeaters(list?.items ?? [], incoming) };
    await saveRepeaters(next);
    setList(next);
    const missing = incoming.filter((r) => r.lat === null).length;
    const approx = incoming.filter((r) => r.approx).length;
    setMessage(
      [
        missing === 0
          ? t('radio.repeaters.imported', { count: incoming.length })
          : t('radio.repeaters.importedNoPlace', { count: incoming.length, missing }),
        approx > 0 ? t('radio.repeaters.importedApprox', { count: approx }) : '',
      ]
        .filter(Boolean)
        .join(' '),
    );
  }

  async function clearAll() {
    if (!(await confirmAction(t('radio.repeaters.confirmClear')))) return;
    await saveRepeaters(null);
    setList(null);
    setMessage(null);
  }

  // Las que tienen ubicación, por cercanía; las que no, al final por frecuencia.
  const officialShown = useMemo(() => officialFor(official, country, place), [official, country, place?.lat, place?.lon]);
  const sorted = useMemo(() => {
    const items = withoutDuplicates(list?.items ?? [], officialShown);
    return items
      .map((r) => ({ r, d: place && r.lat !== null && r.lon !== null ? distanceMeters(place, { lat: r.lat, lon: r.lon }) : null }))
      .sort((a, b) => (a.d ?? Infinity) - (b.d ?? Infinity) || a.r.output - b.r.output);
  }, [list, officialShown, place?.lat, place?.lon]);
  const imported = list?.items.length ?? 0;
  const mhzText = new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 3, maximumFractionDigits: 4 });
  const reportText = (r: Repeater) =>
    t('radio.repeaters.reportText', {
      repeater: [r.call, `${mhzText.format(r.output)} MHz`, r.tone ? `${r.tone} Hz` : '', r.location].filter(Boolean).join(' · '),
      source: r.official
        ? t(`radio.repeaters.reportSource${r.official.country}`, { date: dateText(r.official.listedAt) })
        : t('radio.repeaters.reportSourceFile', { file: list?.source ?? '' }),
    });
  const dateText = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(i18n.language);

  return (
    <section className="card stack" aria-labelledby="rpt-title">
      <h2 id="rpt-title" className="section-title" style={{ margin: 0 }}>{t('radio.repeaters.title')}</h2>
      {sorted.length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>{t('radio.repeaters.empty')}</p>
      ) : (
        <>
          <p className="hint" style={{ margin: 0 }}>{t('radio.repeaters.count', { count: sorted.length, shown: Math.min(sorted.length, REPEATERS_SHOWN) })}</p>
          {official
            .filter((l) => officialShown.some((r) => r.official?.country === l.country))
            .map((l) => (
              <p key={l.country} className="hint" style={{ margin: 0 }} data-testid="repeaters-official">
                {t(`radio.repeaters.official${l.country}`, { count: officialShown.filter((r) => r.official?.country === l.country).length, date: dateText(l.listedAt) })}
              </p>
            ))}
          <ul className="list" data-testid="repeaters">
            {sorted.slice(0, REPEATERS_SHOWN).map(({ r, d }) => {
              const summary = repeaterSummary(r, i18n.language);
              const expired = !!r.official && r.official.expires < new Date().toISOString().slice(0, 10);
              const off = /off|fuera/i.test(r.status) || expired;
              return (
                <li key={`${r.call}-${r.output}`} className="contact-row" data-off={off}>
                  <RadioTower size={22} aria-hidden className="contact-icon" />
                  <span className="list-main">
                    <span className="list-title">
                      {r.call}
                      {r.location && ` · ${r.location}`}
                    </span>
                    <RepeaterDetails r={r} off={off} />
                    {r.lat !== null && <MapLink address="" lat={r.lat} lon={r.lon} />}
                    <Link className="btn-link rpt-report" to={`/about?${new URLSearchParams({ tipo: 'bug', texto: reportText(r) }).toString()}`}>
                      <Flag size={14} aria-hidden /> {t('radio.repeaters.report')}
                    </Link>
                  </span>
                  <span className="contact-actions">
                    <span className="radio-freqs">
                      <span className="rpt-distance" data-testid="rpt-distance">
                        {d !== null ? `${r.approx ? '≈ ' : ''}${formatKm(d, i18n.language)}` : r.lat === null ? t('radio.repeaters.noPlace') : t('radio.repeaters.choosePlace')}
                      </span>
                    </span>
                    <CopyButton text={summary} label={t('radio.repeaters.copy', { call: r.call })} />
                  </span>
                </li>
              );
            })}
          </ul>
          <details className="rpt-help">
            <summary>{t('radio.repeaters.help.title')}</summary>
            <dl>
              {(['output', 'input', 'offset', 'tone', 'mode'] as const).map((k) => (
                <Fragment key={k}>
                  <dt>{t(`radio.repeaters.help.${k}.term`)}</dt>
                  <dd>{t(`radio.repeaters.help.${k}.text`)}</dd>
                </Fragment>
              ))}
            </dl>
          </details>
        </>
      )}
      {message && (
        <p className="hint" role="status" data-testid="repeaters-message" style={{ margin: 0 }}>
          {message}
        </p>
      )}
      <div className="row-end wrap">
        {imported > 0 && (
          <button className="btn btn-danger-outline" type="button" onClick={() => void clearAll()}>
            <Trash2 size={18} /> {t('radio.repeaters.clear')}
          </button>
        )}
        <button className="btn btn-primary" type="button" onClick={() => file.current?.click()}>
          <Upload size={18} /> {t('radio.repeaters.import')}
        </button>
      </div>
      <input
        ref={file}
        type="file"
        accept=".csv,.xls,.gpx,.kml,.xml,text/csv,application/vnd.ms-excel,application/gpx+xml,application/vnd.google-earth.kml+xml"
        hidden
        data-testid="repeaters-file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void handleFile(f);
        }}
      />
      <Notice id="radio.repeatersHowTo">{t('radio.repeaters.howTo')}</Notice>
      <p className="hint" style={{ margin: 0 }}>{t('radio.repeaters.attribution')}</p>
    </section>
  );
}
/** Cada dato con su nombre: qué frecuencia escuchás, en cuál transmitís y qué subtono abre la repetidora. */
function RepeaterDetails({ r, off }: { r: Repeater; off: boolean }) {
  const { t, i18n } = useTranslation();
  const mhz = (n: number) => new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 3, maximumFractionDigits: 4 }).format(n);
  const offsetText = (n: number) =>
    `${n > 0 ? '+' : '−'}${new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 3 }).format(Math.abs(n))} MHz`;
  const toneText = new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const digital = /dmr|d-?star|c4fm|fusion|p25|nxdn|m17/i.test(r.mode);
  return (
    <span className="rpt-details" data-testid="rpt-details">
      <span>
        {t('radio.repeaters.listen')} <strong>{mhz(r.output)} MHz</strong>
      </span>
      <span>
        {r.offset
          ? t('radio.repeaters.transmit', { freq: `${mhz(r.output + r.offset)} MHz`, offset: offsetText(r.offset) })
          : t('radio.repeaters.simplex')}
      </span>
      <span>
        {r.tone
          ? t('radio.repeaters.tone', { tone: toneText.format(r.tone) })
          : digital
            ? t('radio.repeaters.toneDigital')
            : t('radio.repeaters.toneNone')}
      </span>
      {(r.mode || off) && (
        <span className="list-sub">
          {[r.mode && t('radio.repeaters.mode', { mode: r.mode }), off && !r.official && t('radio.repeaters.offAir')].filter(Boolean).join(' · ')}
        </span>
      )}
      {r.approx && <span className="list-sub">{t('radio.repeaters.approx', { place: r.approx })}</span>}
      {r.official && (
        <span className="list-sub" data-testid="rpt-official">
          {[
            r.official.club,
            t(off ? 'radio.repeaters.licenseExpired' : 'radio.repeaters.license', {
              date: new Date(`${r.official.expires}T12:00:00`).toLocaleDateString(i18n.language),
            }),
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      )}
    </span>
  );
}