# 变更日志 (Changelog)

本文档记录了项目的所有重要变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [6.0.4] - 2026-10-04

### 修复 (Fixed)

- 🖱 **网页全屏里左键点击视频恢复可暂停**：进入网页全屏后 `reparent` 会把
  `<video>` 从站点播放器容器搬进我们自己的 overlay，视频的祖先链随之从
  `VIDEO → .html5-video-container → #movie_player → …` 变成
  `VIDEO → #vsc-page-fullscreen-stage → #vsc-page-fullscreen-overlay → BODY`。
  站点那个「点击视频切换播放」的监听器挂在 `#movie_player` 这些祖先上、靠冒泡
  收事件，祖先链一断就再也收不到点击 —— 实测 YouTube 全屏里左键点击毫无反应，
  而空格正常（键盘走的是我们自己在 `document_start` 抢占注册的独立通道，与 DOM
  位置无关）。根因是**接管了视频表面却没接管它原来的点击语义**。
  现在 `FullscreenControls` 在 reparent 模式下给视频自己挂 `click`，单击 = 切换
  播放/暂停，对齐站点原生语义。

  三处边界刻意守住，否则会把「点一下没反应」换成「点一下等于没点」：

  - `css-cover` 模式**不接管**：那种模式视频留在站点 DOM 原位，站点监听器照常
    工作，我们再切一次就是双重切换（暂停又播放）。所以所有权判定是
    `ownsVideoSurface()` 这个**函数**而不是常量 —— 180ms 探测可能把模式从
    reparent 动态降级到 css-cover。
  - `unmount()` 摘掉监听器：否则退出全屏后残留监听器会和站点自己的处理器双重切换。
  - 只认左键；`event.defaultPrevented` 时让位给站点。

  双击**不需要**去抖定时器：浏览器在一次双击里派发两个 `click`（`detail=1` 与
  `detail=2`），两次切换互相抵消、播放状态净变化为零 —— 与 YouTube 原生双击的
  实测表现一致（双击后 `paused` 不变、只进全屏）。

### 测试 (Tests)

- 单测新增 5 条（左键切换、控制条被唤醒、css-cover 不接管、非左键与
  `defaultPrevented` 让位、unmount 后不再响应），148 → 153
- E2E 新增 1 条回归守卫「网页全屏内左键点击视频切换播放」，15 → 16
- 变异验证：把编译产物里的 `click` 监听器禁掉，新增 E2E 用例如期失败，
  证明守卫有效而非空跑
- 真实 Chromium + 真实扩展 + 真实 YouTube（走代理）五项回归全过：
  全屏内单击暂停 / 再点恢复、双击净零、**退出全屏后点击只切换一次**、
  右键不触发、overlay 与控制条 DOM 清理干净、无控制台报错

## [6.0.3] - 2026-10-04

### 修复 (Fixed)

本版修的都是在「非正常网页 / 非正常元素」上才会触发的影响边界缺陷，
全部在真实 Chromium + 真实扩展下先复现再修复。

- 🛡 **无 document.body 的文档不再抛未捕获异常**：SVG + `foreignObject` 内嵌
  视频时 `document.body` 为 `null`，而 `querySelectorAll('video')` 仍能找到真实
  `HTMLVideoElement`，导致键盘控制的「无视频就早退」守卫失效，一路走到
  `document.body.appendChild` 抛 `TypeError`，且按键已被吞掉。
  现在 overlay / 控制条 / 调速提示三处都没有宿主就干净放弃，
  `installRuntimeStyles` 也改用 `documentElement`，不再依赖 body。
- ⌨️ **shadow DOM 里的输入框不再被吞键**：键盘事件跨越 shadow 边界时
  `event.target` 会被重定向为宿主元素（实测：在 shadow 内的 `<input>` 打字，
  window 捕获阶段看到的 target 是 `DIV#host`），于是编辑态判定失效，
  用户在那类输入框里打空格/减号会被当成快捷键吃掉。
  改用 `event.composedPath()[0]` 取真实目标。
- 🔇 **不再把看不见的视频当受控对象**：`display:none` / `visibility:hidden` / 0 尺寸
  的候选此前只是「不加分」而非排除，单候选时它仍会以最高分胜出 ——
  速度被改在看不见的视频上，提示还会因为 `rect` 全 0 而钳到屏幕角落。
  现在不可见候选被过滤掉，唯一豁免用户**显式交互过**的那条。
