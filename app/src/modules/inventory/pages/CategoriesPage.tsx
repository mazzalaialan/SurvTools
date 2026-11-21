import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { EyeOff, Plus, Trash2 } from 'lucide-react';
import { newEntity } from '@/core/model/entity';
import type { Category, ControlType } from '@/core/model/types';
import { CATEGORY_COLORS, CATEGORY_ICONS, CategoryIcon } from '@/ui/CategoryIcon';
import { Dialog } from '@/ui/Dialog';
import { parseNum } from '@/ui/numbers';
import { CONTROL_TYPES } from '../components/controlTypes';
import { DEFAULT_CAPACITY_PCT, DEFAULT_LEAD_DAYS, categoryName } from '../domain/categories';
import { useInventory } from '../store';
import { confirmAction } from '@/ui/confirm';

export function CategoriesPage() {
  const { t } = useTranslation();
  const categories = useInventory((s) => s.categories);
  const [editing, setEditing] = useState<{ category: Category; isNew: boolean } | null>(null);
  const sorted = [...categories.values()].sort((a, b) => a.order - b.order);

  function startNew() {
    const order = Math.max(0, ...sorted.map((c) => c.order)) + 1;
    setEditing({
      isNew: true,
      category: newEntity<Category>({
        nameKey: null,
        name: '',
        isSystem: false,
        hidden: false,
        icon: 'package',
        color: CATEGORY_COLORS[0]!,
        order,
        controlType: 'none',
        alertsEnabled: false,
        alertLeadDays: DEFAULT_LEAD_DAYS,
        alertCapacityPct: DEFAULT_CAPACITY_PCT,
      }),
    });
  }

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">{t('modules.categories.title')}</h1>
        <button className="btn btn-primary" type="button" onClick={startNew}>
          <Plus size={20} /> {t('categories.new')}
        </button>
      </div>
      <ul className="list">
        {sorted.map((c) => (
          <li key={c.id}>
            <button className={c.hidden ? 'list-row row-hidden' : 'list-row'} type="button" onClick={() => setEditing({ category: c, isNew: false })}>
              <CategoryIcon category={c} />
              <span className="list-main">
                <span className="list-title">
                  {categoryName(c, t)}
                  {c.hidden && <EyeOff size={14} aria-label={t('categories.hidden')} />}
                </span>
                <span className="list-sub">
                  {t(`controlType.${c.controlType}`)}
                  {c.controlType !== 'none' && ` · ${c.alertsEnabled ? t('categories.alertsOn') : t('categories.alertsOff')}`}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {editing && <CategoryDialog category={editing.category} isNew={editing.isNew} onClose={() => setEditing(null)} />}
    </>
  );
}

function CategoryDialog({ category, isNew, onClose }: { category: Category; isNew: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { saveCategory, deleteCategory } = useInventory();
  const [draft, setDraft] = useState(category);
  const set = (changes: Partial<Category>) => setDraft((d) => ({ ...d, ...changes }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await saveCategory({ ...draft, name: draft.name.trim() });
    onClose();
  }

  async function handleDelete() {
    if (!(await confirmAction(t('categories.confirmDelete', { name: categoryName(category, t) })))) return;
    await deleteCategory(category.id);
    onClose();
  }

  return (
    <Dialog title={isNew ? t('categories.new') : categoryName(category, t)} onClose={onClose}>
      <form className="stack" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="cat-name">{t('categories.name')}</label>
          <input
            id="cat-name"
            className="input"
            required={!draft.isSystem}
            value={draft.name}
            placeholder={draft.nameKey ? t(draft.nameKey) : ''}
            onChange={(e) => set({ name: e.target.value })}
          />
          {draft.isSystem && <p className="hint">{t('categories.systemNameHint')}</p>}
        </div>

        <div className="field">
          <label>{t('categories.icon')}</label>
          <div className="picker">
            {Object.entries(CATEGORY_ICONS).map(([key, Icon]) => (
              <button key={key} type="button" className="picker-item" aria-pressed={draft.icon === key} onClick={() => set({ icon: key })} aria-label={key}>
                <Icon size={22} />
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>{t('categories.color')}</label>
          <div className="picker">
            {CATEGORY_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className="picker-item swatch"
                style={{ background: color }}
                aria-pressed={draft.color === color}
                onClick={() => set({ color })}
                aria-label={color}
              />
            ))}
          </div>
        </div>

        <div className="field">
          <label htmlFor="cat-control">{t('items.controlType')}</label>
          <select id="cat-control" className="select" value={draft.controlType} onChange={(e) => set({ controlType: e.target.value as ControlType })}>
            {CONTROL_TYPES.map((c) => (
              <option key={c} value={c}>
                {t(`controlType.${c}`)}
              </option>
            ))}
          </select>
          <p className="hint">{t(`controlTypeHint.${draft.controlType}`)}</p>
        </div>

        {draft.controlType !== 'none' && (
          <>
            <label className="check">
              <input type="checkbox" checked={draft.alertsEnabled} onChange={(e) => set({ alertsEnabled: e.target.checked })} />
              {t('items.alertsEnabled')}
            </label>
            {draft.controlType === 'capacity' ? (
              <div className="field">
                <label htmlFor="cat-pct">{t('items.capacityPct')}</label>
                <input id="cat-pct" className="input" type="number" min={1} max={99} value={draft.alertCapacityPct} onChange={(e) => set({ alertCapacityPct: parseNum(e.target.value) ?? DEFAULT_CAPACITY_PCT })} />
              </div>
            ) : (
              <div className="field">
                <label htmlFor="cat-lead">{t('items.leadDays')}</label>
                <input id="cat-lead" className="input" type="number" min={0} value={draft.alertLeadDays} onChange={(e) => set({ alertLeadDays: parseNum(e.target.value) ?? DEFAULT_LEAD_DAYS })} />
              </div>
            )}
          </>
        )}

        {draft.isSystem && (
          <label className="check">
            <input type="checkbox" checked={draft.hidden} onChange={(e) => set({ hidden: e.target.checked })} />
            {t('categories.hide')}
          </label>
        )}

        <div className="row-end">
          {!isNew && !category.isSystem && (
            <button className="btn btn-danger-outline" type="button" onClick={handleDelete}>
              <Trash2 size={18} /> {t('common.delete')}
            </button>
          )}
          <button className="btn btn-primary" type="submit">
            {t('common.save')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
