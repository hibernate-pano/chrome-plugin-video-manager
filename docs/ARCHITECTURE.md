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
      │     ├── FullscreenControls  # 全屏内极简控制条（住 shadow root）
      │     │     └── ControlsStyles  # 控制条自己的样式（shadow tree 里，页面样式进不来）
      │     ├── OverlayLayers       # 探测字幕 / 弹幕等覆盖在视频上的浮层
      │     └── SubtitleOffset      # 字幕避让位移（可精确还原站点自己的 transform）
      ├── SpeedToast             # 极简调速提示（胶囊淡出后留下常驻小角标）
      ├── TakeoverNotice         # 接管不了时的诚实反馈
      ├── FirstRunHint           # 首次使用引导（一次性）
      ├── TransientPill          # 上面两条共用的提示骨架
      └── LiveRegion             # 读屏播报通道（视觉上不可见的 live region）
      RuntimeStyles             # 注入到页面的那份 <style>（控制条的不在这里）

Background (service worker)
  ├── 工具栏图标点击 -> 向当前标签页发 TOGGLE_FULLSCREEN
  └── 原生命令 open-options -> 打开设置页

Options Page
  └── 7 个动作的快捷键绑定（冲突检测 + 保留键警告）

Shared
  ├── shortcuts   # 规范化 / 匹配 / 保留键检测
  ├── settings    # storage.sync 读写 + 旧版迁移 + 引导状态（local）
  ├── i18n        # chrome.i18n + 中文回落
  ├── rate        # 倍速格式化（内容脚本与 background 共用的纯函数）
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
- 记录最近交互的视频与「用户最后一次**亲手**选它」的时间戳
- 按"最近交互 / 正在播放 / 可见性 / 在视口 / 面积"打分选主
- 帧号 + MutationObserver 的一帧内快照缓存，避免每次按键全页遍历

#### 两个查询，两套契约

注册表对外暴露**两个**目标视频查询，契约不同，**不能混用**：

| 查询 | 语义 | 用于 | 找不到时 |
| --- | --- | --- | --- |
| `getCurrentVideo()` | 「页面上最可能是目标的视频」 | **显式**操作：点工具栏图标 | 返回 null（并给出「接管不了」反馈） |
| `getWatchedVideo()` | 「用户此刻正在看的视频」 | **隐式**操作：快捷键 | 返回 null → **按键完全穿透给页面** |

这条分界是 6.0.9 最重要的行为变更。此前两者是同一个函数，于是只要页面上
存在任何 `<video>`，空格/方向键就在**整页**生效 —— 用户在读长文（页面里嵌了
个静音的自动播放预览视频），按空格翻页结果视频跳了。这是唯一会让人直接卸载的问题。

#### 「正在看的」怎么判定

按**证据强度**分层，命中任一即算（`isWatchedVideo`）：

1. **用户 10 秒内亲手选过它** → 一定是。任何推断都推不翻用户自己的手势。
2. **站点点名的主播放器**（`siteAdapters.ts` 的 `mainSelectors`）→ 是。
   YouTube 的主播放器是静音自动播的（浏览器只允许静音自动播），
   所以「静音自动播」本身不能当排除依据 —— 只有站点能指名谁是主播放器。
3. **排除**：`isAmbientPreview`（`autoplay` 属性 + 没有原生 `controls`）。
   文章里嵌的静音预览正是这个形状。
4. **排除**：CSS 隐藏、可见面积不足视口的 10%。
5. **排除**：不够大（`isProminent`：宽 ≥ 480 且高 ≥ 270，**或**占视口 ≥ 10%，
   **或**竖屏且短边 ≥ 400）。

三条设计约束值得单独记：

- **尺寸只当排除线，不当认定依据。** 纯面积占比会随屏幕变大而变小：
  同一段 640×360 的内容视频在 1280×720 上占 25%，在 2560×1440 上只占 6.25%。
  单看比例的话，**大屏用户反而用不了**。绝对尺寸线就是为它准备的。
- **「正在播」不是必要条件。** 用户常常是「先调速再播放」—— 打开网课页面、
  视频还暂停着，他想先设成 1.5x 再按播放。要求在播会让这条最常见的用法直接失效。
