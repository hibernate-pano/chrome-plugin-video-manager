# Chrome Web Store Listing — Video Speed Controller

> Last Updated: 2026-10-21
> 本文件是 Chrome Web Store 上架信息的**单一事实来源**（chrome-extensions skill 约定）。
> 标注 ⚠️ 的字段需要发布者确认后才能提交。
>
> 2026-10-21 更新：这一轮只改**对外文案**，不改任何行为。逐句核对了 6.2.0 的
> 真实实现，改掉三处「说错 / 没说清」的地方：
>
> 1. **中英两版在「工具栏图标」那一段内容不对齐** —— 中文那句多了一个分句
>    （「视频在嵌入框（iframe）里时，直接作用到框里那个视频」），英文那句没有。
>    这正是 `INCONSISTENT_LOCALE_METADATA` 的成因（6.0.6 与 6.0.8 两次发布
>    都被它警告过）。英文补上，两边重新逐段对齐。
> 2. **调速角标的出现时机写错了** —— 原文写得像「胶囊淡出就留下角标」，
>    实际是胶囊淡出后**再过约 3 秒**才留下角标（`speedToast.ts` 的
>    `HIDE_DELAY = 900` + `BADGE_DELAY = 3000`）。中英两版都改准。
> 3. **工具栏图标的倍速提示在 1.0x 时不显示倍率** —— 那是 `1.0x` 时标题
>    只写产品名（`background/index.ts` 的 `isDefaultRate`）。文案补上这个前提。
>
> 另：**「主要功能」里补了一段嵌入框（iframe）的能力**（中英各一段）——
> 它是 6.x 最值钱的一条差异，却原先只出现在最下面的「适用范围」里。
>
> 2026-10-20 更新：整份文案对齐到 6.0.9 的真实功能集（字幕跟走、倍速档位菜单、
> 工具栏提示倍速、设置页入口、只接管你正在看的视频、控制条不被网站样式弄乱），
> 并把中英详细描述改成**逐段对齐**（见下方说明）。改动前逐条比对过代码，
> 没有写入任何尚未实现的功能。

## Store Listing

**Extension Name** [REQUIRED]
<!-- Must match manifest.json "name". Max 75 characters. -->

Video Speed Controller — Fullscreen & Keys

> **2026-10-06 决策：改名。** 原名 "Video Speed Controller" 在商店里有 3 个逐字同名的扩展
> （其中 iglupo 那个约 300 万用户）。同名能上架，但搜索结果里三个一模一样的图标和名字
> 摆在用户面前，几乎必然装错——漏斗最上游在漏，且这种损失无法用更好的文案或截图补回来。
>
> 新名把**两件真实差异**写进标题：Fullscreen（网页全屏）与 Keys（可改键的键盘控制）。
> 42 字符，在 75 上限内。
>
> ⚠️ 改名**必须出新包过审**（商店名来自 `manifest.json` 的 `name`）。当前线上是 6.0.8，
> 已确认 PUBLISHED 且无待审版本，此刻是改动成本最低的窗口。
> 改名不影响已安装用户与自动更新——扩展 ID 由公钥派生，与名称无关。
> 详见文末「改名执行清单」。

**Short Description** [REQUIRED]
<!-- Max 132 characters. Shown in search results and tiles. Be specific about function. -->

网页视频一键全屏，字幕跟着走；倍速档位可点选，快捷键可改绑。Fullscreen for web video: subtitles follow, clickable speed presets, rebindable keys.

<!-- 实测 115 字符（上限 132）。2026-10-20 改写。
     为什么改：旧文案只说了「控制条自动隐藏」，而 6.0.9 最有辨识度的三件事
     ——字幕跟着视频走、倍速能点档位、只接管你正在看的那个视频——一件都没出现。
     商店搜索结果里能看到的只有这一句，写什么就等于承诺什么。
     为什么是这 115 个字符：把它留给「字幕跟着走」+「倍速可点档位」，
     因为这两条是 6.0.9 真正的差异点，也最容易让人误以为做不到；
     「只接管你正在看的视频」信息量足但太长（加上就超 132），留到详细描述里讲。
     「控制条自动隐藏」相对弱，且详细描述里有，不占这里的名额。
     实测命令见文件末尾的「提交前自检」。 -->

**Detailed Description** [REQUIRED]
<!-- Max 16,000 characters. CWS 会剥离 markdown，所以用换行而不是 bullet 语法。
     用户视角，禁提实现细节（API / 库 / 框架 / 代码模式）。
     中英双语用 --- 分隔。 -->

<!--
  ⚠️ 中英双语是**逐段对齐**的，这是刻意的，不是碰巧。

  6.0.6 与 6.0.8 两次发布，CWS 都返回了 `INCONSISTENT_LOCALE_METADATA`
  （"Mismatching metadata: Discrepancies in feature desc…"）——
  已经排除扩展包内 i18n 的可能（`_locales/en` 与 `_locales/zh_CN` 各 48 个键、
  键集合完全一致，且不含 name/description 键），成因就在**商店 listing 的
  中英文描述之间**。

  「逐段对齐」在这里的定义：两边段落数相同、顺序相同、每段讲同一件事。
  这样审核员对照两种语言时，看到的是同一条承诺的两种说法，而不是两份功能清单。
  下面每一段的段首标题也一一对应（主要功能 / What it does 等）。
-->

Video Speed Controller 把网页里的视频变成一个干净的全屏播放器，并给你一组安静的键盘控制。

主要功能
网页全屏：按 f 让正在看的视频铺满整个视口，再按 f 或 Esc 退出，退出后页面布局完整还原。鼠标移动时浮现一条极简控制条，静止 3 秒自动淡出；控制条包含播放/暂停、可拖动的进度、时间、音量、当前速度与退出。和站点播放器自带的全屏不一样：视口里铺满的是视频本身，站点自己那些层（弹幕、推荐面板）留在画面外面，字幕反而跟着视频一起走。
控制条不会被网站样式弄乱：有些网站给页面上所有按钮和滑块都定了自己的样式，可能把你的播放器控制条撑变形。扩展的控制条不吃这一套，看起来始终是你熟悉的那个样子。
字幕跟着视频一起进出全屏：页面上盖在视频上的字幕（包括沉浸式翻译这类插件生成的）会一起被带进全屏，退出时也归回原处，不会被画面盖住。
播放速度：按 = 加速、- 减速，每次 0.1 倍；按住任一键可连续调速。按 0 回到 1.0 倍。调速时角落会淡入一个「1.5x」小胶囊，约一秒后淡出；再过约 3 秒，胶囊的位置会留下一枚很淡的小角标，让你随时看得到当前是几倍速（视频暂停、滚出画面或进入全屏时它就消失）。不像某些扩展会记住你上次的倍速：任何视频都从 1.0x 开始，看网课还是看纪录片，由你当场决定。
鼠标也能调速：全屏控制条上的倍速可以点开，列出 0.5x 到 4x 的常用档位（含 0.5x 这个慢看档），点一下就切过去。键盘侧仍是 = / - 的 ±0.1 微调，两种方式互不干扰。
播放控制：空格播放或暂停，左右方向键后退或前进 5 秒。
只接管你正在看的那个视频：页面上有多个视频时，扩展只对正在播、或者你刚刚点过/操作过的那个生效；分不清是哪一个时它会让路，把按键还给页面，而不是替你猜一个。
嵌入框（iframe）里的视频同样被接管，同源还是跨域都一样：能调速、能快进，也能进网页全屏 —— 而且网页全屏会铺满整个页面，不只是铺满那个嵌入框自己的一小块。快捷键只作用在焦点所在的那一层（见下方「适用范围」）。
快捷键由你决定：全部 7 个动作都能在设置页改绑，留空即禁用该动作。重复绑定、以及浏览器自己占用的键（如 Ctrl+Shift+I），都会在保存前被拦下 —— 存下去也永远不会生效的绑定，不如不让你存。
点击工具栏图标即可切换网页全屏 —— **视频在嵌入框（iframe）里时，直接作用到框里那个视频**；鼠标悬停在图标上时，提示里会显示这个标签页当前的倍速（倍速是 1.0x 时只显示扩展名字，因为 1.0x 没什么可报的）。

怎么用
安装后无需任何配置即可使用。需要改键时按 Ctrl+Shift+, 打开设置页（macOS 上是 ⌘⇧,），点一下想改的那一行，直接按新键即可；也可以右键扩展图标选择「选项」。设置页支持简体中文与 English。

