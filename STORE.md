# Chrome Web Store Listing

适用于当前版本（v6）的商店发布文案。内容必须与实际功能一致，不得沿用旧的 Popup / 预设 / Pro / 云同步描述。

## Short Description

A clean page-fullscreen player with minimal speed and playback shortcuts for any HTML5 video.

## Detailed Description

Video Speed Controller 是一个极简的网页视频工具。它把任意网页里的视频变成一个干净、可控的全屏播放器，并提供一组不打扰的播放快捷键。

它专注于三件事：

- 网页全屏：把视频铺满视口，配一条会自动隐藏的极简控制条
- 播放速度：快捷键加速 / 减速 / 重置
- 播放控制：播放/暂停、快进快退

### 核心功能

- 自动选择当前页面最合适的 `video` 元素（播放中 > 可见 > 在视口 > 面积）
- 网页全屏：`f` 进入/退出，`Escape` 退出；退出时完整还原页面布局
- 全屏控制条：播放/暂停、进度（可拖）、时间、音量、当前速度、退出；鼠标静止 3 秒自动隐藏
- 播放速度：`=` 加速 / `-` 减速（+0.1，长按连续）/ `0` 重置
- 播放控制：`Space` 播放/暂停、`←`/`→` 快退/快进 5 秒
- 全屏外调速时，视频角落淡入一个 `1.5x` 小胶囊，约 1 秒后消失
- 站点速度记忆：刷新或重新打开页面时自动恢复该网站上次的速度（默认开启，无界面）
- 快捷键自定义：7 个动作全部可在设置页改绑，留空即禁用
- 点击工具栏图标 = 切换当前标签页的网页全屏
- 设置页支持 简体中文 / English

### 默认快捷键

- Increase speed: `=`
- Decrease speed: `-`
- Reset speed: `0`
- Play / Pause: `Space`
- Back 5s: `←`
- Forward 5s: `→`
- Page fullscreen: `f`

### 适用范围

- 适用于大多数标准 HTML5 视频站点
- 不依赖特定视频网站
- 不控制 `audio`
- 跨域 iframe 内的视频可能无法直接接管
- DRM 视频（如 Netflix）受浏览器保护，无法接管

### 隐私说明

- 扩展不收集个人数据
- 设置与站点速度记忆保存在浏览器本地存储中
- 扩展只在页面中查找和控制视频元素

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

## 发布流程

出包全部在本地完成（CI 不再做 release）。按顺序执行：

1. `pnpm icons` —— 重绘图标
2. `pnpm store:assets` —— 生成商店截图
3. `pnpm build:ext` —— 构建并打出 zip 到 `release/`
4. `pnpm store:auth` / `pnpm store:publish` —— 上传到 Chrome Web Store

版本号约定见 [.memory/version-bump-not-force-tag.md](./.memory/version-bump-not-force-tag.md)：bump version → commit → 打新 tag `vX.Y.Z` → push，绝不 force 移动已存在的 tag。
