import { useState, type FormEvent } from 'react';
import { Check, EllipsisVertical, FileText, Share2 } from 'lucide-react';
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
import { confirmAction } from '@/ui/confirm';
import { Dialog } from '@/ui/Dialog';
import { lotsOutsideKits, moveToKit, quantityOf as lotsQuantity, sourcePlaces } from './kitStock';
import { exportShoppingPdf, shareShoppingText, type ShopEntry } from './shoppingExport';
import { CATALOG, GROUP_NAMES, GROUPS, matchesCatalog, unitFor } from './kitTemplates';

/**
 * «Falta» en un botiquín: lo que no llega al stock mínimo. Desde acá se comparte o se imprime en PDF la lista de compras y, al comprar algo,
 * se toca «Compré»: se agrega al contenido del botiquín (con su vencimiento si corresponde) y deja de figurar como faltante.
 */
export function KitMissing({ kit, shortages }: { kit: Location; shortages: StockShortage[] }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('en') ? 'en' : 'es';
  const { items, categories, lots, locations, setStockMin, saveLot, deleteLot } = useInventory(
    useShallow((s) => ({ items: s.items, categories: s.categories, lots: s.lots, locations: s.locations, setStockMin: s.setStockMin, saveLot: s.saveLot, deleteLot: s.deleteLot })),
  );
  const [buying, setBuying] = useState<StockShortage | null>(null);
  /** Último aviso y, si se puede, cómo deshacerlo (se muestra arriba, cerca de lo que se tocó). */
  const [notice, setNotice] = useState<{ text: string; undo?: () => Promise<void> } | null>(null);
  const setMessage = (text: string | null) => setNotice(text ? { text } : null);
  /** La fila que tiene abierto el menú de más acciones. */
  const [menuFor, setMenuFor] = useState<string | null>(null);
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

  /** Lo que ya tenés guardado fuera de los botiquines (placard, estante, auto) se pasa a este botiquín, con su vencimiento. */
  async function bringHere(s: StockShortage, qty: number) {
    const item = items.get(s.stockMin.itemId);
    if (!item) return;
    const moved = await moveToKit(kit.id, item.id, qty, [...useInventory.getState().lots.values()], [...useInventory.getState().locations.values()], saveLot);
    setMessage(t('kitMissing.moved', { qty: moved, name: item.name }));
  }

  /** No lo quiero en este botiquín: se saca el stock mínimo (deja de ser faltante). El artículo y lo que haya cargado quedan como están. */
  async function dismiss(s: StockShortage) {
    const item = items.get(s.stockMin.itemId);
    if (!item || !(await confirmAction(t('kitMissing.dismissConfirm', { name: item.name })))) return;
    const previous = s.stockMin.minQuantity;
    await setStockMin(item.id, kit.id, null);
    setMenuFor(null);
    setNotice({ text: t('kitMissing.dismissed', { name: item.name }), undo: async () => void (await setStockMin(item.id, kit.id, previous)) });
  }

  return (
    <section className="card stack" aria-labelledby="km-title" data-testid="kit-missing">
      <h2 id="km-title" className="section-title" style={{ margin: 0 }}>{t('kits.missing')}</h2>
      {notice && (
        <div className="km-notice" role="status" data-testid="km-message">
          <span>{notice.text}</span>
          {notice.undo && (
            <button className="btn-link" type="button" onClick={async () => { const undo = notice.undo!; setNotice(null); await undo(); }} data-testid="km-undo">{t('kitMissing.undo')}</button>
          )}
        </div>
      )}
      <ul className="list">
        {shortages.map((s) => {
          const item = items.get(s.stockMin.itemId);
          if (!item) return null;
          const unit = unitText(item.unit, t('items.units'));
          const out = lotsOutsideKits(item.id, [...lots.values()], [...locations.values()]);
          const outside = lotsQuantity(out);
          const bring = Math.min(s.missing, outside);
          const open = menuFor === item.id;
          const boughtBtn = (primary: boolean) => (
            <button className={primary ? 'btn btn-primary km-primary' : 'btn'} type="button" onClick={() => { setMenuFor(null); setBuying(s); }} aria-label={t('kitMissing.boughtLabel', { name: item.name })} data-testid={`km-bought-${item.id}`}>
              <Check size={18} aria-hidden /> {t('kitMissing.bought')}
            </button>
          );
          return (
            <li key={s.stockMin.id} className="kb-row km-row" data-testid={`km-row-${item.id}`}>
              <div className="kb-row-main">
                <Link className="kb-name" to={`/inventory/items/${item.id}`}>{item.name}</Link>
                <span className="pill pill-warn">{t('stockMin.status', { current: fmt.format(s.current), min: fmt.format(s.stockMin.minQuantity), unit: unitFor(s.stockMin.minQuantity, unit) })}</span>
              </div>
              <p className="hint" style={{ margin: 0 }}>
                {t('kitMissing.toBuy', { qty: fmt.format(s.missing), unit: unitFor(s.missing, unit) })}
                {outside > 0 && <span data-testid={`km-outside-${item.id}`}> · {t('kitMissing.outside', { qty: fmt.format(outside), places: sourcePlaces(out, locations) })}</span>}
              </p>
              {/* Un solo botón fuerte por fila: pasar lo que ya tenés guardado afuera o, si no hay, «Compré». Lo demás, en el menú de la derecha. */}
              <div className="km-actions">
                {outside > 0 ? (
                  <button className="btn btn-primary km-primary" type="button" onClick={() => void bringHere(s, bring)} aria-label={t('kitMissing.bringLabel', { qty: fmt.format(bring), name: item.name })} data-testid={`km-bring-${item.id}`}>
                    <Check size={18} aria-hidden /> {t('kitMissing.bring', { qty: fmt.format(bring) })}
                  </button>
                ) : (
                  boughtBtn(true)
                )}
                <button className="btn km-more" type="button" onClick={() => setMenuFor(open ? null : item.id)} aria-expanded={open} aria-label={t('kitMissing.moreLabel', { name: item.name })} data-testid={`km-more-${item.id}`}>
                  <EllipsisVertical size={20} aria-hidden />
                </button>
              </div>
              {open && (
                <div className="km-menu" data-testid={`km-menu-${item.id}`}>
                  {outside > 0 && boughtBtn(false)}
                  <button className="btn btn-danger-outline" type="button" onClick={() => void dismiss(s)} aria-label={t('kitMissing.dismissLabel', { name: item.name })} data-testid={`km-dismiss-${item.id}`}>{t('kitMissing.dismiss')}</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="km-share-grid">
        <button className="btn" type="button" onClick={async () => setMessage(await shareShoppingText(entries, ctx()))} data-testid="km-share"><Share2 size={18} aria-hidden /> {t('kitMissing.share')}</button>
        <button className="btn" type="button" onClick={async () => setMessage(await exportShoppingPdf(entries, ctx()))} data-testid="km-pdf"><FileText size={18} aria-hidden /> {t('kitMissing.pdf')}</button>
      </div>
      {buying && <BoughtDialog onBought={(lotId) => setNotice({ text: t('kitMissing.boughtDone', { name: items.get(buying.stockMin.itemId)?.name ?? '' }), undo: async () => void (await deleteLot(lotId)) })} kit={kit} shortage={buying} item={items.get(buying.stockMin.itemId)!} hasExpiry={effectiveConfig(items.get(buying.stockMin.itemId)!, categories.get(items.get(buying.stockMin.itemId)!.categoryId)).controlType === 'expiryDate'} onClose={() => setBuying(null)} />}
    </section>
  );
}

function BoughtDialog({ kit, shortage, item, hasExpiry, onClose, onBought }: { kit: Location; shortage: StockShortage; item: Item; hasExpiry: boolean; onClose: () => void; onBought: (lotId: string) => void }) {
  const { t } = useTranslation();
  const saveLot = useInventory((s) => s.saveLot);
  const [qty, setQty] = useState(shortage.missing);
  const [expiry, setExpiry] = useState('');
  const unit = unitText(item.unit, t('items.units'));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!(qty > 0)) return;
    const lot = newEntity<Lot>({
        itemId: item.id, locationId: kit.id, quantity: qty, packageCount: null, packageSize: null, packageName: null, packageTareGrams: null, expiryDate: expiry || null,
        manufactureDate: null, shelfLifeMonths: null, capacityTotal: null, capacityRemaining: null, capacityUnit: null, notes: '',
      });
    await saveLot(lot);
    onBought(lot.id);
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
