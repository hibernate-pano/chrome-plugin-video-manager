# Testing

当前项目维护三类测试入口：

- Vitest 单元测试
- Vitest 契约测试（`scripts/`，跑在单元测试里）
- Playwright 真实扩展 E2E

## 运行方式

```bash
pnpm test          # 单元测试 + 契约测试
pnpm test:e2e      # 全部 Playwright（会先 pnpm build）
pnpm test:e2e:ext  # 只跑真实扩展那套（会先 pnpm build）
```

## 当前覆盖范围

### Vitest

配置文件：[vitest.config.ts](./vitest.config.ts)

当前执行的测试位于：

- `src/content/**/*.test.ts`
- `src/shared/**/*.test.ts`
- `src/options/**/*.test.ts`
- `src/popup/**/*.test.ts`
- `src/background/**/*.test.ts`
- `scripts/**/*.test.ts`

主要覆盖：

- 播放速度计算
- 快捷键匹配与拦截
- 网页全屏进入 / 退出
- 视频选择逻辑（含 Shadow DOM / 同源 iframe 跨 realm）
- 设置归一化与 storage 失败路径
- Popup / 设置页渲染、快捷键提示与无障碍属性
- CI 工作流配置契约（见下）

> 新增 `*.test.ts` 时注意：`vitest.config.ts` 的 `include` 是逐条枚举的，
> 放进一个没被列到的目录（例如 `src/popup/`）不会被收集，测试会静默地永不执行。

### CI 契约测试

[scripts/ci-workflow.test.ts](./scripts/ci-workflow.test.ts)

这个仓库的 CI 曾经无声失效很久：所有 job 都用 `npm ci` + `cache: 'npm'`，
而仓库里只有 `pnpm-lock.yaml`；lint / type-check 两个 job 调用的 npm script 根本不存在。
这些问题全都在 YAML/JSON 配置层面，没有运行时信号能拦住，所以把它们固化成断言：

- 没有任何 job 用 `npm ci` / `npm install`，依赖安装一律 `pnpm install --frozen-lockfile`
- `pnpm/action-setup` 必须排在 `setup-node` 之前，且**版本必须钉死**
- 构建产物上传的是 `dist` 且带 `if-no-files-found: error`
- release 用 `gh` CLI 且 tag 派生自 `github.sha`，不引用 `pull_request`
- job 依赖图、e2e job 是否真的装了浏览器

改 CI 时这个测试会先于 GitHub 告诉你结果。

### Playwright

配置文件：[playwright.config.js](./playwright.config.js)

**两套用例的性质完全不同，不要混淆：**

| 用例 | 是否加载扩展 | 覆盖 |
|------|-------------|------|
| `fullscreen-regression.spec.js` | ❌ 把 `dist/content.js` 当普通 `<script>` 注入页面 | 页面主世界里的全屏 overlay 行为 |
| `real-extension.spec.js` | ✅ `--load-extension` 真加载 `dist/` | 隔离世界、document_start 桥接、真实 `chrome.storage` |

`real-extension.spec.js` 覆盖的正是 jsdom 测不到的那一层：

- 内容脚本在 `document_start` 注入样式
- 数字键预设改速
- 页面脚本用 `stopImmediatePropagation` 抢键也抢不过内容脚本（v5.2.1 的修复点）
- 内容脚本不打断页面自身的输入框打字
- 站点速度记忆跨刷新恢复（真实走一遍 `storage.local` 往返）

> 写这类用例时注意：`waitForSelector('#vsc-runtime-styles')` 会在页面 `<body>`
> 内联脚本执行之前就返回。把辅助函数定义在 `<body>` 里会和这个等待形成竞态，
> 要放在 `<head>` 并惰性取节点。

## 测试资源

- [tests/e2e/test-page.html](./tests/e2e/test-page.html): 注入式用例使用的本地测试页面
- [tests/e2e/real-extension.spec.js](./tests/e2e/real-extension.spec.js): 真加载扩展的用例，页面由路由拦截现造

## 变异验证

新写的测试要确认它**能失败**。真实扩展用例支持用环境变量指向别的构建目录：

```bash
# 把 dist 复制一份，故意改坏，再对着副本跑
cp -r dist /tmp/mutant-ext
# 编辑 /tmp/mutant-ext/...
VSC_EXTENSION_DIR=/tmp/mutant-ext npx playwright test real-extension.spec.js
```

## 说明

- 仓库中旧的 Jest 测试和过期测试说明已移除，避免和当前测试入口冲突
- 如果新增测试，请优先放在 `src/**/*.test.ts` 或现有 `tests/e2e/` 回归套件下，
  并确认它真的被收集到了
