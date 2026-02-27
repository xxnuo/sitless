import { useEffect, useMemo, useState } from 'react';
import './App.css';

type ReminderSettings = {
  enabled: boolean;
  intervalMinutes: number;
  notificationTitle: string;
  notificationMessage: string;
  notificationDisplaySeconds: number;
};

type TestNotificationResponse = {
  ok: boolean;
};

const STORAGE_KEY = 'sitless-settings';
const INSTALLED_AT_KEY = 'sitless-installed-at';
const defaultSettings: ReminderSettings = {
  enabled: true,
  intervalMinutes: 45,
  notificationTitle: '',
  notificationMessage: '',
  notificationDisplaySeconds: 8,
};

function normalizeSettings(input: unknown): ReminderSettings {
  const raw = (input ?? {}) as Partial<ReminderSettings>;
  const interval = Number(raw.intervalMinutes);
  const displaySeconds = Number(raw.notificationDisplaySeconds);
  const safeInterval = Number.isFinite(interval)
    ? Math.max(1, Math.min(180, Math.round(interval)))
    : defaultSettings.intervalMinutes;
  const safeDisplaySeconds = Number.isFinite(displaySeconds)
    ? Math.max(1, Math.min(300, Math.round(displaySeconds)))
    : defaultSettings.notificationDisplaySeconds;
  const safeTitle =
    typeof raw.notificationTitle === 'string'
      ? raw.notificationTitle.trim().slice(0, 80)
      : defaultSettings.notificationTitle;
  const safeMessage =
    typeof raw.notificationMessage === 'string'
      ? raw.notificationMessage.trim().slice(0, 200)
      : defaultSettings.notificationMessage;

  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : defaultSettings.enabled,
    intervalMinutes: safeInterval,
    notificationTitle: safeTitle,
    notificationMessage: safeMessage,
    notificationDisplaySeconds: safeDisplaySeconds,
  };
}

function t(key: string, substitutions?: string | string[]): string {
  return (browser.i18n.getMessage as (name: string, substitutions?: string | string[]) => string)(
    key,
    substitutions,
  ) || key;
}

async function hasNotificationPermission(): Promise<boolean> {
  try {
    const contains = await browser.permissions.contains({ permissions: ['notifications'] });
    if (contains) {
      return true;
    }
  } catch {}

  try {
    const getLevel = (browser.notifications as { getPermissionLevel?: () => Promise<string> })
      .getPermissionLevel;
    if (!getLevel) {
      return false;
    }
    const level = await getLevel();
    return level === 'granted';
  } catch {
    return false;
  }
}

