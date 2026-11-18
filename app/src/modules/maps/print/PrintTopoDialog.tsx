import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, ExternalLink, Printer, Share2 } from 'lucide-react';
import { Dialog } from '@/ui/Dialog';
import { deliverFile, openFile, saveFile } from '@/ui/files';
import { gridLabel, gridStepM, PAPERS, paperMm, scaleEquivalence, zoomForScale, type Orientation, type PaperId } from './geometry';
import { mapCoverage, sheetBounds, type Coverage } from './coverage';
import { DEFAULT_SCALE, planSheet, scaleChoices, type TopoSheetInput } from './plan';

const slug = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'mapa';
const fmtScale = (n: number) => n.toLocaleString('es-AR');

/**
 * Cuadro de opciones antes de generar el mapa topográfico: título, escala (las que no entran, en gris), hoja y marcas.
 * El dibujo y el PDF se cargan recién al tocar «Generar» (el código viaja en el paquete: anda sin conexión).
 */
export function PrintTopoDialog({ input, onClose }: { input: TopoSheetInput; onClose: () => void }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(input.title);
  const [paper, setPaper] = useState<PaperId>('a4');
  const [orientation, setOrientation] = useState<'auto' | Orientation>('auto');
  const [scale, setScale] = useState<number | null>(null);
  const [latLon, setLatLon] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ pdf: Uint8Array<ArrayBuffer>; name: string; pages: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const base = useMemo<TopoSheetInput>(() => ({ ...input, title: title.trim() || input.title, orientation, paper, latLonTicks: latLon }), [input, title, orientation, paper, latLon]);
  const choices = useMemo(() => scaleChoices(base), [base]);
  const extent = useMemo(() => planSheet(base).extentM, [base]);
  const defaultScale = choices.find((c) => c.fits && c.scale >= DEFAULT_SCALE)?.scale ?? null;
  // La escala elegida vale mientras entre; si al cambiar la hoja ya no entra, vuelve a la de por defecto.
  const chosen = scale !== null && choices.find((c) => c.scale === scale)?.fits ? scale : defaultScale;
  const anyFits = choices.some((c) => c.fits);

  // Cuánto del mapa y del relieve de la zona ya está en el dispositivo (sirve sin conexión).
  const [online, setOnline] = useState(() => navigator.onLine);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  useEffect(() => {
    if (chosen === null) {
      setCoverage(null);
      return;
    }
    let live = true;
    setCoverage(null);
    const plan = planSheet({ ...base, scale: chosen });
    void mapCoverage(sheetBounds(plan.center, chosen, plan.layout.map), zoomForScale(plan.center.lat, chosen))
      .then((c) => live && setCoverage(c))
      .catch(() => live && setCoverage(null));
    return () => {
      live = false;
    };
  }, [base, chosen]);
  const missing = coverage ? coverage.vector.total - coverage.vector.have + coverage.dem.total - coverage.dem.have : 0;
  const total = coverage ? coverage.vector.total + coverage.dem.total : 0;
  const coverageState = !coverage ? 'checking' : missing === 0 ? 'ok' : online ? 'partial-online' : 'partial-offline';

  async function generate() {
    if (chosen === null) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setNotice(null);
    try {
      const { makeTopoPdf } = await import('./compose');
      const { pdf, scale: used, pages } = await makeTopoPdf({ ...base, scale: chosen });
      setResult({ pdf: pdf as Uint8Array<ArrayBuffer>, name: `${slug(base.title)}-${PAPERS[paper].label}-1-${used}.pdf`, pages });
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      setError(t(code === 'NO_FIT' ? 'topoPrint.fitError' : code === 'MAP_TIMEOUT' ? 'topoPrint.mapTimeout' : 'topoPrint.failed'));
    } finally {
      setBusy(false);
    }
  }

  /** Abre el PDF en el visor del mismo celular (sin pasar por el menú de compartir). */
  async function openPdf() {
    if (!result) return;
    try {
      // Si el navegador bloquea la pestaña, se baja el archivo.
      if ((await openFile(result.pdf, result.name, 'application/pdf')) === 'blocked') setNotice(t('topoPrint.openBlocked'));
    } catch {
      // Sin visor de PDF en el teléfono: se ofrece compartirlo.
      setError(t('topoPrint.noViewer'));
    }
  }
  async function download() {
    if (!result) return;
    try {
      const { where } = await saveFile(result.pdf, result.name, 'application/pdf');
      if (where) setNotice(t('topoPrint.savedTo', { where }));
    } catch {
      setError(t('topoPrint.failed'));
    }
  }
  async function share() {
    if (!result) return;
    try {
      await deliverFile(result.pdf, result.name, 'application/pdf');
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) setError(t('topoPrint.failed'));
    }
  }

  // Con el PDF ya armado, el cuadro solo ofrece abrirlo, compartirlo, descargarlo o cerrar (para otra hoja se vuelve a abrir el cuadro).
  if (result) {
    return (
      <Dialog title={t('topoPrint.title')} onClose={onClose}>
        <div data-testid="topo-dialog" className="stack">
          <div className="stack" data-testid="topo-result">
            <p className="ok" role="status" data-testid="topo-done">{t('topoPrint.ready', { count: result.pages })}</p>
            <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
              <button className="btn btn-primary" type="button" onClick={() => void openPdf()} data-testid="topo-open"><ExternalLink size={18} aria-hidden /> {t('topoPrint.open')}</button>
              <button className="btn" type="button" onClick={() => void share()} data-testid="topo-share"><Share2 size={18} aria-hidden /> {t('topoPrint.share')}</button>
              <button className="btn" type="button" onClick={() => void download()} data-testid="topo-download"><Download size={18} aria-hidden /> {t('topoPrint.download')}</button>
            </div>
            {notice && <p className="hint" style={{ margin: 0 }}>{notice}</p>}
            {error && <p className="error" role="alert" data-testid="topo-error">{error}</p>}
          </div>
          <div className="row-end">
            <button className="btn" type="button" onClick={onClose} data-testid="topo-close">{t('common.close')}</button>
          </div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog title={t('topoPrint.title')} onClose={onClose}>
      <div data-testid="topo-dialog" className="stack">
        <p className="hint" style={{ margin: 0 }}>{t('topoPrint.intro')}</p>
        <div className="field">
          <label htmlFor="topo-title">{t('topoPrint.name')}</label>
          <input id="topo-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
        </div>

        <div className="field">
          <label id="topo-scale-label">{t('topoPrint.scale')}</label>
          <div className="chips" role="group" aria-labelledby="topo-scale-label" data-testid="topo-scales">
            {choices.map((c) => (
              <button
                key={c.scale}
                type="button"
                className="chip"
                aria-pressed={chosen === c.scale}
                disabled={!c.fits}
                title={c.fits ? scaleEquivalence(c.scale) : t('topoPrint.fitError')}
                data-testid={`topo-scale-${c.scale}`}
                onClick={() => setScale(c.scale)}
              >
                1:{fmtScale(c.scale)}
              </button>
            ))}
          </div>
          <p className="hint" style={{ margin: 0 }} data-testid="topo-route-size">
            {t('topoPrint.routeSize', { east: (extent.east / 1000).toFixed(1).replace('.', ','), north: (extent.north / 1000).toFixed(1).replace('.', ',') })}
          </p>
          {anyFits ? (
            <p className="hint" style={{ margin: 0 }}>{t('topoPrint.scaleHint')}</p>
          ) : (
            <p className="error" role="alert" data-testid="topo-nofit">{t('topoPrint.noFit')}</p>
          )}
          {chosen !== null && (
            <p className="hint" style={{ margin: 0 }} data-testid="topo-scale-info">
              {t('topoPrint.scaleInfo', { scale: fmtScale(chosen), equivalence: scaleEquivalence(chosen), grid: gridLabel(chosen), mm: Math.round(paperMm(gridStepM(chosen), chosen)) })}
            </p>
          )}
        </div>

        <div className="field">
          <label id="topo-paper-label">{t('topoPrint.paper')}</label>
          <div className="segmented" role="group" aria-labelledby="topo-paper-label">
            {(Object.keys(PAPERS) as PaperId[]).map((id) => (
              <button key={id} type="button" aria-pressed={paper === id} onClick={() => setPaper(id)} data-testid={`topo-paper-${id}`}>
                {PAPERS[id].label} ({PAPERS[id].w} × {PAPERS[id].h} mm)
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label id="topo-orient-label">{t('topoPrint.orientation')}</label>
          <div className="segmented" role="group" aria-labelledby="topo-orient-label">
            {(['auto', 'portrait', 'landscape'] as const).map((o) => (
              <button key={o} type="button" aria-pressed={orientation === o} onClick={() => setOrientation(o)} data-testid={`topo-orient-${o}`}>
                {t(`topoPrint.${o}`)}
              </button>
            ))}
          </div>
        </div>

        <label className="check">
          <input type="checkbox" checked={latLon} onChange={(e) => setLatLon(e.target.checked)} data-testid="topo-latlon" />
          {t('topoPrint.latLon')}
        </label>
        {chosen !== null && (
          <p
            className={coverageState === 'partial-offline' ? 'error' : 'hint'}
            style={{ margin: 0 }}
            role={coverageState === 'partial-offline' ? 'alert' : 'status'}
            data-testid="topo-coverage"
            data-state={coverageState}
          >
            {coverageState === 'checking'
              ? t('topoPrint.checking')
              : coverageState === 'ok'
                ? t('topoPrint.coverageOk')
                : t(coverageState === 'partial-online' ? 'topoPrint.coverageOnline' : 'topoPrint.coverageOffline', { missing, total })}
          </p>
        )}
        <p className="hint" style={{ margin: 0 }}>{t('topoPrint.notOfficial')}</p>
        {error && <p className="error" role="alert" data-testid="topo-error">{error}</p>}
        {busy && <p className="hint" role="status" data-testid="topo-busy">{t('topoPrint.generating')}</p>}
        <div className="row-end">
          <button className="btn" type="button" onClick={onClose}>{t('common.close')}</button>
          <button className="btn btn-primary" type="button" disabled={busy || chosen === null} onClick={() => void generate()} data-testid="topo-generate">
            <Printer size={18} aria-hidden /> {t('topoPrint.generate')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
