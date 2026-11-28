import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Minus, Plus } from 'lucide-react';
import { isUnlocked } from '@/core/security/session';
import { today as todayIso } from '@/modules/inventory/domain/dates';
import { useInventory } from '@/modules/inventory/store';
import { parseNum } from '@/ui/numbers';
import { FarmNotice } from './FarmPages';
import data from './farm-AR.json';
import { REGIONS, animalsFor, farmPlan, tasksFor, yearlyNeed, yields, type Product } from './plan';
import { useHerds } from './herd';
import { placeWaypointOf } from '@/modules/inventory/domain/locations';
import { useWaypoints } from '@/modules/waypoints/store';
import { useSettings } from '@/core/settings/settings';
import { Collapsible } from '@/ui/Collapsible';
import type { FarmPen } from '@/core/model/types';
import { FARM_WEATHER_STALE_MS, cachedFarmWeather, farmWeatherKey, fetchFarmWeather, stressDays, storeFarmWeather, type FarmWeather } from './weather';

/**
 * Etapa 2 de Granja (docs/GRANJA.md): calculadora «cuántos animales para N personas», calendario de tareas por mes y región, y el
 * registro de mis grupos de animales (eventos y producción, con «Sumar al inventario»).
 */

export const SPECIES = (data as { species: { id: string; name: { es: string; en?: string; pt?: string } }[] }).species;
export const speciesName = (id: string, lang: string) => {
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
  // Por defecto, las especies de mis grupos de animales; sin lotes, todas.
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

export function useLoadHerds() {
  const loaded = useHerds((s) => s.loaded);
  useEffect(() => {
    // Si el módulo se cargó después de desbloquear, el aviso de sesión ya pasó: se lee acá.
    if (!loaded && isUnlocked()) void useHerds.getState().load();
  }, [loaded]);
}

/**
 * Avisos de calor y frío por corral: el pronóstico de su lugar (hoy y 3 días) contra el umbral de cada especie que tiene, con qué hacer.
 * Solo especies con umbral de aire con fuente (la abeja se mide dentro de la colmena y los peces en el agua). Sin `penId`, todos.
 */
export function PenAlerts({ penId }: { penId?: string }) {
  const { t, i18n } = useTranslation();
  const pens = useHerds((s) => s.pens);
  const herds = useHerds((s) => s.herds);
  const waypoints = useWaypoints((s) => s.waypoints);
  const locations = useInventory((s) => s.locations);
  const base = useSettings((s) => s.settings.weatherUrl);
  const places = useMemo(() => {
    const out: { pen: FarmPen; lat: number; lon: number; species: string[] }[] = [];
    for (const p of pens.values()) {
      if (penId && p.id !== penId) continue;
      const wid = placeWaypointOf(p, locations);
      const w = wid ? waypoints.get(wid) : undefined;
      if (!w) continue;
      out.push({ pen: p, lat: w.lat, lon: w.lon, species: [...new Set([...herds.values()].filter((h) => h.penId === p.id && h.count > 0).map((h) => h.speciesId))] });
    }
    return out;
  }, [pens, herds, waypoints, locations, penId]);
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
          {a.todo && (
            <details className="farm-todo">
              <summary>{t('farm.alerts.what')}</summary>
              <p style={{ margin: '4px 0' }}>{a.todo}</p>
            </details>
          )}
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
