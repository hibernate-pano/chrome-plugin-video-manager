---
name: build-must-run-copy-assets
description: 验证构建产物时必须跑完整的 pnpm build，裸跑 vite build 会清空 dist 导致 E2E 假失败
type: gotcha
---

# 构建必须跑完整 `pnpm build`，不能裸跑 `vite build`

`vite.config.js` 设了 `emptyOutDir: true`，但 `manifest.json` / `content-loader.js` / `icons/` / `_locales/` 是由 `scripts/copy-assets.js` 在 vite 之后单独拷进 `dist/` 的。

**Why**：裸跑 `npx vite build` 会清空 `dist/`，而 `package.json` 的 `build` 是 `tsc && vite build && node scripts/copy-assets.js` 三步。少跑第三步 → `dist/` 里没有 `manifest.json`。

**How to apply**：任何需要"真加载扩展"的验证（`pnpm test:e2e`、`pnpm test:e2e:ext`）之前，必须用 `pnpm build` 或手动补 `node scripts/copy-assets.js`。

**症状**：E2E 报「浏览器起来了但扩展没加载：没有等到 background service worker」——看起来像扩展代码坏了，实际是 dist 里缺 manifest，Chrome 无从加载。这个假失败极具误导性，会让人去翻 `content-loader.js` 或 `fullscreenController.ts`。

**Related** [[version-bump-not-force-tag]]
