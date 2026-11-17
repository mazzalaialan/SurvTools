import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { BriefcaseMedical, Plus, Wand2 } from 'lucide-react';
import { newEntity } from '@/core/model/entity';
import type { Location } from '@/core/model/types';
import { AlertList, ShortageList } from '@/modules/inventory/components/AlertList';
import { pathLabel } from '@/modules/inventory/domain/locations';
import { LocationDialog } from '@/modules/inventory/pages/LocationsPage';
import { useAlerts, useShortages } from '@/modules/inventory/selectors';
import { useInventory } from '@/modules/inventory/store';
import { allKitsScope, isFirstAidLot, kitAlerts, kitShortages, kitsOf } from './kits';

export function KitsPage() {
  const { t, i18n } = useTranslation();
  const { locations, lots, items } = useInventory(useShallow((s) => ({ locations: s.locations, lots: s.lots, items: s.items })));
  const alerts = useAlerts();
  const shortages = useShortages();
  const [creating, setCreating] = useState<Location | null>(null);

  const locList = useMemo(() => [...locations.values()], [locations]);
  const kits = useMemo(
    () => kitsOf(locList).sort((a, b) => a.name.localeCompare(b.name, i18n.language)),
    [locList, i18n.language],
  );

  // Lo que hay que revisar: vencimientos de todo lo de primeros auxilios y faltantes dentro de botiquines.
  const scope = useMemo(() => allKitsScope(locList), [locList]);
  const firstAidAlerts = alerts.filter((a) => {
    const lot = lots.get(a.lotId);
    return lot !== undefined && isFirstAidLot(lot, items, scope);
  });
  const kitMissing = shortages.filter((s) => scope.has(s.stockMin.locationId));

  const startNew = () =>
    setCreating(newEntity<Location>({ name: '', parentId: null, depth: 0, notes: '', waypointId: null, kitType: 'general' }));

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">{t('modules.kits.title')}</h1>
        <div className="row-end" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Link className="btn btn-primary" to="/first-aid/kits/build" data-testid="kits-build">
            <Wand2 size={20} /> {t('kitBuilder.open')}
          </Link>
          <button className="btn" type="button" onClick={startNew}>
            <Plus size={20} /> {t('kits.new')}
          </button>
        </div>
      </div>

      {kits.length === 0 ? (
        <p className="empty">{t('kits.empty')}</p>
      ) : (
        <ul className="list">
          {kits.map((kit) => {
            const problems =
              kitAlerts(kit.id, alerts, lots, locList).length + kitShortages(kit.id, shortages, locList).length;
            const parent = kit.parentId ? pathLabel(kit.parentId, locations) : null;
            return (
              <li key={kit.id}>
                <Link className="list-row" to={`/first-aid/kits/${kit.id}`}>
                  <BriefcaseMedical size={24} aria-hidden style={{ color: 'var(--danger)', flex: 'none' }} />
                  <span className="list-main">
                    <span className="list-title">{kit.name}</span>
                    <span className="list-sub">
                      {t(`kits.types.${kit.kitType}`)}
                      {parent && ` · ${parent}`}
                    </span>
                  </span>
                  {problems > 0 && <span className="pill pill-warn">{t('kits.problems', { count: problems })}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {(firstAidAlerts.length > 0 || kitMissing.length > 0) && (
        <section className="card stack" style={{ marginTop: 16 }}>
          <h2 className="section-title" style={{ margin: 0 }}>{t('kits.toReview')}</h2>
          {firstAidAlerts.length > 0 && <AlertList alerts={firstAidAlerts} />}
          {kitMissing.length > 0 && <ShortageList shortages={kitMissing} />}
        </section>
      )}

      {creating && <LocationDialog location={creating} isNew title={t('kits.new')} onClose={() => setCreating(null)} />}
    </>
  );
}
