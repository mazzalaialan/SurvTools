import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, List, Map as MapIcon, Save } from 'lucide-react';
import type { ContactKind } from '@/core/model/types';
import { usePlacePicker } from '@/modules/waypoints/PlacePicker';
import { emptyContact } from './ContactEditPage';
import { loadCountryData } from './country';
import { usePlaceCountries } from './usePlaceCountry';
import { loadParks, mergeNearby, nearestPerKind, officialNearby, withParks, type EmergencyData, type NearbyPlace, type ParksData } from './data';
import { CATEGORY_KIND, loadService, SERVICE_KINDS, serviceNearby, type ServiceCategory, type ServiceData } from './services';

const EMPTY_DATA: EmergencyData = { sources: { fire: '', police: '', health: '', radio: '' }, fire: [], police: [], health: [], radio: [] };
import { useSettings } from '@/core/settings/settings';
import { fetchOsmNearby } from './osm';
import { NAUTICAL_IDS, nauticalIdOf, type NauticalId } from './nautical';
import { formatDistance, KindIcon, MapLink, ParkRadioList, PhoneActions } from './parts';
import { useContacts } from './store';

/** El mapa va aparte: MapLibre se carga recién al tocar "Ver en el mapa". */
const NearbyMap = lazy(() => import('./NearbyMap').then((m) => ({ default: m.NearbyMap })));

/** 0 = lo más cercano de cada tipo, sin límite (zonas agrestes, donde no hay nada cerca). */
const RADII = [5, 15, 30, 50, 100, 200, 0];
/** Hasta dónde se le pregunta a OpenStreetMap (con más, la consulta se vuelve muy pesada). */
const OSM_MAX_KM = 200;
/** Sin límite: cuántos de cada tipo. */
const NEAREST_PER_KIND = 3;
type Filter = 'all' | 'police' | 'fire' | 'health' | 'civilDefense' | 'vehicle' | 'water' | 'shelter' | 'atm' | 'nautical';
const FILTERS: Filter[] = ['all', 'police', 'fire', 'health', 'civilDefense', 'vehicle', 'water', 'shelter', 'atm', 'nautical'];
/** Lo que se está mirando: un filtro sin opciones o la opción elegida de Salud o Vehículos. */
type Selection = Exclude<Filter, 'health' | 'vehicle'> | 'care' | 'pharmacy' | 'aed' | 'vet' | 'fuel' | 'tyres' | 'repair';
/** Opciones de Salud y de Vehículos; la primera es la que viene elegida. */
const SUBFILTERS: Partial<Record<Filter, Selection[]>> = {
  health: ['care', 'pharmacy', 'aed', 'vet'],
  vehicle: ['fuel', 'tyres', 'repair'],
};
/**
 * Tipos de cada selección. "Todo" son los servicios de emergencia (policía,
 * bomberos, hospitales y centros de atención, Defensa Civil): el resto se ve
 * con su filtro (en una ciudad hay decenas de cada uno y taparían a los demás).
 */
const SELECTION_KINDS: Record<Selection, ContactKind[]> = {
  all: ['police', 'fire', 'hospital', 'medical', 'civilDefense'],
  police: ['police'],
  fire: ['fire'],
  care: ['hospital', 'medical'],
  civilDefense: ['civilDefense'],
  pharmacy: ['pharmacy'],
  aed: ['aed'],
  vet: ['vet'],
  fuel: ['fuel'],
  tyres: ['tyres'],
  repair: ['carRepair'],
  water: ['water'],
  shelter: ['shelter'],
  atm: ['atm'],
  nautical: ['nautical'],
};
/** Categoría de los archivos de servicios de una selección (null: servicios de emergencia). */
const serviceOf = (sel: Selection): ServiceCategory | null => (sel in CATEGORY_KIND ? (sel as ServiceCategory) : null);
/** Más que esto no se lee en el celular: con un filtro se ven los de cada tipo. */
const MAX_SHOWN = 60;