- 🎯 **iframe 内视频的调速提示不再错位**：`getBoundingClientRect()` 在 iframe
  内元素上返回的是相对 iframe 视口的坐标，而提示固定在顶层文档 ——
  实测视频在 y≈400 时提示出现在 y=16。现在沿 `frameElement` 逐层累加换算到顶层坐标系。
- 🔁 **页面摘掉扩展样式后能自愈**：站点清理外来节点（SPA 重建很常见）会把
  `#vsc-runtime-styles` 摘走，此前不会重建，控制条 `position` 从 `fixed` 退化为 `static`。
  现在持引用 + `isConnected` 判定，并挂一个轻量 `MutationObserver` 自动重注入。
- 🚫 **跨 document 的视频按 f 不再静默吞键**：同源 iframe 里的视频会被识别为
  受控对象，但 `enter()` 对跨 document 的视频必然失败 —— 此前先吞键再失败，
  用户既失去按键又没有任何反馈。现在吞键前先问 `canEnter()`，进不去就放行。
  注意：全屏**已激活**时按 f 仍照常退出（退出分支独立，不受 `canEnter` 影响）。

### 新增 (Added)

- 🧪 **影响边界回归套件** `tests/e2e/boundary.spec.js`（9 条），用真实扩展在
  真实 Chromium 里约束上述六类失败模式；已接入 CI 的 e2e job，不再只跑本地。
- 🔒 `scripts/ci-workflow.test.ts` 补一条断言，防止边界套件从 CI 里静默漏跑。

## [6.0.2] - 2026-10-04

### 变更 (Changed)

- ⬆️ **CI 升到 Node 24（Active LTS）**：此前钉的 Node 20 已于 2026-04-30 EOL，
  且 `checkout` / `setup-node` / `upload-artifact` 的新主版本自身就跑在 node24 上，
  继续钉 20 只会拿到 deprecation 警告与缺失的安全更新
- ⬆️ **GitHub Actions 升级**：`actions/checkout` v4→v7、`actions/setup-node` v4→v7、
  `actions/upload-artifact` v4→v7、`pnpm/action-setup` v4→v6。
  这四个主版本只换运行时（node20→node24）与打包方式（ESM），
  本仓库用到的 `path` / `if-no-files-found` / `retention-days` / `cache` /
  `node-version` / `version` 输入全部保留
- 🧹 **清理分支**：删除已合入的 `codex/v1-clean-slim`、`refactor/v4`，
  以及未合并的 `feature/react-refactor`（React Popup 方向，已被 v6 大减法废弃），
  本地与远端均已删除，仅留 `main`
- 📌 **新增 CI 契约测试**：把「Node 不得回退到 EOL 版本」「action 主版本不得低于
  node24 那一代」固化成断言，避免以后再次静默漂移

### 新增 (Added)

- 🏷 **归档 tag** `archive/react-refactor-98fd3e1`：保留已删除分支的 5 个 commit，
  使其保持可达、不被 gc 回收。恢复方式：
  `git branch <name> archive/react-refactor-98fd3e1`

## [6.0.1] - 2026-10-04

### 修复 (Fixed)

- 🐛 **站点速度记忆不再丢**：此前只有 800ms 防抖写盘，调速后 800ms 内刷新
  或关闭标签页，最后一次调速会永久丢失（直接违背「刷新/重开自动恢复」的承诺）。
  现在监听 `pagehide` 立即落盘；`destroy` 也改为先落盘再清理。
- 🐛 **全屏回退不再抛错**：全屏期间页面重排 DOM 移走视频的兄弟节点时，
  CSS cover 回退路径会因 `insertBefore` 抛 `NotFoundError` 而中断，
  导致回退落空。现在与 `exit()` 共用同一套兄弟节点校验。
- 🐛 **去掉设置写放大**：`loadSettings` 此前无条件写回 storage，而设置变更
  订阅回调又调用它，导致每次内容脚本启动都白写一次 sync 配额。
  现在拆出只读路径，仅在首次播种或需要迁移时才落盘。

### 变更 (Changed)

- 🧹 **仓库瘦身**：删除 10 个工具/会话残留目录与构建残留，仓库从 45M 降到 8M
  （排除 `node_modules`）