- **竖屏要单独一条线。** 9:16 的宽天然小（400px 甚至更窄），
  「宽 ≥ 480」永远过不了，比例线在大屏上也过不了 —— 两条线都不过，
  用户看竖屏视频时快捷键完全失灵。而竖屏恰恰是最需要倍速的形态之一。

#### 「用户选过」必须伪造不了

第 1 条是最高优先级的证据，所以「用户选过」这件事本身必须**伪造不了**。
实测下来有三条路，都堵上了：

| 攻击手法 | 为什么不拦得住 | 现在的做法 |
| --- | --- | --- |
| 页面 `dispatchEvent(new PointerEvent('pointerdown'))` | 扩展在 `document_start` 抢注捕获阶段监听器，页面能往自己的 video 上打合成事件 | 合成事件一律不算（`isTrusted`） |
| 页面 `video.focus()` | 焦点是**浏览器**生成的，`focusin` 的 `isTrusted` 恒为 true，isTrusted 挡不住 | `focusin` 只记录「最后碰过的视频」，不参与「用户选过」 |
| 页面在用户按任意键后的 2 秒内让自己的视频播起来 | 「最近一次手势」原先只看**时间** | 手势必须**指向某个具体的视频**（落在它身上，或它是视口中心附近且够大的那一条） |

另外，「用户选过」的新鲜度必须**与视频绑定**（`lastChoiceVideo` + `lastChoiceAt` 成对）。
原先只有时间戳，于是用户点了视频 A 之后、站点让预览视频 B 自动播 ——
B 白白继承了 A 的新鲜度，被判成「用户选过」。

#### 布局判据的一个坑

`hasReliableLayout` 判断「这个文档有没有布局几何」，判据是**根元素的
`clientWidth`**（真实浏览器恒等于视口宽度，无布局引擎的环境恒为 0）。

⚠️ 曾经用「元素的 computed `display` 是否为空」来判 —— 那是个隐蔽的错：
扩展自己注入的 `runtimeStyles` 里有 `.vsc-page-fullscreen-video { display: block }`，
于是**一进全屏**判定就从「无布局」翻成「有布局」，接下来所有 rect 判定（此时恒为 0）
开始生效，视频被判成「看不见」→ **全屏里快捷键彻底失灵**。
根元素的 `clientWidth` 不受任何页面样式影响，判据本身是稳的。

#### 判定必须对「我们自己造成的变化」免疫

`isAmbientPreview` 认的是「没有原生 `controls`」。而进网页全屏时我们会
`video.controls = false`（用自制控制条取代原生控件）—— 这会**反射性地移除
`controls` 属性**。于是进全屏后，一个正经播放器会被误判成「装饰视频」→
快捷键失灵。

修法：视频已经在我们的 overlay 里躺着时，它不可能是「站点的装饰视频」。

⚠️ 这类「自己把自己判出局」的坑只能靠**真实浏览器**测出来 ——
jsdom 里 `controls` 属性的增删不影响任何断言。

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
- 控制条：播放/暂停、进度、时间、音量、倍速（可点选档位）、退出；鼠标静止 3 秒隐藏
- reparent 模式下由控制条接管视频表面的左键点击（单击 = 切换播放/暂停）
- 控制条**住在自己的 shadow root 里**（见下文「为什么控制条要 shadow DOM」）

**为什么控制条要 shadow DOM**：我们把 UI 注入到**任意站点**的 DOM 里，站点的
全局 CSS 会顺着继承和元素选择器把控制条彻底摧毁。实测一个「有自己的设计系统」的站点：

```css
* { box-sizing: border-box !important; }
div { font-family: "Comic Sans MS", cursive !important; line-height: 3 !important; }
button { all: unset !important; }
input[type="range"] { -webkit-appearance: none !important; height: 40px !important; background: red !important; }
```

结果是控制条变成一整条红色大块、按钮塌成 22×48、时间显示成 Comic Sans、进度条完全不可用。

试过的其它办法都不行：
- 显式重声明每个属性：挡不住站点的 `!important`（作者 `!important` 优先级高于普通作者声明）。
- `all: revert`：revert 只回退到**上一层**样式，站点自己的 `!important` 依然生效。
- `all: initial`：更糟，连 `position: fixed` 都会被重置。

shadow root 是一条**结构性**的隔离边界：页面样式进不来，我们自己的样式也出不去。
代价是外部代码要用 `root.shadowRoot.querySelector(...)` 才能拿到内部元素，
控制条的样式也不能再靠页面里的 `<style>` 生效 —— 所以那份样式必须自给自足
（`src/content/controlsStyles.ts`）。

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

