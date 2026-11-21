import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useTrainingFormat } from './format';
import { inOuting, totalsOf } from './history';
import { blankOuting } from './outings';
import { useTraining } from './store';

/** Salidas: varias actividades juntas ("Salida al Platita"). */
export function OutingsPage() {
  const { t } = useTranslation();
  const f = useTrainingFormat();
  const navigate = useNavigate();
  const outings = useTraining((s) => s.outings);
  const workouts = useTraining((s) => s.workouts);
  const saveOuting = useTraining((s) => s.saveOuting);
  const [name, setName] = useState('');
  const all = [...workouts.values()];
  const rows = [...outings.values()]
    .map((o) => ({ outing: o, list: inOuting(all, o.id) }))
    .sort((a, b) => (b.list.at(-1)?.startedAt ?? b.outing.createdAt).localeCompare(a.list.at(-1)?.startedAt ?? a.outing.createdAt));

  async function create() {
    if (!name.trim()) return;
    const saved = await saveOuting(blankOuting(name.trim()));
    setName('');
    navigate(`/training/outings/${saved.id}`);
  }

  return (
    <div className="stack">
      <h1 className="page-title">{t('modules.outings.title')}</h1>
      <p className="hint" style={{ margin: 0 }}>{t('outings.intro')}</p>
      <form
        className="card stack"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <div className="field">
          <label htmlFor="outing-name">{t('outings.nameLabel')}</label>
          <input id="outing-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('outings.namePlaceholder')} />
        </div>
        <div className="row-end">
          <button className="btn btn-primary" type="submit" disabled={!name.trim()}>
            <Plus size={18} /> {t('outings.create')}
          </button>
        </div>
      </form>
      {rows.length === 0 ? (
        <p className="empty">{t('outings.empty')}</p>
      ) : (
        <ul className="list" data-testid="outing-list">
          {rows.map(({ outing, list }) => {
            const totals = totalsOf(list);
            return (
              <li key={outing.id}>
                <Link className="list-row" to={`/training/outings/${outing.id}`}>
                  <span className="list-main">
                    <span className="list-title">{outing.name}</span>
                    <span className="list-sub">
                      {t('outings.activities', { count: list.length })} · {f.distance(totals.distanceM)} · {f.clock(totals.totalS)} · {f.altitude(totals.ascentM)}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
