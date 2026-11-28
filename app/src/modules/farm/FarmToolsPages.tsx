import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Minus, Plus, Trash2 } from 'lucide-react';
import type { FarmEvent, FarmProduction } from '@/core/model/types';
import { isUnlocked } from '@/core/security/session';
import { today as todayIso } from '@/modules/inventory/domain/dates';
import { useInventory } from '@/modules/inventory/store';
import { harvestLocation } from '@/modules/garden/store';
import { confirmAction } from '@/ui/confirm';
import { parseNum } from '@/ui/numbers';
import { FarmNotice } from './FarmPages';
import data from './farm-AR.json';
import { REGIONS, animalsFor, farmPlan, tasksFor, yearlyNeed, yields, type Product } from './plan';
import { PRODUCT_UNIT, SPECIES_PRODUCTS, newHerd, newPen, recentProduction, useHerds } from './herd';
import { WaypointField } from '@/modules/waypoints/WaypointField';
import { useWaypoints } from '@/modules/waypoints/store';
import { useSettings } from '@/core/settings/settings';
import { Collapsible } from '@/ui/Collapsible';
import type { FarmPen } from '@/core/model/types';
import { FARM_WEATHER_STALE_MS, cachedFarmWeather, farmWeatherKey, fetchFarmWeather, stressDays, storeFarmWeather, type FarmWeather } from './weather';

/**
 * Etapa 2 de Granja (docs/GRANJA.md): calculadora «cuántos animales para N personas», calendario de tareas por mes y región, y el
 * registro de mis lotes (eventos y producción, con «Sumar al inventario»).
 */

const SPECIES = (data as { species: { id: string; name: { es: string; en?: string; pt?: string } }[] }).species;
const speciesName = (id: string, lang: string) => {
  const s = SPECIES.find((x) => x.id === id);
  if (!s) return id;
  return (lang.startsWith('en') ? s.name.en : lang.startsWith('pt') ? s.name.pt : undefined) ?? s.name.es;
};

/** Preferencia del dispositivo (no es un dato del usuario que haya que cifrar): región y personas de la calculadora. */
function useLocal<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  return [
    v,
    (x: T) => {
      setV(x);
      try {
        localStorage.setItem(key, JSON.stringify(x));
      } catch {
        /* sin almacenamiento: solo esta vez */
      }
    },
  ];
}

// ——— Calculadora ———

const PRODUCTS: Product[] = ['eggs', 'meat', 'honey'];

