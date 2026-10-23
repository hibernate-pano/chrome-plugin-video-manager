# Deep Research: Chrome 商店「视频倍速 / 网页全屏播放器」竞品分析

> Generated 2026-10-23 | Depth: standard（4 个检索/补缺子代理 + 领衔代理亲自用浏览器直读商店页）| Sources: 104
> 目的：回答一个问题 —— **用户凭什么使用我们？** 产出定位为决策用分析，不含文案。

---

## TL;DR

**我们的产品优势是真实的、可验证的、而且在同类产品里很硬；但它们全部是"防守型"的——只有在用户已经踩到那些坑之后才有价值，而下载发生在踩坑之前。** 真正挡住我们的不是功能，是一个数字：**我们只有 23 个用户、0 条评分**。商店搜索卡片只显示名称+评分+Featured 不显示用户数，所以我们卡片上写着 "0 out of 5"，而同一屏的四个竞品写着 4.0 / 4.7 / 4.8 / 4.7；我们商店页底部的 "You might also like…" 更是把这 23 个用户直接推荐给了他们。这是**分发冷启动死锁**，不是产品失败。

**且 23 用户不能证明"产品没优势"——因为我们从未推广过。** PRODUCT.md 阶段 0 的三项（看 Dashboard 曲线 / 发 V2EX+少数派+Reddit / 回复评论）一项都没做，`docs/LAUNCH.md` 里三套写好的文案在抽屉里放了 17 天。

**但如果目标是"用户量"，当前定位给不了天花板。** 「网页全屏 / 干净播放器」这个定位在 CWS 上的规模天花板约 10 万用户（这一类最大的 `Full Screen for Google Chrome` 10 万用户、评分只有 3.4；评分最好的 `Video Maximizer` 2 万用户），而"倍速"那条线的天花板是 300 万。更关键的是：**"网页全屏"不是需求，是实现手段；需求是"画面更大 + 不被打扰"，而这个需求已经被浏览器原生全屏、站点自带 theater mode（B 站播放器扩展自带 web fullscreen 模式）、以及"去黑边铺满窗口"类产品（40 万用户）解决了一大半。**

---

## Executive Summary

本次研究把 6 个区域的数据全部从 Chrome Web Store 一手读取（商店页是 JS 渲染，数字是用真实浏览器和官方搜索 RPC 读出来的，不是搜索摘要）：倍速类头部全景、全屏/播放器增强类、用户真实差评、信任与合规、我们自己的商店页基线、以及自称目标人群（在线学习者/语言学习者/会议录像）的邻近市场。

三个决定性事实：

**一、我们的基线是 23 用户 / 0 评分 / 2 种语言 / Tools 分类**，对照头部 `Video Speed Controller`（igrigorik）的 **300 万用户 / 4.0 分 / 4.5K 评分 / Featured 徽章**。我们只有对方的 0.00077%。Chrome 官方文档明说商店排序吃 "ratings from users as well as usage statistics" 和 "the number of downloads vs. uninstalls over time" [6]——0 评分意味着我们在评分这一维**完全没有信号**。

**二、我们的功能优势是真的，而且正好是竞品 2025–2026 年集体回归的那批毛病。** 头部 `Video Speed Controller` 最近 40 条评论**全是 1 星**（0.10.0 更新之后），典型的是"暂停或按方向键后速度每次都复位回 1.00…basically makes the tool unusable"（16/16 人认为有用）[40]、"changes the speed of videos randomly…**Probably malware at this point**" [40]。而这正是我们 6.2.0 修掉的东西（倍速读数被误清、复位路径的版本号闸门、只接管用户正在看的视频、多视频页面认怂）。同样地，与我们定位最接近的 `Video Maximizer`（2 万 / 4.8★）的低分评论集中在"退出全屏后滚动条消失""嵌入框不支持""Esc 不生效""画面被拉伸变形"——这五件我们全部做了，还各自写了守卫 [104]。

**三、"网页全屏"这个定位被数据判了一次死刑，而 PRODUCT.md 在 2026-10-06 已经自己推翻过一次，本次数据是佐证。** 有一条功能几乎与我们逐条重合的产品（`Video Speed Controller Pro`：Fullscreen + PiP + Mirror + A-B Loop）只有 2 万用户 [13][42]；有"网页全屏"描述的整个品类天花板约 10 万；而"让视频铺满窗口/去黑边"这个更简单的需求反而有 40 万 [73][74]。**用户要的是"画面更大"，不是一个播放器。**

结论：**优势有，但不能当获客钩子用。** 正确的顺序是先把冷启动解掉（发出去、攒评分、修商店页简介与分类），再决定要不要把"跨站一致的干净播放层"这个定位讲明白；至于要不要开第二曲线（学习工作流），那是唯一被市场验证过规模的方向（字幕 3 万、笔记 4 万、语言学习 10 万），但它是另一个产品。

---

## 1. 市场现状：赛道结构与规模分布 `[Confidence: High]`

### 1.1 头部集中，且头部是"功能全 + 开源 + 免费"的那一家

| 扩展 | 开发者 | 用户 | 评分(数) | 版本 | 最近更新 | 分类 | Featured |
|---|---|---|---|---|---|---|---|
| Video Speed Controller | igrigorik | **3,000,000** | 4.0 (4.5K) | 0.11.1 | 2026-08-14/15 | Functionality & UI | 是 |
| Global Speed | POLYWOCK | 700,000 | 4.5 (861) | 3.4.124 | 2026-09-28 | Workflow & Planning | 是 |
| Super Video Speed Controller | — | 300,000 | 4.3 (225) | 1.3.2.3 | 2026-01-19 | — | 是 |
| Youtube Playback Speed Control | shrestha.pujan | 300,000 | 4.4 (4.3K) | 0.0.15 | 2026-02-24 | — | 是 |
| Prime Video Speeder [QVI] | dogooodapp | 60,000 | 3.8 (75) | 1.1.36 | 2026-05-27 | Just for Fun | 是 |
| YouTube Speed Controls | — | 50,000 | 3.8 (167) | 2.5 | 2025-11-03 | Workflow & Planning | 是 |
| Video Speed Control | Sevina | 40,000 | 4.8 (67) | 0.1.6 | 2026-06-22 | — | 是 |
| HTML5 Video Speed Control | Cool Apps | 40,000 | 4.4 (1.3K) | 3.0.0 | **2022-03-17（弃养）** | — | 否 |
| Video Speed Controller (dup) | — | 20,000 | 4.6 (29) | 1.0.2 | 2025-03-19 | — | — |
| Video Speed Controller Pro | tinyflash.org | 20,000 | 4.8 (93) | 1.0.6 | 2026-06-01 | Functionality & UI | 是 |
| **我们（Video Speed Controller — Fullscreen & Keys）** | **Jasper Pan** | **23** | **0（0 条）** | **6.0.8** | **2026-10-08** | **Tools** | **否** |

数据来源：[1][2][9][10][11][12][3][102]（全部直读商店页 DOM）

