import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { TriangleAlert } from 'lucide-react';
import type { Track } from '@/core/model/types';
import { useSettings } from '@/core/settings/settings';
import { formatAltitude } from '@/core/units/units';
import { heightDifference, type HeightDifference } from './heightCheck';

/** Aviso (no cambia ningún dato): la altura del GPS de este recorrido difiere mucho de la del mapa; dice dónde calibrar. */
export function HeightWarning({ track }: { track: Track }) {
  const { t, i18n } = useTranslation();
  const units = useSettings((s) => s.settings.units);
  const [diff, setDiff] = useState<HeightDifference | null>(null);
  const finished = !track.recording;
  useEffect(() => {
    if (!finished) return;
    let alive = true;
    heightDifference(track)
      .then((d) => alive && setDiff(d))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [track, finished]);
  if (!diff) return null;
  return (
    <div className="stack" style={{ gap: 4 }} role="note" data-testid="height-warning">
      <strong>
        <TriangleAlert size={16} aria-hidden /> {t('tracks.heightWarnTitle')}
      </strong>
      <p className="hint">
        {t(diff.diffM > 0 ? 'tracks.heightWarnAbove' : 'tracks.heightWarnBelow', { diff: formatAltitude(Math.abs(diff.diffM), units, i18n.language) })}
      </p>
      <Link className="btn" to="/orientation/altimeter">
        {t('tracks.heightWarnGo')}
      </Link>
    </div>
  );
}