### 180ms 健康探测：「媒体丢了」只能看 `readyState`

进全屏 180ms 后会探一次「站点有没有把媒体弄丢」，真丢了就降级到 css-cover
（视频回页面原位、字幕保持可见，代价是全屏没那么干净）。

判据必须是 **`readyState` 从有到无**（`state.readyState > 0 && video.readyState === 0`），
**绝不能是 `paused`**。实测三条对照（真实 Chromium）：

| 动作 | 派发的媒体事件 | `readyState` | `currentTime` |
|---|---|---|---|
| 用户暂停 | 只有 `pause` | 保持 4 | 不变 |
| reparent（搬节点） | **一个都没有** | 保持 4 | 不变 |
| 站点 `load()` 重载 | `abort`→`emptied`→`loadstart` | **→ 0** | → 0 |

也就是说暂停和搬节点都不改变 `readyState`，只有真的丢媒体才会掉到 0。
旧判据是「进全屏时在播、现在不在播」，用户按一下暂停就命中 —— 而 180ms
正好覆盖「刚进全屏、还在找按钮」的那一瞬，按空格或点画面暂停是进全屏后
最常见的第一个动作。后果是视频在满屏画面刚出来时被悄悄拽回页面原位。

`> 0` 这个前提同样不可省：页面本来没挂源的占位 `<video>` `readyState` 恒为 0，
不加前提会把它们全部误判成故障。

配套：`restoreIfLost` 里的「用户主动暂停过就不再自动播」豁免也必须去掉。
`userPaused` 一旦置真永不复位，用户「暂停 → 继续播 → 退出全屏」时退出补偿
会被永久跳过，视频卡在暂停。而三个调用点都是「拍快照 → 同步搬节点 → 立刻补偿」，
中间没有插手的空隙 —— reparent 本身也不会暂停视频，真出现 paused 翻转
就是站点动了媒体，那正是该恢复的时候。

### `SpeedToast`

文件：`src/content/speedToast.ts`

职责：

- 全屏内外调速时都在视频角落淡入 `1.5x` 小胶囊，约 1 秒后淡出
- **胶囊淡出不等于消失**：若视频仍在播放、仍在视口里、且用户没有再操作，
  它会缩成一枚很淡的小角标常驻在视频角落，直到视频暂停 / 滚出视口 / 进入全屏
- 控制条 3 秒无操作即隐藏，不能指望它承担键盘调速的反馈
- 有自己的节点与跟随滚动/缩放的定位（与 `TransientPill` 的差别在此：
  这条提示活得更久，位置要跟着视频走）

**为什么常驻角标值得做**：控制条 3 秒就隐藏，键盘调速时它根本不在屏幕上，
而非全屏状态下**没有任何其它地方**显示当前倍速。胶囊一消失，用户就只能凭记忆
猜自己刚才调到了几倍。角标是「随时可见当前倍速」与「不打扰」之间的折中：
它很淡、不可点击、且有明确的三条退场条件（暂停 / 滚出视口 / 进全屏）。

⚠️ 进全屏时角标**不出现** —— 控制条上就写着倍速，再挂一个角标是重复信息。
这条判定同时绕开了一个死角：控制条自带的退出按钮走 `FullscreenController.exit()`，
不经过运行时，角标拿不到「该撤下了」的通知；干脆不让它在全屏里出现。

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
  - `subtitle` —— **墨水**窄、矮、行数 ≤ 2、重心在视频下半部。**跟着视频搬进 overlay**
  - `overlay` —— 其余（弹幕等）。**留在原地**，被 overlay 的不透明背板挡住

**为什么不认类名**：沉浸式翻译用 `.imt-caption-container`，但下一个字幕插件
可能是别的名字，弹幕又完全是另一套。认类名等于和某个插件耦合，它一改类名就又坏了。

**为什么量「墨水」而不是容器宽度（6.0.9 更正）**：字幕容器的宽度是**排版方式**
决定的，不是内容决定的。绝大多数字幕容器写 `left:0; right:0; text-align:center` ——
容器铺满整个播放器（实测 100%），文字却只有中间一小段。拿容器宽度去和视频比，
100% 宽的字幕必然被判成「太宽 → 不是字幕」，于是它根本不搬进全屏，
用户看到的就是「一按 f 字幕就没了」。
现在量的是文字**实际占据**的范围（`Range.getClientRects()`）：
容器宽度是排版的度量，墨水宽度才是内容的度量。