- 📄 **文档去重**：删除 499 行 `docs/DEVELOPMENT.md`（描述的是 MediaDetector /
  LightboxManager / React + Zustand 等本仓库并不存在的模块）与 1499 行已废弃的
  v4 重构方案；修正 README / PRODUCT / ARCHITECTURE 里「全屏内不显示调速提示」
  的失实描述；修正 `CONTRIBUTING.md` 里 npm→pnpm、Jest→vitest、缩进、
  以及「加载项目目录」应为 `dist/` 等 8 处失实内容
- 🔧 **商店工具接线**：`store-auth` / `store-publish` / `render-icons` /
  `generate-store-assets` 四个脚本此前无任何地方引用，现已接成
  `pnpm icons` / `store:assets` / `store:auth` / `store:publish`
- 🗑 **清理死代码**：删掉恒真的 `SiteAdapter.shouldTryReparent`（4 个适配器
  实现完全相同，`css-cover` 分支本就不可达）、从未被读取的快捷键文案数据、
  仅测试使用的注入接缝，并合并重复的 `formatRate`

### 移除 (Removed)

- 删除 CI 的 `release` job：它用 `v${github.sha}` 打 tag，与 `vX.Y.Z`
  的版本约定冲突；出包改由本地 `pnpm build:ext` 完成
- 删除必然失败的 `test:coverage` script（`@vitest/coverage-v8` 未安装）

## [6.0.0] - 2026-10-02

### 变更 (Changed)

- 🧹 **大减法**：砍掉工具栏 Popup、图标 badge、数字键预设档位、最大速度上限、
  大数字 HUD 动画、悬停受控对象胶囊、日/韩语言、设置页除快捷键外的一切配置项
- ⌨️ **快捷键扩到 7 个可绑定动作**：加速 / 减速 / 重置 / 播放暂停 / 快退 / 快进 / 网页全屏，
  全部可在设置页改绑，留空即禁用；带冲突检测与浏览器保留键警告
- 🖱️ **工具栏图标改为直接切换网页全屏**（无弹窗）
- 🌐 设置页与控制条支持 简体中文 / English

### 新增 (Added)

- 🎬 **全屏控制条**：播放/暂停、进度（可拖）、时间、音量、当前速度、退出；
  鼠标静止 3 秒自动隐藏，移动鼠标即浮现
- 💬 **极简调速提示**：调速时视频左上角淡入 `1.5x` 小胶囊，约 1 秒后消失；
  全屏内外都显示（控制条 3 秒无操作即隐藏，不能指望它承担键盘调速的反馈）

### 修复 (Fixed)

- 🐛 **全屏退出不再卡死**：全屏期间页面重排 DOM 移走视频的兄弟节点时，
  退出会因 `insertBefore` 抛 `NotFoundError` 把视频卡在全屏、锁死页面滚动；
  现改为校验兄弟节点有效性，失效时 append 兜底
- 🔀 **v5 空格开关迁移**：`spaceTogglePlay: false` 的老用户升级后，
  播放/暂停会被正确译为"未绑定"，而不是空格行为自己回来
- ▶️ **YouTube 空格不再双重切换**：YouTube 的原生空格处理挂在 keyup 上，
  插件在 keydown 切换一次、站点 keyup 再切换一次，一次空格等于两次切换
  （暂停停不住）；现把裸空格整体放行给 YouTube 原生处理，
  改绑到别的键的播放/暂停不受影响
- 🛡 **调速提示自愈**：个别站点会主动清理外来 DOM 节点，toast 被摘走后
  会静默失效；现检测到脱离文档即重建
- ⚡ **切换网页全屏不再卡顿、进度条不再跳零**：进入/退出全屏时曾无条件写回
  播放位置（`currentTime`），写 currentTime 会触发 seek——浏览器重新加载媒体
  分段造成可见卡顿，seek 元数据不全的媒体还会回落到 0 造成进度条跳零；
  且 180ms 后的健康探测会把这次归零误判为"播放位置丢失"，触发 css-cover
  回退造成第二次卡顿。隔离实验证明同文档移动 video 不丢任何播放状态，
  现改为"校验丢失才补偿"：正常路径一次都不写
