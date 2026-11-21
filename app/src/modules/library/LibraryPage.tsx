import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { BookOpen, CircleCheck, LockOpen, Download, Lock, RefreshCw, Search, Trash2, Unlock, X } from 'lucide-react';
import { useSettings } from '@/core/settings/settings';
import { Dialog } from '@/ui/Dialog';
import type { LibraryBook } from './books';
import { useLibrary } from './store';
import { confirmAction } from '@/ui/confirm';
import { Notice } from '@/ui/Notice';

const mb = (bytes: number, lang: string) => new Intl.NumberFormat(lang, { maximumFractionDigits: bytes < 10 * 2 ** 20 ? 1 : 0 }).format(bytes / 2 ** 20);

type Filter = 'all' | 'public' | 'private' | 'installed';

/** Pide la clave VikArg para los libros con derechos. */
function KeyDialog({ onClose, onOk }: { onClose: () => void; onOk: () => void }) {
  const { t } = useTranslation();
  const unlockPrivate = useLibrary((s) => s.unlockPrivate);
  const [pass, setPass] = useState('');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(false);
    const ok = await unlockPrivate(pass, remember);
    setBusy(false);
    if (ok) onOk();
    else setError(true);
  }

  return (
    <Dialog
      title={t('library.keyTitle')}
      onClose={onClose}
      footer={
        <button className="btn btn-primary" type="submit" form="library-key" disabled={!pass || busy} data-testid="library-key-ok">
          <Unlock size={18} /> {busy ? t('library.keyChecking') : t('library.keyOk')}
        </button>
      }
    >
      <form id="library-key" className="stack" onSubmit={submit}>
        <Notice id="library.personalUse" variant="warning">{t('library.personalUse')}</Notice>
        <div className="field">
          <label htmlFor="library-pass">{t('library.key')}</label>
          <input id="library-pass" className="input" type="password" autoComplete="off" value={pass} onChange={(e) => setPass(e.target.value)} />
          {error && <p className="error">{t('library.keyBad')}</p>}
        </div>
        <label className="check">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          {t('library.keyRemember')}
        </label>
      </form>
    </Dialog>
  );
}

