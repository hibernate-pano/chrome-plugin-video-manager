# Testing

当前项目维护三类测试入口：

- Vitest 单元测试
- Vitest 契约测试（`scripts/`，跑在单元测试里）
- Playwright E2E（含真加载扩展与注入式两类，见下）

## 运行方式

```bash
pnpm test          # 单元测试 + 契约测试
pnpm test:e2e      # 全部 Playwright（会先 pnpm build）
pnpm test:e2e:ext  # CI 跑的那五套（会先 pnpm build）
```

> `test:e2e:ext` 是 CI 实际执行的入口，包含 `real-extension` / `boundary` /
> `fullscreen-regression` / `subtitle-visibility` / `style-isolation` 五个文件。
> 新增 spec 时**必须**加进它，否则 CI 永远不会执行。
> `scripts/ci-workflow.test.ts` 会用文件系统核对这一点，漏加会直接报错。

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

### Playwright

配置文件：[playwright.config.js](./playwright.config.js)

**五套用例的性质不同，不要混淆：**

| 用例 | 是否加载扩展 | 覆盖 |
|------|-------------|------|
| `fullscreen-regression.spec.js` | ❌ 把 `dist/content.js` 当普通 `<script>` 注入页面 | 页面主世界里的全屏 overlay 行为、进出全屏后播放进度不丢 |
| `real-extension.spec.js` | ✅ `--load-extension` 真加载 `dist/` | 隔离世界、document_start 桥接、真实 `chrome.storage` |
| `boundary.spec.js` | ✅ `--load-extension` 真加载 `dist/` | 非正常文档与元素上的失败模式（见下） |
| `subtitle-visibility.spec.js` | ✅ `--load-extension` 真加载 `dist/` | 网页全屏里字幕**真的**看得见（6.0.8 号称修好、实测从未生效） |
| `style-isolation.spec.js` | ✅ `--load-extension` 真加载 `dist/` | 站点的 CSS 打不穿控制条（shadow root 隔离） |

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
> 走 `frameOffset.topLevelOffset()`；用例断言提示位置时也要按
> `iframe.top + 视频在 iframe 内的 top` 来算，别拿未换算的值去比。

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
