import { useEffect, useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { IconType } from 'react-icons';
import { BiSolidTimer, BiTimer } from 'react-icons/bi';
import { CgTimer } from 'react-icons/cg';
import { CiTimer } from 'react-icons/ci';
import { GiHeavyTimer } from 'react-icons/gi';
import { IoIosTimer, IoMdTimer } from 'react-icons/io';
import { IoTimer, IoTimerOutline, IoTimerSharp } from 'react-icons/io5';
import { LuTimer, LuTimerOff, LuTimerReset } from 'react-icons/lu';
import {
  MdAvTimer,
  MdOutlineAvTimer,
  MdOutlineTimer,
  MdOutlineTimer3,
  MdOutlineTimer3Select,
  MdOutlineTimer10,
  MdOutlineTimer10Select,
  MdOutlineTimerOff,
  MdTimer,
  MdTimer3,
  MdTimer3Select,
  MdTimer10,
  MdTimer10Select,
  MdTimerOff,
} from 'react-icons/md';
import {
  PiTimer,
  PiTimerBold,
  PiTimerDuotone,
  PiTimerFill,
  PiTimerLight,
  PiTimerThin,
} from 'react-icons/pi';
import {
  RiTimer2Fill,
  RiTimer2Line,
  RiTimerFill,
  RiTimerFlashFill,
  RiTimerFlashLine,
  RiTimerLine,
} from 'react-icons/ri';
import { RxCountdownTimer, RxLapTimer, RxTimer } from 'react-icons/rx';
import { SiStagetimer } from 'react-icons/si';
import { TfiTimer } from 'react-icons/tfi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { t } from '@/lib/i18n';

type ReminderSettings = {
  enabled: boolean;
  intervalMinutes: number;
  notificationTitle: string;
  notificationMessage: string;
  notificationDisplaySeconds: number;
  notificationIconDataUrl: string;
};

type TestNotificationResponse = {
  ok: boolean;
};

const STORAGE_KEY = 'sitless-settings';
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

function normalizeSettings(input: unknown): ReminderSettings {
  const raw = (input ?? {}) as Partial<ReminderSettings>;
  const interval = Number(raw.intervalMinutes);
  const displaySeconds = Number(raw.notificationDisplaySeconds);
  const safeInterval = Number.isFinite(interval)
    ? Math.max(
        MIN_INTERVAL_MINUTES,
        Math.min(MAX_INTERVAL_MINUTES, Math.round(interval * 10) / 10),
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
    iconRaw.startsWith('data:image/') &&
    iconRaw.length <= MAX_ICON_DATA_URL_LENGTH
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

function ensureSvgXmlns(svg: string): string {
  if (svg.includes('xmlns=')) return svg;
  return svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
}

async function iconComponentToPngDataUrl(
  Icon: IconType,
  bg: string,
  transparentBg: boolean,
  fg: string,
): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const svg = ensureSvgXmlns(
    renderToStaticMarkup(<Icon size={84} color={fg} />),
  );
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('icon-render-failed'));
    img.src = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  });
  if (!transparentBg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 128, 128);
  }
  ctx.drawImage(image, 22, 22, 84, 84);
  const pngDataUrl = canvas.toDataURL('image/png');
  if (pngDataUrl.length <= MAX_ICON_DATA_URL_LENGTH) return pngDataUrl;
  return '';
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const cleaned = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return null;
  return {
    r: Number.parseInt(cleaned.slice(0, 2), 16),
    g: Number.parseInt(cleaned.slice(2, 4), 16),
    b: Number.parseInt(cleaned.slice(4, 6), 16),
  };
}

function getContrastColor(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#111827';
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.6 ? '#111827' : '#ffffff';
}

