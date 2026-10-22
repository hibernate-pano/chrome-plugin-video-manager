/**
 * 「这台机器现在有多忙」—— e2e 的并发度与失败诊断都建立在它上面。
 *
 * ⚠️ 为什么值得单独一个文件：
 *
 * 这套 e2e 曾经把 worker 数**写死**成 2。那个 2 是在「一台安静的 12 核机器」
 * 上试出来的：6 个 worker 会抢光 CPU（用例里全是与时序有关的断言），
 * 2 个刚好「够快又不打架」。
 *
 * 但「够快又不打架」的前提是**机器安静**。而这台机器同时跑着好几个项目
 * （实测 2026-10-22：load average 一度到 96，机器上另有 600+ 个 node 进程）。
 * 同一个「2 个 worker」在那种机器上就是**两个 Chromium 抢一份已经不够用的 CPU** ——
 * 于是失败以「Test timeout of 30000ms exceeded」的形式出现，
 * **位置每次都不一样**（stale-title / toolbar-title / video-owner / subtitle-visibility 轮着来）。
 *
 * 那种失败长得和「产品坏了」**一模一样**，于是每一次都要重新分诊一次。
 * 与其每次重新分诊，不如让这套 harness **自己知道**：
 *
 * 1. worker 数由**当前负载**决定（忙就降到 1，别硬撑）；
 * 2. 失败时把负载快照一起打出来（下次分诊不用从头猜）。
 *
 * ⚠️ 这里的负载是 **load average**（可运行 + 不可中断进程的个数），
 * 不是「CPU 使用率」：使用率是**瞬时**的（一秒 0%、下一秒 100%），
 * 而我们要回答的是「**这一轮测试期间**机器有没有富余」——
 * 后者只有均值能回答。
 */
import { cpus, loadavg } from 'node:os';

/** 一次宿主负载快照。 */
export const hostLoad = () => {
  const cpuCount = Math.max(1, cpus()?.length ?? 1);
  const [one = 0, five = 0, fifteen = 0] = loadavg();
  return { cpuCount, one, five, fifteen };
};

/**
 * 饱和度 = 负载 / 核数。1.0 表示「刚好占满所有核」。
 *
 * ⚠️ 取 `one` 与 `five` 里**更大**的那个：
 * 只看 1 分钟均值会漏掉「刚刚安静下来、但前 5 分钟一直在忙」的情况
 * （而我们要跑的恰恰是接下来这十几分钟）。
 */
export const saturation = (snapshot = hostLoad()) =>
  Math.max(snapshot.one, snapshot.five) / snapshot.cpuCount;

/**
 * 这套 e2e 该开几个 worker。
 *
 * - 机器还宽裕（饱和度 ≤ 0.75）→ 2 个（沿用那个试出来的值）
 * - 机器已经忙起来了（饱和度 > 0.75）→ **1 个**
 *
 * ⚠️ 阈值取 0.75 而不是 1.0：Chromium 的渲染进程不止一个，
 * 一个 worker 实际要吃掉一个多核的份额；而 load average 里还混着
 * 别的项目的进程（它们不会因为我们少开一个 worker 就消失）。
 *
 * ⚠️ `VSC_E2E_WORKERS` 可以显式覆盖 —— CI 里就钉死成 2，
 * 让 CI 的并发度**可复现**（不随跑测那一刻的负载漂移）。
 */
export const suggestWorkers = (snapshot = hostLoad()) => {
  const override = process.env.VSC_E2E_WORKERS;
  if (override !== undefined && override.trim() !== '') {
    // ⚠️ 用 Number() 而不是 parseInt()：parseInt('2.5') 会**截断**成 2，
    // 于是「写错了一个字符」的值被当成了合法的覆盖值 —— 而它其实是错的。
    const parsed = Number(override.trim());
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  if (saturation(snapshot) > 0.75) return 1;
  return 2;
};

/** 把快照写成一行人话。 */
export const formatHostLoad = (snapshot = hostLoad()) => {
  const ratio = saturation(snapshot);
  return (
    `${snapshot.cpuCount} 核 · 1 分钟负载 ${snapshot.one.toFixed(2)}` +
    ` · 5 分钟 ${snapshot.five.toFixed(2)} · 15 分钟 ${snapshot.fifteen.toFixed(2)}` +
    ` · 饱和度 ${ratio.toFixed(2)}`
  );
};
