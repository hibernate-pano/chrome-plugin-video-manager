# Testing

当前项目维护三类测试入口：

- Vitest 单元测试
- Vitest 契约测试（`scripts/`，跑在单元测试里）
- Playwright E2E（含真加载扩展与注入式两类，见下）

## 运行方式

```bash
pnpm test          # 单元测试 + 契约测试
pnpm test:e2e      # 全部 Playwright（会先 pnpm build）
pnpm test:e2e:ext  # CI 跑的那些（会先 pnpm build）
```

> `test:e2e:ext` 是 CI 实际执行的入口，**包含每一个 `tests/e2e/*.spec.js`**
> （当前 17 个文件）。
> 新增 spec 时**必须**加进它，否则 CI 永远不会执行。
> `scripts/ci-workflow.test.ts` 会用文件系统核对这一点，漏加会直接报错 ——
> 那道守卫存在的理由就是：漏加的 spec 在本地全绿、在 CI 上从不存在。

## 当前覆盖范围

### Vitest

配置文件：[vitest.config.ts](./vitest.config.ts)

当前执行的测试位于：

- `src/content/**/*.test.ts`
- `src/shared/**/*.test.ts`
- `src/options/**/*.test.ts`
- `src/background/**/*.test.ts`
- `scripts/**/*.test.ts`

主要覆盖：

- 播放速度计算
- 快捷键匹配与拦截
- 网页全屏进入 / 退出
- 视频选择逻辑（含 Shadow DOM / 同源 iframe 跨 realm）
- 设置归一化与 storage 失败路径
- 设置页渲染、快捷键绑定校验与无障碍属性
- 全屏控制条与极简调速提示
- 影响边界回归（无 `document.body`、shadow DOM 编辑态、不可见视频过滤、iframe 坐标换算、样式自愈）
- **页面把 DOM 原型改坏时的退化**（`matches` / `closest` / `safeMatches`），
  以及一条**结构守卫**：生产代码里不许出现裸调的 `matches(` / `closest(`
  （见 `src/shared/domMatches.test.ts`）
- CI 工作流配置契约（见下）

> 新增 `*.test.ts` 时注意：`vitest.config.ts` 的 `include` 是逐条枚举的，
> 放进一个没被列到的目录不会被收集，测试会静默地永不执行。

### CI 契约测试

[scripts/ci-workflow.test.ts](./scripts/ci-workflow.test.ts)

这个仓库的 CI 曾经无声失效很久：所有 job 都用 `npm ci` + `cache: 'npm'`，
而仓库里只有 `pnpm-lock.yaml`；lint / type-check 两个 job 调用的 npm script 根本不存在。
这些问题全都在 YAML/JSON 配置层面，没有运行时信号能拦住，所以把它们固化成断言：

- 没有任何 job 用 `npm ci` / `npm install`，依赖安装一律 `pnpm install --frozen-lockfile`
- `pnpm/action-setup` 必须排在 `setup-node` 之前，且**版本必须钉死**
- 构建产物上传的是 `dist` 且带 `if-no-files-found: error`
- job 依赖图、e2e job 是否真的装了浏览器、`test:e2e:ext` 是否覆盖了每一个 spec 文件

> 出包不再走 CI（原 `release` job 用 `v${github.sha}` 打 tag，与 `vX.Y.Z` 约定冲突，已删）；
> 改由本地 `pnpm build:ext` 完成，见 [CHROMEWEBSTORE.md](./CHROMEWEBSTORE.md) 的「发布流程」。

改 CI 时这个测试会先于 GitHub 告诉你结果。

### 发布内容契约测试

[scripts/release-content.test.ts](./scripts/release-content.test.ts)

README 与商店文案里写着三句承诺：**产物里没有第三方库**、**不发起任何网络请求**、
**只申请必要的权限**。这些是给用户看的信任、给审核员看的承诺 ——
而**承诺会过期**：某天加个依赖、引入个 CDN 脚本、或多要一个权限，
那句话就悄悄变成了谎话（而且用户解包就能看到）。

所以有一道守卫盯住它们：

