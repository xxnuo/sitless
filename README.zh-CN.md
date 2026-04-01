[English](./README.md)

<div align="center">
  <img src="./assets/marquee.png" alt="Sit Less" width="720" />
  <h1>Sit Less</h1>
  <p>一个浏览器扩展，用简洁可配置的提醒帮助你减少久坐。</p>
</div>

## 功能特点

- 提醒间隔可在 6 秒到 3 小时之间调整
- 可在弹窗中快速开启或暂停提醒
- 可自定义通知标题、内容和显示时长
- 提供独立的图标设置页，支持上传图片和内置计时器图标
- 本地存储配置，无后端、无账号、无外部网络请求
- 同一套代码同时构建 Chromium 和 Firefox 版本

## 工作方式

- 弹窗中的设置会保存到 `browser.storage.local`
- 后台脚本会在配置变化后自动同步提醒计时
- 1 分钟及以上的提醒使用 `browser.alarms`
- 小于 1 分钟的提醒使用后台定时器兜底
- 通知会在设定的显示时长后自动关闭
- 标题或内容留空时，会回退到内置文案

## 权限与隐私

- `alarms`：用于安排提醒
- `storage`：用于本地保存设置
- `notifications`：用于显示提醒通知
- Firefox 构建已声明不采集数据
- 扩展不会向外部服务发送数据

## 项目结构

| 路径 | 作用 |
| --- | --- |
| `entrypoints/background.ts` | 提醒调度与通知发送 |
| `entrypoints/popup/` | 弹窗设置界面 |
| `entrypoints/icon-settings/` | 通知图标设置页 |
| `public/_locales/` | 扩展多语言文案 |
| `public/icon/` | 扩展图标资源 |
| `wxt.config.ts` | WXT 配置与 manifest 字段 |

## 快速开始

### 环境要求

- Node.js
- `pnpm`

### 安装依赖

```bash
pnpm install
```

### 开发模式

```bash
pnpm dev
```

Firefox:

```bash
pnpm dev:firefox
```

### 类型检查

```bash
pnpm compile
```

## 构建与打包

生成可加载的构建产物：

```bash
pnpm build
pnpm build:firefox
```

生成 zip 包：

```bash
pnpm zip
pnpm zip:firefox
```

产物会输出到 `.output/`，包括：

- Chromium：`.output/chrome-mv3` 与 `.output/chrome-mv3-dev`
- Firefox：`.output/firefox-mv2` 与 `.output/firefox-mv2-dev`

## 加载扩展

### Chromium 浏览器

1. 运行 `pnpm dev` 或 `pnpm build`
2. 打开 `chrome://extensions`
3. 开启开发者模式
4. 点击 Load unpacked
5. 选择 `.output/chrome-mv3-dev` 或 `.output/chrome-mv3`

### Firefox

1. 运行 `pnpm dev:firefox` 或 `pnpm build:firefox`
2. 打开 `about:debugging#/runtime/this-firefox`
3. 点击 Load Temporary Add-on
4. 选择 `.output/firefox-mv2-dev/manifest.json` 或 `.output/firefox-mv2/manifest.json`

## 可配置项

- 提醒间隔：6 秒到 3 小时
- 通知显示时长：1 到 300 秒
- 通知标题和内容可自定义，也可留空使用默认文案
- 通知图标可使用扩展默认图标
- 可上传图片，系统会裁成正方形并转换为适合通知的尺寸
- 也可使用内置计时器图标，并选择透明或纯色背景

## 技术栈

- WXT
- React
- TypeScript
- Tailwind CSS
