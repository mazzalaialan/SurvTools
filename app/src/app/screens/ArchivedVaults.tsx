import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Archive, KeyRound, Trash2 } from 'lucide-react';
import { WrongSecretError } from '@/core/crypto/crypto';
import { deleteArchive, hasVaultToArchive, listArchives, restoreArchive, type ArchiveSecretKind, type VaultArchive } from '@/core/security/vaultArchive';
import { useVault } from '@/core/security/useVault';
import { confirmAction } from '@/ui/confirm';

/**
 * Bóvedas anteriores guardadas aparte (ver core/security/vaultArchive.ts): se recuperan con la contraseña o la clave de recuperación que tenían.
 * Se usa en la pantalla de «empezar de cero» (sin bóveda activa) y en Ajustes (con una activa, que se guarda aparte o se borra).
 */
export function ArchivedVaults({ hasCurrent, onChanged }: { hasCurrent: boolean; onChanged?: () => void }) {
  const { t, i18n } = useTranslation();
  const [list, setList] = useState<VaultArchive[]>(() => listArchives());
  const [picked, setPicked] = useState<string | null>(null);
  const [kind, setKind] = useState<ArchiveSecretKind>('password');
  const [secret, setSecret] = useState('');
  const [keepCurrent, setKeepCurrent] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    setList(listArchives());
    onChanged?.();
  };

  async function recover(e: FormEvent) {
    e.preventDefault();
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      await restoreArchive(picked, secret, kind, keepCurrent ? 'archive' : 'erase');
      // Con la clave de recuperación hay que elegir una contraseña nueva a continuación (como al desbloquear con ella).
      if (kind === 'recovery') useVault.setState({ mustChangePassword: true });
      await useVault.getState().refresh();
      setSecret('');
      setPicked(null);
      refresh();
    } catch (err) {
      if (!(err instanceof WrongSecretError)) {
        setError(t('archived.failed'));
      } else {
        setError(t(kind === 'password' ? 'unlock.wrong' : 'unlock.wrongRecovery'));
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(a: VaultArchive) {
    if (!(await confirmAction(t('archived.confirmDelete', { date: new Date(a.createdAt).toLocaleDateString(i18n.language) })))) return;
    await deleteArchive(a.id);
    if (picked === a.id) setPicked(null);
    refresh();
  }

  if (list.length === 0) return null;
  return (
    <section className="stack" data-testid="archived-vaults" aria-labelledby="archived-title">
      <h3 id="archived-title" className="section-title" style={{ margin: 0, fontSize: '1rem' }}>
        <Archive size={16} aria-hidden /> {t('archived.title')}
      </h3>
      <p className="hint" style={{ margin: 0 }}>{t('archived.hint')}</p>
      <ul className="list">
        {list.map((a) => (
          <li key={a.id} className="list-row" data-testid={`archived-${a.id}`}>
            <span className="list-main">
              <span className="list-title">{t('archived.item', { date: new Date(a.createdAt).toLocaleDateString(i18n.language) })}</span>
              <span className="list-sub">{t('archived.rows', { count: a.rows })}</span>
            </span>
            <button className="btn" type="button" onClick={() => { setPicked(a.id); setError(null); setSecret(''); }} aria-expanded={picked === a.id} data-testid={`archived-open-${a.id}`}>
              <KeyRound size={16} aria-hidden /> {t('archived.recover')}
            </button>
            <button className="icon-btn" type="button" onClick={() => void remove(a)} aria-label={t('archived.delete')}>
              <Trash2 size={18} />
            </button>
          </li>
        ))}
      </ul>
      {picked && (
        <form className="stack" onSubmit={recover} data-testid="archived-form">
          <div className="chips" role="group" aria-label={t('archived.kind')}>
            <button type="button" className="chip" aria-pressed={kind === 'password'} onClick={() => setKind('password')}>
              {t('unlock.password')}
            </button>
            <button type="button" className="chip" aria-pressed={kind === 'recovery'} onClick={() => setKind('recovery')}>
              {t('unlock.recoveryKey')}
            </button>
          </div>
          <div className="field">
            <label htmlFor="archived-secret">{t(kind === 'password' ? 'archived.passwordOf' : 'archived.recoveryOf')}</label>
            <input
              id="archived-secret"
              className="input"
              type={kind === 'password' ? 'password' : 'text'}
              autoComplete="off"
              autoCapitalize={kind === 'password' ? undefined : 'characters'}
              spellCheck={false}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              autoFocus
            />
          </div>
          {hasCurrent && (
            <label className="check">
              <input type="checkbox" checked={keepCurrent} onChange={(e) => setKeepCurrent(e.target.checked)} data-testid="archived-keep-current" />
              {t('archived.keepCurrent')}
            </label>
          )}
          {error && <p className="error" role="alert" data-testid="archived-error">{error}</p>}
          <div className="row-end">
            <button className="btn" type="button" onClick={() => setPicked(null)}>
              {t('common.cancel')}
            </button>
            <button className="btn btn-primary" type="submit" disabled={busy || !secret} data-testid="archived-submit">
              {busy ? t('unlock.unlocking') : t('archived.recoverSubmit')}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

/** ¿Hay una bóveda guardada o activa que valga la pena mostrar? (para decidir si se ofrece el enlace). */
export const hasArchivedVaults = (): boolean => listArchives().length > 0;
export { hasVaultToArchive };
