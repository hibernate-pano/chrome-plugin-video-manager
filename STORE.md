# Chrome Web Store Listing

适用于 **v6** 的商店发布文案。**内容必须与实际功能一致**，不得沿用旧的 Popup / 预设 / Pro / 云同步描述。

## 字段硬性限制（改之前先看这里）

| 字段 | 上限 | 必填 | 说明 |
|---|---|---|---|
| 名称（商店标题） | 75 字符 | 是 | 见文末「标题决策」，改名影响搜索与审核 |
| 简短说明 / Summary | **132 字符** | 是 | 留空会被拒 |
| 详细说明 | 约 16,000 字符（dashboard 实测，官方未给数字） | 是 | 纯文本，每语言独立 |
| 截图 | 1–5 张 | 至少 1 张 | **必须 1280×800 或 640×400**，可每语言独立 |
| small promo tile | 1 张 | 是 | 440×280，不可本地化；缺失会被降权排序 |
| marquee | 1 张 | 否 | 1400×560，缺失则不会被 marquee 推荐 |

**红线（违反会拒审或降权）**：
- 描述必须准确 —— 现在线上还写着 `presets`，而 v6 已删除该功能，属高概率拒审项
- 不得罗列站点/品牌关键词（YouTube / Bilibili / Netflix 清单式列举会被判 keyword spam）
- 不得提及同类或竞品扩展
- 不得写「支持所有网站」「无广告」这类绝对化表述（DRM 与跨域 iframe 明确不支持）
- `<all_urls>` 权限必须在 Privacy 标签逐条写理由；本地存储的 hostname / 速度也需披露

> **隐私措辞必须与实际存储位置一致**（已核实代码）：快捷键设置走 `chrome.storage.sync`
> （随 Chrome 账号同步），站点速度走 `chrome.storage.local`（仅本地）。
> 开发者本身接收不到任何数据，但不能写成「全部存在本地」或「什么都不发送」。

---

## Short Description

**英文（132 字符上限）**

```
Turn HTML5 video into a clean fullscreen player, with an auto-hiding control bar and shortcuts you can rebind.
```

**中文**

```
把网页视频变成干净的全屏播放器：会自动隐藏的极简控制条，7 个快捷键全部可改绑。
```

> 旧文案的问题是还在写 `presets`（v6 已删）和「四个快捷键」（v6 是七个），且完全没提全屏控制条。

---

## Detailed Description

### 英文（主）

```
Video Speed Controller turns any HTML5 video into a clean, fullscreen player, and gives you quiet keyboard control over playback.

Most sites bury their fullscreen button, and once you get there you are stuck with their overlay. This extension puts a clean playback layer on top of the page instead, then stays out of your way.

PAGE FULLSCREEN
- Press f to fill the viewport with the video you are actually watching; f or Esc leaves
- Your page layout is fully restored on exit
- A minimal control bar appears when you move the mouse and fades out after 3 seconds of stillness: play/pause, draggable progress, time, volume, current speed, exit
- The extension picks the right video for you, scoring playing, visible, in-viewport and largest

PLAYBACK SPEED
- = speeds up, - slows down, in 0.1x steps; hold either key to keep stepping
- 0 resets to 1.0x
- A small "1.5x" capsule fades in for about a second, so you see the change without anything staying on screen
- Your speed is remembered per site and restored when you come back

PLAYBACK CONTROL
- Space plays or pauses
- Left and Right arrows skip back or forward 5 seconds

SHORTCUTS YOU CONTROL
All seven actions can be rebound on the options page, and any of them can be left empty to disable it. Duplicate bindings are caught before you save, and shortcuts the browser reserves are flagged.

DEFAULT SHORTCUTS
  =        Increase speed
  -        Decrease speed
  0        Reset speed
  Space    Play / pause
  Left     Back 5 seconds
  Right    Forward 5 seconds
  f        Page fullscreen

The toolbar icon toggles page fullscreen for the current tab. The options page is available in English and Simplified Chinese.

SCOPE
- Controls video elements only, not audio
- Videos inside cross-origin frames cannot be controlled directly
- DRM-protected video is protected by the browser and cannot be taken over
- Sites that rebuild their DOM aggressively may fall back to a simpler layout mode

PRIVACY
- The developer collects and receives no data at all
- Your shortcut settings are stored in Chrome's synced extension storage, so they follow your Chrome profile; per-site playback speed is stored in your browser's local storage
- The extension only looks for and controls video elements on the pages you visit
```

