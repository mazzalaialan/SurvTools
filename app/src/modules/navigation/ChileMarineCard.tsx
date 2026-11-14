import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PickedPlace } from '@/modules/waypoints/PlacePicker';
import { usePlaceCountries } from '@/modules/emergency/usePlaceCountry';
import { fetchChileBays, loadSavedBays, nearestBays, saveBays, type Bay, type ChileBays } from './chileBays';
import { fetchChileForecast, loadSavedChile, saveChile, zoneIdFor, type ChileForecast, type ChileZone } from './chileMarine';

/** «141200 UTC» → «14 12:00 UTC». */
const when = (s: string) => {
  const m = /^(\d{2})(\d{2})(\d{2}) UTC$/.exec(s);
  return m ? `${m[1]} ${m[2]}:${m[3]} UTC` : s;
};

function Zone({ z, open }: { z: ChileZone; open?: boolean }) {
  const { t } = useTranslation();
  const rows: [string, string][] = [
    [t('navigation.chile.wind'), z.wind],
    [t('navigation.chile.ocean'), z.ocean],
    [t('navigation.chile.bay'), z.bay],
    [t('navigation.chile.visibility'), z.visibility],
    [t('navigation.chile.clouds'), z.clouds],
    [t('navigation.chile.synoptic'), z.synoptic],
  ];
  return (
    <details open={open} data-testid={`chile-zone-${z.id}`}>
      <summary>
        <strong>{z.name}</strong>
      </summary>
      <dl className="decl-cheat">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
      </dl>
    </details>
  );
}

/** Una bahía: el primer período abierto y los demás plegados, con el texto de la Armada. */
function BayForecast({ bay, km, open }: { bay: Bay; km: number; open?: boolean }) {
  const { t, i18n } = useTranslation();
  const kmFmt = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 0 });
  return (
    <details open={open} data-testid={`chile-bay-${bay.id}`}>
      <summary>
        <strong>{bay.name}</strong> <span className="hint">· {t('navigation.chile.bayDistance', { km: kmFmt.format(km) })}</span>
      </summary>
      {bay.periods.map((p, i) => {
        const rows: [string, string][] = [
          [t('navigation.chile.wind'), p.wind],
          [t('navigation.chile.bayInside'), p.bay],
          [t('navigation.chile.bayOcean'), p.ocean],
          [t('navigation.chile.bayWaves'), p.waves],
          [t('navigation.chile.visibility'), p.visibility],
          [t('navigation.chile.clouds'), p.clouds],
          [t('navigation.chile.bayPhenomenon'), p.phenomenon],
          [t('navigation.chile.bayTemps'), p.tempMin || p.tempMax ? [p.tempMin, p.tempMax].filter(Boolean).join(' / ') : ''],
        ];
        return (
          <div key={`${p.label}-${i}`} style={{ marginTop: i ? 8 : 4 }}>
            <p className="hint" style={{ margin: '0 0 2px' }}>
              <strong>{p.label}</strong>
            </p>
            <dl className="decl-cheat">
              {rows
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
            </dl>
          </div>
        );
      })}
    </details>
  );
}

/** Pronóstico marítimo oficial de la Armada de Chile para la zona de la costa donde estás (solo en Chile o a menos de 50 km de la frontera). */
export function ChileMarineCard({ place }: { place: PickedPlace | null }) {
  const { t } = useTranslation();
  const { country, near } = usePlaceCountries(place);
  const inChile = country === 'CL' || near.includes('CL');
  const [forecast, setForecast] = useState<ChileForecast | null>(() => loadSavedChile());
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  // Pronóstico de las bahías (otro archivo de la Armada); si falla, queda lo guardado y la tarjeta sigue con las zonas.
  const [bays, setBays] = useState<ChileBays | null>(() => loadSavedBays());
  useEffect(() => {
    if (!inChile || !navigator.onLine) return;
    let cancelled = false;
    void fetchChileBays().then(
      (b) => {
        if (cancelled || !b) return;
        saveBays(b);
        setBays(b);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [inChile]);
  useEffect(() => {
    if (!inChile) return;
    if (!navigator.onLine) {
      setState('error');
      return;
    }
    let cancelled = false;
    setState('loading');
    fetchChileForecast().then(
      (f) => {
        if (cancelled) return;
        if (f) {
          saveChile(f);
          setForecast(f);
        }
        setState('ok');
      },
      () => !cancelled && setState('error'),
    );
    return () => {
      cancelled = true;
    };
  }, [inChile]);

  if (!inChile) return null;
  const mine = forecast && place ? forecast.zones.find((z) => z.id === zoneIdFor(place.lat)) : undefined;
  const others = forecast ? forecast.zones.filter((z) => z !== mine) : [];
  return (
    <section className="card stack" aria-labelledby="chile-title" data-testid="chile-card">
      <h2 id="chile-title" className="section-title" style={{ margin: 0 }}>
        {t('navigation.chile.title')}
      </h2>
      <p className="hint" style={{ margin: 0 }}>
        {t('navigation.chile.intro')}
      </p>
      {state === 'loading' && !forecast && <p className="hint">{t('navigation.chile.loading')}</p>}
      {state === 'error' && (
        <p className={forecast ? 'hint' : 'error'} data-testid="chile-offline">
          {forecast ? t('navigation.chile.offlineSaved', { when: new Date(forecast.fetchedAt).toLocaleString() }) : t('navigation.chile.error')}
        </p>
      )}
      {forecast && (
        <>
          <p style={{ margin: 0 }} data-testid="chile-validity">
            {t('navigation.chile.validity', { from: when(forecast.from), to: when(forecast.to) })}
          </p>
          {mine && (
            <div data-testid="chile-mine">
              <p className="hint" style={{ margin: '0 0 4px' }}>
                {t('navigation.chile.yourZone')}
              </p>
              <Zone z={mine} open />
            </div>
          )}
          {bays && place && nearestBays(bays.bays, place.lat, place.lon).length > 0 && (
            <div data-testid="chile-bays">
              <h3 className="section-title" style={{ margin: '0 0 4px', fontSize: '1rem' }}>
                {t('navigation.chile.baysTitle')}
              </h3>
              <p className="hint" style={{ margin: '0 0 6px' }}>
                {t('navigation.chile.baysIntro')}
              </p>
              {nearestBays(bays.bays, place.lat, place.lon).map((n, i) => (
                <BayForecast key={n.bay.id} bay={n.bay} km={n.km} open={i === 0} />
              ))}
            </div>
          )}
          {others.length > 0 && (
            <>
              <h3 className="section-title" style={{ margin: 0, fontSize: '1rem' }}>
                {t('navigation.chile.others')}
              </h3>
              {others.map((z) => (
                <Zone key={z.id} z={z} />
              ))}
            </>
          )}
        </>
      )}
      <p className="hint" style={{ margin: 0 }} data-testid="chile-source">
        {t('navigation.chile.source')}
      </p>
    </section>
  );
}