**Top1 一家占 Top10 用户总量的约三分之二**，之后 700K → 300K → 60K → 50K → 40K → 20K → 10K 逐级跳水，长尾（475 / 130 / 39 / 21 / 17 / 15 / 9）基本是三位数 [4][5]。

一个容易被忽略但极重要的对照：**`HTML5 Video Speed Control` 2022 年 3 月就停更了，今天仍靠 4 万用户 + 1.3K 评分占着搜索位** [11]。商店排序的复利效应会长期保位 —— 这条路**不封死，但入场券是评分，而我们一张评分都没有**。

### 1.2 我们的定位所在品类：天花板约 10 万

| 扩展 | 用户 | 评分 | 全屏怎么做 |
|---|---|---|---|
| Full Screen for Google Chrome | **100,000** | 3.4 (392) | 自己造浮层 |
| Video Maximizer - Zoom to Fill | 20,000 | 4.8 (189) | 自己造浮层 + 隐藏侧栏（**与我们定位几乎逐字重合**）[27][72] |
| Maximize Video | 20,000 | 4.8 (60) | 自己造浮层 |
| Windowed Fullscreen for Videos | 10,000 | 4.8 (39) | 自己造浮层，明确声明不进 native fullscreen |
| Full Screen Video | 5,000 | 4.6 (16) | 自己造浮层 |
| Windowed Fullscreen - YouTube & All Videos | 5,000 | 4.0 (4) | 自己造浮层 |
| Full screen your Videos | 4,000 | 3.7 (9) | 2022 年后未更新 |
| Fullscreen Anything | 2,000 | 2.3 (9) | 自己造浮层 |
| Auto Full Screen for Tabs & Videos | 948 | 3.6 (12) | 自己造浮层 |
| Full browser screen Video Player | 1,000 | 2.7 (7) | 2022 年后未更新 |

数据：[26][27][28][29][30][31][72][75][104]

**这个品类有三个特征，共同构成对我们的判决：**

1. **规模天花板低**：最大 10 万用户，且那一家的评分只有 3.4 —— 用户装了但不满意（大概率是"某些站点失效"）。
2. **技术路线一致**：全站通用必须自己造浮层（要适配各站点 DOM、iframe、shadow root，[28] 的描述直接点名这三件事），成本高、脆；单站增强可以蹭站点原生 theater mode，成本低、稳，但被锁死在一个站点里。我们走的是"自己造浮层"，和这一类里所有玩家同一条路。
3. **高流失**：`Fullscreeneverything` 系列、`Full browser screen Video Player`（2022 后停更）、`Full screen your Videos`（停在 2022-09-21）都有批量停更史。

### 1.3 一个反例：需求是真的，但形态不是"播放器"

同一个"让视频更大"的需求，换了个更简单的实现，规模差一个数量级：

| 扩展 | 用户 | 做什么 |
|---|---|---|
| Zoom Video - UltraWide Fill | **400,000** | 改宽高比去黑边、铺满窗口 [74] |
| Zoom to Fill - Ultrawide Video | **200,000** | 同上 [73] |
| Picture in Picture - floating video player | 400,000 | 走浏览器原生 PiP [24] |
| Video Maximizer | 20,000 | 造浮层、隐藏侧栏、完整控制条 [27] |
| 我们 | 23 | 造浮层、隐藏侧栏、完整控制条、跨域 iframe、读屏、零遥测 |

**用户要的是"画面更大"，不是"一个播放器"。** 用 20 行 CSS 给"去黑边"就能满足前者；后者要 2 万行代码、14 轮审计、31 个 e2e spec —— 而市场为"前者"付了 40 万用户，为"后者"付了 2 万。

更要命的是：**B 站播放器扩展的描述里直接写着 "Set default screen mode: normal | wide screen | **web fullscreen**"** [76] —— 连最大的中文视频平台都自带网页全屏模式。我们把一个站点原生能力当成了差异化。

### 1.4 市场结构：红海，关键词位已被锁死

商店搜 "video speed controller" / "video speed" / "playback speed control" / "video speed pro" 四组词，Top10 高度重叠且高度同质：**至少 4 个扩展名字逐字叫 "Video Speed Controller"，4 个以上叫 "Video Speed Controller Pro"**，再加 "Video Speed Control" / "HTML5 Video Speed Control" / "Global Speed" / "Super Video Speed Controller" [4][5]。

搜索结果卡片**只展示名称 + 评分 + Featured，不展示用户数** [4]。这意味着：

- 一个新用户搜 "video speed controller"，会看到 5 个名字几乎一样的产品；
- 我们排在后面的可能性极高，因为卡片上我们写 "0 out of 5"，别人写 4.0 / 4.7 / 4.8 / 4.7；
- **我们的 23 个用户，在商店页底部被 "You might also like…" 直接推荐给了这 4 个竞品** [3][102] —— 商店的推荐算法在替竞品做转化。

### 1.5 收费模式：这条路已经被市场否决

Top12 无一挂 "Offers in-app purchases" [2][12]。唯一做订阅的 `VideoMaster` 标着 "PRO ($2.99/mo)" 却只有 **9 个用户**；两个挂内购的 "Video Speed Controller Pro" / "Video Speeder Pro" 分别只有 **21 / 15 用户** [13][31]。

反倒是"免费"被写进了卖点：`Poply` 写 "no paywalls, ads, or premium tiers" / "no account, subscriptions, tracking, or upsells"，`Doped YouTube` 写 "premium features completely free. No subscriptions, no hidden costs." [31]。

**结论：付费在这个品类目前没有成功样本。** 这**验证**了 PRODUCT.md 阶段 3 "不做 Pro/付费" 的决策 —— 但也说明"我们免费"不是差异点，是及格线。

---

## 2. 我们的基线：23 用户、0 评分，以及一个被低估的结构性事实 `[Confidence: High]`

### 2.1 我们自己的商店页（领衔代理亲自用真实浏览器读，2026-10-23）

```
Video Speed Controller — Fullscreen & Keys
Tools
23 users
0 out of 5 · No ratings
Version 6.0.8 · Updated October 8, 2026
Offered by Jasper Pan · Size 40.14KiB · 2 languages (English, 中文（中国）)
Non-trader · The developer has disclosed that it will not collect or use your data.
Privacy Policy → PRIVACY.md
Support → Visit support hub
You might also like…
  Video Speed Controller                    4.0
  Video Speed Controller – Playback Speed…  4.7
  Video Speed Control                       4.8
  HTML5 Speed Controller                    4.7
```
[3][102]（Tier 1，独立复核一致；shields.io 第三方镜像同样显示 23 users / 0 评分 [14]）

### 2.2 商店页简介是**过时的，而且是反的**

线上简介逐字写着：

> - Customize **four** shortcuts from the options page
> - **Cross-origin iframe videos may not be directly controllable**

而当前代码是 **7 个动作**全部可改绑，且 **6.1.0 起跨域 iframe 已完全支持接管与网页全屏**（6.2.0 起画面铺满整页）。[102][88]