### 中文

```
Video Speed Controller 把网页里的 HTML5 视频变成一个干净的全屏播放器，并提供一组安静的键盘控制。

大多数网站把全屏按钮藏得很深，进去之后又只能忍受它自己的浮层。这个扩展改在页面之上叠一层干净的播放层，然后就退到一边。

网页全屏
- 按 f 把「你正在看的那个视频」铺满视口，再按 f 或 Esc 退出
- 退出时页面布局完整还原
- 鼠标移动时浮现一条极简控制条，静止 3 秒后自动淡出：播放/暂停、可拖动进度、时间、音量、当前速度、退出
- 自动选出最合适的视频（播放中 > 可见 > 在视口 > 面积最大）

播放速度
- = 加速、- 减速，步长 0.1x；按住任一键可连续调速
- 0 重置回 1.0x
- 调速时角落淡入一个 1.5x 小胶囊，约 1 秒后消失，看完即走
- 按站点记住速度，下次回到该站点自动恢复

播放控制
- Space 播放 / 暂停
- ← / → 后退 / 前进 5 秒

快捷键由你决定
7 个动作全部可在设置页改绑，留空即禁用该动作。重复绑定会在保存前被拦下，与浏览器保留键冲突的绑定会被标出。

默认快捷键
  =        加速
  -        减速
  0        重置速度
  Space    播放 / 暂停
  ←        后退 5 秒
  →        前进 5 秒
  f        网页全屏

点击工具栏图标 = 切换当前标签页的网页全屏。设置页支持简体中文与 English。

适用范围
- 只控制 video 元素，不控制 audio
- 跨域 iframe 内的视频无法直接接管
- DRM 视频（如流媒体平台的受保护内容）受浏览器保护，无法接管
- 极少数强依赖原始 DOM 位置的站点会退回更简单的布局模式

隐私
- 开发者不收集、也接收不到任何数据
- 快捷键设置保存在 Chrome 的同步扩展存储中（跟随你的 Chrome 账号）；站点速度保存在浏览器本地存储中
- 扩展只在页面上查找并控制视频元素
```

---

## Privacy 标签文案（权限理由）

商店要求对每一项权限给出理由。本扩展只有 `storage` 与 `<all_urls>`，建议如下（英文）：

```
storage
  Stores your shortcut bindings (synced extension storage) and your per-site playback
  speed (local storage). Nothing is sent to the developer.

<all_urls>
  The extension must find and control the <video> element on whatever page you are
  watching, because video playback is not tied to any specific site. It reads only
  video elements and their playback state. It does not read page content, form data,
  or your browsing history, and nothing leaves your browser.
```

数据披露：勾选「本地存储」（本地/同步扩展存储），**不要**勾选任何数据收集或出售项。

---

## 截图方案

现有 4 张素材的问题（已实测）：`store-options.png` 是 **900×820，尺寸不合规、无法上架**；其余三张尺寸合规但**全是中文、无品牌叠加、首图看不出「网页全屏」这个核心差异点**。

推荐 5 张，全部 1280×800，英文文案，每张叠加一句标题：

| # | 内容 | 叠加文案 |
|---|---|---|
| 1 | 网页全屏态：真实页面内容铺满 + 底部控制条 | Watch any web video fullscreen |
| 2 | 控制条特写（放大/框选），体现自动隐藏 | Auto-hiding controls, out of your way |
| 3 | 调速小胶囊放大到可读，带页面语境 | Fine-tune speed in 0.1x steps |
| 4 | 设置页 7 行改绑表（切英文 locale） | 7 shortcuts you can rebind |
| 5 | 站点速度记忆示意 | Your speed, remembered per site |

