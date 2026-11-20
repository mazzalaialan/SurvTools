import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Archive, Check, TriangleAlert, Crosshair, Info, Loader2, Lock, LockOpen, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { lastBackupAt } from '@/core/backup/backup';
import { backupReminder } from '@/core/backup/reminder';
import { autoBackupState, hasAutoBackupPassword, runAutoBackup, setAutoBackupPassword, type AutoBackupResult, type AutoBackupState } from '@/core/backup/autoBackup';
import { verifyAllDownloads, type VerifyReport } from '@/core/storage/runVerify';
import { downloadCountryPack } from '@/modules/emergency/country';
import { redownloadZone } from '@/modules/maps/redownload';
import { problemsOf, type DownloadCheck } from '@/core/storage/verifyDownloads';
import { daysBetween, today } from '@/modules/inventory/domain/dates';
import { newerRelease, usePortableUpdate } from '@/core/portable/update';
import { CAPABILITIES, useCapabilities } from '@/core/capabilities/capabilities';
import { WrongSecretError } from '@/core/crypto/crypto';
import { setLanguage } from '@/core/i18n/i18n';
import { ServerError, checkServer, enableNotifications, normalizeServerUrl, isAcceptableServerUrl } from '@/core/notifications/notifications';
import { useVault } from '@/core/security/useVault';
import { BiometricError } from '@/core/security/vaultBiometric';
import {
  MIN_PASSWORD_LENGTH,
  WeakPasswordError,
  changePassword,
  unlockWithPassword,
} from '@/core/security/vault';
import { currentPosition, GeoPositionError } from '@/core/geo/useGeolocation';
import { AUTO_LOCK_OPTIONS, LANGUAGES, THEMES, useSettings, type RedSchedule, type Settings, type Country } from '@/core/settings/settings';
import { roundForDusk } from '@/core/settings/theme';
import { serverIsDown, serverMaps, type MapSourceMode, type ServerMaps } from '@/modules/maps/sources';
import { CountryPackPicker } from '@/modules/emergency/CountryPackPicker';
import { Segmented } from '@/ui/Segmented';
import { Collapsible } from '@/ui/Collapsible';
import { gpsErrorText } from '@/core/geo/gpsText';
import { NewPasswordForm } from '@/ui/NewPasswordForm';
import { useLibrary } from '@/modules/library/store';
import { useMapZones } from '@/modules/maps/store';
import { listImported, type ImportedMap } from '@/modules/maps/imported';
import { AccountSection } from './AccountSection';
import { ArchivedVaults } from '../screens/ArchivedVaults';
import { isAndroid, isNativePlatform } from '@/core/platform';
import { forceWebUpdate } from '@/core/portable/webUpdateRescue';
import { redBarColor, toHex } from '@/core/systemBars';
import { BiometricTest } from '../screens/BiometricTest';
import { BiometricUnlockSettings } from '../screens/BiometricUnlockSettings';
import { NotificationsSection } from './NotificationsSection';
import { confirmAction } from '@/ui/confirm';
import { useConnectionsAccess } from './connectionsAccess';

