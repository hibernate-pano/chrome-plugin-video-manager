# Chrome Web Store Listing — Video Speed Controller

> Last Updated: 2026-10-04
> 本文件是 Chrome Web Store 上架信息的**单一事实来源**（chrome-extensions skill 约定）。
> 标注 ⚠️ 的字段需要发布者确认后才能提交。

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
> ⚠️ 改名**必须出新包过审**（商店名来自 `manifest.json` 的 `name`）。当前线上是 6.0.5，
> 已确认 PUBLISHED 且无待审版本，此刻是改动成本最低的窗口。
> 改名不影响已安装用户与自动更新——扩展 ID 由公钥派生，与名称无关。
> 详见文末「改名执行清单」。

**Short Description** [REQUIRED]
<!-- Max 132 characters. Shown in search results and tiles. Be specific about function. -->

把网页视频变成干净的全屏播放器，控制条自动隐藏、快捷键可改绑。Clean fullscreen player for web video, with auto-hiding controls.

<!-- 实测字符数见文件末尾的「提交前自检」 -->

**Detailed Description** [REQUIRED]
<!-- Max 16,000 characters. CWS 会剥离 markdown，所以用换行而不是 bullet 语法。
     用户视角，禁提实现细节（API / 库 / 框架 / 代码模式）。
     中英双语用 --- 分隔。 -->

Video Speed Controller 把网页里的视频变成一个干净的全屏播放器，并给你一组安静的键盘控制。

主要功能
网页全屏：按 f 让正在看的视频铺满整个视口，再按 f 或 Esc 退出，退出后页面布局完整还原。鼠标移动时浮现一条极简控制条，静止 3 秒自动淡出；控制条包含播放/暂停、可拖动的进度、时间、音量、当前速度与退出。扩展会自动挑出你正在看的那个视频。
播放速度：按 = 加速、- 减速，每次 0.1 倍；按住任一键可连续调速。按 0 回到 1.0 倍。调速时角落会淡入一个「1.5x」小胶囊，约一秒后消失，不打扰你。速度不会被记住：任何视频都从 1.0x 开始，看网课还是看纪录片，由你当场决定。
播放控制：空格播放或暂停，左右方向键后退或前进 5 秒。
快捷键由你决定：全部 7 个动作都能在设置页改绑，留空即禁用该动作。重复绑定会在保存前被拦下，与浏览器保留键冲突的绑定会被标出。
点击工具栏图标即可切换当前标签页的网页全屏。

怎么用
安装后无需任何配置即可使用。需要改键时打开设置页，点一下想改的那一行，直接按新键即可。设置页支持简体中文与 English。

适用范围
只控制视频，不控制纯音频。来自其他网站的嵌入式播放器可能无法直接接管。受保护的点播内容（例如流媒体平台的加密视频）由浏览器保护，无法接管。极少数页面在重建布局时会退回更简单的显示方式。

隐私
不收集任何个人数据，也不向开发者发送任何数据。你的快捷键设置保存在 Chrome 的同步扩展存储中，因此会跟随你的 Chrome 账号。扩展不保存你的播放速度，也不记录你访问过哪些网站——它只在页面上查找并控制视频元素。

---

Video Speed Controller turns web video into a clean, fullscreen player, and gives you quiet keyboard control over playback.

What it does
Page fullscreen: press f to fill the viewport with the video you are actually watching; f or Esc leaves, and your page layout is fully restored. A minimal control bar appears when you move the mouse and fades out after 3 seconds of stillness. It carries play/pause, draggable progress, time, volume, current speed and exit. The extension picks the video you are watching for you.
Playback speed: press = to speed up and - to slow down, in 0.1x steps; hold either key to keep stepping. Press 0 to return to 1.0x. A small "1.5x" capsule fades in for about a second and then leaves. Speed is never remembered: every video starts at 1.0x, so a lecture at 2.0x never follows you into the documentary you open next.
Playback control: Space plays or pauses. Left and Right arrows skip back or forward 5 seconds.
Shortcuts you control: all seven actions can be rebound on the options page, and any of them can be left empty to disable it. Duplicate bindings are caught before you save, and shortcuts the browser reserves are flagged.
Click the toolbar icon to toggle page fullscreen for the current tab.

