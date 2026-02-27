import { useEffect, useMemo, useRef, useState } from 'react';
import type { IconType } from 'react-icons';
import { CiTimer } from 'react-icons/ci';
import { CgTimer } from 'react-icons/cg';
import { BiSolidTimer, BiTimer } from 'react-icons/bi';
import { IoIosTimer, IoMdTimer } from 'react-icons/io';
import { IoTimer, IoTimerOutline, IoTimerSharp } from 'react-icons/io5';
import {
  MdAvTimer,
  MdOutlineAvTimer,
  MdOutlineTimer,
  MdOutlineTimer10,
  MdOutlineTimer10Select,
  MdOutlineTimer3,
  MdOutlineTimer3Select,
  MdOutlineTimerOff,
  MdTimer,
  MdTimer10,
  MdTimer10Select,
  MdTimer3,
  MdTimer3Select,
  MdTimerOff,
} from 'react-icons/md';
import { LuTimer, LuTimerOff, LuTimerReset } from 'react-icons/lu';
import { GiHeavyTimer } from 'react-icons/gi';
import {
  RiTimer2Fill,
  RiTimer2Line,
  RiTimerFill,
  RiTimerFlashFill,
  RiTimerFlashLine,
  RiTimerLine,
} from 'react-icons/ri';
import { SiStagetimer } from 'react-icons/si';
import { TfiTimer } from 'react-icons/tfi';
import { RxCountdownTimer, RxLapTimer, RxTimer } from 'react-icons/rx';
import { PiTimer, PiTimerBold, PiTimerDuotone, PiTimerFill, PiTimerLight, PiTimerThin } from 'react-icons/pi';
import { renderToStaticMarkup } from 'react-dom/server';
import './App.css';

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
  notificationDisplaySeconds: 8,
  notificationIconDataUrl: '',
};

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
  const svg = ensureSvgXmlns(renderToStaticMarkup(<Icon size={84} color={fg} />));
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