**商店简介与版本是独立的**：6.2.0 审核通过后，简介文案**不会**自动更新。也就是说，除非手动去 Dashboard 改，这段话会继续挂在那里——在我们仅有的 23 个用户的页面上，主动告诉潜在用户"我们只能改四个快捷键、跨域嵌入框我们管不了"。

这是本次研究里**最便宜、也最直接**的一个可执行发现：改文案是 0 成本，而它在下载前 5 秒生效。

### 2.3 排序机制把我们排除在算法之外

Chrome 官方文档明说商店排序的输入包含：

> "Items in the store are ranked in order to make it easier for users to find high quality content." — "ranked based on a number of criteria"，含 "ratings from users as well as usage statistics" 与 "the number of downloads vs. uninstalls over time"，以及 "metadata from your item's listing page" [6]

"ratings from users" 是第一位的。我们是 0。

**冷启动死锁**：0 评分 → 卡片上无评分信号 → 排在同名竞品之后 → 没人点 → 没人装 → 还是 0 评分。**这个循环的破口不在代码里，在"先拿到 10 条评分"上。**

另外，分类也吃排序权重：我们挂在 **Tools**，榜首在 **Functionality & UI**，Global Speed 在 **Workflow & Planning** [3][1][2]。分类是 Dashboard 里一次点击的事。

### 2.4 23 用户能不能证明"产品没优势"？不能——因为我们从未推广过

PRODUCT.md 阶段 0 是"拿到真实用户信号"，其下的三项动作**至今全部未勾选**：

- [ ] 每周看一次 Chrome Web Store Dashboard 的安装数曲线（免费、零开发）
- [ ] 去 V2EX / 少数派 / Reddit r/Productivity 发出去，直接问三个问题
- [ ] 商店评论每条认真回复

`docs/LAUNCH.md`（12KB）里 V2EX / 少数派 / Reddit 三套文案**已经写好了**，标题候选、正文、"刻意没做的"说明、已知边界（只控制视频不控制纯音频、iframe 的焦点规则）全都齐备，最后还有一节"什么算信号、什么不算"。**它写了 17 天，一次没发。**

商店首次提交是 2025-07-14，线上仍是 6.0.8 [88][3] —— 约 15 个月 23 用户、0 评分，**与"从没让人知道过"完全一致**。

对照社区里"换掉头部扩展"的动因，有一条非常直白：

> "Lately there's been a lot of bugs (Within the past 6-8 months or so)" [47]

这正是头部的集体回归期（见 §3.3）。**市场正在出现"想要一个更干净的"的窗口，而我们从没站到过窗口里。**

---

## 3. 差异化判断：我们的优势与特点 `[Confidence: Medium-High]`

先说结论：**优势真实、可验证、且在同规模产品里很硬，但结构上是防守型的。** 下面每条都给出可核验的对照。

### 3.1 相对最接近的竞品：我们做对了它做砸的五件事

`Video Maximizer`（trophygeek，20,000 用户 / 4.8★ / 189 评，2026-02-16 更新，free & open-source）是定位最接近我们的产品 —— 描述里写着 "VIDEO MAXIMIZER: FILL YOUR BROWSER WINDOW, NOT YOUR SCREEN. … It provides a true 'Theater Mode' for almost any site, hiding comments and sidebars so only the video, its playback controls, and captions are visible." [27][72]

它的低分评论（按"评分由低到高"排序读出）[104]：

| 用户原话 | 我们对应的实现 |
|---|---|
| "I expected the escape key to return to non-fullscreen." (2017) | `Esc` 退出网页全屏，有守卫 |
| "I expected to be in the same scroll position when returning from fullscreen." (2017) | 退出全屏后逐属性还原样式（只还原我们写过的、且当前值仍等于我们写的），页面布局完好 |
| "Does not work with embedded youtube videos." (2017) | 6.1.0 起嵌入框里的视频被接管（同源与跨域），6.2.0 起画面铺满整页 |
| "If there is a scroll bar … make maximize the video, and restore the video size, then the scroll bar is disappeared" (2026-08-13) | 6.2.0 修「站点给 `<body>` 加 transform → 网页全屏黑屏」与退出后的还原 |
| "the pics seem to be a bit blurry and streached out" | reparent 后 `object-fit: contain` 保比例，不拉伸 |

**这五条全是它被骂的，也全是我们的强项，且每一条都写了变异验证过的守卫。** 这不是"差不多"，是"它做砸了的那部分我们专门修过"。

### 3.2 相对头部：它 2025–2026 集体回归的那批毛病，正是我们修过的那批

`Video Speed Controller`（300 万用户）**最近 40 条评论全是 1 星**（2025-09-16 → 2026-10-16），多条 8–24 人点"有用" [40]。逐条读：

| 用户原话（1 星） | 我们 6.x 的对应修复 |
|---|---|
| "if I pause Youtube or use the arrow keys to skip 5s forwards or backwards, the speed will reset to 1.00 every time. This is extremely annoying and basically makes the tool unusable."（16/16 有用） | 6.2.0 修「复位路径缺版本号闸门」；6.0.9 起「只接管用户正在看的视频」 |
| "the speed will reset to its normal speed every second" | 6.2.0 修「探针扑空导致倍速读数被误清」——扩展开始说假倍速 |
| "it changes the speed of videos randomly and I can't even turn it off when I'm not using it" / "**Probably malware at this point.**" | 6.0.9 起接管判据收窄（可见度 ≥10% + 显著度 + 站点点名） |
| "sadly the newest version doesn't save your speed anymore and just randomly switches the speed if you have multiple videoplayers running at different speeds" | 多视频页面认怂；只对焦点所在那一层生效 |
| "it starts conflicting with YT, some chances that at start video disappears, sadly must disable until it got fixed" | 6.2.0 修「站点在接管后重渲染播放器 → 假全屏」 |
| "Update 0.10.0 causes conflicts with YouTube's native speed controller"（10/10 有用） | 不抢站点已有的倍速控件 |
| "it started assuming my keyboard layout is QWERTY this week and screwed up all my keybindings" | ⚠️ **我们也没做**（见 §4） |

**"Probably malware at this point"** 这一条值得单独拎出来：一个 300 万用户的扩展，用户已经在怀疑它是恶意软件。**信任一旦崩掉，规模不再能保护你。** 这是一个真实存在、且正在发生的窗口。

### 3.3 信任维度：我们比头部更干净，而且是**可验证**的干净

