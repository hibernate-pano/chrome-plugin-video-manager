---
name: node-fetch-cannot-use-socks-proxy
description: 本机代理环境变量是 socks5://，Node 的 fetch/undici 不支持会导致工具静默崩；商店脚本必须走 curl + HTTP 代理
type: gotcha
---

# Node 的 fetch 用不了 socks5 代理，而本机导出的正是 socks5

本机代理（`127.0.0.1:7897`）**同时支持 HTTP 与 SOCKS5**，但 shell 里导出的是 socks5 形式：

```
http_proxy=socks5://127.0.0.1:7897
https_proxy=socks5://127.0.0.1:7897
all_proxy=socks5://127.0.0.1:7897
```

**Why**：Node 内置的 `fetch`（undici）**不支持 SOCKS**，拿到 `socks5://` 会直接抛
`UND_ERR_INVALID_ARG`。而且 Node 的 fetch **默认不读代理环境变量**，所以即使把
`socks5://` 换成 `http://` 也不生效，除非用 Node 24 的 `NODE_USE_ENV_PROXY=1`。

这个坑一次弄坏了三样东西，症状各不相同，很容易误判：
- `cws-mcp`（Chrome Web Store MCP）**启动即崩**，MCP 客户端只报
  `Connection closed (... UND_ERR_INVALID_ARG)`，看不出跟代理有关
- `ctx_fetch_and_index` 报 `UnsupportedProxyProtocol`（Bun 同样拒绝 socks5）
- 直接 `fetch` Google API 报 `ConnectTimeoutError`（因为根本没走代理）

**How to apply**：
- 脚本里发外部请求**用 `curl -x http://127.0.0.1:7897`**，不要用 Node fetch。
  `scripts/store-publish.mjs` 的 `getSystemProxy()`（读 `scutil --proxy` 拿 HTTP 代理）就是这个
  思路，是可用且经过验证的，别改成 fetch。
- 必须用 Node fetch 时：跑 Node 24 并设 `NODE_USE_ENV_PROXY=1`，同时
  **把 `all_proxy`/`ALL_PROXY`/小写 `http_proxy`/`https_proxy` 全部 unset**，
  只留 `HTTPS_PROXY=http://...`。只改大写不够 —— 残留的 `all_proxy` 仍会让 undici 抛错。
- 排查「连接被关闭 / 超时」这类问题时，**先怀疑代理**，再看凭据与网络。

**Related** [[cws-api-v1-deadline]] [[build-must-run-copy-assets]]
