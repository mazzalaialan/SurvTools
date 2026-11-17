import { unitText } from '../domain/unitText';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { CategoryIcon } from '@/ui/CategoryIcon';
import type { LotAlert } from '../domain/alerts';
import { pathLabel } from '../domain/locations';
import type { StockShortage } from '../domain/stock';
import { useInventory } from '../store';
import { AlertBadge } from './AlertBadge';

export function AlertList({ alerts, limit }: { alerts: LotAlert[]; limit?: number }) {
  const { items, lots, locations, categories } = useInventory(
    useShallow((s) => ({ items: s.items, lots: s.lots, locations: s.locations, categories: s.categories })),
  );
  return (
    <ul className="list">
      {alerts.slice(0, limit).map((a) => {
        const item = items.get(a.itemId);
        const lot = lots.get(a.lotId);
        if (!item || !lot) return null;
        return (
          <li key={a.lotId}>
            <Link className="list-row" to={`/inventory/items/${item.id}`}>
              <CategoryIcon category={categories.get(item.categoryId)} />
              <span className="list-main">
                <span className="list-title">{item.name}</span>
                <span className="list-sub">{pathLabel(lot.locationId, locations)}</span>
              </span>
              <AlertBadge alert={a} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function ShortageList({ shortages }: { shortages: StockShortage[] }) {
  const { t, i18n } = useTranslation();
  const { items, locations, categories } = useInventory(
    useShallow((s) => ({ items: s.items, locations: s.locations, categories: s.categories })),
  );
  const fmt = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 });
  return (
    <ul className="list">
      {shortages.map(({ stockMin, current }) => {
        const item = items.get(stockMin.itemId);
        if (!item) return null;
        return (
          <li key={stockMin.id}>
            <Link className="list-row" to={`/inventory/items/${item.id}`}>
              <CategoryIcon category={categories.get(item.categoryId)} />
              <span className="list-main">
                <span className="list-title">{item.name}</span>
                <span className="list-sub">{pathLabel(stockMin.locationId, locations)}</span>
              </span>
              <span className="pill pill-warn">
                {t('stockMin.status', { current: fmt.format(current), min: fmt.format(stockMin.minQuantity), unit: unitText(item.unit, t('items.units')) })}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