export function SettingsPage() {
  const connections = useConnectionsAccess();
  const { t } = useTranslation();
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  const lock = useVault((s) => s.lock);
  const openVault = useVault((s) => s.open);
  const addPassword = useVault((s) => s.addPassword);

  return (
    <div className="stack">
      <h1 className="page-title">{t('settings.title')}</h1>

      <section className="card stack">
        <h2 className="section-title" style={{ marginTop: 0 }}>{t('settings.general')}</h2>
        {/* El tema es lo que más se cambia (de día, de noche, en ahorro): va primero, antes del idioma y el país. */}
        <Segmented
          label={t('settings.theme')}
          value={settings.theme}
          options={THEMES.map((th) => ({ value: th, label: t(`theme.${th}`) }))}
          onChange={(theme) => void update({ theme })}
        />
        {settings.theme === 'saver' && <p className="hint" data-testid="saver-hint">{t('settings.saverHint')}</p>}
        {/* Se toca una sola vez: va en un desplegable cerrado, con el modo elegido a la vista en el encabezado. */}
        <Collapsible
          id="redschedule"
          inline
          title={t('settings.redSchedule')}
          summary={
            settings.redSchedule === 'custom'
              ? `${t('settings.redScheduleOptions.custom')} ${settings.redFrom}–${settings.redTo}`
              : t(`settings.redScheduleOptions.${settings.redSchedule}`)
          }
        >
          <RedScheduleFields settings={settings} onSave={update} />
        </Collapsible>
        {settings.theme === 'red' && isNativePlatform() && (
          <label className="check" data-testid="show-status-bar">
            <input type="checkbox" checked={settings.showStatusBar} onChange={(e) => void update({ showStatusBar: e.target.checked })} />
            <span>
              {t('settings.showStatusBar')}
              <span className="hint" style={{ display: 'block' }}>{t('settings.showStatusBarHint')}</span>
            </span>
          </label>
        )}
        {settings.theme === 'red' && settings.showStatusBar && isAndroid() && <SystemBarRedField level={settings.systemBarRed} onChange={(systemBarRed) => void update({ systemBarRed })} />}
        <Segmented
          label={t('settings.language')}
          value={settings.language}
          options={LANGUAGES.map((l) => ({ value: l, label: t(`language.${l}`) }))}
          onChange={(language) => {
            setLanguage(language);
            void update({ language });
          }}
        />
        <CountryPackPicker />
        <p className="hint" style={{ margin: 0 }}>{t('country.hint')}</p>
        <Segmented
          label={t('settings.units')}
          value={settings.units}
          options={(['metric', 'imperial'] as const).map((u) => ({ value: u, label: t(`units.${u}`) }))}
          onChange={(units) => void update({ units })}
        />
      </section>

      {settings.dismissedNotices.length > 0 && (
        <section className="card stack" aria-labelledby="notices-title" data-testid="notices-section">
          <h2 id="notices-title" className="section-title" style={{ margin: 0 }}>{t('notice.hidden', { count: settings.dismissedNotices.length })}</h2>
          <p className="hint" style={{ margin: 0 }}>{t('notice.restoreHint')}</p>
          <button className="btn" type="button" onClick={() => void update({ dismissedNotices: [] })} data-testid="notices-restore">
            {t('notice.restore')}
          </button>
        </section>
      )}

      <BackupSection />
      <DeviceSection />
      <StorageSection />

      {/* Seguridad: se toca rara vez, va cerrada. Lo que importa (sin contraseña / bloqueo automático) queda en el encabezado. */}
      <Collapsible
        id="security"
        testId="security"
        title={t('settings.security')}
        summary={openVault ? <span className="summary-warn"><TriangleAlert size={16} aria-hidden /> {t('settings.noPasswordStatus')}</span> : `${t('settings.autoLock')}: ${t('settings.minutes', { count: settings.autoLockMinutes })}`}
      >
        {openVault ? (
          <>
            {/* Sin contraseña: nada que bloquear; se puede poner una cuando se quiera (los datos no se re-cifran). */}
            <p className="warning-box" style={{ margin: 0 }} data-testid="no-password-status">{t('settings.noPasswordStatus')}</p>
            <h3 style={{ fontSize: '1rem', margin: 0 }}>{t('settings.addPassword')}</h3>
            <p className="hint" style={{ margin: 0 }}>{t('settings.addPasswordHint')}</p>
            <NewPasswordForm submitLabel={t('settings.addPassword')} busyLabel={t('setup.creating')} onSubmit={addPassword} />
          </>
        ) : (
          <>
            <div className="field">
              <label htmlFor="autolock">{t('settings.autoLock')}</label>
              <select
                id="autolock"
                className="select"
                value={settings.autoLockMinutes}
                onChange={(e) => void update({ autoLockMinutes: Number(e.target.value) })}
              >
                {AUTO_LOCK_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {t('settings.minutes', { count: m })}
                  </option>
                ))}
              </select>
            </div>
            {/* Ficha médica y contactos visibles en la pantalla de bloqueo, para quien te asista (como en los celulares). */}
            <label className="check">
              <input type="checkbox" checked={settings.emergencyOnLock} onChange={(e) => void update({ emergencyOnLock: e.target.checked })} data-testid="emergency-on-lock" />
              {t('settings.emergencyOnLock')}
            </label>
            <p className="hint" style={{ margin: 0 }}>{t('settings.emergencyOnLockHint')}</p>
            <ChangePasswordForm />
            <NewRecoveryKeyForm />
            <button className="btn" type="button" onClick={lock}>
              <Lock size={18} /> {t('settings.lockNow')}
            </button>
            {/* Huella, cara o PIN del dispositivo para desbloquear (la contraseña sigue valiendo siempre). */}
            <BiometricUnlockSettings />
            <RemovePasswordForm />
          </>
        )}
        {/* App nativa: ocultar la app en «recientes» y evitar capturas (ver core/systemBars.ts). */}
        {isAndroid() && (
          <>
            <label className="check">
              <input type="checkbox" checked={settings.hideInRecents} onChange={(e) => void update({ hideInRecents: e.target.checked })} data-testid="hide-in-recents" />
              {t('settings.hideInRecents')}
            </label>
            <p className="hint" style={{ margin: 0 }}>{t('settings.hideInRecentsHint')}</p>
          </>
        )}
        {/* Bóvedas anteriores guardadas aparte (si las hay): se recuperan con su contraseña o clave. */}
        <ArchivedVaults hasCurrent />
        {/* Prueba (sin cambiar nada) de si este dispositivo puede desbloquear con huella, cara o PIN. */}
        {/* La prueba usa claves de acceso de WebAuthn: en la app nativa la huella va por el Keystore de Android y no aplica. */}
        {!isNativePlatform() && <BiometricTest />}
      </Collapsible>

      <NotificationsSection />
      <AccountSection />

      {connections.visible && <ConnectionsSection settings={settings} onSave={update} />}

      <section className="card">
        <h2 className="section-title" style={{ marginTop: 0 }}>{t('settings.about')}</h2>
        <p style={{ margin: 0 }}>{t('app.name')}</p>
        {/* La frase va pegada al nombre de la app (no entre los botones). */}
        <p className="hint" style={{ margin: 0, fontStyle: 'italic' }}>{t('app.motto')}</p>
        <p className="hint" onClick={connections.tap} data-testid="app-version">{t('settings.version', { version: __APP_VERSION__ })}</p>
        <PortableUpdateCheck />
        <ForceWebUpdate />
        <Link className="btn" to="/about">
          <Info size={18} /> {t('about.link')}
        </Link>
      </section>
    </div>
  );
}

/**
 * App nativa, tema «Rojo nocturno»: cuán claro es el rojo de las barras del sistema. En 0 quedan casi negras con íconos blancos; de 1 a 10 el rojo
 * va de más oscuro a más claro con íconos negros (Android no permite íconos rojos). Se ve en vivo.
 */
