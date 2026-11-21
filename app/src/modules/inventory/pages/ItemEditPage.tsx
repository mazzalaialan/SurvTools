import { cleanUnit, isNumericUnit, unitText } from '../domain/unitText';
import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, ScanBarcode, Star, Trash2 } from 'lucide-react';
import { useCapabilities } from '@/core/capabilities/capabilities';
import { newEntity } from '@/core/model/entity';
import type { ControlType, Item, Lot } from '@/core/model/types';
import { useSettings } from '@/core/settings/settings';
import { formatWeight, toGrams, weightForInput, type WeightUnit } from '@/core/units/units';
import { BarcodeScanner } from '@/ui/BarcodeScanner';
import { parseNum } from '@/ui/numbers';
import { WeightInput } from '@/ui/WeightInput';
import { AlertBadge } from '../components/AlertBadge';
import { ItemPhoto } from '../components/ItemPhoto';
import { CONTROL_TYPES } from '../components/controlTypes';
import { LotDialog } from '../components/LotDialog';
import { StockMinSection } from '../components/StockMinSection';
import { capacityPct, effectiveConfig, lotAlert, lotDueDate } from '../domain/alerts';
import { systemCategoryId } from '../domain/categories';
import { today } from '../domain/dates';
import { isPackaged, itemWeightGrams } from '../domain/stock';
import { formatDay, useCategoryOptions, useLocationOptions } from '../selectors';
import { useInventory } from '../store';
import { kmForInventoryItem } from '@/modules/training/gear';
import { useTraining } from '@/modules/training/store';
import { confirmAction } from '@/ui/confirm';

function emptyItem(): Item {
  return newEntity<Item>({
    name: '',
    categoryId: systemCategoryId('other'),
    notes: '',
    barcode: null,
    unit: '',
    weightGrams: null,
    favorite: false,
    controlType: null,
    alertsEnabled: null,
    alertLeadDays: null,
    alertCapacityPct: null,
  });
}

export function ItemEditPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const isNew = id === 'new';
  const stored = useInventory((s) => (id ? s.items.get(id) : undefined));
  const loaded = useInventory((s) => s.loaded);

  if (!loaded) return null;
  if (!isNew && !stored) return <NotFound />;
  // `key` remonta el formulario al cambiar de artículo, así cada "nuevo" genera su propio id.
  // Al escanear un código desconocido desde el listado, llega precargado.
  return <ItemForm key={stored?.id ?? 'new'} stored={stored} presetBarcode={params.get('barcode')} />;
}

function NotFound() {
  const { t } = useTranslation();
  return (
    <p className="empty">
      {t('items.notFound')} <Link to="/inventory/items">{t('common.back')}</Link>
    </p>
  );
}