- `package.json` 里**没有运行时依赖**（只有 devDependencies）
- 沿**构建入口的 import 图**走一遍，确认真正会进产物的代码里
  没有外部包、没有网络 API、没有本仓库之外的 URL
  （⚠️ 不按目录扫整个 `src/` —— 住在 `src/` 里但只被测试引用的文件并不进产物，
  按目录扫会误报，而**误报一次守卫就再也没人信了**）
- `manifest.json` 的权限白名单（只许 `storage` + `<all_urls>`）与 CSP 不被放宽
- 反向守卫：README 与商店文案里那几句话**还在** ——
  实现改了忘改文案会红，文案删了没改实现也会红

> 产物层面的那道闸在 `scripts/package-extension.js`：
> **出包前**扫一遍真实产物内容（构建工具自己注入的东西也在里面）。
> 那是真正拦住上传的那一步。

### Playwright

配置文件：[playwright.config.js](./playwright.config.js)

**这些用例的性质不同，不要混淆：**

| 用例 | 是否加载扩展 | 覆盖 |
|------|-------------|------|
| `fullscreen-regression.spec.js` | ❌ 把 `dist/content.js` 当普通 `<script>` 注入页面 | 页面主世界里的全屏 overlay 行为、进出全屏后播放进度不丢 |
| `real-extension.spec.js` | ✅ `--load-extension` 真加载 `dist/` | 隔离世界、document_start 桥接、真实 `chrome.storage` |
| `boundary.spec.js` | ✅ `--load-extension` 真加载 `dist/` | 非正常文档与元素上的失败模式（见下） |
| `subtitle-visibility.spec.js` | ✅ `--load-extension` 真加载 `dist/` | 网页全屏里字幕**真的**看得见（6.0.8 号称修好、实测从未生效） |
| `style-isolation.spec.js` | ✅ `--load-extension` 真加载 `dist/` | 站点的 CSS 打不穿控制条（shadow root 隔离）+ 页面级提示的样式隔离 |
| `fullscreen-controls.spec.js` | ✅ `--load-extension` 真加载 `dist/` | 控制条自身的视觉与交互（进度条步长、时间标签宽度、轨道对比度） |
| `takeover-rules.spec.js` | ✅ `--load-extension` 真加载 `dist/` | 接管规则的分层证据（按 `f` 之后到底谁在吃键） |
| `takeover-scope.spec.js` | ✅ `--load-extension` 真加载 `dist/` | 接管范围：只对「用户正在看的」那个视频生效 |
| `speed-menu.spec.js` | ✅ `--load-extension` 真加载 `dist/` | 全屏控制条里的倍速档位菜单 |
| `options-page.spec.js` | ✅ `--load-extension` 真加载 `dist/` | 设置页（改键、持久化、可访问性） |
| `toolbar-title.spec.js` | ✅ `--load-extension` 真加载 `dist/` | 工具栏图标标题 = 当前倍速 |
| `frame-scope.spec.js` | ✅ `--load-extension` 真加载 `dist/` | **帧的归属**：快捷键该作用在哪个视频上（见下） |
| `frame-scale.spec.js` | ✅ `--load-extension` 真加载 `dist/` | iframe 被缩放时，提示的坐标换算（见下） |
| `video-owner.spec.js` | ✅ `--load-extension` 真加载 `dist/` | **视频在别处时不能静默**：跨 frame 的「谁有视频」协议（见下） |
| `first-run-hint.spec.js` | ✅ `--load-extension` 真加载 `dist/` | 首次使用引导：小视口（嵌入框）里退到精简版 |
| `iframe-fullscreen.spec.js` | ✅ `--load-extension` 真加载 `dist/` | iframe 里的网页全屏要铺满**整个页面**，不是铺满那个框 |
| `speed-toast.spec.js` | ✅ `--load-extension` 真加载 `dist/` | 调速胶囊/角标的可见性与坐标 |

> ⚠️ 所有「真加载扩展」的 spec **共用** `tests/e2e/helpers/launch.js` 启动浏览器 ——
> 不要再在 spec 里自己抄一份启动样板（见下文「e2e 的浏览器启动」）。

> ⚠️ 每一个 `tests/e2e/*.spec.js` 都必须被 `package.json` 的 `test:e2e:ext`
> 列进去 —— 这条由 `scripts/ci-workflow.test.ts` 守着（漏一个 = CI 里没人跑它，
> 而它看起来还是在仓库里）。