function SystemBarRedField({ level, onChange }: { level: number; onChange: (n: number) => void }) {
  const { t } = useTranslation();
  const shown = level > 0 ? toHex(redBarColor(level)) : '';
  return (
    <div className="field" data-testid="system-bar-red">
      <label htmlFor="system-bar-red-input">{t('settings.systemBarRed')}</label>
      <input id="system-bar-red-input" type="range" min={0} max={10} step={1} value={level} onChange={(e) => onChange(Number(e.target.value))} aria-valuetext={level === 0 ? t('settings.systemBarRedOff') : t('settings.systemBarRedLevel', { level, hex: shown })} />
      <p className="hint" style={{ margin: 0 }}>{level === 0 ? t('settings.systemBarRedOff') : t('settings.systemBarRedLevel', { level, hex: shown })}</p>
      <p className="hint" style={{ margin: 0 }}>{t('settings.systemBarRedHint')}</p>
    </div>
  );
}

/** App nativa: copia automática y cifrada de los datos en Documentos/VikArg (fuera del WebView), con la última y un botón para hacerla ya. */
function AutoBackupField() {
  const { t, i18n } = useTranslation();
  const enabled = useSettings((s) => s.settings.autoBackup);
  const update = useSettings((s) => s.update);
  const [state, setState] = useState<AutoBackupState | null>(null);
  const [result, setResult] = useState<AutoBackupResult | null>(null);
  const [busy, setBusy] = useState(false);
  const open = useVault((s) => s.open);
  const [hasPassword, setHasPassword] = useState(true);
  const [editing, setEditing] = useState(false);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const refresh = () => {
    void autoBackupState().then(setState);
    void hasAutoBackupPassword().then(setHasPassword);
  };
  useEffect(refresh, []);
  const pwOk = pw.length >= MIN_PASSWORD_LENGTH && pw === pw2;
  async function savePassword() {
    await setAutoBackupPassword(pw);
    setPw('');
    setPw2('');
    setEditing(false);
    refresh();
    await now();
  }

  async function now() {
    setBusy(true);
    setResult(null);
    try {
      setResult(await runAutoBackup({ force: true }));
    } finally {
      setBusy(false);
      refresh();
    }
  }
  const when = state ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(state.at)) : null;
  return (
    <div className="stack" style={{ gap: 8 }} data-testid="auto-backup">
      <label className="check">
        <input type="checkbox" checked={enabled} onChange={(e) => void update({ autoBackup: e.target.checked })} data-testid="auto-backup-toggle" />
        <span>
          {t('settings.autoBackup')}
          <span className="hint" style={{ display: 'block' }}>{t('settings.autoBackupHint')}</span>
        </span>
      </label>
      <p className="hint" style={{ margin: 0 }} data-testid="auto-backup-last">
        {when && state ? t('settings.autoBackupLast', { when, where: state.where, size: formatBytes(state.bytes, i18n.language) }) : t('settings.autoBackupNever')}
      </p>
      {open && (!hasPassword || editing) ? (
        <div className="stack" style={{ gap: 6 }} data-testid="auto-backup-password">
          <p className="warning-box" style={{ margin: 0 }}>{t('settings.autoBackupPasswordHint')}</p>
          <input className="input" type="password" autoComplete="new-password" placeholder={t('settings.autoBackupPassword')} value={pw} onChange={(e) => setPw(e.target.value)} aria-label={t('settings.autoBackupPassword')} data-testid="auto-backup-pw" />
          <input className="input" type="password" autoComplete="new-password" placeholder={t('setup.confirm')} value={pw2} onChange={(e) => setPw2(e.target.value)} aria-label={t('setup.confirm')} data-testid="auto-backup-pw2" />
          {pw && !pwOk && <p className="error" role="alert" style={{ margin: 0 }}>{pw.length < MIN_PASSWORD_LENGTH ? t('setup.tooShort', { min: MIN_PASSWORD_LENGTH }) : t('setup.mismatch')}</p>}
          <div className="row-end">
            {editing && <button className="btn" type="button" onClick={() => setEditing(false)}>{t('common.cancel')}</button>}
            <button className="btn btn-primary" type="button" disabled={!pwOk || busy} onClick={() => void savePassword()} data-testid="auto-backup-pw-save">{t('settings.autoBackupPasswordSave')}</button>
          </div>
        </div>
      ) : (
        open && <div><button className="btn-link" type="button" onClick={() => setEditing(true)}>{t('settings.autoBackupPasswordChange')}</button></div>
      )}
      {result && result !== 'done' && (
        <p className={result === 'error' ? 'error' : 'hint'} role="status" style={{ margin: 0 }}>{t(`settings.autoBackupResult.${result}`)}</p>
      )}
      <div>
        <button className="btn" type="button" onClick={() => void now()} disabled={busy} data-testid="auto-backup-now">
          <Archive size={18} /> {busy ? t('settings.autoBackupBusy') : t('settings.autoBackupNow')}
        </button>
      </div>
    </div>
  );
}

/** Acceso al backup y la transferencia, con cuándo fue el último. */
function BackupSection() {
  const { t } = useTranslation();
  const [last, setLast] = useState<string | null>(null);
  useEffect(() => {
    void lastBackupAt().then(setLast);
  }, []);
  const daysAgo = last ? daysBetween(today(new Date(last)), today()) : null;
  const firstUseAt = useSettings((s) => s.settings.firstUseAt);
  // Vencido: sin snooze (en Ajustes se ve siempre que corresponda; el «recordármelo» es del aviso del Inicio).
  const overdue = backupReminder({ lastBackupAt: last, firstUseAt, snoozedUntil: null }).due;
  return (
    <section className="card stack">
      <h2 className="section-title" style={{ marginTop: 0 }}>{t('settings.backupTitle')}</h2>
      <p className={overdue ? 'warning-box' : 'hint'} style={{ margin: 0 }} data-testid="settings-last-backup">
        {daysAgo === null ? t('backup.never') : daysAgo === 0 ? t('backup.lastToday') : t('backup.lastDaysAgo', { count: daysAgo })}
      </p>
      <div>
        <Link className="btn" to="/settings/backup">
          <Archive size={18} /> {t('settings.backupOpen')}
        </Link>
      </div>
      {isAndroid() && <AutoBackupField />}
    </section>
  );
}

