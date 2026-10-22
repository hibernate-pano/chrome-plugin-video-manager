import { defineConfig } from '@playwright/test';
import { suggestWorkers } from './scripts/host-load.mjs';

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
  //
  // ⚠️ 但那个 2 是在「一台**安静**的机器」上试出来的。
  // 这台机器同时跑着好几个项目（实测 2026-10-22：load average 一度到 96），
  // 同一个 2 就变成「两个 Chromium 抢一份已经不够用的 CPU」——
  // 失败以「Test timeout of 30000ms exceeded」出现，**位置每次都不一样**，
  // 长得和「产品坏了」一模一样。
  //
  // 所以并发度由**当前负载**决定：忙就降到 1（scripts/host-load.mjs）。
  // `VSC_E2E_WORKERS` 可以显式覆盖（CI 里钉死成 2，让 CI 的并发度可复现）。
  workers: suggestWorkers(),
  // 单条用例的**兜底**上限。
  //
  // ⚠️ 为什么是 60 秒而不是 30：每条用例里真正的断言都自带轮询超时
  // （5~20 秒），这个数字只负责「用例整体卡死了」时的兜底。
  // 机器忙的时候，**准备工作**（起浏览器、等 service worker、加载扩展）
  // 本身就会花掉二三十秒 —— 兜底先于断言触发的话，报出来的是
  // 「Test timeout of 30000ms exceeded」这种**没有信息量**的话，
  // 而轮询超时至少会告诉你「到底在等什么没等到」。
  //
  // 换句话说：把兜底放宽，是为了让**真正的断言**先开口说话。
  // 契约（外层兜底 ≥ 内层轮询超时的 2 倍）由 scripts/ci-workflow.test.ts 守着。
  timeout: 60_000,
  // ⚠️ 第二个 reporter 专门负责**失败时的宿主负载快照** ——
  // 「产品坏了」与「机器被压垮了」长得一模一样，而这台机器经常被压垮。
  // 详见 scripts/host-load-reporter.js。
  reporter: [['line'], ['./scripts/host-load-reporter.js']],
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
