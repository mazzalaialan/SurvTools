import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { MapPin, MapPinOff, Pencil, Warehouse } from 'lucide-react';
import { useSettings } from '@/core/settings/settings';
import { today as todayIso } from '@/modules/inventory/domain/dates';
import { useWaypoints } from '@/modules/waypoints/store';
import { Dialog } from '@/ui/Dialog';
import { BedDialog } from './BedDialog';
import { CROP_BY_ID, cropName } from './crops';
import { cellOwners, gridSize, plantsFor, recommendForBed } from './logic';
import { LayoutPlanner } from './LayoutPlanner';
import { FAMILY_COLOR } from './parts';
import { CropSelect, PlantingDialog } from './PlantingDialog';
import { newPlanting, useGarden } from './store';
import { useGardenZone, useZonePlace } from './status';
import { confirmAction } from '@/ui/confirm';

/** Dos letras para el cuadro (Ac, To, Ze…). */
const abbr = (name: string) => name.slice(0, 2);

/** Un cantero: grilla de cuadros de 30 cm, qué plantar, y el seguimiento de cada siembra. */
export function BedPage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const transplantId = search.get('transplant');
  const { bed, plantings, saveBed, deleteBed, savePlanting } = useGarden(
    useShallow((s) => ({ bed: s.beds.get(id), plantings: s.plantings, saveBed: s.saveBed, deleteBed: s.deleteBed, savePlanting: s.savePlanting })),
  );
  const loaded = useGarden((s) => s.loaded);
  const waypoints = useWaypoints((s) => s.waypoints);
  const lastFrost = useSettings((s) => s.settings.gardenLastFrost);
  const place = useZonePlace(false);
  const { zone } = useGardenZone(place);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState(false);
  const [openPlanting, setOpenPlanting] = useState<string | null>(null);
  const [planting, setPlanting] = useState<{ cropId: string; variety: string; date: string; method: 'direct' | 'nursery' } | null>(null);
  const today = todayIso();
  const transplanting = transplantId ? plantings.get(transplantId) : undefined;

  const all = useMemo(() => [...plantings.values()], [plantings]);
  const owners = useMemo(() => (bed ? cellOwners(bed, all) : new Map()), [bed, all]);
  const recs = useMemo(() => (bed ? recommendForBed(bed, all, { zone, today, lastFrost }) : []), [bed, all, zone, today, lastFrost]);
  if (!loaded) return null;
  if (!bed) return <Navigate to="/garden/beds" replace />;

  const { cols, rows } = gridSize(bed);
  const here = all.filter((p) => p.bedId === bed.id);
  const current = here.filter((p) => p.status !== 'done').sort((a, b) => a.sownOn.localeCompare(b.sownOn));
  const history = here.filter((p) => p.status === 'done').sort((a, b) => (b.endedOn ?? '').localeCompare(a.endedOn ?? ''));
  const wp = bed.waypointId ? waypoints.get(bed.waypointId) : undefined;
  const sunPlace = wp ? { lat: wp.lat, lon: wp.lon, alt: wp.alt } : place ? { lat: place.lat, lon: place.lon } : null;
  const ownerCrops = new Map<number, string>([...owners].map(([cell, p]) => [cell, p.cropId]));

  function tap(cell: number) {
    const owner = owners.get(cell);
    if (owner && selected.size === 0) {
      setOpenPlanting(owner.id);
      return;
    }
    if (owner) return;
    const next = new Set(selected);
    if (next.has(cell)) next.delete(cell);
    else next.add(cell);
    setSelected(next);
  }

  async function placeTransplant() {
    if (!transplanting) return;
    await savePlanting({ ...transplanting, bedId: bed!.id, cells: [...selected], transplantedOn: today, status: 'growing' });
    setSelected(new Set());
    search.delete('transplant');
    setSearch(search, { replace: true });
  }

  async function plant() {
    if (!planting?.cropId) return;
    const p = newPlanting(planting.cropId, planting.date, {
      bedId: bed!.id,
      cells: [...selected],
      method: planting.method,
      variety: planting.variety.trim(),
      // Sembrado directo o trasplantado hoy (plantines comprados o de otro almácigo).
      transplantedOn: planting.method === 'nursery' ? planting.date : null,
      status: 'growing',
    });
    await savePlanting(p);
    setPlanting(null);
    setSelected(new Set());
  }

  const chosenCrop = planting ? CROP_BY_ID.get(planting.cropId) : undefined;

  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="page-title" style={{ flex: 1, margin: 0 }}>
          {bed.name}
        </h1>
        <button className="icon-btn" type="button" onClick={() => setEditing(true)} aria-label={t('garden.editBed')}>
          <Pencil size={20} />
        </button>
      </div>
      <p className="hint" style={{ margin: 0 }}>
        {t('garden.bedSummary', { w: bed.widthCm, l: bed.lengthCm, cells: cols * rows, sun: bed.sunHours })}
        {bed.greenhouse && (
          <>
            {' · '}
            <Warehouse size={14} aria-hidden /> {t('garden.greenhouse')}
          </>
        )}
      </p>
      <p className="hint" style={{ margin: 0 }} data-testid="bed-place">
        {wp ? (
          <>
            <MapPin size={14} aria-hidden /> {wp.name}
          </>
        ) : (
          <>
            <MapPinOff size={14} aria-hidden /> {bed.greenhouse ? t('garden.noPlace') : t('garden.noPlaceWarn')}
          </>
        )}
      </p>

      {transplanting && (
        <div className="warning-box" data-testid="transplant-banner">
          {t('garden.transplantPick', { crop: cropName(CROP_BY_ID.get(transplanting.cropId)!, lang) })}
        </div>
      )}

      <section className="card stack" aria-label={t('garden.grid')}>
        <div className="garden-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} data-testid="bed-grid">
          {Array.from({ length: cols * rows }, (_, cell) => {
            const owner = owners.get(cell);
            const crop = owner ? CROP_BY_ID.get(owner.cropId) : undefined;
            const isSel = selected.has(cell);
            const label = crop ? cropName(crop, lang) : t('garden.emptyCell');
            return (
              <button
                key={cell}
                type="button"
                className={`garden-cell${isSel ? ' selected' : ''}${owner ? ' taken' : ''}`}
                style={crop ? { background: FAMILY_COLOR[crop.family] } : undefined}
                onClick={() => tap(cell)}
                aria-pressed={owner ? undefined : isSel}
                aria-label={`${t('garden.cell', { row: Math.floor(cell / cols) + 1, col: (cell % cols) + 1 })}: ${label}`}
                data-testid={`cell-${cell}`}
              >
                {crop ? abbr(cropName(crop, lang)) : ''}
              </button>
            );
          })}
        </div>
        <p className="hint" style={{ margin: 0 }}>{selected.size ? t('garden.selectedCells', { count: selected.size }) : t('garden.gridTapHint')}</p>
        {selected.size > 0 && (
          <div className="row-end" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" type="button" onClick={() => setSelected(new Set())}>
              {t('common.cancel')}
            </button>
            {transplanting ? (
              <button className="btn btn-primary" type="button" onClick={() => void placeTransplant()} data-testid="place-transplant">
                {t('garden.placeHere')}
              </button>
            ) : (
              <button className="btn btn-primary" type="button" onClick={() => setPlanting({ cropId: recs[0]?.crop.id ?? '', variety: '', date: today, method: 'direct' })} data-testid="plant-here">
                {t('garden.plantHere')}
              </button>
            )}
          </div>
        )}
      </section>

      {current.length > 0 && (
        <section className="card stack">
          <h2 className="section-title" style={{ margin: 0 }}>{t('garden.planted')}</h2>
          <ul className="list list-flat" data-testid="planted-list">
            {current.map((p) => {
              const crop = CROP_BY_ID.get(p.cropId);
              return (
                <li key={p.id}>
                  <button className="list-row" type="button" onClick={() => setOpenPlanting(p.id)}>
                    <span className="garden-dot" style={{ background: crop ? FAMILY_COLOR[crop.family] : undefined }} aria-hidden />
                    <span className="list-main">
                      <span className="list-title">
                        {crop ? cropName(crop, lang) : p.cropId}
                        {p.variety ? ` · ${p.variety}` : ''}
                      </span>
                      <span className="list-sub">
                        {t(`garden.status.${p.status}`)} · {crop ? t('garden.plantsFit', { count: plantsFor(crop, p.cells.length) }) : ''}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <LayoutPlanner
        bed={bed}
        place={sunPlace}
        owners={ownerCrops}
        suggested={recs.map((r) => r.crop.id)}
        onPlant={(cropId, cells) => {
          setSelected(new Set(cells));
          setPlanting({ cropId, variety: '', date: today, method: 'direct' });
        }}
      />

      <section className="card stack" aria-labelledby="bed-recs">
        <h2 id="bed-recs" className="section-title" style={{ margin: 0 }}>{t('garden.recommendations')}</h2>
        <p className="hint" style={{ margin: 0 }}>{t('garden.recommendationsHint', { zone: t(`garden.zones.${zone}`) })}</p>
        {recs.length === 0 ? (
          <p className="hint">{t('garden.noRecommendations')}</p>
        ) : (
          <ul className="list list-flat" data-testid="bed-recs-list">
            {recs.slice(0, 10).map((r) => (
              <li key={r.crop.id}>
                <Link className="list-row" to={`/garden/crops/${r.crop.id}`}>
                  <span className="garden-dot" style={{ background: FAMILY_COLOR[r.crop.family] }} aria-hidden />
                  <span className="list-main">
                    <span className="list-title">{cropName(r.crop, lang)}</span>
                    <span className="list-sub">
                      {t(`garden.action.${r.action}`)} {r.when === 0 ? t('garden.now') : t('garden.nextMonthShort')}
                      {r.friends.length > 0 && ` · ${t('garden.goesWith', { list: r.friends.map((c) => cropName(c, lang)).join(', ') })}`}
                      {r.foes.length > 0 && ` · ${t('garden.clashesWith', { list: r.foes.map((c) => cropName(c, lang)).join(', ') })}`}
                      {r.sameFamilyRecently && ` · ${t('garden.sameFamily')}`}
                      {r.goodRotation && ` · ${t('garden.goodRotation')}`}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {history.length > 0 && (
        <details className="card">
          <summary>{t('garden.history', { count: history.length })}</summary>
          <ul className="list list-flat" style={{ marginTop: 8 }}>
            {history.map((p) => {
              const crop = CROP_BY_ID.get(p.cropId);
              return (
                <li key={p.id}>
                  <button className="list-row" type="button" onClick={() => setOpenPlanting(p.id)}>
                    <span className="list-main">
                      <span className="list-title">{crop ? cropName(crop, lang) : p.cropId}</span>
                      <span className="list-sub">
                        {p.sownOn} → {p.endedOn}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      {editing && (
        <BedDialog
          bed={bed}
          onClose={() => setEditing(false)}
          onSave={async (b) => {
            await saveBed(b);
            setEditing(false);
          }}
          onDelete={async () => {
            if (!(await confirmAction(t('garden.confirmDeleteBed', { name: bed.name })))) return;
            void deleteBed(bed.id).then(() => navigate('/garden/beds', { replace: true }));
          }}
        />
      )}
      {openPlanting && <PlantingDialog plantingId={openPlanting} onClose={() => setOpenPlanting(null)} />}
      {planting && (
        <Dialog
          title={t('garden.plantHere')}
          onClose={() => setPlanting(null)}
          footer={
            <button className="btn btn-primary" type="button" disabled={!planting.cropId} onClick={() => void plant()} data-testid="save-planting">
              {t('common.save')}
            </button>
          }
        >
          <div className="field">
            <label htmlFor="plant-crop">{t('garden.crop')}</label>
            <CropSelect id="plant-crop" value={planting.cropId} onChange={(cropId) => setPlanting({ ...planting, cropId })} preferred={recs.slice(0, 8).map((r) => r.crop.id)} />
          </div>
          {chosenCrop && <p className="hint" style={{ margin: 0 }}>{t('garden.plantsFit', { count: plantsFor(chosenCrop, selected.size) })}</p>}
          <div className="field">
            <label htmlFor="plant-variety">{t('garden.variety')}</label>
            <input id="plant-variety" className="input" value={planting.variety} onChange={(e) => setPlanting({ ...planting, variety: e.target.value })} maxLength={80} />
          </div>
          <div className="field">
            <label htmlFor="plant-method">{t('garden.how')}</label>
            <select id="plant-method" className="select" value={planting.method} onChange={(e) => setPlanting({ ...planting, method: e.target.value as 'direct' | 'nursery' })}>
              <option value="direct">{t('garden.methodDirect')}</option>
              <option value="nursery">{t('garden.methodSeedling')}</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="plant-date">{t('garden.date')}</label>
            <input id="plant-date" className="input" type="date" value={planting.date} onChange={(e) => setPlanting({ ...planting, date: e.target.value })} />
          </div>
        </Dialog>
      )}
    </div>
  );
}
