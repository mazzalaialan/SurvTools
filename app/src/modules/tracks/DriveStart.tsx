import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Car } from 'lucide-react';
import type { VehicleKind } from '@/core/model/types';
import { Dialog } from '@/ui/Dialog';
import { VEHICLES } from './drive';
import { useRecorder } from './recorder';

/** «Grabar en vehículo»: se elige qué vehículo es y se empieza; se sigue en la pantalla en vivo de conducción. */
export function DriveStartButton() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const status = useRecorder((s) => s.status);
  const start = useRecorder((s) => s.start);
  const [open, setOpen] = useState(false);
  const [vehicle, setVehicle] = useState<VehicleKind>('car');
  if (status !== 'idle') return null;
  async function begin() {
    setOpen(false);
    const now = new Date();
    await start(
      t('drive.defaultName', {
        date: now.toLocaleDateString(i18n.language),
        time: now.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' }),
      }),
      { vehicle },
    );
    navigate('/training/live');
  }
  return (
    <>
      <button className="btn" type="button" onClick={() => setOpen(true)} data-testid="drive-start">
        <Car size={16} /> {t('drive.start')}
      </button>
      {open && (
        <Dialog
          title={t('drive.startTitle')}
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn" type="button" onClick={() => setOpen(false)}>
                {t('common.cancel')}
              </button>
              <button className="btn btn-primary" type="submit" form="drive-start-form" data-testid="drive-begin">
                {t('drive.begin')}
              </button>
            </>
          }
        >
          <form
            id="drive-start-form"
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void begin();
            }}
          >
            <div className="field">
              <label htmlFor="drive-vehicle">{t('drive.vehicleLabel')}</label>
              <select id="drive-vehicle" className="select" value={vehicle} onChange={(e) => setVehicle(e.target.value as VehicleKind)}>
                {VEHICLES.map((v) => (
                  <option key={v} value={v}>
                    {t(`drive.vehicle.${v}`)}
                  </option>
                ))}
              </select>
            </div>
            <p className="hint" style={{ margin: 0 }}>{t('drive.startHint')}</p>
          </form>
        </Dialog>
      )}
    </>
  );
}
