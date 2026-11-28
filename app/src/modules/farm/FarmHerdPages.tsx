import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { MapPin, MapPinOff, Plus, Trash2 } from 'lucide-react';
import type { FarmEvent, FarmHerd, FarmPen, FarmProduction } from '@/core/model/types';
import { today as todayIso } from '@/modules/inventory/domain/dates';
import { placeWaypointOf } from '@/modules/inventory/domain/locations';
import { LocationSelect } from '@/modules/inventory/components/LocationSelect';
import { useInventory } from '@/modules/inventory/store';
import { harvestLocation } from '@/modules/garden/store';
import { WaypointField } from '@/modules/waypoints/WaypointField';
import { Collapsible } from '@/ui/Collapsible';
import { confirmAction } from '@/ui/confirm';
import { Dialog } from '@/ui/Dialog';
import { parseNum } from '@/ui/numbers';
import { Segmented } from '@/ui/Segmented';
import { UndoToastHost, useUndoToast } from '@/ui/UndoToast';
import { PenAlerts, SPECIES, speciesName, useLoadHerds } from './FarmToolsPages';
import { PRODUCT_UNIT, SPECIES_PRODUCTS, newHerd, newPen, recentProduction, useHerds } from './herd';

/**
 * «Mis animales» (rediseño del 2026-11-28, propuesta del agente de UX): resumen arriba, altas en diálogos como los canteros, cada corral
 * con su total, su producción de la semana y su lugar; la ficha del grupo pone primero lo que se anota en el día (huevos de un toque,
 * eventos en chips), con «Deshacer» para los toques errados. La cantidad cambia solo con eventos (o una corrección anotada).
 */

type Week = Partial<Record<FarmProduction['product'], number>>;
const addWeek = (a: Week, b: Week): Week => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b) as [FarmProduction['product'], number][]) out[k] = (out[k] ?? 0) + v;
  return out;
};

function WeekChips({ week }: { week: Week }) {
  const { t } = useTranslation();
  const entries = Object.entries(week).filter(([, n]) => n);
  if (!entries.length) return null;
  return (
    <span className="farm-week">
      {entries.map(([p, n]) => (
        <span key={p} className="pill">
          {t(`farm.herd.week.${p}`, { n })}
        </span>
      ))}
    </span>
  );
}

// ——— Lista ———

