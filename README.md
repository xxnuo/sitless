[简体中文](./README.zh-CN.md)

<div align="center">
  <img src="./assets/marquee.png" alt="Sit Less" width="720" />
  <h1>Sit Less</h1>
  <p>An browser extension that helps you break long sitting sessions with simple, customizable reminders.</p>
</div>

## Highlights

- English-first UI with Chinese support (`zh_CN`, `zh_TW`)
- Adjustable reminder interval from 6 seconds to 3 hours
- Quick enable or pause control from the popup
- Custom notification title, message, and display duration
- Dedicated icon settings page with image upload and built-in timer icons
- Local-first storage with no backend, account system, or external network requests
- Shared codebase for Chromium and Firefox builds

## How It Works

- The popup stores reminder settings in `browser.storage.local`
- The background script re-syncs timers whenever settings change
- Intervals of 1 minute or more use `browser.alarms`
- Intervals below 1 minute use a timer fallback in the background script
- Notifications auto-close after the configured display time
- Empty notification title or message fields fall back to localized defaults

## Permissions and Privacy

- `alarms` schedules reminders
- `storage` saves reminder preferences locally
- `notifications` shows reminder messages
- Firefox build metadata declares no data collection permissions
- The extension does not send data to external services

## Project Structure

| Path | Purpose |
| --- | --- |
| `entrypoints/background.ts` | Reminder scheduling and notification delivery |
| `entrypoints/popup/` | Popup UI for reminder and notification settings |
| `entrypoints/icon-settings/` | Full-page notification icon configuration |
| `public/_locales/` | Extension locale bundles |
| `public/icon/` | Packaged extension icons |
| `wxt.config.ts` | WXT config and manifest fields |

## Quick Start

### Requirements

- Node.js
- `pnpm`

### Install dependencies

```bash
pnpm install
```

### Run in development

```bash
pnpm dev
```

For Firefox:

```bash
pnpm dev:firefox
```

### Type check

```bash
pnpm compile
```

## Build and Package

Build unpacked output:

```bash
pnpm build
pnpm build:firefox
```

Create zip packages:

```bash
pnpm zip
pnpm zip:firefox
```

Generated files are written to `.output/`, including:

- Chromium: `.output/chrome-mv3` and `.output/chrome-mv3-dev`
- Firefox: `.output/firefox-mv2` and `.output/firefox-mv2-dev`

## Load the Extension

### Chromium browsers

1. Run `pnpm dev` or `pnpm build`
2. Open `chrome://extensions`
3. Enable Developer mode
4. Click Load unpacked
5. Select `.output/chrome-mv3-dev` or `.output/chrome-mv3`

### Firefox

1. Run `pnpm dev:firefox` or `pnpm build:firefox`
2. Open `about:debugging#/runtime/this-firefox`
3. Click Load Temporary Add-on
4. Select `.output/firefox-mv2-dev/manifest.json` or `.output/firefox-mv2/manifest.json`

## Customization

- Reminder interval: 6 seconds to 3 hours
- Notification display time: 1 to 300 seconds
- Title and message can be customized or left empty for defaults
- Notification icon can use the packaged default icon
- You can upload an image, which is cropped to a square and converted to a notification-friendly size
- You can also generate a built-in timer icon with a transparent or colored background

## Tech Stack

- WXT
- React
- TypeScript
- Tailwind CSS