export function NearbyPage() {
  const { t, i18n } = useTranslation();
  const { place, picker } = usePlacePicker();
  const contacts = useContacts((s) => s.contacts);
  const save = useContacts((s) => s.save);
  const [data, setData] = useState<EmergencyData | null>(null);
  /** Los datos de los países vecinos a menos de 50 km (cada uno aparte: cada archivo dice si es oficial o de OpenStreetMap). */
  const [dataNear, setDataNear] = useState<EmergencyData[]>([]);
  const [radiusKm, setRadiusKm] = useState(15);
  const [filter, setFilter] = useState<Filter>('all');
  const [sub, setSub] = useState<Selection | null>(null);
  /** Tipos de Náutica que se muestran (todos al empezar). */
  const [nauticalOn, setNauticalOn] = useState<Set<NauticalId>>(() => new Set(NAUTICAL_IDS));
  const toggleNautical = (id: NauticalId) =>
    setNauticalOn((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const selection: Selection = sub ?? (filter as Selection);
  const service = serviceOf(selection);
  const matches = (k: ContactKind) => SELECTION_KINDS[selection].includes(k);
  // En Náutica, además, solo los tipos elegidos (uno que no se reconoce se deja).
  const typeOn = (p: NearbyPlace) => selection !== 'nautical' || p.kind !== 'nautical' || ((id) => id === null || nauticalOn.has(id))(nauticalIdOf(p.detail));
  function chooseFilter(f: Filter) {
    setFilter(f);
    // Salud y Vehículos arrancan con su primera opción (hospitales y centros de atención; estaciones de servicio).
    setSub(SUBFILTERS[f]?.[0] ?? null);
  }
  const [onMap, setOnMap] = useState(false);
  const [osm, setOsm] = useState<{ key: string; items: NearbyPlace[] } | null>(null);
  const serverUrl = useSettings((s) => s.settings.serverUrl);
  const [osmState, setOsmState] = useState<'idle' | 'loading' | 'error' | 'offline'>('idle');
  const [attempt, setAttempt] = useState(0);

  // El país es el del lugar elegido (no el de Ajustes) y, a menos de 50 km de una frontera, también cuentan los del país vecino.
  const { country, near } = usePlaceCountries(place);
  const nearKey = near.join(',');
  const [packageMissing, setPackageMissing] = useState(false);
  const [parks, setParks] = useState<ParksData | null>(null);
  const [serviceData, setServiceData] = useState<ServiceData | null>(null);
  const [serviceNear, setServiceNear] = useState<ServiceData[]>([]);
  // La categoría de servicios elegida (estaciones, farmacias, agua…): archivo aparte, se baja una vez.
  // Sin conexión y sin bajar, solo lo que traiga OpenStreetMap en vivo.
  useEffect(() => {
    setServiceData(null);
    setServiceNear([]);
    if (!service) return;
    let cancelled = false;
    void Promise.all(near.map((c) => loadService(service, c).catch(() => null))).then((list) => {
      if (cancelled) return;
      setServiceData(list[0] ?? null);
      setServiceNear(list.slice(1).filter((d): d is ServiceData => d !== null));
    });
    return () => {
      cancelled = true;
    };
  }, [service, nearKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // Parques nacionales y áreas de CONAF (intendencias, oficinas y frecuencias): Argentina y Chile.
  useEffect(() => {
    void loadParks(country).then(setParks);
  }, [country]);
  useEffect(() => {
    let cancelled = false;
    setPackageMissing(false);
    void Promise.all(
      near.map((c) =>
        loadCountryData(c).then(
          (d) => d.emergency,
          () => null,
        ),
      ),
    ).then((list) => {
      if (cancelled) return;
      // Sin conexión y sin el paquete del país del lugar: solo lo que encuentre OpenStreetMap cuando haya conexión.
      if (list[0] === null) setPackageMissing(true);
      setData(list[0] ?? EMPTY_DATA);
      setDataNear(list.slice(1).filter((d): d is EmergencyData => d !== null));
    });
    return () => {
      cancelled = true;
    };
  }, [nearKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Los servicios se le piden a OpenStreetMap solo con su filtro (hay muchos y la consulta se vuelve pesada).
  const searchKey = place ? `${place.lat.toFixed(3)},${place.lon.toFixed(3)},${radiusKm},${service ?? ''}` : null;

  // OpenStreetMap suma lo que no está en los datos oficiales (y teléfonos), solo con conexión.
  useEffect(() => {
    if (!place || !searchKey) return;
    if (!navigator.onLine) {
      setOsmState('offline');
      return;
    }
    let cancelled = false;
    setOsmState('loading');
    fetchOsmNearby(place.lat, place.lon, Math.min(radiusKm || OSM_MAX_KM, OSM_MAX_KM) * 1000, service, serverUrl).then(
      (items) => {
        if (cancelled) return;
        setOsm({ key: searchKey, items });
        setOsmState('idle');
      },
      () => !cancelled && setOsmState('error'),
    );
    return () => {
      cancelled = true;
    };
    // `searchKey` resume el lugar redondeado y el radio: el GPS se mueve en metros.
  }, [searchKey, attempt]);

  // Todo lo conocido, sin límite de distancia (los datos oficiales vienen en la app).
  const everything = useMemo(() => {
    if (!data || !place) return [];
    // Cada país por su cuenta: el cartel «Oficial» u «OpenStreetMap» depende del archivo de cada uno.
    const known = [
      ...[data, ...dataNear].flatMap((d) => officialNearby(d, place.lat, place.lon, Infinity)),
      ...[serviceData, ...serviceNear].flatMap((d) => (d ? serviceNearby(d, place.lat, place.lon) : [])),
    ];
    const merged = mergeNearby(known, osm?.key === searchKey ? osm.items : []);
    return parks ? withParks(merged, parks, place.lat, place.lon).sort((a, b) => a.distance - b.distance) : merged;
  }, [data, dataNear, serviceData, serviceNear, parks, place?.lat, place?.lon, osm, searchKey]);
  const results = radiusKm === 0 ? nearestPerKind(everything, NEAREST_PER_KIND) : everything.filter((p) => p.distance <= radiusKm * 1000);
  const shown = results.filter((r) => matches(r.kind) && typeOn(r));
  // Nada en el rango: igual se muestra lo más cercano de cada tipo, aunque esté lejos.
  const fallback = radiusKm !== 0 && shown.length === 0 ? nearestPerKind(everything.filter((r) => matches(r.kind) && typeOn(r)), 1) : [];
  const visible = (fallback.length ? fallback : shown).slice(0, MAX_SHOWN);

  const savedKeys = useMemo(() => new Set([...contacts.values()].map((c) => `${c.name}|${c.lat?.toFixed(4)}|${c.lon?.toFixed(4)}`)), [contacts]);
  const isSaved = (p: NearbyPlace) => savedKeys.has(`${p.name}|${p.lat.toFixed(4)}|${p.lon.toFixed(4)}`);

  /** El tipo según la fuente: el de los datos oficiales y el de los servicios (bandera, red del cajero, clase de refugio). */
  const showDetail = (p: NearbyPlace) => !!p.detail && (p.source === 'official' || SERVICE_KINDS.has(p.kind));
  /** Salud del CNES (Brasil): 24 h, atención SUS y código del establecimiento. */
  const cnesTags = (p: NearbyPlace) => (p.cnes ? [p.h24 && t('emergency.cnesH24'), p.sus && t('emergency.cnesSus'), t('emergency.cnesCode', { code: p.cnes })].filter(Boolean).join(' · ') : '');
  const fuelList = (p: NearbyPlace) => (p.fuels ?? []).map((f) => t(`emergency.fuels.${f}`)).join(', ');

  async function handleSave(p: NearbyPlace) {
    await save({
      ...emptyContact(p.kind),
      name: p.name || t(`emergency.kind.${p.kind}`),
      phone: p.phone,
      address: p.address,
      lat: p.lat,
      lon: p.lon,
      notes: [
        showDetail(p) ? p.detail : '',
        p.note ?? '',
        cnesTags(p),
        ...(p.extraPhones ?? []).map((e) => `${e.label}: ${e.phone}`),
        ...(p.radio ?? []).map((r) => `${t('radio.vhf')} ${r.freq} (${r.label})`),
        p.fuels ? fuelList(p) : '',
      ]
        .filter(Boolean)
        .join('\n'),
      source: t(`emergency.source.${p.source}`),
    });
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="page-title" style={{ flex: 1 }}>{t('emergency.nearbyTitle')}</h1>
      </div>
      {picker}

      <div className="field">
        <label htmlFor="radius">{t('emergency.radius')}</label>
        <select id="radius" className="select" value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))}>
          {RADII.map((r) => (
            <option key={r} value={r}>
              {r === 0 ? t('emergency.nearestAny') : t('maps.km', { count: r })}
            </option>
          ))}
        </select>
      </div>
      <div className="chips" role="group" aria-label={t('emergency.filter')}>
        {FILTERS.map((f) => (
          <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => chooseFilter(f)}>
            {t(`emergency.filters.${f}`)}
          </button>
        ))}
      </div>
      {filter === 'nautical' && (
        <div className="chips nearby-subfilters" role="group" aria-label={t('emergency.nauticalTypesLabel')} data-testid="nautical-types">
          {NAUTICAL_IDS.map((id) => {
            const count = results.filter((r) => r.kind === 'nautical' && nauticalIdOf(r.detail) === id).length;
            return (
              <button key={id} type="button" className="chip" aria-pressed={nauticalOn.has(id)} onClick={() => toggleNautical(id)} data-testid={`nautical-type-${id}`}>
                {t(`emergency.nauticalTypes.${id}`)} ({count})
              </button>
            );
          })}
        </div>
      )}
      {filter === 'nautical' && nauticalOn.size === 0 && <p className="hint" data-testid="nautical-none">{t('emergency.nauticalNone')}</p>}
      {SUBFILTERS[filter] && (
        <div className="chips nearby-subfilters" role="group" aria-label={t(`emergency.filters.${filter}`)} data-testid="nearby-subfilters">
          {SUBFILTERS[filter]!.map((s) => (
            <button key={s} type="button" className="chip" aria-pressed={selection === s} onClick={() => setSub(s)}>
              {t(`emergency.subfilters.${s}`)}
            </button>
          ))}
        </div>
      )}
      {/* Ver los resultados en el mapa: la distancia en línea recta no dice si se llega (un río, una montaña, la ruta). */}
      <button className="btn" type="button" onClick={() => setOnMap((v) => !v)} disabled={!place} aria-pressed={onMap} data-testid="nearby-map-toggle">
        {onMap ? <List size={18} aria-hidden /> : <MapIcon size={18} aria-hidden />} {onMap ? t('emergency.viewList') : t('emergency.viewOnMap')}
      </button>

      <p className="hint" role="status" data-testid="nearby-status" style={{ margin: 0 }}>
        {osmState === 'loading'
          ? t('emergency.osmLoading')
          : osmState === 'offline'
            ? packageMissing
              ? t('emergency.packageMissing', { country: t(`country.${country}`) })
              : country === 'AR'
                ? t('emergency.osmOffline')
                : t('emergency.osmOfflinePackage', { country: t(`country.${country}`) })
            : osmState === 'error'
              ? t('emergency.osmError')
              : place && data && t('emergency.found', { count: shown.length })}
      </p>
      {osmState === 'error' && (
        <button className="btn" type="button" onClick={() => setAttempt((a) => a + 1)}>
          {t('emergency.retry')}
        </button>
      )}

      {!place ? (
        <p className="empty">{t('emergency.needPlace')}</p>
      ) : shown.length === 0 && fallback.length === 0 ? (
        <p className="empty">{t('emergency.nothingNear')}</p>
      ) : (
        <>
        {fallback.length > 0 && (
          <p className="hint" role="status" data-testid="nearby-fallback" style={{ margin: 0 }}>
            {t('emergency.nothingWithin', { km: radiusKm })}
          </p>
        )}
        {onMap ? (
          <Suspense fallback={null}>
            {/* Se vuelve a armar si cambian los resultados, para encuadrarlos a todos. */}
            <NearbyMap key={`${searchKey},${selection},${visible.length}`} places={visible} here={place} />
          </Suspense>
        ) : (
        <ul className="list contact-list" data-testid="nearby-list">
          {visible.map((p) => (
            <li key={p.key} className="contact-row">
              <KindIcon kind={p.kind} />
              <span className="list-main">
                <span className="list-title">{p.name || t(`emergency.kind.${p.kind}`)}</span>
                <span className="list-sub">
                  {formatDistance(p.distance, i18n.language)} · {showDetail(p) ? p.detail : t(`emergency.kind.${p.kind}`)} ·{' '}
                  <span className={`source-badge source-${p.source}`}>{t(`emergency.source.${p.source}`)}</span>
                </span>
                {p.note && <span className="list-sub">{p.note}</span>}
                {p.cnes && <span className="list-sub">{cnesTags(p)}</span>}
                {p.fuels && <span className="list-sub">{fuelList(p)}</span>}
                <MapLink address={p.address} lat={p.lat} lon={p.lon} />
                {p.extraPhones?.map((e) => (
                  <span key={e.phone} className="list-sub park-phone">
                    {e.label}: <PhoneActions phone={e.phone} />
                  </span>
                ))}
                {p.radio && <ParkRadioList radio={p.radio} />}
              </span>
              <span className="contact-actions">
                <PhoneActions phone={p.phone} />
                {isSaved(p) ? (
                  <span className="icon-btn" aria-label={t('emergency.saved')} title={t('emergency.saved')}>
                    <Check size={18} />
                  </span>
                ) : (
                  <button className="icon-btn" type="button" onClick={() => void handleSave(p)} aria-label={t('emergency.save', { name: p.name })} title={t('emergency.save', { name: p.name })}>
                    <Save size={18} />
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
        )}
        </>
      )}
      {/* Argentina: el texto con todas las fuentes; Chile y Uruguay: las de su paquete. */}
      <p className="hint">
        {country === 'AR' || !data?.sources
          ? t('emergency.nearbySources')
          : t('emergency.nearbySourcesPackage', { sources: [data.sources.police, data.sources.fire, data.sources.health].filter(Boolean).join(' · ') })}
        {serviceData?.source && ` ${t('emergency.serviceSource', { what: t(`emergency.subfilters.${selection}`, { defaultValue: t(`emergency.filters.${selection}`) }), source: serviceData.source })}`}
      </p>
    </div>
  );
}