export function FarmHerdsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  useLoadHerds();
  const herds = useHerds((s) => s.herds);
  const pens = useHerds((s) => s.pens);
  const locations = useInventory((s) => s.locations);
  const [penDialog, setPenDialog] = useState<FarmPen | null>(null);
  const [herdDialog, setHerdDialog] = useState<{ penId: string } | null>(null);
  const today = todayIso();
  const penList = [...pens.values()].sort((a, b) => a.name.localeCompare(b.name));
  const groups = [...penList.map((p) => ({ pen: p as FarmPen | null, list: [...herds.values()].filter((h) => h.penId === p.id) })), { pen: null, list: [...herds.values()].filter((h) => !h.penId || !pens.has(h.penId)) }];
  const total = [...herds.values()].reduce((n, h) => n + h.count, 0);
  const week = [...herds.values()].reduce<Week>((w, h) => addWeek(w, recentProduction(h, today)), {});
  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="page-title" style={{ flex: 1 }}>
          {t('modules.farmHerd.title')}
        </h1>
      </div>
      <div className="farm-actions">
        <button type="button" className="btn btn-primary" onClick={() => setHerdDialog({ penId: '' })} data-testid="farm-add-herd">
          <Plus size={18} aria-hidden /> {t('farm.herd.add')}
        </button>
        <button type="button" className="btn" onClick={() => setPenDialog(newPen({ name: t('farm.pen.defaultName', { n: pens.size + 1 }) }))} data-testid="farm-add-pen">
          <Plus size={18} aria-hidden /> {t('farm.pen.add')}
        </button>
      </div>
      {herds.size > 0 && (
        <p className="farm-summary" data-testid="farm-summary">
          <strong>{t('farm.herd.total', { count: total })}</strong> <WeekChips week={week} />
        </p>
      )}
      <PenAlerts />
      {herds.size === 0 && pens.size === 0 && <p className="empty">{t('farm.herd.emptyLong')}</p>}
      {groups.map(({ pen, list }) => {
        if (!pen && !list.length) return null;
        const n = list.reduce((a, h) => a + h.count, 0);
        const pw = list.reduce<Week>((w, h) => addWeek(w, recentProduction(h, today)), {});
        const placed = pen ? !!placeWaypointOf(pen, locations) : false;
        return (
          <section key={pen?.id ?? 'none'} className="card stack" data-testid={pen ? 'farm-pen-card' : 'farm-no-pen'}>
            <div className="farm-pen-head">
              <h2 className="section-title" style={{ margin: 0 }}>
                {pen ? pen.name : t('farm.pen.none')}
              </h2>
              <span className="farm-count">{t('farm.herd.animals', { count: n })}</span>
            </div>
            {pen && (
              <p className="list-sub farm-place">
                {placed ? <MapPin size={14} aria-hidden /> : <MapPinOff size={14} aria-hidden />} {placed ? t('farm.pen.placed') : t('farm.pen.noPlace')}
              </p>
            )}
            <WeekChips week={pw} />
            {list.length ? (
              <ul className="list list-flat">
                {list
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((h) => (
                    <li key={h.id}>
                      <Link className="list-row" to={`/farm/herd/${h.id}`}>
                        <span className="list-main">
                          <span className="list-title">{h.name}</span>
                          {h.name !== speciesName(h.speciesId, i18n.language) && <span className="list-sub">{speciesName(h.speciesId, i18n.language)}</span>}
                        </span>
                        <span className="farm-count-big" aria-label={t('farm.herd.animals', { count: h.count })}>
                          {h.count}
                        </span>
                      </Link>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="muted small">{t('farm.pen.empty')}</p>
            )}
            {pen && (
              <div className="farm-actions">
                <button type="button" className="btn" onClick={() => setHerdDialog({ penId: pen.id })}>
                  <Plus size={18} aria-hidden /> {t('farm.pen.addHere')}
                </button>
                <Link className="btn" to={`/farm/pen/${pen.id}`}>
                  {t('farm.pen.edit')}
                </Link>
              </div>
            )}
          </section>
        );
      })}
      {penDialog && (
        <PenDialog
          pen={penDialog}
          onClose={() => setPenDialog(null)}
          onSave={async (p) => {
            await useHerds.getState().savePen(p);
            setPenDialog(null);
          }}
        />
      )}
      {herdDialog && (
        <HerdDialog
          penId={herdDialog.penId}
          pens={penList}
          onClose={() => setHerdDialog(null)}
          onSave={async (h) => {
            await useHerds.getState().save(h);
            setHerdDialog(null);
            navigate(`/farm/herd/${h.id}`);
          }}
        />
      )}
    </div>
  );
}

/** Alta y edición de un corral, como el diálogo de los canteros: nombre, lugar y ubicación del Inventario. */
function PenDialog({ pen, onClose, onSave }: { pen: FarmPen; onClose: () => void; onSave: (p: FarmPen) => Promise<void> }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(pen);
  return (
    <Dialog
      title={t('farm.pen.label')}
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-primary" disabled={!draft.name.trim()} onClick={() => void onSave({ ...draft, name: draft.name.trim() })} data-testid="pen-save">
          {t('common.save')}
        </button>
      }
    >
      <div className="stack">
        <div className="field">
          <label htmlFor="pen-name">{t('farm.pen.name')}</label>
          <input id="pen-name" className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} data-testid="pen-name" />
        </div>
        <WaypointField id="pen-place" label={t('farm.pen.place')} value={draft.waypointId} onChange={(waypointId) => setDraft((d) => ({ ...d, waypointId }))} newName={draft.name} noneLabel={t('farm.pen.noPlaceShort')} hint={t('farm.pen.placeHint')} />
        <LocationSelect id="pen-location" label={t('places.location')} value={draft.locationId} ownWaypoint={draft.waypointId} onChange={(locationId) => setDraft((d) => ({ ...d, locationId }))} />
        <div className="field">
          <label htmlFor="pen-notes">{t('farm.pen.notes')}</label>
          <textarea id="pen-notes" className="input" rows={2} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
        </div>
      </div>
    </Dialog>
  );
}

