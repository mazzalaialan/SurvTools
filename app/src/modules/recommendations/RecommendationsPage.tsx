import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { ListPlus, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { newEntity } from '@/core/model/entity';
import type { HouseholdMember, RecommendationRule } from '@/core/model/types';
import { categoryName } from '@/modules/inventory/domain/categories';
import { useCategoryOptions } from '@/modules/inventory/selectors';
import { useInventory } from '@/modules/inventory/store';
import { Dialog } from '@/ui/Dialog';
import { numToInput, parseNum } from '@/ui/numbers';
import { evaluateRule, membersFor } from './calc';
import { useRecommendations } from './store';

export function RecommendationsPage() {
  const { t } = useTranslation();
  const { members, rules, addExamples, setActive } = useRecommendations(
    useShallow((s) => ({ members: s.members, rules: s.rules, addExamples: s.addExamples, setActive: s.setActive })),
  );
  const [examplesMsg, setExamplesMsg] = useState<string | null>(null);
  // Agrupadas por plazo (3 días, 7 días, 6 meses…): cada plan se controla o no entero.
  const groups = useMemo(() => {
    const byDays = new Map<number, RecommendationRule[]>();
    for (const r of rules.values()) byDays.set(r.targetDays, [...(byDays.get(r.targetDays) ?? []), r]);
    return [...byDays.entries()].sort((a, b) => a[0] - b[0]).map(([days, list]) => ({ days, list: list.sort((a, b) => a.description.localeCompare(b.description)) }));
  }, [rules]);
  const [editingMember, setEditingMember] = useState<HouseholdMember | null>(null);
  const [editingRule, setEditingRule] = useState<RecommendationRule | null>(null);
  const memberList = useMemo(() => [...members.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [members]);
  const total = memberList.reduce((sum, m) => sum + m.count, 0);

  return (
    <div className="stack">
      <h1 className="page-title">{t('modules.recommendations.title')}</h1>
      <p className="hint" style={{ margin: 0 }}>{t('recommendations.intro')}</p>

      <section className="card stack" aria-labelledby="household-title">
        <div className="page-head" style={{ marginBottom: 0 }}>
          <h2 id="household-title" className="section-title" style={{ margin: 0, flex: 1 }}>
            <Users size={18} aria-hidden /> {t('recommendations.household')}
          </h2>
          <button className="btn" type="button" onClick={() => setEditingMember(newEntity<HouseholdMember>({ label: '', count: 1 }))}>
            <Plus size={18} /> {t('recommendations.addMember')}
          </button>
        </div>
        {memberList.length === 0 ? (
          <p className="hint">{t('recommendations.noMembers')}</p>
        ) : (
          <>
            <ul className="list list-flat">
              {memberList.map((m) => (
                <li key={m.id}>
                  <button className="list-row" type="button" onClick={() => setEditingMember(m)}>
                    <span className="list-main">
                      <span className="list-title">{m.label}</span>
                    </span>
                    <span className="pill">×{m.count}</span>
                    <Pencil size={16} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
            <p className="lot-total">{t('recommendations.total', { count: total })}</p>
          </>
        )}
      </section>

      <section className="card stack" aria-labelledby="rules-title">
        <div className="page-head" style={{ marginBottom: 0 }}>
          <h2 id="rules-title" className="section-title" style={{ margin: 0, flex: 1 }}>{t('recommendations.rules')}</h2>
          <button
            className="btn"
            type="button"
            onClick={() =>
              setEditingRule(
                newEntity<RecommendationRule>({ description: '', categoryId: null, itemId: null, quantityPerMemberPerDay: 0, unit: '', targetDays: 14, memberIds: [] }),
              )
            }
            disabled={memberList.length === 0}
          >
            <Plus size={18} /> {t('recommendations.addRule')}
          </button>
        </div>
        {memberList.length === 0 && rules.size > 0 && <p className="hint" style={{ margin: 0 }}>{t('recommendations.membersFirst')}</p>}
        {rules.size === 0 ? (
          <p className="hint">{memberList.length === 0 ? t('recommendations.membersFirst') : t('recommendations.noRules')}</p>
        ) : (
          groups.map(({ days, list }) => {
            const on = list.filter((r) => r.active !== false).length;
            return (
              <div key={days} className="stack rule-group" data-testid={`rule-group-${days}`}>
                <label className="check rule-group-head">
                  <input
                    type="checkbox"
                    checked={on === list.length}
                    ref={(el) => {
                      if (el) el.indeterminate = on > 0 && on < list.length;
                    }}
                    onChange={(e) => void setActive(list.map((r) => r.id), e.target.checked)}
                  />
                  <strong>{t('recommendations.plan', { span: span(days, t) })}</strong>
                  <span className="hint">{on === 0 ? t('recommendations.planOff') : t('recommendations.planOn', { on, total: list.length })}</span>
                </label>
                <ul className="list list-flat">
                  {list.map((rule) => (
                    <li key={rule.id} className="rule-item" data-active={rule.active !== false}>
                      <span className="tap-box">
                        <input
                          type="checkbox"
                          className="rule-check"
                          checked={rule.active !== false}
                          onChange={(e) => void setActive([rule.id], e.target.checked)}
                          aria-label={t('recommendations.control', { name: rule.description || t('recommendations.rule') })}
                        />
                      </span>
                      <RuleCard rule={rule} onEdit={() => setEditingRule(rule)} />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
        <button
          className="btn"
          type="button"
          onClick={() => void addExamples().then((n) => setExamplesMsg(n ? t('recommendations.examplesAdded', { count: n }) : t('recommendations.examplesThere')))}
        >
          <ListPlus size={18} /> {t('recommendations.addExamples')}
        </button>
        {examplesMsg && <p className="hint" role="status" style={{ margin: 0 }}>{examplesMsg}</p>}
        <p className="hint" style={{ margin: 0 }}>{t('recommendations.examplesHint')}</p>
      </section>

      {editingMember && <MemberDialog member={editingMember} onClose={() => setEditingMember(null)} />}
      {editingRule && <RuleDialog rule={editingRule} onClose={() => setEditingRule(null)} />}
    </div>
  );
}

/** "3 días", "2 semanas", "6 meses". */
function span(days: number, t: (k: string, o?: Record<string, unknown>) => string): string {
  if (days >= 60 && days % 30 === 0) return t('recommendations.months', { count: days / 30 });
  return t('recommendations.daysSpan', { count: days });
}

function RuleCard({ rule, onEdit }: { rule: RecommendationRule; onEdit: () => void }) {
  const { t, i18n } = useTranslation();
  const members = useRecommendations((s) => s.members);
  const { items, lots, categories } = useInventory(useShallow((s) => ({ items: s.items, lots: s.lots, categories: s.categories })));
  const memberList = useMemo(() => [...members.values()], [members]);
  const r = useMemo(() => evaluateRule(rule, memberList, items, [...lots.values()]), [rule, memberList, items, lots]);
  const fmt = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 });
  const unit = rule.itemId ? (items.get(rule.itemId)?.unit ?? rule.unit) : rule.unit;
  const pct = r.target > 0 ? Math.min(100, (r.current / r.target) * 100) : 100;
  const done = r.missing === 0;
  const category = categories.get(rule.categoryId ?? '');
  const target = rule.itemId ? items.get(rule.itemId)?.name : category && categoryName(category, t);
  const scope = membersFor(rule, memberList).map((m) => m.label).join(', ') || t('recommendations.nobody');

  return (
    <button className="list-row rule-card" type="button" onClick={onEdit}>
      <span className="list-main">
        <span className="list-title">{rule.description || target}</span>
        <span className="list-sub">
          {t('recommendations.ruleLine', {
            qty: fmt.format(rule.quantityPerMemberPerDay),
            unit,
            days: rule.targetDays,
            who: rule.memberIds.length ? scope : t('recommendations.everyone'),
          })}
        </span>
        <span className="progress" aria-hidden>
          <span className="progress-bar" style={{ width: `${pct}%` }} data-done={done} />
        </span>
        <span className="list-sub" data-testid="rule-status">
          {t('recommendations.have', { current: fmt.format(r.current), target: fmt.format(r.target), unit })}
          {r.daysCovered !== null && ` · ${t('recommendations.lasts', { count: Math.floor(r.daysCovered) })}`}
        </span>
        {rule.active === false && <span className="list-sub">{t('recommendations.notControlled')}</span>}
        {!done && rule.active !== false && <span className="list-sub rule-missing">{t('recommendations.missing', { missing: fmt.format(r.missing), unit })}</span>}
        {rule.categoryId && r.countedItems.length === 0 && <span className="list-sub">{t('recommendations.noMatchingItems', { unit })}</span>}
      </span>
    </button>
  );
}

function MemberDialog({ member, onClose }: { member: HouseholdMember; onClose: () => void }) {
  const { t } = useTranslation();
  const { members, saveMember, deleteMember } = useRecommendations();
  const isNew = !members.has(member.id);
  const [label, setLabel] = useState(member.label);
  const [count, setCount] = useState(String(member.count));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await saveMember({ ...member, label: label.trim(), count: Math.max(1, Math.round(parseNum(count) ?? 1)) });
    onClose();
  }

  return (
    <Dialog title={isNew ? t('recommendations.addMember') : t('recommendations.editMember')} onClose={onClose}>
      <form className="stack" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="member-label">{t('recommendations.memberLabel')}</label>
          <input id="member-label" className="input" required autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('recommendations.memberPlaceholder')} />
        </div>
        <div className="field">
          <label htmlFor="member-count">{t('recommendations.count')}</label>
          <input id="member-count" className="input" type="number" min={1} step={1} required value={count} onChange={(e) => setCount(e.target.value)} />
        </div>
        <div className="row-end">
          {!isNew && (
            <button className="btn btn-danger-outline" type="button" onClick={() => void deleteMember(member.id).then(onClose)}>
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

type Target = 'category' | 'item';

function RuleDialog({ rule, onClose }: { rule: RecommendationRule; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const { members, rules, saveRule, deleteRule } = useRecommendations();
  const items = useInventory((s) => s.items);
  const categoryOptions = useCategoryOptions(rule.categoryId ?? undefined);
  const isNew = !rules.has(rule.id);
  const [description, setDescription] = useState(rule.description);
  const [target, setTarget] = useState<Target>(rule.itemId ? 'item' : 'category');
  const [categoryId, setCategoryId] = useState(rule.categoryId ?? categoryOptions[0]?.category.id ?? '');
  const [itemId, setItemId] = useState(rule.itemId ?? '');
  const [unit, setUnit] = useState(rule.unit);
  const [qty, setQty] = useState(numToInput(rule.quantityPerMemberPerDay || null));
  const [days, setDays] = useState(String(rule.targetDays));
  const [memberIds, setMemberIds] = useState<string[]>(rule.memberIds.filter((id) => members.has(id)));

  const itemOptions = [...items.values()].sort((a, b) => a.name.localeCompare(b.name, i18n.language));
  const item = target === 'item' ? items.get(itemId) : undefined;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await saveRule({
      ...rule,
      description: description.trim(),
      categoryId: target === 'category' ? categoryId : null,
      itemId: target === 'item' ? itemId : null,
      unit: target === 'item' ? (item?.unit ?? '') : unit.trim(),
      quantityPerMemberPerDay: parseNum(qty) ?? 0,
      targetDays: Math.max(1, Math.round(parseNum(days) ?? 1)),
      memberIds,
    });
    onClose();
  }

  const toggleMember = (id: string, on: boolean) => setMemberIds(on ? [...memberIds, id] : memberIds.filter((m) => m !== id));

  return (
    <Dialog title={isNew ? t('recommendations.addRule') : t('recommendations.editRule')} onClose={onClose}>
      <form className="stack" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="rule-desc">{t('recommendations.description')}</label>
          <input id="rule-desc" className="input" autoFocus value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('recommendations.descriptionPlaceholder')} />
        </div>
        <div className="field">
          <label htmlFor="rule-target">{t('recommendations.counts')}</label>
          <select id="rule-target" className="select" value={target} onChange={(e) => setTarget(e.target.value as Target)}>
            <option value="category">{t('recommendations.byCategory')}</option>
            <option value="item">{t('recommendations.byItem')}</option>
          </select>
        </div>
        {target === 'category' ? (
          <div className="grid-2">
            <div className="field">
              <label htmlFor="rule-category">{t('items.category')}</label>
              <select id="rule-category" className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                {categoryOptions.map(({ category, name }) => (
                  <option key={category.id} value={category.id}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="rule-unit">{t('items.unit')}</label>
              <input id="rule-unit" className="input" required value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="L" />
            </div>
          </div>
        ) : (
          <div className="field">
            <label htmlFor="rule-item">{t('recommendations.item')}</label>
            <select id="rule-item" className="select" required value={itemId} onChange={(e) => setItemId(e.target.value)}>
              <option value="">{t('recommendations.chooseItem')}</option>
              {itemOptions.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {target === 'category' && <p className="hint" style={{ margin: 0 }}>{t('recommendations.unitHint')}</p>}
        <div className="grid-2">
          <div className="field">
            <label htmlFor="rule-qty">{t('recommendations.perDay', { unit: (target === 'item' ? item?.unit : unit) || t('items.units') })}</label>
            <input id="rule-qty" className="input" inputMode="decimal" required value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="rule-days">{t('recommendations.days')}</label>
            <input id="rule-days" className="input" type="number" min={1} required value={days} onChange={(e) => setDays(e.target.value)} />
          </div>
        </div>
        <fieldset className="fieldset stack">
          <legend>{t('recommendations.appliesTo')}</legend>
          {[...members.values()].map((m) => (
            <label key={m.id} className="check">
              <input type="checkbox" checked={memberIds.includes(m.id)} onChange={(e) => toggleMember(m.id, e.target.checked)} />
              {m.label} (×{m.count})
            </label>
          ))}
          <p className="hint" style={{ margin: 0 }}>{t('recommendations.appliesHint')}</p>
        </fieldset>
        <div className="row-end">
          {!isNew && (
            <button className="btn btn-danger-outline" type="button" onClick={() => void deleteRule(rule.id).then(onClose)}>
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