export function FarmPlanPage() {
  const { t, i18n } = useTranslation();
  const [people, setPeople] = useLocal('vikarg.farm.people', 4);
  const [share, setShare] = useLocal('vikarg.farm.share', 50);
  const ys = useMemo(() => yields(), []);
  const fmt = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 });
  return (
    <div className="stack">
      <h1 className="page-title">{t('modules.farmPlan.title')}</h1>
      <FarmNotice />
      <div className="card stack">
        <div className="field">
          <label htmlFor="farm-people">{t('farm.plan.people')}</label>
          <input id="farm-people" className="input" inputMode="numeric" value={String(people)} onChange={(e) => setPeople(Math.max(0, Math.min(99, Math.round(parseNum(e.target.value) ?? 0))))} data-testid="farm-people" />
        </div>
        <div className="field">
          <label htmlFor="farm-share">{t('farm.plan.share', { pct: share })}</label>
          <input id="farm-share" type="range" min={10} max={100} step={10} value={share} onChange={(e) => setShare(Number(e.target.value))} data-testid="farm-share" />
        </div>
      </div>
      {PRODUCTS.map((p) => {
        const need = yearlyNeed(p);
        const list = ys.filter((y) => y.product === p);
        if (!need || !list.length) return null;
        return (
          <section key={p} className="card stack" data-testid={`farm-plan-${p}`}>
            <h2 className="section-title">{t(`farm.plan.product.${p}`)}</h2>
            <p className="muted small">
              {t(`farm.plan.need.${p}`, { n: fmt.format(need.value * people * (share / 100)) })}{' '}
              {need.source?.url ? (
                <a href={need.source.url} target="_blank" rel="noreferrer">
                  ({need.source.org})
                </a>
              ) : null}
            </p>
            <ul className="stack">
              {list.map((y) => {
                const n = animalsFor(y, people, share / 100);
                const unsure = y.sources.some((s) => s.confidence && s.confidence !== 'oficial');
                return (
                  <li key={y.species} data-testid={`farm-plan-${y.species}`}>
                    <strong>
                      {speciesName(y.species, i18n.language)}: {t(y.unit === 'keep' ? 'farm.plan.keep' : 'farm.plan.raise', { count: n })}
                    </strong>
                    {unsure && <span className="fauna-regulated"> {t('farm.unconfirmed')}</span>}
                    <div className="muted small">
                      {y.sources.map((s, i) => (
                        <span key={i}>
                          {i > 0 && ' · '}
                          {s.unit}
                          {s.source?.url && (
                            <>
                              {' ('}
                              <a href={s.source.url} target="_blank" rel="noreferrer">
                                {s.source.org}
                              </a>
                              {')'}
                            </>
                          )}
                        </span>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      <p className="muted small">{t('farm.plan.note')}</p>
    </div>
  );
}

// ——— Calendario ———

export function FarmCalendarPage() {
  const { t, i18n } = useTranslation();
  const [region, setRegion] = useLocal<string>('vikarg.farm.region', 'pampeana');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const herds = useHerds((s) => s.herds);
  // Por defecto, las especies de mis lotes; sin lotes, todas.
  const mine = useMemo(() => [...new Set([...herds.values()].map((h) => h.speciesId))], [herds]);
  const [onlyMine, setOnlyMine] = useState(true);
  const species = onlyMine && mine.length ? mine : null;
  const tasks = tasksFor(month, species, region);
  const lang = i18n.language.startsWith('en') ? 'en' : i18n.language.startsWith('pt') ? 'pt' : 'es';
  const monthName = (m: number) => new Intl.DateTimeFormat(i18n.language, { month: 'long' }).format(new Date(2026, m - 1, 1));
  useLoadHerds();
  return (
    <div className="stack">
      <h1 className="page-title">{t('modules.farmCalendar.title')}</h1>
      <FarmNotice />
      <div className="card stack">
        <div className="field">
          <label htmlFor="farm-region">{t('farm.calendar.region')}</label>
          <select id="farm-region" className="select" value={region} onChange={(e) => setRegion(e.target.value)} data-testid="farm-region">
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {t(`farm.calendar.regions.${r}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="row" style={{ alignItems: 'center', gap: 8 }}>
          <button type="button" className="icon-btn" aria-label={t('farm.calendar.prev')} onClick={() => setMonth(month === 1 ? 12 : month - 1)}>
            <Minus size={20} aria-hidden />
          </button>
          <strong style={{ flex: 1, textAlign: 'center', textTransform: 'capitalize' }} data-testid="farm-month">
            {monthName(month)}
          </strong>
          <button type="button" className="icon-btn" aria-label={t('farm.calendar.next')} onClick={() => setMonth(month === 12 ? 1 : month + 1)}>
            <Plus size={20} aria-hidden />
          </button>
        </div>
        {mine.length > 0 && (
          <label className="check">
            <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
            {t('farm.calendar.onlyMine')}
          </label>
        )}
      </div>
      {tasks.length ? (
        <ul className="stack" data-testid="farm-tasks">
          {tasks.map((x, i) => (
            <li key={i} className={x.kind === 'obligatorio' ? 'fauna-warning' : 'card'} data-kind={x.kind}>
              <strong>{x.species.map((s) => speciesName(s, i18n.language)).join(', ')}</strong>
              {x.kind === 'obligatorio' && <span className="fauna-banned"> {t('farm.calendar.mandatory')}</span>}
              <p style={{ margin: '4px 0' }}>{x.text[lang] ?? x.text.es}</p>
              {x.source && (
                <span className="muted small">
                  {x.source.url ? (
                    <a href={x.source.url} target="_blank" rel="noreferrer">
                      {x.source.org}
                    </a>
                  ) : (
                    x.source.org
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{t('farm.calendar.none')}</p>
      )}
      <p className="muted small">{t('farm.calendar.note', { date: farmPlan.date })}</p>
    </div>
  );
}

// ——— Mis animales ———

function useLoadHerds() {
  const loaded = useHerds((s) => s.loaded);
  useEffect(() => {
    // Si el módulo se cargó después de desbloquear, el aviso de sesión ya pasó: se lee acá.
    if (!loaded && isUnlocked()) void useHerds.getState().load();
  }, [loaded]);
}

export function FarmHerdsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  useLoadHerds();
  const herds = useHerds((s) => s.herds);
  const pens = useHerds((s) => s.pens);
  const { save, savePen } = useHerds.getState();
  const [speciesId, setSpeciesId] = useState(SPECIES[0]?.id ?? 'gallina');
  const [penId, setPenId] = useState('');
  const today = todayIso();
  const penList = [...pens.values()].sort((a, b) => a.name.localeCompare(b.name));
  // Como los canteros de la huerta: cada corral con sus lotes; al final, los que no tienen corral.
  const groups = [...penList.map((p) => ({ pen: p, list: [...herds.values()].filter((h) => h.penId === p.id) })), { pen: null, list: [...herds.values()].filter((h) => !h.penId || !pens.has(h.penId)) }];
  async function addHerd() {
    const h = newHerd(speciesId, today, { name: speciesName(speciesId, i18n.language), penId: penId || null });
    await save(h);
    navigate(`/farm/herd/${h.id}`);
  }
  async function addPen() {
    const p = newPen({ name: t('farm.pen.defaultName', { n: pens.size + 1 }) });
    await savePen(p);
    navigate(`/farm/pen/${p.id}`);
  }
  return (
    <div className="stack">
      <h1 className="page-title">{t('modules.farmHerd.title')}</h1>
      <PenAlerts />
      {herds.size === 0 && pens.size === 0 && <p className="muted">{t('farm.herd.empty')}</p>}
      {groups.map(({ pen, list }) =>
        pen || list.length ? (
          <section key={pen?.id ?? 'none'} className="card stack" data-testid={pen ? 'farm-pen-card' : 'farm-no-pen'}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 className="section-title" style={{ margin: 0 }}>
                {pen ? pen.name : t('farm.pen.none')}
              </h2>
              {pen && (
                <Link to={`/farm/pen/${pen.id}`} className="small">
                  {t('farm.pen.edit')}
                </Link>
              )}
            </div>
            {pen && !pen.waypointId && <p className="muted small">{t('farm.pen.noPlace')}</p>}
            {list.length ? (
              <ul className="list">
                {list
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((h) => {
                    const week = recentProduction(h, today);
                    return (
                      <li key={h.id}>
                        <Link className="list-row" to={`/farm/herd/${h.id}`}>
                          <span className="list-main">
                            {h.name} · {h.count}
                          </span>
                          <span className="list-sub">
                            {speciesName(h.speciesId, i18n.language)}
                            {Object.entries(week).map(([p, n]) => ` · ${t(`farm.herd.week.${p}`, { n })}`)}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
              </ul>
            ) : (
              <p className="muted small">{t('farm.pen.empty')}</p>
            )}
          </section>
        ) : null,
      )}
      <div className="card stack">
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
        {penList.length > 0 && (
          <div className="field">
            <label htmlFor="farm-new-pen">{t('farm.pen.label')}</label>
            <select id="farm-new-pen" className="select" value={penId} onChange={(e) => setPenId(e.target.value)} data-testid="farm-new-pen">
              <option value="">{t('farm.pen.none')}</option>
              {penList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <button type="button" className="btn btn-primary" onClick={() => void addHerd()} data-testid="farm-add-herd">
          {t('farm.herd.add')}
        </button>
        <button type="button" className="btn" onClick={() => void addPen()} data-testid="farm-add-pen">
          {t('farm.pen.add')}
        </button>
      </div>
    </div>
  );
}

/** Un corral: nombre, lugar (waypoint, para los avisos de calor y frío) y sus lotes. */
export function FarmPenPage() {
  const { t, i18n } = useTranslation();
  const { id = '' } = useParams();
  const navigate = useNavigate();
  useLoadHerds();
  const loaded = useHerds((s) => s.loaded);
  const pen = useHerds((s) => s.pens.get(id));
  const herds = useHerds((s) => s.herds);
  const { savePen, removePen } = useHerds.getState();
  if (!loaded) return null;
  if (!pen) return <Navigate to="/farm/herd" replace />;
  const list = [...herds.values()].filter((h) => h.penId === pen.id);
  return (
    <div className="stack" data-testid="farm-pen">
      <h1 className="page-title">{pen.name || t('farm.pen.label')}</h1>
      <div className="card stack">
        <div className="field">
          <label htmlFor="pen-name">{t('farm.pen.name')}</label>
          <input id="pen-name" className="input" value={pen.name} onChange={(e) => void savePen({ ...pen, name: e.target.value })} data-testid="pen-name" />
        </div>
        <WaypointField id="pen-place" label={t('farm.pen.place')} value={pen.waypointId} onChange={(waypointId) => void savePen({ ...pen, waypointId })} newName={pen.name} noneLabel={t('farm.pen.noPlaceShort')} hint={t('farm.pen.placeHint')} />
        <div className="field">
          <label htmlFor="pen-notes">{t('farm.pen.notes')}</label>
          <textarea id="pen-notes" className="input" rows={2} value={pen.notes} onChange={(e) => void savePen({ ...pen, notes: e.target.value })} />
        </div>
      </div>
      <PenAlerts penId={pen.id} />
      <section className="card stack">
        <h2 className="section-title">{t('farm.pen.animals')}</h2>
        {list.length ? (
          <ul className="list">
            {list.map((h) => (
              <li key={h.id}>
                <Link className="list-row" to={`/farm/herd/${h.id}`}>
                  <span className="list-main">
                    {h.name} · {h.count}
                  </span>
                  <span className="list-sub">{speciesName(h.speciesId, i18n.language)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">{t('farm.pen.empty')}</p>
        )}
      </section>
      <button
        type="button"
        className="btn btn-danger"
        onClick={async () => {
          if (!(await confirmAction(t('farm.pen.deleteConfirm', { name: pen.name })))) return;
          await removePen(pen.id);
          navigate('/farm/herd', { replace: true });
        }}
      >
        {t('farm.pen.delete')}
      </button>
    </div>
  );
}

/**
 * Avisos de calor y frío por corral: el pronóstico de su lugar (hoy y 3 días) contra el umbral de cada especie que tiene, con qué hacer.
 * Solo especies con umbral de aire con fuente (la abeja se mide dentro de la colmena y los peces en el agua). Sin `penId`, todos.
 */
function PenAlerts({ penId }: { penId?: string }) {
  const { t, i18n } = useTranslation();
  const pens = useHerds((s) => s.pens);
  const herds = useHerds((s) => s.herds);
  const waypoints = useWaypoints((s) => s.waypoints);
  const base = useSettings((s) => s.settings.weatherUrl);
  const places = useMemo(() => {
    const out: { pen: FarmPen; lat: number; lon: number; species: string[] }[] = [];
    for (const p of pens.values()) {
      if (penId && p.id !== penId) continue;
      const w = p.waypointId ? waypoints.get(p.waypointId) : undefined;
      if (!w) continue;
      out.push({ pen: p, lat: w.lat, lon: w.lon, species: [...new Set([...herds.values()].filter((h) => h.penId === p.id && h.count > 0).map((h) => h.speciesId))] });
    }
    return out;
  }, [pens, herds, waypoints, penId]);
  const [weather, setWeather] = useState<Record<string, FarmWeather>>({});
  const keys = [...new Set(places.map((p) => farmWeatherKey(p.lat, p.lon)))].sort().join('|');
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cached = await cachedFarmWeather().catch(() => ({}) as Record<string, FarmWeather>);
      if (cancelled) return;
      setWeather(cached);
      if (!navigator.onLine || !keys) return;
      for (const key of keys.split('|')) {
        const w = cached[key];
        if (w && Date.now() - Date.parse(w.fetchedAt) < FARM_WEATHER_STALE_MS) continue;
        const [lat, lon] = key.split(',').map(Number) as [number, number];
        try {
          const fresh = await fetchFarmWeather(base, lat, lon);
          await storeFarmWeather(fresh);
          if (!cancelled) setWeather((prev) => ({ ...prev, [key]: fresh }));
        } catch {
          // Sin conexión o sin respuesta: queda lo guardado.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [keys, base]);
  const today = todayIso();
  const dayFmt = new Intl.DateTimeFormat(i18n.language, { weekday: 'long' });
  const when = (d: string) => (d === today ? t('farm.alerts.today') : dayFmt.format(new Date(`${d}T12:00:00`)));
  const alerts = places.flatMap(({ pen, lat, lon, species }) => {
    const days = weather[farmWeatherKey(lat, lon)]?.days ?? [];
    return species.flatMap((sid) => {
      const st = farmPlan.stress?.[sid];
      if (!st) return [];
      const r = stressDays(days, today, st.heat?.value ?? null, st.cold?.value ?? null);
      const out = [];
      if (r.heat.length) out.push({ key: `${pen.id}-${sid}-h`, pen, sid, kind: 'heat' as const, day: r.heat[0]!, temp: Math.max(...r.heat.map((d) => d.max)), limit: st.heat!, todo: st.heatDo });
      if (r.cold.length) out.push({ key: `${pen.id}-${sid}-c`, pen, sid, kind: 'cold' as const, day: r.cold[0]!, temp: Math.min(...r.cold.map((d) => d.min)), limit: st.cold!, todo: st.coldDo });
      return out;
    });
  });
  if (!alerts.length) return null;
  return (
    <div className="stack" data-testid="farm-alerts">
      {alerts.map((a) => (
        <div key={a.key} className="fauna-warning" data-status={a.kind === 'heat' ? 'prohibida' : undefined} data-kind={a.kind}>
          <strong>
            {t(a.kind === 'heat' ? 'farm.alerts.heat' : 'farm.alerts.cold', { pen: a.pen.name, species: speciesName(a.sid, i18n.language), when: when(a.day.date), temp: Math.round(a.temp), limit: a.limit.value })}
          </strong>
          {a.todo && <p style={{ margin: '4px 0' }}>{a.todo}</p>}
          <span className="muted small">
            {a.limit.confidence && a.limit.confidence !== 'oficial' ? `${t('farm.unconfirmed')} · ` : ''}
            {a.limit.source?.url ? (
              <a href={a.limit.source.url} target="_blank" rel="noreferrer">
                {a.limit.source.org}
              </a>
            ) : (
              a.limit.source?.org
            )}
            {' · '}
            {t('farm.alerts.informative')}
          </span>
        </div>
      ))}
    </div>
  );
}

// ——— Urgencias veterinarias ———

const VET_GROUPS = ['aves', 'conejos', 'rumiantes', 'cerdos', 'equinos', 'camelidos', 'abejas', 'peces'] as const;

/** Qué señales piden veterinario ya, cuáles hoy y cuáles hay que avisar a SENASA; qué hacer mientras tanto. Nunca medicamentos. */
export function FarmVetPage() {
  const { t } = useTranslation();
  const urgent = farmPlan.urgent ?? {};
  const levelLabel = (l: string) => t(`farm.vet.level.${l}`);
  return (
    <div className="stack">
      <h1 className="page-title">{t('modules.farmVet.title')}</h1>
      <div className="fauna-warning" data-status="prohibida" role="note">
        <strong>{t('farm.vet.callVet')}</strong>
        <p style={{ margin: '4px 0' }}>{t('farm.vet.noMeds')}</p>
      </div>
      {farmPlan.senasa && (
        <section className="card stack" data-testid="farm-senasa">
          <h2 className="section-title">{t('farm.vet.senasaTitle')}</h2>
          <p>{farmPlan.senasa}</p>
        </section>
      )}
      {VET_GROUPS.map((g) => {
        const list = urgent[g];
        if (!list?.length) return null;
        return (
          <Collapsible key={g} id={`farm-vet-${g}`} testId={`farm-vet-${g}`} title={t(`farm.group.${g}`)} summary={<span className="muted small">{t('farm.vet.signs', { count: list.length })}</span>}>
            <ul className="stack">
              {list.map((u, i) => (
                <li key={i} className={u.level === 'ya' || u.level === 'senasa' ? 'fauna-warning' : 'card'} data-level={u.level}>
                  <span className="fauna-banned">{levelLabel(u.level)}</span>
                  {u.confidence && u.confidence !== 'oficial' && <span className="fauna-regulated"> {t('farm.unconfirmed')}</span>}
                  <p style={{ margin: '4px 0' }}>
                    <strong>{u.sign}</strong>
                  </p>
                  <p style={{ margin: '4px 0' }}>{u.todo}</p>
                  {u.source && (
                    <span className="muted small">
                      {u.source.url ? (
                        <a href={u.source.url} target="_blank" rel="noreferrer">
                          {u.source.org}
                        </a>
                      ) : (
                        u.source.org
                      )}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Collapsible>
        );
      })}
    </div>
  );
}

const EVENT_KINDS: FarmEvent['kind'][] = ['vaccine', 'deworm', 'birth', 'bought', 'death', 'slaughter', 'sold', 'note'];

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
  const roots = [...locations.values()].sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name));
  const products = SPECIES_PRODUCTS[h?.speciesId ?? ''] ?? [];
  const [product, setProduct] = useState<FarmProduction['product'] | ''>('');
  const [qty, setQty] = useState('');
  const [date, setDate] = useState(todayIso());
  const [toInventory, setToInventory] = useState(true);
  const [locationId, setLocationId] = useState('');
  const [eventKind, setEventKind] = useState<FarmEvent['kind']>('vaccine');
  const [eventCount, setEventCount] = useState('');
  const [eventNote, setEventNote] = useState('');
  if (!loaded) return null;
  if (!h) return <Navigate to="/farm/herd" replace />;
  const prod = product || products[0] || '';
  const unit = prod ? PRODUCT_UNIT[prod] : '';
  const q = parseNum(qty);

  async function saveProduction(amount: number) {
    if (!prod || !h || amount <= 0) return;
    const locId = toInventory ? locationId || roots[0]?.id || (await harvestLocation(t('garden.pantry'))).id : '';
    const itemName = `${t(`farm.herd.product.${prod}`)} (${speciesName(h.speciesId, i18n.language)}, ${t('farm.herd.fromFarm')})`;
    await addProduction(h.id, { date, product: prod, quantity: amount, unit }, toInventory ? { locationId: locId, itemName } : null);
    setQty('');
  }

  return (
    <div className="stack" data-testid="farm-herd">
      <h1 className="page-title">{h.name}</h1>
      <div className="card stack">
        <div className="field">
          <label htmlFor="herd-name">{t('farm.herd.name')}</label>
          <input id="herd-name" className="input" value={h.name} onChange={(e) => void save({ ...h, name: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="herd-count">{t('farm.herd.count')}</label>
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <button type="button" className="icon-btn" aria-label="−1" onClick={() => void save({ ...h, count: Math.max(0, h.count - 1) })}>
              <Minus size={20} aria-hidden />
            </button>
            <input id="herd-count" className="input" inputMode="numeric" style={{ maxWidth: 100, textAlign: 'center' }} value={String(h.count)} onChange={(e) => void save({ ...h, count: Math.max(0, Math.round(parseNum(e.target.value) ?? 0)) })} data-testid="herd-count" />
            <button type="button" className="icon-btn" aria-label="+1" onClick={() => void save({ ...h, count: h.count + 1 })}>
              <Plus size={20} aria-hidden />
            </button>
          </div>
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
        <Link to={`/farm/species/${h.speciesId}`}>{t('farm.herd.sheet', { name: speciesName(h.speciesId, i18n.language) })}</Link>
      </div>

      {products.length > 0 && (
        <section className="card stack" data-testid="herd-production">
          <h2 className="section-title">{t('farm.herd.production')}</h2>
          {products.length > 1 && (
            <div className="chips" role="group">
              {products.map((p) => (
                <button key={p} type="button" className="chip" aria-pressed={prod === p} onClick={() => setProduct(p)}>
                  {t(`farm.herd.product.${p}`)}
                </button>
              ))}
            </div>
          )}
          {/* Botones grandes para anotar con guantes: huevos de a 1 o de a 6; lo demás con cantidad. */}
          {prod === 'eggs' && (
            <div className="row" style={{ gap: 8 }}>
              {[1, 6, 12].map((n) => (
                <button key={n} type="button" className="btn btn-primary" style={{ flex: 1, minHeight: 56, fontSize: '1.2rem' }} onClick={() => void saveProduction(n)} data-testid={`herd-eggs-${n}`}>
                  +{n}
                </button>
              ))}
            </div>
          )}
          <div className="row" style={{ gap: 8 }}>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="herd-qty">{t('farm.herd.qty', { unit })}</label>
              <input id="herd-qty" className="input" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} data-testid="herd-qty" />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="herd-date">{t('farm.herd.date')}</label>
              <input id="herd-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <label className="check">
            <input type="checkbox" checked={toInventory} onChange={(e) => setToInventory(e.target.checked)} data-testid="herd-to-inventory" />
            {t('garden.toInventory')}
          </label>
          {toInventory && roots.length > 0 && (
            <select className="select" aria-label={t('garden.harvestLocation')} value={locationId || roots[0]!.id} onChange={(e) => setLocationId(e.target.value)}>
              {roots.map((l) => (
                <option key={l.id} value={l.id}>
                  {'· '.repeat(l.depth - 1)}
                  {l.name}
                </option>
              ))}
            </select>
          )}
          <button type="button" className="btn" disabled={q === null || q <= 0} onClick={() => void saveProduction(q ?? 0)} data-testid="herd-add-production">
            {t('farm.herd.addProduction')}
          </button>
          {h.production.length > 0 && (
            <ul className="list">
              {h.production.slice(0, 20).map((p) => (
                <li key={p.id} className="list-row">
                  <span className="list-main">
                    {p.date} · {t(`farm.herd.product.${p.product}`)}: {p.quantity} {p.unit}
                  </span>
                  <button type="button" className="icon-btn" aria-label={t('farm.herd.delete')} onClick={() => void removeProduction(h.id, p.id)}>
                    <Trash2 size={18} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="card stack" data-testid="herd-events">
        <h2 className="section-title">{t('farm.herd.events')}</h2>
        <div className="row" style={{ gap: 8 }}>
          <select className="select" style={{ flex: 2 }} aria-label={t('farm.herd.eventKind')} value={eventKind} onChange={(e) => setEventKind(e.target.value as FarmEvent['kind'])} data-testid="herd-event-kind">
            {EVENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`farm.herd.event.${k}`)}
              </option>
            ))}
          </select>
          <input className="input" style={{ flex: 1 }} inputMode="numeric" placeholder={t('farm.herd.howMany')} aria-label={t('farm.herd.howMany')} value={eventCount} onChange={(e) => setEventCount(e.target.value)} data-testid="herd-event-count" />
        </div>
        <input className="input" placeholder={t('farm.herd.note')} aria-label={t('farm.herd.note')} value={eventNote} onChange={(e) => setEventNote(e.target.value)} />
        <button
          type="button"
          className="btn"
          data-testid="herd-add-event"
          onClick={() => {
            const n = parseNum(eventCount);
            void addEvent(h.id, { date: todayIso(), kind: eventKind, count: n && n > 0 ? Math.round(n) : null, note: eventNote.trim() });
            setEventCount('');
            setEventNote('');
          }}
        >
          {t('farm.herd.addEvent')}
        </button>
        {h.events.length > 0 && (
          <ul className="list">
            {h.events.slice(0, 30).map((e) => (
              <li key={e.id} className="list-row">
                <span className="list-main">
                  {e.date} · {t(`farm.herd.event.${e.kind}`)}
                  {e.count ? ` (${e.count})` : ''}
                </span>
                {e.note && <span className="list-sub">{e.note}</span>}
                <button type="button" className="icon-btn" aria-label={t('farm.herd.delete')} onClick={() => void removeEvent(h.id, e.id)}>
                  <Trash2 size={18} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="muted small">{t('farm.herd.eventHint')}</p>
      </section>

      <button
        type="button"
        className="btn btn-danger"
        onClick={async () => {
          if (!(await confirmAction(t('farm.herd.deleteConfirm', { name: h.name })))) return;
          await remove(h.id);
          navigate('/farm/herd', { replace: true });
        }}
      >
        {t('farm.herd.deleteHerd')}
      </button>
    </div>
  );
}