/** Licencia del libro: solo un ícono (no le come lugar al título); al tocarlo, qué significa. */
function LicenseBadge({ book, canPrivate }: { book: LibraryBook; canPrivate: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const free = book.license === 'public';
  const label = t(free ? 'library.free' : 'library.rights');
  return (
    <>
      <button
        type="button"
        className={`license-icon ${free ? 'is-free' : 'is-rights'}`}
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
        data-testid="license-icon"
      >
        {free ? <LockOpen size={16} aria-hidden /> : <Lock size={16} aria-hidden />}
      </button>
      {open && (
        <Dialog title={label} onClose={() => setOpen(false)}>
          <p style={{ margin: 0 }}>{t(free ? 'library.freeInfo' : 'library.rightsInfo')}</p>
          {free && book.licenseReason && <p className="hint">{book.licenseReason}</p>}
          {!free && !canPrivate && <p className="hint">{t('library.rightsUnavailable')}</p>}
        </Dialog>
      )}
    </>
  );
}

/** Biblioteca: libros del servidor propio por categoría; libres (verde) y con derechos (con la clave VikArg). */
export function LibraryPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const serverUrl = useSettings((s) => s.settings.serverUrl);
  const { catalog, offline, loading, installed, selected, key, progress, failures, stopped, refresh, toggle, setSelected, download, cancelDownload, remove, removeMany, forgetKey, passphrase } = useLibrary(
    useShallow((s) => ({
      catalog: s.catalog,
      offline: s.offline,
      loading: s.loading,
      installed: s.installed,
      selected: s.selected,
      key: s.key,
      progress: s.progress,
      failures: s.failures,
      stopped: s.stopped,
      refresh: s.refresh,
      toggle: s.toggle,
      setSelected: s.setSelected,
      download: s.download,
      cancelDownload: s.cancelDownload,
      remove: s.remove,
      removeMany: s.removeMany,
      forgetKey: s.forgetKey,
      passphrase: s.passphrase,
    })),
  );
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [askKey, setAskKey] = useState(false);
  // Modo borrar: los casilleros eligen libros bajados para sacarlos del dispositivo.
  const [delMode, setDelMode] = useState(false);
  const [toDelete, setToDelete] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    void refresh(serverUrl);
  }, [serverUrl]);

  const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const visible = useMemo(() => {
    const q = norm(query.trim());
    return (catalog?.categories ?? [])
      .map((c) => ({
        ...c,
        books: c.books.filter((b) => {
          if (filter === 'public' && b.license !== 'public') return false;
          if (filter === 'private' && b.license === 'public') return false;
          if (filter === 'installed' && !installed.has(b.id)) return false;
          return !q || norm(`${b.title} ${b.author} ${b.section ?? ''}`).includes(q);
        }),
      }))
      .filter((c) => c.books.length > 0);
  }, [catalog, query, filter, installed]);

  const all = useMemo(() => new Map((catalog?.categories ?? []).flatMap((c) => c.books.map((b) => [b.id, b]))), [catalog]);
  const chosen = [...selected].map((id) => all.get(id)).filter((b): b is LibraryBook => !!b);
  const chosenBytes = chosen.reduce((s, b) => s + b.bytes, 0);
  const needsKey = chosen.some((b) => b.license !== 'public') && !key;
  const canPrivate = !!catalog?.privateAvailable;
  const upToDate = (b: LibraryBook) => installed.get(b.id)?.sha256 === b.sha256;
  const selectable = (b: LibraryBook) => !upToDate(b) && (b.license === 'public' || canPrivate);
  const pickable = (b: LibraryBook) => (delMode ? installed.has(b.id) : selectable(b));
  const visibleIds = visible.flatMap((c) => c.books.filter((b) => pickable(b)).map((b) => b.id));
  const visibleSet = new Set(visibleIds);
  const visibleBytes = visible.flatMap((c) => c.books).filter((b) => visibleSet.has(b.id)).reduce((s, b) => s + b.bytes, 0);

  const delBooks = [...toDelete].map((id) => installed.get(id)).filter((b): b is NonNullable<typeof b> => !!b);
  const delBytes = delBooks.reduce((s, b) => s + b.bytes, 0);
  const pick = (ids: string[], on: boolean) => {
    if (!delMode) return setSelected(ids, on);
    const next = new Set(toDelete);
    for (const id of ids) (on ? next.add(id) : next.delete(id));
    setToDelete(next);
  };
  const isPicked = (id: string) => (delMode ? toDelete.has(id) : selected.has(id));
  function leaveDelMode() {
    setDelMode(false);
    setToDelete(new Set());
  }
  async function deletePicked() {
    if (!(await confirmAction(t('library.confirmRemoveMany', { count: delBooks.length, mb: mb(delBytes, lang) })))) return;
    setDeleting(true);
    try {
      await removeMany(delBooks.map((b) => b.id));
    } finally {
      setDeleting(false);
      leaveDelMode();
    }
  }

  function start() {
    if (needsKey) setAskKey(true);
    else void download(serverUrl);
  }

  if (!serverUrl) {
    return (
      <div className="stack">
        <h1 className="page-title">{t('modules.libraryBooks.title')}</h1>
        <p className="hint">{t('library.noServer')}</p>
      </div>
    );
  }

  return (
    <div className="stack library">
      <div className="page-head">
        <h1 className="page-title" style={{ flex: 1, margin: 0 }}>{t('modules.libraryBooks.title')}</h1>
        {installed.size > 0 && !progress && (
          <button
            className="btn"
            type="button"
            aria-pressed={delMode}
            onClick={() => (delMode ? leaveDelMode() : (setSelected([...selected], false), setDelMode(true)))}
            data-testid="library-delete-mode"
          >
            <Trash2 size={18} /> {t(delMode ? 'library.deleteModeOff' : 'library.deleteMode')}
          </button>
        )}
        <button className="icon-btn" type="button" onClick={() => void refresh(serverUrl)} disabled={loading} aria-label={t('library.refresh')}>
          <RefreshCw size={20} />
        </button>
      </div>
      {offline && catalog && <p className="hint" style={{ margin: 0 }}>{t('library.offline', { date: new Date(catalog.generatedAt).toLocaleDateString(lang) })}</p>}
      {!catalog && !loading && <p className="hint">{t('library.noLibrary')}</p>}
      {catalog && (
        <>
          <div className="hint library-legend">
            <p>
              <span className="license-icon is-free" aria-hidden>
                <LockOpen size={16} />
              </span>{' '}
              <strong>{t('library.free')}</strong>: {t('library.freeHint')}
            </p>
            <p>
              <span className="license-icon is-rights" aria-hidden>
                <Lock size={16} />
              </span>{' '}
              <strong>{t('library.rights')}</strong>:{' '}
              {canPrivate ? t('library.rightsHint') : t('library.rightsUnavailable')}
            </p>
          </div>
          {key && (
            <p className="hint library-key">
              <Unlock size={14} aria-hidden /> {t('library.keyActive')}{' '}
              {passphrase && (
                <button className="btn-link" type="button" onClick={() => void forgetKey()}>
                  {t('library.keyForget')}
                </button>
              )}
            </p>
          )}
          <div className="input-group">
            <Search size={18} aria-hidden style={{ alignSelf: 'center' }} />
            <input className="input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('library.search')} aria-label={t('library.search')} />
          </div>
          <div className="chips" role="group" aria-label={t('library.filter')}>
            {(['all', 'public', 'private', 'installed'] as const).map((f) => (
              <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {t(`library.filters.${f}`)}
              </button>
            ))}
          </div>
          {visibleIds.length > 0 && (
            <div className="row-between" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
              <button className="btn" type="button" onClick={() => pick(visibleIds, true)} data-testid="library-select-visible">
                {delMode
                  ? t('library.selectVisibleInstalled', { count: visibleIds.length })
                  : t('library.selectVisible', { count: visibleIds.length, mb: mb(visibleBytes, lang) })}
              </button>
              {(delMode ? toDelete.size : selected.size) > 0 && (
                <button className="btn-link" type="button" onClick={() => (delMode ? setToDelete(new Set()) : setSelected([...selected], false))}>
                  {t('library.clearSelection')}
                </button>
              )}
            </div>
          )}

          {visible.map((cat) => {
            const ids = cat.books.filter(pickable).map((b) => b.id);
            const allOn = ids.length > 0 && ids.every(isPicked);
            const some = ids.some(isPicked);
            const have = cat.books.filter((b) => installed.has(b.id)).length;
            return (
              <details key={cat.id} className="card library-cat" data-testid={`library-cat-${cat.id}`} open={visible.length === 1 || !!query}>
                <summary>
                  <span className="list-title">{cat.name}</span>
                  <span className="hint">{t('library.catCount', { count: cat.books.length, have })}</span>
                </summary>
                {ids.length > 0 && (
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={allOn}
                      ref={(el) => {
                        if (el) el.indeterminate = some && !allOn;
                      }}
                      onChange={() => pick(ids, !allOn)}
                      aria-label={t('library.selectCategory', { name: cat.name })}
                    />
                    {t('library.selectAll')}
                  </label>
                )}
                <ul className="list list-flat">
                  {cat.books.map((b) => {
                    const inst = installed.get(b.id);
                    const fail = failures.get(b.id);
                    return (
                      <li key={b.id} className={`list-row library-book ${b.license === 'public' ? 'is-free' : 'is-rights'}`} data-testid={`book-${b.id}`}>
                        <span className="library-pick">
                          <input
                            type="checkbox"
                            checked={isPicked(b.id)}
                            disabled={!pickable(b)}
                            onChange={() => (delMode ? pick([b.id], !toDelete.has(b.id)) : toggle(b.id))}
                            aria-label={t(delMode ? 'library.selectBookDelete' : 'library.selectBook', { title: b.title })}
                          />
                        </span>
                        <span className="list-main">
                          <span className="list-title">{b.title}</span>
                          <span className="list-sub">
                            {[b.author, b.section, `${mb(b.bytes, lang)} MB`].filter(Boolean).join(' · ')}
                            {inst && !upToDate(b) && ` · ${t('library.updateAvailable')}`}
                            {fail && <span className="error"> · {t(`library.errors.${fail}`)}</span>}
                          </span>
                        </span>
                        {/* Licencia y acciones juntas: en el celular, si no entran al lado del título, bajan a otra línea. */}
                        <span className="library-actions">
                          <LicenseBadge book={b} canPrivate={canPrivate} />
                          {inst && (
                            <>
                              <Link className="icon-btn" to={`/library/read/${b.id}`} aria-label={t('library.read', { title: b.title })}>
                                <BookOpen size={20} />
                              </Link>
                              <button
                                className="icon-btn"
                                type="button"
                                onClick={async () => (await confirmAction(t('library.confirmRemove', { title: b.title }))) && void remove(b.id)}
                                aria-label={t('library.remove', { title: b.title })}
                              >
                                <Trash2 size={18} />
                              </button>
                            </>
                          )}
                          {inst && upToDate(b) && <CircleCheck size={20} className="library-ok" aria-label={t('library.installed')} />}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </details>
            );
          })}
        </>
      )}

      {delMode && (
        <div className="library-bar" data-testid="library-delete-bar">
          <span className="library-bar-text">{t('library.toDelete', { count: delBooks.length, mb: mb(delBytes, lang) })}</span>
          <button className="btn" type="button" onClick={leaveDelMode}>
            {t('common.cancel')}
          </button>
          <button className="btn btn-danger" type="button" disabled={!delBooks.length || deleting} onClick={() => void deletePicked()} data-testid="library-delete">
            <Trash2 size={18} /> {t('library.deleteSelected')}
          </button>
        </div>
      )}
      {!delMode && (chosen.length > 0 || progress) && (
        <div className="library-bar" data-testid="library-bar">
          {progress ? (
            <div style={{ flex: 1 }} role="status" aria-live="polite">
              <span className="hint">
                {t('library.downloading', { n: progress.n, total: progress.total, title: progress.title })} · {mb(progress.bytes, lang)} / {mb(progress.bookBytes, lang)} MB
              </span>
              <span className="progress">
                <span className="progress-bar" style={{ width: `${(100 * progress.bytes) / Math.max(1, progress.bookBytes)}%` }} />
              </span>
            </div>
          ) : null}
          {progress ? (
            <button className="btn" type="button" onClick={() => cancelDownload()} data-testid="library-cancel">
              <X size={18} /> {t('library.cancelDownload')}
            </button>
          ) : (
            <>
              {stopped && (
                <span className="hint" role="status" data-testid="library-stopped" style={{ flexBasis: '100%' }}>
                  {t(`library.stopped.${stopped}`, { count: chosen.length })}
                </span>
              )}
              <span className="library-bar-text">{t('library.selected', { count: chosen.length, mb: mb(chosenBytes, lang) })}</span>
              <button className="btn" type="button" onClick={() => setSelected([...selected], false)}>
                {t('common.cancel')}
              </button>
              <button className="btn btn-primary" type="button" onClick={start} data-testid="library-download">
                {needsKey ? <Lock size={18} /> : <Download size={18} />} {t('library.download')}
              </button>
            </>
          )}
        </div>
      )}
      {askKey && (
        <KeyDialog
          onClose={() => setAskKey(false)}
          onOk={() => {
            setAskKey(false);
            void download(serverUrl);
          }}
        />
      )}
    </div>
  );
}
