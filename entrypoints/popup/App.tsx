import { useEffect, useMemo, useState } from 'react';
import './App.css';

type ReminderSettings = {
  enabled: boolean;
  intervalMinutes: number;
};

const STORAGE_KEY = 'sitless-settings';
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

function App() {
  const [settings, setSettings] = useState<ReminderSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    chrome.storage.local.get(STORAGE_KEY).then((stored) => {
      if (!active) return;
      const next = normalizeSettings(stored[STORAGE_KEY]);
      setSettings(next);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  const statusText = useMemo(() => {
    if (!settings.enabled) return '已暂停';
    return `每 ${settings.intervalMinutes} 分钟提醒一次`;
  }, [settings]);

  async function save(next: ReminderSettings) {
    const safe = normalizeSettings(next);
    setSettings(safe);
    await chrome.storage.local.set({ [STORAGE_KEY]: safe });
    await chrome.runtime.sendMessage({ type: 'sync-reminder' });
  }

  return (
    <main className="popup">
      <h1>SitLess</h1>
      <p className="status">{statusText}</p>

      <label className="row" htmlFor="enabled">
        <span>提醒开关</span>
        <input
          id="enabled"
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => void save({ ...settings, enabled: e.target.checked })}
          disabled={loading}
        />
      </label>

      <label className="column" htmlFor="interval">
        <span>提醒间隔（分钟）</span>
        <input
          id="interval"
          type="range"
          min={10}
          max={180}
          step={5}
          value={settings.intervalMinutes}
          onChange={(e) =>
            void save({ ...settings, intervalMinutes: Number(e.target.value) })
          }
          disabled={loading || !settings.enabled}
        />
        <strong>{settings.intervalMinutes}</strong>
      </label>
    </main>
  );
}

export default App;
