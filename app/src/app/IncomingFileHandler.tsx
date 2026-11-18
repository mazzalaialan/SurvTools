import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useIncoming } from '@/core/incomingFile';
import { GpxError } from '@/modules/tracks/gpx';
import { trackFromBytes } from '@/modules/tracks/importTrack';
import { useTracks } from '@/modules/tracks/store';
import { KmlError } from '@/modules/waypoints/kml';

/**
 * Atiende lo que llega desde afuera con la bóveda abierta: un recorrido se importa y se abre; un backup lleva a la pantalla de restaurar (que
 * lo toma de `useIncoming`). Los archivos de recorrido no se piden confirmación: importar solo suma un recorrido, no reemplaza nada.
 */
export function IncomingFileHandler() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const file = useIncoming((s) => s.file);
  const saveTrack = useTracks((s) => s.saveTrack);

  useEffect(() => {
    if (!file) return;
    if (file.kind === 'backup') {
      navigate('/settings/backup');
      return;
    }
    useIncoming.getState().clear();
    void (async () => {
      try {
        const track = trackFromBytes(file.bytes, file.name);
        await saveTrack(track);
        navigate(`/orientation/tracks/${track.id}`);
      } catch (err) {
        if (!(err instanceof GpxError) && !(err instanceof KmlError)) throw err;
        window.alert(`${file.name}: ${t(`tracks.error.${err.code === 'empty' ? 'empty' : 'not-gpx'}`)}`);
      }
    })();
  }, [file, navigate, saveTrack, t]);

  return null;
}