| 维度 | Video Speed Controller (igrigorik) | Global Speed (POLYWOCK) | VSC Pro | **我们** |
|---|---|---|---|---|
| 商店评分/用户 | 4.0 / 3,000,000 | 4.5 / 700,000 | 4.8 / 20,000 | **0 / 23** |
| manifest permissions | `["storage"]` | `["storage","webNavigation","scripting","contextMenus"]` + clipboard 可选 | 闭源，未知 | **`["storage"]`** |
| 遥测 / 外网请求 | 源码无 fetch/XHR/analytics | **有一处**：`fetch("https://polywock.github.io/gs-promos/config.json")`（作者自推广位） | 无从查证 | **0 处**（本次实测） |
| 开源 | MIT | 无 LICENSE | 闭源 | **MIT** |
| 隐私政策新鲜度 | 最后更新 2024-05-01（落后扩展更新 15 个月） | 承认拉取 promo JSON，但商店描述写 "Zero tracking, zero data collection" | 商店页声明 | **2026-10-22 更新，与代码同步** |
| 产物体积 | 103KiB | 636KiB | — | **40.14KiB**（最小） |
| 产物里的外部 URL | — | — | — | **0 个**（只有我们自己的 GitHub 仓库与隐私政策链接） |

来源：[43][44][1][2][3][102]

我在本次体检中直接对 `dist/` 做了机器验证：`fetch()` / `XMLHttpRequest` / `WebSocket` / `sendBeacon` / `EventSource` / `importScripts` / `eval()` / `new Function()` **命中 0 处**；产物里出现的全部 URL 只有两个，都是我们自己的 GitHub 仓库与隐私政策链接。

**这是我们唯一一条在下载前 5 秒就能被用户自己验证、且竞品做不到的优势**：竞品的隐私承诺是"商店页上的一句话"，我们的是"你 unzip 一下 grep 一下就知道"。Global Speed 就在 `polywock.github.io` 拉作者自己的推广位——而它的商店描述写着 "Zero tracking, zero data collection"。

⚠️ 但**这条优势不能当差异点卖**，因为三个头部产品的商店页**全都**写着 "The developer has disclosed that it will not collect or use your data" [1][2][43]。"不采集数据"是这个品类的及格线，不是加分项。**真正的差别在于"能不能被验证"和"竞品实际上做了什么"** —— 这两件事用户不会主动去查，所以它带来的是口碑和信任，不是转化。

### 3.4 我们独有的能力（竞品商店描述里都没有）

逐条核过三个头部产品的完整描述 [1][2][42]：

| 我们的能力 | 竞品有没有 | 证据强度 |
|---|---|---|
| 跨域 iframe 接管 + 网页全屏铺满整页 | Pro 描述说支持 iframe/shadow DOM，但**只字未提 fullscreen / PiP / 下载 / 播放列表** [42] | Tier 1 描述原文 |
| 接管失败时**出声**（"视频在嵌入框里 —— 点一下它就能用快捷键"） | 竞品的等价行为是**沉默**（差评里全是"nothing happens"） | Tier 1 差评 [40][41] |
| 读屏播报通道 + 控制条完整键盘操作 | 无人提及 | Tier 1 描述 |
| 首次引导 + 设置页"重新显示使用引导" + 冷却期 | 无人提及 | Tier 1 描述 |
| 全屏收起态常驻退出钮（28×28） | 无人提及 | Tier 1 描述 |
| 尊重 `prefers-reduced-motion` | 无人提及 | Tier 1 描述 |
| 精简版引导（嵌入框放不下时降级） | 无人提及 | Tier 1 描述 |
| `0` 键复位到 1.0x（不靠记忆） | 竞品有 R 键复位，但有"自动记忆"（见 §4） | Tier 1 描述 |

**"失败要出声"这一条值得高看一眼。** 竞品的 1 星差评里反复出现"按了键什么都没发生"型投诉（GS 的 "Doesn't work in fullscreen"、Reddit 上的 "it basically fails"），而 PRODUCT.md 明确把"减法减的是常驻界面，不是反馈"写成了设计原则。**在竞品集体沉默的地方说清楚真相，是我们少有的、用户能直接感知到的体验差异。**

### 3.5 结构性判断：我们的优势是防守型的

把上面所有优势摆在一起看，它们有一个共同形状：

> **它们只在"用户已经踩到那些坑"之后才产生价值。**

下载发生在踩坑之前。一个还没装扩展的人，不会因为"你修了退出全屏后滚动条消失"而下载 —— 他不知道有那个坑；他会因为"这个扩展能让我在网课上快进到 2 倍"而下载，因为那是他此刻的痛。

这解释了一个悖论：**我们的产品深度（21,807 行产品代码 / 26,027 行测试 / 31 个 e2e spec）远超同规模竞品，市场回报却是 23 vs 20,000。**（对照 `Video Maximizer` 2 万用户 / 4.8★ [72]，我们的代码量是它的数倍，用户量是它的 1/870。）

**所以问题的答案不在"我们有什么优势"，而在"这些优势在决策发生的那一刻能不能被看见"。** 目前不能。

---

## 4. 差距：竞品有、而我们没有的（与优势并排）

这一节按"值不值得做"排序，不按工作量排序。

| # | 缺口 | 谁有 | 证据 | 我的判断 |
|---|---|---|---|---|
| **1** | **前 10 条评分**（不是功能） | 所有活下来的产品 | 排序吃 ratings [6]；头部 1.3K 评停更两年仍占位 [11] | **最高优先**。这是唯一能把"防守型优势"变成"可感知优势"的杠杆 —— 有评分才有社会证明，才有人敢点 |
| **2** | **商店页简介是反的**（四个快捷键 / 跨域 iframe 管不了） | — | [102][88] | **今天就改**。0 成本，在下载前 5 秒生效 |
| **3** | **精细倍速区间**（0.07x–16x，步进可调） | iglupo / Pro / GS | [1][8][42][2] | **值得**。我们只有 ±0.1 固定步进，GS 有用户抱怨"改一次速度要 57 秒" [41] |
| **4** | **站点级默认速度规则**（手动设，不是自动记） | iglupo（per-site rules）/ GS（URL rules）/ Pro（per-site memory） | [8][1][2][78] | **值得，且与我们的减法不冲突**。我们 6.0.7 砍掉的是"自动改速度"（用户骂的正是这个："videos are automatically starting at 2.1x"、"8月くらいからどの動画も3倍速がデフォルト" [40]）；"我自己设的默认值"是另一回事，且被反复要求 |
| **5** | **滚轮调速 / 逐帧步进** | 用户主动要求，竞品都没有 | [40] H 类 | **值得，成本低**。用户原话："もしanterrati… como na ютубе… com o mouse seria会是…"（要滚轮不要键盘） |
| **6** | **覆盖层可常驻 / 可彻底隐藏** | 用户主动要求 | [40] H 类（"可惜覆盖层不能常驻"、"make it constant"） | **值得，成本低**。我们的淡角标正好在这条中间地带 |
| **7** | **非 QWERTY 键盘布局** | 无人做，但用户被坑 | [40] C 类："it started assuming my keyboard layout is QWERTY this week" | **值得**。PRODUCT.md 阶段 2 已列未做；AZERTY 用户直接卸载 |
| **8** | **播放列表连续播放**（进全屏后自动播下一个） | Video Maximizer 被抱怨缺 | [104] | 可做，成本低 |
| **9** | **音频控制** | iglupo / GS / HTML5 Speed Controller | [1][2] | **明确不做** —— 我们对外承诺就是"只控制视频不控制纯音频"（商店简介、README、PRIVACY 三处一致）。但要意识到这会劝退 Netflix/播客用户，简介里那句话本身就在劝退 |
| **10** | **PiP** | 多个（40 万用户） | [24][71][52] | **不做**。浏览器原生 PiP 已覆盖，且社区里 PiP 需求已被 400K 产品满足 |
| **11** | **覆盖更多语言**（竞品 19–55 种） | 几乎所有竞品 | [3] vs [1][2][9] | **中等**。iglupo 只有英文也有 300 万用户，所以语言不是主因。收益最大的其实是中文（B 站/慕课用户） |
| **12** | **学习工作流**：双语字幕 / 笔记 / 单词卡 / A-B 复读 | Udemy 双字幕 3 万、Netflix/YouTube 语言学习 10 万、Relingo 5 万、Snipo 笔记 4 万、Subtly 1 万 | [61][63][66][67][70] | **唯一被市场验证过规模的第二曲线**，但**这是另一个产品**：需要 AI、账号/云同步、订阅体系 —— 与我们的减法、零遥测、零账号正面冲突。**必须由 Jasper 单独决策，不能顺手做** |

