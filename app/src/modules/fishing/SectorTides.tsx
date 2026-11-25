import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Waves } from 'lucide-react';
import { loadOfficialTides, nearestOfficial, officialBetween, type OfficialEvent, type OfficialPort } from '@/modules/navigation/officialTides';
import type { FishSector } from './fishing';

/** Centro aproximado de un tramo (para buscar el puerto de marea más cercano). */
function centerOf(s: FishSector): [number, number] | null {
  const pts: number[][] = [];
  (function walk(c: unknown) {
    if (Array.isArray(c) && typeof c[0] === 'number') pts.push(c as number[]);
    else if (Array.isArray(c)) c.forEach(walk);
  })(s.geometry.coordinates);
  if (!pts.length) return null;
  return [pts.reduce((a, p) => a + p[0]!, 0) / pts.length, pts.reduce((a, p) => a + p[1]!, 0) / pts.length];
}

/**
 * Mareas de hoy al lado de un lugar de pesca de mar: pleamares y bajamares del puerto oficial más cercano (tablas del SHN que la app ya
 * baja con los datos de Argentina; ver modules/navigation/officialTides.ts). Sin el archivo o sin puerto cerca (60 km), no muestra nada.
 */
export function SectorTides({ sector }: { sector: FishSector }) {
  const { t, i18n } = useTranslation();
  const [info, setInfo] = useState<{ port: OfficialPort; km: number; events: OfficialEvent[] } | null>(null);
  useEffect(() => {
    let alive = true;
    const c = centerOf(sector);
    if (!c) return;
    void loadOfficialTides().then((data) => {
      if (!alive || !data) return;
      const near = nearestOfficial(data.ports, c[1], c[0]);
      if (!near) return;
      const now = Date.now();
      const events = officialBetween(near.port, data.year, now - 3 * 3_600_000, now + 27 * 3_600_000).slice(0, 6);
      setInfo({ ...near, events });
    });
    return () => {
      alive = false;
    };
  }, [sector]);
  if (!info || !info.events.length) return null;
  const fmt = (ms: number) => new Date(ms).toLocaleString(i18n.language, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  return (
    <section className="card stack" data-testid="fish-sector-tides">
      <h2 className="section-title">
        <Waves size={18} aria-hidden /> {t('fishing.tides.title', { port: info.port.name, km: Math.round(info.km) })}
      </h2>
      <ul className="list">
        {info.events.map((e) => (
          <li key={e.at} className="list-row">
            <span className="list-main">
              <span className="list-title">{e.high ? t('fishing.tides.high') : t('fishing.tides.low')}</span>
              <span className="list-sub">
                {fmt(e.at)} · {e.height.toLocaleString(i18n.language, { maximumFractionDigits: 2 })} m
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="small muted">{t('fishing.tides.source', { src: info.port.src })}</p>
    </section>
  );
}
