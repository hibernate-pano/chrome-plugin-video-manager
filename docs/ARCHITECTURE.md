# 架构文档

本文档描述当前代码库（v6）的真实结构。

## 目标

当前实现聚焦六条主路径：

- 目标视频选择（打分制）
- 网页全屏 + 全屏控制条
- 播放速度控制（快捷键步进 + 长按连续）
- 播放控制（播放/暂停、快进快退）
- 站点速度记忆（刷新自动恢复，零界面）
- 设置持久化与热更新（仅快捷键）

## 模块总览

```text
Content Script
  └── ContentRuntime
      ├── VideoRegistry          # 选对视频
      ├── KeyboardController     # 7 个可绑定动作
      ├── FullscreenController   # 全屏生命周期
      │     └── FullscreenControls  # 全屏内极简控制条
      ├── SpeedToast             # 全屏外极简调速提示
      └── SiteSpeedMemory        # 站点速度记忆

Background (service worker)
  └── 工具栏图标点击 -> 向当前标签页发 TOGGLE_FULLSCREEN

Options Page
  └── 7 个动作的快捷键绑定（冲突检测 + 保留键警告）

Shared
  ├── shortcuts   # 规范化 / 匹配 / 保留键检测
  ├── settings    # storage.sync 读写 + 旧版迁移
  ├── i18n        # chrome.i18n + 中文回落
  └── types       # 设置模型与默认值（单一来源）
```

## 内容脚本

### `ContentRuntime`

文件：`src/content/runtime.ts`

职责：

- 安装运行时样式
- 加载设置与站点记忆，失败时回退默认
- 启动注册表与键盘控制器，订阅设置变化热更新
- 监听 `ratechange`：把主视频速度同步进站点记忆
- 监听 `play`：应用站点记忆速度（仅当当前为 1x）
- 响应 background 的 `TOGGLE_FULLSCREEN`（工具栏图标点击）

### `VideoRegistry`

文件：`src/content/videoRegistry.ts`

职责：

- 扫描普通 DOM、Shadow DOM、同源 iframe 中的 `video`
- 记录最近交互的视频
- 按"最近交互 / 正在播放 / 可见性 / 在视口 / 面积"打分选主
- 帧号 + MutationObserver 的一帧内快照缓存，避免每次按键全页遍历

### `KeyboardController`

文件：`src/content/keyboardController.ts`

职责：

- 只认设置页里绑定的键；留空 = 该动作禁用
- 忽略输入框、文本域、可编辑区域、输入法合成中
- 全屏内 `Escape` 退出（不需要有视频）
- 处理速度长按重复；失焦/页面隐藏时兜底清理定时器
- 优先挂到 `content-loader` 在 `document_start` 注册的桥接监听器，
  保证先于所有页面脚本，不被抢跑或吞键

### `FullscreenController` + `FullscreenControls`

文件：`src/content/fullscreenController.ts`、`src/content/fullscreenControls.ts`

职责：

- 管理网页全屏 overlay 生命周期；优先 reparent，失败退回 CSS cover
- 退出时还原原父节点、内联样式、controls、body overflow
- 还原前校验 `originalNextSibling` 仍是原父节点的孩子，否则 append 兜底
  （全屏期间页面重排 DOM 移走 sibling 时，避免 NotFoundError 卡死全屏）
- 节点被页面丢弃时只清理、不重插（health check 每 500ms）
- 控制条：播放/暂停、进度、时间、音量、速度、退出；鼠标静止 3 秒隐藏
- reparent 模式下由控制条接管视频表面的左键点击（单击 = 切换播放/暂停）

### 点击语义的所有权

reparent 把 `<video>` 搬进我们自己的 overlay，视频就脱离了站点播放器的祖先链
（YouTube 的 `#movie_player`、B 站的播放器容器）。站点那些「点击视频切换播放」的
监听器挂在祖先上、靠冒泡收事件，祖先链一断它们就再也收不到点击——实测 YouTube
网页全屏里左键点击毫无反应，而空格正常，因为键盘走的是我们自己的
`document_start` 捕获通道。

所以**接管表面就要接管点击语义**：`FullscreenControls` 在 reparent 模式下给视频
自己挂 `click`，只认左键、且 `defaultPrevented` 时让位给站点。

css-cover 模式必须相反：视频留在站点 DOM 原位，站点监听器照常工作，我们再切一次
就是双重切换（点一下 = 暂停又播放 = 看起来仍然没反应）。因此所有权判定是
`ownsVideoSurface()` 这个**函数**而不是常量——180ms 探测可能把模式从 reparent
动态降级到 css-cover，`unmount()` 也必须摘掉监听器，否则退出全屏后残留监听器
会和站点自己的处理器双重切换。

双击不需要去抖：浏览器在一次双击里派发两个 `click`（`detail=1` 与 `detail=2`），
两次切换互相抵消、播放状态净变化为零，与 YouTube 原生双击的表现一致（实测原生
双击后 `paused` 不变、只进全屏）。

### `SpeedToast`

文件：`src/content/speedToast.ts`

职责：

- 全屏内外调速时都在视频角落淡入 `1.5x` 小胶囊，约 1 秒后淡出
- 控制条 3 秒无操作即隐藏，不能指望它承担键盘调速的反馈

### `SiteSpeedMemory`

文件：`src/content/siteSpeedMemory.ts`

职责：

- 按 hostname 记住播放速度（storage.local，不占 sync 配额）
- `play` 事件上自动恢复（仅当当前为 1x，绝不与用户/站点显式设置冲突）
- 写入防抖 800ms；1x 视为"无记忆"自动清除
- 无界面、无开关：对用户完全透明

## 设置与共享逻辑

### `shortcuts`

文件：`src/shared/shortcuts.ts`

职责：

- 规范化快捷键字符串（修饰键小写、空格统一）
- 将 `KeyboardEvent` 转成快捷键定义
- 匹配与浏览器保留快捷键检测

### `settings`

文件：`src/shared/settings.ts`

职责：

- 从 `chrome.storage.sync` 读取 / 写入设置（仅快捷键）
- 迁移旧版：v4 legacy 键映射；v5 `spaceTogglePlay:false` 译为"播放/暂停未绑定"
- storage API 失败时抛出明确错误；订阅设置变化

## 站点适配

文件：`src/content/siteAdapters.ts`

当前只保留四类适配：`generic` / `youtube` / `bilibili` / `localhost`（含 `127.0.0.1`）。
适配器只负责指定优先选择器；reparent 的可行性判断在 `FullscreenController.enter()` 内统一完成。
适配器列表现在只剩 `selectors` 一个字段；localhost 适配器的 selectors 与 generic 相同，仅 hostname 匹配不同。

## 非目标

这些能力当前不在实现范围内：

- `audio` 控制、音量全局快捷键、书签、历史、云同步
- 工具栏 Popup、图标 badge、常驻角标
- React UI、Zustand 状态层
- 多站点深度 UI 定制
