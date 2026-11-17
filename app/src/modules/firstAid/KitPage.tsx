import { KitCompare } from './KitCompare';
import { KitMissing } from './KitMissing';
import { cleanUnit, isNumericUnit, unitText } from '@/modules/inventory/domain/unitText';
import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { Pencil, Plus } from 'lucide-react';
import { newEntity } from '@/core/model/entity';
import type { Item, Location, Lot } from '@/core/model/types';
import { AlertBadge } from '@/modules/inventory/components/AlertBadge';
import { LotDialog } from '@/modules/inventory/components/LotDialog';
import { effectiveConfig, lotAlert, lotDueDate } from '@/modules/inventory/domain/alerts';
import { systemCategoryId } from '@/modules/inventory/domain/categories';
import { today } from '@/modules/inventory/domain/dates';
import { pathLabel } from '@/modules/inventory/domain/locations';
import { LocationDialog } from '@/modules/inventory/pages/LocationsPage';
import { formatDay, useShortages } from '@/modules/inventory/selectors';
import { useInventory } from '@/modules/inventory/store';
import { Dialog } from '@/ui/Dialog';
import { kitLots, kitShortages } from './kits';

export function KitPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const kit = useInventory((s) => (id ? s.locations.get(id) : undefined));
  const loaded = useInventory((s) => s.loaded);

  if (!loaded) return null;
  if (!kit || kit.kitType === null) {
    return (
      <p className="empty">
        {t('kits.notFound')} <Link to="/first-aid/kits">{t('common.back')}</Link>
      </p>
    );
  }
  return <KitDetail kit={kit} />;
}

type LotEditing = { item: Item; lot: Lot | null };

