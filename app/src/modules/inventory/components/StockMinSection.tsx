import { unitText } from '../domain/unitText';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import type { Item } from '@/core/model/types';
import { subtreeIds } from '../domain/locations';
import { quantityOf } from '../domain/stock';
import { useLocationOptions } from '../selectors';
import { useInventory } from '../store';

/** Stock mínimo por ubicación; cuenta lo guardado en las sububicaciones. */
export function StockMinSection({ item }: { item: Item }) {
  const { t, i18n } = useTranslation();
  const { stockMins, lots, locations, setStockMin } = useInventory();
  const locationOptions = useLocationOptions();
  const [newLocation, setNewLocation] = useState('');
  const [newMin, setNewMin] = useState('');

  const rows = useMemo(() => {
    const locList = [...locations.values()];
    const lotList = [...lots.values()];
    return [...stockMins.values()]
      .filter((s) => s.itemId === item.id)
      .map((s) => ({ stockMin: s, current: quantityOf(item.id, lotList, subtreeIds(s.locationId, locList)) }));
  }, [stockMins, lots, locations, item.id]);

  const labels = new Map(locationOptions.map((o) => [o.id, o.label]));
  const used = new Set(rows.map((r) => r.stockMin.locationId));
  const available = locationOptions.filter((o) => !used.has(o.id));
  const fmt = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 });

  async function add() {
    const min = Number(newMin.replace(',', '.'));
    if (!newLocation || !(min > 0)) return;
    await setStockMin(item.id, newLocation, min);
    setNewLocation('');
    setNewMin('');
  }

  if (locationOptions.length === 0) return null;

  return (
    <section className="card stack">
      <h2 className="section-title" style={{ margin: 0 }}>{t('stockMin.title')}</h2>
      <p className="hint">{t('stockMin.hint')}</p>
      {rows.length > 0 && (
        <ul className="list">
          {rows.map(({ stockMin, current }) => {
            const short = current < stockMin.minQuantity;
            return (
              <li key={stockMin.id} className="list-row">
                <span className="list-main">
                  <span className="list-title">{labels.get(stockMin.locationId) ?? '—'}</span>
                  <span className="list-sub" style={{ color: short ? 'var(--warn)' : undefined }}>
                    {t('stockMin.status', { current: fmt.format(current), min: fmt.format(stockMin.minQuantity), unit: unitText(item.unit, t('items.units')) })}
                  </span>
                </span>
                <button className="icon-btn" type="button" aria-label={t('common.delete')} onClick={() => void setStockMin(item.id, stockMin.locationId, null)}>
                  <Trash2 size={18} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {available.length > 0 && (
        <div className="input-group">
          <select className="select" value={newLocation} onChange={(e) => setNewLocation(e.target.value)} aria-label={t('lots.location')}>
            <option value="">{t('stockMin.chooseLocation')}</option>
            {available.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            className="input"
            style={{ maxWidth: 110 }}
            inputMode="decimal"
            placeholder={t('stockMin.min')}
            aria-label={t('stockMin.min')}
            value={newMin}
            onChange={(e) => setNewMin(e.target.value)}
          />
          <button className="btn" type="button" onClick={add} aria-label={t('stockMin.add')} disabled={!newLocation || !newMin}>
            <Plus size={18} />
          </button>
        </div>
      )}
    </section>
  );
}