const builtinIcons: { key: string; Icon: IconType }[] = [
  { key: 'CiTimer', Icon: CiTimer },
  { key: 'IoIosTimer', Icon: IoIosTimer },
  { key: 'IoMdTimer', Icon: IoMdTimer },
  { key: 'IoTimer', Icon: IoTimer },
  { key: 'IoTimerOutline', Icon: IoTimerOutline },
  { key: 'IoTimerSharp', Icon: IoTimerSharp },
  { key: 'MdAvTimer', Icon: MdAvTimer },
  { key: 'MdOutlineAvTimer', Icon: MdOutlineAvTimer },
  { key: 'MdOutlineTimer', Icon: MdOutlineTimer },
  { key: 'MdOutlineTimer10', Icon: MdOutlineTimer10 },
  { key: 'MdOutlineTimer10Select', Icon: MdOutlineTimer10Select },
  { key: 'MdOutlineTimer3', Icon: MdOutlineTimer3 },
  { key: 'MdOutlineTimer3Select', Icon: MdOutlineTimer3Select },
  { key: 'MdOutlineTimerOff', Icon: MdOutlineTimerOff },
  { key: 'MdTimer', Icon: MdTimer },
  { key: 'MdTimer10', Icon: MdTimer10 },
  { key: 'MdTimer10Select', Icon: MdTimer10Select },
  { key: 'MdTimer3', Icon: MdTimer3 },
  { key: 'MdTimer3Select', Icon: MdTimer3Select },
  { key: 'MdTimerOff', Icon: MdTimerOff },
  { key: 'LuTimer', Icon: LuTimer },
  { key: 'LuTimerOff', Icon: LuTimerOff },
  { key: 'LuTimerReset', Icon: LuTimerReset },
  { key: 'GiHeavyTimer', Icon: GiHeavyTimer },
  { key: 'RiTimer2Fill', Icon: RiTimer2Fill },
  { key: 'RiTimer2Line', Icon: RiTimer2Line },
  { key: 'RiTimerFill', Icon: RiTimerFill },
  { key: 'RiTimerFlashFill', Icon: RiTimerFlashFill },
  { key: 'RiTimerFlashLine', Icon: RiTimerFlashLine },
  { key: 'RiTimerLine', Icon: RiTimerLine },
  { key: 'SiStagetimer', Icon: SiStagetimer },
  { key: 'BiSolidTimer', Icon: BiSolidTimer },
  { key: 'BiTimer', Icon: BiTimer },
  { key: 'CgTimer', Icon: CgTimer },
  { key: 'TfiTimer', Icon: TfiTimer },
  { key: 'RxCountdownTimer', Icon: RxCountdownTimer },
  { key: 'RxLapTimer', Icon: RxLapTimer },
  { key: 'RxTimer', Icon: RxTimer },
  { key: 'PiTimer', Icon: PiTimer },
  { key: 'PiTimerBold', Icon: PiTimerBold },
  { key: 'PiTimerDuotone', Icon: PiTimerDuotone },
  { key: 'PiTimerFill', Icon: PiTimerFill },
  { key: 'PiTimerLight', Icon: PiTimerLight },
  { key: 'PiTimerThin', Icon: PiTimerThin },
];

