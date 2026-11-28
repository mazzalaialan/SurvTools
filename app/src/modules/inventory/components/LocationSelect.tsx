import { useTranslation } from 'react-i18next';
import type { Id } from '@/core/model/types';
import { locationWaypoint } from '@/modules/inventory/domain/locations';
import { useInventory } from '@/modules/inventory/store';
import { useWaypoints } from '@/modules/waypoints/store';

/**
 * Ubicación del Inventario de un cantero o corral. Si no tiene waypoint propio, los avisos usan el de esta ubicación (o el de su
 * padre): se muestra cuál, para que se entienda de dónde sale el lugar.
 */
export function LocationSelect({ id, label, value, onChange, ownWaypoint }: { id: string; label: string; value: Id | null | undefined; onChange: (v: Id | null) => void; ownWaypoint: Id | null | undefined }) {
  const { t } = useTranslation();
  const locations = useInventory((s) => s.locations);
  const waypoints = useWaypoints((s) => s.waypoints);
  const list = [...locations.values()].sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name));
  const inherited = !ownWaypoint && value ? locationWaypoint(value, locations) : null;
  const wp = inherited ? waypoints.get(inherited) : undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} className="select" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} data-testid={id}>
        <option value="">{t('places.noLocation')}</option>
        {list.map((l) => (
          <option key={l.id} value={l.id}>
            {'· '.repeat(l.depth - 1)}
            {l.name}
          </option>
        ))}
      </select>
      <p className="hint" data-testid={`${id}-hint`}>
        {ownWaypoint ? t('places.ownWaypoint') : wp ? t('places.inherited', { name: wp.name }) : value ? t('places.noWaypoint') : t('places.hint')}
      </p>
    </div>
  );
}
