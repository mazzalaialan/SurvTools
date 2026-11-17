import { unitFor, unitText } from '../domain/unitText';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { BriefcaseMedical } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { CategoryIcon } from '@/ui/CategoryIcon';
import type { LotAlert } from '../domain/alerts';
import { pathLabel } from '../domain/locations';
import { groupShortages, type StockShortage } from '../domain/stock';
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

export function ShortageList({ shortages, limit }: { shortages: StockShortage[]; limit?: number }) {
  const { t, i18n } = useTranslation();
  const { items, locations, categories } = useInventory(
    useShallow((s) => ({ items: s.items, locations: s.locations, categories: s.categories })),
  );
  const fmt = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 });
  // Los faltantes de un mismo botiquín van juntos en una sola fila: «Botiquín del auto · Faltan 11 artículos».
  const entries = groupShortages(shortages, [...locations.values()]).slice(0, limit);
  return (
    <ul className="list">
      {entries.map((entry) => {
        if (entry.kind === 'kit') {
          const count = entry.shortages.length;
          return (
            <li key={entry.kit.id}>
              <Link className="list-row" to={`/first-aid/kits/${entry.kit.id}`} data-testid={`shortage-kit-${entry.kit.id}`}>
                <BriefcaseMedical size={24} aria-hidden style={{ color: 'var(--danger)', flex: 'none' }} />
                <span className="list-main">
                  <span className="list-title">{entry.kit.name}</span>
                  <span className="list-sub">{t('kits.missingCount', { count })}</span>
                </span>
                <span className="pill pill-warn">{count}</span>
              </Link>
            </li>
          );
        }
        const { stockMin, current } = entry.shortage;
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
                {t('stockMin.status', { current: fmt.format(current), min: fmt.format(stockMin.minQuantity), unit: unitFor(stockMin.minQuantity, unitText(item.unit, t('items.units'))) })}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
