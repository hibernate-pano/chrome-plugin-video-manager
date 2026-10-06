# Testing

当前项目维护三类测试入口：

- Vitest 单元测试
- Vitest 契约测试（`scripts/`，跑在单元测试里）
- Playwright E2E（含真加载扩展与注入式两类，见下）

## 运行方式

```bash
pnpm test          # 单元测试 + 契约测试
pnpm test:e2e      # 全部 Playwright（会先 pnpm build）
pnpm test:e2e:ext  # CI 跑的那三套（会先 pnpm build）
```

> `test:e2e:ext` 是 CI 实际执行的入口，包含 `real-extension` / `boundary` /
> `fullscreen-regression` 三个文件。新增 spec 时**必须**加进它，否则 CI 永远不会执行。
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

**三套用例的性质不同，不要混淆：**

| 用例 | 是否加载扩展 | 覆盖 |
|------|-------------|------|
| `fullscreen-regression.spec.js` | ❌ 把 `dist/content.js` 当普通 `<script>` 注入页面 | 页面主世界里的全屏 overlay 行为、进出全屏后播放进度不丢 |
| `real-extension.spec.js` | ✅ `--load-extension` 真加载 `dist/` | 隔离世界、document_start 桥接、真实 `chrome.storage` |
| `boundary.spec.js` | ✅ `--load-extension` 真加载 `dist/` | 非正常文档与元素上的失败模式（见下） |

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

## 写真实扩展用例时踩过的坑

下面四条都是「目标行为其实是对的，用例却假通过 / 假失败」。改断言之前先看这里。

> ⚠️ **内容脚本跑在隔离世界，页面主世界改不动它的输入。**
> 在页面里 `Object.defineProperty(video, 'paused' | 'duration' | 'play', ...)`，
> 内容脚本一概看不到——它拿到的是自己那个 realm 的包装对象（实测：页面把
> `paused` 覆盖成 `false`，扩展仍然走 `play` 分支）。
> 所以真扩展用例**不能靠伪造媒体状态**来驱动，只能断言「DOM 上出现了什么」。
> 需要精确控制 `currentTime` / `duration` 的断言请走 jsdom 单测，或走
> `fullscreen-regression.spec.js`（它把 `dist/content.js` 当普通脚本注入主世界）。

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

## 说明

- 仓库中旧的 Jest 测试和过期测试说明已移除，避免和当前测试入口冲突
- 如果新增测试，请优先放在 `src/**/*.test.ts` 或现有 `tests/e2e/` 回归套件下，
  并确认它真的被收集到了