/** Solo en el paquete portable: buscar versiones nuevas a mano. */
/** Solo en la web: si el aviso de actualización no responde, borra la copia de la app guardada y la vuelve a bajar (los datos no se tocan). */
export function ForceWebUpdate() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  if (isNativePlatform()) return null;
  return (
    <div className="stack" style={{ gap: 8 }} data-testid="force-update">
      <p className="hint" style={{ margin: 0 }}>{t('pwa.forceHint')}</p>
      <div>
        <button
          className="btn"
          type="button"
          disabled={busy}
          data-testid="force-update-btn"
          onClick={() => {
            void confirmAction(t('pwa.forceConfirm')).then((ok) => {
              if (!ok) return;
              setBusy(true);
              void forceWebUpdate();
            });
          }}
        >
          <RefreshCw size={18} /> {t('pwa.force')}
        </button>
      </div>
    </div>
  );
}

/** Solo en el paquete portable: buscar versiones nuevas a mano. */
export function PortableUpdateCheck() {
  const { t } = useTranslation();
  const { portable, apk, latest, checking, error, checkedAt, check } = usePortableUpdate();
  if (!portable && !apk) return null;
  const newer = newerRelease(latest, __APP_VERSION__);
  return (
    <div className="stack" style={{ gap: 8 }}>
      <p className="hint" style={{ margin: 0 }}>{t(apk ? 'portable.isApk' : 'portable.isPortable')}</p>
      <p style={{ margin: 0 }} data-testid="portable-status">
        {checking ? (
          t('portable.checking')
        ) : error ? (
          t('portable.error')
        ) : newer ? (
          <a href={apk ? newer.apkUrl : newer.downloadUrl} target="_blank" rel="noreferrer">
            {t(apk ? 'portable.apkNewVersion' : 'portable.newVersion', { version: newer.version })}
          </a>
        ) : checkedAt ? (
          t('portable.upToDate')
        ) : null}
      </p>
      <div>
        <button className="btn" type="button" onClick={() => void check(true)} disabled={checking}>
          <RefreshCw size={18} /> {t('portable.check')}
        </button>
      </div>
    </div>
  );
}

/** Rojo nocturno automático: desactivado, horario fijo o desde el anochecer (con ubicación aproximada). */
function RedScheduleFields({ settings, onSave }: { settings: Settings; onSave: (c: Partial<Settings>) => Promise<void> }) {
  const { t, i18n } = useTranslation();
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fmt = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 });

  async function locate() {
    setLocating(true);
    setError(null);
    try {
      const fix = await currentPosition();
      await onSave({ duskPlace: roundForDusk(fix.lat, fix.lon) });
    } catch (e) {
      setError(gpsErrorText(t, e instanceof GeoPositionError ? e.code : 'unavailable'));
    } finally {
      setLocating(false);
    }
  }

  async function choose(redSchedule: RedSchedule) {
    await onSave({ redSchedule });
    if (redSchedule === 'dusk' && !settings.duskPlace) await locate();
  }

  return (
    <>
      <Segmented<RedSchedule>
        label={t('settings.redSchedule')}
        value={settings.redSchedule}
        options={(['off', 'custom', 'dusk'] as const).map((v) => ({ value: v, label: t(`settings.redScheduleOptions.${v}`) }))}
        onChange={(v) => void choose(v)}
      />
      {settings.redSchedule === 'custom' && (
        <div className="grid-2">
          <div className="field">
            <label htmlFor="red-from">{t('settings.redFrom')}</label>
            <input id="red-from" className="input" type="time" value={settings.redFrom} onChange={(e) => e.target.value && void onSave({ redFrom: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="red-to">{t('settings.redTo')}</label>
            <input id="red-to" className="input" type="time" value={settings.redTo} onChange={(e) => e.target.value && void onSave({ redTo: e.target.value })} />
          </div>
        </div>
      )}
      {settings.redSchedule === 'dusk' && (
        <div className="stack" style={{ gap: 8 }}>
          <p className="hint" style={{ margin: 0 }} data-testid="dusk-place">
            {settings.duskPlace
              ? t('settings.duskPlace', { lat: fmt.format(settings.duskPlace.lat), lon: fmt.format(settings.duskPlace.lon) })
              : locating
                ? t('gps.searching')
                : t('settings.duskNoPlace')}
          </p>
          {error && <p className="error" role="alert">{error}</p>}
          <div>
            <button className="btn" type="button" onClick={() => void locate()} disabled={locating}>
              <Crosshair size={18} /> {t('settings.duskUpdate')}
            </button>
          </div>
        </div>
      )}
      {settings.redSchedule !== 'off' && <p className="hint" style={{ margin: 0 }}>{t('settings.redScheduleHint')}</p>}
    </>
  );
}

/** Con contraseña → sin contraseña: pide la actual y avisa lo que se pierde. */
function RemovePasswordForm() {
  const { t } = useTranslation();
  const removePassword = useVault((s) => s.removePassword);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!(await confirmAction(t('settings.removePasswordConfirm')))) return;
    try {
      await removePassword(password);
    } catch (err) {
      if (err instanceof WrongSecretError) return setError(t('unlock.wrong'));
      throw err;
    }
  }

  return (
    <form className="stack" onSubmit={handleSubmit} data-testid="remove-password">
      <h3 style={{ fontSize: '1rem', margin: 0 }}>{t('settings.removePassword')}</h3>
      <p className="hint" style={{ margin: 0 }}>{t('settings.removePasswordHint')}</p>
      <div className="field">
        <label htmlFor="remove-password">{t('settings.currentPassword')}</label>
        <input id="remove-password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn" type="submit" disabled={!password}>
        <LockOpen size={18} /> {t('settings.removePassword')}
      </button>
    </form>
  );
}

