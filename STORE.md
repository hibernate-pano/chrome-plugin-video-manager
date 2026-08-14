# Chrome Web Store Listing

适用于当前版本的商店发布文案。内容必须与实际功能一致，不得继续沿用旧的 Pro/付费/云同步描述。

## Short Description

Minimal video speed shortcuts, presets and page fullscreen for HTML5 video.

## Detailed Description

Video Speed Controller 是一个轻量、直接、可配置的 HTML5 视频控制扩展。

它专注于三件事：

- 用键盘快捷键调整播放速度
- 用数字键直达常用速度档位
- 将网页里的视频切换到网页全屏模式

### 核心功能

- 自动选择当前页面最合适的 `video` 元素
- 快捷键加速、减速、重置播放速度
- **数字键 `1`-`4` 直达预设档位**（默认 1.25x / 1.5x / 1.75x / 2.0x，可在设置页自定义）
- **空格键切换播放/暂停**（网页全屏内外行为一致，可在设置页关闭）
- **站点速度记忆**：刷新或重新打开页面时，自动恢复该网站上次使用的播放速度（可关闭）
- **最大速度上限**：默认 4x 可配置，防止长按冲过头
- **悬停指示器**：鼠标悬停视频时显示当前受控对象与实时速度，点击视频即锁定
- **工具栏 Popup**：查看当前速度与播放状态、一键重置、开关本站速度记忆
- 工具栏图标显示当前播放速度（badge）
- 网页全屏切换；全屏内 `Escape` 退出、`Space` 播放/暂停、`ArrowLeft` / `ArrowRight` 快退快进 5 秒
- 设置页支持自定义快捷键、预设速度、最大速度与空格开关，界面支持中/英/日/韩
- 设置变更后，已打开页面可自动热更新

### 默认快捷键

- Increase speed: `=`
- Decrease speed: `-`
- Reset speed: `0`
- Page fullscreen: `f`
- Preset speeds: `1` `2` `3` `4`
- Play / Pause: `Space`

### 适用范围

- 适用于大多数标准 HTML5 视频站点
- 不依赖特定视频网站
- 不控制 `audio`
- 跨域 iframe 内的视频可能无法直接接管

### 隐私说明

- 扩展不收集个人数据
- 设置保存在浏览器本地存储中
- 扩展只在页面中查找和控制视频元素

## Release Notes 5.2.0

- Added per-site speed memory: the speed you use on a site is restored after refresh (toggleable, clearable)
- Added a configurable maximum speed cap (default 4x) to prevent overshooting while holding a key
- Added a hover indicator showing which video is controlled and its current speed; click a video to lock it
- Added a toolbar popup with current speed, one-click reset and per-site memory toggle
- Localized the settings page and popup (简体中文 / English / 日本語 / 한국어)
- Fixed assigning the Space key as a custom shortcut being reset to empty
