# Testing

当前项目只维护两类测试入口：

- Vitest 单元测试
- Playwright 回归测试

## 运行方式

```bash
pnpm test
pnpm test:e2e
```

`pnpm test:e2e` 会先执行一次 `pnpm build`，再运行 Playwright。

## 当前覆盖范围

### Vitest

配置文件：[vitest.config.ts](./vitest.config.ts)

当前执行的测试位于：

- `src/content/**/*.test.ts`
- `src/shared/**/*.test.ts`

主要覆盖：

- 播放速度计算
- 快捷键匹配与拦截
- 网页全屏进入 / 退出
- 视频选择逻辑
- 设置归一化与 storage 失败路径

### Playwright

配置文件：[playwright.config.js](./playwright.config.js)

当前保留的 E2E 回归用例：

- [tests/e2e/fullscreen-regression.spec.js](./tests/e2e/fullscreen-regression.spec.js)

它验证：

- 进入网页全屏后 overlay 正常出现
- 退出网页全屏后仍能保留视频播放进度

## 测试资源

- [tests/e2e/test-page.html](./tests/e2e/test-page.html): Playwright 使用的本地测试页面

## 说明

- 仓库中旧的 Jest 测试和过期测试说明已移除，避免和当前测试入口冲突
- 如果新增测试，请优先放在 `src/**/*.test.ts` 或现有 `tests/e2e/` 回归套件下
