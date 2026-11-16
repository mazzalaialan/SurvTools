import { EcoregionLine } from '@/modules/ecoregions/EcoregionViews';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Ambulance, Flame, MapPinPlus, MessageSquare, Phone, RefreshCw, Share2, Square, Volume2 } from 'lucide-react';
import { bearingDeg, cardinalOf, distanceMeters, formatDms } from '@/core/geo/geo';
import { useGeolocation } from '@/core/geo/useGeolocation';
import { countryAt, loadBorders } from './borders';
import { useCurrentCountry } from './currentCountry';
import type { Country } from '@/core/settings/settings';
import { speak, stopSpeaking, useSpeechVoice } from '@/core/speech/speech';
import { CALLS } from '@/modules/firstAid/guides/types';
import type { NewWaypointDraft } from '@/modules/waypoints/WaypointEditPage';
import { nearestWithRole } from '@/modules/waypoints/roles';
import { useWaypoints } from '@/modules/waypoints/store';
import { describeLocation, type LocationInfo } from './osm';
import { CopyButton, formatDistance } from './parts';

/** Se vuelve a buscar la dirección si te moviste más que esto. */
const RELOOKUP_M = 150;

export function MyLocationPage() {
  const { t, i18n } = useTranslation();
  const { fix, error } = useGeolocation();
  useEffect(() => {
    if (!fix) return;
    let live = true;
    void loadBorders().then((d) => live && setHere(countryAt(d, fix.lat, fix.lon)));
    return () => {
      live = false;
    };
  }, [fix?.lat, fix?.lon]);
  // El número general de emergencias del país (en Chile, Carabineros).
  const { here: settingsCountry } = useCurrentCountry();
  // Los números son los del país donde uno está (por la ubicación); sin ubicación, los del país elegido.
  const [here, setHere] = useState<Country | null>(null);
  const callCountry = here ?? settingsCountry;
  const calls = CALLS[callCountry];
  const emergencyNumber = calls.emergency ?? '911';
  const waypoints = useWaypoints((s) => s.waypoints);
  const [info, setInfo] = useState<LocationInfo | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error' | 'offline'>('idle');
  const lastLookup = useRef<{ lat: number; lon: number } | null>(null);
  const voice = useSpeechVoice(i18n.language.startsWith('en') ? 'en' : 'es');
  const [reading, setReading] = useState(false);

  async function lookup(lat: number, lon: number) {
    if (!navigator.onLine) {
      setState('offline');
      return;
    }
    lastLookup.current = { lat, lon };
    setState('loading');
    try {
      setInfo(await describeLocation(lat, lon, i18n.language));
      setState('idle');
    } catch {
      setState('error');
    }
  }

  useEffect(() => {
    if (!fix) return;
    if (!lastLookup.current || distanceMeters(lastLookup.current, fix) > RELOOKUP_M) void lookup(fix.lat, fix.lon);
  }, [fix?.lat, fix?.lon]);

  const nearestWp = useMemo(() => {
    if (!fix) return null;
    let best: { name: string; d: number; bearing: number } | null = null;
    for (const w of waypoints.values()) {
      const d = distanceMeters(fix, w);
      if (!best || d < best.d) best = { name: w.name, d, bearing: bearingDeg(w, fix) };
    }
    return best;
  }, [fix, waypoints]);

  // Antigüedad de la posición (se actualiza cada medio minuto): si el GPS se perdió, se ve que es la última conocida.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const ageMin = fix ? Math.max(0, Math.floor((nowMs - fix.timestamp) / 60_000)) : 0;
  const west = t('geo.westLetter');
  const decimal = fix ? `${fix.lat.toFixed(5)}, ${fix.lon.toFixed(5)}` : '';
  const mapUrl = fix ? `https://www.google.com/maps/search/?api=1&query=${fix.lat.toFixed(6)},${fix.lon.toFixed(6)}` : '';

  const message = useMemo(() => {
    if (!fix) return '';
    const lines = [
      t('location.msg.intro'),
      t('location.msg.coords', { decimal, dms: formatDms(fix, west), accuracy: Math.round(fix.accuracy) }),
    ];
    // Cuándo se tomó la posición: quien recibe el mensaje sabe cuánto puede haberse movido.
    lines.push(t('location.msg.takenAt', { time: new Date(fix.timestamp).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' }) }));
    if (info?.address || info?.locality) lines.push(t('location.msg.address', { address: [info.address, info.locality].filter(Boolean).join(', ') }));
    if (info?.nearbyStreets.length) lines.push(t('location.msg.streets', { streets: info.nearbyStreets.join(t('location.and')) }));
    if (info?.roads.length) lines.push(t('location.msg.road', { road: info.roads.join(' / ') }) + (info.milestone ? ` ${t('location.msg.km', { km: info.milestone.km })}` : ''));
    // Los lugares guardados por quien pide ayuda ("a 300 m de Casa") no le dicen nada al socorrista: no van en el mensaje.
    // Solo calles, rutas, kilómetro y localidad reales, más las coordenadas y el mapa.
    if (fix.alt !== null) lines.push(t('location.msg.altitude', { alt: Math.round(fix.alt) }));
    lines.push(t('location.msg.map', { url: mapUrl }));
    return lines.join('\n');
  }, [fix, info, t, i18n.language]);

  // El mismo mensaje, para leerlo en voz alta: coordenadas cifra por cifra (para anotarlas), sin el link del mapa.
  const spoken = useMemo(() => {
    if (!fix) return [];
    const digits = (x: number) => {
      const [int, dec] = Math.abs(x).toFixed(5).split('.');
      return `${int} ${t('location.spoken.point')} ${dec!.split('').join(' ')}`;
    };
    const lines = message.split('\n').filter((l) => !l.includes(mapUrl));
    lines[1] = t('location.spoken.coords', {
      lat: digits(fix.lat),
      // No se puede llamar `ns`: i18next lo toma como el espacio de nombres.
      latDir: t(fix.lat < 0 ? 'location.spoken.south' : 'location.spoken.north'),
      lon: digits(fix.lon),
      lonDir: t(fix.lon < 0 ? 'location.spoken.west' : 'location.spoken.east'),
      accuracy: Math.round(fix.accuracy),
    });
    return lines;
  }, [message, fix, mapUrl, t]);

  function toggleRead() {
    if (reading || !voice) {
      stopSpeaking();
      setReading(false);
      return;
    }
    // Más lento que en las guías: es para que alguien lo anote.
    speak(spoken, voice, 0.85);
    setReading(true);
  }

  // Se corta al salir, al pasar a segundo plano o al tocar "Llamar".
  useEffect(() => {
    const hide = () => {
      if (document.visibilityState === 'hidden') {
        stopSpeaking();
        setReading(false);
      }
    };
    document.addEventListener('visibilitychange', hide);
    return () => {
      document.removeEventListener('visibilitychange', hide);
      stopSpeaking();
    };
  }, []);
  useEffect(() => {
    if (!reading) return;
    // Apaga el botón cuando termina de leer.
    const timer = setInterval(() => {
      if (!window.speechSynthesis?.speaking && !window.speechSynthesis?.pending) setReading(false);
    }, 1000);
    return () => clearInterval(timer);
  }, [reading]);

  async function share() {
    try {
      await navigator.share({ title: t('location.shareTitle'), text: message });
    } catch {
      // Cancelado o sin soporte: queda el botón de copiar.
    }
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="page-title" style={{ flex: 1 }}>{t('modules.myLocation.title')}</h1>
      </div>
      <a
        className="btn btn-danger call-911"
        href={`tel:${emergencyNumber}`}
        onClick={() => {
          // No puede sonar encima de la llamada.
          stopSpeaking();
          setReading(false);
        }}
      >
        <Phone size={20} /> {t('location.call911', { number: emergencyNumber })}
      </a>
      {/* Salud (ambulancia) y bomberos del país, si tienen número propio. */}
      {(calls.same || calls.fire) && (
        <div className="other-calls" data-testid="other-emergency-calls">
          {calls.same && calls.same !== emergencyNumber && (
            <a className="btn call-other" href={`tel:${calls.same}`} onClick={() => stopSpeaking()}>
              <Ambulance size={20} /> {t('location.callHealth', { number: calls.same })}
            </a>
          )}
          {calls.fire && (
            <a className="btn call-other" href={`tel:${calls.fire}`} onClick={() => stopSpeaking()}>
              <Flame size={20} /> {t('location.callFire', { number: calls.fire })}
            </a>
          )}
        </div>
      )}
      <p className="hint" style={{ margin: 0 }} data-testid="calls-country">
        {t(here ? 'location.callsHere' : 'location.callsSettings', { country: t(`country.${callCountry}`) })}
      </p>
      <p className="hint" style={{ margin: 0 }}>{t('location.intro')}</p>

      {!fix ? (
        <p className={error ? 'error' : 'hint'} role="status">
          {error ? t(`location.gpsError.${error}`) : t('location.waiting')}
        </p>
      ) : (
        <>
          <section className="card stack location-card" aria-label={t('location.coordsTitle')}>
            <h2 className="section-title" style={{ margin: 0 }}>{t('location.coordsTitle')}</h2>
            <p className="location-big" data-testid="location-decimal">
              {decimal}
            </p>
            <p className="location-dms" data-testid="location-dms">{formatDms(fix, west)}</p>
            <EcoregionLine lat={fix.lat} lon={fix.lon} testId="location-ecoregion" />
            <p className="hint" style={{ margin: 0 }}>
              {t('location.accuracy', { m: Math.round(fix.accuracy) })}
              {fix.alt !== null && ` · ${t('location.altitude', { m: Math.round(fix.alt) })}`}
            </p>
            <p className={ageMin >= 5 ? 'warning-box' : 'hint'} style={{ margin: 0 }} data-testid="location-age">
              {ageMin < 1 ? t('location.ageNow') : t(ageMin >= 5 ? 'location.ageStale' : 'location.age', { min: ageMin })}
            </p>
            <div className="row-end">
              <CopyButton text={decimal} label={t('location.copyCoords')} />
              <a className="btn" href={mapUrl} target="_blank" rel="noreferrer">
                {t('emergency.openMaps')}
              </a>
              {/* Las coordenadas van en el estado de la navegación, no en la URL (no quedan en el historial). */}
              <Link
                className="btn"
                to="/orientation/waypoints/new"
                state={{ lat: fix.lat, lon: fix.lon, alt: fix.alt, notes: [info?.address, info?.locality].filter(Boolean).join(', ') } satisfies NewWaypointDraft}
              >
                <MapPinPlus size={18} /> {t('location.saveWaypoint')}
              </Link>
            </div>
          </section>

          <section className="card stack" aria-labelledby="ref-title">
            <div className="row-between">
              <h2 id="ref-title" className="section-title" style={{ margin: 0 }}>{t('location.referencesTitle')}</h2>
              <button className="icon-btn" type="button" onClick={() => void lookup(fix.lat, fix.lon)} disabled={state === 'loading'} aria-label={t('location.refresh')}>
                <RefreshCw size={18} />
              </button>
            </div>
            {state === 'loading' && <p className="hint">{t('location.searching')}</p>}
            {state === 'offline' && <p className="hint">{t('location.offline')}</p>}
            {state === 'error' && <p className="hint">{t('location.lookupError')}</p>}
            {info && (
              <dl className="location-refs" data-testid="location-refs">
                {(info.address || info.locality) && (
                  <>
                    <dt>{t('location.address')}</dt>
                    <dd>{[info.address, info.locality].filter(Boolean).join(', ')}</dd>
                  </>
                )}
                {info.nearbyStreets.length > 0 && (
                  <>
                    <dt>{t('location.streets')}</dt>
                    <dd>{info.nearbyStreets.join(t('location.and'))}</dd>
                  </>
                )}
                {info.roads.length > 0 && (
                  <>
                    <dt>{t('location.road')}</dt>
                    <dd>
                      {info.roads.join(' / ')}
                      {info.milestone && ` · ${t('location.km', { km: info.milestone.km, distance: formatDistance(info.milestone.distance, i18n.language) })}`}
                    </dd>
                  </>
                )}
              </dl>
            )}
            {fix && (['escape', 'shelter'] as const).map((role) => {
              const near = nearestWithRole(waypoints.values(), role, fix);
              return near ? (
                <p key={role} className="hint" style={{ margin: 0 }} data-testid={`location-${role}`}>
                  {t(`location.${role}Near`, { name: near.waypoint.name, distance: formatDistance(near.distanceM, i18n.language), dir: t(`geo.cardinal.${cardinalOf(near.bearing)}`) })}
                </p>
              ) : null;
            })}
            {nearestWp && (
              <p className="hint" style={{ margin: 0 }} data-testid="location-waypoint">
                {t('location.fromWaypoint', { distance: formatDistance(nearestWp.d, i18n.language), dir: t(`geo.cardinal.${cardinalOf(nearestWp.bearing)}`), name: nearestWp.name })}
              </p>
            )}
          </section>

          <section className="card stack" aria-labelledby="msg-title">
            <h2 id="msg-title" className="section-title" style={{ margin: 0 }}>{t('location.messageTitle')}</h2>
            <pre className="location-message" data-testid="location-message">{message}</pre>
            <div className="row-end wrap">
              <CopyButton text={message} label={t('location.copyMessage')} />
              {voice && (
                <button className="btn" type="button" onClick={toggleRead} aria-pressed={reading}>
                  {reading ? <Square size={18} /> : <Volume2 size={18} />} {t(reading ? 'location.stopReading' : 'location.readAloud')}
                </button>
              )}
              {'share' in navigator && (
                <button className="btn" type="button" onClick={() => void share()}>
                  <Share2 size={18} /> {t('location.share')}
                </button>
              )}
              <a className="btn" href={`sms:?&body=${encodeURIComponent(message)}`}>
                <MessageSquare size={18} /> {t('location.sms')}
              </a>
              <a className="btn" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">
                {t('location.whatsapp')}
              </a>
            </div>
          </section>
        </>
      )}

      <p className="hint">{t('location.sources')}</p>
    </div>
  );
}