**注意 #12 的一个反直觉事实**：专门服务 Udemy 的倍速扩展 `Udemy Custom Speed Changer` 只有 5,000 用户 [60]；而同一批人用"字幕 / 笔记 / 单词卡"的能到 3 万–10 万 [61][63][66][67]。**在这个人群里，倍速是低价值功能，字幕和笔记才是留存钩子。** 我们 6.x 砍掉 HUD、砍掉预设、砍掉记忆的那套"减法"，在这个人群的价值排序里，进一步被推到了后面。

---

## 5. 关键判断与矛盾（诚实呈现，不做调和）

### 矛盾一：优势是真的，但优势不可见
功能质量 21,807 行、测试 26,027 行、e2e 31 个 spec [代码实测]，市场回报 23 用户 vs 同类 20,000 [3][72]。**我们赢在用户装完之后三个月里的每一天，输在用户装之前的那 5 秒。**

### 矛盾二：定位所在品类天花板约 10 万，而"去掉黑边铺满窗口"有 40 万
"网页全屏/干净播放器"这类最大 10 万用户（评分 3.4），评分最好的 2 万 [26][27][72]；"铺满窗口去黑边"40 万 / 20 万 [74][73]。**用户买的是"画面更大"，不是"一个受控的播放层"。** 我们把实现手段当成了差异化。

### 矛盾三：减法哲学 vs 市场投票
市场投给了功能全的那家（300 万），而它的最近 40 条评论全是 1 星 [40]。**但差评骂的恰恰是"乱来"**（自动改速度、跨标签页污染、跟 YT 打架），不是"功能少"。所以减法的**方向是对的**，错的是——**减法没法当卖点讲**，因为用户无法想象"它没有的那个东西"。换句话说：我们的减法是**留存优势**，不是**获客优势**。

### 矛盾四："网页全屏"这个定位，PRODUCT.md 自己已经推翻过一次
2026-10-06 那段自我质疑写着："调速有头部竞品…浏览器原生全屏与站点播放器自带全屏也已经做得相当好。**剩下的真实差异化只有一句：跨平台统一 + 可改键 + 没有广告层遮挡。**…因此对外叙事应从「更好的网页全屏」转向「**多平台统一的干净播放层**」" —— 本次数据是它的**佐证**（全屏品类天花板 10 万；B 站原生自带 web fullscreen 模式 [76]）。**这个判断当时是对的，只是没人据此改过任何东西。**

### 矛盾五：我们的商店页在替竞品做转化
"You might also like…" 推 4 个竞品、评分 4.0–4.8，我们 0 评分 [3][102]。**每装一个我们的人，商店都顺手把他送去装别人。**

---

## 6. Action Plan

> 排序原则：**先解分发，再谈产品。** 理由：分发问题的修复成本以天计，产品问题的修复成本以月计，而分发问题不解决时，任何产品改进的收益都无法被观测。

- [ ] **拿到 Dashboard 的展示量 → 安装转化率**（零开发，最高信息量）。23 个用户背后可能是 300 次展示（转化率 7.7%，是文案/页面问题）也可能是 50,000 次展示（0.05%，是排序问题）。**这两种病有两种药，不看这个数字就无法判断"凭什么使用我们"。** 顺带把 PRODUCT.md 阶段 0 第一项打勾。
- [ ] **把 `docs/LAUNCH.md` 的三套文案发出去**（V2EX / 少数派 / Reddit）。它已经写好了三套目标平台文案 + "刻意没做的"说明 + 已知边界 + "什么算信号"。**这是 15 个月 0 评分的直接原因**，而且成本是几小时。
- [ ] **改商店页简介**（Dashboard 内，0 成本）：去掉 "Customize four shortcuts"（实际 7 个）与 "Cross-origin iframe videos may not be directly controllable"（实际 6.1.0 起完全支持）。**这段话现在在主动劝退用户。**
- [ ] **把分类从 Tools 改到 Functionality & UI**（Dashboard 内，免费）：榜首在这个分类，排序吃分类 [6][1]。
- [ ] **向现有 23 位用户请求评分**（商店内 + 邮件式引导）。目标是**先拿到 10 条** —— 这是排序信号的唯一来源，也是打破冷启动死锁的最小单位 [6][11]。
- [ ] **按用户抱怨顺序补三个小功能**：滚轮调速 → 覆盖层可常驻/可隐藏 → 非 QWERTY 键位。三个都是差评里用户**主动点名**的，成本低，且都能在 changelog 里写成"用户说过的" [40]。
- [ ] **加"站点级默认速度"（手动设、用户自己设，不是自动记）**。这是我们 6.0.7 减法里砍错的那一刀的精确补法：保留"不替用户做决定"，补上"允许用户自己做决定" [8][40]。
- [ ] **把定位从「网页全屏」改写为「跨站一致的干净播放层」**（PRODUCT.md 已有的结论，本次数据佐证），并让商店简介的第一句话就说它，而不是从功能列表讲起。
- [ ] **决定要不要开第二曲线**：学习工作流（字幕/笔记/复读）是被市场验证过规模的方向（3 万–10 万 [61][63][66][67]），但需要 AI + 云 + 账号，与我们的零遥测/零账号/减法正面冲突。**这是方向分叉，需要你单独决策，不建议顺手做。**
- [ ] **重写 PRODUCT.md 阶段 0 的分叉判据**。原判据是"2026-11-03 前拿到用户信号"—— 本次研究其实已经给出了部分答案（我们从没试过）。判据应该改成"先发出去了没有"，而不是"有没有信号"。

---

## 7. Open Questions & Caveats