How to use
Works out of the box with no setup. To rebind a key, open the options page, click the row you want, and press the new key. The options page is available in English and Simplified Chinese.

Scope
Controls video only, not audio-only players. Embedded players from other sites may not be directly controllable. Protected on-demand content, such as encrypted video on streaming services, is protected by the browser and cannot be taken over. A few pages fall back to a simpler display mode when they rebuild their layout.

Privacy
No personal data is collected, and nothing is sent to the developer. Your shortcut settings are stored in Chrome's synced extension storage, so they follow your Chrome account. The extension does not store your playback speed and keeps no record of which sites you visit; it only looks for and controls video elements on the pages you visit.

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

Turns any web video into a clean fullscreen player and provides quiet keyboard control over playback speed and play/pause.

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
| Screenshot 5 | 1280×800 | 🟡 Needs update | `store-assets/output/store-fresh-speed.png` |
| Small Promo Tile [RECOMMENDED] | 440×280 | ✅ Ready | `store-assets/output/store-promo-tile.png` |
| Marquee Promo Tile | 1400×560 | ⬜ Not created | |

<!-- Status options: ⬜ Not created | 🟡 Needs update | ✅ Ready -->

### Screenshot Notes

全部 1280×800，英文文案，各叠一句标题；`store-assets/output/` 被 .gitignore 忽略，用
`pnpm store:assets` + `pnpm icons` 重新生成（脚本见 `scripts/generate-store-assets.mjs`、
`scripts/render-icons.mjs`）。

1. `store-fullscreen` — 首图。全屏态 + 底部控制条，标题 `Watch any web video fullscreen`
2. `store-controls` — 控制条特写，标题 `Auto-hiding controls, out of your way`
3. `store-speed-toast` — 调速小胶囊特写，标题 `Fine-tune speed in 0.1x steps`
4. `store-options` — 设置页 7 行改绑表（英文），标题 `7 shortcuts you can rebind`
5. `store-fresh-speed` — 「不记忆速度」，标题 `Every video starts at 1.0x`（6.0.7 起替换原站点速度记忆截图）

⚠️ 第 5 张是演示页造的**虚构场景**（不是产品真实 UI），措辞与呈现需人工把关。
⚠️ 第 2、3 张是 2x 放大特写，不是像素裁切。

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `storage` | permissions | Stores your shortcut bindings so they persist and sync with your Chrome profile. Nothing else is stored. |
| `<all_urls>` | host_permissions | Video playback is not tied to any particular site, so the extension has to find and control the video element on whatever page you are watching. It reads only video elements and their playback state. It does not read page text, form data, or your browsing history, and nothing is sent anywhere. |

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
| User activity | **Yes** | **Yes** | 快捷键绑定存于 `chrome.storage.sync`，因此会随 Chrome 账号同步到 Google 服务器 | No |
| Website content | No | No | 只读视频元素的播放状态用于控制播放，不读取、不保存页面内容 | No |

> ⚠️ 上面两行 `Yes` 是刻意保守的如实披露。`chrome.storage.sync` 属于 off-device
> transmission，写成「全部存在本地」会与代码不符 —— 那是拒审项。
> 提交时需在 Dashboard 的数据使用表单里与上表保持一致。

### Data Use Certification

- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL** [REQUIRED]