> ⚠️ **`workers: 2` 不是随手填的，别改成「CPU 数的一半」。**
> 每个 worker 都会拉起一个**完整的 Chromium**，而这套用例里有大量与时序有关的
> 断言（等动画结束、等跨进程的一问一答回来）。
> 实测（本地 12 核、机器本身还有别的负载时）：6 个 worker 时**每次全量跑都有 1 条
> 用例随机失败**，而失败的**位置每次都不一样**（帧归属那条、控制条宽度那条、
> 接管提示那条轮着来）—— 那不是回归，是抢不到 CPU。
> 2 个 worker 是「够快又不打架」的值：全量跑约 2 分钟，CI（4 核）上也是 2 个。
>
> **判断「随机失败」是不是抢 CPU 的办法**：连着跑三次全量，
> 三次都绿 → 之前那次的失败是负载，不是回归；
> 三次都红在**同一条** → 那是真回归，去查。

`fullscreen-regression.spec.js` 覆盖的还包括**点击语义的所有权**：网页全屏内
左键点击视频画面要能切换播放/暂停（v6.0.4 的修复点）、右键不触发、退出全屏后
一次点击只切换一次（残留监听器会和站点自己的处理器双重切换）。

`real-extension.spec.js` 覆盖的正是 jsdom 测不到的那一层：

- 内容脚本在 `document_start` 注入样式
- 速度快捷键步进改速
- 页面脚本用 `stopImmediatePropagation` 抢键也抢不过内容脚本（v5.2.1 的修复点）
- 内容脚本不打断页面自身的输入框打字
- 调速不跨刷新继承，且 6.0.6 时代残留的站点速度表被清除（走一遍 `storage.local` 往返）

`boundary.spec.js` 约束的是「非正常网页 / 非正常元素上的行为」，这些用例只能在
真实浏览器里跑（jsdom 没有布局引擎、也没有 shadow DOM 事件重定向）：

- 无 `document.body` 的文档（SVG + `foreignObject`）不抛未捕获异常
- 纯 SVG / XML 不注入任何 UI 节点
- 不可见视频不被当作受控对象；`closed` shadow root 里的视频不被触碰
- shadow DOM 输入框与顶层输入框得到相同的编辑态豁免
- 无视频页面 7 个默认键全部透传
- iframe 内视频的调速提示坐标换算到顶层坐标系
- 跨 document 的视频按 `f` 不被静默吞掉
- 页面摘掉 `#vsc-runtime-styles` 后能自愈
- 网页全屏接管不了时给出提示，而不是静默失败（v6.0.5 的修复点）
- 首次使用引导只在播放一会儿后出现一次，之后不再打扰

`frame-scope.spec.js` 守的是「帧的归属」这条**架构级**承诺。内容脚本注入到
所有 frame（manifest 的 `all_frames`）之后，最容易出的错就是**串台**：

- 焦点在 iframe 里 → 只有 iframe 里的视频变速，顶层的视频不许动
- 焦点在顶层文档 → 只有顶层的视频变速，iframe 里的视频不许动
- 点扩展图标 → 只有被 background 点名的那个 frame 执行，其余 frame 袖手旁观

> ⚠️ **Chrome 的 frameId 不是连号的。** 实测：顶层是 0，同源 iframe 是 **2**，
> 1 号根本不存在。写死一个数 = 把用例绑在一个跟实现无关的巧合上。
> 真实 frameId 从 background 自己记下的那份「用户此刻在哪个 frame」里取
> （`chrome.storage.session` 的 `vsc-tab-focus-frame:{tabId}`）——
> 这条链路（焦点上报 → 记住 → 寻址）本身也是要验的东西。

`frame-scale.spec.js` 守的是「iframe 被缩放时坐标换算还对」。这类断言**不用
自己算自己验**：夹具里的视频带一圈绿色边框，用例直接量**浏览器画出来的像素**
当基准，再比提示的位置 —— 公式错了就是公式错了，不会被公式自己掩盖。

`video-owner.spec.js` 守的是「按了快捷键却毫无反应」这条**静默失败**。6.1.0 之后
每个 frame 只管自己 document 里的视频，于是顶层看不见嵌入框里的视频 ——
顶层没有明确目标时，键按原则要放行给页面，页面没绑定，于是**什么都不会发生**。
用户能得出的唯一结论是「扩展坏了」。

