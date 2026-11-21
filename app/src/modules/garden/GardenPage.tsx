import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { CloudRain, Droplets, MapPin, MapPinOff, Plus, Snowflake, Sprout, Warehouse } from 'lucide-react';
import { useSettings } from '@/core/settings/settings';
import { today as todayIso } from '@/modules/inventory/domain/dates';
import { useWaypoints } from '@/modules/waypoints/store';
import { CROP_BY_ID, cropName } from './crops';
import { gridSize, type GardenTask } from './logic';
import { BedDialog } from './BedDialog';
import { NurseryDialog, PlantingDialog } from './PlantingDialog';
import { newBed, useGarden } from './store';
import { useGardenStatus, useZonePlace, type GardenStatus } from './status';
import { fetchFrostDates, type FrostDates } from './frostDates';
import type { GardenBed } from '@/core/model/types';

/** Tareas que ya corresponden. */
export function GardenTaskList({ tasks, onOpen }: { tasks: GardenTask[]; onOpen: (plantingId: string) => void }) {
  const { t, i18n } = useTranslation();
  const beds = useGarden((s) => s.beds);
  if (!tasks.length) return null;
  return (
    <ul className="list" data-testid="garden-tasks">
      {tasks.map((task) => {
        const bed = task.planting.bedId ? beds.get(task.planting.bedId) : null;
        return (
          <li key={task.id}>
            <button className="list-row" type="button" onClick={() => onOpen(task.planting.id)}>
              <Sprout size={20} aria-hidden />
              <span className="list-main">
                <span className="list-title">{t(`garden.tasks.${task.kind}`, { crop: cropName(task.crop, i18n.language) })}</span>
                <span className="list-sub">{bed ? bed.name : t('garden.inNursery')}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Avisos de helada y de riego de cada lugar, y canteros sin ubicación. */
export function GardenWeatherNotices({ status, compact = false }: { status: GardenStatus; compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  const dayFmt = new Intl.DateTimeFormat(i18n.language, { weekday: 'long', timeZone: 'UTC' });
  const today = todayIso();
  const many = status.places.length > 1;
  return (
    <>
      {status.places.map((p) => (
        <div key={p.key} className="stack" style={{ gap: 8 }}>
          {p.frost && (
            <div className="warning-box garden-notice" role="alert" data-testid="garden-frost">
              <Snowflake size={20} aria-hidden />
              <span>
                {many && <strong>{p.label}: </strong>}
                {t('garden.frostAlert', {
                  when: p.frost.date === today ? t('garden.tonight') : dayFmt.format(new Date(`${p.frost.date}T12:00:00Z`)),
                  min: Math.round(p.frost.min),
                  crops: p.frost.crops.map((c) => cropName(c, i18n.language)).join(', '),
                })}
                {p.frost.clearCalm && ` ${t('garden.frostClearCalm')}`}
              </span>
            </div>
          )}
          {p.water?.needsWater && (
            <div className="warning-box garden-notice" role="alert" data-testid="garden-water">
              <Droplets size={20} aria-hidden />
              <span style={{ flex: 1 }}>
                {many && <strong>{p.label}: </strong>}
                {t('garden.waterAlert', { mm: Math.round(p.water.deficitMm), rain: p.water.rainMm })}
              </span>
              <button className="btn" type="button" onClick={() => void update({ gardenWateredAt: { ...settings.gardenWateredAt, [p.key]: new Date().toISOString() } })}>
                {t('garden.watered')}
              </button>
            </div>
          )}
          {p.greenhouseWater?.needsWater && (
            <div className="warning-box garden-notice" role="alert" data-testid="garden-water-greenhouse">
              <Droplets size={20} aria-hidden />
              <span style={{ flex: 1 }}>
                {many && <strong>{p.label}: </strong>}
                {t('garden.waterGreenhouseAlert', { mm: Math.round(p.greenhouseWater.deficitMm) })}
              </span>
              <button className="btn" type="button" onClick={() => void update({ gardenWateredAt: { ...settings.gardenWateredAt, [p.key]: new Date().toISOString() } })}>
                {t('garden.watered')}
              </button>
            </div>
          )}
          {!compact && p.water && !p.water.needsWater && (
            <p className="hint garden-notice" style={{ margin: 0 }} data-testid="garden-water-ok">
              <CloudRain size={18} aria-hidden /> {many && <strong>{p.label}: </strong>}
              {t('garden.waterOk', { mm: Math.round(p.water.deficitMm), limit: p.water.thresholdMm })}
            </p>
          )}
        </div>
      ))}
      {!compact && status.unplacedGreenhouse.length > 0 && settings.gardenWaterAlerts && (
        <p className="warning-box" style={{ margin: 0 }} data-testid="garden-unplaced-greenhouse">
          <MapPinOff size={18} aria-hidden /> {t('garden.unplacedGreenhouse', { beds: status.unplacedGreenhouse.map((b) => b.name).join(', ') })}
        </p>
      )}
      {!compact && status.unplaced.length > 0 && (settings.gardenFrostAlerts || settings.gardenWaterAlerts) && (
        <p className="warning-box" style={{ margin: 0 }} data-testid="garden-unplaced">
          <MapPinOff size={18} aria-hidden /> {t('garden.unplaced', { beds: status.unplaced.map((b) => b.name).join(', ') })}
        </p>
      )}
    </>
  );
}

function GardenSettings() {
  const { t } = useTranslation();
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  // Última helada del lugar de la huerta con 5 años de histórico (en vez de cargarla a mano).
  const place = useZonePlace();
  const [frost, setFrost] = useState<{ state: 'idle' | 'loading' | 'error' } | { state: 'done'; dates: FrostDates }>({ state: 'idle' });
  const fmt = (mmdd: string | null) => (mmdd ? `${mmdd.slice(3, 5)}/${mmdd.slice(0, 2)}` : '—');
  async function calcFrost() {
    if (!place) return;
    setFrost({ state: 'loading' });
    try {
      const dates = await fetchFrostDates(settings.weatherUrl, place.lat, place.lon);
      setFrost({ state: 'done', dates });
      // La fecha segura: la más tardía de los 5 años. Donde hiela todo el año no hay fecha (todo lo sensible, bajo cubierta).
      if (!dates.allYear && dates.lastLatest) await update({ gardenLastFrost: dates.lastLatest });
    } catch {
      setFrost({ state: 'error' });
    }
  }
  return (
    <details className="card" data-testid="garden-settings">
      <summary>{t('garden.settings')}</summary>
      <div className="stack" style={{ marginTop: 12 }}>
        <div className="field">
          <label htmlFor="garden-frost-date">{t('garden.lastFrost')}</label>
          <input
            id="garden-frost-date"
            className="input"
            type="date"
            value={settings.gardenLastFrost ? `2026-${settings.gardenLastFrost}` : ''}
            onChange={(e) => void update({ gardenLastFrost: e.target.value ? e.target.value.slice(5) : null })}
          />
          <p className="hint">{t('garden.lastFrostHint')}</p>
          <button className="btn" type="button" onClick={() => void calcFrost()} disabled={!place || !navigator.onLine || frost.state === 'loading'} data-testid="garden-frost-calc">
            <Snowflake size={18} aria-hidden /> {frost.state === 'loading' ? t('garden.frostCalcLoading') : t('garden.frostCalc')}
          </button>
          {!place && <p className="hint">{t('garden.frostCalcNoPlace')}</p>}
          {frost.state === 'error' && <p className="error" role="alert">{t('garden.frostCalcError')}</p>}
          {frost.state === 'done' && (
            <p className="hint" role="status" data-testid="garden-frost-result">
              {frost.dates.allYear
                ? t('garden.frostAllYear', { years: frost.dates.years })
                : frost.dates.lastLatest
                  ? t('garden.frostResult', {
                      years: frost.dates.years,
                      lastAvg: fmt(frost.dates.lastAvg),
                      lastLatest: fmt(frost.dates.lastLatest),
                      firstAvg: fmt(frost.dates.firstAvg),
                      firstEarliest: fmt(frost.dates.firstEarliest),
                    })
                  : t('garden.frostNone', { years: frost.dates.years })}
            </p>
          )}
        </div>
        <label className="check">
          <input type="checkbox" checked={settings.gardenFrostAlerts} onChange={(e) => void update({ gardenFrostAlerts: e.target.checked })} />
          {t('garden.frostAlerts')}
        </label>
        <label className="check">
          <input type="checkbox" checked={settings.gardenWaterAlerts} onChange={(e) => void update({ gardenWaterAlerts: e.target.checked })} />
          {t('garden.waterAlerts')}
        </label>
        <p className="hint" style={{ margin: 0 }}>{t('garden.alertsHint')}</p>
      </div>
    </details>
  );
}

/** Mis canteros: estado de la huerta, canteros, almácigos y ajustes. */
export function GardenPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const transplant = search.get('transplant');
  const { beds, plantings, saveBed } = useGarden(useShallow((s) => ({ beds: s.beds, plantings: s.plantings, saveBed: s.saveBed })));
  const status = useGardenStatus();
  const waypoints = useWaypoints((s) => s.waypoints);
  const [editing, setEditing] = useState<GardenBed | null>(null);
  const [openPlanting, setOpenPlanting] = useState<string | null>(null);
  const [newNursery, setNewNursery] = useState(false);
  const bedList = useMemo(() => [...beds.values()].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)), [beds]);
  const nursery = useMemo(() => [...plantings.values()].filter((p) => p.status === 'nursery').sort((a, b) => a.sownOn.localeCompare(b.sownOn)), [plantings]);
  const countIn = (bedId: string) => [...plantings.values()].filter((p) => p.bedId === bedId && p.status !== 'done').length;

  return (
    <div className="stack">
      <h1 className="page-title">{t('modules.gardenBeds.title')}</h1>
      <GardenWeatherNotices status={status} />
      <GardenTaskList tasks={status.tasks} onOpen={setOpenPlanting} />

      {transplant && plantings.get(transplant) && (
        <div className="warning-box" data-testid="transplant-choose-bed">
          {t('garden.transplantChooseBed', { crop: cropName(CROP_BY_ID.get(plantings.get(transplant)!.cropId)!, i18n.language) })}
        </div>
      )}
      <section className="card stack" aria-labelledby="beds-title">
        <div className="page-head" style={{ marginBottom: 0 }}>
          <h2 id="beds-title" className="section-title" style={{ margin: 0, flex: 1 }}>{t('garden.beds')}</h2>
          <button className="btn" type="button" onClick={() => setEditing(newBed({ name: t('garden.bedDefault', { n: beds.size + 1 }), order: beds.size }))}>
            <Plus size={18} /> {t('garden.addBed')}
          </button>
        </div>
        {bedList.length === 0 ? (
          <p className="hint">{t('garden.noBeds')}</p>
        ) : (
          <ul className="list list-flat" data-testid="bed-list">
            {bedList.map((b) => {
              const { cols, rows } = gridSize(b);
              return (
                <li key={b.id}>
                  <Link className="list-row" to={`/garden/beds/${b.id}${transplant ? `?transplant=${transplant}` : ''}`}>
                    {b.greenhouse ? <Warehouse size={20} aria-hidden /> : <Sprout size={20} aria-hidden />}
                    <span className="list-main">
                      <span className="list-title">{b.name}</span>
                      <span className="list-sub">
                        {t('garden.bedSummary', { w: b.widthCm, l: b.lengthCm, cells: cols * rows, sun: b.sunHours })}
                        {b.greenhouse ? ` · ${t('garden.greenhouse')}` : ''}
                      </span>
                      <span className="list-sub">
                        {b.waypointId && waypoints.get(b.waypointId) ? (
                          <>
                            <MapPin size={14} aria-hidden /> {waypoints.get(b.waypointId)!.name}
                          </>
                        ) : (
                          <>
                            <MapPinOff size={14} aria-hidden /> {t('garden.noPlace')}
                          </>
                        )}
                      </span>
                    </span>
                    <span className="pill">{t('garden.plantingsCount', { count: countIn(b.id) })}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card stack" aria-labelledby="nursery-title">
        <div className="page-head" style={{ marginBottom: 0 }}>
          <h2 id="nursery-title" className="section-title" style={{ margin: 0, flex: 1 }}>{t('garden.nursery')}</h2>
          <button className="btn" type="button" onClick={() => setNewNursery(true)}>
            <Plus size={18} /> {t('garden.addNursery')}
          </button>
        </div>
        {nursery.length === 0 ? (
          <p className="hint">{t('garden.noNursery')}</p>
        ) : (
          <ul className="list list-flat" data-testid="nursery-list">
            {nursery.map((p) => {
              const crop = CROP_BY_ID.get(p.cropId);
              return (
                <li key={p.id}>
                  <button className="list-row" type="button" onClick={() => setOpenPlanting(p.id)}>
                    <span className="list-main">
                      <span className="list-title">
                        {crop ? cropName(crop, i18n.language) : p.cropId}
                        {p.variety ? ` · ${p.variety}` : ''}
                      </span>
                      <span className="list-sub">{t('garden.sownOn', { date: p.sownOn })}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Link className="btn btn-block" to="/garden/calendar">
        {t('modules.gardenCalendar.title')}
      </Link>
      <GardenSettings />

      {editing && (
        <BedDialog
          bed={editing}
          onClose={() => setEditing(null)}
          onSave={async (b) => {
            await saveBed(b);
            setEditing(null);
            navigate(`/garden/beds/${b.id}`);
          }}
        />
      )}
      {openPlanting && <PlantingDialog plantingId={openPlanting} onClose={() => setOpenPlanting(null)} />}
      {newNursery && <NurseryDialog onClose={() => setNewNursery(false)} />}
    </div>
  );
}
