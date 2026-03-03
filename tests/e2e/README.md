# E2E 测试指南

## 概述

本目录包含使用 Playwright 编写的端到端（E2E）测试，用于测试 Chrome 扩展在真实网站上的功能。

## 目录结构

```
tests/e2e/
├── helpers/              # 测试辅助函数
│   ├── extension.ts     # 扩展相关辅助函数
│   ├── fixtures.ts      # Playwright fixtures
│   └── index.ts         # 导出文件
├── example.spec.ts      # 示例测试
└── README.md            # 本文件
```

## 前置条件

### 1. 安装依赖

```bash
pnpm install
```

### 2. 安装 Playwright 浏览器

```bash
pnpm exec playwright install chromium
```

### 3. 构建扩展

E2E 测试需要构建后的扩展文件：

```bash
pnpm build
```

## 运行测试

### 运行所有 E2E 测试

```bash
pnpm test:e2e
```

### 运行特定测试文件

```bash
pnpm exec playwright test tests/e2e/example.spec.ts
```

### 以 UI 模式运行

```bash
pnpm exec playwright test --ui
```

### 以调试模式运行

```bash
pnpm exec playwright test --debug
```

### 查看测试报告

```bash
pnpm exec playwright show-report
```

## 编写测试

### 基本测试结构

```typescript
import { test, expect } from './helpers/fixtures';
import { waitForVideo, getVideoPlaybackRate } from './helpers/extension';

test.describe('功能描述', () => {
  test('测试用例描述', async ({ context, extensionId }) => {
    // 创建新页面
    const page = await context.newPage();

    // 访问测试网站
    await page.goto('https://example.com');

    // 等待视频加载
    await waitForVideo(page);

    // 执行操作和断言
    const rate = await getVideoPlaybackRate(page);
    expect(rate).toBe(1.0);

    // 清理
    await page.close();
  });
});
```

### 可用的辅助函数

#### 扩展管理

- `launchBrowserWithExtension()` - 启动带有扩展的浏览器
- `waitForExtensionInjection(page)` - 等待扩展注入
- `getOptionsPage(context, extensionId)` - 获取设置页面

#### 快捷键操作

- `pressShortcut(page, key)` - 模拟按键

#### 视频控制

- `waitForVideo(page)` - 等待视频加载
- `getVideoPlaybackRate(page)` - 获取播放速率
- `getVideoVolume(page)` - 获取音量

#### HUD 操作

- `isHUDVisible(page)` - 检查 HUD 是否可见
- `getHUDText(page)` - 获取 HUD 文本
- `waitForHUD(page)` - 等待 HUD 显示
- `waitForHUDHidden(page)` - 等待 HUD 隐藏

#### Lightbox 操作

- `isLightboxActive(page)` - 检查 Lightbox 是否激活

## 测试网站

推荐使用以下网站进行测试：

### YouTube
- URL: `https://www.youtube.com/watch?v=dQw4w9WgXcQ`
- 特点：标准 HTML5 视频播放器

### Bilibili
- URL: `https://www.bilibili.com/video/BV1xx411c7mD`
- 特点：自定义视频播放器

### 本地测试页面
可以创建本地 HTML 文件进行测试：

```html
<!DOCTYPE html>
<html>
<head>
  <title>测试页面</title>
</head>
<body>
  <video controls width="640" height="360">
    <source src="test-video.mp4" type="video/mp4">
  </video>
</body>
</html>
```

## 调试技巧

### 1. 使用 page.pause()

在测试中添加断点：

```typescript
await page.pause();
```

### 2. 截图

```typescript
await page.screenshot({ path: 'screenshot.png' });
```

### 3. 查看控制台日志

```typescript
page.on('console', msg => console.log('PAGE LOG:', msg.text()));
```

### 4. 慢速执行

```typescript
await page.goto('https://example.com', { waitUntil: 'networkidle' });
```

## 常见问题

### Q: 测试失败，提示找不到扩展

A: 确保已经构建扩展：`pnpm build`

### Q: 测试在 headless 模式下失败

A: Chrome 扩展在 headless 模式下可能有问题，配置中已设置 `headless: false`

### Q: 如何测试特定网站？

A: 在测试中使用 `page.goto()` 访问目标网站，然后使用辅助函数进行操作

### Q: 如何跳过某些测试？

A: 使用 `test.skip()` 或 `test.only()` 来控制测试执行

## 最佳实践

1. **独立性**：每个测试应该独立运行，不依赖其他测试
2. **清理**：测试结束后关闭页面和清理资源
3. **等待**：使用适当的等待策略，避免竞态条件
4. **断言**：使用清晰的断言消息
5. **重试**：配置合理的重试次数（已在 playwright.config.ts 中配置）

## 参考资料

- [Playwright 官方文档](https://playwright.dev/)
- [Chrome 扩展测试指南](https://playwright.dev/docs/chrome-extensions)
- [测试最佳实践](https://playwright.dev/docs/best-practices)