- 焦点在顶层、视频在嵌入框里 → 按快捷键必须说明「视频在嵌入框里」
- 整个页面都没有视频 → **不许**弹那句话（没有视频的页面上说「视频在嵌入框里」
  是假消息，比不弹更糟）
- 「谁有视频」的广播 → 嵌入框里的那个 frame 真的会回答（守的是这条协议本身：
  回答走 `chrome.runtime.sendMessage`，不是 `tabs.sendMessage` 的响应 ——
  一次广播只保留一个响应，其余会被丢掉）

> ⚠️ 「点工具栏图标 → 发给视频所在的那个 frame」这条路由**没有 e2e**：
> 浏览器工具栏上的图标在 Playwright 里点不到（浏览器 UI 不在页面的可及范围内）。
> 那条路由由 `src/background/action.test.ts` 守住（带变异验证：把路由改回
> 「只发给焦点所在的那个 frame」，用例会红）。

> 写这类用例时注意：`waitForSelector('#vsc-runtime-styles')` 会在页面 `<body>`
> 内联脚本执行之前就返回。把辅助函数定义在 `<body>` 里会和这个等待形成竞态，
> 要放在 `<head>` 并惰性取节点。

`subtitle-visibility.spec.js` 守的是「字幕在网页全屏里真的看得见」这条承诺。
6.0.8 的变更日志写着「字幕跟着视频一起进出全屏」，**实测它从来没生效过**，
所以这套用例全部是 6.0.9 新写的。它覆盖：

- 字幕在**像素上**真的可见（不被视频与控制条盖住）
- 字幕容器不塌成 0 宽（否则站点字幕自己的 `left:0;right:0` 相对 0 宽包含块也是 0 宽）
- 弹幕层不该被搬进全屏
- 字幕参照物与**实际画面框**等大（不是与视口等大）
- 视口变化后字幕参照物重新对齐（否则字幕会被推到画面外）
- 退出全屏后字幕回到原位，且**站点自己的 `transform` 不被抹掉**

`style-isolation.spec.js` 守的是「控制条搬进 shadow root，站点 CSS 打不穿」这条承诺。
它用一个「有自己的设计系统」的站点（`div { font-family: Comic Sans !important }`、
`button { all: unset !important }`、`input[type=range] { background: red !important }`）
断言控制条渲染出来仍然正常：按钮没塌成 22×48、字体不是 Comic Sans、
时间没被放大到 40px、进度条不是红色的 40px 方块。

> ⚠️ **断言必须量实际渲染出来的样式**（computed style / 实际尺寸），
> 而不是「元素上有没有某个 class」——后者在污染站点上照样通过。
>
> ⚠️ **查询要同时支持 shadow root 与 light DOM**（`host.shadowRoot?.querySelector(sel) ?? host.querySelector(sel)`）。
> 否则做变异验证时（把控制条搬回 light DOM），断言会在「元素找不到」这一步就挂掉，
> **掩盖掉后面真正要检验的样式断言**——看起来像守卫抓到了 bug，实际什么都没验证到。

## 写真实扩展用例时踩过的坑

下面四条都是「目标行为其实是对的，用例却假通过 / 假失败」。改断言之前先看这里。

> ⚠️ **内容脚本跑在隔离世界，页面主世界改不动它的输入。**
> 在页面里 `Object.defineProperty(video, 'paused' | 'duration' | 'play', ...)`，
> 内容脚本一概看不到——它拿到的是自己那个 realm 的包装对象（实测：页面把
> `paused` 覆盖成 `false`，扩展仍然走 `play` 分支）。
> 所以真扩展用例**不能靠伪造媒体状态**来驱动，只能断言「DOM 上出现了什么」。
> 需要精确控制 `currentTime` / `duration` 的断言请走 jsdom 单测，或走
> `fullscreen-regression.spec.js`（它把 `dist/content.js` 当普通脚本注入主世界）。
>
> ⚠️ **这条隔离同样适用于原生 DOM 属性的 mock。** 曾试图用
> `Object.defineProperty(video, 'videoWidth', { value: 640 })` 造一个 4:3 视频，
> 用来验证「字幕参照物按画面框而不是按视口算」。结果**内容脚本读到的
> `videoWidth` 仍然是 0** —— 扩展侧据此判定「还没有固有尺寸」并早退，
> 参照物一直是 100%×100%。
> **这类 mock 全部无效**，且失效方式是"看起来在测、其实那条分支根本没进"。
> 要测画面框相关的路径，只能用**真的**媒体文件（见下面的 `fixtures/sd-4x3.ts`）。
> 这次正是靠换成真 mp4，才发现真正的 bug 不在 4:3 判定上，而在
> **视口变化后参照物不重算**（旧尺寸被钉住，字幕被推到画面外）。

