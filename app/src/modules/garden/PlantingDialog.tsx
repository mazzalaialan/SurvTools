import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { Trash2 } from 'lucide-react';
import type { Planting } from '@/core/model/types';
import { today as todayIso } from '@/modules/inventory/domain/dates';
import { useInventory } from '@/modules/inventory/store';
import { WaypointField } from '@/modules/waypoints/WaypointField';
import { Dialog } from '@/ui/Dialog';
import { numToInput, parseNum } from '@/ui/numbers';
import { SinglePhoto } from '@/ui/SinglePhoto';
import { CROP_BY_ID, CROPS, cropName, text } from './crops';
import { harvestEnd, harvestStart, plantsFor } from './logic';
import { harvestLocation, newPlanting, useGarden } from './store';
import { confirmAction } from '@/ui/confirm';

const UNITS = ['kg', 'u', 'atados'] as const;

/** Cosecha: cuánto y, si se quiere, sumarla al inventario. */
function HarvestForm({ planting }: { planting: Planting }) {
  const { t, i18n } = useTranslation();
  const crop = CROP_BY_ID.get(planting.cropId)!;
  const addHarvest = useGarden((s) => s.addHarvest);
  const locations = useInventory((s) => s.locations);
  const roots = [...locations.values()].sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name));
  const [date, setDate] = useState(todayIso());
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState<string>(crop.harvestUnit);
  const [toInventory, setToInventory] = useState(true);
  const bedLocation = useGarden((s) => (planting.bedId ? s.beds.get(planting.bedId)?.locationId : null));
  // Por defecto, la ubicación del cantero (si tiene y existe); si no, la primera.
  const [locationId, setLocationId] = useState((bedLocation && locations.has(bedLocation) ? bedLocation : null) ?? roots[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const q = parseNum(qty);
  const valid = q !== null && q > 0 && !!date;

  async function save() {
    if (!valid) return;
    setBusy(true);
    try {
      const locId = locationId || (await harvestLocation(t('garden.pantry'))).id;
      const name = `${cropName(crop, i18n.language)}${planting.variety ? ` ${planting.variety}` : ''} (${t('garden.fromGarden')})`;
      await addHarvest(planting.id, { date, quantity: q!, unit }, toInventory ? { locationId: locId, itemName: name } : null);
      setQty('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 8 }} data-testid="harvest-form">
      <div className="grid-2">
        <div className="field">
          <label htmlFor="harvest-qty">{t('garden.harvestQty')}</label>
          <div className="input-group">
            <input id="harvest-qty" className="input" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
            <select className="select" value={unit} onChange={(e) => setUnit(e.target.value)} aria-label={t('garden.harvestUnit')}>
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {t(`garden.units.${u}`)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="harvest-date">{t('garden.harvestDate')}</label>
          <input id="harvest-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      <label className="check">
        <input type="checkbox" checked={toInventory} onChange={(e) => setToInventory(e.target.checked)} data-testid="harvest-to-inventory" />
        {t('garden.toInventory')}
      </label>
      {toInventory && (
        <div className="field">
          <label htmlFor="harvest-location">{t('garden.harvestLocation')}</label>
          {roots.length ? (
            <select id="harvest-location" className="select" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              {roots.map((l) => (
                <option key={l.id} value={l.id}>
                  {'· '.repeat(l.depth - 1)}
                  {l.name}
                </option>
              ))}
            </select>
          ) : (
            <p className="hint">{t('garden.harvestNewLocation', { name: t('garden.pantry') })}</p>
          )}
        </div>
      )}
      <button className="btn btn-primary" type="button" onClick={() => void save()} disabled={!valid || busy}>
        {t('garden.addHarvest')}
      </button>
    </div>
  );
}

/** Seguimiento de una siembra: estado, fechas, cosecha, notas y foto. */
export function PlantingDialog({ plantingId, onClose }: { plantingId: string; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { planting, beds, photo, savePlanting, deletePlanting, removeHarvest, setPhoto, removePhoto } = useGarden(
    useShallow((s) => ({
      planting: s.plantings.get(plantingId),
      beds: s.beds,
      photo: s.photos.get(plantingId),
      savePlanting: s.savePlanting,
      deletePlanting: s.deletePlanting,
      removeHarvest: s.removeHarvest,
      setPhoto: s.setPhoto,
      removePhoto: s.removePhoto,
    })),
  );
  const [notes, setNotes] = useState(planting?.notes ?? '');
  const crop = planting && CROP_BY_ID.get(planting.cropId);
  if (!planting || !crop) return null;
  const name = cropName(crop, i18n.language);
  const bed = planting.bedId ? beds.get(planting.bedId) : null;
  const today = todayIso();
  const fmt = (d: string) => new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));
  const set = (changes: Partial<Planting>) => void savePlanting({ ...planting, ...changes });

  return (
    <Dialog
      title={`${name}${planting.variety ? ` · ${planting.variety}` : ''}`}
      onClose={onClose}
      footer={
        <button
          className="btn btn-danger-outline"
          type="button"
          onClick={async () => {
            if (!(await confirmAction(t('garden.confirmDeletePlanting', { name })))) return;
            void deletePlanting(planting.id).then(onClose);
          }}
        >
          {t('common.delete')}
        </button>
      }
    >
      <p className="hint" style={{ margin: 0 }} data-testid="planting-status">
        {t(`garden.status.${planting.status}`)} · {bed ? bed.name : t('garden.inNursery')}
        {bed && planting.cells.length ? ` · ${t('garden.plantsFit', { count: plantsFor(crop, planting.cells.length) })}` : ''}
      </p>
      <dl className="garden-facts">
        <dt>{planting.method === 'nursery' ? t('garden.nurseryOn') : t('garden.sownOnLabel')}</dt>
        <dd>{fmt(planting.sownOn)}</dd>
        {planting.transplantedOn && (
          <>
            <dt>{t('garden.transplantedOn')}</dt>
            <dd>{fmt(planting.transplantedOn)}</dd>
          </>
        )}
        {planting.status !== 'nursery' && planting.status !== 'done' && (
          <>
            <dt>{t('garden.harvestFrom')}</dt>
            <dd>
              {crop.firstHarvestYear ? t('garden.fromYear', { year: crop.firstHarvestYear }) : `${fmt(harvestStart(planting, crop))}${crop.perennial ? '' : ` – ${fmt(harvestEnd(planting, crop))}`}`}
            </dd>
          </>
        )}
        {planting.endedOn && (
          <>
            <dt>{t('garden.endedOn')}</dt>
            <dd>{fmt(planting.endedOn)}</dd>
          </>
        )}
      </dl>
      <p className="hint" style={{ margin: 0 }}>{text(crop.harvest, i18n.language)}</p>

      {planting.status === 'nursery' && <NurseryPlace value={planting.nurseryWaypointId ?? null} onChange={(id) => set({ nurseryWaypointId: id })} name={cropName(crop, i18n.language)} />}
      {planting.status === 'nursery' && (
        <button className="btn btn-primary" type="button" onClick={() => {
            onClose();
            navigate(`/garden/beds?transplant=${planting.id}`);
          }} data-testid="transplant">
          {t('garden.transplantNow')}
        </button>
      )}
      {planting.status === 'growing' && (
        <button className="btn" type="button" onClick={() => set({ status: 'harvesting' })}>
          {t('garden.startHarvest')}
        </button>
      )}
      {(planting.status === 'growing' || planting.status === 'harvesting') && (
        <>
          <h3 className="section-title" style={{ margin: 0 }}>{t('garden.harvestTitle')}</h3>
          <HarvestForm planting={planting} />
        </>
      )}
      {planting.harvests.length > 0 && (
        <ul className="list" data-testid="harvest-list">
          {planting.harvests.map((h) => (
            <li key={h.id} className="list-row">
              <span className="list-main">
                <span className="list-title">
                  {numToInput(h.quantity)} {t(`garden.units.${h.unit}`, { defaultValue: h.unit })}
                </span>
                <span className="list-sub">
                  {fmt(h.date)}
                  {h.lotId ? ` · ${t('garden.inInventory')}` : ''}
                </span>
              </span>
              <button className="icon-btn" type="button" onClick={() => void removeHarvest(planting.id, h.id)} aria-label={t('garden.removeHarvest')}>
                <Trash2 size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {planting.status === 'harvesting' && (
        <button className="btn" type="button" onClick={() => set({ status: 'done', endedOn: today })} data-testid="finish-planting">
          {t('garden.finish')}
        </button>
      )}

      <div className="field">
        <label htmlFor="planting-notes">{t('garden.notes')}</label>
        <textarea id="planting-notes" className="textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== planting.notes && set({ notes })} />
      </div>
      <SinglePhoto photo={photo} alt={name} onSet={(img) => setPhoto(planting.id, img)} onRemove={() => removePhoto(planting.id)} testId="planting-photo" />
    </Dialog>
  );
}

/** Elegir un cultivo: los recomendados primero, después todos. */
export function CropSelect({ id, value, onChange, preferred }: { id: string; value: string; onChange: (v: string) => void; preferred?: string[] }) {
  const { t, i18n } = useTranslation();
  const sorted = [...CROPS].sort((a, b) => cropName(a, i18n.language).localeCompare(cropName(b, i18n.language)));
  const pref = (preferred ?? []).map((x) => CROP_BY_ID.get(x)).filter((c) => !!c);
  return (
    <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="" disabled>
        {t('garden.chooseCrop')}
      </option>
      {pref.length > 0 && (
        <optgroup label={t('garden.recommendedNow')}>
          {pref.map((c) => (
            <option key={`p-${c.id}`} value={c.id}>
              {cropName(c, i18n.language)}
            </option>
          ))}
        </optgroup>
      )}
      <optgroup label={t('garden.allCrops')}>
        {sorted.map((c) => (
          <option key={c.id} value={c.id}>
            {cropName(c, i18n.language)}
          </option>
        ))}
      </optgroup>
    </select>
  );
}

/**
 * ¿El almácigo está afuera? Solo así recibe los avisos de helada y riego (adentro de casa no hacen falta):
 * se marca y se elige dónde está (un waypoint, o uno nuevo con el GPS).
 */
function NurseryPlace({ value, onChange, name }: { value: string | null; onChange: (id: string | null) => void; name: string }) {
  const { t } = useTranslation();
  const [outside, setOutside] = useState(!!value);
  return (
    <div className="stack">
      <label className="check">
        <input type="checkbox" checked={outside} onChange={(e) => { setOutside(e.target.checked); if (!e.target.checked) onChange(null); }} data-testid="nursery-outside" />
        {t('garden.nurseryOutside')}
      </label>
      {outside && <WaypointField id="nursery-place" label={t('garden.nurseryPlace')} value={value} onChange={onChange} newName={name} hint={t('garden.nurseryPlaceHint')} />}
    </div>
  );
}

/** Nuevo almácigo (todavía sin cantero). */
export function NurseryDialog({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const savePlanting = useGarden((s) => s.savePlanting);
  const [cropId, setCropId] = useState('');
  const [variety, setVariety] = useState('');
  const [date, setDate] = useState(todayIso());
  const [placeId, setPlaceId] = useState<string | null>(null);
  const nurseryCrops = CROPS.filter((c) => c.nurseryDays && !c.perennial).map((c) => c.id);
  return (
    <Dialog
      title={t('garden.addNursery')}
      onClose={onClose}
      footer={
        <button
          className="btn btn-primary"
          type="button"
          disabled={!cropId || !date}
          onClick={() => void savePlanting(newPlanting(cropId, date, { method: 'nursery', status: 'nursery', variety: variety.trim(), nurseryWaypointId: placeId })).then(onClose)}
        >
          {t('common.save')}
        </button>
      }
    >
      <div className="field">
        <label htmlFor="nursery-crop">{t('garden.crop')}</label>
        <CropSelect id="nursery-crop" value={cropId} onChange={setCropId} preferred={nurseryCrops} />
      </div>
      <div className="field">
        <label htmlFor="nursery-variety">{t('garden.variety')}</label>
        <input id="nursery-variety" className="input" value={variety} onChange={(e) => setVariety(e.target.value)} maxLength={80} />
      </div>
      <div className="field">
        <label htmlFor="nursery-date">{t('garden.nurseryOn')}</label>
        <input id="nursery-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <NurseryPlace value={placeId} onChange={setPlaceId} name={CROP_BY_ID.get(cropId) ? cropName(CROP_BY_ID.get(cropId)!, i18n.language) : ''} />
    </Dialog>
  );
}
