---
name: ci-runtime-version-drift
description: CI 的 Node 与 Action 主版本会静默过期，已用契约测试守卫；升级时必须逐个核对 action 输入
type: gotcha
---

# CI 的 Node 版本与 Action 主版本会静默漂移

`.github/workflows/ci.yml` 钉着 `node-version` 与四个 action 的主版本。这类配置层的东西**没有任何运行时信号**能提示你它过期了——CI 照样全绿，只是每次跑都刷 deprecation 警告。

**Why**：2026-10 那次发现 CI 钉的 `node-version: '20'` 早已于 **2026-04-30 EOL**（官方 schedule 见 `nodejs/Release/schedule.json`）。同时 `actions/checkout@v4` / `setup-node@v4` / `upload-artifact@v4` / `pnpm/action-setup@v4` 都跑在 node20 运行时上，被 GitHub 强制升到 node24 并告警。版本漂移不会让构建失败，只会让你拿不到安全更新，直到某天 action 被下架才炸。

**How to apply**：
- 判断 Node 版本时**不要靠印象**，直接读官方 schedule：`curl -s https://raw.githubusercontent.com/nodejs/Release/main/schedule.json`。当前（2026-10）24 是 Active LTS、22 是 Maintenance、20 已 EOL。
- 升级 action 主版本时**逐个核对输入参数**，不要盲升。读它的 `action.yml` 确认 `using:` 与每个我们实际用到的 input 仍然存在：
  `gh api "repos/<owner>/<repo>/contents/action.yml?ref=<tag>" --jq '.content' | base64 -d`
- 本地也要用目标 Node 版本实跑一遍 tsc / build / 单测 / E2E 再提交（`export PATH="$HOME/.nvm/versions/node/v24.2.0/bin:$PATH"`）。
- 新增/修改守卫断言后，**必须做一次负向验证**：故意改回旧值，确认断言真的会红。不会失败的守卫等于没有守卫。

**守卫位置**：`scripts/ci-workflow.test.ts` 的「action 版本与 Node 运行时」一节，断言 Node 不得回退到 EOL 版本、四个 action 主版本不得低于 node24 那一代。主版本再涨时改那里的 `minimums` 数组。

**注意**：`ubuntu-latest` 这类托管 runner 标签**不要**写死成契约（2026-10-19 起迁 Ubuntu 26），托管 runner 会自动跟进，写死只会在迁移时造成假失败。

**Related** [[build-must-run-copy-assets]] [[version-bump-not-force-tag]]