> ⚠️ **鼠标点击必须落在顶层文档，否则按键根本到不了内容脚本。**
> 一旦点进 iframe，焦点就留在 iframe 里，之后 `page.keyboard.press` 只派发给
> iframe。表现是「按 f 没反应」，很容易被误判成扩展的 bug。
> 夹具要在顶部留出可点区域（`boundary.spec.js` 与 `iframe-outer.html` 都留了
> 400px 留白），点击坐标打在那块留白上。

> ⚠️ **不要用 `data:` URL 当 iframe 夹具。** `data:` 是 opaque origin，
> 它里面的 video 不会被扩展认成受控对象，用例会以「什么都没发生」假通过。
> 用真实 HTTP 文件（`tests/e2e/iframe-outer.html` + `iframe-inner.html`）。

> ⚠️ **同源 iframe 里的 video，在顶层文档里定位要用换算后的坐标。**
> iframe 内元素的 `getBoundingClientRect()` 是相对 iframe 视口的。扩展侧统一
> 走 `frameOffset.topLevelRect()`（它会一路向上换算，**并且处理 iframe 被缩放
> 的情况**：缩放时 `frameRect.width / frame.offsetWidth` 就是缩放比）；
> 用例断言提示位置时也要按换算后的坐标来算，别拿未换算的值去比。

> ⚠️ **`chrome.i18n` 选哪个 locale 目录，不看 `getUILanguage()`。**
> `getUILanguage()` 返回的是**浏览器界面语言**；Chrome 挑 `_locales` 下的目录
> 受**系统/地区设置**影响。两者可以不一致（macOS 上"系统中文 + Chrome 界面英文"
> 是常见组合）。实测在那种情况下 `getUILanguage()` 给 `en-US`，
> `getMessage()` 返回的却是中文。
> 后果是 `<html lang>` 与实际渲染内容错配 —— **没有任何视觉症状**，
> 只有读屏用户会中招。
> 扩展侧因此不猜 Chrome 的规则，而是读 locale 文件里的 `__vscLocale` 标记键
> （见 `src/shared/i18n.ts` 的 `currentLocale()`）。
> 写与语言相关的断言时，要同时断言 **lang 与实际渲染出的文案**，而不是只断言 lang。

另外：**顶层文档里没有 video、只有 iframe 里有** 时，父文档的 registry 认不到
子框架里的视频（`frameDocumentOf` 那条下钻路径没生效）。要构造「跨 document 的
视频」场景，夹具得让点击落在顶层、同时保证视频本身可被选中，别假设父文档一定
选得到子框架里的元素。

## CDP 派发按键：`nativeVirtualKeyCode` 是最贵的一个参数

> ⚠️ **用 CDP 的 `Input.dispatchKeyEvent` 模拟按键时，不要传 `nativeVirtualKeyCode`。**

实测（真实 Chromium + CDP，A/B 对照，每档 1.5 秒）：

| payload | 页面收到的 keydown 数量 |
| --- | --- |
| 带 `nativeVirtualKeyCode` | **18 528** |
| 不带 | **1** |

带上它，浏览器就把这个按键当成「用户真的按住了」——
自己的**按键重复生成器**随即开工，而它不是按操作系统的节奏（30 次/秒），
而是**按渲染器能确认多快就多快**（实测上万次/秒）。
补一个 `keyUp` 也**停不下来**（实测补了之后照样每秒 5000+）。

后果不是「慢」，是「塌」：

- 扩展的每个 keydown 都要重扫整页视频列表 → 渲染器主线程被占满；
- seek / 全屏这些跨进程动作全部排队，CDP 往返实测到 **37 秒**；
- 用例跑到 100 秒以上，而扩展「用户选过它」的证据只保留 60 秒 ——
  视频不再被认作接管目标，seek 静默失效，断言超时。
  **失败原因与产品无关**，症状却像产品坏了。