/** Código de recuperación nuevo: el actual no se puede volver a ver (no se guarda), pero se puede reemplazar confirmando con la clave o la huella. */
function NewRecoveryKeyForm() {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const biometric = useVault((s) => s.biometric);
  const unlockBiometric = useVault((s) => s.unlockBiometric);
  const newRecoveryKey = useVault((s) => s.newRecoveryKey);

  async function generate(confirm: () => Promise<void>) {
    setError(null);
    try {
      await confirm();
      if (!(await confirmAction(t('settings.newRecoveryConfirm')))) return;
      await newRecoveryKey();
      setPassword('');
    } catch (err) {
      if (err instanceof WrongSecretError) return setError(t('unlock.wrong'));
      if (err instanceof BiometricError) return setError(t(`biometricUnlock.error.${err.code}`));
      throw err;
    }
  }

  return (
    <form className="stack" data-testid="new-recovery" onSubmit={(e) => { e.preventDefault(); void generate(() => unlockWithPassword(password)); }}>
      <h3 style={{ fontSize: '1rem' }}>{t('settings.newRecoveryTitle')}</h3>
      <p className="hint" style={{ margin: 0 }}>{t('settings.newRecoveryHint')}</p>
      <div className="field">
        <label htmlFor="recovery-password">{t('settings.currentPassword')}</label>
        <input id="recovery-password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn" type="submit" disabled={!password}>{t('settings.newRecoveryButton')}</button>
      {biometric && (
        <button className="btn" type="button" onClick={() => void generate(unlockBiometric)} data-testid="new-recovery-bio">{t('settings.newRecoveryBio')}</button>
      )}
    </form>
  );
}

function ChangePasswordForm() {
  const { t } = useTranslation();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  // Con la huella activada, confirmarla reemplaza a la contraseña actual (por si se olvidó y no hay código de recuperación).
  const biometric = useVault((s) => s.biometric);
  const unlockBiometric = useVault((s) => s.unlockBiometric);
  const [bioOk, setBioOk] = useState(false);

  async function confirmWithBiometric() {
    try {
      await unlockBiometric();
      setBioOk(true);
      setMessage(null);
    } catch (err) {
      setBioOk(false);
      setMessage({ ok: false, text: t(`biometricUnlock.error.${err instanceof BiometricError ? err.code : 'failed'}`) });
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      // Verifica la contraseña actual antes de reemplazarla (o la huella, ya confirmada).
      if (!(biometric && bioOk)) await unlockWithPassword(current);
      await changePassword(next);
      setBioOk(false);
      setCurrent('');
      setNext('');
      setMessage({ ok: true, text: t('settings.passwordChanged') });
    } catch (err) {
      if (err instanceof WrongSecretError) return setMessage({ ok: false, text: t('unlock.wrong') });
      if (err instanceof WeakPasswordError)
        return setMessage({ ok: false, text: t('setup.tooShort', { min: MIN_PASSWORD_LENGTH }) });
      throw err;
    }
  }

  return (
    <form className="stack" onSubmit={handleSubmit}>
      <h3 style={{ fontSize: '1rem' }}>{t('settings.changePassword')}</h3>
      {biometric && bioOk ? (
        <p className="ok-box" style={{ margin: 0 }} data-testid="change-password-bio-ok">{t('settings.biometricConfirmed')}</p>
      ) : (
        <>
          <div className="field">
            <label htmlFor="current-password">{t('settings.currentPassword')}</label>
            <input
              id="current-password"
              className="input"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
          {biometric && (
            <button className="btn" type="button" onClick={() => void confirmWithBiometric()} data-testid="change-password-bio">
              {t('settings.confirmWithBiometric')}
            </button>
          )}
        </>
      )}
      <div className="field">
        <label htmlFor="next-password">{t('settings.newPassword')}</label>
        <input
          id="next-password"
          className="input"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
      </div>
      {message && <p className={message.ok ? 'success' : 'error'} role="status">{message.text}</p>}
      <button className="btn" type="submit" disabled={(!current && !(biometric && bioOk)) || !next}>
        {t('common.save')}
      </button>
    </form>
  );
}

