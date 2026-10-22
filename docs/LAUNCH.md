# 推广文案（阶段 0：拿真实用户信号）

> 2026-10-06 起，项目的**唯一优先级**是拿到真实用户反馈，详见 [PRODUCT.md](../PRODUCT.md#路线图)。
> 本文所有文案都指向同一个目的：**让人用完之后回答我们三个问题**，而不是让人点赞。

## 三个必须问到的问题

发出去之后，无论多少点赞，只要没人回答这三个问题，这次推广就是无效的：

1. 你平时用什么看视频？（B站 / YouTube / 网课平台 / 播客 / 公司内网……）
2. 为什么用、或不用这个扩展？
3. 哪里别扭、不顺手、让你想卸载？

**技巧**：不要问「这个扩展好不好」（会收到客套话），
要问「你上次看视频时按了什么键、调速了吗、调了几倍」——具体行为比评价诚实。

---

## V2EX（中文技术社区，流量最精准）

标题候选（选一个）：

```
[开源] 写了个 Chrome 扩展：把网页视频变成干净的播放器，快捷键可改绑
```

```
[开源] 网页全屏 + 倍速控制，做成一个只管播放的 Chrome 扩展
```

正文：

> 做了个 Chrome 扩展，名字叫 Video Speed Controller — Fullscreen & Keys，已上架商店。
>
> **它解决什么**：你在网课、B站、YouTube、会议录像之间来回切，每个网站的播放器都不一样：
> 全屏按钮藏得深、全屏后还叠着弹幕和推荐、倍速上限 2x。我想在所有平台之上加一层
> **干净、可控的播放层**。
>
> **目前只有这些功能**（v6 做过一次大减法，砍掉了弹窗、工具栏图标上的数字徽章、
> 键盘预设档位、HUD 动画）：
>
> - 网页全屏：按 `f` 进入，鼠标动一下浮现一条极简控制条，静止 3 秒自动淡出
>   （控制条上的倍速可以直接点选档位）
> - 也可以**直接点扩展图标**切换网页全屏 —— 不想用键盘也行
> - 倍速：`=` / `-` 每次 0.1 倍，长按连续，`0` 重置；**不记忆速度**，任何视频都从 1.0x 开始
> - 播放控制：`Space` 播放暂停，`←` `→` 快退快进 5 秒
> - 7 个动作**全部可以在设置页改键**，留空即禁用
>
> **刻意没做的**：没有弹窗、工具栏图标上不挂数字徽章、没有大数字 HUD、没有悬浮的
> 「当前正在控制哪一个」提示。装完即用，用完即忘。这不是没做完，是我认为常驻界面是噪音。
>
> 页面上的常驻界面只有一个例外，我得先说清楚：调速之后，视频角落会留下一枚
> **很淡的小角标**（12px、不可点击、绝不挡着你点视频），直到你把视频暂停、
> 滚出视口、或者进全屏。留它是因为控制条 3 秒就藏 —— 非全屏时若没有它，
> 你调到了几倍速就没人告诉你了。
>
> 已知边界（都是刻意如实告知的）：只控制 `video` 不控制纯音频；**嵌入框（iframe）里的视频
> 也会被接管**（能调速、能快进、能进网页全屏且画面铺满整页），但快捷键只作用在
> **焦点所在的那一层** —— 焦点在顶层页面时，框里的视频要先把焦点点进去才能用快捷键
> （扩展会提示你「视频在嵌入框里 —— 点一下它就能用快捷键」）；
> Netflix 这类加密视频由浏览器保护接管不了；极少数页面会退回 CSS cover 模式。
>
> 商店：<https://chromewebstore.google.com/detail/video-speed-controller/mennabljgjphikgaiahngapedibccmei>
> 源码（MIT）：<https://github.com/hibernate-pano/chrome-plugin-video-manager>
>
> **想请你帮个忙**：装不装随你，但如果装了或者你就是被上面的描述打动了，
> 麻烦在回复里说一下——
>
> 1. 你平时主要用什么看视频？
> 2. 你会为了这个去改键吗？还是就 `f` 和 `=` 两个键够用了？
> 3. 有没有什么让你觉得"这也太小题大做了"的地方？
>
> 我在判断这个产品该往哪走，不是在收集好评。谢谢直言。

---

## 少数派（中文，工具与效率用户密集）

标题：

```
网页看视频总要按一堆不同快捷键，我写了个 Chrome 扩展统一了它
```

正文（更适合慢慢讲）：

> 有个场景我特别烦：同一个「快进 5 秒」，B站是 `→`，YouTube 是 `→`，
> X 播客是 `→`，某个网课平台是 `Ctrl+→`，还有个站点根本没有快进。
> 于是我做了个扩展，在所有网站之上加一层统一控制。
>
> **网页全屏**：按 `f`，视频铺满整个视口，全屏后那些弹幕、推荐位、侧边栏全没了。
> 鼠标动一下出现控制条，静止 3 秒自动淡出——它不抢你的注意力，
> 但你伸手去拖进度它一定在。不想按键盘就**直接点扩展图标**，效果一样。
>
> **字幕是例外**：浮在视频上的字幕（包括沉浸式翻译这类插件生成的）会**跟着视频
> 一起进全屏**，不会被画面盖住 —— 这条是 6.0.8 才开始做对，之前号称修好、
> 实测从来没生效过。
>
> **倍速**：`=` 和 `-` 各 0.1 倍，长按连续。按 `0` 回到 1.0。
> 进全屏之后，控制条上的倍速可以直接点选档位（不用一路按 `=`）。
>
> 这里有个地方我和大部分扩展的选择**不一样**：我**不记住速度**。
> 很多扩展会把你上次的速度存下来，下次打开自动套用——但同一个人看网课要 2.0x、
> 看纪录片要 1.0x，一旦某个速度被记住了，它就变成一条你看不见的规则，
> 之后每个视频都被它接管。所以我让它永远从 1.0x 开始，快慢由你当场决定。
>
> **不打扰**：调速时角落闪一个 `1.5x` 小胶囊，一秒后消失。没有弹窗、图标上不挂数字。
> 但有一个例外我得说清楚：小胶囊淡出后**再过约 3 秒**，视频角落会**留下一枚很淡的小角标**
> （12px、不可点击），直到你把视频暂停、滚出视口、或者进全屏。
> 留它是因为控制条 3 秒就藏 —— 非全屏时若没有它，你调到了几倍速就没人告诉你了。
> 页面外我不想有任何常驻显示，但这一枚我认。
> （进了网页全屏之后是另一回事：那里本来就有一条控制条，它藏起来之后角上会留一枚
> 很小的退出钮 —— 不然你既不知道自己在全屏里，也找不到出去的门。）
>
> 7 个动作都能在设置页改键，留空就是禁用。装完即用，不改键也能直接用。
>
> 已知边界（都是刻意如实告知的）：只控制 `video` 不控制纯音频；**嵌入框（iframe）
> 里的视频也会被接管**（能调速、能快进、能进网页全屏且画面铺满整页），但快捷键
> 只作用在**焦点所在的那一层** —— 焦点在顶层页面时，框里的视频要先把焦点点进去
> 才能用快捷键（扩展会提示你「视频在嵌入框里 —— 点一下它就能用快捷键」）；
> Netflix 这类加密视频由浏览器保护接管不了；极少数页面会退回 CSS cover 模式。
>
> 商店：<https://chromewebstore.google.com/detail/video-speed-controller/mennabljgjphikgaiahngapedibccmei>
>
> 也很想听听你的看法：**你自己最想要的是哪个功能？**
> 我砍过很多东西（弹窗、键盘预设档位、悬浮显示当前对象），因为觉得是噪音，
> 但可能我的判断和你的不一样。

---

## Reddit（英文，r/Productivity / r/webdev / r/browsers）

标题：

```
[Open Source] I built a Chrome extension that gives every web video the same
keyboard controls and a clean fullscreen player
```

正文：

> I keep switching between lecture platforms, YouTube, and company training portals,
> and every single one has a different player. Fullscreen button buried somewhere,
> captions and recommendations overlapping the video, speed capped at 2x,
> "skip forward 5s" on a different key everywhere.
>
> So I built one layer on top of all of them. **Video Speed Controller — Fullscreen & Keys**
> (MIT, open source).
>
> What it does:
> - `f` — page fullscreen. The video fills the viewport, and the site's own clutter
>   (recommendations, sidebars, comment layers) goes away with it. Move the mouse and a
>   minimal control bar appears; stay still for 3 seconds and it fades out.
>   The speed readout on that bar is a clickable menu of presets, too.
>   Captions are the exception: they **travel with the video** into fullscreen
>   instead of being left behind (or covered).
> - Click the extension icon — same thing, no keyboard needed. Hovering over the
>   icon tells you the rate the current tab is running at.
> - `=` / `-` — speed up / slow down by 0.1x, hold to repeat, `0` resets.
>   Speed is **never** remembered — every video starts at 1.0x. Most extensions
>   store your last speed per site; I decided against it, because the same person
>   wants 2.0x for a lecture and 1.0x for a documentary, and a stored number turns
>   into a rule you never chose and can't see.
> - `Space` play/pause, `←` / `→` skip 5 seconds — the same on every site.
> - All 7 actions are rebindable on the options page, or blank to disable.
>
> What I deliberately left out: no popup, no number badge on the toolbar icon, no
> big-number HUD, no floating "you are controlling this one" pill. Install it, use
> it, forget it. I cut a lot of features in v6 because I decided constant UI is
> noise — but I'd genuinely like to know if you disagree.
>
> One exception, and I'd rather say it up front: after you change the speed, a small
> badge stays in the corner of the video (12px, not clickable, never in the way).
> It disappears when you pause, scroll the video out of view, or enter fullscreen.
> I kept it because the control bar hides after 3 seconds — outside fullscreen there
> is otherwise nowhere that tells you what speed you're at.
> (Inside fullscreen it's a different picture: there's a control bar to begin with,
> and once it hides a small exit button stays in the corner — otherwise you'd have
> no way to tell you're in fullscreen, and no way back out.)
>
> Known limits (stated up front): video elements only, not audio-only players;
> DRM-protected video (Netflix etc.) is protected by the browser; a few sites fall
> back to a simpler layout mode. Players embedded in an iframe *are* controlled —
> speed, seek and fullscreen all work, and the video really fills the page — but the
> keyboard shortcuts only apply to the layer that has focus: if your focus is in the
> top page, click into the player first (the extension tells you when the video is
> sitting in an iframe).
>
> Store: <https://chromewebstore.google.com/detail/video-speed-controller/mennabljgjphikgaiahngapedibccmei>
> Source: <https://github.com/hibernate-pano/chrome-plugin-video-manager>
>
> **What I'm really trying to find out**: what's your current setup for video speed
> and fullscreen, and what would you actually want unified? If you'd only use the
> speed keys and never the fullscreen, that's genuinely useful to know — it changes
> what I build next. Concrete answers beat "nice extension!"

---

## 发布纪律

- **不要**一次发完全部渠道，观察哪个渠道有真实回复再决定要不要跟进
- **每条评论都回**，包括负面的——尤其是负面的，那是这个阶段最值钱的数据
- 有人报 bug → 认真修，然后**在 issue 里回复他改了什么**（让人看见作者还活着）
- 收到 4 周后的判据（见 [PRODUCT.md](../PRODUCT.md#路线图)）时，**必须真的做决定**，不许继续拖

## 什么算「信号」，什么不算

| 算 | 不算 |
|----|------|
| 有人说"我用了半年每天都在用" | 点赞数 |
| 有人提了一个具体场景 | 商店评分 5 星但零评论 |
| 有人说"用了就卸载了，因为…" | 朋友说"看着不错" |
| 有人主动来提 PR | Star 数 |
| 有人问"能不能加 X" | 单纯的下载量增长（无来源时说明不了任何问题） |
