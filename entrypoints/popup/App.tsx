import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';

type ReminderSettings = {
  enabled: boolean;
  intervalMinutes: number;
  notificationTitle: string;
  notificationMessage: string;
  notificationDisplaySeconds: number;
  notificationIconDataUrl: string;
};

type PopupUiState = {
  reminderOpen: boolean;
  notificationOpen: boolean;
};

type TestNotificationResponse = {
  ok: boolean;
};

const STORAGE_KEY = 'sitless-settings';
const UI_STATE_KEY = 'sitless-popup-ui-state';
const MIN_INTERVAL_MINUTES = 0.1;
const MAX_INTERVAL_MINUTES = 180;
const MAX_ICON_DATA_URL_LENGTH = 2_000_000;
const defaultSettings: ReminderSettings = {
  enabled: true,
  intervalMinutes: 45,
  notificationTitle: '',
  notificationMessage: '',
  notificationDisplaySeconds: 8,
  notificationIconDataUrl: '',
};

const defaultUiState: PopupUiState = {
  reminderOpen: true,
  notificationOpen: false,
};

type IntervalUnit = 's' | 'm' | 'h';

function intervalToMinutes(value: number, unit: IntervalUnit): number {
  if (unit === 's') return value / 60;
  if (unit === 'h') return value * 60;
  return value;
}

function minutesToInterval(minutes: number): { value: number; unit: IntervalUnit } {
  if (minutes < 1) return { value: Math.round(minutes * 60), unit: 's' };
  if (minutes >= 60 && Math.abs(minutes % 60) < 1e-9) {
    return { value: minutes / 60, unit: 'h' };
  }
  return { value: minutes, unit: 'm' };
}

function clampInterval(value: number, unit: IntervalUnit): number {
  const min =
    unit === 's' ? MIN_INTERVAL_MINUTES * 60 : unit === 'h' ? MIN_INTERVAL_MINUTES / 60 : 1;
  const max =
    unit === 's' ? MAX_INTERVAL_MINUTES * 60 : unit === 'h' ? MAX_INTERVAL_MINUTES / 60 : MAX_INTERVAL_MINUTES;
  const safe = Math.max(min, Math.min(max, value));
  if (unit === 's') return Math.round(safe / 6) * 6;
  if (unit === 'm') return Math.round(safe);
  return Math.round(safe * 10) / 10;
}

async function fileToSquareDataUrl(file: File, size: number): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('image-load-failed'));
      img.src = objectUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return '';
    }
    const sourceSize = Math.min(image.width, image.height);
    const sx = Math.max(0, Math.floor((image.width - sourceSize) / 2));
    const sy = Math.max(0, Math.floor((image.height - sourceSize) / 2));
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(image, sx, sy, sourceSize, sourceSize, 0, 0, size, size);
    const pngDataUrl = canvas.toDataURL('image/png');
    if (pngDataUrl.length <= MAX_ICON_DATA_URL_LENGTH) return pngDataUrl;
    const jpeg90 = canvas.toDataURL('image/jpeg', 0.9);
    if (jpeg90.length <= MAX_ICON_DATA_URL_LENGTH) return jpeg90;
    return canvas.toDataURL('image/jpeg', 0.75);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result);
    };
    reader.onerror = () => reject(new Error('file-read-failed'));
    reader.readAsDataURL(file);
  });
}

function normalizeUiState(input: unknown): PopupUiState {
  const raw = (input ?? {}) as Partial<PopupUiState>;
  return {
    reminderOpen:
      typeof raw.reminderOpen === 'boolean'
        ? raw.reminderOpen
        : defaultUiState.reminderOpen,
    notificationOpen:
      typeof raw.notificationOpen === 'boolean'
        ? raw.notificationOpen
        : defaultUiState.notificationOpen,
  };
}

