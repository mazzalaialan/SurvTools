import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { create } from 'zustand';
import type { VehicleKind, WorkoutKind } from '@/core/model/types';
import { useSettings } from '@/core/settings/settings';
import { ACTIVITIES, GROUPS, kindsOf } from '@/modules/training/activities';
import { Dialog } from '@/ui/Dialog';
import { VEHICLES, isVehicle } from './drive';
import { useRecorder } from './recorder';

/** Lo que se elige antes de grabar: '' (solo el recorrido), una actividad de Entrenamiento o `v:<vehículo>` (modo Conducir). */
export type RecordChoice = '' | WorkoutKind | `v:${VehicleKind}`;

/** Abre «¿Qué vas a grabar?» desde cualquier botón de grabar (Tracks, mapa, seguir un track). */
export const useStartDialog = create<{ open: boolean; set: (open: boolean) => void }>((set) => ({ open: false, set: (open) => set({ open }) }));

const GPS_GROUPS = GROUPS.filter((g) => g !== 'indoor');

function validChoice(v: string): RecordChoice {
  if (v.startsWith('v:') && isVehicle(v.slice(2))) return v as RecordChoice;
  return v in ACTIVITIES && ACTIVITIES[v as WorkoutKind].gps ? (v as RecordChoice) : '';
}

/**
 * Antes de empezar a grabar se pregunta qué actividad es (a pie, remo, ciclismo o un vehículo) para que
 * la pantalla en vivo y los cálculos sean los que corresponden desde el primer metro. «Solo el recorrido»
 * conserva lo de siempre: grabar sin actividad y elegirla, si se quiere, al terminar. Se recuerda la última elección.
 */
export function StartRecordingDialog() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const open = useStartDialog((s) => s.open);
  const setOpen = useStartDialog((s) => s.set);
  const status = useRecorder((s) => s.status);
  const start = useRecorder((s) => s.start);
  const last = useSettings((s) => s.settings.recordChoice);
  const update = useSettings((s) => s.update);
  const [choice, setChoice] = useState<RecordChoice>(() => validChoice(last));
  const [pack, setPack] = useState('');
  if (!open || status !== 'idle') return null;
  const vehicle = choice.startsWith('v:') ? (choice.slice(2) as VehicleKind) : null;
  const kind = choice && !vehicle ? (choice as WorkoutKind) : null;

  async function begin() {
    setOpen(false);
    void update({ recordChoice: choice });
    const now = new Date();
    const stamp = {
      date: now.toLocaleDateString(i18n.language),
      time: now.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' }),
    };
    const name = vehicle ? t('drive.defaultName', stamp) : kind ? t(`training.kind.${kind}`) : t('tracks.rec.defaultName', stamp);
    const packKg = Number(pack.replace(',', '.'));
    await start(name, { ...(kind ? { kind, packKg: kind === 'trek' && packKg > 0 ? packKg : null } : {}), ...(vehicle ? { vehicle } : {}) });
    // Desde la lista de Tracks se sigue en la pantalla en vivo; desde el mapa o un seguimiento se queda donde estaba.
    if (choice && pathname === '/orientation/tracks') navigate('/training/live');
  }

  return (
    <Dialog
      title={t('recStart.title')}
      onClose={() => setOpen(false)}
      footer={
        <>
          <button className="btn" type="button" onClick={() => setOpen(false)}>
            {t('common.cancel')}
          </button>
          <button className="btn btn-primary" type="submit" form="rec-start-form" data-testid="rec-begin">
            {t('recStart.begin')}
          </button>
        </>
      }
    >
      <form
        id="rec-start-form"
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void begin();
        }}
      >
        <div className="field">
          <label htmlFor="rec-choice">{t('recStart.label')}</label>
          <select id="rec-choice" className="select" value={choice} onChange={(e) => setChoice(validChoice(e.target.value))}>
            <option value="">{t('recStart.plain')}</option>
            {GPS_GROUPS.map((g) => (
              <optgroup key={g} label={t(`training.group.${g}`)}>
                {kindsOf(g).map((k) => (
                  <option key={k} value={k}>
                    {t(`training.kind.${k}`)}
                  </option>
                ))}
              </optgroup>
            ))}
            <optgroup label={t('recStart.vehicleGroup')}>
              {VEHICLES.map((v) => (
                <option key={v} value={`v:${v}`}>
                  {t(`drive.vehicle.${v}`)}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
        {kind === 'trek' && (
          <div className="field">
            <label htmlFor="rec-start-pack">{t('training.pack')}</label>
            <input id="rec-start-pack" className="input" inputMode="decimal" value={pack} onChange={(e) => setPack(e.target.value)} placeholder="0" />
          </div>
        )}
        <p className="hint" style={{ margin: 0 }} data-testid="rec-start-hint">
          {t(vehicle ? 'recStart.hintVehicle' : kind ? 'recStart.hintActivity' : 'recStart.hintPlain')}
        </p>
      </form>
    </Dialog>
  );
}
