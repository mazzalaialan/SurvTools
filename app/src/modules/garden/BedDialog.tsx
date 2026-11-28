import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { GardenBed } from '@/core/model/types';
import { useWaypoints } from '@/modules/waypoints/store';
import { WaypointField } from '@/modules/waypoints/WaypointField';
import { LocationSelect } from '@/modules/inventory/components/LocationSelect';
import { placeWaypointOf } from '@/modules/inventory/domain/locations';
import { useInventory } from '@/modules/inventory/store';
import { Dialog } from '@/ui/Dialog';
import { numToInput, parseNum } from '@/ui/numbers';
import { Segmented } from '@/ui/Segmented';
import { gridSize } from './logic';
import { useZonePlace } from './status';
import { SunSection } from './SunSection';
import { bedSun, roundHalf } from './sun';

/** Alta y edición de un cantero o maceta, con su waypoint (de ahí salen la helada y la lluvia). */
export function BedDialog({ bed, onClose, onSave, onDelete }: { bed: GardenBed; onClose: () => void; onSave: (b: GardenBed) => Promise<void>; onDelete?: () => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(bed);
  const [width, setWidth] = useState(numToInput(bed.widthCm));
  const [length, setLength] = useState(numToInput(bed.lengthCm));
  const [sun, setSun] = useState(numToInput(bed.sunHours));
  const waypoints = useWaypoints((s) => s.waypoints);
  const zonePlace = useZonePlace(false);
  const locations = useInventory((s) => s.locations);
  const placeId = placeWaypointOf(draft, locations);
  const wp = placeId ? waypoints.get(placeId) : undefined;
  const sunPlace = wp ? { lat: wp.lat, lon: wp.lon, alt: wp.alt } : zonePlace ? { lat: zonePlace.lat, lon: zonePlace.lon } : null;
  const calculated = draft.sunMode === 'calculated';
  const w = parseNum(width);
  const l = parseNum(length);
  const h = parseNum(sun);
  const valid = draft.name.trim() !== '' && w !== null && w >= 10 && w <= 3000 && l !== null && l >= 10 && l <= 10000 && (calculated || (h !== null && h >= 0 && h <= 16));
  const size = valid ? gridSize({ widthCm: w!, lengthCm: l! }) : null;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    // Con el cálculo, las horas son las del equinoccio (lo que se usa para recomendar cultivos).
    const sunHours = calculated && sunPlace ? roundHalf(bedSun({ ...draft, widthCm: w!, lengthCm: l! }, sunPlace).equinox.hours) : (h ?? draft.sunHours);
    void onSave({ ...draft, name: draft.name.trim(), widthCm: w!, lengthCm: l!, sunHours });
  }

  return (
    <Dialog
      title={t(bed.createdAt === bed.updatedAt && !onDelete ? 'garden.newBed' : 'garden.editBed')}
      onClose={onClose}
      footer={
        <>
          {onDelete && (
            <button className="btn btn-danger-outline" type="button" onClick={onDelete}>
              {t('common.delete')}
            </button>
          )}
          <button className="btn btn-primary" type="submit" form="bed-form" disabled={!valid}>
            {t('common.save')}
          </button>
        </>
      }
    >
      <form id="bed-form" className="stack" onSubmit={submit}>
        <div className="field">
          <label htmlFor="bed-name">{t('garden.bedName')}</label>
          <input id="bed-name" className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={100} />
        </div>
        <Segmented
          label={t('garden.bedKind')}
          value={draft.kind}
          options={[
            { value: 'bed', label: t('garden.kindBed') },
            { value: 'pot', label: t('garden.kindPot') },
          ]}
          onChange={(kind) => setDraft({ ...draft, kind })}
        />
        <div className="grid-2">
          <div className="field">
            <label htmlFor="bed-width">{t('garden.widthCm')}</label>
            <input id="bed-width" className="input" inputMode="numeric" value={width} onChange={(e) => setWidth(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="bed-length">{t('garden.lengthCm')}</label>
            <input id="bed-length" className="input" inputMode="numeric" value={length} onChange={(e) => setLength(e.target.value)} />
          </div>
        </div>
        {size && <p className="hint" style={{ margin: 0 }}>{t('garden.gridHint', { cols: size.cols, rows: size.rows })}</p>}
        {size && (size.cols * 30 !== w || size.rows * 30 !== l) && (
          <p className="hint" style={{ margin: 0 }} data-testid="grid-rounded">
            {t('garden.gridRounded', { w: size.cols * 30, l: size.rows * 30 })}
          </p>
        )}
        {/* Primero la ubicación del Inventario; el waypoint propio es la alternativa cuando no hay ubicación. */}
        <LocationSelect id="bed-location" label={t('places.location')} value={draft.locationId} ownWaypoint={null} onChange={(locationId) => setDraft((d) => ({ ...d, locationId, waypointId: locationId ? null : d.waypointId }))} />
        {!draft.locationId && (
          <div className="place-alt">
        <WaypointField
          id="bed-place"
          label={t('places.orWaypoint')}
          value={draft.waypointId}
          onChange={(waypointId) => setDraft((d) => ({ ...d, waypointId }))}
          newName={draft.name}
          noneLabel={t('garden.noPlace')}
          hint={draft.greenhouse ? t('garden.placeHintGreenhouse') : t('garden.placeHint')}
        />
          </div>
        )}
        <Segmented
          label={t('garden.sun.mode')}
          value={calculated ? 'calculated' : 'manual'}
          options={[
            { value: 'manual', label: t('garden.sun.modeManual') },
            { value: 'calculated', label: t('garden.sun.modeCalculated') },
          ]}
          onChange={(sunMode) => setDraft((d) => ({ ...d, sunMode }))}
        />
        {calculated ? (
          <SunSection draft={{ ...draft, widthCm: w ?? draft.widthCm, lengthCm: l ?? draft.lengthCm }} setDraft={setDraft} place={sunPlace} />
        ) : (
          <div className="field">
            <label htmlFor="bed-sun">{t('garden.sunHours')}</label>
            <input id="bed-sun" className="input" inputMode="decimal" value={sun} onChange={(e) => setSun(e.target.value)} />
            <p className="hint">{t('garden.sunHint')}</p>
          </div>
        )}
        <Segmented
          label={t('garden.soil.label')}
          value={draft.soil ?? 'loam'}
          options={(['sandy', 'loam', 'clay'] as const).map((k) => ({ value: k, label: t(`garden.soil.${k}`) }))}
          onChange={(soil) => setDraft({ ...draft, soil })}
        />
        <p className="hint" style={{ margin: 0 }}>{t('garden.soil.hint')}</p>
        <label className="check">
          <input type="checkbox" checked={draft.greenhouse} onChange={(e) => setDraft({ ...draft, greenhouse: e.target.checked })} data-testid="bed-greenhouse" />
          {t('garden.inGreenhouse')}
        </label>
        <p className="hint" style={{ margin: 0 }}>{t('garden.greenhouseHint')}</p>
        <div className="field">
          <label htmlFor="bed-notes">{t('garden.notes')}</label>
          <textarea id="bed-notes" className="textarea" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} rows={2} />
        </div>
      </form>
    </Dialog>
  );
}