适用范围
只控制视频，不控制纯音频。iframe（嵌入框）里的视频也会被接管，同源还是跨域都一样：能调速、能快进，也能进网页全屏 —— 而且网页全屏会**铺满整个页面**（扩展会让装着播放器的那一整块嵌入框撑满屏幕），不只是铺满嵌入框自己那一小块。快捷键只作用于焦点所在的那一层：焦点在顶层页面时，嵌入框里的视频不会被牵连；焦点在嵌入框里时，顶层页面里的视频既不会被调速，也进不了网页全屏。要让快捷键作用到嵌入框里的视频，先把焦点点进那个嵌入框；反过来，焦点在顶层而视频在嵌入框里时，扩展会提示「视频在嵌入框里」，而不是让你白按一场。点扩展工具栏图标则会直接作用到页面上真正有视频的那一层。受保护的点播内容（例如流媒体平台的加密视频）由浏览器保护，无法接管。极少数页面在重建布局时会退回更简单的显示方式。

隐私
不收集任何个人数据，也不向开发者发送任何数据。你的快捷键设置保存在 Chrome 的同步扩展存储中，因此会跟随你的 Chrome 账号。扩展不保存你的浏览记录，也不跨设备同步你的倍速——倍速只留在当前这个标签页里，关掉浏览器就没了。它只在页面上查找并控制视频元素。

---

Video Speed Controller turns web video into a clean, fullscreen player, and gives you quiet keyboard control over playback.

What it does
Page fullscreen: press f to fill the viewport with the video you are actually watching; f or Esc leaves, and your page layout is fully restored. A minimal control bar appears when you move the mouse and fades out after 3 seconds of stillness. It carries play/pause, draggable progress, time, volume, current speed and exit. Unlike the site's own fullscreen button, what fills the viewport here is the video itself — the site's own layers (bullet comments, recommendation panels) stay outside the picture — while the subtitles travel with the video.
Your site's styles cannot mess it up: some sites style every button and slider on the page, which can leave a player control bar stretched out of shape. The extension's control bar does not take that, and keeps looking like the one you know.
Subtitles follow the video in and out of fullscreen: subtitles sitting on top of the video (including ones generated by tools like immersive translation) are carried in with the video and put back afterwards, instead of being covered by the picture.
Playback speed: press = to speed up and - to slow down, in 0.1x steps; hold either key to keep stepping. Press 0 to return to 1.0x. A small "1.5x" capsule fades in for about a second, then fades out; about three seconds later it leaves a faint little badge in the corner, so you can always see the rate you are at (it goes away when the video pauses, scrolls out of view, or you go fullscreen). Unlike some extensions that keep your last rate: every video starts at 1.0x, so a lecture at 2.0x never follows you into the documentary you open next.
Mouse speed control too: on the fullscreen control bar, the speed label opens a list of common steps from 0.5x to 4x (including 0.5x for slow viewing); pick one and it applies. The keyboard side stays = / - for ±0.1 fine steps, and the two never fight each other.
Playback control: Space plays or pauses. Left and Right arrows skip back or forward 5 seconds.
It only takes over the video you are watching: on a page with several videos, the extension acts on the one that is playing, or the one you just interacted with; when it cannot tell which one you mean, it steps aside and hands the keys back to the page instead of guessing.
Videos inside an embedded frame (iframe) are taken over as well, same-origin or cross-origin: they can be sped up and skipped, and they can enter page fullscreen — and that fullscreen fills the whole page, not just the iframe's own small box. Shortcuts only reach the layer that holds the focus (see "Scope" below).
Shortcuts you control: all seven actions can be rebound on the options page, and any of them can be left empty to disable it. Duplicate bindings and shortcuts the browser reserves (such as Ctrl+Shift+I) are both blocked before you save — a binding that could never fire is worse than no binding at all.
Click the toolbar icon to toggle page fullscreen for the current tab — if the video sits in an embedded frame (iframe), it acts on that video directly; hover over the icon and the tooltip tells you the rate that tab is running at (at 1.0x it shows just the extension name, since there is no rate worth reporting).

How to use
Works out of the box with no setup. To rebind a key, press Ctrl+Shift+, to open the options page (⇧⌘, on macOS), click the row you want, and press the new key; you can also right-click the extension icon and choose "Options". The options page is available in English and Simplified Chinese.

Scope
Controls video only, not audio-only players. A video inside an iframe is taken over as well, whether that iframe is same-origin or cross-origin: it can be sped up and skipped, and it can enter page fullscreen — and that fullscreen fills the **whole page** (the extension expands the frame that holds the player to fill the screen), not just the iframe's own small box. Shortcuts only reach the layer that holds the focus: while the focus is on the top-level page, the video inside the iframe is left alone; while the focus is inside the iframe, the top-level page's video is not sped up and cannot enter page fullscreen. Click into the iframe first to have the shortcuts act on its video; the other way round — focus on the top-level page while the video sits in an iframe — the extension tells you where the video is instead of leaving you pressing keys at nothing. Clicking the toolbar icon always acts on the layer that actually holds the video. Protected on-demand content, such as encrypted video on streaming services, is protected by the browser and cannot be taken over. A few pages fall back to a simpler display mode when they rebuild their layout.

Privacy
No personal data is collected, and nothing is sent to the developer. Your shortcut settings are stored in Chrome's synced extension storage, so they follow your Chrome account. The extension keeps no record of which sites you visit, and your playback rate never leaves the tab it belongs to — it is gone once you close the browser. It only looks for and controls video elements on the pages you visit.

**Category** [REQUIRED]
<!-- CWS 当前的可选值（18 项）：Accessibility, Art & Design, Communication, Developer Tools,
     Education, Entertainment, Functionality & UI, Games, Household, Just for Fun,
     News & Weather, Privacy & Security, Shopping, Social Media & Networking, Tools,
     Travel, Well-being, Workflow & Planning -->

Functionality & UI

> ⚠️ skill 模板里列的是一组**过时**的分类（Blogging / Photos / Search Tools / Sports 等），
> 与当前 Dashboard 的选项不一致。以 Dashboard 实际显示为准。

**Single Purpose** [REQUIRED]
<!-- One sentence. Narrow and easy to understand. -->

Turns the web video you are watching into a clean fullscreen player and provides quiet keyboard control over playback speed and play/pause.

> 2026-10-20 微调：原句是 "Turns **any** web video into ..."。
> `any` 在这里既可以读成「任意一个视频」，也可以读成「所有网站上的视频」——
> 后者是**绝对化表述**，CWS 的拒审清单上有一条。改成 "the web video you are
> watching" 之后既消除了歧义，也正好是 6.0.9 的真实行为（只接管你正在看的那个）。

**Primary Language** [REQUIRED]

English

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | `icons/icon128.png` |
| Screenshot 1 [REQUIRED] | 1280×800 | ✅ Ready | `store-assets/output/store-fullscreen.png` |
| Screenshot 2 [RECOMMENDED] | 1280×800 | ✅ Ready | `store-assets/output/store-controls.png` |
| Screenshot 3 [RECOMMENDED] | 1280×800 | ✅ Ready | `store-assets/output/store-speed-toast.png` |
| Screenshot 4 | 1280×800 | ✅ Ready | `store-assets/output/store-options.png` |
| Screenshot 5 | 1280×800 | ✅ Ready | `store-assets/output/store-fresh-speed.png` |
| Small Promo Tile [RECOMMENDED] | 440×280 | ✅ Ready | `store-assets/output/store-promo-tile.png` |
| Marquee Promo Tile | 1400×560 | ⬜ Not created | |

<!-- Status options: ⬜ Not created | 🟡 Needs update | ✅ Ready -->

> ✅ 2026-10-20：5 张截图与 promo tile 全部按 6.0.9 的真实 UI 重新生成并逐张看过。
> 之前是 🟡 的两个原因都已消除：
> 1. **图是旧的** —— 6.0.9 重做了控制条（搬进 shadow root、换配色排版、倍速变成
>    可点的按钮），旧的 6.0.8 图上的控制条跟实际跑出来的不是同一款。
>    现已全部重截（mtime 2026-10-20 15:47）。
> 2. **promo tile 副标题带着 `any`** —— 已改成 `Clean fullscreen for web video`
>    （`scripts/render-icons.mjs:33` 的 `TILE` 常量）。
>
> ⚠️ 生成脚本里的 `any` 问题此前一直没被真正修掉：文案在本文件里写着
> 「首图标题已改成 `Watch web video fullscreen`」，但 `scripts/generate-store-assets.mjs`
> 的 `CAPTIONS` 里仍然是 `Watch any web video fullscreen` —— 审核员读到的
> Short Description 与首图大标题口径不一致。现在两边都已改掉并重新出图。
> **改图上的字只有一处地方能改**，见下方「Screenshot Notes」。

### 素材文案的唯一来源（改图前先看这里）

图上的每一句字都写在**脚本常量**里，不在本文件里。改文案 = 改常量 + 重跑脚本：