function ItemForm({ stored, presetBarcode }: { stored: Item | undefined; presetBarcode: string | null }) {
  // Si hay equipo de Entrenamiento vinculado a este artículo, se ve cuánto lleva (se oculta con el interruptor de Entrenamiento).
  const gearOn = useSettings((s) => s.settings.trainingGear);
  const trainingGear = useTraining((s) => s.gear);
  const trainingWorkouts = useTraining((s) => s.workouts);
  const gearKm = gearOn && stored ? kmForInventoryItem(stored?.id ?? '', trainingGear.values(), trainingWorkouts.values()) : null;
  // Se crea una sola vez por montaje: nunca reutilizar el id de otro artículo nuevo.
  const [initial] = useState(() => stored ?? { ...emptyItem(), barcode: presetBarcode });
  const isNew = !stored;
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const units = useSettings((s) => s.settings.units);
  const { saveItem, deleteItem, categories } = useInventory();
  const categoryOptions = useCategoryOptions(initial.categoryId);

  const [draft, setDraft] = useState(initial);
  const initialWeight = weightForInput(initial.weightGrams, units);
  const [weight, setWeight] = useState(initialWeight.value);
  const [weightUnit, setWeightUnit] = useState<WeightUnit>(initialWeight.unit);
  const [saved, setSaved] = useState(false);
  const [scanning, setScanning] = useState(false);
  const canScan = useCapabilities((s) => (s.caps?.barcode && s.caps.camera) ?? false);
  const inherits = draft.controlType === null;

  const category = categories.get(draft.categoryId);
  const config = effectiveConfig(draft, category);
  const set = (changes: Partial<Item>) => {
    setDraft((d) => ({ ...d, ...changes }));
    setSaved(false);
  };

  function toggleInherit(useCategory: boolean) {
    // Al dejar de heredar se parte de los valores efectivos actuales.
    set(
      useCategory
        ? { controlType: null, alertsEnabled: null, alertLeadDays: null, alertCapacityPct: null }
        : { ...config },
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const grams = parseNum(weight);
    await saveItem({ ...draft, name: draft.name.trim(), unit: cleanUnit(draft.unit), weightGrams: grams === null ? null : toGrams(grams, weightUnit) });
    if (isNew) navigate(`/inventory/items/${draft.id}`, { replace: true });
    else setSaved(true);
  }

  async function handleDelete() {
    if (!stored || !(await confirmAction(t('items.confirmDelete', { name: stored.name })))) return;
    await deleteItem(stored.id);
    navigate('/inventory/items', { replace: true });
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="page-title" style={{ flex: 1 }}>{stored ? stored.name : t('items.new')}</h1>
        <button
          className="icon-btn"
          type="button"
          aria-pressed={draft.favorite}
          aria-label={t('items.favorite')}
          onClick={() => set({ favorite: !draft.favorite })}
          style={{ color: draft.favorite ? 'var(--text)' : undefined }}
        >
          <Star size={24} fill={draft.favorite ? 'currentColor' : 'none'} />
        </button>
      </div>

      {/* De un artículo guardado lo que se consulta es cuánto hay y cuándo vence: los lotes van arriba; la ficha para editarlo, debajo. */}
      {stored && <LotsSection item={stored} lang={i18n.language} />}

      <form className="card stack" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="name">{t('items.name')}</label>
          <input id="name" className="input" required value={draft.name} onChange={(e) => set({ name: e.target.value })} autoFocus={isNew} />
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="category">{t('items.category')}</label>
            <select id="category" className="select" value={draft.categoryId} onChange={(e) => set({ categoryId: e.target.value })}>
              {categoryOptions.map(({ category: c, name }) => (
                <option key={c.id} value={c.id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="unit">{t('items.unit')}</label>
            <input id="unit" className="input" placeholder={t('items.unitPlaceholder')} value={draft.unit} onChange={(e) => set({ unit: e.target.value })} aria-describedby="unit-hint" />
            <p id="unit-hint" className={isNumericUnit(draft.unit) ? 'error' : 'hint'} style={{ margin: 0 }} data-testid="unit-hint">
              {isNumericUnit(draft.unit) ? t('items.unitNumber') : t('items.unitHint')}
            </p>
          </div>
        </div>
        <div className="field">
          <label htmlFor="weight">
            {draft.unit.trim() ? t('items.weightPer', { unit: draft.unit.trim() }) : t('items.weightPerUnit')}
          </label>
          <WeightInput
            id="weight"
            value={weight}
            unit={weightUnit}
            onChange={(v, u) => {
              setWeight(v);
              setWeightUnit(u);
              setSaved(false);
            }}
          />
          <p className="hint">{t('items.weightHint')}</p>
        </div>
        <div className="field">
          <label htmlFor="barcode">{t('items.barcode')}</label>
          <div className="input-group">
            <input id="barcode" className="input" inputMode="numeric" value={draft.barcode ?? ''} onChange={(e) => set({ barcode: e.target.value.trim() || null })} />
            {canScan && (
              <button className="btn" type="button" onClick={() => setScanning(true)} aria-label={t('scanner.title')} title={t('scanner.title')}>
                <ScanBarcode size={20} />
              </button>
            )}
          </div>
        </div>
        {scanning && (
          <BarcodeScanner
            onClose={() => setScanning(false)}
            onDetected={(code) => {
              set({ barcode: code });
              setScanning(false);
            }}
          />
        )}
        {gearKm !== null && (
          <p className="hint" style={{ margin: 0 }} data-testid="item-gear-km">
            {t('gear.itemKm', { km: gearKm })}
          </p>
        )}
        <div className="field">
          <label htmlFor="notes">{t('items.notes')}</label>
          <textarea id="notes" className="input textarea" value={draft.notes} onChange={(e) => set({ notes: e.target.value })} />
        </div>

        <fieldset className="fieldset stack">
          <legend>{t('items.alertsConfig')}</legend>
          <label className="check">
            <input type="checkbox" checked={inherits} onChange={(e) => toggleInherit(e.target.checked)} />
            {t('items.inheritFromCategory')}
          </label>
          {inherits ? (
            <p className="hint">{t(`controlType.${config.controlType}`)}{config.alertsEnabled && config.controlType !== 'none' ? ` · ${t('items.leadDaysValue', { count: config.alertLeadDays })}` : ''}</p>
          ) : (
            <AlertOverrides draft={draft} set={set} />
          )}
        </fieldset>

        {saved && <p className="success" role="status">{t('common.saved')}</p>}
        <div className="row-end">
          {!isNew && (
            <button className="btn btn-danger-outline" type="button" onClick={handleDelete}>
              <Trash2 size={18} /> {t('common.delete')}
            </button>
          )}
          <button className="btn btn-primary" type="submit">
            {t('common.save')}
          </button>
        </div>
      </form>

      {stored && (
        <>
          <StockMinSection item={stored} />
          <ItemPhoto itemId={stored.id} name={stored.name} />
        </>
      )}
    </div>
  );
}

function AlertOverrides({ draft, set }: { draft: Item; set: (c: Partial<Item>) => void }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="field">
        <label htmlFor="controlType">{t('items.controlType')}</label>
        <select id="controlType" className="select" value={draft.controlType ?? 'none'} onChange={(e) => set({ controlType: e.target.value as ControlType })}>
          {CONTROL_TYPES.map((c) => (
            <option key={c} value={c}>
              {t(`controlType.${c}`)}
            </option>
          ))}
        </select>
      </div>
      {draft.controlType !== 'none' && (
        <>
          <label className="check">
            <input type="checkbox" checked={draft.alertsEnabled ?? false} onChange={(e) => set({ alertsEnabled: e.target.checked })} />
            {t('items.alertsEnabled')}
          </label>
          {draft.controlType === 'capacity' ? (
            <div className="field">
              <label htmlFor="pct">{t('items.capacityPct')}</label>
              <input id="pct" className="input" type="number" min={1} max={99} value={draft.alertCapacityPct ?? ''} onChange={(e) => set({ alertCapacityPct: parseNum(e.target.value) })} />
            </div>
          ) : (
            <div className="field">
              <label htmlFor="lead">{t('items.leadDays')}</label>
              <input id="lead" className="input" type="number" min={0} value={draft.alertLeadDays ?? ''} onChange={(e) => set({ alertLeadDays: parseNum(e.target.value) })} />
            </div>
          )}
        </>
      )}
    </>
  );
}

/** Usa la configuración guardada del artículo, no la del formulario sin guardar. */
function LotsSection({ item, lang }: { item: Item; lang: string }) {
  const { t } = useTranslation();
  const allLots = useInventory((s) => s.lots);
  const categories = useInventory((s) => s.categories);
  const locationOptions = useLocationOptions();
  const [editing, setEditing] = useState<Lot | 'new' | null>(null);

  const lots = useMemo(() => [...allLots.values()].filter((l) => l.itemId === item.id), [allLots, item.id]);
  const labels = new Map(locationOptions.map((o) => [o.id, o.label]));
  const config = effectiveConfig(item, categories.get(item.categoryId));
  const { controlType } = config;
  const fmt = new Intl.NumberFormat(lang, { maximumFractionDigits: 2 });
  const todayStr = today();
  const units = useSettings((s) => s.settings.units);
  const totalQty = lots.reduce((sum, l) => sum + l.quantity, 0);
  const totalGrams = itemWeightGrams(item, lots);

  /** "4 × botella de 6 L" o solo la cantidad. */
  function amount(lot: Lot): string {
    const qty = `${fmt.format(lot.quantity)} ${unitText(item.unit, t('items.units'))}`;
    if (!isPackaged(lot)) return qty;
    const size = `${fmt.format(lot.packageSize!)} ${unitText(item.unit, t('items.units'))}`;
    const pkg = lot.packageName ? t('lots.packageOf', { name: lot.packageName, size }) : size;
    return `${fmt.format(lot.packageCount!)} × ${pkg} = ${qty}`;
  }

  function detail(lot: Lot): string | null {
    if (controlType === 'capacity') {
      const pct = capacityPct(lot);
      return pct === null ? null : `${fmt.format(lot.capacityRemaining!)} / ${fmt.format(lot.capacityTotal!)} ${lot.capacityUnit ?? ''} (${Math.round(pct)}%)`;
    }
    const due = lotDueDate(lot, controlType);
    return due ? t('lots.expiresOn', { date: formatDay(due, lang) }) : null;
  }

  return (
    <section className="card stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <h2 className="section-title" style={{ margin: 0, flex: 1 }}>{t('lots.title')}</h2>
        <button className="btn" type="button" onClick={() => setEditing('new')} disabled={locationOptions.length === 0}>
          <Plus size={18} /> {t('lots.add')}
        </button>
      </div>
      {locationOptions.length === 0 && (
        <p className="hint">
          {t('lots.needLocation')} <Link to="/inventory/locations">{t('modules.locations.title')}</Link>
        </p>
      )}
      {lots.length === 0 ? (
        locationOptions.length > 0 && <p className="hint">{t('lots.empty')}</p>
      ) : (
        <ul className="list list-flat">
          {lots.map((lot) => {
            const alert = lotAlert(lot, config, todayStr);
            const info = detail(lot);
            return (
              <li key={lot.id}>
                <button className="list-row" type="button" onClick={() => setEditing(lot)}>
                  <span className="list-main">
                    <span className="list-title">{amount(lot)}</span>
                    <span className="list-sub">{labels.get(lot.locationId) ?? '—'}</span>
                    {info && <span className="list-sub">{info}</span>}
                  </span>
                  {alert && <AlertBadge alert={alert} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {lots.length > 0 && (
        <p className="lot-total">
          {t('lots.itemTotal', { total: `${fmt.format(totalQty)} ${unitText(item.unit, t('items.units'))}` })}
          {totalGrams > 0 && ` · ${formatWeight(totalGrams, units, lang)}`}
        </p>
      )}
      {editing && (
        <LotDialog item={item} controlType={controlType} lot={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </section>
  );
}