function App() {
  const [settings, setSettings] = useState<ReminderSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [backgroundColor, setBackgroundColor] = useState('#1d4ed8');
  const [backgroundTransparent, setBackgroundTransparent] = useState(true);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void browser.storage.local.get(STORAGE_KEY).then((stored) => {
      setSettings(normalizeSettings(stored[STORAGE_KEY]));
      setLoading(false);
    });
  }, []);

  async function saveIcon(
    notificationIconDataUrl: string,
    successMessage: string,
  ) {
    setSaving(true);
    try {
      const stored = await browser.storage.local.get(STORAGE_KEY);
      const current = normalizeSettings(stored[STORAGE_KEY]);
      const next = normalizeSettings({
        ...current,
        notificationIconDataUrl,
      });
      await browser.storage.local.set({ [STORAGE_KEY]: next });
      await browser.runtime.sendMessage({ type: 'sync-reminder' });
      setSettings(next);
      setMessage(successMessage);
    } catch {
      setMessage(t('iconSettingsSaveFailed'));
    } finally {
      setSaving(false);
    }
  }

  async function onUpload(file: File) {
    if (!file) return;
    setMessage('');
    try {
      const dataUrl = await fileToSquareDataUrl(file, 128);
      if (!dataUrl) {
        setMessage(t('iconSettingsIconReadFailed'));
        return;
      }
      const safe = normalizeSettings({
        ...settings,
        notificationIconDataUrl: dataUrl,
      });
      if (!safe.notificationIconDataUrl) {
        setMessage(t('iconSettingsIconTooLargeOrUnsupported'));
        return;
      }
      await saveIcon(safe.notificationIconDataUrl, t('iconSettingsIconUpdated'));
    } catch {
      setMessage(t('iconSettingsFailedToSetIcon'));
    }
  }

  async function onPickBuiltin(Icon: IconType) {
    setMessage('');
    const fg = backgroundTransparent
      ? '#111827'
      : getContrastColor(backgroundColor);
    const dataUrl = await iconComponentToPngDataUrl(
      Icon,
      backgroundColor,
      backgroundTransparent,
      fg,
    );
    if (!dataUrl) {
      setMessage(t('iconSettingsFailedToGenerateBuiltinIcon'));
      return;
    }
    await saveIcon(dataUrl, t('iconSettingsBuiltinIconApplied'));
  }

  async function onResetDefault() {
    await saveIcon('', t('iconSettingsDefaultIconApplied'));
  }

  async function onTestNotification() {
    setMessage('');
    const result = (await browser.runtime.sendMessage({
      type: 'test-notification',
    })) as TestNotificationResponse;
    if (result?.ok === false) {
      setMessage(t('iconSettingsTestNotificationFailed'));
      return;
    }
    setMessage(t('iconSettingsTestNotificationSent'));
  }

  return (
    <main className="min-h-screen bg-muted/30 p-4 md:p-6">
      <Card className="mx-auto max-w-4xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <MdTimer className="size-6" />
            {t('iconSettingsTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MdOutlineTimer className="size-5" />
                {t('iconSettingsCurrentIcon')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <img
                className="size-16 rounded-xl border object-cover"
                src={settings.notificationIconDataUrl || '/icon/128.png'}
                alt=""
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BiTimer className="size-5" />
                {t('iconSettingsUploadImage')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-muted-foreground text-xs">
                {t('iconSettingsUploadHint')}
              </p>
              <Button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={loading || saving}
              >
                {t('iconSettingsUploadImage')}
              </Button>
              <Input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0];
                  e.currentTarget.value = '';
                  if (file) void onUpload(file);
                }}
                disabled={loading || saving}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <PiTimerBold className="size-5" />
                {t('iconSettingsBuiltinIcons')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-4">
                <Label className="gap-3">
                  <span>{t('iconSettingsBackground')}</span>
                  <Input
                    type="color"
                    value={backgroundColor}
                    onChange={(e) => setBackgroundColor(e.target.value)}
                    disabled={saving}
                    className="h-9 w-14 p-1"
                  />
                </Label>
                <Label className="gap-3">
                  <Checkbox
                    checked={backgroundTransparent}
                    onCheckedChange={(checked) => setBackgroundTransparent(checked === true)}
                    disabled={saving}
                  />
                  <span>{t('iconSettingsBackgroundTransparent')}</span>
                </Label>
              </div>
              <div className="grid max-h-[160px] grid-cols-5 gap-2 overflow-y-auto pr-1 sm:grid-cols-6 md:grid-cols-8">
                {builtinIcons.map(({ key, Icon }, idx) => (
                  <Button
                    type="button"
                    key={key}
                    variant="outline"
                    className="h-12 w-12 p-0"
                    onClick={() => void onPickBuiltin(Icon)}
                    disabled={loading || saving}
                    aria-label={`icon-${idx + 1}`}
                  >
                    <span
                      className="inline-flex size-8 items-center justify-center rounded-md"
                      style={{
                        background: backgroundTransparent
                          ? 'transparent'
                          : backgroundColor,
                        border: backgroundTransparent
                          ? '1px solid #d1d5db'
                          : '1px solid transparent',
                      }}
                    >
                      <Icon
                        size={20}
                        color={
                          backgroundTransparent
                            ? '#111827'
                          : getContrastColor(backgroundColor)
                        }
                      />
                    </span>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => void onResetDefault()}
              disabled={loading || saving}
            >
              <MdTimerOff className="size-4" />
              {t('iconSettingsReset')}
            </Button>
            <Button
              type="button"
              onClick={() => void onTestNotification()}
              disabled={loading || saving}
            >
              <BiSolidTimer className="size-4" />
              {t('iconSettingsTest')}
            </Button>
          </div>

          {message ? <p className="text-sm">{message}</p> : null}
        </CardContent>
      </Card>
    </main>
  );
}

export default App;
