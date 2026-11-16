import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trees } from 'lucide-react';
import { formatDistance } from '@/core/units/units';
import { useSettings } from '@/core/settings/settings';
import { useRecorder } from '@/modules/tracks/recorder';
import { loadStoredLayers, mergeForest, onLayersChange } from '@/modules/layers/zoneLayers';
import { biomeName, ecoregionName, ecoregionsAlongWith, ECOREGIONS_CREDIT, finerLookup, loadEcoregions, type EcoLookup, type Ecoregion, type EcoregionData } from './ecoregions';

/** El archivo de ecorregiones (guardado con los datos del país); `null` mientras carga o si no está. */
export function useEcoregionData(): EcoregionData | null {
  const [data, setData] = useState<EcoregionData | null>(null);
  useEffect(() => {
    let live = true;
    void loadEcoregions().then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, []);
  return data;
}

/** Las ecorregiones finas guardadas (cobertura de bosque de las zonas descargadas); se vuelven a leer si cambian las zonas. */
export function useFineEcoregions(): EcoregionData | null {
  const [data, setData] = useState<EcoregionData | null>(null);
  useEffect(() => {
    let live = true;
    const read = () => void loadStoredLayers().then((l) => live && setData(mergeForest(l.forest)));
    read();
    const off = onLayersChange(read);
    return () => {
      live = false;
      off();
    };
  }, []);
  return data;
}

export interface EcoContext {
  coarse: EcoregionData | null;
  fine: EcoregionData | null;
  /** La fina donde hay datos, si no la gruesa. */
  lookup: EcoLookup;
  fineAt: EcoLookup;
  biome: (e: Ecoregion) => string;
}

/** La ecorregión gruesa (RESOLVE) y la fina (Bosque Andino Patagónico de las zonas descargadas), listas para consultar por punto. */
export function useEcoContext(): EcoContext | null {
  const coarse = useEcoregionData();
  const fine = useFineEcoregions();
  return useMemo(() => {
    if (!coarse) return null;
    const { lookup, fineAt } = finerLookup(coarse, fine);
    const fineIds = new Set(fine?.ecoregions.map((e) => e.id));
    return { coarse, fine, lookup, fineAt, biome: (e) => biomeName(fineIds.has(e.id) && fine ? fine : coarse, e) };
  }, [coarse, fine]);
}

/** «Ecorregión: Bosques templados valdivianos» para un punto; nada si no hay datos o no cae en ninguna. */
export function EcoregionLine({ lat, lon, testId = 'ecoregion-now' }: { lat: number; lon: number; testId?: string }) {
  const { t, i18n } = useTranslation();
  const ctx = useEcoContext();
  // Con el GPS cambiando cada segundo alcanza con una cifra de ~100 m para saber en qué ecorregión se está.
  const e = useMemo(() => ctx?.lookup(Math.round(lat * 1000) / 1000, Math.round(lon * 1000) / 1000) ?? null, [ctx, lat, lon]);
  if (!ctx || !e) return null;
  return (
    <span className="rec-hint" data-testid={testId} title={ctx.biome(e)}>
      <Trees size={14} aria-hidden /> {t('ecoregions.now', { name: ecoregionName(e, i18n.language) })}
    </span>
  );
}

/**
 * En qué ecorregión estás, con el último punto de lo que se está grabando (barra de grabación y pantalla en vivo). Al pasar de una a otra
 * se resalta «Entraste en: …» durante un rato (solo en pantalla: sin sonido ni vibración).
 */
export function RecordingEcoregion() {
  const { t, i18n } = useTranslation();
  const last = useRecorder((s) => s.track?.segments.at(-1)?.at(-1));
  const ctx = useEcoContext();
  const current = useMemo(() => (ctx && last ? ctx.lookup(Math.round(last[0] * 1000) / 1000, Math.round(last[1] * 1000) / 1000) : null), [ctx, last]);
  const prev = useRef<number | null>(null);
  const [entered, setEntered] = useState<string | null>(null);
  useEffect(() => {
    if (!current) return;
    // Un cambio de una ecorregión a otra (no el primer dato ni salir al mar y volver a la misma).
    if (prev.current !== null && prev.current !== current.id) {
      setEntered(ecoregionName(current, i18n.language));
      const id = setTimeout(() => setEntered(null), 30_000);
      prev.current = current.id;
      return () => clearTimeout(id);
    }
    prev.current = current.id;
  }, [current, i18n.language]);
  if (!last) return null;
  return (
    <>
      <EcoregionLine lat={last[0]} lon={last[1]} />
      {entered && (
        <span className="rec-hint" role="status" data-testid="ecoregion-entered">
          <strong>{t('ecoregions.entered', { name: entered })}</strong>
        </span>
      )}
    </>
  );
}

/** Por qué ecorregiones pasó un recorrido guardado y cuánto hizo en cada una. */
export function TrackEcoregions({ segments }: { segments: readonly (readonly (readonly unknown[])[])[] }) {
  const { t, i18n } = useTranslation();
  const units = useSettings((s) => s.settings.units);
  const ctx = useEcoContext();
  const list = useMemo(
    () => (ctx ? segments.flatMap((seg) => ecoregionsAlongWith(ctx.lookup, seg.map((p) => [p[1] as number, p[0] as number] as [number, number]))) : []),
    [ctx, segments],
  );
  // Un mismo recorrido con varios tramos repite ecorregiones: se suman.
  const merged = useMemo(() => {
    const m = new Map<number, (typeof list)[number]>();
    for (const s of list) {
      const cur = m.get(s.ecoregion.id);
      m.set(s.ecoregion.id, cur ? { ...cur, meters: cur.meters + s.meters } : { ...s });
    }
    return [...m.values()];
  }, [list]);
  if (!ctx || merged.length === 0) return null;
  const total = merged.reduce((n, s) => n + s.meters, 0) || 1;
  return (
    <section className="card stack" aria-labelledby="track-ecoregions" data-testid="track-ecoregions">
      <h2 id="track-ecoregions" className="section-title" style={{ margin: 0 }}>{t('ecoregions.alongTitle')}</h2>
      <ul className="list">
        {merged.map((s) => (
          <li key={s.ecoregion.id} className="list-row">
            <span className="list-main">
              <span className="list-title">{ecoregionName(s.ecoregion, i18n.language)}</span>
              <span className="list-sub">
                {ctx.biome(s.ecoregion)} · {formatDistance(s.meters, units, i18n.language)} ({Math.round((100 * s.meters) / total)} %)
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="hint" style={{ margin: 0 }}>{t('ecoregions.alongHint', { credit: ECOREGIONS_CREDIT })}</p>
    </section>
  );
}
