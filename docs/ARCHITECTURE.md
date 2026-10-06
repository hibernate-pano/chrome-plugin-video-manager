# 架构文档

本文档描述当前代码库（v6）的真实结构。

## 目标

当前实现聚焦六条主路径：

- 目标视频选择（打分制）
- 网页全屏 + 全屏控制条（字幕等浮层随视频一起进出）
- 播放速度控制（快捷键步进 + 长按连续）
- 播放控制（播放/暂停、快进快退）
- 设置持久化与热更新（仅快捷键）

## 模块总览

```text
Content Script
  └── ContentRuntime
      ├── VideoRegistry          # 选对视频
      ├── KeyboardController     # 7 个可绑定动作
      ├── FullscreenController   # 全屏生命周期（含浮层搬运）
      │     ├── FullscreenControls  # 全屏内极简控制条
      │     └── OverlayLayers       # 探测字幕 / 弹幕等覆盖在视频上的浮层
      ├── SpeedToast             # 全屏外极简调速提示
      ├── TakeoverNotice         # 接管不了时的诚实反馈
      ├── FirstRunHint           # 首次使用引导（一次性）
      └── TransientPill          # 上面两条共用的提示骨架

Background (service worker)
  └── 工具栏图标点击 -> 向当前标签页发 TOGGLE_FULLSCREEN

Options Page
  └── 7 个动作的快捷键绑定（冲突检测 + 保留键警告）

Shared
  ├── shortcuts   # 规范化 / 匹配 / 保留键检测
  ├── settings    # storage.sync 读写 + 旧版迁移 + 引导状态（local）
  ├── i18n        # chrome.i18n + 中文回落
  └── types       # 设置模型与默认值（单一来源）
```

## 内容脚本

### `ContentRuntime`

文件：`src/content/runtime.ts`

职责：

- 安装运行时样式
- 加载设置，失败时回退默认
- 启动注册表与键盘控制器，订阅设置变化热更新
- 启动时清掉 6.0.7 废弃的站点速度表（`vsc-site-speeds`）
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

进度条的跳转「钉住」有一个上限（`SEEK_PIN_TIMEOUT`，3 秒）。提交 seek 后播放器
会有一小段时间继续报旧的 `currentTime`，照它渲染会把滑块拽回原位（回弹），所以
`pendingSeek` 期间滑块钉在目标位；但 `seeked` **不一定来**——请求浏览器无法寻址的
位置时 Chrome 会拒绝跳转且不派发该事件。只靠 `seeked` 解除钉住，滑块会永久冻结在
一个假的进度上，比回弹更糟：用户以为跳转成功了。所以钉住必须有上限。

### 接管失败时的反馈

`KeyboardController` 在吞键前先问 `canEnter()`：跨 document（同源 iframe）的视频
必然进不去。进不去就不吞键、放行给页面——但**放行必须配一句解释**，否则在用户眼里
「不吞键」和「扩展坏了」是同一件事。所以同一分支里调
`notifyTakeoverUnavailable()`，由 `TakeoverNotice` 弹一条 2.6 秒的提示。

提示刻意**不说原因**：从扩展这一侧无法可靠区分 DRM 受保护、跨 document、无宿主
这几种失败，猜一个具体原因比不说更糟。它只解释「不会发生什么」。

### 首次使用引导

`FirstRunHint` 是这个产品里唯一一处「主动出现」的界面，因此边界收得很紧：

- 只在该扩展**从未展示过**时触发（`storage.local` 的
  `vsc-first-run-hint-shown`，设备级状态，不占 sync 配额、不跨设备同步）
- 等到 `play` 之后**再过 2.5 秒**才出现：自动播放的广告位与悬停预览都会派发
  `play`，只按 `play` 就弹提示等于打扰
- 「用户还在看」靠真实的 `pause` / `ended` **事件**判定，不去轮询 `video.paused`：
  要回答的是「这段时间里有没有停下来」，事件是唯一诚实的信号
- 文案用**用户当前真实的绑定**渲染（改过键之后不能教一个错的键），且不含
  播放/暂停——用户刚按过它
- 任何按键/点击立即消失；12 秒后自行淡出；展示不出来（无可挂载宿主）就不写
  标记，用户之后仍有机会看到

`TransientPill` 是 `SpeedToast`（速率胶囊）之外两处一次性提示的共用骨架
（建节点 / 判空宿主 / 自愈 / 计时 / 清理），文案与停留时长由调用方给。

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
- 有自己的节点与跟随滚动/缩放的定位（与 `TransientPill` 的差别在此：
  这条提示活得更久，位置要跟着视频走）

### `frameOffset`

文件：`src/content/frameOffset.ts`

职责：把「元素在自己文档里的视口坐标」换算到顶层文档坐标系。
同源 iframe 内元素的 `getBoundingClientRect()` 是相对 iframe 视口的，
而所有提示都挂在顶层文档且 `position: fixed`，不换算就会偏离整整一个 iframe 的
偏移量（曾表现为「视频在 y≈400、提示却出现在 y=16」的屏幕角落）。
`SpeedToast` 与 `TakeoverNotice` 共用这一处实现。

### `overlayLayers`

文件：`src/content/overlayLayers.ts`

职责：

- 找出覆盖在视频之上的浮层，只看视频父容器的**直接兄弟节点**（不做全子树遍历）
- 判据只用结构与几何，**不认任何插件的类名**：绝对/固定定位、与视频矩形相交、
  落在视频范围内、覆盖面积不小于 2%
- 区分两类：
  - `subtitle` —— 窄、矮、重心在视频下半部。**跟着视频搬进 overlay**
  - `overlay` —— 其余（弹幕等）。**留在原地**，被 overlay 的不透明背板挡住

**为什么不认类名**：沉浸式翻译用 `.imt-caption-container`，但下一个字幕插件
可能是别的名字，弹幕又完全是另一套。认类名等于和某个插件耦合，它一改类名就又坏了。

**为什么字幕用「重心」而不是「底边」定位**：站点给播放器的 CSS 尺寸通常小于视频
被全屏放大后的尺寸（实测 640×360 → 1280×720），字幕按 `bottom: 8%` 定位在
**原尺寸**的播放器里，换算到全屏坐标系后底边只落在 46% 处。早先的判据要求底边
在 55% 以下，结果在真实页面上把所有字幕都判成了非字幕。

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

- 常驻 UI、设置入口以外的界面、引导以外的主动打扰
- `audio` 控制、音量全局快捷键、书签、历史、云同步
- 工具栏 Popup、图标 badge、常驻角标
- React UI、Zustand 状态层
- 多站点深度 UI 定制
