import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { newEntity } from '@/core/model/entity';
import type { Item, Location, Lot } from '@/core/model/types';
import { systemCategoryId } from '@/modules/inventory/domain/categories';
import { normalize } from '@/modules/inventory/selectors';
import { useInventory } from '@/modules/inventory/store';
import { lotsOutsideKits, moveToKit, quantityInKits, quantityOf as lotsQuantity, sourcePlaces } from './kitStock';
import { buildList, GROUP_NAMES, GROUPS, LEVELS, matchesCatalog, scenarioById, SCENARIOS, SOURCES, type Level } from './kitTemplates';

/**
 * «Armar botiquín»: se elige para qué es (escenario), qué tan completo (nivel), para cuántas personas y días, y la app propone qué llevar,
 * con cantidades. Se tilda lo que ya se tiene y un toque crea el botiquín con el stock mínimo de cada cosa, así los avisos de faltantes y
 * vencimientos que ya existen funcionan solos. Sin dosis: los medicamentos son categorías (kitTemplates.ts).
 */
export function KitBuilderPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const lang = i18n.language.startsWith('en') ? 'en' : 'es';
  const { items, lots, locations, saveLocation, saveItem, saveLot, setStockMin } = useInventory(
    useShallow((s) => ({ items: s.items, lots: s.lots, locations: s.locations, saveLocation: s.saveLocation, saveItem: s.saveItem, saveLot: s.saveLot, setStockMin: s.setStockMin })),
  );
  const [scenarioId, setScenarioId] = useState('home');
  const scenario = scenarioById(scenarioId)!;
  const [level, setLevel] = useState<Level>('individual');
  const [people, setPeople] = useState(scenario.people);
  const [days, setDays] = useState(scenario.days);
  const [name, setName] = useState('');
  const [skip, setSkip] = useState<Set<string>>(new Set());
  /** Cuántos tiene ya de cada cosa (0 si no puso nada): lo que no llega a la cantidad queda como faltante. */
  const [have, setHave] = useState<Record<string, number>>({});
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  // Al cambiar de escenario se vuelve a sus valores de partida.
  useEffect(() => {
    setPeople(scenarioById(scenarioId)!.people);
    setDays(scenarioById(scenarioId)!.days);
    setSkip(new Set());
    setHave({});
    setQtys({});
  }, [scenarioId]);

  const lines = useMemo(() => buildList(scenarioId, level, people, days), [scenarioId, level, people, days]);
  const itemList = useMemo(() => [...items.values()].filter((i) => !i.deletedAt), [items]);
  const lotList = useMemo(() => [...lots.values()], [lots]);
  const locList = useMemo(() => [...locations.values()], [locations]);
  /** Lo que ya está cargado en el inventario con otro nombre parecido. */
  const existing = useMemo(() => {
    const out = new Map<string, Item>();
    for (const line of lines) {
      const found = itemList.find((i) => matchesCatalog(line.id, normalize(i.name)));
      if (found) out.set(line.id, found);
    }
    return out;
  }, [lines, itemList]);

  const qtyOf = (id: string, fallback: number) => qtys[id] ?? fallback;
  /** Lo que ya tiene en lugares que no son botiquines (se pasa al botiquín nuevo) y lo que hay en otros botiquines (no se toca). */
  const stockOf = (id: string) => {
    const ex = existing.get(id);
    if (!ex) return { outside: 0, places: '', inKits: 0 };
    const out = lotsOutsideKits(ex.id, lotList, locList);
    return { outside: lotsQuantity(out), places: sourcePlaces(out, locations), inKits: quantityInKits(ex.id, lotList, locList) };
  };
  /** Cuántos pone en este botiquín: lo que escribió o, de entrada, lo que ya tiene fuera de botiquines (hasta la cantidad pedida). */
  const haveOf = (id: string, qty: number) => have[id] ?? Math.min(qty, stockOf(id).outside);
  const chosen = lines.filter((l) => !skip.has(l.id));
  const defaultName = `${t('kitBuilder.kitOf')} ${scenario.name[lang]}`;

  function toggle(set: Set<string>, id: string, apply: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    apply(next);
  }

  async function create() {
    setBusy(true);
    try {
      const kit = newEntity<Location>({ name: name.trim() || defaultName, parentId: null, depth: 0, notes: t('kitBuilder.kitNotes', { scenario: scenario.name[lang], level: t(`kitBuilder.levels.${level}`) }), waypointId: null, kitType: scenario.kitType });
      await saveLocation(kit);
      for (const line of chosen) {
        const qty = Math.max(1, Math.round(qtyOf(line.id, line.qty)));
        let item = existing.get(line.id);
        if (!item) {
          item = newEntity<Item>({
            name: line.item.name[lang],
            categoryId: systemCategoryId('firstAid'),
            notes: line.item.note[lang],
            barcode: null,
            unit: (line.item.unit ?? { es: 'unidades', en: 'units' })[lang],
            weightGrams: null,
            favorite: false,
            controlType: line.item.expires ? 'expiryDate' : null,
            alertsEnabled: null,
            alertLeadDays: null,
            alertCapacityPct: null,
          });
          await saveItem(item);
        }
        await setStockMin(item.id, kit.id, qty);
        const owned = Math.max(0, haveOf(line.id, qty));
        // Lo que ya está cargado en lugares que no son botiquines se pasa al nuevo (con su vencimiento); si falta, se carga lo demás.
        const moved = existing.has(line.id) ? await moveToKit(kit.id, item.id, owned, [...useInventory.getState().lots.values()], [...useInventory.getState().locations.values()], saveLot) : 0;
        const rest = owned - moved;
        if (rest > 0) {
          await saveLot(
            newEntity<Lot>({
              itemId: item.id, locationId: kit.id, quantity: rest, packageCount: null, packageSize: null, packageName: null, packageTareGrams: null, expiryDate: null,
              manufactureDate: null, shelfLifeMonths: null, capacityTotal: null, capacityRemaining: null, capacityUnit: null, notes: '',
            }),
          );
        }
      }
      navigate(`/first-aid/kits/${kit.id}`);
    } finally {
      setBusy(false);
    }
  }

  const fmt = new Intl.NumberFormat(i18n.language);
  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="page-title">{t('kitBuilder.title')}</h1>
      </div>
      <p className="hint" style={{ margin: 0 }}>{t('kitBuilder.intro')}</p>

      <section className="card stack" aria-labelledby="kb-scenario">
        <h2 id="kb-scenario" className="section-title" style={{ margin: 0 }}>{t('kitBuilder.scenario')}</h2>
        <div className="chips" role="group" aria-label={t('kitBuilder.scenario')}>
          {SCENARIOS.map((s) => (
            <button key={s.id} type="button" className="chip" aria-pressed={scenarioId === s.id} onClick={() => setScenarioId(s.id)} data-testid={`kb-scenario-${s.id}`}>
              {s.name[lang]}
            </button>
          ))}
        </div>
        <p className="hint" style={{ margin: 0 }} data-testid="kb-desc">{scenario.desc[lang]}</p>
      </section>

      <section className="card stack" aria-labelledby="kb-level">
        <h2 id="kb-level" className="section-title" style={{ margin: 0 }}>{t('kitBuilder.level')}</h2>
        <div className="chips" role="group" aria-label={t('kitBuilder.level')}>
          {LEVELS.map((lv) => (
            <button key={lv} type="button" className="chip" aria-pressed={level === lv} onClick={() => setLevel(lv)} data-testid={`kb-level-${lv}`}>
              {t(`kitBuilder.levels.${lv}`)}
            </button>
          ))}
        </div>
        <p className="hint" style={{ margin: 0 }}>{t(`kitBuilder.levelHint.${level}`)}</p>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="kb-people">{t('kitBuilder.people')}</label>
            <input id="kb-people" className="input" type="number" min={1} max={50} value={people} onChange={(e) => setPeople(Math.min(50, Math.max(1, Number(e.target.value) || 1)))} data-testid="kb-people" />
          </div>
          {scenario.usesDays && (
            <div className="field">
              <label htmlFor="kb-days">{t('kitBuilder.days')}</label>
              <input id="kb-days" className="input" type="number" min={1} max={60} value={days} onChange={(e) => setDays(Math.min(60, Math.max(1, Number(e.target.value) || 1)))} data-testid="kb-days" />
            </div>
          )}
        </div>
      </section>

      <section className="card stack" aria-labelledby="kb-list">
        <h2 id="kb-list" className="section-title" style={{ margin: 0 }}>
          {t('kitBuilder.list', { count: chosen.length })}
        </h2>
        <p className="hint" style={{ margin: 0 }}>{t('kitBuilder.listHint')}</p>
        {GROUPS.map((g) => {
          const rows = lines.filter((l) => l.item.group === g);
          if (!rows.length) return null;
          return (
            <div key={g} className="stack" style={{ gap: 6 }}>
              <h3 className="section-title" style={{ margin: '8px 0 0', fontSize: '0.95rem' }}>{GROUP_NAMES[g][lang]}</h3>
              <ul className="list">
                {rows.map((line) => {
                  const ex = existing.get(line.id);
                  const isOpen = open === line.id;
                  return (
                    <li key={line.id} className="kb-row" data-testid={`kb-row-${line.id}`}>
                      <div className="kb-row-main">
                        <input type="checkbox" checked={!skip.has(line.id)} onChange={() => toggle(skip, line.id, setSkip)} aria-label={t('kitBuilder.include', { name: line.item.name[lang] })} />
                        <button type="button" className="kb-name" onClick={() => setOpen(isOpen ? null : line.id)} aria-expanded={isOpen}>
                          {line.item.name[lang]}
                          {line.item.trained && <span className="pill pill-warn" style={{ marginLeft: 6 }}>{t('kitBuilder.trained')}</span>}
                        </button>
                        <input className="input kb-qty" type="number" min={1} value={qtyOf(line.id, line.qty)} onChange={(e) => setQtys((q) => ({ ...q, [line.id]: Math.max(1, Number(e.target.value) || 1) }))} aria-label={t('kitBuilder.quantity', { name: line.item.name[lang] })} />
                        <span className="hint kb-unit">{(line.item.unit ?? { es: 'unidades', en: 'units' })[lang]}</span>
                      </div>
                      <div className="kb-row-sub">
                        {ex && stockOf(line.id).outside > 0 && <span className="hint" data-testid={`kb-outside-${line.id}`}>{t('kitBuilder.outside', { name: ex.name, qty: fmt.format(stockOf(line.id).outside), places: stockOf(line.id).places })}</span>}
                        {ex && stockOf(line.id).inKits > 0 && <span className="hint">{t('kitBuilder.inKits', { qty: fmt.format(stockOf(line.id).inKits) })}</span>}
                        {!skip.has(line.id) && (
                          <label className="kb-have">
                            {t('kitBuilder.have')}
                            <input
                              className="input kb-qty"
                              type="number"
                              min={0}
                              value={haveOf(line.id, qtyOf(line.id, line.qty))}
                              onChange={(e) => setHave((h) => ({ ...h, [line.id]: Math.max(0, Number(e.target.value) || 0) }))}
                              aria-label={t('kitBuilder.haveLabel', { name: line.item.name[lang] })}
                              data-testid={`kb-have-${line.id}`}
                            />
                            <span className={haveOf(line.id, qtyOf(line.id, line.qty)) >= qtyOf(line.id, line.qty) ? 'hint' : 'error'} data-testid={`kb-gap-${line.id}`}>
                              {haveOf(line.id, qtyOf(line.id, line.qty)) >= qtyOf(line.id, line.qty) ? t('kitBuilder.complete') : t('kitBuilder.missing', { count: qtyOf(line.id, line.qty) - haveOf(line.id, qtyOf(line.id, line.qty)) })}
                            </span>
                          </label>
                        )}
                      </div>
                      {isOpen && (
                        <div className="stack" style={{ gap: 4 }}>
                          <p className="hint" style={{ margin: 0 }}>{line.item.note[lang]}</p>
                          {line.item.caution && <p className="hint" style={{ margin: 0, color: 'var(--warn)' }}>{line.item.caution[lang]}</p>}
                          {line.item.medication && <p className="hint" style={{ margin: 0 }}>{t('kitBuilder.medNote')}</p>}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </section>

      <section className="card stack">
        <div className="field">
          <label htmlFor="kb-name">{t('kitBuilder.name')}</label>
          <input id="kb-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={defaultName} data-testid="kb-name" />
        </div>
        <button className="btn btn-primary" type="button" onClick={() => void create()} disabled={busy || chosen.length === 0} data-testid="kb-create">
          {t('kitBuilder.create')}
        </button>
        <p className="hint" style={{ margin: 0 }}>{t('kitBuilder.createHint')}</p>
      </section>

      <section className="card stack">
        <h2 className="section-title" style={{ margin: 0 }}>{t('kitBuilder.sources')}</h2>
        <p className="hint" style={{ margin: 0 }}>{t('kitBuilder.disclaimer')}</p>
        <ul className="hint" style={{ margin: 0, paddingLeft: '1.2rem' }}>
          {SOURCES.map((s) => (
            <li key={s.es}>{s[lang]}</li>
          ))}
        </ul>
        <Link to="/first-aid/guides" className="btn">{t('kitBuilder.toGuides')}</Link>
      </section>
    </div>
  );
}
