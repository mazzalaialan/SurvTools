import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { newEntity } from '@/core/model/entity';
import type { Item, Location } from '@/core/model/types';
import { systemCategoryId } from '@/modules/inventory/domain/categories';
import { normalize } from '@/modules/inventory/selectors';
import { useInventory } from '@/modules/inventory/store';
import { kitLots } from './kits';
import { buildList, LEVELS, matchesCatalog, scenarioById, SCENARIOS, type Level } from './kitTemplates';

/** Escenario con el que se compara de entrada, según el tipo del botiquín. */
const DEFAULT_SCENARIO: Record<string, string> = { general: 'home', trauma: 'car', bleeding: 'bleeding', anaphylaxis: 'anaphylaxis', burns: 'burns', other: 'home' };

/**
 * «¿Qué le falta a este botiquín?»: lo compara con la plantilla de un escenario y da la lista de compras (para copiar o compartir). Con un toque
 * deja las cantidades de la plantilla como stock mínimo, así los avisos de faltantes funcionan solos.
 */
export function KitCompare({ kit }: { kit: Location }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('en') ? 'en' : 'es';
  const { items, lots, locations, saveItem, setStockMin } = useInventory(
    useShallow((s) => ({ items: s.items, lots: s.lots, locations: s.locations, saveItem: s.saveItem, setStockMin: s.setStockMin })),
  );
  const [open, setOpen] = useState(false);
  const [scenarioId, setScenarioId] = useState(DEFAULT_SCENARIO[kit.kitType ?? 'general'] ?? 'home');
  const scenario = scenarioById(scenarioId)!;
  const [level, setLevel] = useState<Level>('individual');
  const [people, setPeople] = useState(scenario.people);
  const [days, setDays] = useState(scenario.days);
  const [message, setMessage] = useState<string | null>(null);

  const contents = useMemo(() => kitLots(kit.id, [...lots.values()], [...locations.values()]), [kit.id, lots, locations]);
  const rows = useMemo(() => {
    return buildList(scenarioId, level, people, days).map((line) => {
      const owned = new Map<string, number>();
      for (const lot of contents) {
        const item = items.get(lot.itemId);
        if (item && matchesCatalog(line.id, normalize(item.name))) owned.set(item.id, (owned.get(item.id) ?? 0) + lot.quantity);
      }
      const have = [...owned.values()].reduce((a, b) => a + b, 0);
      return { ...line, have, status: have >= line.qty ? ('ok' as const) : have > 0 ? ('partial' as const) : ('missing' as const) };
    });
  }, [scenarioId, level, people, days, contents, items]);

  const missing = rows.filter((r) => r.status === 'missing');
  const partial = rows.filter((r) => r.status === 'partial');
  const ok = rows.filter((r) => r.status === 'ok');
  const unit = (r: { item: { unit?: { es: string; en: string } } }) => (r.item.unit ?? { es: 'unidades', en: 'units' })[lang];

  const shopping = () => {
    const lines = [...missing, ...partial].map((r) =>
      r.status === 'missing'
        ? `- ${r.qty} ${unit(r)} · ${r.item.name[lang]}`
        : `- ${r.qty - r.have} ${unit(r)} · ${r.item.name[lang]} (${t('kitCompare.haveOf', { have: r.have, need: r.qty })})`,
    );
    return `${t('kitCompare.shoppingTitle', { kit: kit.name, scenario: scenario.name[lang] })}\n${lines.join('\n')}\n\n${t('kitCompare.shoppingFooter')}`;
  };

  async function share() {
    const text = shopping();
    try {
      if (typeof navigator.share === 'function') await navigator.share({ title: kit.name, text });
      else {
        await navigator.clipboard.writeText(text);
        setMessage(t('kitCompare.copied'));
      }
    } catch {
      // La persona cerró el menú de compartir: no hay nada que avisar.
    }
  }

  async function setMins() {
    for (const r of [...missing, ...partial]) {
      let item: Item | undefined = [...items.values()].find((i) => !i.deletedAt && matchesCatalog(r.id, normalize(i.name)));
      if (!item) {
        item = newEntity<Item>({
          name: r.item.name[lang], categoryId: systemCategoryId('firstAid'), notes: r.item.note[lang], barcode: null, unit: (r.item.unit ?? { es: 'unidades', en: 'units' })[lang],
          weightGrams: null, favorite: false, controlType: r.item.expires ? 'expiryDate' : null, alertsEnabled: null, alertLeadDays: null, alertCapacityPct: null,
        });
        await saveItem(item);
      }
      await setStockMin(item.id, kit.id, r.qty);
    }
    setMessage(t('kitCompare.minsSet', { count: missing.length + partial.length }));
  }

  return (
    <section className="card stack" aria-labelledby="kc-title">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <h2 id="kc-title" className="section-title" style={{ margin: 0, flex: 1 }}>{t('kitCompare.title')}</h2>
        <button className="btn" type="button" onClick={() => setOpen(!open)} aria-expanded={open} data-testid="kc-toggle">
          {open ? t('common.close') : t('kitCompare.open')}
        </button>
      </div>
      {open && (
        <>
          <p className="hint" style={{ margin: 0 }}>{t('kitCompare.intro')}</p>
          <div className="field">
            <label htmlFor="kc-scenario">{t('kitBuilder.scenario')}</label>
            <select id="kc-scenario" className="select" value={scenarioId} onChange={(e) => { setScenarioId(e.target.value); setPeople(scenarioById(e.target.value)!.people); setDays(scenarioById(e.target.value)!.days); }} data-testid="kc-scenario">
              {SCENARIOS.map((s) => (
                <option key={s.id} value={s.id}>{s.name[lang]}</option>
              ))}
            </select>
          </div>
          <div className="chips" role="group" aria-label={t('kitBuilder.level')}>
            {LEVELS.map((lv) => (
              <button key={lv} type="button" className="chip" aria-pressed={level === lv} onClick={() => setLevel(lv)} data-testid={`kc-level-${lv}`}>{t(`kitBuilder.levels.${lv}`)}</button>
            ))}
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="kc-people">{t('kitBuilder.people')}</label>
              <input id="kc-people" className="input" type="number" min={1} max={50} value={people} onChange={(e) => setPeople(Math.min(50, Math.max(1, Number(e.target.value) || 1)))} />
            </div>
            {scenario.usesDays && (
              <div className="field">
                <label htmlFor="kc-days">{t('kitBuilder.days')}</label>
                <input id="kc-days" className="input" type="number" min={1} max={60} value={days} onChange={(e) => setDays(Math.min(60, Math.max(1, Number(e.target.value) || 1)))} />
              </div>
            )}
          </div>

          <p className={missing.length + partial.length === 0 ? 'hint' : 'error'} data-testid="kc-summary" style={{ margin: 0 }}>
            {missing.length + partial.length === 0 ? t('kitCompare.complete') : t('kitCompare.summary', { missing: missing.length, partial: partial.length, ok: ok.length })}
          </p>
          {missing.length + partial.length > 0 && (
            <>
              <ul className="list" data-testid="kc-missing">
                {[...missing, ...partial].map((r) => (
                  <li key={r.id} className="kb-row">
                    <div className="kb-row-main">
                      <span className="kb-name">{r.item.name[lang]}</span>
                      <span className="hint kb-unit">
                        {r.status === 'missing' ? t('kitCompare.need', { qty: r.qty, unit: unit(r) }) : t('kitCompare.needMore', { more: r.qty - r.have, have: r.have, need: r.qty })}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="row-end" style={{ gap: 8, flexWrap: 'wrap' }}>
                <button className="btn" type="button" onClick={() => void share()} data-testid="kc-share">{t('kitCompare.share')}</button>
                <button className="btn btn-primary" type="button" onClick={() => void setMins()} data-testid="kc-mins">{t('kitCompare.setMins')}</button>
              </div>
            </>
          )}
          {message && <p className="hint" role="status" style={{ margin: 0 }} data-testid="kc-message">{message}</p>}
          <p className="hint" style={{ margin: 0 }}>{t('kitBuilder.disclaimer')}</p>
        </>
      )}
    </section>
  );
}