只传 `windowsVirtualKeyCode` 就够：它只影响 DOM 里那个已废弃的
`event.keyCode`，而扩展匹配快捷键用的是 `event.key`。

**判断一个失败是不是这个坑**：看那条用例的耗时。
正常情况下单个按键的往返是 **1~5 毫秒**；一旦变成秒级，就是它。

> 💡 同一族的坑：`page.keyboard.press()` **不会**触发这个洪水
> （Playwright 自己派发时用的是同一套 CDP，但不带 `nativeVirtualKeyCode`）。
> 所以「Playwright 的 press 好好的，我们自己派发就炸」这种差异，
> 先去看 payload 的差异，别急着怀疑产品。

## 断言文案前，先搞清楚 `chrome.i18n` 到底跟谁走

> ⚠️ **`chrome.i18n` 挑 `_locales` 下的哪个目录，跟着的是「系统 locale」** ——
> 不是 `--lang`，也不是浏览器界面语言。

实测（真实 Chromium，A/B 对照，macOS 系统语言 = 中文）：

| 启动方式 | `chrome.i18n.getMessage('optSubtitle')` |
| --- | --- |
| 默认 | `快捷键`（中文） |
| `--lang=en-US` | `快捷键`（**仍然是中文**） |
| `LANG=en_US.UTF-8` | `快捷键`（**仍然是中文**） |

也就是说：**写死中文的断言只在中文系统的机器上成立**。
开发机是中文系统、CI 容器（`ubuntu-latest`）是英文环境 ——
于是「本地过、CI 挂」。

这个坑本仓库**踩过两次**（见 2026-10-06 那次提交「接管提示断言不再依赖机器
语言」）。但那次只补了**一条**断言，没有解决**结构**问题，于是下一次新增
断言又踩一遍 —— 2026-10-21 的审查里又找出 13 处。

**结构性的解法**（`tests/e2e/helpers/i18n.js`）：

```js
import { anyLocale, anyLocaleFragment } from './helpers/i18n.js';

// 全等断言：接受任意一种已翻译文案
await expect(page.locator('#status')).toHaveText(anyLocale('optUnsaved'));

// 片段断言（含否定）：占位符 $1 会被换成通配
expect(hint.text).not.toMatch(anyLocaleFragment('hintToolbar'));
```

它仍然验的是「界面显示的是**这条消息**对应的内容」，只是不关心它被翻译成了
哪种语言。**消息键才是契约，翻译不是。**

> ⚠️ 两个实现细节，写错了会静默失配：
> 1. 占位符必须在**转义之前**换掉。先 `escapeRegExp` 的话，`$1` 变成 `\$1`，
>    后面再找 `$1` 就找不到了 —— 通配符永远替换不进去。
> 2. 否定断言要用 `not.toMatch`，不能用 `not.toContain` —— 后者只接受字符串。

> ⚠️ **别再用 `--lang=zh-CN` 来固定界面语言**：它对 `chrome.i18n` **无效**
> （见上表）。`options-page.spec.js` 里曾经有一处，注释还写着「固定界面语言」，
> 实际什么都没固定 —— 中文断言能过，纯粹是因为那台机器的系统语言是中文。

## e2e 的浏览器启动：只有 `tests/e2e/helpers/launch.js` 一处

13 个 spec 曾经各抄一份启动样板（≈700 行），抄着抄着就**漂移**了：

- 有的把「等 background service worker」放在重试循环**外面**（浏览器起来了但
  扩展没加载就直接失败，不再试下一个候选），有的放在**里面**（会重试）；
- `--no-sandbox` 是 **Linux CI** 的需要，却被抄进了 macOS 的本机运行 ——
  开发机白白少了一层浏览器沙箱隔离；
- `findChromium()` 写死了 macOS 的缓存路径，在 Linux 上恒返回 `undefined`，
  那个「按可执行文件路径兜底」的候选**从来没生效过**；
- 拿 worker 的入口有三种叫法：`ext.serviceWorker` / `ext.sw` / `ext.worker()`。

