import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, ScanLine } from 'lucide-react';
import { useIncoming } from '@/core/incomingFile';
import { BackupError, readBackup, restoreBackup, BACKUP_EXTENSION, type ParsedBackup, type SecretKind } from '@/core/backup/backup';
import { TransferError, downloadTransfer, parseTransferLink } from '@/core/backup/transfer';
import { useCapabilities } from '@/core/capabilities/capabilities';
import { WrongSecretError } from '@/core/crypto/crypto';
import { setLanguage } from '@/core/i18n/i18n';
import { useSettings } from '@/core/settings/settings';
import { BarcodeScanner } from '@/ui/BarcodeScanner';
import { readFileBytes } from '@/ui/files';
import { Segmented } from '@/ui/Segmented';

type Source = 'file' | 'code';

interface Props {
  /** Hay datos en este dispositivo que se van a reemplazar. */
  replacesData: boolean;
  /** Servidor y código recibidos por link o QR. */
  initialTransfer?: { server: string; code: string } | null;
  onDone?: () => void;
}

export function RestoreForm({ replacesData, initialTransfer, onDone }: Props) {
  const { t, i18n } = useTranslation();
  const configuredServer = useSettings((s) => s.settings.serverUrl);
  const canScan = useCapabilities((s) => (s.caps?.barcode && s.caps.camera) ?? false);
  const [source, setSource] = useState<Source>(initialTransfer ? 'code' : 'file');
  const [server, setServer] = useState(initialTransfer?.server ?? configuredServer);
  const [code, setCode] = useState(initialTransfer?.code ?? '');
  const [scanning, setScanning] = useState(false);
  const [backup, setBackup] = useState<ParsedBackup | null>(null);
  const [kind, setKind] = useState<SecretKind>('password');
  const [secret, setSecret] = useState('');
  const [confirmed, setConfirmed] = useState(!replacesData);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load(bytes: Uint8Array) {
    try {
      setBackup(readBackup(bytes));
    } catch (err) {
      if (!(err instanceof BackupError)) throw err;
      setError(t(err.code === 'newer-version' ? 'backup.newerVersion' : 'backup.invalidFile'));
    }
  }

  // Un backup que llegó desde afuera («Abrir con VikArg» o «Compartir» en la app nativa): se carga solo, listo para pedir la clave.
  const incoming = useIncoming((s) => s.file);
  useEffect(() => {
    if (incoming?.kind !== 'backup') return;
    useIncoming.getState().clear();
    setSource('file');
    setError(null);
    load(incoming.bytes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming]);

  async function pickFile(file: File | undefined) {
    setError(null);
    setBackup(null);
    if (file) load(await readFileBytes(file));
  }

  async function fetchCode(srv = server, c = code) {
    setError(null);
    setBackup(null);
    setBusy(true);
    try {
      load(await downloadTransfer(srv, c));
    } catch (err) {
      if (!(err instanceof TransferError)) throw err;
      setError(t(`transfer.error.${err.code}`));
    } finally {
      setBusy(false);
    }
  }

  // Link o QR: se baja enseguida, el usuario solo tiene que poner la contraseña.
  useEffect(() => {
    if (initialTransfer) void fetchCode(initialTransfer.server, initialTransfer.code);
  }, [initialTransfer]);

  function handleScan(text: string) {
    setScanning(false);
    const link = parseTransferLink(text);
    if (!link) return setError(t('transfer.error.invalid-qr'));
    setServer(link.server);
    setCode(link.code);
    void fetchCode(link.server, link.code);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!backup) return;
    setBusy(true);
    setError(null);
    try {
      await restoreBackup(backup, secret, kind);
      await useSettings.getState().load();
      setLanguage(useSettings.getState().settings.language);
      onDone?.();
    } catch (err) {
      if (!(err instanceof WrongSecretError)) throw err;
      setError(t(kind === 'password' ? 'backup.wrongPassword' : 'unlock.wrongRecovery'));
    } finally {
      setBusy(false);
    }
  }

  const fmtDate = (iso: string) => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long', timeStyle: 'short' }).format(new Date(iso));

  return (
    <form className="stack" onSubmit={handleSubmit}>
      {!backup && (
        <>
          <Segmented
            label={t('transfer.source')}
            value={source}
            options={[
              { value: 'file', label: t('transfer.fromFile') },
              { value: 'code', label: t('transfer.fromCode') },
            ]}
            onChange={(s) => {
              setSource(s);
              setError(null);
            }}
          />

          {source === 'file' ? (
            <div className="field">
              <label htmlFor="backup-file">{t('backup.file')}</label>
              <input
                id="backup-file"
                className="input file-input"
                type="file"
                accept={`${BACKUP_EXTENSION},application/zip,application/octet-stream`}
                onChange={(e) => void pickFile(e.target.files?.[0])}
              />
            </div>
          ) : (
            <>
              <div className="field">
                <label htmlFor="transfer-server">{t('settings.serverUrl')}</label>
                <input id="transfer-server" className="input" type="url" inputMode="url" placeholder="https://" value={server} onChange={(e) => setServer(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="transfer-code">{t('transfer.code')}</label>
                <input
                  id="transfer-code"
                  className="input code-input"
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="XXXX-XXXX"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>
              <div className="row-end">
                {canScan && (
                  <button className="btn" type="button" onClick={() => setScanning(true)}>
                    <ScanLine size={18} /> {t('transfer.scanQr')}
                  </button>
                )}
                <button className="btn btn-primary" type="button" disabled={busy || !server.trim() || code.trim().length < 8} onClick={() => void fetchCode()}>
                  <Download size={18} /> {busy ? t('transfer.receiving') : t('transfer.receive')}
                </button>
              </div>
              {scanning && <BarcodeScanner onDetected={handleScan} onClose={() => setScanning(false)} />}
            </>
          )}
        </>
      )}

      {backup && (
        <>
          <p className="hint" data-testid="backup-summary">
            {[
              t('backup.summary', { date: fmtDate(backup.manifest.createdAt) }),
              // Todo lo que trae (las tablas vacías no se nombran).
              ...Object.entries(backup.manifest.counts)
                .filter(([, n]) => (n ?? 0) > 0)
                .map(([table, n]) => t('backup.count', { what: t(`backup.tables.${table}`), count: n })),
            ].join(' · ')}
          </p>
          <div className="field">
            <label htmlFor="backup-secret">{t(kind === 'password' ? 'backup.passwordAtExport' : 'unlock.recoveryKey')}</label>
            <input
              id="backup-secret"
              className="input"
              type={kind === 'password' ? 'password' : 'text'}
              autoComplete="off"
              spellCheck={false}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              autoFocus
            />
          </div>
          {/* El backup de una bóveda sin contraseña no tiene clave de recuperación: solo la contraseña elegida al hacerlo. */}
          {backup.header.recovery && (
            <button
              className="btn-link"
              type="button"
              onClick={() => {
                setKind(kind === 'password' ? 'recovery' : 'password');
                setSecret('');
              }}
            >
              {t(kind === 'password' ? 'unlock.useRecovery' : 'unlock.usePassword')}
            </button>
          )}
          {replacesData && (
            <>
              <p className="warning-box">{t('backup.replaceWarning')}</p>
              <label className="check">
                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                {t('backup.replaceConfirm')}
              </label>
            </>
          )}
        </>
      )}

      {error && <p className="error" role="alert">{error}</p>}
      {backup && (
        <button className="btn btn-primary btn-block" type="submit" disabled={busy || !secret || !confirmed}>
          {busy ? t('backup.restoring') : t('backup.restore')}
        </button>
      )}
    </form>
  );
}
