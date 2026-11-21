import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { distanceMeters } from '@/core/geo/geo';
import type { Track } from '@/core/model/types';
import { useSettings } from '@/core/settings/settings';
import { formatAltitude } from '@/core/units/units';
import { smoothElevations } from './gpx';
import { ensureTerrain, needsTerrain } from './terrainElevation';

/**
 * Perfil de altura: distancia recorrida contra altura. Si el recorrido tiene la altura del TERRENO (leída del mapa de elevación), se dibuja esa; si no,
 * la que midió el GPS ya alisada (la cruda tiene picos de ±20 m que no existen). La primera vez que se abre un recorrido grabado se calcula la del
 * terreno (si hay datos de elevación) y se guarda.
 */
export function ElevationProfile({ track }: { track: Track }) {
  const { t, i18n } = useTranslation();
  const units = useSettings((s) => s.settings.units);
  const pending = needsTerrain(track);
  useEffect(() => {
    if (pending) void ensureTerrain(track.id);
  }, [pending, track.id]);

  const chart = useMemo(() => {
    let pts: [number, number][] = [];
    const terrain = track.terrain?.profile;
    if (terrain && terrain.length >= 2) {
      pts = terrain.map((e, i) => [i, e]);
    } else {
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
    }
    if (pts.length < 2) return null;
    const min = Math.min(...pts.map((p) => p[1]));
    const max = Math.max(...pts.map((p) => p[1]));
    const W = 300;
    const H = 80;
    const span = Math.max(1, max - min);
    const total = Math.max(1, pts.at(-1)![0] - pts[0]![0]);
    const line = pts.map(([d, e]) => `${(((d - pts[0]![0]) / total) * W).toFixed(1)},${(H - ((e - min) / span) * (H - 6) - 3).toFixed(1)}`).join(' ');
    const fromTerrain = !!(terrain && terrain.length >= 2);
    // Con el terreno, el pie dice lo mismo que el resumen del recorrido (la mínima y la máxima del mapa, no las del perfil reducido a unos pocos puntos).
    return { line, area: `0,${H} ${line} ${W},${H}`, min: fromTerrain && track.minEle !== null ? track.minEle : min, max: fromTerrain && track.maxEle !== null ? track.maxEle : max, terrain: fromTerrain };
  }, [track]);
  if (!chart) return null;
  return (
    <figure className="track-profile" data-testid="track-profile" data-source={chart.terrain ? 'terrain' : 'gps'}>
      <svg viewBox="0 0 300 80" preserveAspectRatio="none" role="img" aria-label={t('tracks.profile')}>
        <polygon points={chart.area} className="track-profile-area" />
        <polyline points={chart.line} className="track-profile-line" fill="none" />
      </svg>
      <figcaption className="hint">
        {t('tracks.profileRange', {
          min: formatAltitude(chart.min, units, i18n.language),
          max: formatAltitude(chart.max, units, i18n.language),
        })}
        {' · '}
        <span data-testid="track-profile-source">{t(chart.terrain ? 'tracks.profileTerrain' : 'tracks.profileGps')}</span>
      </figcaption>
    </figure>
  );
}
