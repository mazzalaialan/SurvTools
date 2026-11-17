import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Archive, Check, Crosshair, Info, Lock, LockOpen, RefreshCw, X } from 'lucide-react';
import { lastBackupAt } from '@/core/backup/backup';
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
import { AUTO_LOCK_OPTIONS, LANGUAGES, THEMES, useSettings, type RedSchedule, type Settings } from '@/core/settings/settings';
import { roundForDusk } from '@/core/settings/theme';
import { serverIsDown, serverMaps, type MapSourceMode, type ServerMaps } from '@/modules/maps/sources';
import { CountryPackPicker } from '@/modules/emergency/CountryPackPicker';
import { Segmented } from '@/ui/Segmented';
import { NewPasswordForm } from '@/ui/NewPasswordForm';
import { useLibrary } from '@/modules/library/store';
import { useMapZones } from '@/modules/maps/store';
import { listImported, type ImportedMap } from '@/modules/maps/imported';
import { AccountSection } from './AccountSection';
import { ArchivedVaults } from '../screens/ArchivedVaults';
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
          label={t('settings.theme')}
          value={settings.theme}
          options={THEMES.map((th) => ({ value: th, label: t(`theme.${th}`) }))}
          onChange={(theme) => void update({ theme })}
        />
        {settings.theme === 'saver' && <p className="hint" data-testid="saver-hint">{t('settings.saverHint')}</p>}
        <RedScheduleFields settings={settings} onSave={update} />
        <Segmented
          label={t('settings.units')}
          value={settings.units}
          options={(['metric', 'imperial'] as const).map((u) => ({ value: u, label: t(`units.${u}`) }))}
          onChange={(units) => void update({ units })}
        />
      </section>

      <section className="card stack" data-testid="security">
        <h2 className="section-title" style={{ marginTop: 0 }}>{t('settings.security')}</h2>
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
        {/* Bóvedas anteriores guardadas aparte (si las hay): se recuperan con su contraseña o clave. */}
        <ArchivedVaults hasCurrent />
        {/* Prueba (sin cambiar nada) de si este dispositivo puede desbloquear con huella, cara o PIN. */}
        <BiometricTest />
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
      <NotificationsSection />
      <AccountSection />
      <DeviceSection />
      <StorageSection />

      {connections.visible && <ConnectionsSection settings={settings} onSave={update} />}

      <section className="card">
        <h2 className="section-title" style={{ marginTop: 0 }}>{t('settings.about')}</h2>
        <p style={{ margin: 0 }}>{t('app.name')}</p>
        <p className="hint" onClick={connections.tap} data-testid="app-version">{t('settings.version', { version: __APP_VERSION__ })}</p>
        <PortableUpdateCheck />
        <p className="hint" style={{ fontStyle: 'italic' }}>{t('app.motto')}</p>
        <Link className="btn" to="/about">
          <Info size={18} /> {t('about.link')}
        </Link>
      </section>
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
  return (
    <section className="card stack">
      <h2 className="section-title" style={{ marginTop: 0 }}>{t('settings.backupTitle')}</h2>
      <p className="hint" style={{ margin: 0 }} data-testid="settings-last-backup">
        {daysAgo === null ? t('backup.never') : daysAgo === 0 ? t('backup.lastToday') : t('backup.lastDaysAgo', { count: daysAgo })}
      </p>
      <div>
        <Link className="btn" to="/settings/backup">
          <Archive size={18} /> {t('settings.backupOpen')}
        </Link>
      </div>
    </section>
  );
}

/** Solo en el paquete portable: buscar versiones nuevas a mano. */
export function PortableUpdateCheck() {
  const { t } = useTranslation();
  const { portable, latest, checking, error, checkedAt, check } = usePortableUpdate();
  if (!portable) return null;
  const newer = newerRelease(latest, __APP_VERSION__);
  return (
    <div className="stack" style={{ gap: 8 }}>
      <p className="hint" style={{ margin: 0 }}>{t('portable.isPortable')}</p>
      <p style={{ margin: 0 }} data-testid="portable-status">
        {checking ? (
          t('portable.checking')
        ) : error ? (
          t('portable.error')
        ) : newer ? (
          <a href={newer.downloadUrl} target="_blank" rel="noreferrer">
            {t('portable.newVersion', { version: newer.version })}
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
      setError(t(`gps.error.${e instanceof GeoPositionError ? e.code : 'unavailable'}`));
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
  return (
    <section className="card stack">
      <h2 className="section-title" style={{ marginTop: 0 }}>{t('settings.device')}</h2>
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
    </section>
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
    <section className="card stack" data-testid="storage">
      <h2 className="section-title" style={{ marginTop: 0 }}>{t('settings.storage')}</h2>
      {estimate && <p style={{ margin: 0 }}>{t('settings.storageUsed', { used: fmt(estimate.usage ?? 0), quota: fmt(estimate.quota ?? 0) })}</p>}
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
      {persisted !== null && <p className={persisted ? 'success' : 'hint'}>{t(persisted ? 'settings.storagePersistent' : 'settings.storageNotPersistent')}</p>}
      {persisted === false && (
        <button className="btn" type="button" onClick={() => void navigator.storage.persist().then(setPersisted)}>
          {t('settings.storagePersist')}
        </button>
      )}
    </section>
  );
}