| 图上的位置 | 改哪个常量 | 行号 |
|---|---|---|
| 首图大标题（英文） | `scripts/generate-store-assets.mjs` → `CAPTIONS.en.fullscreen` | `scripts/generate-store-assets.mjs:25` |
| 首图大标题（中文） | `scripts/generate-store-assets.mjs` → `CAPTIONS.zh_CN.fullscreen` | `scripts/generate-store-assets.mjs:32` |
| 其余四张标题 | `scripts/generate-store-assets.mjs` → `CAPTIONS.<locale>.<key>` | `scripts/generate-store-assets.mjs:23`（整个 `CAPTIONS` 对象起于这一行） |
| promo tile 副标题 | `scripts/render-icons.mjs` → `TILE` 里的 `<text>` | `scripts/render-icons.mjs:33` |

改完按顺序跑：

```bash
pnpm build          # 先构建 dist/ —— 截图脚本把 dist 当 web 根目录服务
pnpm icons          # 重画 icons/ 与 promo tile
pnpm store:assets   # 重截 5 张图
```

> ⚠️ 行号会漂。上面那几行是 **2026-10-20** 的位置；下次改动前用
> `grep -n "fullscreen:" scripts/generate-store-assets.mjs` 与
> `grep -n "Clean fullscreen" scripts/render-icons.mjs` 重新定位，
> 然后把这里的行号一起更新 —— 这张表存在的意义就是让「图上的字」有唯一的出处。
>
> 上一版这里只写了「改它要动 `scripts/render-icons.mjs` 里的 `TILE` 常量」，
> 没有说是哪一行，于是 promo tile 的 `any` 一直没人改 —— **写「改哪里」不够，
> 要写「改哪一行」**。

### Screenshot Notes

全部 1280×800，英文文案，各叠一句标题；`store-assets/output/` 被 .gitignore 忽略，用
`pnpm store:assets` + `pnpm icons` 重新生成（脚本见 `scripts/generate-store-assets.mjs`、
`scripts/render-icons.mjs`）。

> 2026-10-20 逐张对过 6.0.9 的真实 UI。除了**首图标题**（见下）其余标题全部保留不变 ——
> 每一句都还对得上，没有一句是 6.0.9 做不到的。变的是**图**（控制条换了样子、
> 设置页多了内容）。生成脚本里的 `CAPTIONS` 常量与这份清单保持一致，
> 图上的字和这里说的必须一字不差。

1. `store-fullscreen` — 首图。全屏态 + 底部控制条，标题 `Watch web video fullscreen`
   （控制条本体在 6.0.9 换了配色与排版，这张要重截）
2. `store-controls` — 控制条特写，标题 `Auto-hiding controls, out of your way`
   （同上，控制条换了样子，这张要重截）
3. `store-speed-toast` — 调速小胶囊特写，标题 `Fine-tune speed in 0.1x steps`
4. `store-options` — 设置页 7 行改绑表（英文），标题 `7 shortcuts you can rebind`
   （6.0.9 的设置页多了产品名、深色模式与底部版本号；且**方向键现在显示成箭头符号**
   （`←` `→`）而不是 `ArrowLeft` / `ArrowRight` —— 旧图里显示的是后者，
   与扩展实际显示的不一致。这张要重截）
   ⚠️ **2026-10-21：设置页在 6.2.0 又变了 —— 多了第二张卡片**
   （「使用引导 / 重新显示使用引导」），而且快捷键输入框从 200px 加宽到 250px
   （原宽度装不下「按下要绑定的键 · Backspace 清空」这句提示，会被裁成半句）。
   旧图与现在的设置页**已经不是同一页**了，这张必须重截。
   标题 `7 shortcuts you can rebind` 仍然成立（可改键的动作仍是 7 个）——
   第二张卡片不是可改键的动作。
5. `store-fresh-speed` — 「不记忆速度」，标题 `Never inherits a speed — always 1.0x`
   （6.0.7 起替换原站点速度记忆截图。走真实 UI：网页全屏 + 控制条右下角如实显示 `1x`；
   poster 特意换成 `Documentary · Episode 3`，避免与首图 `store-fullscreen` 长得一样浪费展示位）

⚠️ 第 2、3 张是 2x 放大特写，不是像素裁切。

> **首图标题为什么改了**：原来是 `Watch any web video fullscreen`。那个 `any`
> 与 Single Purpose 里的 "any web video" 是同一个毛病 —— 可以被读成
> 「所有网站上的视频」，属绝对化表述。两处口径不一致时，审核员只会挑最刺眼的那处。
> 改成 `Watch web video fullscreen` 后既没有那个歧义，意思也没丢。
> ⚠️ 改图时必须同步改 `scripts/generate-store-assets.mjs:25` 的
> `CAPTIONS.en.fullscreen` 与 `scripts/generate-store-assets.mjs:32` 的
> `CAPTIONS.zh_CN.fullscreen`。
>
> **同样的问题在 promo tile 上**：副标题写的是 "Clean fullscreen for any web video"
> （`scripts/render-icons.mjs:33` 的 `TILE` 常量）。它由 `pnpm icons` 生成，
> 不在截图脚本里，容易被漏掉 —— 一并改掉。
>
> ✅ 2026-10-20 已全部改完并重新出图（上面 5 张 + promo tile 都逐张看过，
> 首图大标题现在是 `Watch web video fullscreen`，promo tile 副标题是
> `Clean fullscreen for web video`，图上**再无 `any`**）。
>
> **建议换掉第 3 张**：现在 5 张里没有任何一张能让人看出 6.0.9 最直观的新能力
> ——「倍速可以点，弹出 0.5x–4x 的档位菜单」。`store-speed-toast` 展示的是
> 6.0.7 就有的调速胶囊，信息量最低；若要换，把它换成**倍速档位菜单打开的样子**。
> （商店截图上限 5 张，所以是替换而不是新增。）
> ⚠️ 改图必然要同步改 `scripts/generate-store-assets.mjs` 里的 `CAPTIONS`。

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `storage` | permissions | Stores your shortcut bindings so they persist and sync with your Chrome profile, plus one flag that remembers whether the one-time intro has already been shown on this device, and per-tab state that only lives in the current browser session (the playback rate of each open tab, and which frame on the page currently has focus). Only the shortcut bindings are synced to your Chrome account; everything else stays on the device or in the current browser session. |
| `<all_urls>` | host_permissions | Video playback is not tied to any particular site, so the extension has to find and control the video element on whatever page you are watching. It reads only video elements and their playback state, and measures the position and size of overlays such as subtitles so they can follow the video into fullscreen. It does not read page text, form data, or your browsing history, and nothing is sent anywhere. The published package contains **no third-party libraries** (it is 15 files, about 230 KB) and makes **no network requests at all** — you can verify both by unzipping it: the only URLs in the whole build are this listing's homepage and the privacy-policy link in the settings page. |

> 2026-10-20 更新 `storage` 那一行：6.0.9 新增了「标签页当前倍速」这份数据
> （`chrome.storage.session`）。旧文案说 "Nothing else is stored" —— 现在**不准确**，
> 而"不准确"是 CWS 的拒审项之一，所以必须改。
> 为什么这么写仍然算"最小披露"：
> - 首次引导标记（`chrome.storage.local`）6.0.5 就在存了 —— 旧文案其实漏了它；
> - 标签页倍速（`chrome.storage.session`）6.0.9 才加，**只在浏览器会话内**存在，
>   关掉浏览器即消失，**不会同步到任何设备**（这一点与 `sync` 的快捷键不同，
>   所以在表里也分开表述）。
>
> 2026-10-20 第二次更新（6.1.0）：`storage.session` 里又多了「标签页当前聚焦的
> frame」。它是一个**整数**（Chrome 的 frameId），不含任何页面内容、不含 URL、
> 标签页关掉即删除。之所以要存它：service worker 空闲 30 秒就被回收，
> 内存里记的 frame 会丢 —— 丢了之后点扩展图标会打不开 iframe 里的视频
> （用户看到「此页面没有视频」）。文案里明确写了它是 "which frame on the page
> currently has focus"，别让审核员以为我们存了页面的浏览轨迹。
>
> `<all_urls>` 那一行补了"测量字幕浮层的位置与尺寸" —— 6.0.9 重写了字幕跟随
> 的实现，审核员如果自己装扩展，会看到扩展确实在测量浮层几何；提前说清楚，
> 比被问出来好。
>
> 6.1.0 的 `<all_urls>` 说明仍然成立：内容脚本注入到所有 frame 之后，
> 它读的**仍然只有 video 元素与其播放状态**（以及字幕等浮层的几何）。
> 新增的 frame 焦点信息是浏览器给的 frameId，扩展**不读** frame 里的内容。

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** No — 开发者不收集任何数据，也不接收任何数据。