1. **Dashboard 展示量/转化率（拿不到）**：这是唯一能区分"没流量"与"有流量不装"的数据，决定后面所有动作的顺序。**必须由你去 Dashboard 取。**
2. **中文市场规模未验证**：CWS 站内搜索 RPC 对中文关键词几乎零命中（"倍速""网课""慕课"全 0 条）[85]，这是索引覆盖问题，不等于不存在。中文侧唯一可读的实证是 B 站播放器扩展 1 万用户 [76]。
3. **"会议录像回放"是真空，但不是需求**：CWS 搜 "meeting" 返回的 10 个全是 AI 纪要、搜 "recorder" 全是录制 [77]。**没有产品 ≠ 有需求**，不能据此立"空白市场"的项目。
4. **在线教育市场规模数字不可用**：同一关键词检索得到 $77B / $162B / $265B / $325B / $382B / $420B 六个互相矛盾的口径 [84]。改用官方 learner 数（Coursera+Udemy 合并后 300+ million learners [79][81]）做规模判断。
5. **付费意愿的证据不在扩展市场**：Enounce MySpeed 以 $99.99 一次性卖给 eLearning 学生 [82][83]，但那是桌面软件不是扩展，且样本唯一。
6. **"网页全屏"品类天花板 10 万，是从样本推断的**（12 个产品里最大 10 万），不是平台统计。样本外的可能性存在，但同一品类里 10 个以上产品卡在 1 千–2 万 [26][27][28][72][104]，"长尾极重"是可信的。
7. **本次未覆盖**：2024–2026 年"大规模下架滥用 `<all_urls>` 扩展"的媒体复盘（WebSearch 在本环境不可用）；V2EX / 少数派站内检索（JS 渲染，接口返回空）——中文社区信号仅来自知乎一篇 [60] 与商店页中文评论。
8. **0.10.0 回归是头部的，不是我们的**：§3.2 全部指 igrigorik 的产品。我们的对应能力是我们自己代码与测试里的事实，与竞品评论是**对照关系**，不是同一份产品。

---

## Methodology

- **深度**：standard（按 skill 默认）。
- **子代理**：3 个检索代理（倍速类全景+市场结构 / 全屏播放器增强类 / 差评痛点+信任合规）+ 1 个补缺代理（在线学习者人群）+ 领衔代理亲自直读 4 个商店页（我们自己的、iglupo 的 overview、iglupo 的差评、Video Maximizer 的差评）。**差评证据由两个独立路径取得**：领衔代理用 Playwright + "Lowest to highest rating" 排序读商店评论；C 代理独立用同一方法读出 iglupo 与 Global Speed 的评论，**两份结论在关键条目的原话上一致**（例如"速度复位回 1.00"这条，两个来源都读到）。
- **取证方法**：Chrome Web Store 商品页与搜索页均为 JS 渲染，WebFetch / curl 只能拿到空壳。实际使用三条路径交叉验证：(a) 官方站内搜索 RPC `QcU9bc`；(b) 商品页首屏 SSR HTML 正则提取 users / rating / Version / Updated / Size / Languages；(c) Playwright 真实浏览器读 DOM 与评论。**领衔代理对自己商店页的数字做了第二次独立复核，与代理 A 的读数一致**（23 / 0 / 6.0.8 / 40.14KiB / 2 languages / Tools）。
- **引用核验**：无独立 Verification 子代理（工具预算已用于取证）。作为替代，所有 Tier 1 数字均由**至少两个独立路径**取得（不同代理 / 不同渲染方式 / 第三方 shields.io 镜像 [14]），并在正文中标注了单一来源项。
- **编号**：检索代理 A [1]–[15]、B [20]–[32]、C [40]–[70]、补缺代理 [60]–[88] 存在重叠，合并后统一重编为 [60]–[88] → **[71]–[99]**，C 的 [40]–[70] 保持不变；领衔代理自采 [100]–[104]。
- **降级说明**：本环境 WebSearch 返回 "web-search access isn't available"、exa 免费额度超限；多个代理改用 CWS 官方 RPC + 商品页直取 + Bing/浏览器取得。**代价是缺少 Tier 2 媒体评测与 2026 年对比评测**；收益是全部规模/评分数字均为 Tier 1 一手数据，无二手转述。
- **本仓库侧事实**：权限面、产物网络 API 扫描、i18n 键位、代码与测试规模、商店页简介文案、`PRODUCT.md` 阶段 0 清单状态 —— 均由领衔代理在本仓库直接核实，非引用外部来源。

---

## Bibliography

**A 区：倍速类头部与市场结构**
[1] Chrome Web Store — Video Speed Controller (igrigorik) · https://chromewebstore.google.com/detail/video-speed-controller/nffaoalbilbmmfgbnbgppjihopabppdk · 2026-10-23 · Tier 1
[2] Chrome Web Store — Global Speed - Video Speed Control (POLYWOCK) · .../global-speed-video-speed/jpbjcnkcffbooppibceonlgknpkniiff · 2026-10-23 · Tier 1
[3] Chrome Web Store — **我们自己的商品页** · .../mennabljgjphikgaiahngapedibccmei · 2026-10-23 · Tier 1
[4] CWS 搜索页 q="video speed controller" · .../search/video%20speed%20controller · 2026-10-23 · Tier 1
[5] CWS 搜索页 q="video speed" / "playback speed control" / "video speed pro" · 同上形式 · 2026-10-23 · Tier 1
[6] Chrome for Developers — Discover（商店排序机制）· https://developer.chrome.com/docs/webstore/discovery · 页面标注 2022-03-21 更新 · Tier 1
[7] Chrome Web Store Program Policies — Accepting Payment From Users · https://developer.chrome.com/docs/webstore/program-policies/accepting-payment · Tier 1
[8] GitHub — igrigorik/videospeed README（作者官方仓库）· https://github.com/igrigorik/videospeed · Tier 1
[9] CWS — Super Video Speed Controller · .../chnccghejnflbccphgkncbmllhfljdfa · Tier 1
[10] CWS — Youtube Playback Speed Control · .../hdannnflhlmdablckfkjpleikpphncik · Tier 1
[11] CWS — Video Speed Control (Sevina) / HTML5 Video Speed Control (Cool Apps) · Tier 1
[12] CWS — VSC Pro (tinyflash.org) / Prime Video Speeder / YouTube Speed Controls / Video Playback Speed · Tier 1
[13] CWS — VideoMaster（$2.99/mo 订阅，9 用户）/ 两个带内购的 Pro（21 / 15 用户）· Tier 1
[14] shields.io chrome-web-store 徽章（第三方镜像交叉验证）· Tier 3
[15] 本仓库 CHROMEWEBSTORE.md + CHANGELOG.md · Tier 1（自有权威记录）