function ConnectionsSection({ settings, onSave }: { settings: Settings; onSave: (c: Partial<Settings>) => Promise<void> }) {
  const { t } = useTranslation();
  const [serverUrl, setServerUrl] = useState(settings.serverUrl);
  const [weatherUrl, setWeatherUrl] = useState(settings.weatherUrl);
  const [saved, setSaved] = useState(false);
  const [check, setCheck] = useState<{ ok: boolean; text: string } | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const nextServer = serverUrl.trim() ? normalizeServerUrl(serverUrl) : '';
    // Sin https:// el código del dispositivo viajaría en claro: no se guarda.
    if (nextServer && !isAcceptableServerUrl(nextServer)) {
      setSaved(false);
      setCheck({ ok: false, text: t('notifications.error.insecure') });
      return;
    }
    const serverChanged = nextServer !== settings.serverUrl;
    await onSave({ serverUrl: nextServer, weatherUrl: weatherUrl.trim() });
    setServerUrl(nextServer);
    setSaved(true);
    // Con notificaciones activas, cambiar de servidor re-registra el dispositivo (o lo da de baja si se vació).
    if (serverChanged && settings.notificationsEnabled) await enableNotifications().catch(() => undefined);
  }

  async function testServer() {
    setCheck(null);
    try {
      const info = await checkServer(serverUrl);
      setCheck({ ok: true, text: t('settings.serverOk', { version: info.version }) });
    } catch (err) {
      if (!(err instanceof ServerError)) throw err;
      setCheck({ ok: false, text: t(`notifications.error.${err.code}`) });
    }
  }

  return (
    <form className="card stack" onSubmit={handleSubmit}>
      <h2 className="section-title" style={{ marginTop: 0 }}>{t('settings.connections')}</h2>
      <p className="hint">{t('settings.connectionsHint')}</p>
      <div className="field">
        <label htmlFor="server-url">{t('settings.serverUrl')}</label>
        <LockedInput
          id="server-url"
          placeholder="https://"
          value={serverUrl}
          onChange={(v) => {
            setServerUrl(v);
            setSaved(false);
          }}
        />
        <p className="hint">{t('settings.serverUrlHint')}</p>
        {serverUrl.trim() && (
          <button className="btn-link" type="button" onClick={() => void testServer()} style={{ alignSelf: 'flex-start' }}>
            {t('settings.serverTest')}
          </button>
        )}
        {check && <p className={check.ok ? 'success' : 'error'} role="status">{check.text}</p>}
      </div>
      <div className="field">
        <label htmlFor="weather-url">{t('settings.weatherUrl')}</label>
        <LockedInput
          id="weather-url"
          value={weatherUrl}
          onChange={(v) => {
            setWeatherUrl(v);
            setSaved(false);
          }}
        />
      </div>
      {saved && <p className="success" role="status">{t('common.saved')}</p>}
      <button className="btn" type="submit">
        {t('common.save')}
      </button>
      <MapSourceField settings={settings} onSave={onSave} />
    </form>
  );
}

const MAP_SOURCE_MODES: MapSourceMode[] = ['auto', 'server', 'public'];

/** De dónde bajar los mapas offline (se guarda al elegir) y qué tiene el servidor propio. */
function MapSourceField({ settings, onSave }: { settings: Settings; onSave: (c: Partial<Settings>) => Promise<void> }) {
  const { t, i18n } = useTranslation();
  const { mapSource, serverUrl } = settings;
  // undefined: todavía no se sabe; null: no tiene mapas o no responde.
  const [info, setInfo] = useState<ServerMaps | null | undefined>(undefined);
  useEffect(() => {
    if (mapSource === 'public' || !serverUrl.trim()) return;
    let cancelled = false;
    setInfo(undefined);
    void serverMaps(serverUrl).then((v) => !cancelled && setInfo(v));
    return () => {
      cancelled = true;
    };
  }, [mapSource, serverUrl]);

  const status =
    mapSource === 'public'
      ? t('maps.source.usingPublic')
      : !serverUrl.trim()
        ? t('maps.source.noServerUrl')
        : info === undefined
          ? t('maps.source.checking')
          : info?.vector
            ? t(serverIsDown() ? 'maps.source.serverBusy' : 'maps.source.serverHas', { date: new Date(info.vector.updatedAt).toLocaleDateString(i18n.language) })
            : t(mapSource === 'auto' ? 'maps.source.serverNoneAuto' : 'maps.source.serverNone');

  return (
    <div className="field">
      <label htmlFor="map-source">{t('maps.source.label')}</label>
      <select id="map-source" className="select" value={mapSource} onChange={(e) => void onSave({ mapSource: e.target.value as MapSourceMode })}>
        {MAP_SOURCE_MODES.map((m) => (
          <option key={m} value={m}>
            {t(`maps.source.${m}`)}
          </option>
        ))}
      </select>
      <p className="hint" data-testid="map-source-status">{status}</p>
    </div>
  );
}