const builtinIconComponents: IconType[] = [
  CiTimer,
  IoIosTimer,
  IoMdTimer,
  IoTimer,
  IoTimerOutline,
  IoTimerSharp,
  MdAvTimer,
  MdOutlineAvTimer,
  MdOutlineTimer,
  MdOutlineTimer10,
  MdOutlineTimer10Select,
  MdOutlineTimer3,
  MdOutlineTimer3Select,
  MdOutlineTimerOff,
  MdTimer,
  MdTimer10,
  MdTimer10Select,
  MdTimer3,
  MdTimer3Select,
  MdTimerOff,
  LuTimer,
  LuTimerOff,
  LuTimerReset,
  GiHeavyTimer,
  RiTimer2Fill,
  RiTimer2Line,
  RiTimerFill,
  RiTimerFlashFill,
  RiTimerFlashLine,
  RiTimerLine,
  SiStagetimer,
  BiSolidTimer,
  BiTimer,
  CgTimer,
  TfiTimer,
  RxCountdownTimer,
  RxLapTimer,
  RxTimer,
  PiTimer,
  PiTimerBold,
  PiTimerDuotone,
  PiTimerFill,
  PiTimerLight,
  PiTimerThin,
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

  const uiLanguage = useMemo(() => {
    try {
      return browser.i18n.getUILanguage?.() || '';
    } catch {
      return '';
    }
  }, []);

  const text = useMemo(() => {
    if (uiLanguage.startsWith('zh')) {
      return {
        title: '通知图标设置',
        current: '当前图标',
        upload: '上传图片',
        builtins: '内置图标',
        background: '底色',
        backgroundTransparent: '透明底色',
        reset: '使用默认图标',
        test: '测试通知',
        uploadHint: '建议使用清晰的正方形图片',
      };
    }
    return {
      title: 'Notification Icon Settings',
      current: 'Current Icon',
      upload: 'Upload Image',
      builtins: 'Built-in Icons',
      background: 'Background',
      backgroundTransparent: 'Transparent Background',
      reset: 'Use Default Icon',
      test: 'Test Notification',
      uploadHint: 'Square images are recommended',
    };
  }, [uiLanguage]);

  async function saveIcon(notificationIconDataUrl: string, successMessage: string) {
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
      if (uiLanguage.startsWith('zh')) {
        setMessage('保存失败');
      } else {
        setMessage('Save failed');
      }
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
        if (uiLanguage.startsWith('zh')) {
          setMessage('图标读取失败');
        } else {
          setMessage('Icon read failed');
        }
        return;
      }
      const safe = normalizeSettings({
        ...settings,
        notificationIconDataUrl: dataUrl,
      });
      if (!safe.notificationIconDataUrl) {
        if (uiLanguage.startsWith('zh')) {
          setMessage('图标过大或格式不支持');
        } else {
          setMessage('Icon too large or unsupported');
        }
        return;
      }
      await saveIcon(
        safe.notificationIconDataUrl,
        uiLanguage.startsWith('zh') ? '图标已更新' : 'Icon updated',
      );
    } catch {
      if (uiLanguage.startsWith('zh')) {
        setMessage('图标设置失败');
      } else {
        setMessage('Failed to set icon');
      }
    }
  }

  async function onPickBuiltin(Icon: IconType) {
    setMessage('');
    const fg = backgroundTransparent ? '#111827' : getContrastColor(backgroundColor);
    const dataUrl = await iconComponentToPngDataUrl(
      Icon,
      backgroundColor,
      backgroundTransparent,
      fg,
    );
    if (!dataUrl) {
      if (uiLanguage.startsWith('zh')) {
        setMessage('生成内置图标失败');
      } else {
        setMessage('Failed to generate built-in icon');
      }
      return;
    }
    await saveIcon(
      dataUrl,
      uiLanguage.startsWith('zh') ? '已切换为内置图标' : 'Built-in icon applied',
    );
  }

  async function onResetDefault() {
    await saveIcon('', uiLanguage.startsWith('zh') ? '已切换为默认图标' : 'Default icon applied');
  }

  async function onTestNotification() {
    setMessage('');
    const result = (await browser.runtime.sendMessage({ type: 'test-notification' })) as TestNotificationResponse;
    if (result?.ok === false) {
      if (uiLanguage.startsWith('zh')) {
        setMessage('测试通知失败');
      } else {
        setMessage('Test notification failed');
      }
      return;
    }
    if (uiLanguage.startsWith('zh')) {
      setMessage('测试通知已发送');
    } else {
      setMessage('Test notification sent');
    }
  }

  return (
    <main className="page">
      <div className="card">
        <h1>
          <MdTimer className="title-icon" />
          {text.title}
        </h1>

        <section className="section">
          <h2>
            <MdOutlineTimer className="head-icon" />
            {text.current}
          </h2>
          <div className="preview-wrap">
            <img
              className="preview"
              src={settings.notificationIconDataUrl || '/icon/128.png'}
              alt=""
            />
          </div>
        </section>

        <section className="section">
          <h2>
            <BiTimer className="head-icon" />
            {text.upload}
          </h2>
          <p className="hint">{text.uploadHint}</p>
          <div className="row">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={loading || saving}
            >
              {text.upload}
            </button>
            <input
              ref={inputRef}
              className="hidden"
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                e.currentTarget.value = '';
                if (file) void onUpload(file);
              }}
              disabled={loading || saving}
            />
          </div>
        </section>

        <section className="section">
          <h2>
            <PiTimerBold className="head-icon" />
            {text.builtins}
          </h2>
          <div className="bg-controls">
            <label className="bg-color">
              <span>{text.background}</span>
              <input
                type="color"
                value={backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
                disabled={saving}
              />
            </label>
            <label className="bg-transparent">
              <input
                type="checkbox"
                checked={backgroundTransparent}
                onChange={(e) => setBackgroundTransparent(e.target.checked)}
                disabled={saving}
              />
              <span>{text.backgroundTransparent}</span>
            </label>
          </div>
          <div className="builtins">
            {builtinIconComponents.map((Icon, idx) => (
              <button
                type="button"
                key={idx}
                className="builtin-btn"
                onClick={() => void onPickBuiltin(Icon)}
                disabled={loading || saving}
              >
                <span
                  className="builtin-preview"
                  style={{
                    background: backgroundTransparent ? 'transparent' : backgroundColor,
                    border: backgroundTransparent ? '1px solid #d1d5db' : '1px solid transparent',
                  }}
                >
                  <Icon
                    size={34}
                    color={backgroundTransparent ? '#111827' : getContrastColor(backgroundColor)}
                  />
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="section actions">
          <button type="button" onClick={() => void onResetDefault()} disabled={loading || saving}>
            <MdTimerOff className="btn-icon" />
            {text.reset}
          </button>
          <button type="button" onClick={() => void onTestNotification()} disabled={loading || saving}>
            <BiSolidTimer className="btn-icon" />
            {text.test}
          </button>
        </section>

        {message ? <p className="msg">{message}</p> : null}
      </div>
    </main>
  );
}

export default App;