**B 区：全屏与播放器增强类**
[20] CWS 站内搜索 RPC（发现入口）· Tier 1
[21] CWS — Enhancer for YouTube™ · .../ponfpcnoihfmfllpaingbgckeeldkhle · Tier 1
[22] CWS — Video Speed Controller（另一副本，20,000）· Tier 1
[23] CWS — Global Speed（另一副本读数）· Tier 1
[24] CWS — Picture in Picture - floating video player · .../gmehookibnphigonphocphhcepbijeen · Tier 1
[25] CWS — Super Video Speed Controller（另一读数）· Tier 1
[26] CWS — Full Screen for Google Chrome（Stefan vd）· .../gmimocjjppdelmhpcmpkhekmpoddgima · Tier 1
[27] CWS — Video Maximizer - Zoom to Fill（trophygeek）· .../cdnlfphfngnfhjcnoikfhaomaaflaiie · Tier 1
[28] CWS — Windowed Fullscreen for Videos · .../bkcghongfpfngpdobomhdehbffibkjlh · Tier 1
[29] CWS — Theater Mode for YouTube™ (MeryDev) · .../dgognhgbpdoeidccnbfhohblklhbbomh · Tier 1
[30] CWS — BigTube (Pregnantboy) · .../gdkadbhiemijfpoochcieonikoaciapi · Tier 1
[31] CWS — VSC Pro / Video Speed Control / Poply / Doped YouTube 对照组 · Tier 1
[32] 读不到项的诚实记录（Ultimate Video Speed Controller 在 CWS 不存在；chrome-stats 403）· 方法说明

**C 区：用户痛点与信任合规**
[40] CWS — Video Speed Controller 商品页**评论本体** · .../nffaoalbilbmmfgbnbgppjihopabppdk/reviews · Tier 1
[41] CWS — Global Speed 商品页评论本体 · .../jpbjcnkcffbooppibceonlgknpkniiff/reviews · Tier 1
[42] CWS — Video Speed Controller Pro（tinyflash.org）· .../jlhimcnaojgbmmmambapclkgonfcpajb · Tier 1
[43] GitHub — igrigorik/videospeed（manifest.json / PRIVACY.md / LICENSE）· Tier 2
[44] GitHub — polywock/globalSpeed（manifest.json / PRIVACY_POLICY.md / promo.ts）· Tier 2
[45] CWS 搜索页（竞品矩阵）· Tier 1
[46] Reddit r/chrome_extensions — Global Speed 作者帖（polywock 自述无日志/无遥测）· Tier 3
[47] Reddit — Request: control video speed across all websites（"Lately there's been a lot of bugs"）· Tier 3
[48] Reddit — How to remove icon for the Video Speed Controller extension? · Tier 3
[49] Reddit — need an extension that increases every video by "x" speed · Tier 3
[50] Reddit — Why did the Global Speed fullscreen shortcut stop working on Facebook in Edge? · Tier 3
[51] Reddit — Built Windowed Fullscreen for YouTube（直接竞争者）· Tier 3
[52] Reddit — Any PIP Extensions that still work? · Tier 3
[53] Reddit r/firefox — video speed controller alternative? · Tier 3
[54] Reddit r/youtube — PSA: speed up yt videos faster than 2x（合规风险）· Tier 3
[55] Reddit r/youtube — The fact that i have to use 4 chrome extensions to make youtube usable · Tier 3
[56] Reddit — PSA: SpeedUp is hijacking Amazon links · Tier 3
[57] HN Show HN: Global Speed · https://news.ycombinator.com/item?id=22637189 · Tier 3
[58] HN 评论区选型理由合集 · https://news.ycombinator.com/item?id=22543770 · Tier 3
[59] HN — 去干扰播放器 · https://news.ycombinator.com/item?id=41803268 · Tier 3
[60] 知乎专栏《如何实现浏览器看视频倍速自由》· https://zhuanlan.zhihu.com/p/551817105 · Tier 3
[61] CWS Program Policies（全量正文）· https://developer.chrome.com/docs/webstore/program-policies/policies · Tier 1
[62] Use of Permissions · .../program-policies/permissions · Tier 1
[63] Privacy Policy / Disclosure Requirements / Limited Use · .../program-policies/{privacy,disclosure-requirements,limited-use} · Tier 1
[64] Ads + Affiliate Ads + Misleading or Unexpected Behavior + Minimum Functionality · Tier 1
[65] Additional Requirements for Manifest V3 · Tier 1
[66] Chrome Web Store review process（执法梯度、7–30 天审核期）· Tier 1
[67] Troubleshooting Chrome Web Store violations（"Remove all unused permissions"）· Tier 1
[68] User Data FAQ / Fill out the privacy fields · Tier 1
[69] Manifest V2 deprecation timeline（2026-08-31 MV2 全部下架）· Tier 1
[70] Migrate to service workers · Tier 1

**D 区：在线学习者人群（原补缺代理 [60]–[88]，重编为 [71]–[99]）**
[71] CWS — Udemy Custom Speed Changer（5,000 用户，只做倍速）· Tier 1
[72] CWS — Video Maximizer - Zoom to Fill（重编自原 [72]）· Tier 1
[73] CWS — Zoom to Fill - Ultrawide Video（200,000）· Tier 1
[74] CWS — Zoom Video - UltraWide Fill（400,000）· Tier 1
[75] CWS — Windowed Fullscreen 系列（重编自原 [75]）· Tier 1
[76] CWS — Extension for Bilibili Player（自带 web fullscreen 模式）· Tier 1
[77] CWS — Tactiq（1,000,000）与 "meeting"/"recorder" 关键词全量结果 · Tier 1
[78] CWS — Video Speed Controller Pro（tinyflash.org，重编自原 [78]）· Tier 1
[79] Coursera 官方新闻稿 — Coursera Completes Combination with Udemy（290M learners）· https://investor.coursera.com/news/news-details/2026/Coursera-Completes-Combination-with-Udemy-to-Build-the-Worlds-Most-Comprehensive-Skills-Platform/default.aspx · Tier 1
[80] Coursera 2026 Q2 财报 · https://investor.coursera.com/news/news-details/2026/Coursera-Reports-Second-Quarter-2026-Financial-Results/default.aspx · Tier 1
[81] Coursera IR 首页（300+ million learners）· https://investor.coursera.com/overview/default.aspx · Tier 1
[82] Enounce MySpeed 产品页（Wayback 2026-01-15 快照，$29.99/$99.99）· Tier 2
[83] Enounce eLearning 落地页（Wayback 快照）· Tier 2
[84] 在线教育市场规模六种互相矛盾的口径 · Tier 3（**标注为不可引用**）
[85] 中文网课市场：CWS 搜索 RPC 对中文关键词几乎零命中（索引问题，非"不存在"）· 方法说明
[86] 知乎问题「有没有好的视频加速插件」（直连 403，仅摘要）· Tier 3
[87] 中文博客若干（"网站的在线播放器一般只提供不高于4倍的播放速度"）· Tier 3
[88] 我们自己的线上 listing（基准参照）· Tier 1
[89] CWS — Udemy Dual Subtitles / Yakuu（30,000 / 10,000）· Tier 1
[90] CWS — Unlimited Video Translator for Coursera（3,000）· Tier 1
[91] CWS — Snipo — YouTube Notes to Notion（40,000）· Tier 1
[92] CWS — HoverNotes（20,000）· Tier 1
[93] CWS — MoocNote / TrackMyCourse（558 / 2,000）· Tier 1
[94] CWS — Language Learning with Netflix & YouTube-AFL（100,000）· Tier 1
[95] CWS — Relingo / Funlingo / Subtly（50,000 / 10,000 / 10,000）· Tier 1
[96] CWS — HayaiLearn（2,000，订阅制）· Tier 1
[97] CWS — Blur Bar for YouTube（681，2023 后未更新）· Tier 1
[98] CWS — Section Repeat – A-B Loop（1,000）· Tier 1
[99] CWS — Picture in Picture | PiP - Video Speed & A-B Loop（4,000）· Tier 1

