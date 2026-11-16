import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trees } from 'lucide-react';
import { formatDistance } from '@/core/units/units';
import { useSettings } from '@/core/settings/settings';
import { useRecorder } from '@/modules/tracks/recorder';
import { biomeName, ecoregionAt, ecoregionName, ecoregionsAlong, ECOREGIONS_CREDIT, loadEcoregions, type EcoregionData } from './ecoregions';

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

/** «Ecorregión: Bosques templados valdivianos» para un punto; nada si no hay datos o no cae en ninguna. */
export function EcoregionLine({ lat, lon, testId = 'ecoregion-now' }: { lat: number; lon: number; testId?: string }) {
  const { t, i18n } = useTranslation();
  const data = useEcoregionData();
  // Con el GPS cambiando cada segundo alcanza con una cifra de ~100 m para saber en qué ecorregión se está.
  const e = useMemo(() => (data ? ecoregionAt(data, Math.round(lat * 1000) / 1000, Math.round(lon * 1000) / 1000) : null), [data, lat, lon]);
  if (!data || !e) return null;
  return (
    <span className="rec-hint" data-testid={testId} title={biomeName(data, e)}>
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
  const data = useEcoregionData();
  const current = useMemo(() => (data && last ? ecoregionAt(data, Math.round(last[0] * 1000) / 1000, Math.round(last[1] * 1000) / 1000) : null), [data, last]);
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
  const data = useEcoregionData();
  const list = useMemo(
    () => (data ? segments.flatMap((seg) => ecoregionsAlong(data, seg.map((p) => [p[1] as number, p[0] as number] as [number, number]))) : []),
    [data, segments],
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
  if (!data || merged.length === 0) return null;
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
                {biomeName(data, s.ecoregion)} · {formatDistance(s.meters, units, i18n.language)} ({Math.round((100 * s.meters) / total)} %)
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="hint" style={{ margin: 0 }}>{t('ecoregions.alongHint', { credit: ECOREGIONS_CREDIT })}</p>
    </section>
  );
}
