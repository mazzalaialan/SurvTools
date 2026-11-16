import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mountain } from 'lucide-react';
import { formatDistance } from '@/core/units/units';
import { useSettings } from '@/core/settings/settings';
import { useRecorder } from '@/modules/tracks/recorder';
import { GEOLOGY_CREDIT, geologyAlong, geologyAt, inGeologyCoverage, loadGeologyIndex, unitAge, type GeologyIndex } from './geology';
import { onLayersChange } from './zoneLayers';

/** La base nacional y el detalle guardado de las zonas; `null` mientras carga. Se vuelve a leer si cambian las zonas. */
export function useGeologyIndex(enabled = true): GeologyIndex | null {
  const [idx, setIdx] = useState<GeologyIndex | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const read = () => void loadGeologyIndex().then((i) => live && setIdx(i));
    read();
    const off = onLayersChange(read);
    return () => {
      live = false;
      off();
    };
  }, [enabled]);
  return idx;
}

/** «Geología: Formación Aseret (Plioceno)» para un punto; nada si no hay datos. */
export function GeologyLine({ lat, lon, testId = 'geology-now' }: { lat: number; lon: number; testId?: string }) {
  const { t } = useTranslation();
  const idx = useGeologyIndex(inGeologyCoverage(lat, lon));
  const hit = useMemo(() => (idx ? geologyAt(idx, Math.round(lat * 1000) / 1000, Math.round(lon * 1000) / 1000) : null), [idx, lat, lon]);
  if (!hit) return null;
  return (
    <span className="rec-hint" data-testid={testId} title={hit.unit.litho}>
      <Mountain size={14} aria-hidden /> {t('geology.now', { name: hit.unit.name, age: unitAge(hit.unit) })}
    </span>
  );
}

/** Qué roca pisás, con el último punto de lo que se está grabando. */
export function RecordingGeology() {
  const last = useRecorder((s) => s.track?.segments.at(-1)?.at(-1));
  return last ? <GeologyLine lat={last[0]} lon={last[1]} /> : null;
}

/** Por qué unidades geológicas pasó un recorrido guardado y cuánto hizo en cada una. */
export function TrackGeology({ segments }: { segments: readonly (readonly (readonly unknown[])[])[] }) {
  const { t, i18n } = useTranslation();
  const units = useSettings((s) => s.settings.units);
  const first = segments.find((s) => s.length)?.[0];
  const idx = useGeologyIndex(!!first && inGeologyCoverage(first[0] as number, first[1] as number));
  const merged = useMemo(() => {
    if (!idx) return [];
    const m = new Map<string, ReturnType<typeof geologyAlong>[number]>();
    for (const seg of segments) {
      for (const s of geologyAlong(idx, seg.map((p) => [p[1] as number, p[0] as number] as [number, number]))) {
        const k = JSON.stringify(s.unit);
        const cur = m.get(k);
        m.set(k, cur ? { ...cur, meters: cur.meters + s.meters } : s);
      }
    }
    return [...m.values()].sort((a, b) => b.meters - a.meters);
  }, [idx, segments]);
  if (merged.length === 0) return null;
  const total = merged.reduce((n, s) => n + s.meters, 0) || 1;
  return (
    <section className="card stack" aria-labelledby="track-geology" data-testid="track-geology">
      <h2 id="track-geology" className="section-title" style={{ margin: 0 }}>{t('geology.alongTitle')}</h2>
      <ul className="list">
        {merged.map((s) => (
          <li key={JSON.stringify(s.unit)} className="list-row">
            <span className="list-main">
              <span className="list-title">{s.unit.name}</span>
              <span className="list-sub">
                {[unitAge(s.unit), s.unit.litho].filter(Boolean).join(' · ')} · {formatDistance(s.meters, units, i18n.language)} ({Math.round((100 * s.meters) / total)} %)
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="hint" style={{ margin: 0 }}>{t('geology.alongHint', { credit: GEOLOGY_CREDIT })}</p>
    </section>
  );
}
