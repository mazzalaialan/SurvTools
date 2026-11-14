import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { usePlacePicker } from '@/modules/waypoints/PlacePicker';
import { NavigationNotice } from './NavigationNotice';
import { RiversCard } from './RiversCard';
import { TidesCard } from './TidesCard';
import { BoliviaRiversCard } from './BoliviaRiversCard';
import { ChileMarineCard } from './ChileMarineCard';
import { SourcesCard } from './SourcesCard';
import { UruguayMarineCard } from './UruguayMarineCard';
import { sourceEnabled } from './sources';
import { WavesCard } from './WavesCard';

/** Navegación: niveles de los ríos de Argentina, mareas y oleaje con viento. Todo orientativo. */
export function NavigationPage() {
  const { t } = useTranslation();
  // ?lat=&lon= (enlace «Ver todo en Navegación» del mapa): se arranca en ese lugar en vez de en tu ubicación.
  const [params] = useSearchParams();
  const initial = useMemo(() => {
    const lat = Number(params.get('lat'));
    const lon = Number(params.get('lon'));
    return params.get('lat') && params.get('lon') && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
  }, [params]);
  const { place, picker } = usePlacePicker(initial);
  return (
    <div className="stack">
      <h1 className="page-title">{t('modules.navigation.title')}</h1>
      <p className="hint" style={{ margin: 0 }}>
        {t('navigation.intro')}
      </p>
      <NavigationNotice />
      {picker}
      <RiversCard place={place} />
      {sourceEnabled('senamhi-bo') && <BoliviaRiversCard place={place} />}
      <TidesCard place={place} />
      {sourceEnabled('open-meteo') && <WavesCard place={place} />}
      <ChileMarineCard place={place} />
      <UruguayMarineCard place={place} />
      <SourcesCard />
    </div>
  );
}