function KitDetail({ kit }: { kit: Location }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { locations, lots, items, categories } = useInventory(
    useShallow((s) => ({ locations: s.locations, lots: s.lots, items: s.items, categories: s.categories })),
  );
  const shortages = useShortages();
  const [editingKit, setEditingKit] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingLot, setEditingLot] = useState<LotEditing | null>(null);

  const locList = useMemo(() => [...locations.values()], [locations]);
  const contents = useMemo(() => {
    const collator = new Intl.Collator(i18n.language);
    return kitLots(kit.id, [...lots.values()], locList)
      .map((lot) => ({ lot, item: items.get(lot.itemId) }))
      .filter((r): r is { lot: Lot; item: Item } => r.item !== undefined)
      .sort((a, b) => collator.compare(a.item.name, b.item.name));
  }, [kit.id, lots, items, locList, i18n.language]);
  const missing = kitShortages(kit.id, shortages, locList);
  const parent = kit.parentId ? pathLabel(kit.parentId, locations) : null;
  const fmt = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 });
  const todayStr = today();

  return (
    <div className="stack">
      <div className="page-head">
        <div style={{ flex: 1 }}>
          <h1 className="page-title" style={{ marginBottom: 0 }}>{kit.name}</h1>
          <p className="hint" style={{ margin: 0 }}>
            {t(`kits.types.${kit.kitType}`)}
            {parent && ` · ${parent}`}
          </p>
        </div>
        <button className="icon-btn" type="button" onClick={() => setEditingKit(true)} aria-label={t('common.edit')} title={t('common.edit')}>
          <Pencil size={20} />
        </button>
      </div>

      {missing.length > 0 && <KitMissing kit={kit} shortages={missing} />}

      <section className="card stack">
        <div className="page-head" style={{ marginBottom: 0 }}>
          <h2 className="section-title" style={{ margin: 0, flex: 1 }}>{t('kits.contents')}</h2>
          <button className="btn" type="button" onClick={() => setAdding(true)}>
            <Plus size={18} /> {t('kits.add')}
          </button>
        </div>
        {contents.length === 0 ? (
          <p className="hint">{t('kits.emptyKit')}</p>
        ) : (
          <ul className="list">
            {contents.map(({ lot, item }) => {
              const config = effectiveConfig(item, categories.get(item.categoryId));
              const alert = lotAlert(lot, config, todayStr);
              const due = lotDueDate(lot, config.controlType);
              const where = lot.locationId !== kit.id ? pathLabel(lot.locationId, locations).replace(`${pathLabel(kit.id, locations)} › `, '') : null;
              return (
                <li key={lot.id}>
                  <button className="list-row" type="button" onClick={() => setEditingLot({ item, lot })}>
                    <span className="list-main">
                      <span className="list-title">{item.name}</span>
                      <span className="list-sub">
                        {`${fmt.format(lot.quantity)} ${unitText(item.unit, t('items.units'))}`}
                        {where && ` · ${where}`}
                        {due && ` · ${t('lots.expiresOn', { date: formatDay(due, i18n.language) })}`}
                      </span>
                    </span>
                    {alert && <AlertBadge alert={alert} />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <p className="hint">{t('kits.minHint')}</p>
      </section>

      <KitCompare kit={kit} />

      {adding && (
        <AddToKitDialog
          onClose={() => setAdding(false)}
          onPicked={(item) => {
            setAdding(false);
            setEditingLot({ item, lot: null });
          }}
        />
      )}
      {editingLot && (
        <LotDialog
          item={editingLot.item}
          controlType={effectiveConfig(editingLot.item, categories.get(editingLot.item.categoryId)).controlType}
          lot={editingLot.lot}
          defaultLocationId={kit.id}
          onClose={() => setEditingLot(null)}
        />
      )}
      {editingKit && (
        <LocationDialog
          location={kit}
          isNew={false}
          title={t('kits.edit')}
          onClose={() => setEditingKit(false)}
          onDeleted={() => navigate('/first-aid/kits', { replace: true })}
        />
      )}
    </div>
  );
}

const NEW_ITEM = '__new__';

/** Elegir un artículo existente o crear uno nuevo (en la categoría Botiquín) para cargarlo al botiquín. */
function AddToKitDialog({ onClose, onPicked }: { onClose: () => void; onPicked: (item: Item) => void }) {
  const { t, i18n } = useTranslation();
  const { items, saveItem } = useInventory(useShallow((s) => ({ items: s.items, saveItem: s.saveItem })));
  const firstAid = systemCategoryId('firstAid');
  const options = useMemo(() => {
    const collator = new Intl.Collator(i18n.language);
    // Primero los de la categoría Botiquín, que son los más probables.
    return [...items.values()].sort(
      (a, b) => Number(b.categoryId === firstAid) - Number(a.categoryId === firstAid) || collator.compare(a.name, b.name),
    );
  }, [items, firstAid, i18n.language]);
  const [choice, setChoice] = useState(NEW_ITEM);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (choice !== NEW_ITEM) {
      onPicked(items.get(choice)!);
      return;
    }
    const item = newEntity<Item>({
      name: name.trim(),
      categoryId: firstAid,
      notes: '',
      barcode: null,
      unit: cleanUnit(unit),
      weightGrams: null,
      favorite: false,
      controlType: null,
      alertsEnabled: null,
      alertLeadDays: null,
      alertCapacityPct: null,
    });
    await saveItem(item);
    onPicked(item);
  }

  return (
    <Dialog title={t('kits.add')} onClose={onClose}>
      <form className="stack" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="kit-item">{t('kits.item')}</label>
          <select id="kit-item" className="select" value={choice} onChange={(e) => setChoice(e.target.value)}>
            <option value={NEW_ITEM}>{t('kits.newItem')}</option>
            {options.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </div>
        {choice === NEW_ITEM && (
          <div className="grid-2">
            <div className="field">
              <label htmlFor="kit-item-name">{t('items.name')}</label>
              <input id="kit-item-name" className="input" required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t('kits.itemPlaceholder')} />
            </div>
            <div className="field">
              <label htmlFor="kit-item-unit">{t('items.unit')}</label>
              <input id="kit-item-unit" className="input" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder={t('kits.unitPlaceholder')} aria-describedby="kit-unit-hint" />
              <p id="kit-unit-hint" className={isNumericUnit(unit) ? 'error' : 'hint'} style={{ margin: 0 }}>
                {isNumericUnit(unit) ? t('items.unitNumber') : t('items.unitHint')}
              </p>
            </div>
          </div>
        )}
        <div className="row-end">
          <button className="btn btn-primary" type="submit">
            {t('common.continue')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
