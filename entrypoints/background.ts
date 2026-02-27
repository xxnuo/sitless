const ALARM_NAME = 'sitless-reminder';
const STORAGE_KEY = 'sitless-settings';

type ReminderSettings = {
  enabled: boolean;
  intervalMinutes: number;
};

const defaultSettings: ReminderSettings = {
  enabled: true,
  intervalMinutes: 45,
};

function normalizeSettings(input: unknown): ReminderSettings {
  const raw = (input ?? {}) as Partial<ReminderSettings>;
  const interval = Number(raw.intervalMinutes);
  const safeInterval = Number.isFinite(interval)
    ? Math.max(10, Math.min(180, Math.round(interval)))
    : defaultSettings.intervalMinutes;

  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : defaultSettings.enabled,
    intervalMinutes: safeInterval,
  };
}

async function loadSettings(): Promise<ReminderSettings> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const settings = normalizeSettings(stored[STORAGE_KEY]);
  await chrome.storage.local.set({ [STORAGE_KEY]: settings });
  return settings;
}

async function syncAlarm() {
  const settings = await loadSettings();

  await chrome.alarms.clear(ALARM_NAME);
  if (!settings.enabled) {
    return;
  }

  await chrome.alarms.create(ALARM_NAME, {
    periodInMinutes: settings.intervalMinutes,
    delayInMinutes: settings.intervalMinutes,
  });
}

function showNotification() {
  const id = `sitless-${Date.now()}`;
  chrome.notifications.create(id, {
    type: 'basic',
    iconUrl: '/icon/128.png',
    title: '久坐提醒',
    message: '起来活动 2-5 分钟，伸展一下身体。',
    priority: 2,
  });
}

export default defineBackground(() => {
  chrome.runtime.onInstalled.addListener(() => {
    void syncAlarm();
  });

  chrome.runtime.onStartup.addListener(() => {
    void syncAlarm();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STORAGE_KEY]) {
      void syncAlarm();
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'sync-reminder') {
      void syncAlarm().then(() => sendResponse({ ok: true }));
      return true;
    }
    return false;
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) {
      showNotification();
    }
  });

  void syncAlarm();
});