function App() {
  const [settings, setSettings] = useState<ReminderSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(true);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [installedAt, setInstalledAt] = useState<number | null>(null);

  useEffect(() => {
    let active = true;

    void Promise.all([
      browser.storage.local.get(STORAGE_KEY),
      browser.storage.local.get(INSTALLED_AT_KEY),
      hasNotificationPermission(),
    ]).then(([stored, installedAtStore, permission]) => {
      if (!active) return;
      const next = normalizeSettings(stored[STORAGE_KEY]);
      setSettings(next);
      setPermissionGranted(permission);
      const value = installedAtStore[INSTALLED_AT_KEY];
      setInstalledAt(typeof value === 'number' ? value : null);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  const statusText = useMemo(() => {
    if (!settings.enabled) return t('statusPaused');
    return t('statusEveryMinutes', String(settings.intervalMinutes));
  }, [settings]);

  const permissionText = useMemo(() => {
    return permissionGranted ? t('permissionGranted') : t('permissionDenied');
  }, [permissionGranted]);

  async function save(next: ReminderSettings) {
    const safe = normalizeSettings(next);
    setSettings(safe);
    await browser.storage.local.set({ [STORAGE_KEY]: safe });
    await browser.runtime.sendMessage({ type: 'sync-reminder' });
  }

  async function refreshPermission() {
    const granted = await hasNotificationPermission();
    setPermissionGranted(granted);
  }

  async function requestPermission() {
    try {
      await browser.permissions.request({ permissions: ['notifications'] });
    } catch {}
    await refreshPermission();
  }

  async function testNotification() {
    const result = (await browser.runtime.sendMessage({
      type: 'test-notification',
    })) as TestNotificationResponse;

    if (!result?.ok) {
      await refreshPermission();
    }
  }

  const showPermissionBanner = !loading && !permissionGranted;

  return (
    <main className="popup">
      {showPermissionBanner ? (
        <div className="banner">
          <div className="banner-text">{t('permissionBannerText')}</div>
          <button
            className="banner-action"
            onClick={() => void requestPermission()}
            disabled={loading}
          >
            {t('permissionBannerAction')}
          </button>
        </div>
      ) : null}
      <h1>{t('popupTitle')}</h1>
      <p className="status">{statusText}</p>

      <section className="section">
        <button
          type="button"
          className="section-head"
          onClick={() => setReminderOpen((v) => !v)}
        >
          <span className="head-left">
            <span className="section-icon" aria-hidden="true">
              R
            </span>
            <span>{t('reminderSettingsTitle')}</span>
          </span>
          <span className="head-right">
            <span className="arrow" aria-hidden="true">
              {reminderOpen ? '▲' : '▼'}
            </span>
          </span>
        </button>

        {reminderOpen ? (
          <div className="section-body">
            <label className="row" htmlFor="enabled">
              <span>{t('toggleLabel')}</span>
              <input
                id="enabled"
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) => void save({ ...settings, enabled: e.target.checked })}
                disabled={loading}
              />
            </label>

            <label className="column" htmlFor="interval">
              <span>{t('intervalLabel')}</span>
              <input
                id="interval"
                type="range"
                min={1}
                max={180}
                step={1}
                value={settings.intervalMinutes}
                onChange={(e) =>
                  void save({ ...settings, intervalMinutes: Number(e.target.value) })
                }
                disabled={loading || !settings.enabled}
              />
              <strong>{settings.intervalMinutes}</strong>
            </label>
          </div>
        ) : null}
      </section>

      <section className="section">
        <button
          type="button"
          className="section-head"
          onClick={() => setNotificationOpen((v) => !v)}
        >
          <span className="head-left">
            <span className="section-icon" aria-hidden="true">
              N
            </span>
            <span>{t('notificationSettingsTitle')}</span>
          </span>
          <span className="head-right">
            <span className="arrow" aria-hidden="true">
              {notificationOpen ? '▲' : '▼'}
            </span>
          </span>
        </button>

        {notificationOpen ? (
          <div className="section-body">
            <p className="permission">{permissionText}</p>

            <div className="actions">
              <button onClick={() => void refreshPermission()} disabled={loading}>
                {t('refreshPermissionBtn')}
              </button>
              <button onClick={() => void requestPermission()} disabled={loading}>
                {t('requestPermissionBtn')}
              </button>
            </div>

            <div className="actions single">
              <button onClick={() => void testNotification()} disabled={loading}>
                {t('testNotificationBtn')}
              </button>
            </div>

            <label className="column" htmlFor="notificationTitle">
              <span>{t('notificationTitleLabel')}</span>
              <input
                id="notificationTitle"
                type="text"
                maxLength={80}
                value={settings.notificationTitle}
                placeholder={t('notificationTitlePlaceholder')}
                onChange={(e) =>
                  setSettings((prev) =>
                    normalizeSettings({ ...prev, notificationTitle: e.target.value }),
                  )
                }
                onBlur={() => void save(settings)}
                disabled={loading}
              />
            </label>

            <label className="column" htmlFor="notificationMessage">
              <span>{t('notificationMessageLabel')}</span>
              <textarea
                id="notificationMessage"
                rows={3}
                maxLength={200}
                value={settings.notificationMessage}
                placeholder={t('notificationMessagePlaceholder')}
                onChange={(e) =>
                  setSettings((prev) =>
                    normalizeSettings({ ...prev, notificationMessage: e.target.value }),
                  )
                }
                onBlur={() => void save(settings)}
                disabled={loading}
              />
            </label>

            <label className="column" htmlFor="notificationDisplaySeconds">
              <span>{t('notificationDisplaySecondsLabel')}</span>
              <input
                id="notificationDisplaySeconds"
                type="number"
                min={1}
                max={300}
                value={settings.notificationDisplaySeconds}
                onChange={(e) =>
                  void save({
                    ...settings,
                    notificationDisplaySeconds: Number(e.target.value),
                  })
                }
                disabled={loading}
              />
            </label>
          </div>
        ) : null}
      </section>
    </main>
  );
}

export default App;
