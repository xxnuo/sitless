import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { BiTimer } from 'react-icons/bi';
import { IoNotificationsOutline } from 'react-icons/io5';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

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
  notificationDisplaySeconds: 30,
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

function SectionHeader({
  title,
  open,
  onClick,
  icon,
}: {
  title: string;
  open: boolean;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center justify-between px-4 py-3 text-left"
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground inline-flex size-5 items-center justify-center">
          {icon}
        </span>
        <span className="text-sm font-medium">{title}</span>
      </div>
      <span className="text-muted-foreground text-xs" aria-hidden="true">
        {open ? '▲' : '▼'}
      </span>
    </button>
  );
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
  const settingsRef = useRef(settings);
  const uiStateRef = useRef<PopupUiState>(defaultUiState);

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
    settingsRef.current = safe;
    setSettings(safe);
    await browser.storage.local.set({ [STORAGE_KEY]: safe });
    await browser.runtime.sendMessage({ type: 'sync-reminder' });
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
      }),
    );
  }

  async function openIconSettingsPage() {
    try {
      await browser.tabs.create({
        url: browser.runtime.getURL('/icon-settings.html' as never),
      });
    } catch {}
    try {
      window.close();
    } catch {}
  }

  const iconSettingsButtonText = useMemo(() => {
    if (uiLanguage.startsWith('zh')) return '打开图标设置页';
    return 'Open Icon Settings';
  }, [uiLanguage]);

  useEffect(() => {
    const onFocus = () => {
      void browser.storage.local.get(STORAGE_KEY).then((stored) => {
        const next = normalizeSettings(stored[STORAGE_KEY]);
        settingsRef.current = next;
        setSettings(next);
      });
    };
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  useEffect(() => {
    const onStorageChanged = (
      changes: Record<string, { newValue?: unknown }>,
      area: string,
    ) => {
      if (area !== 'local' || !changes[STORAGE_KEY]?.newValue) return;
      const next = normalizeSettings(changes[STORAGE_KEY].newValue);
      settingsRef.current = next;
      setSettings(next);
    };
    browser.storage.onChanged.addListener(onStorageChanged);
    return () => {
      browser.storage.onChanged.removeListener(onStorageChanged);
    };
  }, []);

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
    <main className="box-border w-[360px] max-w-full space-y-2.5 p-3">
      {showPermissionBanner ? (
        <Card className="gap-1.5 border-amber-300 bg-amber-50 py-2.5">
          <CardContent className="flex items-center justify-between gap-2 px-3">
            <p className="text-muted-foreground text-xs">{t('permissionBannerText')}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void requestPermission()}
              disabled={loading}
            >
              {t('permissionBannerAction')}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-0.5">
        <h1 className="text-lg font-semibold leading-none">{t('popupTitle')}</h1>
        <p className="text-muted-foreground text-xs">{statusText}</p>
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        <SectionHeader
          icon={<BiTimer className="size-3.5" />}
          title={t('reminderSettingsTitle')}
          open={reminderOpen}
          onClick={() => {
            const next = !reminderOpen;
            setReminderOpen(next);
            void saveUiState({ ...uiStateRef.current, reminderOpen: next });
          }}
        />
        {reminderOpen ? (
          <>
            <Separator />
            <CardContent className="space-y-3 py-3">
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="enabled">{t('toggleLabel')}</Label>
                <Checkbox
                  id="enabled"
                  checked={settings.enabled}
                  onCheckedChange={(checked) => void save({ ...settings, enabled: checked === true })}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="interval">{t('intervalLabel')}</Label>
                <input
                  id="interval"
                  className="w-full accent-primary"
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
                <div className="flex items-center gap-2">
                  <Input
                    className="h-9"
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
                  <div className="relative w-[84px] shrink-0">
                    <select
                      value={intervalUnit}
                      className={cn(
                        'border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full appearance-none rounded-md border px-2 pr-7 text-sm outline-none focus-visible:ring-[3px]',
                      )}
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
                    <ChevronDown className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2" />
                  </div>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => void resetReminderSection()}
                disabled={loading}
              >
                {t('resetSettingsBtn')}
              </Button>
            </CardContent>
          </>
        ) : null}
      </Card>

      <Card className="gap-0 overflow-hidden py-0">
        <SectionHeader
          icon={<IoNotificationsOutline className="size-3.5" />}
          title={t('notificationSettingsTitle')}
          open={notificationOpen}
          onClick={() => {
            const next = !notificationOpen;
            setNotificationOpen(next);
            void saveUiState({ ...uiStateRef.current, notificationOpen: next });
          }}
        />
        {notificationOpen ? (
          <>
            <Separator />
            <CardContent className="space-y-3 py-3">
              <Badge variant={permissionGranted ? 'secondary' : 'destructive'}>{permissionText}</Badge>

              {!permissionGranted ? (
                <Button
                  type="button"
                  className="w-full"
                  variant="outline"
                  onClick={() => void requestPermission()}
                  disabled={loading}
                >
                  {t('requestPermissionBtn')}
                </Button>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="notificationTitle">{t('notificationTitleLabel')}</Label>
                <Input
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
              </div>

              <div className="space-y-2">
                <Label>{t('notificationIconLabel')}</Label>
                <div className="bg-muted/40 flex items-center gap-3 rounded-lg border p-3">
                  <img
                    className="size-10 shrink-0 rounded-md border object-cover"
                    src={settings.notificationIconDataUrl || '/icon/128.png'}
                    alt=""
                  />
                  <Button
                    type="button"
                    className="h-9 min-w-0 flex-1"
                    variant="outline"
                    onClick={() => void openIconSettingsPage()}
                    disabled={loading}
                  >
                    {iconSettingsButtonText}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notificationMessage">{t('notificationMessageLabel')}</Label>
                <Textarea
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
              </div>

              <Button
                type="button"
                className="w-full"
                onClick={() => void testNotification()}
                disabled={loading}
              >
                {t('testNotificationBtn')}
              </Button>

              <div className="space-y-2">
                <Label htmlFor="notificationDisplaySeconds">{t('notificationDisplaySecondsLabel')}</Label>
                <Input
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
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => void resetNotificationSection()}
                disabled={loading}
              >
                {t('resetSettingsBtn')}
              </Button>
            </CardContent>
          </>
        ) : null}
      </Card>
    </main>
  );
}

export default App;
