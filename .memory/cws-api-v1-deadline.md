---
name: cws-api-v1-deadline
description: Chrome Web Store API v1.1 于 2026-10-15 停支，而 v2 没有 listing metadata 接口；字段上限与拒审红线一并记录
type: gotcha
---

# 商店 listing 只能用 API 改到 2026-10-15，之后只剩 Dashboard

**Why**：官方文档明确 v1.1 只支持到 **2026-10-15**：

> ⚠️ The Chrome Web Store API (V1) is deprecated and will only be supported until 15th October 2026.
> — https://developer.chrome.com/docs/webstore/api/v1

而 **v2 没有 listing metadata 接口**。v2 只有：

| 用途 | v2 端点 |
|---|---|
| 上传 | `POST https://chromewebstore.googleapis.com/upload/v2/publishers/{publisherId}/items/{itemId}:upload` |
| 发布 | `POST .../v2/publishers/{publisherId}/items/{itemId}:publish`（body: `publishType` / `skipReview` / `deployPercentage`） |
| 状态 | `GET .../v2/publishers/{publisherId}/items/{itemId}:fetchStatus` |
| 取消待审 | `POST .../v2/publishers/{publisherId}/items/{itemId}:cancelSubmission` |
| 部署比例 | `POST .../v2/publishers/{publisherId}/items/{itemId}:setPublishedDeployPercentage` |

**所以 2026-10-15 之后，改名、改描述、换截图只能走 Developer Dashboard**（或 Playwright 自动化 UI）。
`publishers/me` 这种写法语法上被接受（用无效 token 实测返回 401 而非 400/404）。

**How to apply**：
- 改 listing 文案前先确认还有没有 API 窗口；过了截止日期就别再写 API 脚本。
- 字段上限（改文案前必看）：名称 75 字符、**简短说明 132 字符**、详细说明约 16,000
  （dashboard 实测，官方未给数字）。截图必须 **1280×800 或 640×400**（1–5 张），
  small promo tile 必须 **440×280**（缺失会被降权排序）。
- **文案必须与实际功能一致**：线上曾长期写着 v6 已删除的 `presets`，属「元数据不准确」，是拒审项。
- 不得罗列站点/品牌清单（keyword spam）、不得提竞品、不得写「支持所有网站」这类绝对化表述
  （DRM 与跨域 iframe 明确不支持）。
- 隐私措辞要与实际存储位置一致：快捷键走 `chrome.storage.sync`（随 Chrome 账号同步），
  站点速度走 `chrome.storage.local`。不能写成「全部存在本地」。
- `<all_urls>` 必须在 Privacy 标签逐条写理由。
- 商店允许多个扩展**逐字同名**（实测有 3 个叫 "Video Speed Controller"，其中 iglupo 约 300 万用户），
  政策没有禁止；但改名若涉及 `manifest.json` 的 name，就需要出新包并重新过审
  （扩展 ID 由公钥派生，与名称无关，所以改名不影响已安装用户与自动更新）。

**Related** [[node-fetch-cannot-use-socks-proxy]] [[version-bump-not-force-tag]]