function normalizeSettings(input: unknown): ReminderSettings {
  const raw = (input ?? {}) as Partial<ReminderSettings>;
  const interval = Number(raw.intervalMinutes);
  const displaySeconds = Number(raw.notificationDisplaySeconds);
  const safeInterval = Number.isFinite(interval)
    ? Math.max(
        MIN_INTERVAL_MINUTES,
        Math.min(
          MAX_INTERVAL_MINUTES,
          Math.round(interval * 10) / 10,
        ),
      )
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
  const iconRaw =
    typeof raw.notificationIconDataUrl === 'string'
      ? raw.notificationIconDataUrl.trim()
      : defaultSettings.notificationIconDataUrl;
  const safeIcon =
    iconRaw.startsWith('data:image/') && iconRaw.length <= MAX_ICON_DATA_URL_LENGTH
      ? iconRaw
      : '';

  return {
    enabled:
      typeof raw.enabled === 'boolean' ? raw.enabled : defaultSettings.enabled,
    intervalMinutes: safeInterval,
    notificationTitle: safeTitle,
    notificationMessage: safeMessage,
    notificationDisplaySeconds: safeDisplaySeconds,
    notificationIconDataUrl: safeIcon,
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

function App() {
  const [settings, setSettings] = useState<ReminderSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(defaultUiState.reminderOpen);
  const [notificationOpen, setNotificationOpen] = useState(
    defaultUiState.notificationOpen,
  );
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>('m');
  const [intervalValue, setIntervalValue] = useState<number>(
    defaultSettings.intervalMinutes,
  );
  const [iconMessage, setIconMessage] = useState('');
  const settingsRef = useRef(settings);
  const uiStateRef = useRef<PopupUiState>(defaultUiState);
  const notificationIconInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    uiStateRef.current = { reminderOpen, notificationOpen };
  }, [reminderOpen, notificationOpen]);

  useEffect(() => {
    let active = true;

    void Promise.all([
      browser.storage.local.get([STORAGE_KEY, UI_STATE_KEY]),
      hasNotificationPermission(),
    ]).then(([stored, permission]) => {
      if (!active) return;
      const next = normalizeSettings(stored[STORAGE_KEY]);
      const uiState = normalizeUiState(stored[UI_STATE_KEY]);
      setSettings(next);
      setReminderOpen(uiState.reminderOpen);
      setNotificationOpen(uiState.notificationOpen);
      const interval = minutesToInterval(next.intervalMinutes);
      setIntervalUnit(interval.unit);
      setIntervalValue(interval.value);
      setPermissionGranted(permission);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  const uiLanguage = useMemo(() => {
    try {
      return browser.i18n.getUILanguage?.() || '';
    } catch {
      return '';
    }
  }, []);

  const statusIntervalText = useMemo(() => {
    const minutes = settings.intervalMinutes;
    if (!Number.isFinite(minutes)) return String(minutes);
    if (minutes < 1) {
      const seconds = Math.round(minutes * 60);
      if (uiLanguage.startsWith('zh')) return `${seconds} 秒`;
      if (uiLanguage.startsWith('en')) return `${seconds} seconds`;
      return String(minutes);
    }
    if (minutes >= 60) {
      const hours = minutes / 60;
      if (uiLanguage.startsWith('zh') && Math.abs(hours - Math.round(hours)) < 1e-9)
        return `${hours} 小时`;
      if (uiLanguage.startsWith('en') && Math.abs(hours - Math.round(hours)) < 1e-9)
        return `${hours} hours`;
    }
    if (uiLanguage.startsWith('zh')) return `${minutes} 分钟`;
    if (uiLanguage.startsWith('en')) return `${minutes} minutes`;
    return String(minutes);
  }, [settings.intervalMinutes, uiLanguage]);

  const statusText = useMemo(() => {
    if (!settings.enabled) return t('statusPaused');
    if (uiLanguage.startsWith('zh')) return `每 ${statusIntervalText} 提醒一次`;
    if (uiLanguage.startsWith('en')) return `Remind every ${statusIntervalText}`;
    return t('statusEveryMinutes', String(settings.intervalMinutes));
  }, [settings, statusIntervalText, uiLanguage]);

  const permissionText = useMemo(() => {
    return permissionGranted ? t('permissionGranted') : t('permissionDenied');
  }, [permissionGranted]);

  async function save(next: ReminderSettings) {
    const safe = normalizeSettings(next);
    console.log('[save] saving, iconDataUrl length:', safe.notificationIconDataUrl.length);
    settingsRef.current = safe;
    setSettings(safe);
    await browser.storage.local.set({ [STORAGE_KEY]: safe });
    await browser.runtime.sendMessage({ type: 'sync-reminder' });
    console.log('[save] done');
  }

  async function refreshPermission() {
    const granted = await hasNotificationPermission();
    setPermissionGranted(granted);
  }

  async function saveUiState(next: PopupUiState) {
    uiStateRef.current = next;
    await browser.storage.local.set({ [UI_STATE_KEY]: next });
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

  async function resetReminderSection() {
    const nextSettings = normalizeSettings({
      ...settingsRef.current,
      enabled: defaultSettings.enabled,
      intervalMinutes: defaultSettings.intervalMinutes,
    });
    const interval = minutesToInterval(nextSettings.intervalMinutes);
    setIntervalUnit(interval.unit);
    setIntervalValue(interval.value);
    await save(nextSettings);
  }

  async function resetNotificationSection() {
    await save(
      normalizeSettings({
        ...settingsRef.current,
        notificationTitle: defaultSettings.notificationTitle,
        notificationMessage: defaultSettings.notificationMessage,
        notificationDisplaySeconds: defaultSettings.notificationDisplaySeconds,
        notificationIconDataUrl: defaultSettings.notificationIconDataUrl,
      }),
    );
  }

  async function setDefaultNotificationIcon() {
    await save(
      normalizeSettings({
        ...settingsRef.current,
        notificationIconDataUrl: '',
      }),
    );
  }

  async function onPickNotificationIcon(file: File) {
    console.log('[icon] onPickNotificationIcon called, file:', file.name, file.type, file.size);
    setIconMessage('');
    try {
      const rawDataUrl = await fileToDataUrl(file);
      console.log('[icon] fileToDataUrl result length:', rawDataUrl.length, 'prefix:', rawDataUrl.slice(0, 40));
      let dataUrl = rawDataUrl;
      try {
        const squareDataUrl = await fileToSquareDataUrl(file, 128);
        console.log('[icon] fileToSquareDataUrl result length:', squareDataUrl.length, 'prefix:', squareDataUrl.slice(0, 40));
        if (squareDataUrl) {
          dataUrl = squareDataUrl;
        }
      } catch (err) {
        console.warn('[icon] fileToSquareDataUrl failed:', err);
      }
      console.log('[icon] final dataUrl length:', dataUrl.length, 'starts with data:image/:', dataUrl.startsWith('data:image/'));
      if (!dataUrl) {
        setIconMessage('图标读取失败');
        return;
      }
      const next = normalizeSettings({
        ...settingsRef.current,
        notificationIconDataUrl: dataUrl,
      });
      console.log('[icon] after normalizeSettings, iconDataUrl length:', next.notificationIconDataUrl.length);
      if (!next.notificationIconDataUrl) {
        setIconMessage('图标过大或格式不支持');
        return;
      }
      await save(next);
      console.log('[icon] save() done, settingsRef.current iconDataUrl length:', settingsRef.current.notificationIconDataUrl.length);
      const stored = await browser.storage.local.get(STORAGE_KEY);
      const persisted = normalizeSettings(stored[STORAGE_KEY]);
      console.log('[icon] storage verify, persisted iconDataUrl length:', persisted.notificationIconDataUrl.length);
      if (!persisted.notificationIconDataUrl) {
        setIconMessage('图标保存失败');
        return;
      }
      setIconMessage('图标已更新');
    } catch (err) {
      console.error('[icon] onPickNotificationIcon error:', err);
      setIconMessage('图标设置失败');
    }
  }

  const showPermissionBanner = !loading && !permissionGranted;

  const unitLabels = useMemo(() => {
    if (uiLanguage.startsWith('zh')) {
      return { s: '秒', m: '分钟', h: '小时' } as const;
    }
    return { s: 'sec', m: 'min', h: 'hour' } as const;
  }, [uiLanguage]);

  const intervalMin = intervalUnit === 's' ? 6 : intervalUnit === 'h' ? 0.1 : 1;
  const intervalMax =
    intervalUnit === 's' ? MAX_INTERVAL_MINUTES * 60 : intervalUnit === 'h' ? 3 : MAX_INTERVAL_MINUTES;
  const intervalStep = intervalUnit === 's' ? 6 : intervalUnit === 'h' ? 0.1 : 1;

  return (
    <main className="popup">
      {showPermissionBanner ? (
        <div className="banner">
          <div className="banner-text">{t('permissionBannerText')}</div>
          <button
            type="button"
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
          onClick={() => {
            const next = !reminderOpen;
            setReminderOpen(next);
            void saveUiState({ ...uiStateRef.current, reminderOpen: next });
          }}
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
                onChange={(e) =>
                  void save({ ...settings, enabled: e.target.checked })
                }
                disabled={loading}
              />
            </label>

            <label className="column" htmlFor="interval">
              <span>{t('intervalLabel')}</span>
              <input
                id="interval"
                type="range"
                min={intervalMin}
                max={intervalMax}
                step={intervalStep}
                value={intervalValue}
                onChange={(e) => {
                  const nextValue = clampInterval(Number(e.target.value), intervalUnit);
                  setIntervalValue(nextValue);
                  void save({
                    ...settings,
                    intervalMinutes: intervalToMinutes(nextValue, intervalUnit),
                  });
                }}
                disabled={loading || !settings.enabled}
              />
              <div className="interval-inline">
                <input
                  type="number"
                  min={intervalMin}
                  max={intervalMax}
                  step={intervalStep}
                  value={intervalValue}
                  onChange={(e) => {
                    const nextValue = clampInterval(Number(e.target.value), intervalUnit);
                    setIntervalValue(nextValue);
                    void save({
                      ...settings,
                      intervalMinutes: intervalToMinutes(nextValue, intervalUnit),
                    });
                  }}
                  disabled={loading || !settings.enabled}
                />
                <select
                  value={intervalUnit}
                  onChange={(e) => {
                    const nextUnit = e.target.value as IntervalUnit;
                    const currentMinutes = intervalToMinutes(intervalValue, intervalUnit);
                    const nextValueRaw =
                      nextUnit === 's'
                        ? currentMinutes * 60
                        : nextUnit === 'h'
                          ? currentMinutes / 60
                          : currentMinutes;
                    const nextValue = clampInterval(nextValueRaw, nextUnit);
                    setIntervalUnit(nextUnit);
                    setIntervalValue(nextValue);
                    void save({
                      ...settings,
                      intervalMinutes: intervalToMinutes(nextValue, nextUnit),
                    });
                  }}
                  disabled={loading || !settings.enabled}
                >
                  <option value="s">{unitLabels.s}</option>
                  <option value="m">{unitLabels.m}</option>
                  <option value="h">{unitLabels.h}</option>
                </select>
              </div>
            </label>

            <div className="actions single">
              <button
                type="button"
                onClick={() => void resetReminderSection()}
                disabled={loading}
              >
                {t('resetSettingsBtn')}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="section">
        <button
          type="button"
          className="section-head"
          onClick={() => {
            const next = !notificationOpen;
            setNotificationOpen(next);
            void saveUiState({ ...uiStateRef.current, notificationOpen: next });
          }}
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

            {!permissionGranted ? (
              <div className="actions">
                <button
                  type="button"
                  onClick={() => void requestPermission()}
                  disabled={loading}
                >
                  {t('requestPermissionBtn')}
                </button>
              </div>
            ) : null}

            <label className="column" htmlFor="notificationTitle">
              <span>{t('notificationTitleLabel')}</span>
              <input
                id="notificationTitle"
                type="text"
                maxLength={80}
                value={settings.notificationTitle}
                placeholder={t('notificationTitlePlaceholder')}
                onChange={(e) => {
                  const value = e.target.value;
                  setSettings((prev) => {
                    const next = normalizeSettings({ ...prev, notificationTitle: value });
                    settingsRef.current = next;
                    return next;
                  });
                }}
                onBlur={() => void save(settingsRef.current)}
                disabled={loading}
              />
            </label>

            <label className="column">
              <span>{t('notificationIconLabel')}</span>
              <div className="icon-picker">
                <img
                  className="icon-preview"
                  src={settings.notificationIconDataUrl || '/icon/128.png'}
                  alt=""
                />
                <div className="icon-controls">
                  <button
                    type="button"
                    onClick={() => notificationIconInputRef.current?.click()}
                    disabled={loading}
                  >
                    {t('notificationIconPickBtn')}
                  </button>
                  <input
                    ref={notificationIconInputRef}
                    className="icon-file-hidden"
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.currentTarget.files?.[0];
                      console.log('[icon] file input onChange, file:', file?.name, file?.type, file?.size);
                      e.currentTarget.value = '';
                      if (file) void onPickNotificationIcon(file);
                    }}
                    disabled={loading}
                  />
                </div>
              </div>
              {iconMessage ? <p className="icon-message">{iconMessage}</p> : null}
              {settings.notificationIconDataUrl ? (
                <div className="icon-actions">
                  <button
                    type="button"
                    onClick={() => void setDefaultNotificationIcon()}
                    disabled={loading}
                  >
                    {t('notificationIconClearBtn')}
                  </button>
                </div>
              ) : null}
            </label>

            <label className="column" htmlFor="notificationMessage">
              <span>{t('notificationMessageLabel')}</span>
              <textarea
                id="notificationMessage"
                rows={3}
                maxLength={200}
                value={settings.notificationMessage}
                placeholder={t('notificationMessagePlaceholder')}
                onChange={(e) => {
                  const value = e.target.value;
                  setSettings((prev) => {
                    const next = normalizeSettings({ ...prev, notificationMessage: value });
                    settingsRef.current = next;
                    return next;
                  });
                }}
                onBlur={() => void save(settingsRef.current)}
                disabled={loading}
              />
            </label>

            <div className="actions single">
              <button
                type="button"
                onClick={() => void testNotification()}
                disabled={loading}
              >
                {t('testNotificationBtn')}
              </button>
            </div>

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

            <div className="actions single">
              <button
                type="button"
                onClick={() => void resetNotificationSection()}
                disabled={loading}
              >
                {t('resetSettingsBtn')}
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}

export default App;