但按 CWS 的口径，「存在浏览器里但会同步出设备」也算 off-device transmission，所以下表要如实勾选：

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
|-----------|-----------|------------------------|---------|---------------------------|
| Personally identifiable info | No | No | — | No |
| Health info | No | No | — | No |
| Financial info | No | No | — | No |
| Authentication info | No | No | — | No |
| Personal communications | No | No | — | No |
| Location | No | No | — | No |
| Web history | **No** | No | 6.0.7 起不再记录任何站点信息；历史版本曾按 hostname 记忆播放速度，升级时已自动清除 | No |
| User activity | **Yes** | **Yes** | 快捷键绑定存于 `chrome.storage.sync`，因此会随 Chrome 账号同步到 Google 服务器。除此之外还存六项**不同步**的数据：设备上的四样引导状态（`chrome.storage.local`：已展示标记、主动关闭次数、冷却到期时间、一次性认领锁），以及每个打开标签页的两项（`chrome.storage.session`：当前倍速与报出它的 frame 编号、当前聚焦的 frame —— 仅本次浏览器会话有效、关闭浏览器即消失） | No |
| Website content | No | No | 只读视频元素的播放状态用于控制播放；字幕等浮层只测量其位置与尺寸（宽/高/行数），不读取、不保存文字内容 | No |

> ⚠️ 上面两行 `Yes` 是刻意保守的如实披露。`chrome.storage.sync` 属于 off-device
> transmission，写成「全部存在本地」会与代码不符 —— 那是拒审项。
> 提交时需在 Dashboard 的数据使用表单里与上表保持一致。
>
> 2026-10-20 更新 `User activity` 那一行：6.0.9 多了标签页倍速（`storage.session`）。
> 它**不跨设备**，所以没有把 "Transmitted Off-Device" 改成更多内容 —— 但必须在
> Purpose 里写清楚，避免审核员以为只有快捷键会被存。
> 同一行里顺带补上了 6.0.5 就有的「首次引导标记」：旧文案连它都没提。
>
> 6.1.0 在同一行里补了「当前聚焦的 frame」：一个整数（frameId），
> 标签页关闭即删除，不含 URL、不含页面内容。它**不跨设备**，
> 所以 "Transmitted Off-Device" 那一栏不变。
>
> `Website content` 那行补了字幕的测量口径 —— 扩展测的是浮层的几何（宽/高/行数），
> 不是字幕文字本身；说清楚这一点，比笼统写「不读取页面内容」更经得起对照。

### Data Use Certification

- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL** [REQUIRED]

https://github.com/hibernate-pano/chrome-plugin-video-manager/blob/main/PRIVACY.md

> 政策正文在仓库根目录的 `PRIVACY.md`（中英双语）。
> 2026-10-20 已补齐 —— 之前这一栏是空的，而上表披露了 User activity
> （快捷键绑定走 `chrome.storage.sync`），**这是 CWS 的硬性拒审项**。
>
> 上面的 URL 用仓库 blob 链接：仓库已公开，不需要额外搭 GitHub Pages。
> 如果 CWS 的审核员不点开链接、需要能直接渲染的页面，就改用 GitHub Pages
> 并把 URL 换成 `https://<user>.github.io/chrome-plugin-video-manager/privacy`。

### 已核实但**不成立**的顾虑（2026-10-20 审计）

审计提出「`web_accessible_resources` 把 content.js 暴露给所有页面，是安全暴露」。
**实测不成立**，记录在此以免下一个人重复调查：

- 页面确实能 `fetch('chrome-extension://<id>/content.js')` 拿到源码（42KB）——
  但**任何**扩展的内容脚本源码都是如此，这是扩展的固有属性，不是我们特有的暴露。
- 页面**猜不到扩展 ID**：没有 `<script src>` 泄漏，`chrome.runtime.id` 在页面 realm
  里根本不存在（实测 `chrome.runtime` 为 undefined）。要拿到 ID 必须先有别的漏洞。
- 页面即使 import 到我们的 content.js，**拿不到任何扩展能力**：
  它在页面的 realm 里执行，`chrome.runtime` / `chrome.storage` 均为 undefined，
  模块也没有导出任何东西。扩展 API 只在 content script 的隔离世界里存在。
- 试过 `use_dynamic_url: true`（Chrome 102+ 的硬化手段，让 URL 每次会话随机）：
  **与 content script 的动态 `import()` 不兼容** —— content-loader 需要在
  `document_start` 同步 import，动态 URL 此时还拿不到。实测 7 条 E2E 全挂，已撤回。

结论：**保留现状**。`web_accessible_resources` 是动态 import 的硬性要求，
去掉它扩展根本加载不起来。

## Distribution

**Visibility**: Public
**Regions**: All regions

## Developer Info

**Publisher Name** [REQUIRED]

Jasper Pan

**Contact Email** [REQUIRED]

panbo362472407@gmail.com

**Support URL / Email** [RECOMMENDED]

https://github.com/hibernate-pano/chrome-plugin-video-manager/issues

> 仓库已于 2026-10-06 转为公开，并配好 bug / 功能建议两份 issue 模板。
> 商店 listing 的 Support URL 是很多用户判断「作者是否还活着」的信号，
> 而且它**不经过审核**，可以随时改。

**Homepage URL** [RECOMMENDED]

https://github.com/hibernate-pano/chrome-plugin-video-manager

## Version History

### 贴进 Dashboard 用这一段（**商店那一栏是给用户读的**）

中文（默认语言请用下面这段英文）：

```
6.2.0 — 嵌入框里的视频也能接管了：跨域嵌入框同样能调速、能快进、能进网页全屏，
而且那个全屏现在真的铺满整个页面。焦点在顶层而视频在嵌入框里时，扩展会告诉你
视频在哪儿，不再让你白按一场键。空格不再抢「文章里嵌的小播放器」。
首次引导现在真的会出现了 —— 此前它一次都没弹过，你从来没见过它说的那些快捷键。
手机窄屏上，全屏的「退出」按钮不再被挤出屏幕（此前在 390px 宽的手机上根本点不到，
你会被关在全屏里）；而且全屏里始终留着一枚退出按钮，不会跟着控制条一起消失。
在有些站点上（那些给页面加了 transform 做加速的），网页全屏之前是一片黑 ——
没有画面、没有控制条、连退出按钮都看不见；现在正常了。
窄屏手机上，那枚常驻的退出按钮与控制条里的退出按钮也对齐了（此前是两个位置，
你不知道该点哪个）。系统的「减少动效」现在同样管到「扩展已更新，请刷新本页」。
```

English（**商店的默认语言，英文这段是必须的**）：

```
6.2.0 — Videos embedded in iframes can be controlled now: cross-origin embeds
can be sped up, skipped, and taken to fullscreen, and that fullscreen really
fills the whole page. When the focus is on the top page but the video is in an
embed, the extension tells you where it is instead of letting you press keys at
nothing. Space no longer hijacks a small player embedded in an article.
The first-run guide now actually shows up — it used to never appear, so you
have never seen the shortcuts it describes. On a narrow phone screen the
fullscreen exit button is no longer pushed off the edge (at 390px wide you
could not click it, which left you stuck in fullscreen), and there is now
always an exit button in fullscreen instead of it vanishing with the bar.
On some sites (those that add a CSS transform to the page for speed), page
fullscreen used to be a black screen — no picture, no controls, not even an
exit button; it works now. On narrow phones the always-on exit button also
lines up with the one in the control bar (they used to sit in two different
places, so you never knew which one to click). Your system's "reduce motion"
setting now applies to the "extension has been updated, please refresh" notice
as well.
```

> ⚠️ **只贴 6.2.0 这一条。** 6.0.9 与 6.1.0 **从未单独发布过** ——
> 它们是仓库内部的编号（6.0.9 排在审核里、6.1.0 压根没进过商店），
> 内容全部由 6.2.0 这个包一起发出去。给用户列一个他机器上**从来没出现过**的
> 版本号，只会让用户读不懂「我装的是哪一版」。

> ⚠️ **不要把下面那张表整列贴进 Dashboard。** 那是**仓库内部**的完整记录
> （每一项都对照过代码或测试），写给下一个维护者看；商店那一栏是给用户看的。
> 上面那段是同一批改动的**用户视角**版本。

