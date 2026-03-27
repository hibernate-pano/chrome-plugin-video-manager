# 架构文档：v4 Runtime Rewrite

本文档描述当前代码库的真实结构。项目已经从“旧版原生 JS + 新版 React 壳”过渡到以运行时会话为核心的实现。

## 目标

核心目标不是提供大量外围功能，而是把这五条主路径稳定下来：

- 目标媒体选择
- 播放控制
- 网页全屏
- 快捷键接管
- 设置持久化

## 架构总览

```text
Keyboard / Pointer Events
        |
        v
KeyboardHandler
        |
        v
ActiveMediaSession
   |        |         |
   |        |         +--> LightboxManager
   |        +------------> PlaybackController
   +---------------------> MediaDetector
        |
        v
Zustand Stores (session projection + settings)
        |
        v
React UI (HUD / Lightbox Controls / Options)
```

## 关键模块

### `ActiveMediaSession`

文件：`src/core/activeMediaSession.ts`

职责：

- 持有当前目标 `HTMLMediaElement`
- 负责 attach / detach 媒体事件
- 输出标准化会话状态到 `mediaStore`
- 为 UI 和键盘控制提供统一的动作入口

这是当前内容脚本里的唯一事实源。UI 不直接修改 media element，必须经由 session。

### `MediaDetector`

文件：`src/core/mediaDetector.ts`

职责：

- 扫描普通 DOM、开放 Shadow DOM、同源 iframe 内的媒体
- 跟踪最近交互媒体
- 根据优先级给候选媒体打分

当前优先级：

1. 当前处于网页全屏的媒体
2. 最近交互媒体
3. 正在播放且可见的最大媒体
4. 可见的最大媒体
5. 第一个可控制媒体

### `LightboxManager`

文件：`src/core/lightboxManager.ts`

职责：

- 管理网页全屏 overlay 生命周期
- 优先以 reparent 模式接管原始 `video`
- 对不适合 reparent 的站点退回 CSS cover 模式
- 负责恢复原父节点、兄弟节点、内联样式和 controls 状态

### `PlaybackController`

文件：`src/core/playbackController.ts`

职责：

- 速度、音量、静音、播放暂停、快进快退
- 做边界裁剪和数值归一化

### `KeyboardHandler`

文件：`src/core/keyboardHandler.ts`

职责：

- 统一处理所有插件快捷键
- 忽略 input / textarea / contenteditable
- 管理双击重置、长按重复、数字键百分比跳转
- 只通过 `ActiveMediaSession` 调用动作

## 站点适配

文件：`src/core/siteAdapters.ts`

当前提供三个 adapter：

- `genericAdapter`
- `youtubeAdapter`
- `bilibiliAdapter`

Adapter 只做这几件事：

- 识别站点
- 提供站点偏好的媒体选择器
- 声明是否允许 reparent
- 进入 / 退出网页全屏前后做最小站点处理

## 状态管理

### `mediaStore`

只保存当前会话的投影：

- `mediaKind`
- `isPlaying`
- `playbackRate`
- `volume`
- `isMuted`
- `currentTime`
- `duration`
- `isInLightbox`
- `canFullscreen`

### `settingsStore`

负责：

- 快捷键持久化
- 速度预设管理
- 快捷键值归一化

### `uiStore`

只负责 HUD 的显示和超时隐藏。

## UI 层

### Content Script

文件：

- `src/content.tsx`
- `src/components/ContentApp.tsx`
- `src/components/HUD/*`
- `src/components/Lightbox/*`

说明：

- `ContentApp` 负责启动 session 和 keyboard handler
- Lightbox 控件通过 portal 渲染到真实 overlay
- HUD 只展示动作回执，不参与业务决策

### Options Page

文件：

- `src/options.tsx`
- `src/components/OptionsPage.tsx`
- `src/components/Settings/ShortcutEditor.tsx`

说明：

- 快捷键编辑器使用真实按键捕获
- 设置页只写入 `settingsStore`

## 构建与测试

### Build

- Vite 输出 `content.js`、`options.js`、`globals.css`
- `scripts/copy-assets.js` 复制 `manifest`、icons 和 locale 资源
- 扩展加载目录为 `dist/`

### Test

配置文件：`vitest.config.ts`

当前保留的是运行时核心的最小回归测试：

- `playbackController.test.ts`
- `mediaDetector.test.ts`
- `lightboxManager.test.ts`
- `keyboardHandler.test.ts`

旧 `tests/` 目录中的 Jest / Playwright 用例当前不参与新测试入口。

## 当前非目标

这些能力目前明确不在主线里：

- 旧版书签 / 历史 / 云同步 / 手势控制
- Firefox / Edge 兼容
- 多站点深度 UI 定制
- 后台服务与复杂消息总线
