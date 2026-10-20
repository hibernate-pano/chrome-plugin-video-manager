# 隐私政策 / Privacy Policy

**Video Speed Controller — Fullscreen & Keys**
最后更新 / Last updated: 2026-10-20
适用版本 / Applies to: 6.0.9 及之后 / and later

---

## 摘要 / Summary

**中文**

Video Speed Controller 不收集、不上传、不分享任何用户数据。扩展不包含任何
第三方分析、追踪、广告或遥测代码。你的快捷键绑定保存在浏览器自己的存储里，
由 Chrome 负责同步；扩展本身不与任何服务器通信。

**English**

Video Speed Controller does not collect, transmit, or share any user data. The
extension contains no third-party analytics, tracking, advertising, or telemetry
code. Your key bindings are stored by the browser's own storage and synced by
Chrome. The extension itself communicates with no server.

---

## 我们保存什么 / What We Store

扩展只使用浏览器本地存储（`chrome.storage`），没有任何自建后端。

| 存储项 / Item | 位置 / Where | 内容 / Contents | 目的 / Purpose |
|---|---|---|---|
| 快捷键绑定 / Key bindings | `chrome.storage.sync` | 你为每个动作绑定的按键 / The key you bound to each action | 让你在所有设备上用同一套键 / So the same keys work on every device |
| 首次引导已展示标记 / First-run hint flag | `chrome.storage.local` | 一个布尔值 / A single boolean | 避免每次刷新都重新提示你 / So the intro only appears once |
| 标签页倍速（会话内）/ Per-tab playback rate | `chrome.storage.session` | 标签页 ID 与当前倍速 / Tab id and current rate | 让工具栏图标显示当前倍速 / So the toolbar icon can show the current rate |

### 关于 `chrome.storage.sync` / About `chrome.storage.sync`

`chrome.storage.sync` 由 **Google** 提供，它会把数据通过你的 Chrome 账号
同步到 Google 的服务器。这是浏览器的功能，不是我们的服务器 —— 我们从未接触
这些数据，也无法读取它们。

`chrome.storage.sync` 由 **Google** provides and synchronizes data through your
Chrome account to Google's servers. This is a browser feature, not our server —
we never receive or can read this data.

只有**快捷键绑定**会走 sync。倍速、播放位置、观看历史都不会。

Only **key bindings** are synced. Playback rates, positions, and viewing history
are never synced.

> 2026-10-20 更新：6.0.9 起「每个标签页的当前倍速」存于 `chrome.storage.session`
> —— 它**不同步**，只活在当前这次浏览器会话里。它跟 `sync` 是两回事，
> 所以"只有快捷键会同步"这句话依然成立。

### 关于 `chrome.storage.session` / About `chrome.storage.session`

该存储随浏览器会话存在，关闭浏览器即消失，**不会同步到任何设备**。
它只保存"哪个标签页当前是几倍速"这一个数字，用于让工具栏图标显示当前倍速。

This storage lives only for the browser session and is discarded when you close
the browser. It is **never synced**. It holds a single number — which tab is at
which playback rate — so the toolbar icon can display it.

### 已删除的历史数据 / Removed Historical Data

6.0.7 之前，扩展曾按站点域名（hostname）记忆播放速度。这项功能已被删除，
升级到 6.0.7 或更高版本时，扩展会**自动清除**这份历史数据。若你仍在使用
6.0.6 或更早版本，你的机器上可能还存在这份数据 —— 升级即可清除。

Before 6.0.7, the extension remembered a playback rate per site hostname. That
feature was removed. When you update to 6.0.7 or later, the extension
**automatically deletes** that data. If you are still on 6.0.6 or earlier, the
data may still exist on your device — update to remove it.

---

## 我们不做什么 / What We Do Not Do