- 🎯 **全屏方向键/Esc/f 不再被进度条焦点吞掉**：点击进度条后焦点落在
  插件自己的 `<input type="range">` 上，而 `isEditableTarget()` 把所有 `<input>`
  都当文本编辑态，导致 `handleKeyDown` 整体让位——方向键只剩浏览器对 range 的
  0.1s 微调、Esc 退不出全屏、`f` 与空格全部失灵（表现为"全屏里快进快退不干脆、
  难以正常前进后退"）。现只对真正的文本输入让位，range 滑块照常走插件快捷键
- ⏩ **拖/点进度条跳转不再卡顿或回弹**：旧逻辑在每个 `input` 事件都写
  `video.currentTime`，一次拖动等于几十次 seek——对 YouTube/B 站这类 MSE 流媒体
  会反复中断并重新缓冲，表现为"点不动/跳不过去"。现 `input` 只移动滑块并预览时间，
  真正的跳转在 `change` 提交一次；另加 `pendingSeek` 目标位，跳转落地前不被
  `timeupdate` 的旧 `currentTime` 拉回（防回弹）

## [5.3.0] - 2026-09-29

### 修复 (Fixed)

- 🔧 **CI 恢复可用**：此前所有 job 用 `npm ci` + `cache: 'npm'`，而仓库只有 `pnpm-lock.yaml`；
  `lint` / `type-check` 两个 job 调用的 npm script 根本不存在；release 在 push 事件下用
  `pull_request.head.sha` 拼 tag（恒为空）。现已改为 pnpm + 钉版本、产物传 `dist`、
  用官方 `gh` CLI 发布
- ⚡ **`getCurrentVideo()` 不再每次全页遍历**：原先每次 keydown / pointerdown / play /
  ratechange 都会递归遍历整篇文档加所有 Shadow DOM 与同源 iframe，并对每个 video 强制重排。
  现改为 rAF 帧号 + MutationObserver 的一帧内快照缓存，去重也从 O(n²) 降到 O(n)
- 🐛 **非当前视频不再污染工具栏徽章**：页面上有第二个视频（广告、预览）时，它的速度变化
  不再覆盖受控视频的徽章与站点记忆
- 🐛 **跨 realm 修复补全**：同源 iframe 里的节点属于另一个 realm，此前只有 `isVideoElement`
  做了回退，`collectVideos` 里的 `instanceof HTMLElement` / `HTMLIFrameElement` 仍会把
  iframe 内的 Shadow DOM 和嵌套 iframe 整片漏掉；iframe 内 video 的视口判定也改为用
  它自己 realm 的窗口尺寸
- 🐛 **全屏退出不再抛错**：页面已丢弃视频节点时，退出会尝试重插废弃节点而抛
  `NotFoundError` 中断清理；现已拆出私有 `release()` 区分「节点已被丢弃」与「用户主动退出」
- 🐛 **切标签页回来不会一直冲速度**：`blur` / `visibilitychange` 时清理长按重复定时器
- 🐛 **空格键在网页全屏下与设置页一致**：此前全屏分支没查 `spaceTogglePlay` 和修饰键，
  用户关掉空格切换后全屏里依然生效
- 🐛 **旧版快捷键迁移不再覆盖已存设置**：`migrateLegacyShortcuts` 不再产生显式 `undefined`；
  修饰键全称（`Control`）能正确识别，已存的 `shift+Shift` 脏绑定会被清理
- 🐛 **「清除全部记忆」现在会一并清掉各站点禁用记录**
- 🐛 **Popup 重置后刷新显示**：重置成功后重新拉一次状态，不再停留在旧速度
- 🐛 **测试收集面**：修正 `vitest.config.ts` 的 include，新增 `src/popup` 与 `scripts`，
  此前放在这些目录下的测试永远不会被执行

### 新增 (Added)

- 🧪 **真实扩展 E2E**：用 `--load-extension` 真加载 `dist/` 跑浏览器，覆盖
  `content-loader` 的 `document_start` 桥接、隔离世界、页面脚本抢键、真实 `chrome.storage`
  往返 —— 这些是 jsdom 覆盖不到的
- 🧪 **CI 配置契约测试**：把「配置必须满足的条件」固化成断言，改 CI 时先于 GitHub 给出结果
- 🛡 **CI 新增 e2e job**，release 依赖 test / e2e / build 全绿
- ♿ 设置页与 Popup 补 `aria-labelledby` / `aria-live`，焦点环改用 `:focus-visible`

## [5.2.1] - 2026-04-19