首图必须放核心差异点（全屏控制条），否则和浏览器原生全屏没有区分度。

small promo tile（440×280）现在只有图标、无文字，需加上 wordmark 与英文 tagline。

生成脚本 `scripts/generate-store-assets.mjs` 里 options 截图的 viewport 硬编码为 900×820，**必须改成 1280×800**。

---

## Release Notes 6.0.3

- Fixed: no longer shows an error on pages without a document body (e.g. SVG documents that embed a video)
- Fixed: typing in an input inside a web component no longer gets swallowed by the shortcuts
- Fixed: invisible videos are no longer treated as the video you are watching
- Fixed: the speed toast now appears next to the video even when the video is inside an embedded frame
- Fixed: the extension recovers its own styles if the page removes them

## Release Notes 6.0.2

- Internal: CI now runs on Node 24 (Active LTS) with the current GitHub Actions majors
- Internal: removed stale branches; the extension itself is unchanged from 6.0.1

## Release Notes 6.0.1

- Fixed: the last speed change is no longer lost when you refresh or close the tab within a second of changing it
- Fixed: page fullscreen now falls back cleanly instead of erroring when the page rearranges its DOM mid-fullscreen
- Fixed: no longer performs a pointless storage write on every page load
- Internal: removed dead code and corrected documentation; the extension itself is unchanged

## Release Notes 6.0.0

- New: a minimal on-screen control bar in page fullscreen (play/pause, seekable progress, time, volume, current speed, exit) that auto-hides after 3s of idle
- New: a one-second speed toast in the corner when you change speed outside fullscreen
- New: all 7 actions are rebindable in the options page; leave a field empty to disable an action
- Removed: toolbar popup, icon badge, digit presets, max-speed cap, animated speed HUD and hover indicator
- Fixed: page fullscreen no longer gets stuck when the page rearranges the DOM while fullscreen is active
- Localization trimmed to Simplified Chinese and English

---

## 标题：已定，保持 `Video Speed Controller`

**决定（2026-10-04）：不改名。** 理由：改动最小，不涉及 `manifest.json`，不用重新出包，保住精确关键词搜索。

需要知道的代价与事实：
- 商店里已有 **3 个逐字同名**的扩展（其中 iglupo 那个约 300 万用户）。政策**没有**禁止同名，同名能上架；官方 best-listing 只把「避免与已有扩展相似的标题」列为建议而非规则。
- 因此真正的风险不是「能不能上架」，而是用户/审核可能认为在刻意混淆。**不要**在图标、截图风格、文案上继续靠近竞品。
- 扩展 ID 由公钥派生、与名称无关 —— 即使将来改名，已安装用户与自动更新也不受影响。但名称写在 `manifest.json` 里，改名需要出新包并重新过审，不能只改 listing。

分类建议：**Functionality & UI**（次选 Entertainment）。

---

## 发布流程

出包全部在本地完成（CI 不再做 release）。按顺序执行：

1. `pnpm icons` —— 重绘图标
2. `pnpm store:assets` —— 生成商店截图
3. `pnpm build:ext` —— 构建并打出 zip 到 `release/`
4. `pnpm store:auth` / `pnpm store:publish` —— 上传到 Chrome Web Store

> ⚠️ **Chrome Web Store API v1.1 将于 2026-10-15 停止支持**，而 v2 **没有** listing metadata 接口
> （v2 只有 upload / publish / cancel / status / deploy-percentage）。该日期之后，改名、改描述、
> 换截图只能走 Developer Dashboard。`scripts/store-publish.mjs` 目前用的是 v1.1 端点。

版本号约定见 [.memory/version-bump-not-force-tag.md](./.memory/version-bump-not-force-tag.md)：bump version → commit → 打新 tag `vX.Y.Z` → push，绝不 force 移动已存在的 tag。