- ❌ 不收集浏览历史、访问过的网站、页面 URL
- ❌ 不读取或保存页面内容、页面文字、链接
- ❌ 不使用 Cookie 或广告标识符
- ❌ 不包含第三方分析、追踪或广告 SDK
- ❌ 不向任何服务器发送请求（扩展代码中不存在任何网络请求）
- ❌ 不收集姓名、邮箱、电话、位置、财务或健康信息
- ❌ 不出售、不出租、不分享数据给第三方

- ❌ No browsing history, visited sites, or page URLs
- ❌ No reading or storing of page content, text, or links
- ❌ No cookies or advertising identifiers
- ❌ No third-party analytics, tracking, or ad SDKs
- ❌ No network requests to any server (the extension contains none)
- ❌ No names, emails, phone numbers, location, financial, or health data
- ❌ Data is never sold, rented, or shared with third parties

---

## 扩展对页面的访问 / What the Extension Reads on Pages

扩展的权限范围是「所有网址」，这是为了在**任意**网站上的视频上工作
（网课、会议录像、YouTube、B 站……）。权限宽，但读的东西极少：

在页面上，扩展只做这几件事：

1. **找到页面上的 `<video>` 元素**，读取它的 `playbackRate`、`currentTime`、
   `volume`、`muted`、`paused`、`duration` 等**播放状态属性**。
2. **监听键盘按键**，判断是否命中你绑定的键。
3. **检测视频上方的浮层**（字幕等），测量它们的**位置与尺寸**，
   以便在网页全屏时把字幕一起搬过去。

扩展**不读取**页面的文字内容，不读取表单，不读取你输入的任何东西。
被测量的字幕文本只用于计算它的**几何位置**（宽/高/行数），不会被保存或发送。

The extension runs on all sites so it can work on **any** video — online
courses, recorded meetings, YouTube, Bilibili, and so on. The permission is
broad; what it reads is not.

On a page, the extension only:

1. **Finds `<video>` elements** and reads their playback-state properties
   (`playbackRate`, `currentTime`, `volume`, `muted`, `paused`, `duration`).
2. **Listens for keyboard presses** to check whether they match your bindings.
3. **Detects overlays above the video** (subtitles, etc.) and measures their
   **position and size** so they can follow the video into page fullscreen.

It does **not** read page text, forms, or anything you type. Measured subtitle
content is used only to compute its **geometry** (width / height / line count)
and is never stored or transmitted.

---

## 权限说明 / Permissions Explained

| 权限 / Permission | 为什么需要 / Why it's needed |
|---|---|
| `storage` | 保存你的快捷键绑定 / To store your key bindings |
| `host_permissions: <all_urls>` | 在任意网站的视频上工作 / To work on videos on any site |
| `content_scripts` on `<all_urls>` | 同上 / Same as above |

扩展**不使用**摄像头、麦克风、位置、通知、剪贴板、下载或通知权限。

The extension does **not** use camera, microphone, location, notifications,
clipboard, downloads, or browsing permission.

---

## 儿童隐私 / Children's Privacy

扩展不收集任何数据，因此不涉及儿童个人信息。

The extension collects no data and therefore handles no children's personal
information.

---

## 变更 / Changes to This Policy

政策变更会随扩展的新版本一起发布，并在本文件中更新「最后更新」日期。
重大变更会在扩展的更新说明中明确告知。

Changes to this policy ship with new versions of the extension and update the
"Last updated" date above. Material changes are called out in the extension's
release notes.

---

## 联系 / Contact

问题、疑虑或请求，请通过仓库的 Issues 页面提出：
https://github.com/hibernate-pano/chrome-plugin-video-manager/issues

For questions, concerns, or requests, please open an issue:
https://github.com/hibernate-pano/chrome-plugin-video-manager/issues

---

## 第三方服务 / Third-Party Services

扩展**不**使用任何第三方分析、广告、追踪或崩溃上报服务。唯一的外部服务是
**Chrome 同步存储**，由 Google 提供，其条款适用
https://policies.google.com/privacy

The extension uses **no** third-party analytics, advertising, tracking, or crash
reporting services. The only external service is **Chrome sync storage**,
provided by Google, subject to https://policies.google.com/privacy
