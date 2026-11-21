import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Camera, ChevronLeft, ChevronRight, ImagePlus, Trash2 } from 'lucide-react';
import { useCapabilities } from '@/core/capabilities/capabilities';
import { compressImage, type CompressedImage } from '@/core/images/compress';
import { newEntity } from '@/core/model/entity';
import type { Attachment, DocumentCategory, PersonalDocument } from '@/core/model/types';
import { useOwnerOptions } from './owners';
import { Dialog } from '@/ui/Dialog';
import { useBlobUrl } from '@/ui/useBlobUrl';
import { DOCUMENT_LEAD_DAYS } from './expiry';
import { documentPages, useDocuments } from './store';
import { confirmAction } from '@/ui/confirm';

function emptyDocument(category: DocumentCategory, profileId: string | null): PersonalDocument {
  return newEntity<PersonalDocument>({ title: '', notes: '', tags: [], expiryDate: null, category, profileId });
}

/** "dni, Familia , ,viaje" → ["dni", "Familia", "viaje"] */
export function parseTags(text: string): string[] {
  return [...new Set(text.split(',').map((s) => s.trim()).filter(Boolean))];
}

export function DocumentEditPage() {
  const { id } = useParams();
  const stored = useDocuments((s) => (id ? s.documents.get(id) : undefined));
  const loaded = useDocuments((s) => s.loaded);
  const { t } = useTranslation();

  if (!loaded) return null;
  if (id !== 'new' && !stored) {
    return (
      <p className="empty">
        {t('documents.notFound')} <Link to="/documents">{t('common.back')}</Link>
      </p>
    );
  }
  return <DocumentForm key={stored?.id ?? 'new'} stored={stored} />;
}

function DocumentForm({ stored }: { stored: PersonalDocument | undefined }) {
  const [params] = useSearchParams();
  // Desde una ficha médica: nuevo documento médico de esa persona, y "volver" lleva a la ficha.
  const fromProfile = params.get('profile');
  const [initial] = useState(
    () => stored ?? emptyDocument(params.get('category') === 'medical' ? 'medical' : 'general', fromProfile),
  );
  const isNew = !stored;
  const { t } = useTranslation();
  const navigate = useNavigate();
  const owners = useOwnerOptions();
  const backTo = fromProfile ? `/first-aid/medical/${fromProfile}` : '/documents';
  const { saveDocument, deleteDocument } = useDocuments();
  const [draft, setDraft] = useState(initial);
  const [tags, setTags] = useState(initial.tags.join(', '));
  const [saved, setSaved] = useState(false);

  const set = (changes: Partial<PersonalDocument>) => {
    setDraft((d) => ({ ...d, ...changes }));
    setSaved(false);
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await saveDocument({ ...draft, title: draft.title.trim(), tags: parseTags(tags) });
    if (isNew) navigate(`/documents/${draft.id}${fromProfile ? `?profile=${fromProfile}` : ''}`, { replace: true });
    else setSaved(true);
  }

  async function handleDelete() {
    if (!stored || !(await confirmAction(t('documents.confirmDelete', { name: stored.title })))) return;
    await deleteDocument(stored.id);
    navigate(backTo, { replace: true });
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="page-title" style={{ flex: 1 }}>{stored ? stored.title : t('documents.new')}</h1>
      </div>

      {/* Lo que se consulta (las fotos del documento) va arriba; los datos, debajo. Con el documento recién creado no hay fotos aún: va el formulario solo. */}
      {stored && <PagesSection document={stored} />}

      <form className="card stack" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="title">{t('documents.titleLabel')}</label>
          <input id="title" className="input" required value={draft.title} onChange={(e) => set({ title: e.target.value })} autoFocus={isNew} placeholder={t('documents.titlePlaceholder')} />
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="category">{t('documents.category')}</label>
            <select id="category" className="select" value={draft.category ?? 'general'} onChange={(e) => set({ category: e.target.value as DocumentCategory })}>
              <option value="general">{t('documents.categories.general')}</option>
              <option value="medical">{t('documents.categories.medical')}</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="owner">{t('documents.owner')}</label>
            <select id="owner" className="select" value={draft.profileId ?? ''} onChange={(e) => set({ profileId: e.target.value || null })}>
              <option value="">{t('documents.ownerGeneral')}</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="expiry">{t('documents.expiry')}</label>
          <input id="expiry" className="input" type="date" value={draft.expiryDate ?? ''} onChange={(e) => set({ expiryDate: e.target.value || null })} />
          <p className="hint">{t('documents.expiryHint', { days: DOCUMENT_LEAD_DAYS })}</p>
        </div>
        <div className="field">
          <label htmlFor="tags">{t('documents.tags')}</label>
          <input id="tags" className="input" value={tags} onChange={(e) => { setTags(e.target.value); setSaved(false); }} placeholder={t('documents.tagsPlaceholder')} />
        </div>
        <div className="field">
          <label htmlFor="notes">{t('documents.notes')}</label>
          <textarea id="notes" className="input textarea" value={draft.notes} onChange={(e) => set({ notes: e.target.value })} />
        </div>
        {saved && <p className="success" role="status">{t('common.saved')}</p>}
        <div className="row-end">
          {!isNew && (
            <button className="btn btn-danger-outline" type="button" onClick={handleDelete}>
              <Trash2 size={18} /> {t('common.delete')}
            </button>
          )}
          <button className="btn btn-primary" type="submit">
            {t('common.save')}
          </button>
        </div>
      </form>

      {!stored && <p className="hint">{t('documents.saveFirst')}</p>}
    </div>
  );
}