### 仓库内部完整记录

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 6.2.0 | 2026-10-21 | 审计驱动的第六轮：**某些站点上网页全屏曾是一片黑**（站点给 `<body>` 加 `transform` 做加速时，`position: fixed` 相对 body 的盒子定位，画面与控制条、退出按钮全部飘到视口之外 —— 浮层现在挂在 `<html>` 上，免疫）；窄屏档（≤430px）第一次有了回归守卫（收起态退出钮必须与控制条退出钮同位）；「减少动效」现在管到「扩展已更新」提示；页面级提示有了第三套 token（系统消息）；「站点有没有点名这条视频」收成**一份**判据；页面改坏 `matches`/`closest` 时统一退化而不崩；审计驱动的第四轮：**嵌入框里的网页全屏现在铺满整个页面**（此前只铺满嵌入框自己那一小块 —— 名不副实）；**「视频在嵌入框里」不再是一片沉默**（焦点在顶层而视频在嵌入框里时，扩展会告诉你视频在哪儿，而不是让你白按一场）；**空格不再抢「文章里嵌的小播放器」**（只在你此刻真的在跟这个视频互动时才接管，否则空格照常翻页）；首次引导会量一量嵌入框的大小，放不下就退到精简版；全屏里用键盘调速，控制条会醒过来；暂停后恢复播放，倍速角标自己回来；改键后已打开的页面立刻生效；读屏用户能听见快进快退与进/出全屏；**每次按键不再重扫整页**（长按某个键时尤其明显）；**（6.1.0 那一轮）**审计驱动的第三轮：**iframe 里的视频终于能调速、也能进网页全屏**（此前按 `=` 完全没反应、iframe 里的视频也搬不进网页全屏 —— 键盘事件只到得了焦点所在的那个文档，而内容脚本只注入顶层文档）；注意此时网页全屏铺满的是 **iframe 自己的区域**，不是整个页面（6.2.0 改掉了这一条）；缩放过的 iframe 里提示位置不再偏掉一半；点扩展图标只发给用户此刻聚焦的那一个 frame（此前会同时进好几次全屏、弹好几个提示）；service worker 被回收后图标依然认得该去哪个 frame；读屏用户能听见播放/暂停与快进快退（此前这些动作**完全静默**）；读屏播报节流；页面级提示的样式不再被站点的 `!important` 打穿 | 待发布 |
| 6.0.9 | 2026-10-20 | 审计驱动的修复轮：网页全屏的字幕**真的**可见了（6.0.8 号称修好、实测从未生效 —— 字幕判据量错了对象、DOM 顺序不足以决定可见、字幕容器塌成 0 宽，三个独立原因）；控制条搬进 shadow root（站点 CSS 打不穿）；不再全站劫持按键（只有用户正在看的视频才被接管，多视频页面认怂）；页面伪造的键盘事件不再能驱动扩展；设置页 Tab 不再被吞（此前纯键盘用户被困在输入框里）；控制条滑块键盘可用；设置有了入口（`Ctrl+Shift+,`）；工具栏图标显示当前倍速；控制条倍速可点击（档位菜单）；调速胶囊淡出后留下一枚很淡的小角标（视频暂停 / 滚出视口 / 进全屏时消失）；读屏播报通道；控制条视觉重做与对比度修复；设置页深色模式与产品名；补上隐私政策 | 待发布 |
| 6.0.8 | 2026-10-08 | **不再记忆站点速度**（任何视频都从 1.0x 开始，速度是用户当场的选择而非隐形默认规则）；**网页全屏不再弄丢沉浸式翻译等插件的字幕**（字幕层跟着视频一起进出全屏，弹幕不搬）；同时清掉老用户机器上残留的站点访问记录 | **Published**（2026-10-22 经 v2 API `fetchStatus` 核实：`deployPercentage=100`，已是**当前线上版本**） |
| 6.0.6 | 2026-10-06 | **商店改名**为 `Video Speed Controller — Fullscreen & Keys`（原名有 3 个逐字同名扩展，几乎必然导致装错）。功能与 6.0.5 完全一致，无代码变更 | **Published**（改名已上线，100% 部署） |
| 6.0.5 | 2026-10-04 | 新安装时会在你开始看视频后提示一次常用快捷键（之后不再出现）；无法接管的视频会明确告知而不是毫无反应；修复全屏进度条偶尔卡住不动的问题 | **Published**（2026-10-06 经 v2 API fetchStatus 核实，deployPercentage=100，已自动推给全部用户） |
| 6.0.4 | 2026-10-04 | 修复在网页全屏里点击视频画面无法暂停/播放的问题（此前只有键盘快捷键有效）；点击语义现在与站点原生一致，双击行为不变 | Draft |
| 6.0.3 | 2026-10-04 | 修 6 个影响边界缺陷（无 body 文档抛异常、shadow DOM 输入框被吞键、不可见视频被调速、iframe 提示错位、样式不自愈、跨 document 按 f 静默吞键） | **Published**（2026-10-06 经 v2 API fetchStatus 核实，deployPercentage=100） |
| 6.0.2 | 2026-10-04 | CI 升到 Node 24 与 Actions 新主版本；清理分支 | Draft |
| 6.0.1 | 2026-10-04 | 修速度记忆丢失、全屏回退抛错、设置写放大 | Draft |
| 6.0.0 | 2026-10-02 | 大减法：砍 Popup/badge/预设/上限/HUD/悬停胶囊/日韩语；新增全屏控制条与极简调速提示；快捷键扩到 7 个可自定义 | Draft |
| 5.2.1 | 2026-08-30 | 已被 6.0.3 取代 | 已淘汰 |

> ⚠️ **2026-10-20 逐条核对**：上面这一行里的每一项都对照过代码或测试，
> 没有把「计划做」写成「已做」。核实方式记在这里，避免下一个人重复查：
>
> | 描述的能力 | 核实位置 |
> |---|---|
> | 字幕跟着进出全屏 | `src/content/overlayLayers.ts`（墨水范围判据）、`src/content/fullscreenController.ts`（搬运与还原） |
> | 站点 CSS 打不穿控制条 | `src/content/controlsStyles.ts`（独立样式表 + shadow root） |
> | 只有正在看的视频被接管 | `src/content/videoRegistry.ts`（视口/面积/交互时间判据） |
> | 页面伪造事件不驱动扩展 | `src/content/keyboardController.ts`（`isTrusted` 过滤） |
> | 设置页 Tab 不被吞 | `src/options/index.ts`（Tab / Enter / Escape 分支） |
> | 控制条滑块键盘可用 | `src/content/keyboardController.ts`（range 放行） |
> | `Ctrl+Shift+,` 打开设置 | `manifest.json` 的 `commands` + `src/background/index.ts` |
> | 工具栏图标显示当前倍速 | `src/background/index.ts`（`action.setTitle` + `storage.session`） |
> | 倍速档位菜单 | `src/content/fullscreenControls.ts`（`SPEED_RATES` + `role="menu"`） |
> | 读屏播报 | `src/content/liveRegion.ts` + `transientPill.ts` |
> | 调速胶囊淡出后留下常驻小角标 | `src/content/speedToast.ts`（`scheduleBadge` / `dismissBadge`）、`src/content/runtime.ts`（进全屏时撤下） |
> | 设置页深色模式与产品名 | `src/options/options-theme.ts`、`_locales/*/messages.json` |
> | 隐私政策 | 仓库根目录 `PRIVACY.md` |
> | 安全策略 | 仓库根目录 `SECURITY.md`（私密漏洞报告通道；**不要**开公开 issue） |
> | **iframe 里的视频能调速**（同源与跨域都一样） | `manifest.json` 的 `all_frames: true`（每个 frame 都有自己那份运行时）、`src/content/videoRegistry.ts`（每个 frame 只收自己 document 里的视频）、`src/content/frameScope.ts`（`ownsUserFocus` 决定谁处理按键）；实测见 `tests/e2e/frame-scope.spec.js` |
> | **网页全屏铺满的是整个页面**，不只是 iframe 自己那一块 | `src/content/iframeExpansion.ts`（把父文档里装着该 iframe 的元素撑满顶层视口）+ `src/content/fullscreenController.ts`（overlay 建在视频所在的 document 里，`position: fixed` 相对该 document 的视口解析） |
> | **快捷键只作用在焦点所在的那一层** | `src/content/frameScope.ts`（`ownsUserFocus`：顶层文档的 `activeElement` 变成 `<iframe>` 元素时顶层不接管）、`tests/e2e/frame-scope.spec.js`（焦点在顶层 / 在 iframe 内两种情形各一条断言） |
> | 点图标只发给当前聚焦的那一个 frame | `src/background/index.ts`（记住 frameId 并用 `{ frameId }` 定向 `sendMessage`）、`tests/e2e/frame-scope.spec.js` |
>
> **商店展示用的版本历史要短得多** —— 上面「贴进 Dashboard 用这一段」
> 才是给用户看的那一版；下面那张表是**仓库内部**的完整记录。
> 理由：商店那一栏是给用户读的，不是给下一个维护者读的。

## Review Notes

### Known Issues / Limitations

- 只控制 `video`，不控制纯 `audio`（会在 listing 里如实写明）
- **iframe（嵌入框）里的视频**：同源与跨域都会被接管（能调速、能快进），也能进网页全屏 —— 6.2.0 起网页全屏**铺满整个页面**（扩展会把装着播放器的那一整块嵌入框撑满屏幕），不再只铺满嵌入框自己那一小块；快捷键只作用在焦点所在的那一层：焦点在顶层页面时，嵌入框里的视频不会被牵连；焦点在嵌入框里时，顶层页面里的视频既不会被调速，也进不了网页全屏。焦点在顶层而视频在嵌入框里时，扩展会提示「视频在嵌入框里」
- DRM 受保护内容无法接管
- 极少数据点会退回更简单的布局模式（CSS cover）
- **弹幕不会被搬进全屏**：扩展按「字幕 / 弹幕」的形态区分两者，只搬字幕。
  弹幕宽、分散、满屏飘，搬进来反而更吵 —— 这是取舍，不是缺陷
