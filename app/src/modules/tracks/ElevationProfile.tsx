import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { distanceMeters } from '@/core/geo/geo';
import type { Track } from '@/core/model/types';
import { useSettings } from '@/core/settings/settings';
import { formatAltitude } from '@/core/units/units';
import { smoothElevations } from './gpx';

/**
 * Perfil de altura: distancia recorrida contra altura. La fuente es la altura que midió el GPS, ya alisada (la cruda tiene saltos de ±20 m que el terreno no
 * tiene: ver `smoothElevations`). El pie dice el rango del mismo perfil que se dibuja.
 */
export function ElevationProfile({ track }: { track: Track }) {
  const { t, i18n } = useTranslation();
  const units = useSettings((s) => s.settings.units);
  const chart = useMemo(() => {
    const pts: [number, number][] = [];
    let acc = 0;
    for (const seg of track.segments) {
      const smooth = smoothElevations(seg);
      for (let i = 0; i < seg.length; i++) {
        const [lat, lon] = seg[i]!;
        if (i > 0) acc += distanceMeters({ lat: seg[i - 1]![0], lon: seg[i - 1]![1] }, { lat, lon });
        const e = smooth[i];
        if (e !== null && e !== undefined) pts.push([acc, e]);
      }
    }
    if (pts.length < 2) return null;
    const min = Math.min(...pts.map((p) => p[1]));
    const max = Math.max(...pts.map((p) => p[1]));
    const W = 300;
    const H = 80;
    const span = Math.max(1, max - min);
    const total = Math.max(1, acc);
    const line = pts.map(([d, e]) => `${((d / total) * W).toFixed(1)},${(H - ((e - min) / span) * (H - 6) - 3).toFixed(1)}`).join(' ');
    return { line, area: `0,${H} ${line} ${W},${H}`, min, max };
  }, [track]);
  if (!chart) return null;
  return (
    <figure className="track-profile" data-testid="track-profile">
      <svg viewBox="0 0 300 80" preserveAspectRatio="none" role="img" aria-label={t('tracks.profile')}>
        <polygon points={chart.area} className="track-profile-area" />
        <polyline points={chart.line} className="track-profile-line" fill="none" />
      </svg>
      <figcaption className="hint">
        {t('tracks.profileRange', {
          min: formatAltitude(chart.min, units, i18n.language),
          max: formatAltitude(chart.max, units, i18n.language),
        })}
      </figcaption>
    </figure>
  );
}