function PagesSection({ document }: { document: PersonalDocument }) {
  const { t } = useTranslation();
  const allPages = useDocuments((s) => s.pages);
  const addPages = useDocuments((s) => s.addPages);
  const hasCamera = useCapabilities((s) => s.caps?.camera ?? false);
  const pages = documentPages(allPages, document.id);
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);

  async function handleFiles(files: File[]) {
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    const images: CompressedImage[] = [];
    let failed = 0;
    for (const file of files) {
      try {
        images.push(await compressImage(file));
      } catch {
        failed++;
      }
    }
    await addPages(document.id, images);
    if (failed) setError(t('documents.someFailed', { count: failed }));
    setBusy(false);
  }

  const inputProps = {
    type: 'file',
    accept: 'image/*',
    hidden: true,
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      void handleFiles([...(e.target.files ?? [])]);
      e.target.value = '';
    },
  } as const;

  return (
    <section className="card stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <h2 className="section-title" style={{ margin: 0, flex: 1 }}>{t('documents.photos')}</h2>
      </div>
      {pages.length === 0 ? (
        <p className="hint">{busy ? t('photo.processing') : t('documents.noPhotos')}</p>
      ) : (
        <ul className="doc-grid">
          {pages.map((page, index) => (
            <li key={page.id}>
              <PageThumb page={page} label={t('documents.photoN', { n: index + 1 })} n={index + 1} onOpen={() => setViewing(index)} />
            </li>
          ))}
        </ul>
      )}
      {busy && pages.length > 0 && <p className="hint">{t('photo.processing')}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row-end">
        {hasCamera && (
          <button className="btn" type="button" onClick={() => cameraInput.current?.click()} disabled={busy}>
            <Camera size={18} /> {t('photo.take')}
          </button>
        )}
        <button className="btn" type="button" onClick={() => fileInput.current?.click()} disabled={busy}>
          <ImagePlus size={18} /> {t('documents.addPhotos')}
        </button>
      </div>
      <input ref={cameraInput} capture="environment" {...inputProps} />
      <input ref={fileInput} multiple data-testid="doc-files" {...inputProps} />
      {viewing !== null && pages[viewing] && (
        <PageViewer pages={pages} index={viewing} title={document.title} onIndex={setViewing} onClose={() => setViewing(null)} />
      )}
    </section>
  );
}

function PageThumb({ page, label, n, onOpen }: { page: Attachment; label: string; n: number; onOpen: () => void }) {
  const url = useBlobUrl(page.id, page.mime);
  return (
    <button className="doc-tile" type="button" onClick={onOpen} aria-label={label}>
      {url && <img src={url} alt="" />}
      {/* Número visible para ubicarse al reordenar; el nombre accesible sigue siendo el aria-label. */}
      <span className="doc-tile-n" aria-hidden>{n}</span>
    </button>
  );
}

function PageViewer({
  pages,
  index,
  title,
  onIndex,
  onClose,
}: {
  pages: Attachment[];
  index: number;
  title: string;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { movePage, removePage } = useDocuments();
  const page = pages[index]!;
  const url = useBlobUrl(page.id, page.mime);
  const last = pages.length - 1;

  async function handleRemove() {
    if (!(await confirmAction(t('documents.confirmRemovePhoto')))) return;
    await removePage(page.id);
    if (pages.length === 1) onClose();
    else onIndex(Math.min(index, last - 1));
  }

  async function handleMove(delta: -1 | 1) {
    await movePage(page.id, delta);
    onIndex(index + delta);
  }

  return (
    <Dialog
      title={`${title} · ${index + 1}/${pages.length}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-danger-outline" type="button" onClick={handleRemove}>
            <Trash2 size={18} /> {t('photo.remove')}
          </button>
          <button className="btn" type="button" onClick={() => void handleMove(-1)} disabled={index === 0} aria-label={t('documents.moveBefore')} title={t('documents.moveBefore')}>
            <ArrowLeft size={18} aria-hidden /> {t('documents.moveBefore')}
          </button>
          <button className="btn" type="button" onClick={() => void handleMove(1)} disabled={index === last} aria-label={t('documents.moveAfter')} title={t('documents.moveAfter')}>
            {t('documents.moveAfter')} <ArrowRight size={18} aria-hidden />
          </button>
        </>
      }
    >
      <div className="doc-viewer">
        {url && (
          <a href={url} target="_blank" rel="noreferrer" title={t('documents.openFull')}>
            <img src={url} alt={t('documents.photoN', { n: index + 1 })} width={page.width} height={page.height} />
          </a>
        )}
      </div>
      <div className="doc-nav">
        <button className="btn" type="button" onClick={() => onIndex(index - 1)} disabled={index === 0} aria-label={t('documents.previous')}>
          <ChevronLeft size={20} aria-hidden /> {t('documents.previous')}
        </button>
        <button className="btn" type="button" onClick={() => onIndex(index + 1)} disabled={index === last} aria-label={t('documents.next')}>
          {t('documents.next')} <ChevronRight size={20} aria-hidden />
        </button>
      </div>
    </Dialog>
  );
}
