---
name: cws-api-v1-deadline
description: Chrome Web Store API v1.1 于 2026-10-15 停支，而 v2 没有 listing metadata 接口；字段上限与拒审红线一并记录
type: gotcha
---

# 商店 listing 改不了 API，只能去 Dashboard；且 v1.1 于 2026-10-15 停支

**Why**：两件事叠在一起，都会让人以为「可以用 API 改文案」，实际上不行。

**① listing metadata（名称/描述/截图）从来就不能用 API 改。**
官方 v1.1 的 Item schema 只有**包字段**：`kind` / `id` / `publicKey` / `uploadState`，
根本没有 name / description / 截图字段。同机另一个项目（chrome-plugin-one-tab）实测：
对 item 做 PUT 会被**静默忽略**（返回 304）。所以：
- cws-mcp 的 `update-metadata` 工具是坏的
- `update-metadata-ui` 需要 `~/.cws-mcp-profile` 登录态（本机尚未建）
- **现实路径：把 `CHROMEWEBSTORE.md` 逐字段粘到 Developer Dashboard**，或打通 UI 自动化

**② v1.1 官方只支持到 2026-10-15**（包上传/发布/状态会失效）：

> ⚠️ The Chrome Web Store API (V1) is deprecated and will only be supported until 15th October 2026.
> — https://developer.chrome.com/docs/webstore/api/v1

而 **v2 没有 listing metadata 接口**。v2 只有：

| 用途 | v2 端点 |
|---|---|
| 上传 | `POST https://chromewebstore.googleapis.com/upload/v2/publishers/{publisherId}/items/{itemId}:upload` |
| 发布 | `POST .../v2/publishers/{publisherId}/items/{itemId}:publish`（body: `publishType` / `skipReview` / `deployInfos[].deployPercentage`） |
| 状态 | `GET .../v2/publishers/{publisherId}/items/{itemId}:fetchStatus` |
| 取消待审 | `POST .../v2/publishers/{publisherId}/items/{itemId}:cancelSubmission` |
| 部署比例 | `POST .../v2/publishers/{publisherId}/items/{itemId}:setPublishedDeployPercentage` |

**注意**：one-tab 在 2026-09-26 实测「v2 端点对本凭证一律 404」，而 v1.1 确定可用。
`publishers/me` 在语法上被接受（无效 token 实测返回 401 而非 400/404），但能否解析到正确
publisher 未经有效 token 验证。所以脚本要**保留 v1.1 路径**，把 v2 做成可选。

**How to apply**：
- 改文案/截图：直接去 Dashboard 粘贴，不要写 API 脚本。
- 改包（上传/发布）：用 `scripts/store-publish.mjs`，优先 v1.1；2026-10-15 后再评估 v2。
- 字段上限：名称 75 字符、**简短说明 132 字符**、详细说明约 16,000。
  截图必须 **1280×800 或 640×400**（1–5 张），small promo tile **440×280**（缺失会被降权排序）。
- **文案必须与实际功能一致**：线上曾长期写着 v6 已删除的 `presets`，属「元数据不准确」，是拒审项。
- 不得罗列站点/品牌清单（keyword spam）、不得提竞品、不得写「支持所有网站」这类绝对化表述。
- **隐私措辞要与实际存储位置一致**：快捷键走 `chrome.storage.sync`（随 Chrome 账号同步，
  **属于 off-device transmission**，不能写成「全部在本地」）；站点速度走 `chrome.storage.local`。
- **重新上传包时版本号必须高于线上版本**（CWS 拒绝 version ≤ 已发布版本）。
- 商店允许多个扩展**逐字同名**（实测有 3 个叫 "Video Speed Controller"，其中 iglupo 约 300 万用户），
  政策没有禁止；改名若涉及 `manifest.json` 的 name，需要出新包并重新过审
  （扩展 ID 由公钥派生，与名称无关，所以改名不影响已安装用户与自动更新）。

**Related** [[node-fetch-cannot-use-socks-proxy]] [[version-bump-not-force-tag]]