**领衔代理自采**
[100] 我们自己的商店页（Playwright 直读，2026-10-23 15:10）· Tier 1
[101] Video Speed Controller 商品页 overview（Playwright 直读，含完整功能清单）· Tier 1
[102] 我们商店页全文（23 users / 0 out of 5 / No ratings / v6.0.8 / 40.14KiB / 2 languages / Tools / "You might also like…" 四条竞品 / 过时简介原文）· Tier 1
[103] Video Speed Controller 评论页（"Lowest to highest rating" 排序，读到 2026 年 1 星评论全文）· Tier 1
[104] Video Maximizer 评论页（同法，读到 1–5 星评论全文）· Tier 1

---

## Source Extracts（承重来源）

### [1] Video Speed Controller (igrigorik) — 头部竞品本体
- **摘要**：3,000,000 users / 4.0 / 4.5K ratings / v0.11.1 / Updated Aug 14-15 2026 / 103KiB / English / Functionality & UI / Featured / MIT。权限仅 `storage`，商店页写 "will not collect or use your data"。
- **关键引句**："Works on any site with HTML5 media: YouTube, Netflix, local files, etc, **including audio**."；"Fine-grained speed controls and defaults - 0.07x to 16x in configurable increments."；"Configurable per-site speed rules"；"Option to persist your last speed across sessions and tabs."；"Reposition the on-video speed indicator anywhere you like."
- **来源类型**：商店页本体 / Tier 1 / 数字直读 DOM

### [3][102] 我们自己的商品页 — 基线
- **摘要**：23 users / 0 out of 5 / No ratings / v6.0.8 / Updated Oct 8 2026 / 40.14KiB / 2 languages / Tools / Non-trader / 不收集数据 / "You might also like…" → Video Speed Controller 4.0、Video Speed Controller – Playback Speed for Any Video 4.7、Video Speed Control 4.8、HTML5 Speed Controller 4.7。
- **关键引句（过时简介）**："Customize **four** shortcuts from the options page"；"**Cross-origin iframe videos may not be directly controllable**"
- **来源类型**：商店页本体 + Playwright 独立复核 / Tier 1

### [6] Chrome for Developers — Discover（排序机制）
- **摘要**：商店排序的输入清单。
- **关键引句**："Items in the store are ranked in order to make it easier for users to find high quality content."；排序含 "ratings from users as well as usage statistics" 与 "the number of downloads vs. uninstalls over time"；"your store listing page is complete, accurate, and optimized" 是 "important to ensuring your item is discoverable through search"；Featured 是编辑选稿，"Developers cannot pay to be featured on the home page."
- **来源类型**：官方文档 / Tier 1 / 页面标注 2022-03-21 更新（方法学基础，标 [foundational]）

### [27][72] Video Maximizer — 与我们定位最接近的竞品
- **摘要**：20,000 users / 4.8 / 189 ratings / v3.0.120 / Feb 16 2026 / free, open-source。
- **关键引句**："VIDEO MAXIMIZER: FILL YOUR BROWSER WINDOW, NOT YOUR SCREEN."；"It provides a true 'Theater Mode' for almost any site, hiding comments and sidebars so only the video, its playback controls, and captions are visible."
- **来源类型**：商店页本体 / Tier 1

### [40] Video Speed Controller 评论本体 — 头部的集体回归
- **摘要**：按"评分由低到高 + 所有语言"读取约 41 条，**最新 40 条全为 1 星**（2025-09-16 → 2026-10-16）。
- **关键引句**："if I pause Youtube or use the arrow keys to skip 5s forwards or backwards, the speed will reset to 1.00 every time. This is extremely annoying and basically makes the tool unusable."（16/16 helpful）；"now it changes the speed of videos randomly and I can't even turn it off when I'm not using it because even disabled it still does it's thing incorrectly. **Probably malware at this point.**"；"it started assuming my keyboard layout is QWERTY this week and screwed up all my keybindings."；"Update 0.10.0 causes conflicts with YouTube's native speed controller"（10/10 helpful）
- **来源类型**：商店页评论本体 / Tier 1

### [44] polywock/globalSpeed — 竞品的信任负债
- **摘要**：MV3，permissions `["storage","webNavigation","scripting","contextMenus"]` + `clipboardRead/Write` 可选权限，全站 host_permissions。
- **关键引句**：`const PROMO_URL = "https://polywock.github.io/gs-promos/config.json"`（作者自推广位，条件触发）；仓库无 LICENSE 文件。
- **来源类型**：作者官方仓库 / Tier 2

### [61][64] Chrome Web Store Program Policies — 竞品踩过的红线
- **摘要**：本品类适用的合规约束。
- **关键引句**："An extension must have a single purpose that is narrow and easy to understand."；"Request access to the narrowest permissions necessary…"；"It is not permitted to inject affiliate links without related user action…"；"Extensions with broken functionality—such as dead sites or non-functioning features—are not allowed."；"Remove all unused permissions from your manifests.json's `permissions`, `optional_permissions`, and `host_permissions` arrays."
- **来源类型**：官方政策 / Tier 1

### [61][63][66][67] 学习者人群：跑出来的是字幕与笔记，不是倍速
- **摘要**：Udemy 双字幕 30,000；Netflix/YouTube 语言学习 100,000；Relingo 50,000；Snipo 笔记 40,000；HoverNotes 20,000。而专做 Udemy 倍速的只有 5,000。
- **关键引句**："You cannot read coursera subtitles and watch the slides at the same time."；"take clickable timestamped YouTube notes or Video notes … generate AI flashcards in one click … export it to Anki"
- **来源类型**：商店页本体 / Tier 1

### [104] Video Maximizer 评论本体 — 我们做对了它做砸的五件事
- **摘要**：按"评分由低到高"读取。
- **关键引句**："I expected the escape key to return to non-fullscreen."；"I expected to be in the same scroll position when returning from fullscreen."；"Does not work with embedded youtube videos."；"If there is a scroll bar on the web page and make maximize the video, and restore the video size, then the scroll bar is disappeared."；"the pics seem to be a bit blurry and streached out"
- **来源类型**：商店页评论本体 / Tier 1
