import { unitText } from '../domain/unitText';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { newEntity } from '@/core/model/entity';
import type { ControlType, Item, Lot } from '@/core/model/types';
import { useSettings } from '@/core/settings/settings';
import { toGrams, weightForInput, type WeightUnit } from '@/core/units/units';
import { Dialog } from '@/ui/Dialog';
import { numToInput, parseNum } from '@/ui/numbers';
import { WeightInput } from '@/ui/WeightInput';
import { lotDueDate } from '../domain/alerts';
import { isPackaged, packagedQuantity } from '../domain/stock';
import { formatDay, useLocationOptions } from '../selectors';
import { useInventory } from '../store';
import { confirmAction } from '@/ui/confirm';

interface Props {
  item: Item;
  controlType: ControlType;
  lot: Lot | null;
  /** Ubicación preseleccionada para un lote nuevo (ej.: al cargar desde un botiquín). */
  defaultLocationId?: string;
  onClose: () => void;
}

type Mode = 'packages' | 'direct';

const str = numToInput;

export function LotDialog({ item, controlType, lot, defaultLocationId, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const { saveLot, deleteLot, lots } = useInventory();
  const units = useSettings((s) => s.settings.units);
  const locationOptions = useLocationOptions();

  // Un lote nuevo copia el envase del último lote envasado del artículo (ej.: otra botella de 6 L).
  const template =
    lot ??
    [...lots.values()]
      .filter((l) => l.itemId === item.id && isPackaged(l))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ??
    null;
  const tareInitial = weightForInput(template?.packageTareGrams ?? null, units);

  const [mode, setMode] = useState<Mode>(template && isPackaged(template) ? 'packages' : 'direct');
  const [locationId, setLocationId] = useState(lot?.locationId ?? defaultLocationId ?? locationOptions[0]?.id ?? '');
  const [quantity, setQuantity] = useState(str(lot?.quantity ?? 1));
  const [packageCount, setPackageCount] = useState(lot ? str(lot.packageCount) : '1');
  const [packageSize, setPackageSize] = useState(str(template?.packageSize ?? null));
  const [packageName, setPackageName] = useState(template?.packageName ?? '');
  const [tare, setTare] = useState(tareInitial.value);
  const [tareUnit, setTareUnit] = useState<WeightUnit>(tareInitial.unit);
  const [expiryDate, setExpiryDate] = useState(lot?.expiryDate ?? '');
  const [manufactureDate, setManufactureDate] = useState(lot?.manufactureDate ?? '');
  const [shelfLifeYears, setShelfLifeYears] = useState(lot?.shelfLifeMonths ? str(+(lot.shelfLifeMonths / 12).toFixed(2)) : '');
  const [capacityTotal, setCapacityTotal] = useState(str(lot?.capacityTotal ?? null));
  const [capacityRemaining, setCapacityRemaining] = useState(str(lot?.capacityRemaining ?? null));
  const [capacityUnit, setCapacityUnit] = useState(lot?.capacityUnit ?? '');
  const [notes, setNotes] = useState(lot?.notes ?? '');

  const count = parseNum(packageCount);
  const size = parseNum(packageSize);
  const tareValue = parseNum(tare);
  const packaged = mode === 'packages';
  const years = parseNum(shelfLifeYears);
  const total = packaged ? (count !== null && size !== null ? packagedQuantity(count, size) : null) : parseNum(quantity);

  const fields = {
    locationId,
    quantity: total ?? 0,
    packageCount: packaged ? count : null,
    packageSize: packaged ? size : null,
    packageName: packaged ? packageName.trim() || null : null,
    packageTareGrams: packaged && tareValue !== null ? toGrams(tareValue, tareUnit) : null,
    expiryDate: expiryDate || null,
    manufactureDate: manufactureDate || null,
    shelfLifeMonths: years === null ? null : Math.round(years * 12),
    capacityTotal: parseNum(capacityTotal),
    capacityRemaining: parseNum(capacityRemaining),
    capacityUnit: capacityUnit.trim() || null,
    notes,
  };
  const computedDue = controlType === 'shelfLife' ? lotDueDate(fields, 'shelfLife') : null;
  const fmt = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 3 });
  const unit = unitText(item.unit, t('items.units'));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await saveLot(lot ? { ...lot, ...fields } : newEntity<Lot>({ itemId: item.id, ...fields }));
    onClose();
  }

  async function handleDelete() {
    if (!lot || !(await confirmAction(t('lots.confirmDelete')))) return;
    await deleteLot(lot.id);
    onClose();
  }

  return (
    <Dialog title={lot ? t('lots.edit') : t('lots.add')} onClose={onClose}>
      <form className="stack" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="lot-location">{t('lots.location')}</label>
          <select id="lot-location" className="select" required value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            {locationOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <label className="check">
          <input type="checkbox" checked={packaged} onChange={(e) => setMode(e.target.checked ? 'packages' : 'direct')} />
          {t('lots.byPackages')}
        </label>

        {packaged ? (
          <fieldset className="fieldset stack">
            <legend>{t('lots.packagesLegend')}</legend>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="lot-pkg-count">{t('lots.packageCount')}</label>
                <input id="lot-pkg-count" className="input" inputMode="decimal" required value={packageCount} onChange={(e) => setPackageCount(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="lot-pkg-size">{t('lots.packageSize', { unit })}</label>
                <input id="lot-pkg-size" className="input" inputMode="decimal" required value={packageSize} onChange={(e) => setPackageSize(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="lot-pkg-name">{t('lots.packageName')}</label>
              <input id="lot-pkg-name" className="input" placeholder={t('lots.packageNamePlaceholder')} value={packageName} onChange={(e) => setPackageName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="lot-pkg-tare">{t('lots.packageTare')}</label>
              <WeightInput
                id="lot-pkg-tare"
                value={tare}
                unit={tareUnit}
                onChange={(v, u) => {
                  setTare(v);
                  setTareUnit(u);
                }}
              />
              <p className="hint">{t('lots.packageTareHint')}</p>
            </div>
            <p className="lot-total" aria-live="polite">
              {total === null ? '—' : t('lots.total', { total: fmt.format(total), unit })}
            </p>
          </fieldset>
        ) : (
          <div className="field">
            <label htmlFor="lot-qty">{t('lots.quantityIn', { unit })}</label>
            <input id="lot-qty" className="input" inputMode="decimal" required value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
        )}

        {controlType === 'expiryDate' && (
          <div className="field">
            <label htmlFor="lot-expiry">{t('lots.expiryDate')}</label>
            <input id="lot-expiry" className="input" type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          </div>
        )}

        {controlType === 'shelfLife' && (
          <div className="grid-2">
            <div className="field">
              <label htmlFor="lot-mfg">{t('lots.manufactureDate')}</label>
              <input id="lot-mfg" className="input" type="date" value={manufactureDate} onChange={(e) => setManufactureDate(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="lot-life">{t('lots.shelfLifeYears')}</label>
              <input id="lot-life" className="input" inputMode="decimal" value={shelfLifeYears} onChange={(e) => setShelfLifeYears(e.target.value)} />
            </div>
            {computedDue && <p className="hint">{t('lots.expiresOn', { date: formatDay(computedDue, i18n.language) })}</p>}
          </div>
        )}

        {controlType === 'capacity' && (
          <>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="lot-cap-total">{t('lots.capacityTotal')}</label>
                <input id="lot-cap-total" className="input" inputMode="decimal" value={capacityTotal} onChange={(e) => setCapacityTotal(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="lot-cap-unit">{t('lots.capacityUnit')}</label>
                <input id="lot-cap-unit" className="input" placeholder={t('lots.capacityUnitPlaceholder')} value={capacityUnit} onChange={(e) => setCapacityUnit(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="lot-cap-rem">{t('lots.capacityRemaining')}</label>
              <input id="lot-cap-rem" className="input" inputMode="decimal" value={capacityRemaining} onChange={(e) => setCapacityRemaining(e.target.value)} />
            </div>
          </>
        )}

        <div className="field">
          <label htmlFor="lot-notes">{t('items.notes')}</label>
          <textarea id="lot-notes" className="input textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="row-end">
          {lot && (
            <button className="btn btn-danger-outline" type="button" onClick={handleDelete}>
              <Trash2 size={18} /> {t('common.delete')}
            </button>
          )}
          <button className="btn btn-primary" type="submit" disabled={total === null}>
            {t('common.save')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