### 修复 (Fixed)

- 🐛 **键盘监听改 `document_start` 桥接抢占注册**，根治站点脚本抢跑 / 吞键
- 🐛 **YouTube 上空格完全放行原生处理**（含 overlay 全屏），避免与站点监听器双重切换
- 🐛 **悬停视频不再全框描边**；overlay 全屏进入时先退系统全屏

## [5.2.0] - 2026-04-19

### 新增 (Added)

- 🧠 **站点速度记忆**：按网站记住播放速度，刷新/重新打开页面时自动恢复（可全局开关、按站点关闭、一键清除）
- 🛡 **最大速度上限**：默认 4x（可配置 1.5–16），加速与预设档位都受其约束，长按不会再冲过头
- 🎯 **受控对象指示器**：鼠标悬停视频时显示"VSC 将控制此视频"角标，当前受控对象显示实时速度；点击视频即锁定
- 🖱 **工具栏 Popup**：显示当前页面速度/播放状态、一键重置 1x、本站速度记忆开关、快捷键速查
- 🌐 **设置页与 Popup 国际化**：接入 `_locales`，支持简体中文 / English / 日本語 / 한국어
- 🐛 **修复**：快捷键绑定为空格键时被归一化为空串的问题（此前无法将空格设为自定义快捷键）

## [5.1.0] - 2026-04-19

### 新增 (Added)

- 🔢 **预设速度**：数字键 `1`-`4` 直达常用档位（默认 1.25x / 1.5x / 1.75x / 2.0x），可在设置页自定义
- ⏯ **全局播放/暂停**：网页全屏外按空格键也能切换播放与暂停（可关闭）
- 🏷 **图标 badge**：当前速度 ≠ 1x 时，工具栏图标显示倍率，随时可读
- 🎛 **设置页**：新增预设速度编辑与空格开关，保存后已打开页面热更新

### 改进 (Changed)

- ✂️ **HUD 极简化**：移除科幻装饰文案（VSC HUD / PLAYBACK VECTOR / aura / orb），只保留大数字 + 趋势箭头；播放/暂停时显示状态字形与当前速度
- ⚙️ 新增 background service worker（ES module），负责 badge 更新

## [5.0.1] - 2026-04-18

### 修复 (Fixed)

- 修复设置页在 `chrome.storage` 失败时仍提示保存成功的问题
- 修复内容脚本在读取设置失败时可能直接失效的问题
- 修复网页全屏退出后播放进度回退到进入全屏时刻的问题
- 修复网页全屏下空格键无法暂停/继续播放的问题

### 发布 (Release)

- 将 Chrome Web Store 发布版本号提升到 `5.0.1`，与线上版本序列对齐
- 重新整理商店发布材料，确保描述与当前真实功能一致

## [1.5.2] - 2026-04-14

### 修复 (Fixed)

- 修复设置页在 `chrome.storage` 失败时仍提示保存成功的问题
- 修复内容脚本在读取设置失败时可能直接失效的问题

### 文档 (Documentation)

- 同步 README、测试说明和架构文档到当前真实实现
- 清理不再执行的旧测试资产，避免测试信号失真

## [1.5.1] - 2026-04-14

### 修复 (Fixed)

- 修复网页全屏退出后播放进度回退到进入全屏时刻的问题
- 修复网页全屏下空格键无法暂停/继续播放的问题

## [2.2.0] - 2026-02-21

### 新增 (Added)

- 🔧 **TypeScript支持**：添加完整的TypeScript类型定义
  - `src/types/` 目录包含所有类型定义
  - 支持JSDoc类型注释
  - 严格的类型检查
- 🧪 **测试增强**：
  - Playwright E2E测试支持
  - 更完善的单元测试覆盖
  - 测试配置文件优化
- ⚙️ **CI/CD工作流**：
  - GitHub Actions自动化
  - 自动化构建和发布
  - 代码质量检查
- 🌍 **多语言支持**：
  - 添加日语(ja)翻译
  - 添加韩语(ko)翻译
- 🎨 **代码质量工具**：
  - Prettier代码格式化
  - Husky Git hooks
  - lint-staged自动修复

### 改进 (Changed)

- 📦 **构建系统**：
  - 更高效的打包配置
  - 生产/开发环境分离
  - 更小的bundle体积
- 🔒 **安全性**：
  - 改进的快捷键冲突检测
  - 保留键位警告
