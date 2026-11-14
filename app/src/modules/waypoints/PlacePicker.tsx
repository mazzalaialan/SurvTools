import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useCapability } from '@/core/capabilities/capabilities';
import { formatDecimal, formatDms, parseCoordinates, type LatLon } from '@/core/geo/geo';
import { MapPickButton } from '@/modules/maps/MapPickButton';
import { reportLocation } from '@/core/geo/locationEvents';
import { useGeolocation } from '@/core/geo/useGeolocation';
import { useSettings } from '@/core/settings/settings';
import { GpsStatus } from './components';
import { useWaypoints } from './store';

export interface PickedPlace extends LatLon {
  alt: number | null;
  /** Nombre para mostrar ("Mi ubicación", el waypoint o las coordenadas). */
  label: string;
}

const GPS = 'gps';
const MANUAL = 'manual';

/**
 * Elige el lugar para sol, luna y clima: GPS, un waypoint guardado o coordenadas
 * escritas. Se recuerda el waypoint elegido; las coordenadas a mano no se guardan
 * (para eso está guardarlas como waypoint). Con `initial` arranca en esas coordenadas.
 */
export function usePlacePicker(initial?: LatLon | null): { place: PickedPlace | null; picker: ReactNode } {
  const { t } = useTranslation();
  const hasGps = useCapability('geolocation');
  const waypoints = useWaypoints((s) => s.waypoints);
  const savedId = useSettings((s) => s.settings.placeWaypointId);
  const update = useSettings((s) => s.update);
  // Con un lugar inicial (por ejemplo, el que se tocó en un mapa) se arranca con esas coordenadas en vez del GPS.
  const [manual, setManual] = useState<string | null>(() => (initial ? `${initial.lat.toFixed(5)}, ${initial.lon.toFixed(5)}` : null));

  const saved = savedId ? waypoints.get(savedId) : undefined;
  // Sin GPS ni waypoint elegido, se arranca con coordenadas a mano.
  const choice = manual !== null ? MANUAL : saved ? saved.id : hasGps ? GPS : MANUAL;
  const { fix, error } = useGeolocation(choice === GPS);
  const parsed = manual ? parseCoordinates(manual) : null;

  let place: PickedPlace | null = null;
  if (choice === GPS && fix) place = { lat: fix.lat, lon: fix.lon, alt: fix.alt, label: t('place.myLocation') };
  else if (choice === MANUAL && parsed) place = { ...parsed, alt: null, label: formatDms(parsed, t('geo.westLetter')) };
  else if (choice !== GPS && choice !== MANUAL && saved) place = { lat: saved.lat, lon: saved.lon, alt: saved.alt, label: saved.name };

  // Un lugar elegido o escrito a mano cuenta como ubicación nueva (el país donde estás se detecta con eso, sin pedir el GPS).
  useEffect(() => {
    if (place) reportLocation(place.lat, place.lon);
  }, [place?.lat, place?.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  function choose(value: string) {
    if (value === MANUAL) {
      setManual('');
      return;
    }
    setManual(null);
    void update({ placeWaypointId: value === GPS ? null : value });
  }

  const options = [...waypoints.values()].sort((a, b) => a.name.localeCompare(b.name));
  const picker = (
    <section className="card stack">
      <div className="field">
        <label htmlFor="place">{t('place.label')}</label>
        <select id="place" className="select" value={choice} onChange={(e) => choose(e.target.value)}>
          {hasGps && <option value={GPS}>{t('place.myLocation')}</option>}
          {options.map((wp) => (
            <option key={wp.id} value={wp.id}>
              {wp.name}
            </option>
          ))}
          <option value={MANUAL}>{t('place.manual')}</option>
        </select>
      </div>
      {choice === MANUAL && (
        <div className="field">
          <label htmlFor="place-coords">{t('waypoints.coordinates')}</label>
          <div className="input-group">
            <input
              id="place-coords"
              className="input"
              value={manual ?? ''}
              onChange={(e) => setManual(e.target.value)}
              placeholder="-34.603722, -58.381592"
              aria-invalid={!!manual && !parsed}
              autoComplete="off"
            />
            <MapPickButton initial={parsed} onPick={(p) => setManual(formatDecimal(p))} />
          </div>
          {manual && !parsed && <p className="error">{t('waypoints.coordinatesInvalid')}</p>}
          {!manual && <p className="hint">{t('place.manualHint')}</p>}
        </div>
      )}
      {choice === GPS && <GpsStatus fix={fix} error={error} />}
    </section>
  );

  return { place, picker };
}
