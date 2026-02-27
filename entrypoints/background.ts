const ALARM_NAME = 'sitless-reminder';
const STORAGE_KEY = 'sitless-settings';
const INSTALLED_AT_KEY = 'sitless-installed-at';

type ReminderSettings = {
  enabled: boolean;
  intervalMinutes: number;
  notificationTitle: string;
  notificationMessage: string;
  notificationDisplaySeconds: number;
};

type Message = { type: 'sync-reminder' } | { type: 'test-notification' };

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
    enabled:
      typeof raw.enabled === 'boolean' ? raw.enabled : defaultSettings.enabled,
    intervalMinutes: safeInterval,
    notificationTitle: safeTitle,
    notificationMessage: safeMessage,
    notificationDisplaySeconds: safeDisplaySeconds,
  };
}

function t(key: string, substitutions?: string | string[]): string {
  return (
    (
      browser.i18n.getMessage as (
        name: string,
        substitutions?: string | string[],
      ) => string
    )(key, substitutions) || key
  );
}

async function hasNotificationPermission(): Promise<boolean> {
  try {
    const contains = await browser.permissions.contains({
      permissions: ['notifications'],
    });
    if (contains) {
      return true;
    }
  } catch {}

  try {
    const getLevel = (
      browser.notifications as { getPermissionLevel?: () => Promise<string> }
    ).getPermissionLevel;
    if (!getLevel) {
      return false;
    }
    const level = await getLevel();
    return level === 'granted';
  } catch {
    return false;
  }
}

async function loadSettings(): Promise<ReminderSettings> {
  const stored = await browser.storage.local.get(STORAGE_KEY);
  const settings = normalizeSettings(stored[STORAGE_KEY]);
  await browser.storage.local.set({ [STORAGE_KEY]: settings });
  return settings;
}

async function syncAlarm() {
  const settings = await loadSettings();
  await browser.alarms.clear(ALARM_NAME);

  if (!settings.enabled) {
    return;
  }

  await browser.alarms.create(ALARM_NAME, {
    periodInMinutes: settings.intervalMinutes,
    delayInMinutes: settings.intervalMinutes,
  });
}

async function showNotification(): Promise<boolean> {
  const allowed = await hasNotificationPermission();
  if (!allowed) {
    return false;
  }

  const settings = await loadSettings();
  const id = `sitless-${Date.now()}`;
  const title = settings.notificationTitle || t('notificationTitle');
  const message = settings.notificationMessage || t('notificationMessage');

  await browser.notifications.create(id, {
    type: 'basic',
    iconUrl: '/icon/128.png',
    title,
    message,
    priority: 2,
  });

  setTimeout(() => {
    void browser.notifications.clear(id);
  }, settings.notificationDisplaySeconds * 1000);

  return true;
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    void browser.storage.local.set({ [INSTALLED_AT_KEY]: Date.now() });
    void syncAlarm();
  });

  browser.runtime.onStartup.addListener(() => {
    void syncAlarm();
  });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STORAGE_KEY]) {
      void syncAlarm();
    }
  });

  browser.runtime.onMessage.addListener((message: unknown) => {
    const payload = message as Message;

    if (payload?.type === 'sync-reminder') {
      return syncAlarm().then(() => ({ ok: true }));
    }

    if (payload?.type === 'test-notification') {
      return showNotification().then((ok) => ({ ok }));
    }

    return undefined;
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) {
      void showNotification();
    }
  });

  void syncAlarm();
});
