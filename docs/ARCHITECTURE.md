# 架构文档

本文档描述当前代码库的真实结构。

## 目标

当前实现聚焦七条主路径：

- 目标视频选择与受控对象可见性（悬停指示器）
- 播放速度控制（快捷键 + 数字键预设档位 + 最大速度上限）
- 全局播放/暂停（空格键）
- 站点速度记忆（刷新自动恢复）
- 网页全屏
- 设置持久化与状态可见性（工具栏 badge + Popup）
- 国际化（`_locales` + `chrome.i18n`）

## 模块总览

```text
Content Script
  └── ContentRuntime
      ├── VideoRegistry
      ├── KeyboardController
      ├── FullscreenController
      └── SpeedHud

Background (service worker)
  └── badge 更新（响应 content script 的速度消息）

Popup
  └── 当前速度 / 一键重置 / 本站记忆开关 / 快捷键速查

Options Page
  └── shortcuts + presets + space toggle + max speed + memory + i18n

Shared
  ├── shortcuts
  ├── settings
  ├── i18n
  └── types
```

## 内容脚本

### `ContentRuntime`

文件：`src/content/runtime.ts`

职责：

- 安装运行时样式
- 加载设置，失败时回退默认配置
- 启动视频注册表和键盘控制器
- 订阅设置变化并热更新
- 监听 `ratechange` 事件，把当前速度上报给 background 更新 badge，并同步进站点记忆
- 监听 `play` 事件，应用站点记忆速度
- 响应 popup 消息（查询状态 / 重置速度）

### `VideoRegistry`

文件：`src/content/videoRegistry.ts`

职责：

- 扫描普通 DOM、开放 Shadow DOM、同源 iframe 中的 `video`
- 记录最近交互的视频
- 根据“最近交互 / 正在播放 / 可见性 / 尺寸”打分选主

### `KeyboardController`

文件：`src/content/keyboardController.ts`

职责：

- 拦截扩展快捷键
- 忽略输入框、文本域、可编辑区域
- 数字键 `1`-`9` 直达预设档位（自定义快捷键优先）
- 空格键全局切换播放/暂停（可关闭；全屏模式下始终生效）
- 在网页全屏模式下接管 `Escape`、`ArrowLeft`、`ArrowRight`、`Space`
- 处理速度长按重复

### `SiteSpeedMemory`

文件：`src/content/siteSpeedMemory.ts`

职责：

- 按 hostname 记住播放速度（storage.local，不占 sync 配额）
- 页面刷新/重开时，在 `play` 事件上自动恢复（仅当当前速度为 1x，绝不与用户/站点显式设置冲突）
- 支持全局开关、按站点禁用（popup/设置页写入，跨上下文热同步）
- 写入防抖 800ms；1x 视为"无记忆"自动清除

### `TargetIndicator`

文件：`src/content/targetIndicator.ts`

职责：

- 悬停任意视频时显示"VSC 将控制此视频"角标与内描边
- 当前受控对象显示实时速度；点击视频（registry 记录交互）后即时更新
- 跟随视频位置，滚动/缩放时重定位

### `FullscreenController`

文件：`src/content/fullscreenController.ts`

职责：

- 管理网页全屏 overlay 生命周期
- 优先尝试 reparent 原始 `video`
- 检测 reparent 失败后退回 CSS cover
- 恢复原父节点、内联样式、controls 和 body overflow

### `SpeedHud`

文件：`src/content/speedHud.ts`

职责：

- 极简大数字 + 趋势箭头展示速度变化
- 播放/暂停时展示状态字形与当前速度
- 跟随当前视频定位，自动消失

## 设置与共享逻辑

### `shortcuts`

文件：`src/shared/shortcuts.ts`

职责：

- 规范化快捷键字符串
- 将 `KeyboardEvent` 转成快捷键定义
- 做匹配和浏览器保留快捷键检测

### `settings`

文件：`src/shared/settings.ts`

职责：

- 从 `chrome.storage.sync` 读取 / 写入设置（快捷键、预设速度、空格开关）
- 兼容旧版快捷键字段，为新字段提供默认值
- 在 storage API 失败时抛出明确错误
- 订阅设置变化

## 站点适配

文件：`src/content/siteAdapters.ts`

当前只保留三类适配：

- `generic`
- `youtube`
- `bilibili`

适配器只负责：

- 指定优先选择器
- 声明是否适合尝试 reparent

## 非目标

这些能力当前不在实现范围内：

- `audio` 控制
- 音量 / 静音 / 书签 / 历史 / 云同步
- React UI、Zustand 状态层
- 多站点深度 UI 定制