重复本身不贵，**漂移**才贵 —— 它让「同一个测试环境」在不同 spec 里表现不同，
于是失败时分不清是产品坏了还是环境不一样。现在统一到 `helpers/launch.js`：
**改一处，全部 17 个 spec 同时生效**。

> 💡 `--no-sandbox` 现在**只在 Linux 上加**：CI 容器里以 root 跑 Chrome 必须加
> （否则沙箱起不来），`/dev/shm` 也要换成 `/tmp`；但 macOS 上 Chrome 的沙箱
> 本来就能用，关掉它只会让开发机少一层隔离。

> ⚠️ `helpers/launch.js` 里 `DIST` 是**按本文件位置**推出来的（仓库根在三层之上）。
> 少退一级会指向 `tests/dist`，扩展加载不上 —— 症状是「浏览器起来了但没有
> service worker」，很难往路径上想。所以那里有一道「路径不对就立刻报错」的护栏。

## CI 什么时候真的会跑 e2e

> ⚠️ **e2e 作业只在 push 到 `main` / `develop`、或往 `main` 开 PR 时才跑。**
> 在功能分支上改代码，**本地不跑**的话，CI 一路绿灯 —— 绿灯只说明
> 「单元测试和 CI 契约测试过了」，不代表「真浏览器里还能用」。

> ⚠️ **2026-10-21 的实况**：6.1.0 与 6.2.0 的全部工作（含 6 个新 e2e spec、
> 重写过的设置页与全屏控制器）**从未进过 CI** —— 最后一次绿的 e2e 作业是
> 2026-10-08 跑的 6.0.8 那棵树。分支上「测试全绿」与「CI 会绿」是两件事。

## 测试资源

- [tests/e2e/test-page.html](./tests/e2e/test-page.html): 注入式用例使用的本地测试页面。
  里面的 `<video>` **故意没有 `<source>`**：那套用例把 `duration` 伪造成 120 秒并
  断言 `currentTime` 精确往返，一旦真实媒体加载成功，浏览器会把 `currentTime`
  钳到真实可寻址范围，断言就挂。加回外部媒体会让它变成「本地过、CI 挂」——
  实际上它曾经就是这样（CDN 对本机 403、对 runner 放行）。
- [tests/e2e/boundary.spec.js](./tests/e2e/boundary.spec.js): 影响边界回归守卫
- [tests/e2e/real-extension.spec.js](./tests/e2e/real-extension.spec.js): 真加载扩展的用例，页面由路由拦截现造
- [tests/e2e/subtitle-visibility.spec.js](./tests/e2e/subtitle-visibility.spec.js): 字幕可见性回归守卫
- [tests/e2e/style-isolation.spec.js](./tests/e2e/style-isolation.spec.js): 站点 CSS 打不穿控制条
- [tests/e2e/frame-scope.spec.js](./tests/e2e/frame-scope.spec.js): 帧的归属 —— 快捷键/图标该作用在哪个视频上
- [tests/e2e/frame-scale.spec.js](./tests/e2e/frame-scale.spec.js): 缩放 iframe 里的坐标换算（以浏览器画出的像素为基准）
- [tests/e2e/first-run-hint.spec.js](./tests/e2e/first-run-hint.spec.js): 首次引导在小视口（嵌入框）里的「放得下」契约
- [tests/e2e/speed-toast.spec.js](./tests/e2e/speed-toast.spec.js): 倍速胶囊与角标 —— 暂停后自己回来、进/出全屏重新贴位
- [tests/e2e/video-owner.spec.js](./tests/e2e/video-owner.spec.js): 「视频在嵌入框里」不能静默 + 「谁有视频」的广播
- [tests/e2e/iframe-fullscreen.spec.js](./tests/e2e/iframe-fullscreen.spec.js): 嵌入框里的网页全屏要**铺满整个页面**
- [tests/e2e/helpers/png.js](./tests/e2e/helpers/png.js): 共享的 PNG 解码工具 —— 用例要量「浏览器真的画在哪」时用它
- [tests/e2e/fixtures/sd-4x3.ts](./tests/e2e/fixtures/sd-4x3.ts): 一个**真的** 4:3（640×480）mp4，
  以 base64 内联（2KB）。必须用真媒体：mock `videoWidth` 在隔离世界里无效（见上面的坑）。