/** Dirección que no se cambia por error: hay que abrir el candado para editarla. */
function LockedInput({ id, value, onChange, placeholder }: { id: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const label = open ? t('settings.lockField') : t('settings.unlockField');
  return (
    <div className="locked-input">
      <input
        id={id}
        className="input"
        type="url"
        inputMode="url"
        placeholder={placeholder}
        value={value}
        readOnly={!open}
        aria-readonly={!open}
        onChange={(e) => onChange(e.target.value)}
      />
      <button className="icon-btn" type="button" aria-pressed={open} onClick={() => setOpen(!open)} aria-label={label} title={label}>
        {open ? <LockOpen size={20} /> : <Lock size={20} />}
      </button>
    </div>
  );
}

function DeviceSection() {
  const { t } = useTranslation();
  const caps = useCapabilities((s) => s.caps);
  // Los permisos pueden haber cambiado desde Ajustes de Android: se vuelven a leer al abrir esta sección y al volver a la app.
  useEffect(() => {
    const refresh = () => void useCapabilities.getState().detect();
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
  return (
    <Collapsible id="device" title={t('settings.device')}>
      <p className="hint">{t('settings.deviceHint')}</p>
      <ul className="cap-list">
        {CAPABILITIES.map((c) => {
          const ok = caps?.[c] ?? false;
          return (
            <li key={c} className={ok ? 'cap-yes' : 'cap-no'}>
              {ok ? <Check size={18} aria-label="✓" /> : <X size={18} aria-label="✗" />}
              <span style={{ color: 'var(--text)' }}>{t(`capabilities.${c}`)}</span>
            </li>
          );
        })}
      </ul>
    </Collapsible>
  );
}

function formatBytes(bytes: number, locale: string): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)} ${units[i]}`;
}

function StorageSection() {
  const { t, i18n } = useTranslation();
  const [estimate, setEstimate] = useState<StorageEstimate | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [imported, setImported] = useState<ImportedMap[]>([]);
  const [busy, setBusy] = useState(false);
  const books = useLibrary((s) => s.installed);
  const removeBooks = useLibrary((s) => s.removeMany);
  const zones = useMapZones((s) => s.zones);
  const removeZone = useMapZones((s) => s.remove);

  const refresh = () => {
    void navigator.storage?.estimate().then(setEstimate);
    void listImported()
      .then(setImported)
      .catch(() => setImported([]));
  };
  useEffect(() => {
    refresh();
    void navigator.storage?.persisted().then(setPersisted);
  }, []);

  if (!navigator.storage) return null;
  const fmt = (b: number) => formatBytes(b, i18n.language);
  const booksBytes = [...books.values()].reduce((s, b) => s + b.bytes, 0);
  const zonesBytes = zones.reduce((s, z) => s + z.bytes, 0);
  const importedBytes = imported.reduce((s, m) => s + m.bytes, 0);
  const rest = Math.max(0, (estimate?.usage ?? 0) - booksBytes - zonesBytes - importedBytes);

  async function clearAll(kind: 'books' | 'zones') {
    const count = kind === 'books' ? books.size : zones.length;
    if (!(await confirmAction(t(`settings.storageClear.${kind}`, { count })))) return;
    setBusy(true);
    try {
      if (kind === 'books') await removeBooks([...books.keys()]);
      else for (const z of zones) await removeZone(z.id);
    } finally {
      setBusy(false);
      refresh();
    }
  }

  return (
    <Collapsible
      id="storage"
      testId="storage"
      title={t('settings.storage')}
      summary={estimate ? t('settings.storageUsed', { used: fmt(estimate.usage ?? 0), quota: fmt(estimate.quota ?? 0) }) : undefined}
    >
      <ul className="list storage-list">
        <li className="list-row" data-testid="storage-books">
          <span className="list-main">
            <span className="list-title">{t('settings.storageBooks', { count: books.size })}</span>
            <span className="list-sub">{fmt(booksBytes)}</span>
          </span>
          <Link className="btn" to="/library/books">
            {t('settings.storageManage')}
          </Link>
          {books.size > 0 && (
            <button className="btn btn-danger-outline" type="button" disabled={busy} onClick={() => void clearAll('books')} data-testid="storage-clear-books">
              {t('settings.storageClearAll')}
            </button>
          )}
        </li>
        <li className="list-row" data-testid="storage-zones">
          <span className="list-main">
            <span className="list-title">{t('settings.storageZones', { count: zones.length })}</span>
            <span className="list-sub">{fmt(zonesBytes)}</span>
          </span>
          <Link className="btn" to="/orientation/maps">
            {t('settings.storageManage')}
          </Link>
          {zones.length > 0 && (
            <button className="btn btn-danger-outline" type="button" disabled={busy} onClick={() => void clearAll('zones')}>
              {t('settings.storageClearAll')}
            </button>
          )}
        </li>
        {imported.length > 0 && (
          <li className="list-row">
            <span className="list-main">
              <span className="list-title">{t('settings.storageImported', { count: imported.length })}</span>
              <span className="list-sub">{fmt(importedBytes)}</span>
            </span>
            <Link className="btn" to="/orientation/maps">
              {t('settings.storageManage')}
            </Link>
          </li>
        )}
        {estimate && (
          <li className="list-row">
            <span className="list-main">
              <span className="list-title">{t('settings.storageRest')}</span>
              <span className="list-sub">{fmt(rest)}</span>
            </span>
          </li>
        )}
      </ul>
      {isNativePlatform() ? (
        // El WebView de Android no concede «almacenamiento persistente» (`persist()` siempre dice que no): el botón no serviría. Lo que importa
        // acá es saber dónde viven los datos y que el backup es la única copia.
        <p className="hint" data-testid="storage-native">{t('settings.storageNative')}</p>
      ) : (
        <>
          {persisted !== null && <p className={persisted ? 'success' : 'hint'}>{t(persisted ? 'settings.storagePersistent' : 'settings.storageNotPersistent')}</p>}
          {persisted === false && (
            <button className="btn" type="button" onClick={() => void navigator.storage.persist().then(setPersisted)}>
              {t('settings.storagePersist')}
            </button>
          )}
        </>
      )}
      <VerifyDownloads />
    </Collapsible>
  );
}

/**
 * «Verificar descargas»: comprueba que los libros y las zonas de mapas que figuran como bajados estén de verdad en el dispositivo (si el sistema
 * los borró o la descarga quedó a medias, fallarían en el campo, sin conexión). Para cada problema: quitarlo de la lista o ir a bajarlo de nuevo.
 */
function VerifyDownloads() {
  const { t, i18n } = useTranslation();
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [report, setReport] = useState<VerifyReport | null>(null);
  const removeBook = useLibrary((s) => s.remove);
  const removeZone = useMapZones((s) => s.remove);
  const serverUrl = useSettings((s) => s.settings.serverUrl);
  const mapSource = useSettings((s) => s.settings.mapSource);
  /** Qué se está volviendo a bajar (`kind-id`), cuánto va (zonas) y por qué falló lo último. */
  const [redoing, setRedoing] = useState<string | null>(null);
  const [redoPct, setRedoPct] = useState<number | null>(null);
  const [redoFailed, setRedoFailed] = useState<Record<string, string>>({});

  async function redownload(c: DownloadCheck) {
    const key = `${c.kind}-${c.id}`;
    setRedoing(key);
    setRedoPct(null);
    setRedoFailed((f) => ({ ...f, [key]: '' }));
    let reason: string | null = null;
    try {
      if (c.kind === 'book') {
        reason = await useLibrary.getState().redownload(serverUrl, c.id);
      } else {
        const zone = useMapZones.getState().zones.find((z) => z.id === c.id);
        if (!zone) reason = 'failed';
        else {
          const r = await redownloadZone(zone, { serverUrl, mode: mapSource, onProgress: (p) => setRedoPct(Math.round((100 * p.done) / Math.max(1, p.total))) });
          reason = r.ok ? null : r.reason;
        }
      }
    } catch {
      reason = 'failed';
    }
    setRedoing(null);
    setRedoPct(null);
    if (reason) setRedoFailed((f) => ({ ...f, [key]: reason! }));
    else void run();
  }

  async function run() {
    setState('running');
    try {
      setReport(await verifyAllDownloads());
      setState('done');
    } catch {
      setState('error');
    }
  }
  const [fixing, setFixing] = useState(false);
  /** Baja (o actualiza) lo que falta del país elegido y vuelve a revisar. */
  async function fixCountry(code: Country) {
    setFixing(true);
    try {
      await downloadCountryPack(code);
    } finally {
      setFixing(false);
      void run();
    }
  }
  async function dismiss(c: DownloadCheck) {
    await (c.kind === 'book' ? removeBook(c.id) : removeZone(c.id));
    setReport((r) => r && { ...r, checks: r.checks.filter((x) => !(x.kind === c.kind && x.id === c.id)), books: r.books - (c.kind === 'book' ? 1 : 0), zones: r.zones - (c.kind === 'zone' ? 1 : 0) });
  }
  const problems = report ? problemsOf(report.checks) : [];

  return (
    <div className="stack" data-testid="verify-downloads" style={{ gap: 8 }}>
      <p className="hint" style={{ margin: 0 }}>{t('settings.verifyHint')}</p>
      <div>
        <button className="btn" type="button" disabled={state === 'running'} onClick={() => void run()} data-testid="verify-run">
          <ShieldCheck size={18} aria-hidden /> {state === 'running' ? t('settings.verifying') : t('settings.verify')}
        </button>
      </div>
      {state === 'error' && <p className="error" role="alert">{t('settings.verifyFailed')}</p>}
      {state === 'done' && report && report.country.state !== 'ready' && (
        <div className="stack" data-testid="verify-country" style={{ gap: 6 }}>
          <p className="warning-box" role="status" style={{ margin: 0 }}>
            {t(report.country.state === 'missing' ? 'settings.verifyCountryMissing' : 'settings.verifyCountryStale', {
              country: t(`country.${report.country.code}`),
              count: report.country.files,
              size: formatBytes(report.country.bytes, i18n.language),
            })}
          </p>
          <div>
            <button className="btn btn-primary" type="button" disabled={fixing} onClick={() => void fixCountry(report.country.code)} data-testid="verify-country-fix">
              {fixing ? t('settings.verifying') : t(report.country.state === 'missing' ? 'settings.verifyCountryDo' : 'settings.verifyCountryUpdate')}
            </button>
          </div>
        </div>
      )}
      {state === 'done' && report && (
        <>
          {report.books + report.zones === 0 ? (
            <p className="hint" style={{ margin: 0 }} data-testid="verify-none">{t('settings.verifyNone')}</p>
          ) : problems.length === 0 ? (
            <p className="success" role="status" data-testid="verify-ok">{t('settings.verifyOk', { books: report.books, zones: report.zones })}</p>
          ) : (
            <>
              <p className="warning-box" role="status" style={{ margin: 0 }} data-testid="verify-problems">{t('settings.verifyProblems', { count: problems.length })}</p>
              <ul className="list" data-testid="verify-list">
                {problems.map((c) => (
                  <li key={`${c.kind}-${c.id}`} className="stack" style={{ gap: 6 }} data-testid={`verify-${c.kind}-${c.id}`}>
                    <span>
                      <strong>{c.name}</strong> <span className="hint">· {t(c.kind === 'book' ? 'settings.dlBook' : 'settings.dlZone')}</span>
                    </span>
                    <span className="hint">{c.status === 'missing' ? t('settings.dlMissing') : t('settings.dlPartial', { present: c.present, total: c.total })}</span>
                    {redoFailed[`${c.kind}-${c.id}`] && (
                      <p className="error" role="alert" style={{ margin: 0 }} data-testid={`verify-redo-error-${c.kind}-${c.id}`}>
                        {t(`settings.dlRedoFailed.${['offline', 'key-required', 'bad-key', 'too-many-tries', 'tooBig', 'tooBigServer', 'outsideServer', 'noServer'].includes(redoFailed[`${c.kind}-${c.id}`]!) ? redoFailed[`${c.kind}-${c.id}`] : 'failed'}`)}
                        {(redoFailed[`${c.kind}-${c.id}`] === 'key-required' || redoFailed[`${c.kind}-${c.id}`] === 'bad-key') && (
                          <> <Link to="/library/books">{t('settings.dlOpenLibrary')}</Link></>
                        )}
                      </p>
                    )}
                    <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                      <button className="btn btn-primary" type="button" disabled={redoing !== null} onClick={() => void redownload(c)} data-testid={`verify-redo-${c.kind}-${c.id}`}>
                        {redoing === `${c.kind}-${c.id}` ? (
                          <><Loader2 size={16} className="spin" aria-hidden /> {redoPct !== null ? t('settings.dlRedoingPct', { pct: redoPct }) : t('settings.dlRedoing')}</>
                        ) : (
                          t('settings.dlRedownload')
                        )}
                      </button>
                      <button className="btn btn-danger-outline" type="button" onClick={() => void dismiss(c)}>
                        {t('settings.dlRemove')}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
