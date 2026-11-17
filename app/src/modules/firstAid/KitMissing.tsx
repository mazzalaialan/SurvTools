import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { newEntity } from '@/core/model/entity';
import type { Item, Location, Lot } from '@/core/model/types';
import { effectiveConfig } from '@/modules/inventory/domain/alerts';
import type { StockShortage } from '@/modules/inventory/domain/stock';
import { unitText } from '@/modules/inventory/domain/unitText';
import { normalize } from '@/modules/inventory/selectors';
import { useInventory } from '@/modules/inventory/store';
import { Dialog } from '@/ui/Dialog';
import { exportShoppingPdf, shareShoppingText, type ShopEntry } from './shoppingExport';
import { CATALOG, GROUP_NAMES, GROUPS, matchesCatalog, unitFor } from './kitTemplates';

/**
 * «Falta» en un botiquín: lo que no llega al stock mínimo. Desde acá se comparte o se imprime en PDF la lista de compras y, al comprar algo,
 * se toca «Compré»: se agrega al contenido del botiquín (con su vencimiento si corresponde) y deja de figurar como faltante.
 */
export function KitMissing({ kit, shortages }: { kit: Location; shortages: StockShortage[] }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('en') ? 'en' : 'es';
  const { items, categories } = useInventory(useShallow((s) => ({ items: s.items, categories: s.categories })));
  const [buying, setBuying] = useState<StockShortage | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fmt = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 });

  const entries: ShopEntry[] = shortages.flatMap(({ stockMin, current }) => {
    const item = items.get(stockMin.itemId);
    if (!item) return [];
    // Si el artículo es de la plantilla se agrupa como allá; si no, va en «Otros».
    const id = Object.keys(CATALOG).find((k) => matchesCatalog(k, normalize(item.name)));
    const group = id ? CATALOG[id]!.group : null;
    return [{ name: item.name, unit: unitText(item.unit, t('items.units')), need: stockMin.minQuantity, have: current, groupName: group ? GROUP_NAMES[group][lang] : t('kitMissing.other'), groupOrder: group ? GROUPS.indexOf(group) : 99 }];
  });
  const ctx = () => ({ t, language: i18n.language, kitName: kit.name, detail: t('kitMissing.detail') });

  return (
    <section className="card stack" aria-labelledby="km-title" data-testid="kit-missing">
      <h2 id="km-title" className="section-title" style={{ margin: 0 }}>{t('kits.missing')}</h2>
      <ul className="list">
        {shortages.map((s) => {
          const item = items.get(s.stockMin.itemId);
          if (!item) return null;
          const unit = unitText(item.unit, t('items.units'));
          return (
            <li key={s.stockMin.id} className="kb-row" data-testid={`km-row-${item.id}`}>
              <div className="kb-row-main">
                <Link className="kb-name" to={`/inventory/items/${item.id}`}>{item.name}</Link>
                <span className="pill pill-warn">{t('stockMin.status', { current: fmt.format(s.current), min: fmt.format(s.stockMin.minQuantity), unit })}</span>
              </div>
              <div className="kb-row-sub">
                <span className="hint">{t('kitMissing.toBuy', { qty: fmt.format(s.missing), unit: unitFor(s.missing, unit) })}</span>
                <button className="btn" type="button" onClick={() => setBuying(s)} data-testid={`km-bought-${item.id}`}>{t('kitMissing.bought')}</button>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="row-end" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button className="btn" type="button" onClick={async () => setMessage(await shareShoppingText(entries, ctx()))} data-testid="km-share">{t('kitCompare.share')}</button>
        <button className="btn" type="button" onClick={async () => setMessage(await exportShoppingPdf(entries, ctx()))} data-testid="km-pdf">{t('kitCompare.pdf')}</button>
      </div>
      {message && <p className="hint" role="status" style={{ margin: 0 }} data-testid="km-message">{message}</p>}
      {buying && <BoughtDialog kit={kit} shortage={buying} item={items.get(buying.stockMin.itemId)!} hasExpiry={effectiveConfig(items.get(buying.stockMin.itemId)!, categories.get(items.get(buying.stockMin.itemId)!.categoryId)).controlType === 'expiryDate'} onClose={() => setBuying(null)} />}
    </section>
  );
}

function BoughtDialog({ kit, shortage, item, hasExpiry, onClose }: { kit: Location; shortage: StockShortage; item: Item; hasExpiry: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const saveLot = useInventory((s) => s.saveLot);
  const [qty, setQty] = useState(shortage.missing);
  const [expiry, setExpiry] = useState('');
  const unit = unitText(item.unit, t('items.units'));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!(qty > 0)) return;
    await saveLot(
      newEntity<Lot>({
        itemId: item.id, locationId: kit.id, quantity: qty, packageCount: null, packageSize: null, packageName: null, packageTareGrams: null, expiryDate: expiry || null,
        manufactureDate: null, shelfLifeMonths: null, capacityTotal: null, capacityRemaining: null, capacityUnit: null, notes: '',
      }),
    );
    onClose();
  }

  return (
    <Dialog title={t('kitMissing.boughtTitle', { name: item.name })} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <p className="hint" style={{ margin: 0 }}>{t('kitMissing.boughtHint', { qty: shortage.missing, unit })}</p>
        <div className="field">
          <label htmlFor="km-qty">{t('kitMissing.howMany', { unit })}</label>
          <input id="km-qty" className="input" type="number" min={0.01} step="any" autoFocus value={qty} onChange={(e) => setQty(Number(e.target.value))} data-testid="km-qty" />
        </div>
        {hasExpiry && (
          <div className="field">
            <label htmlFor="km-expiry">{t('kitMissing.expiry')}</label>
            <input id="km-expiry" className="input" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} data-testid="km-expiry" />
          </div>
        )}
        <div className="row-end">
          <button className="btn btn-primary" type="submit" data-testid="km-confirm">{t('kitMissing.add')}</button>
        </div>
      </form>
    </Dialog>
  );
}