- [tests/e2e/iframe-outer.html](./tests/e2e/iframe-outer.html) + [iframe-inner.html](./tests/e2e/iframe-inner.html):
  真实 HTTP 的同源 iframe 夹具，用于「跨 document 的视频接管不了」这条路径。
  必须走文件而不是 `data:` URL，原因见上一节。

## 变异验证

新写的测试要确认它**能失败**。真实扩展用例支持用环境变量指向别的构建目录：

```bash
# 把 dist 复制一份，故意改坏，再对着副本跑
cp -r dist /tmp/mutant-ext
# 编辑 /tmp/mutant-ext/...
VSC_EXTENSION_DIR=/tmp/mutant-ext npx playwright test real-extension.spec.js
```

> ⚠️ **`VSC_EXTENSION_DIR` 对 `fullscreen-regression.spec.js` 无效**：那套用例走
> `test-page.html` 里的 `<script src="../../dist/content.js">`，路径是仓库相对路径、
> 硬指向 `dist/`，压根不读这个环境变量。对它做变异验证会**空跑并「通过」**，
> 看起来像守卫有效，实际什么都没验证到（这个坑真踩过一次）。
> 变异这一套时只能直接改 `dist/content.js`，验证完再 `pnpm build` 从源码重建
> —— 先备份原文件，别用 `git checkout` 之类的破坏性命令去还原。

### 6.0.9 新增的两个坑

> ⚠️ **两种写法同时存在会互相掩盖 bug，让用例变成假通过。**
> 测「退出全屏后站点自己的 `transform` 不被抹掉」时，第一版夹具把站点的
> `transform` 同时写在**内联 style** 和**样式表**里。变异（还原时退回
> `removeProperty('transform')`）后用例**仍然通过** —— 因为删掉我们写的内联之后，
> 样式表那条会接管，计算值照样对。
> **拆成两个独立场景**（一个只写内联、一个只写样式表）后，变异才被抓住。
> 判断标准很简单：**变异后用例必须失败**，没失败就说明断言没咬到东西。

> ⚠️ **断言失败的位置必须是被检验的那一步。**
> 测样式隔离时，如果断言写成「控制条必须住在 shadow root 里」并放在**最前面**，
> 那么把控制条搬回 light DOM 的变异会在这一行就挂掉，**后面真正的样式断言
> 一次都没跑** —— 用例是红的，但红的原因跟要检验的东西无关。
> 所以查询要同时支持 shadow root 与 light DOM，让每个样式断言**各自独立**地
> 咬住它要检验的东西（字体 → 字号 → 滑块高度 → 滑块背景色，四条依次暴露）。

### 写不出会失败的测试，就不要留着当守卫

给 `liveRegion.ts` 补单测时写了一条「destroy 之后待播的定时器不再复活节点」。
变异验证时**它没有失败** —— 查下去发现，那条断言在物理上就不可观测：
节点已经被 `remove()` 摘掉，定时器回调写进去的文本落在**游离节点**上，
用户永远看不见。`destroy()` 里的 `clearTimeout` 是防御性的，但**没有任何
用户可见的差异**。

于是那条用例只能证明"没抛错"，证明不了它声称要守的东西 ——
它是**假守卫**：让下一个人以为这里有保护。

> ⚠️ **发现某条变异打不穿用例时，先问一句「它真的可观测吗」。**
> 三种可能，处理方式不同：
> 1. **断言写错了** → 改断言（多数情况）。
> 2. **那段代码真的不可观测**（防御性代码、已经被上游保证的分支）
>    → 老实承认：要么删掉那段代码，要么**不要声称**有测试覆盖它。
>    留着一条永远为真的断言，比没有断言更糟 —— 它会让人误以为这里被守住了。
> 3. **代码有真 bug，但症状被别处掩盖** → 那是另一个更值得修的问题。
>
> 判断标准始终是：**变异后用例必须失败**。这条不成立时，
> 要么改用例，要么改代码 —— 不能就这么留着。

## 说明

- 仓库中旧的 Jest 测试和过期测试说明已移除，避免和当前测试入口冲突
- 如果新增测试，请优先放在 `src/**/*.test.ts` 或现有 `tests/e2e/` 回归套件下，
  并确认它真的被收集到了