/** Alta de un grupo de animales: especie, corral y cuántos (lo demás se completa en la ficha). */
function HerdDialog({ penId, pens, onClose, onSave }: { penId: string; pens: FarmPen[]; onClose: () => void; onSave: (h: FarmHerd) => Promise<void> }) {
  const { t, i18n } = useTranslation();
  const [speciesId, setSpeciesId] = useState(SPECIES[0]?.id ?? 'gallina');
  const [pen, setPen] = useState(penId);
  const [count, setCount] = useState('1');
  const n = parseNum(count);
  const valid = n !== null && n >= 0;
  return (
    <Dialog
      title={t('farm.herd.add')}
      onClose={onClose}
      footer={
        <button
          type="button"
          className="btn btn-primary"
          disabled={!valid}
          data-testid="herd-save"
          onClick={() => void onSave(newHerd(speciesId, todayIso(), { name: speciesName(speciesId, i18n.language), penId: pen || null, count: Math.round(n ?? 0) }))}
        >
          {t('common.save')}
        </button>
      }
    >
      <div className="stack">
        <div className="field">
          <label htmlFor="farm-new-species">{t('farm.herd.species')}</label>
          <select id="farm-new-species" className="select" value={speciesId} onChange={(e) => setSpeciesId(e.target.value)} data-testid="farm-new-species">
            {SPECIES.map((s) => (
              <option key={s.id} value={s.id}>
                {speciesName(s.id, i18n.language)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="farm-new-pen">{t('farm.pen.label')}</label>
          <select id="farm-new-pen" className="select" value={pen} onChange={(e) => setPen(e.target.value)} data-testid="farm-new-pen">
            <option value="">{t('farm.pen.none')}</option>
            {pens.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="farm-new-count">{t('farm.herd.count')}</label>
          <input id="farm-new-count" className="input" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} data-testid="farm-new-count" />
        </div>
      </div>
    </Dialog>
  );
}

// ——— Corral ———

export function FarmPenPage() {
  const { t, i18n } = useTranslation();
  const { id = '' } = useParams();
  const navigate = useNavigate();
  useLoadHerds();
  const loaded = useHerds((s) => s.loaded);
  const pen = useHerds((s) => s.pens.get(id));
  const herds = useHerds((s) => s.herds);
  const pens = useHerds((s) => s.pens);
  const locations = useInventory((s) => s.locations);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  if (!loaded) return null;
  if (!pen) return <Navigate to="/farm/herd" replace />;
  const list = [...herds.values()].filter((h) => h.penId === pen.id);
  const n = list.reduce((a, h) => a + h.count, 0);
  const placed = !!placeWaypointOf(pen, locations);
  return (
    <div className="stack" data-testid="farm-pen">
      <div className="farm-pen-head">
        <h1 className="page-title" style={{ margin: 0 }}>
          {pen.name}
        </h1>
        <span className="farm-count">{t('farm.herd.animals', { count: n })}</span>
      </div>
      <p className="list-sub farm-place">
        {placed ? <MapPin size={14} aria-hidden /> : <MapPinOff size={14} aria-hidden />} {placed ? t('farm.pen.placed') : t('farm.pen.noPlace')}
      </p>
      <PenAlerts penId={pen.id} />
      <section className="card stack">
        <h2 className="section-title">{t('farm.pen.animals')}</h2>
        {list.length ? (
          <ul className="list list-flat">
            {list.map((h) => (
              <li key={h.id}>
                <Link className="list-row" to={`/farm/herd/${h.id}`}>
                  <span className="list-main">
                    <span className="list-title">{h.name}</span>
                    {h.name !== speciesName(h.speciesId, i18n.language) && <span className="list-sub">{speciesName(h.speciesId, i18n.language)}</span>}
                  </span>
                  <span className="farm-count-big">{h.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">{t('farm.pen.empty')}</p>
        )}
        <button type="button" className="btn" onClick={() => setAdding(true)}>
          <Plus size={18} aria-hidden /> {t('farm.pen.addHere')}
        </button>
      </section>
      <button type="button" className="btn" onClick={() => setEditing(true)} data-testid="pen-edit">
        {t('farm.pen.editLong')}
      </button>
      <button
        type="button"
        className="btn btn-danger-outline"
        onClick={async () => {
          if (!(await confirmAction(t('farm.pen.deleteConfirm', { name: pen.name })))) return;
          await useHerds.getState().removePen(pen.id);
          navigate('/farm/herd', { replace: true });
        }}
      >
        <Trash2 size={18} aria-hidden /> {t('farm.pen.delete')}
      </button>
      {editing && (
        <PenDialog
          pen={pen}
          onClose={() => setEditing(false)}
          onSave={async (p) => {
            await useHerds.getState().savePen(p);
            setEditing(false);
          }}
        />
      )}
      {adding && (
        <HerdDialog
          penId={pen.id}
          pens={[...pens.values()]}
          onClose={() => setAdding(false)}
          onSave={async (h) => {
            await useHerds.getState().save(h);
            setAdding(false);
            navigate(`/farm/herd/${h.id}`);
          }}
        />
      )}
    </div>
  );
}

// ——— Grupo de animales ———

/** Los eventos más usados van en chips (un toque); el resto, en «Otro». */
const QUICK_EVENTS: FarmEvent['kind'][] = ['birth', 'bought', 'death', 'note'];
const OTHER_EVENTS: FarmEvent['kind'][] = ['vaccine', 'deworm', 'slaughter', 'sold'];

export function FarmHerdPage() {
  const { t, i18n } = useTranslation();
  const { id = '' } = useParams();
  const navigate = useNavigate();
  useLoadHerds();
  const loaded = useHerds((s) => s.loaded);
  const h = useHerds((s) => s.herds.get(id));
  const pens = useHerds((s) => s.pens);
  const { save, remove, addEvent, removeEvent, addProduction, removeProduction } = useHerds.getState();
  const locations = useInventory((s) => s.locations);
  const showUndo = useUndoToast((s) => s.show);
  const roots = [...locations.values()].sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name));
  const products = SPECIES_PRODUCTS[h?.speciesId ?? ''] ?? [];
  const [product, setProduct] = useState<FarmProduction['product'] | ''>('');
  const [qty, setQty] = useState('');
  const [date, setDate] = useState(todayIso());
  const [toInventory, setToInventory] = useState(true);
  const [locationId, setLocationId] = useState('');
  const [eventKind, setEventKind] = useState<FarmEvent['kind']>('birth');
  const [eventCount, setEventCount] = useState('');
  const [eventNote, setEventNote] = useState('');
  const [eventDate, setEventDate] = useState(todayIso());
  const [fix, setFix] = useState('');
  const [fixWhy, setFixWhy] = useState('');
  if (!loaded) return null;
  if (!h) return <Navigate to="/farm/herd" replace />;
  const pen = h.penId ? pens.get(h.penId) : undefined;
  const prod = product || products[0] || '';
  const unit = prod ? PRODUCT_UNIT[prod] : '';
  const q = parseNum(qty);
  const penLoc = pen?.locationId && locations.has(pen.locationId) ? pen.locationId : null;
  const invLoc = locationId || penLoc || roots[0]?.id || '';
  const prodName = (p: string) => t(`farm.herd.product.${p}`);
  const dateFmt = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' });
  const fmtDate = (d: string) => dateFmt.format(new Date(`${d}T12:00:00`));

  async function saveProduction(amount: number) {
    if (!prod || !h || amount <= 0) return;
    const locId = toInventory ? invLoc || (await harvestLocation(t('garden.pantry'))).id : '';
    const itemName = `${prodName(prod)} (${speciesName(h.speciesId, i18n.language)}, ${t('farm.herd.fromFarm')})`;
    const pid = await addProduction(h.id, { date, product: prod, quantity: amount, unit }, toInventory ? { locationId: locId, itemName } : null);
    setQty('');
    if (pid) showUndo(t('farm.herd.logged', { n: amount, unit, product: prodName(prod).toLowerCase() }), () => removeProduction(h.id, pid));
  }
  async function saveEvent() {
    if (!h) return;
    const n = parseNum(eventCount);
    const eid = await addEvent(h.id, { date: eventDate, kind: eventKind, count: n && n > 0 ? Math.round(n) : null, note: eventNote.trim() });
    setEventCount('');
    setEventNote('');
    if (eid) showUndo(t('farm.herd.eventLogged', { kind: t(`farm.herd.event.${eventKind}`) }), () => removeEvent(h.id, eid));
  }

  return (
    <div className="stack" data-testid="farm-herd">
      <UndoToastHost />
      <div className="farm-pen-head">
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>
            {h.name}
          </h1>
          <p className="list-sub" style={{ margin: 0 }}>
            {[h.name !== speciesName(h.speciesId, i18n.language) ? speciesName(h.speciesId, i18n.language) : null, pen?.name].filter(Boolean).join(' · ')}
          </p>
        </div>
        <span className="farm-total" aria-label={t('farm.herd.animals', { count: h.count })}>
          <span className="farm-total-n" data-testid="herd-count">
            {h.count}
          </span>
          <span className="farm-total-l" aria-hidden>
            {t('farm.herd.animalsWord', { count: h.count })}
          </span>
        </span>
      </div>
      {pen && <PenAlerts penId={pen.id} />}

      {products.length > 0 && (
        <section className="card stack" data-testid="herd-production">
          <h2 className="section-title">{t('farm.herd.production')}</h2>
          {products.length > 1 && <Segmented label={t('farm.herd.productLabel')} value={prod as FarmProduction['product']} options={products.map((p) => ({ value: p, label: prodName(p) }))} onChange={(v) => setProduct(v)} />}
          {prod === 'eggs' && (
            <div className="farm-quick">
              {[1, 6, 12].map((n) => (
                <button key={n} type="button" className="btn farm-quick-btn" onClick={() => void saveProduction(n)} data-testid={`herd-eggs-${n}`} aria-label={t('farm.herd.addEggs', { count: n })}>
                  +{n}
                </button>
              ))}
            </div>
          )}
          <div className="farm-row">
            <div className="field">
              <label htmlFor="herd-qty">{t('farm.herd.qty', { unit })}</label>
              <input id="herd-qty" className="input" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} data-testid="herd-qty" />
            </div>
            <div className="field">
              <label htmlFor="herd-date">{t('farm.herd.date')}</label>
              <input id="herd-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <label className="check">
            <input type="checkbox" checked={toInventory} onChange={(e) => setToInventory(e.target.checked)} aria-controls="herd-location" data-testid="herd-to-inventory" />
            {t('garden.toInventory')}
          </label>
          {toInventory && roots.length > 0 && (
            <div className="field">
              <label htmlFor="herd-location">{t('garden.harvestLocation')}</label>
              <select id="herd-location" className="select" value={invLoc} onChange={(e) => setLocationId(e.target.value)}>
                {roots.map((l) => (
                  <option key={l.id} value={l.id}>
                    {'· '.repeat(l.depth - 1)}
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button type="button" className="btn btn-primary" disabled={q === null || q <= 0} onClick={() => void saveProduction(q ?? 0)} data-testid="herd-add-production">
            {t('farm.herd.addProduction')}
          </button>
        </section>
      )}

      <section className="card stack" data-testid="herd-events">
        <h2 className="section-title">{t('farm.herd.events')}</h2>
        <div className="chips" role="group" aria-label={t('farm.herd.eventKind')}>
          {QUICK_EVENTS.map((k) => (
            <button key={k} type="button" className="chip" aria-pressed={eventKind === k} onClick={() => setEventKind(k)} data-testid={`herd-event-${k}`}>
              {t(`farm.herd.event.${k}`)}
            </button>
          ))}
          <select className="select farm-other" aria-label={t('farm.herd.otherEvent')} value={OTHER_EVENTS.includes(eventKind) ? eventKind : ''} onChange={(e) => e.target.value && setEventKind(e.target.value as FarmEvent['kind'])} data-testid="herd-event-kind">
            <option value="">{t('farm.herd.otherEvent')}</option>
            {OTHER_EVENTS.map((k) => (
              <option key={k} value={k}>
                {t(`farm.herd.event.${k}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="farm-row">
          <div className="field">
            <label htmlFor="herd-event-count">{t('farm.herd.howMany')}</label>
            <input id="herd-event-count" className="input" inputMode="numeric" value={eventCount} onChange={(e) => setEventCount(e.target.value)} data-testid="herd-event-count" />
          </div>
          <div className="field">
            <label htmlFor="herd-event-date">{t('farm.herd.date')}</label>
            <input id="herd-event-date" className="input" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="herd-event-note">{t('farm.herd.note')}</label>
          <input id="herd-event-note" className="input" value={eventNote} onChange={(e) => setEventNote(e.target.value)} />
        </div>
        <button type="button" className="btn btn-primary" onClick={() => void saveEvent()} data-testid="herd-add-event">
          {t('farm.herd.addEvent')}
        </button>
        <p className="muted small">{t('farm.herd.eventHint')}</p>
      </section>

      <Collapsible id="herd-history" testId="herd-history" title={t('farm.herd.history')} summary={<span className="muted small">{t('farm.herd.historyCount', { count: h.production.length + h.events.length })}</span>}>
        {h.production.length > 0 && (
          <ul className="list list-flat" data-testid="herd-production-list">
            {h.production.slice(0, 30).map((p) => (
              <li key={p.id} className="list-row">
                <span className="list-main">
                  {fmtDate(p.date)} · {prodName(p.product)}: {p.quantity} {p.unit}
                </span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={t('farm.herd.deleteItem', { what: `${prodName(p.product)} ${fmtDate(p.date)}` })}
                  onClick={async () => {
                    await removeProduction(h.id, p.id);
                    showUndo(t('farm.herd.deleted'), async () => {
                      // Se vuelve a anotar (y a sumar al inventario si se había sumado).
                      const locId = p.lotId ? invLoc || (await harvestLocation(t('garden.pantry'))).id : '';
                      await addProduction(h.id, { date: p.date, product: p.product, quantity: p.quantity, unit: p.unit }, p.lotId ? { locationId: locId, itemName: `${prodName(p.product)} (${speciesName(h.speciesId, i18n.language)}, ${t('farm.herd.fromFarm')})` } : null);
                    });
                  }}
                >
                  <Trash2 size={18} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        {h.events.length > 0 && (
          <ul className="list list-flat" data-testid="herd-event-list">
            {h.events.slice(0, 30).map((e) => (
              <li key={e.id} className="list-row">
                <span className="list-main">
                  <span className="list-title">
                    {fmtDate(e.date)} · {t(`farm.herd.event.${e.kind}`)}
                    {e.kind === 'adjust' ? ` (${e.prevCount ?? '?'} → ${e.count})` : e.count ? ` (${e.count})` : ''}
                  </span>
                  {e.note && <span className="list-sub">{e.note}</span>}
                </span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={t('farm.herd.deleteItem', { what: `${t(`farm.herd.event.${e.kind}`)} ${fmtDate(e.date)}` })}
                  onClick={async () => {
                    await removeEvent(h.id, e.id);
                    const { id: _id, ...rest } = e;
                    showUndo(t('farm.herd.deleted'), () => void addEvent(h.id, rest));
                  }}
                >
                  <Trash2 size={18} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        {!h.production.length && !h.events.length && <p className="muted small">{t('farm.herd.noHistory')}</p>}
      </Collapsible>

      <Collapsible id="herd-settings" testId="herd-settings" title={t('farm.herd.settings')} summary={<span className="muted small">{[h.breed, pen?.name].filter(Boolean).join(' · ') || t('farm.herd.settingsHint')}</span>}>
        <div className="field">
          <label htmlFor="herd-name">{t('farm.herd.name')}</label>
          <input id="herd-name" className="input" value={h.name} onChange={(e) => void save({ ...h, name: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="herd-breed">{t('farm.herd.breed')}</label>
          <input id="herd-breed" className="input" value={h.breed} onChange={(e) => void save({ ...h, breed: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="herd-pen">{t('farm.pen.label')}</label>
          <select id="herd-pen" className="select" value={h.penId ?? ''} onChange={(e) => void save({ ...h, penId: e.target.value || null })} data-testid="herd-pen">
            <option value="">{t('farm.pen.none')}</option>
            {[...pens.values()].map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        {/* Corregir la cantidad sin un evento real (conteo, error): queda anotado con el motivo. */}
        <div className="farm-row">
          <div className="field">
            <label htmlFor="herd-fix">{t('farm.herd.fixCount')}</label>
            <input id="herd-fix" className="input" inputMode="numeric" value={fix} placeholder={String(h.count)} onChange={(e) => setFix(e.target.value)} data-testid="herd-fix" />
          </div>
          <div className="field">
            <label htmlFor="herd-fix-why">{t('farm.herd.fixWhy')}</label>
            <input id="herd-fix-why" className="input" value={fixWhy} onChange={(e) => setFixWhy(e.target.value)} />
          </div>
        </div>
        <button
          type="button"
          className="btn"
          disabled={parseNum(fix) === null}
          data-testid="herd-fix-save"
          onClick={async () => {
            await addEvent(h.id, { date: todayIso(), kind: 'adjust', count: Math.max(0, Math.round(parseNum(fix) ?? 0)), note: fixWhy.trim() });
            setFix('');
            setFixWhy('');
          }}
        >
          {t('farm.herd.fixSave')}
        </button>
        <Link to={`/farm/species/${h.speciesId}`}>{t('farm.herd.sheet', { name: speciesName(h.speciesId, i18n.language) })}</Link>
      </Collapsible>

      <button
        type="button"
        className="btn btn-danger-outline"
        onClick={async () => {
          if (!(await confirmAction(t('farm.herd.deleteConfirm', { name: h.name })))) return;
          await remove(h.id);
          navigate('/farm/herd', { replace: true });
        }}
      >
        <Trash2 size={18} aria-hidden /> {t('farm.herd.deleteHerd')}
      </button>
    </div>
  );
}