⚠️ **缺失。** 仓库里没有任何隐私政策文件，线上 listing 也没看到该链接。
由于上表披露了 Web history 与 User activity，**需要一份可公开访问的隐私政策**并填写 URL。
（GitHub Pages / 仓库内的 `PRIVACY.md` + Pages / 个人站点均可。）

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

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 6.0.6 | 2026-10-06 | **商店改名**为 `Video Speed Controller — Fullscreen & Keys`（原名有 3 个逐字同名扩展，几乎必然导致装错）。功能与 6.0.5 完全一致，无代码变更 | **In Review**（2026-10-06 经 v2 API 实发，PENDING_REVIEW） |
| 6.0.5 | 2026-10-04 | 新安装时会在你开始看视频后提示一次常用快捷键（之后不再出现）；无法接管的视频会明确告知而不是毫无反应；修复全屏进度条偶尔卡住不动的问题 | **Published**（2026-10-06 经 v2 API fetchStatus 核实，deployPercentage=100，已自动推给全部用户） |
| 6.0.4 | 2026-10-04 | 修复在网页全屏里点击视频画面无法暂停/播放的问题（此前只有键盘快捷键有效）；点击语义现在与站点原生一致，双击行为不变 | Draft |
| 6.0.3 | 2026-10-04 | 修 6 个影响边界缺陷（无 body 文档抛异常、shadow DOM 输入框被吞键、不可见视频被调速、iframe 提示错位、样式不自愈、跨 document 按 f 静默吞键） | **Published**（2026-10-06 经 v2 API fetchStatus 核实，deployPercentage=100） |
| 6.0.2 | 2026-10-04 | CI 升到 Node 24 与 Actions 新主版本；清理分支 | Draft |
| 6.0.1 | 2026-10-04 | 修速度记忆丢失、全屏回退抛错、设置写放大 | Draft |
| 6.0.0 | 2026-10-02 | 大减法：砍 Popup/badge/预设/上限/HUD/悬停胶囊/日韩语；新增全屏控制条与极简调速提示；快捷键扩到 7 个可自定义 | Draft |
| 5.2.1 | 2026-08-30 | 已被 6.0.3 取代 | 已淘汰 |

## Review Notes

### Known Issues / Limitations

- 只控制 `video`，不控制纯 `audio`（会在 listing 里如实写明）
- 跨域 iframe 内的视频无法直接接管
- DRM 受保护内容无法接管
- 极少数据点会退回更简单的布局模式（CSS cover）

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
```

- [ ] 短描述 ≤ 132 字符
- [ ] 详细描述不含实现细节（API / 库 / 框架 / 代码模式）
- [ ] 详细描述不罗列站点名清单（keyword spam）
- [ ] 不出现绝对化表述（「支持所有网站」「无广告」）
- [ ] 截图与 promo tile 尺寸合规
- [ ] `manifest.json` 的 `name` 与本文件的 Extension Name 完全一致
- [ ] 隐私措辞与实际存储位置一致（`storage.sync` 不可写成「全部在本地」）
- [ ] 若要重新上传包：**版本号必须高于线上版本**（CWS 拒绝 version ≤ 已发布版本）

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

## 改名执行清单（6.0.6）

商店名来自 `manifest.json` 的 `name`，**改名必须出新包并重新过审**，不能只改 Dashboard。
当前线上 6.0.5 已 PUBLISHED 且无待审版本，是执行成本最低的窗口。

- [ ] 1. `manifest.json` 的 `name` 与 `default_locale` 下的 `_locales/en/messages.json`
      （`extensionName`）改为 `Video Speed Controller — Fullscreen & Keys`，
      两个文件必须一致（商店只认 manifest，但设置页标题走 i18n）
- [ ] 2. `package.json` 与 `manifest.json` 版本号同步升到 `6.0.6`
- [ ] 3. `pnpm test && pnpm build` 全绿
- [ ] 4. `pnpm build:ext` 出包，人工确认 zip 顶层是 `manifest.json`、内部版本号是 6.0.6
- [ ] 5. `node scripts/store-publish.mjs release/video-speed-controller-v6.0.6.zip --dry-run --api=v2`
      看一遍再实发；**永远显式传 zip 路径**（`findLatestZip` 不校验包内版本）
- [ ] 6. 发布前把本文件的 Name / Short Description / 详细描述 / 截图，
      逐字段粘贴到 Developer Dashboard（API 改不了 metadata）
- [ ] 7. 过审上线后，回本文件把 6.0.6 状态改为 Published

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