**为什么字幕用「重心」而不是「底边」定位**：站点给播放器的 CSS 尺寸通常小于视频
被全屏放大后的尺寸（实测 640×360 → 1280×720），字幕按 `bottom: 8%` 定位在
**原尺寸**的播放器里，换算到全屏坐标系后底边只落在 46% 处。早先的判据要求底边
在 55% 以下，结果在真实页面上把所有字幕都判成了非字幕。

**字幕搬进 overlay 之后还需要三件事**（缺一个字幕就仍然看不见，
6.0.8 号称修好但实测从未生效）：
1. **z-index 高于视频**：视频 reparent 后带 `z-index: 2147483643`（inline `!important`），
   字幕原本是 `auto` —— z-index 只在**同一层叠上下文**内比较，`auto` 依然输给显式
   高层级的视频。DOM 顺序排在视频之后**不够**。
2. **住在一个与画面等大的定位参照物里**（`[data-vsc-caption-host]`）：
   站点字幕的 `bottom: %` 相对**播放器容器**定位，容器跟着视频一起放大后，
   百分比必须相对**画面框**算而不是视口，否则字幕会掉进黑边里。
3. **参照物必须有真实尺寸**：它是 stage 的 flex item，而 flex item 的宽度默认由
   内容决定 —— 里面只有绝对定位的字幕（不参与布局），于是它塌成 0 宽，
   站点字幕的 `left:0; right:0` 相对 0 宽包含块 → **字幕自己也是 0 宽** →
   一个像素都看不见。必须显式给 `width/height: 100%`。

**参照物的尺寸是算出来的，必须跟着视口重算**：视频是 `object-fit: contain`，
画面框（视口里实际显示的那块矩形）取决于**视口**尺寸与视频固有宽高比。
`alignStageToVideo()` 按这个比例算出画面框并写成参照物的 px 尺寸。

- 视口变了（用户拖窗口、旋转手机、移动端地址栏收起）→ 画面框变 → 参照物必须跟着变。
  早期只监听了 video 自己的 `loadedmetadata` / `resize`（那是**媒体**尺寸变化），
  视口变化两者都不触发，参照物永远停在旧值上：实测 1280×720 视口下的 4:3 视频
  参照物是 960×720，窗口缩到 900×600 后画面框变成 800×600，参照物还停在 960×720
  → 字幕的 `bottom: 5%` 相对 720px 算，底边落在 635px，**已超出 600px 的视口**。
- 拿不到视频固有尺寸（`videoWidth` 为 0）时必须**显式**退回铺满视口，
  而不是直接 return —— 否则参照物会停留在**上一个视频**的尺寸上。

**控制条给字幕的避让位移必须可精确还原**（`src/content/subtitleOffset.ts`）：
控制条与字幕都贴着画面底部，控制条出现时要把字幕往上抬。但字幕是**站点自己的
节点**，站点常在它身上写 `transform`（`translateY(-50%)` 居中、`scale()` 动画）。

- 必须记**计算值**（`getComputedStyle`）而不是内联值 —— 站点的 transform 可能写在
  样式表里，内联值是空的。
- 还原时写回 `!important` 内联，值就是记下来的那个计算值。
- 我们的位移与站点的位移**叠加**（`base translateY(-40px)`）而不是互相覆盖。
- ⚠️ 内联与样式表两种写法**必须分开测**：同时存在时会互相掩盖 ——
  删掉我们写的内联后样式表那条会接管，计算值照样对，用例变成假通过。

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
  （⚠️ 唯一的例外是 `SpeedToast` 那个调速角标 —— 它是 6.0.9 **已实现**的常驻界面，
  见上文 `SpeedToast` 一节）
- `audio` 控制、音量全局快捷键、书签、历史、云同步
- 工具栏 Popup、图标 badge
  （⚠️ 「图标 badge」指**扩展工具栏图标**上的小数字，早已删除；
  `SpeedToast` 那个**页面内**的常驻调速角标是 6.0.9 已实现的功能，
  不再是非目标 —— 见上文 `SpeedToast` 一节）
- React UI、Zustand 状态层
- 多站点深度 UI 定制