- 💅 **UI/UX**：
  - 现代化指示器样式
  - 毛玻璃效果
  - 流畅动画

### 新增模块

- `src/modules/speedPreset.js` - 预设速度管理
- `src/utils/logger.js` - 日志工具
- `src/utils/shortcutValidator.js` - 快捷键验证

## [2.0.0] - 2024-01-XX

### 新增 (Added)

- 🏗️ **模块化重构**：将单文件代码重构为模块化架构
  - 创建独立的工具函数模块 (`src/utils/`)
  - 创建功能模块 (`src/modules/`)
  - 使用 ES6 模块系统
- 🌐 **国际化支持**：实现 Chrome i18n API
  - 支持中文和英文界面
  - 可扩展的多语言架构
- 🧪 **测试框架**：添加 Jest 测试支持
  - 单元测试覆盖核心功能
  - 测试覆盖率报告
- 🛠️ **构建系统**：添加 esbuild 构建工具
  - 自动打包 ES 模块为浏览器兼容格式
  - 支持开发模式和生产模式
  - 文件监听自动构建
- 📦 **开发工具**：
  - ESLint 代码规范检查
  - package.json 依赖管理
  - npm 脚本自动化任务
- 📝 **文档完善**：
  - JSDoc 注释覆盖所有模块
  - 变更日志 (CHANGELOG)
  - 贡献指南更新

### 改进 (Changed)

- ⚡ **性能优化**：
  - 优化媒体元素缓存策略
  - 改进事件处理性能
  - 减少不必要的 DOM 查询
- 🎨 **代码质量**：
  - 更清晰的模块职责划分
  - 更好的错误处理
  - 更完善的注释和文档
- 📱 **用户体验**：
  - 更流畅的速度指示器动画
  - 更准确的媒体元素检测
  - 更智能的快捷键冲突检测

### 修复 (Fixed)

- 🐛 修复网页全屏模式下控制栏显示问题
- 🐛 修复某些网站上的快捷键冲突
- 🐛 修复 Shadow DOM 中媒体元素检测

### 技术栈 (Technical)

- 升级到 Manifest V3
- 使用 ES6+ 语法
- 模块化架构设计
- 自动化构建流程

---

## [1.3.3] - 2023-XX-XX

### 新增

- 网页全屏模式方向键控制
  - 左右方向键快进快退
  - 上下方向键音量控制
- ESC 键退出网页全屏

### 修复

- 修复全屏模式下暂停时控制栏隐藏问题
- 修复某些 SPA 网站的媒体检测

---

## [1.3.0] - 2023-XX-XX

### 新增

- 网页全屏模式 (Lightbox Fullscreen)
- 自定义快捷键设置页面
- 快捷键冲突检测

### 改进

- 优化媒体元素检测算法
- 改进速度指示器样式

---

## [1.2.0] - 2023-XX-XX

### 新增

- Shadow DOM 支持
- iframe 媒体元素检测
- IntersectionObserver 优化

### 改进

- 性能优化：引入缓存系统
- 防抖优化事件处理

---

## [1.1.0] - 2023-XX-XX

### 新增

- 播放/暂停快捷键
- 速度指示器视觉反馈
- MutationObserver 动态检测

---

## [1.0.0] - 2023-XX-XX

### 新增

- 初始版本发布
- 基本的速度控制功能
- 快捷键支持：加速、减速、重置
- Chrome 扩展基础架构

---

## 版本说明

### 语义化版本规则

- **主版本号 (MAJOR)**：不兼容的 API 修改
- **次版本号 (MINOR)**：向下兼容的功能新增
- **修订号 (PATCH)**：向下兼容的问题修正

### 变更类型

- **Added**: 新增功能
- **Changed**: 功能变更
- **Deprecated**: 即将废弃的功能
- **Removed**: 已删除的功能
- **Fixed**: 问题修复
- **Security**: 安全相关修复

## [3.8.0] - 2026-02-22

### 新增 (Added)

- 🔊 **音量控制功能**
  - 快捷键 `[` 降低音量 10%
  - 快捷键 `]` 提高音量 10%
  - 快捷键 `m` 切换静音
  - 全屏模式下可用方向键上下控制音量
  - 指示器显示当前音量百分比

### 改进 (Improved)

- 优化了音量指示器显示