- **倍速菜单的下限是 0.5x**（菜单档位），键盘侧可以调到 0.1x；上限 16x
- **跨设备同步的只有快捷键**：倍速是每个标签页各自一份，关掉浏览器就没了
- **页面里会留一枚很淡的倍速小角标**：调速胶囊淡出后**再过约 3 秒**，
  视频角落才会留下一枚角标，直到视频暂停、滚出画面或进入全屏。
  它不可点击，绝不挡住你点视频。
  这是扩展在**非全屏**时唯一一处常驻界面 —— 它换来的是「当前几倍速随时可见」，
  因为控制条 3 秒就隐藏，而非全屏时没有别的地方会显示倍速
- **网页全屏里另有一处常驻元素**：控制条收起时，角上会留下一枚很小的退出钮
  （半透明、28×28、不可错过）。没有它的话，「我正在扩展的网页全屏里」
  这个状态没有任何常驻表达，退出入口也跟着控制条一起消失 ——
  而在窄屏上，退出按钮还可能被挤出屏幕（手机尤其容易中招）。
  任何鼠标或键盘活动都会让完整控制条回来

> 2026-10-20 更新：补了「弹幕不搬」与「倍速不同步」两条。
> 这两条**必须在 listing 里说清楚** —— 6.0.8 的更新说明写着
> 「字幕层跟着视频一起进出全屏，弹幕不搬」，用户看到「字幕跟着走」很自然会
> 期待弹幕也跟。既然详细描述里承诺了字幕跟随，就必须在已知问题里把弹幕的
> 例外讲明白，否则属于「描述与实际不符」。
>
> 「倍速不同步」同理：README 与设置页都强调过「不记忆速度」，而隐私一栏
> 又披露了 `storage.sync` 会同步快捷键 —— 审核员完全可能问「那倍速会不会
> 同步过去」。先说清楚。

### Rejection History

| Date | Reason | Fix Applied | Resubmitted |
|------|--------|-------------|-------------|
| — | 尚无 | — | — |

> 历史上线上文案曾长期写着 v6 已删除的 `presets`，属「元数据不准确」，已在本文件中修正。

---

## 提交前自检

改文案或素材前先跑一遍，避免又出现「本地过、商店挂」：

```bash
# 短描述字符数（上限 132，中英拼接后一起算）
python3 - <<'PY'
import re
s = open('CHROMEWEBSTORE.md', encoding='utf8').read()
# 注意用 [^\n]+ 而不是 .+ ：后者配 re.S 会贪婪地吞掉整个文件，算出几万字符
m = re.search(r'\*\*Short Description\*\*[^\n]*\n(?:<!--.*?-->\n)?\s*\n([^\n]+)', s, re.S)
print('短描述字符数:', len(m.group(1).strip()))
PY

# 素材尺寸（截图必须 1280x800 或 640x400；promo tile 必须 440x280）
pnpm icons && pnpm store:assets

# 图上的字里还有没有 `any`（绝对化表述，在 CWS 的拒审清单上）。
# 查的是**脚本常量**，不是本文件 —— 本文件里的 "any" 只出现在解释它为什么被删的段落里。
grep -n "any" scripts/generate-store-assets.mjs scripts/render-icons.mjs
```

- [x] 短描述 ≤ 132 字符 —— **实测 115**（2026-10-20）
- [x] 详细描述不含实现细节（API / 库 / 框架 / 代码模式）
- [x] 详细描述不罗列站点名清单（keyword spam）
- [x] 不出现绝对化表述（「支持所有网站」「无广告」）—— 6.0.9 起 Single Purpose
      里的 "any web video" 也改掉了（见该字段下方的说明）
- [x] **图上的字也不出现绝对化表述** —— 首图大标题与 promo tile 副标题里的 `any`
      已删（`scripts/generate-store-assets.mjs:25` / `:32` / `scripts/render-icons.mjs:33`）。
      ⚠️ 这一项以前只查了本文件里的文案，漏掉了脚本常量 —— 于是审核员读到的
      Short Description 与首图大标题口径不一致。**改图上的字要查脚本，不是查本文件。**
- [x] 截图与 promo tile 尺寸合规 —— 5 张截图 1280×800、promo tile 440×280，
      2026-10-21 按当前 UI 重新生成并逐张看过
- [x] `manifest.json` 的 `name` 与本文件的 Extension Name 完全一致 ——
      2026-10-21 核对：两边都是 `Video Speed Controller — Fullscreen & Keys`
- [x] 隐私措辞与实际存储位置一致（`storage.sync` 不可写成「全部在本地」）
- [x] 中英文详细描述**逐段对齐**（段落数相同、顺序相同、每段讲同一件事）——
      6.0.6 与 6.0.8 两次发布都被 `INCONSISTENT_LOCALE_METADATA` 警告过，
      这次是刻意对齐的，粘贴到 Dashboard 后**再逐段核一遍**
      ⚠️ 2026-10-21 复核发现**一处没对齐**：「工具栏图标」那一段中文多了一个
      分句（iframe 里直接作用到框里那个视频），英文那句没有。已补齐。
      教训与上一轮一样：**「看起来对齐」不算对齐，要逐段读。**
- [x] 若要重新上传包：**版本号必须高于线上版本**（CWS 拒绝 version ≤ 已发布版本）
      —— 2026-10-22 经 v2 API `fetchStatus` 核对：线上是 6.0.8（100% 部署、无待审版本），
      本包是 6.2.0 —— 6.2.0 > 6.0.8 ✅
- [x] **文案与实际行为一致** —— 2026-10-21 逐句核对了 6.2.0 改掉的那条：
      「嵌入框里的网页全屏铺满的是**嵌入框自己的区域**，不是整个页面」
      在 Scope、Known Issues、Version History **三处**都留过 —— 而 6.2.0
      已经改成**铺满整个页面**（`src/content/iframeExpansion.ts`）。
      三处都已改。（原先这份清单自己写的是「两处」，漏掉了 Version History
      那一处 —— 少算一处就可能漏改一处。）
      审核员拿旧文案对照新行为会直接判定「描述与实际不符」。
- [x] **商店描述里要提「嵌入框（iframe）里的视频也能接管」** ——
      跨域嵌入框也能调速、也能进网页全屏且画面铺满整页，
      这是现在最值钱的一条能力。
      ⚠️ 这一条**原先的状态是错的**：清单里写着「商店描述里一个字没提」，
      实际上「适用范围」那一整段（中英都有）已经写得很细，
      「主要功能」里的「工具栏图标」那一句（中文）也提了。
      真正的缺口有两条，都已补上：
      ① **英文版**的「工具栏图标」那一句漏了 iframe（与中文不对齐）；
      ② **「主要功能」清单里没有独立一条** —— iframe 能力原先只出现在
      最下面的「适用范围」里，而那是最容易被跳读的一段。
      现在「主要功能」里也有一条（中英各一段），口径见
      `README.md` 的「当前边界」段与
      `tests/e2e/frame-scope.spec.js` / `tests/e2e/iframe-fullscreen.spec.js`。
- [x] **隐私政策 URL 必须能打开** —— 这是 CWS 的**硬性拒审项**：
      审核员点不开就直接拒，不进内容审核。
      清单与设置页（`src/options/index.ts` 的「隐私政策」按钮）都指向
      `https://github.com/hibernate-pano/chrome-plugin-video-manager/blob/main/PRIVACY.md`。
      ✅ **2026-10-22 已修**：`PRIVACY.md` 随 6.2.0 合并进 `main`
      （`main` 与 `origin/main` 同为 `3e75c0d`），实测两个 URL 都返回 200：
      `raw.githubusercontent.com/.../main/PRIVACY.md` → 200、
      `github.com/.../blob/main/PRIVACY.md` → 200。
      ⚠️ 之前这一条是 `- [ ]`，而它守着的正是**唯一一条会直接导致拒审**的项 ——
      「清单自己说错话」比「没写」更糟：下一个人会以为隐私政策 URL 已经没问题了。

> 2026-10-22 的自检结果：**文案与素材两侧都齐了**，
> 且 Scope / Known Issues / Version History 三处对 6.2.0 的新行为口径一致。
> 截图已按 6.0.9 的真实 UI 重新生成（控制条重做、设置页重做），
> 图上的绝对化表述也一并清掉了。
> 隐私政策已合并进 `main`，两个 URL 都实测可打开。
> ⚠️ **剩下两项要人来点**（都在 Dashboard 里）：
> ① `manifest.json` 的 `name` 与本文件的 Extension Name
>    要一致（`Video Speed Controller — Fullscreen & Keys`）；
> ② listing 的中英文详细描述**逐段对齐**（治 `INCONSISTENT_LOCALE_METADATA`）——
>    这条与 6.2.0 无关，但 6.0.6 与 6.0.8 两次发布都被它警告过。

