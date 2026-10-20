import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  // basic.spec.js：早已废弃的旧用例。
  // _*.spec.js / tmp-*.spec.js：**一次性排查脚本**（探针）—— 它们是一次性
  //   用来回答某个具体问题的，不是回归测试。留着它们会让 CI 每次都跑一遍
  //   无人维护的脚本，失败时还会把真正的回归信号淹掉。
  //   探针跑完就删；要留下结论，就写成 assert 形式并改成正常命名的 spec。
  //
  //   两种前缀都收：变异验证经常要临时改一份构建产物对照，跑完那份脚本
  //   就没用了，但人很容易忘记删 —— 而 scripts/ci-workflow.test.ts 会把
  //   「没被 test:e2e:ext 引用」判成失败，于是这个临时文件会把 CI 卡住。
  //   把它列进 testIgnore，守卫就与"这是不是临时脚本"无关了。
  testIgnore: ['basic.spec.js', '**/_*.spec.js', '**/tmp-*.spec.js'],
  fullyParallel: false,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
  },
  webServer: {
    command: 'python3 -m http.server 4173',
    port: 4173,
    reuseExistingServer: true,
    timeout: 15_000,
  },
});
