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
  //
  //   *probe*.spec.js / zz*.spec.js：同一类东西的另一种前缀（并行排查时随手
  //   起的名字：zzprobe1 / zprobe-16 / a11yprobe35 / zz38 …）。带 "probe"
  //   或以 "zz" 开头的文件名一律是一次性排查脚本，跑完即删；永久用例用的是
  //   描述性文件名（fullscreen-controls / style-isolation / …）。
  testIgnore: [
    'basic.spec.js',
    '**/_*.spec.js',
    '**/tmp-*.spec.js',
    '**/*probe*.spec.js',
    '**/zz*.spec.js',
  ],
  fullyParallel: false,
  // 每个 worker 都会拉起一个**完整的 Chromium**。默认的「CPU 数的一半」
  // （12 核的机器上是 6 个）会把 CPU 抢光 —— 而这套用例里有大量与时序有关
  // 的断言（等动画结束、等跨进程的一问一答回来），机器一忙就会随机翻车。
  //
  // 实测（本地 12 核、机器本身还有别的负载时）：6 个 worker 时每次全量跑
  // 都有 1 条用例随机失败，失败的**位置每次都不一样**（帧归属那条、
  // 控制条宽度那条、接管提示那条轮着来）—— 那不是回归，是抢不到 CPU。
  //
  // 2 个 worker 是「够快又不打架」的值：全量跑约 3 分钟，而 CI（4 核）
  // 上也是 2 个。
  workers: 2,
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