## 发布流程

出包全部在本地完成（CI 不再做 release）。按顺序执行：

1. `pnpm icons` —— 重绘图标与 promo tile
2. `pnpm store:assets` —— 生成商店截图
3. `pnpm build:ext` —— 构建并打出 zip 到 `release/`
4. `pnpm store:auth` / `pnpm store:publish` —— 上传到 Chrome Web Store

### ⚠️ 两条硬约束

**① listing 文案改不了 API，只能去 Dashboard 粘贴。**
v1.1 与 v2 的 Item schema 只有包字段（`id` / `publicKey` / `uploadState`），没有
name / description / 截图字段 —— PUT 会被静默忽略（返回 304）。cws-mcp 的
`update-metadata` 工具因此是坏的；`update-metadata-ui` 需要 `~/.cws-mcp-profile` 登录态。
**现实路径：打开本文件，逐字段复制粘贴到 Developer Dashboard。**

**② Chrome Web Store API v1.1 于 2026-10-15 停止支持**，而 v2 没有 metadata 接口
（v2 只有 upload / publish / cancel / status / deploy-percentage）。该日期之后，
改文案与换截图只能走 Dashboard。

### 凭证位置

**不要用仓库外的 `/Users/panbo/Code/.env`**（那对 client 已失效，返回 `invalid_client`）。
本机有效凭证在：

```
~/.config/mcp/mcp.json  →  mcpServers["cws-mcp"].env
  CWS_CLIENT_ID / CWS_CLIENT_SECRET / CWS_REFRESH_TOKEN
  CWS_PUBLISHER_ID   ← UUID（19d9e44e-…），与 32 位扩展 id 完全不同
  HTTPS_PROXY=http://127.0.0.1:7897  /  NODE_USE_ENV_PROXY=1
```

`scripts/store-publish.mjs` 会按「进程环境变量 → mcp.json → .env」的顺序读取。

**refresh token 会过期**：若 Google OAuth 同意屏幕处于「测试」状态，token **7 天即失效**。
必须先把同意屏幕发布为「生产」，再重新授权（`pnpm store:auth`），否则会反复失效。
症状是 `invalid_grant | Token has been expired or revoked`。

版本号约定见 [.memory/version-bump-not-force-tag.md](./.memory/version-bump-not-force-tag.md)：bump version → commit → 打新 tag `vX.Y.Z` → push，绝不 force 移动已存在的 tag。

---

## 改名执行清单（6.0.6 —— ✅ 已完成，2026-10-06 过审上线）

商店名来自 `manifest.json` 的 `name`，**改名必须出新包并重新过审**，不能只改 Dashboard。
当前线上 6.0.6 已 PUBLISHED 且无待审版本，是执行成本最低的窗口。

- [x] 1. `manifest.json` 的 `name` 与 `default_locale` 下的 `_locales/en/messages.json`
      （`extensionName`）改为 `Video Speed Controller — Fullscreen & Keys`，
      两个文件必须一致（商店只认 manifest，但设置页标题走 i18n）
- [x] 2. `package.json` 与 `manifest.json` 版本号同步升到 `6.0.6`
- [x] 3. `pnpm test && pnpm build` 全绿
- [x] 4. `pnpm build:ext` 出包，人工确认 zip 顶层是 `manifest.json`、内部版本号是 6.0.6
- [x] 5. `node scripts/store-publish.mjs release/video-speed-controller-v6.0.6.zip --dry-run --api=v2`
      看一遍再实发；**永远显式传 zip 路径**（`findLatestZip` 不校验包内版本）
- [x] 6. 发布前把本文件的 Name / Short Description / 详细描述 / 截图，
      逐字段粘贴到 Developer Dashboard（API 改不了 metadata）
- [x] 7. 过审上线后，回本文件把 6.0.6 状态改为 Published

**回滚**：CWS 不允许降级安装，回滚只能发一个**版本号更大但内容等于旧版**的包；
v2 的 `setPublishedDeployPercentage` 可按比例放量，是唯一的真回滚手段。

---

## 6.0.6 发布记录（2026-10-06）

**发布方式**：v2 API（`node scripts/store-publish.mjs release/video-speed-controller-v6.0.6.zip --api=v2`）
上传返回 `uploadState=SUCCEEDED, crxVersion=6.0.6`，发布后进入 `PENDING_REVIEW`。

**⚠️ 发布时返回的警告**：`INCONSISTENT_LOCALE_METADATA`
> Mismatching metadata: Discrepancies in feature desc…（响应中该字段被截断）

已排除的原因：`_locales/en` 与 `_locales/zh_CN` 各 33 个键、键集合完全一致，
且**不含** `extensionName` / `extensionDescription` 之类的 name/description 键
（商店名只来自 `manifest.json`）。因此该警告不是扩展包内 i18n 造成的，
而是**商店 listing 的多语言描述**（Dashboard 里的 en / zh_CN 详情）之间存在差异。

**动作**：不阻塞提交，但为降低人工复审风险，等 6.0.6 上线后到 Dashboard
把中文与英文的详细描述**对齐到逐段一致**（当前两段内容结构相同、措辞略有出入）。

### 6.0.6 上线后的待办（Dashboard 内操作，API 改不了）

- [ ] Support URL → <https://github.com/hibernate-pano/chrome-plugin-video-manager/issues>
- [ ] Homepage URL → <https://github.com/hibernate-pano/chrome-plugin-video-manager>
- [ ] 核对 Extension Name 是否已显示为 `Video Speed Controller — Fullscreen & Keys`
- [ ] 对齐中英文详细描述（消除 `INCONSISTENT_LOCALE_METADATA` 的成因）
- [ ] 截图 5 张重新确认（标题文案里不要出现已砍掉的功能）

---

## 6.0.8 发布记录（2026-10-08）

**发布前状态核实**：线上 6.0.6（PUBLISHED / 100%）、无待审版本 —— 窗口干净才发。

**发布方式**：v2 API（`node scripts/store-publish.mjs release/video-speed-controller-v6.0.8.zip --api=v2`）
上传返回 `uploadState=SUCCEEDED, crxVersion=6.0.8`，发布后进入 `PENDING_REVIEW`。

**出包前的人工核对**（不信任上一轮留下的 zip，重新 `build:ext` 并逐项检查）：
- manifest 在 zip 根、name 42 字符、version 6.0.8
- 0 个 `__MACOSX` 条目、无 `dist/` 嵌套
- 产物里 `attachOverlayers(` 调用存在 → 字幕搬运（6.0.8）真的在包里
- 产物里 `vsc-site-speeds` 已不存在 → 站点速度记忆（6.0.7）真的删干净了

**⚠️ 同一个警告再次出现**：`INCONSISTENT_LOCALE_METADATA`
成因与 6.0.6 那次相同（商店 listing 的中英文详细描述不对齐），**尚未修掉**。
不阻塞提交，但会持续增加人工复审概率 —— 需在 Dashboard 把两段描述逐段对齐。

**✅ 上线确认（2026-10-22）**：经 v2 API `fetchStatus` 核实，
`crxVersion=6.0.8`、`deployPercentage=100` —— 6.0.8 已**过审上线**，
是当前线上版本。

---

## 6.2.0 发布前状态核实（2026-10-22）

**核实方式**：v2 API `fetchStatus`（只读，不上传不发布）：

```
state: PUBLISHED
distributionChannels: [{ deployPercentage: 100, crxVersion: "6.0.8" }]
```

- **线上版本是 6.0.8**，不是本文件此前多处写的 6.0.6 —— 已逐处改正。
- **无待审版本**：窗口干净，可以直接发。
- **版本号检查**：6.2.0 > 6.0.8 ✅（CWS 拒绝 version ≤ 已发布版本）。
- **凭证**：refresh token 换 token 成功（有效期 3599 秒），凭证可用。

**⚠️ 本次核实顺手发现并修掉的一处「清单自己说错话」**：
本文件与 `CHANGELOG.md` 都写着「线上是 6.0.6」，而商店里真正跑着的是 6.0.8。
这类错误不阻塞发布，但**会让人算错「要发什么版本」**——
按 6.0.6 推算「6.0.7 从未发过」是对的，按 6.0.8 推算「6.0.7 从未发过、
6.0.8 发过了」也是对的；但写着 6.0.8 的状态是「In Review」，
而它其实已经 100% 部署了。**发布记录的状态列必须每次用 API 核实，不能靠记忆填。**

---

## 6.0.9 文案对齐记录（2026-10-20）

**背景**：6.0.9 要送审，而 6.0.6 与 6.0.8 两次发布都被
`INCONSISTENT_LOCALE_METADATA` 警告过（成因：商店 listing 的中英文描述不对齐）。
另外扩展这轮功能变化很大 —— 字幕跟随、倍速档位菜单、工具栏倍速提示、
设置页入口、只接管你正在看的视频 —— 而线上文案一个字都没提。
「描述与实际不符」是 CWS 的拒审项，所以这一轮必须把文案对齐到真实功能集。

