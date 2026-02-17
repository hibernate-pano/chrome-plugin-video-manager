import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E 测试配置
 * 用于测试 Chrome 扩展在真实网站上的功能
 *
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  // 测试目录
  testDir: './tests/e2e',

  // 测试文件匹配模式
  testMatch: '**/*.spec.ts',

  // 最大失败次数（0 表示不限制）
  maxFailures: 0,

  // 并行执行的 worker 数量
  workers: 1, // Chrome 扩展测试通常需要串行执行

  // 失败时重试次数
  retries: 2,

  // 测试超时时间（毫秒）
  timeout: 60000, // 60 秒

  // 全局超时时间（毫秒）
  globalTimeout: 600000, // 10 分钟

  // 期望超时时间（毫秒）
  expect: {
    timeout: 10000, // 10 秒
  },

  // 是否完全并行运行测试
  fullyParallel: false,

  // 在 CI 环境中如果没有提交则失败
  forbidOnly: !!process.env.CI,

  // 使用配置
  use: {
    // 基础 URL（如果需要）
    // baseURL: 'http://localhost:5173',

    // 浏览器上下文选项
    viewport: { width: 1280, height: 720 },

    // 是否忽略 HTTPS 错误
    ignoreHTTPSErrors: true,

    // 截图设置
    screenshot: 'only-on-failure',

    // 视频录制设置
    video: 'retain-on-failure',

    // 追踪设置
    trace: 'retain-on-failure',

    // 操作超时时间
    actionTimeout: 10000,

    // 导航超时时间
    navigationTimeout: 30000,
  },

  // 项目配置
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Chrome 扩展特定配置
        launchOptions: {
          args: [
            // 加载扩展（需要在测试中动态设置）
            // `--disable-extensions-except=${extensionPath}`,
            // `--load-extension=${extensionPath}`,

            // 其他有用的标志
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled',
          ],
        },
      },
    },
  ],

  // 报告器配置
  reporter: [
    ['list'], // 控制台输出
    ['html', { outputFolder: 'playwright-report', open: 'never' }], // HTML 报告
    ['json', { outputFile: 'playwright-report/results.json' }], // JSON 报告
  ],

  // 输出目录
  outputDir: 'test-results',

  // Web 服务器配置（如果需要启动本地服务器）
  // webServer: {
  //   command: 'pnpm dev',
  //   port: 5173,
  //   timeout: 120000,
  //   reuseExistingServer: !process.env.CI,
  // },
});