### 本轮改了哪些字段

| 字段 | 改了什么 | 为什么 |
|---|---|---|
| `Last Updated` | 2026-10-04 → 2026-10-20 | 本轮整体重写了文案 |
| `Short Description` | 重写，**实测 115 字符**（旧 96） | 旧文案只说了「控制条自动隐藏」，6.0.9 最有辨识度的三件事一件都没出现 |
| `Detailed Description` | 中英**逐段对齐**重写，各 17 段 | 补 6 项新功能 + 对齐（治 `INCONSISTENT_LOCALE_METADATA`） |
| `Single Purpose` | "any web video" → "the web video you are watching" | `any` 可被读成「所有网站」，属绝对化表述 |
| `Graphics & Assets` | 5 张截图 + promo tile 全部重新生成，状态 → ✅ Ready | 磁盘上的截图 PNG 还是 6.0.8 那版，控制条已重做；promo tile 的副标题有 `any` 歧义 |
| `Screenshot Notes` | 逐张核对并补注「为什么这张要重截」；新增「素材文案的唯一来源」表 | 设置页方向键显示从 `ArrowLeft` 变成 `←`，旧图对不上了 |
| `Permissions Justification` | `storage` 一行改写；`<all_urls>` 补字幕测量说明 | 旧文案 "Nothing else is stored" 已经不准确（6.0.9 多了标签页倍速） |
| `Privacy & Data Use` | `User activity` 与 `Website content` 两行改写 | 6.0.9 新增 `storage.session`（不同步）；字幕测量口径要说清 |
| `Version History` | 6.0.9 行保留，另加一份「逐条核实」对照表 | 防止下一个人把「计划做」当成「已做」 |
| `Known Issues` | 补「弹幕不搬」「倍速不同步」「倍速上下限」 | 详细描述承诺了字幕跟随，就必须说清弹幕的例外 |

### ⚠️ 上一轮「已改」里有两处其实没改（2026-10-20 复核）

这一节原本写着「首图标题已改成 `Watch web video fullscreen`」、自检项也打着
`[x] 不出现绝对化表述`。**复核发现那是假的**：

- `scripts/generate-store-assets.mjs` 的 `CAPTIONS` 里仍然是
  `Watch any web video fullscreen` / `任意网页视频，一键全屏`，
  `scripts/render-icons.mjs` 的 `TILE` 里仍然是
  `Clean fullscreen for any web video`。
- 也就是说：**审核员读到的 Short Description 已经去掉了 `any`，
  但首图大标题和 promo tile 上白纸黑字写着 `any`** —— 两处口径不一致。
- 而 `any` 在 CWS 的拒审清单上。

**为什么上一轮会漏**：上一轮只查了**本文件里的文案**，没查**脚本常量**；
本文件的自检项于是自己给自己打了勾。图上的字不在本文件里，
所以「本文件查过了」根本不构成「图上的字没问题」。

**这一轮的修法**（避免再犯）：
1. 脚本常量改掉，并**重新出图**（2026-10-20 15:47），5 张 + promo tile 逐张看过；
2. 本文件新增「素材文案的唯一来源」表，**写明改哪一行的常量**；
3. 自检清单新增一条独立项，并且**给出查什么命令**：
   ```bash
   grep -n "any" scripts/generate-store-assets.mjs scripts/render-icons.mjs
   ```
   查的是脚本，不是本文件 —— 本文件里的 "any" 只出现在解释它为什么被删的段落里。

**教训**：自检项要对着**产物**打勾，不能对着**自己的说明文字**打勾。
截图与图上文字是两条独立的检查线，本文件原来只写了后者。

### Dashboard 内操作清单（API 改不了 metadata）

- [ ] Short Description → 复制上面那一行（115 字符，**别让编辑器自动换行**）
- [ ] 详细描述（中文）→ 复制 `---` 之前的那一段
- [ ] 详细描述（English）→ 复制 `---` 之后的那一段
- [ ] 粘贴后**逐段数一遍**：中文 18 段，英文 18 段，一一对应
- [ ] Single Purpose → 替换成改过的那句
- [ ] 5 张截图 → `store-assets/output/` 下已按当前 UI 重新生成（2026-10-21，
      `pnpm store:assets`；设置页在 6.2.0 变了：多了「使用引导」卡片、输入框加宽），
      直接上传；重生成命令见「素材文案的唯一来源」
- [ ] Small Promo Tile → `store-assets/output/store-promo-tile.png`（已重新生成，
      副标题里的 `any` 已删）
- [ ] 版本历史（中文）→ 用「Version History」里中文那一段
- [ ] 版本历史（English）→ 用「Version History」里英文那一段
      ⚠️ **默认语言必须是英文** —— 商店的默认语言那一栏留空会被要求补
- [ ] 核对 Extension Name 仍是 `Video Speed Controller — Fullscreen & Keys`
- [ ] 核对 Extension Name 仍是 `Video Speed Controller — Fullscreen & Keys`

> ⚠️ **粘贴到 Dashboard 时最容易翻车的一点**：CWS 的多语言详情是**两个独立的
> 文本框**，不是同一段文本的翻译对。把中文和英文分别贴进各自语言的框里，
> 然后**数段数**。段数对不上 → 警告还会再来一次。
>
> ⚠️ **更要命的是「段数对得上，内容却不对齐」**：2026-10-21 复核就发现一处
> —— 中文「工具栏图标」那段多了一个 iframe 分句，英文那段没有。**段数一样
> 不代表内容一样**，两边的分句要逐句对读。

---

## 6.2.0 文案对齐记录（2026-10-21）

**背景**：这一轮只审「产品拿出去给人看的那一面」，**不改任何行为**。
逐条核对商店描述 / README / 设置页与 6.2.0 的真实实现。

### 商店描述改了什么

| 字段 | 改了什么 | 为什么 |
|---|---|---|
| `Detailed Description`（中） | 「主要功能」里补一段嵌入框能力；调速角标的时机改准；工具栏提示补上「1.0x 时只显示名字」这个前提 | 角标时机原先写错（写成胶囊淡出就有，实际再过约 3 秒）；iframe 能力原先只在最下面的「适用范围」里 |
| `Detailed Description`（英） | 补上中文有、英文没有的 iframe 分句；同上的两处改准 | **中英不对齐正是 `INCONSISTENT_LOCALE_METADATA` 的成因** —— 6.0.6 与 6.0.8 两次发布都被它警告过，而这一轮复核又发现同一类问题复发 |
| `Known Issues` | 角标时机改准 | 与详细描述口径一致 |
| `Version History` | 补一段**可直接粘贴**的用户视角版本 | 原来只有仓库内部的完整记录，而那一栏是给用户读的 |
| `Screenshot Notes` | 标注设置页在 6.2.0 变了（多了「使用引导」卡片、输入框加宽） | 旧图与现在的设置页已经不是同一页 |
| `提交前自检` | 改掉一条**事实错误**的自检项 | 原文写着「商店描述里一个字没提 iframe」—— 实际「适用范围」整段都写了。**清单自己说错话，比没写更糟** |

### ⚠️ 教训：自检项也会过期

「商店描述里要提 iframe」这条自检项，是在「描述里确实没提」的时候写的。
后来描述里补上了，这条却没改，于是它开始**反过来指着一个已经解决的问题**。
下一个照着它做事的人，会去「补」一段已经存在的内容 —— 或者更糟，
以为自己漏看了什么。

**自检项和它守着的东西一样会过期。** 每轮复核时，除了看「产品改了什么」，
也要看「这份清单自己说的是不是还是真的」。

### 剩下要人来做的事

1. ~~**`PRIVACY.md` 合并进 `main`**~~ —— ✅ 已做（2026-10-22）。
   合并前商店的隐私政策 URL 与设置页页脚的「隐私政策」链接都是 404；
   现在两个 URL 都实测返回 200。
2. ~~**重新生成商店截图**~~ —— ✅ 已做（`pnpm store:assets`）。
   设置页在 6.2.0 变了，截图已按新 UI 重出（5 张 1280×800 + 1 张 440×280 促销图）。
   ⚠️ 截图是 gitignore 的生成物，**每次改完 UI 都要重跑** ——
   商店里挂着旧图比没有图更糟（用户点进去发现不是同一个产品）。
3. **在 Dashboard 里逐段对齐中英文详细描述** —— 与 6.2.0 无关，
   但 6.0.6 与 6.0.8 两次发布都被 `INCONSISTENT_LOCALE_METADATA` 警告过。
   不阻塞提交，但会持续增加人工复审概率。
4. **上传 6.2.0** —— 包已就绪（`release/video-speed-controller-v6.2.0.zip`），
   线上是 6.0.8，版本号 6.2.0 > 6.0.8 ✅。
   ⚠️ 上传是**对外发布**动作，等 Jasper 明确发话再动。
