import { chromium } from '@playwright/test';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChromium } from '../../../scripts/find-chromium.mjs';

/**
 * 启动「带扩展的真实 Chromium」的**唯一**入口。
 *
 * 为什么要有这个文件：这段样板曾经在 15 个 spec 里各抄了一份（≈700 行），
 * 抄着抄着就开始**漂移**：
 *
 *   - 有的把「等 background service worker」放在重试循环**外面**
 *     （浏览器起来了但扩展没加载 → 直接失败，不再试下一个候选），
 *     有的放在**里面**（会重试）。同一份代码，两种行为。
 *   - `--no-sandbox` 是 **Linux CI** 的需要，却被抄进了 macOS 的本机运行 ——
 *     开发机白白少了一层浏览器沙箱隔离。
 *   - `findChromium()` 写死了 macOS 的缓存路径（`~/Library/Caches/...`），
 *     在 Linux 上永远返回 `undefined`，那个「按可执行文件路径兜底」的候选
 *     实际上**从来没生效过**。
 *
 * 重复本身不贵，**漂移**才贵 —— 它让「同一个测试环境」在不同 spec 里
 * 有不同表现，于是失败时分不清是产品坏了还是环境不一样。
 * 现在统一到这一个文件：改一处，15 个 spec 同时生效。
 */

/**
 * 扩展构建产物目录。默认按**本文件的位置**推导，不依赖进程的工作目录。
 *
 * ⚠️ 本文件住在 `tests/e2e/helpers/`，仓库根在**三层**之上 ——
 * 少退一级会指向 `tests/dist`，扩展加载不上，症状是「浏览器起来了但
 * 没有 service worker」，很难往路径上想。所以这里直接验一次。
 */
export const DIST = process.env.VSC_EXTENSION_DIR
  ? resolve(process.env.VSC_EXTENSION_DIR)
  : resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'dist');

/**
 * 「扩展构建产物在不在」——**用的时候再问**，不是模块一加载就问。
 *
 * ⚠️ 为什么不能放在模块顶层（这正是 2026-10-22 起 CI 连续 8 次全红的原因）：
 *
 * 本文件被 **所有** e2e spec import。而 `scripts/ci-workflow.test.ts` 有一条
 * 守卫要跑 `playwright test --list`（用来核实「登记进 test:e2e:ext 的 spec」
 * 与「Playwright 真会跑的 spec」是不是同一份）——
 * 那条守卫活在 **Unit Tests** job 里，而那个 job **不跑 build**。
 *
 * 于是：模块一加载就检查 `dist/manifest.json` → CI 上 `dist/` 不存在 →
 * 抛错 → `--list` 收集用例时报错 → 守卫炸掉 → **整个 Unit Tests job 红**。
 *
 * ⚠️ 症状极具误导性：报错信息说的是「扩展构建产物不在 …——先跑 pnpm build」，
 * 而 Unit Tests job 里**根本没有 build 这一步**（build 是另一个 job）——
 * 于是读起来像「CI 配置漏了一步」，实际上是这条检查放错了位置。
 *
 * ⚠️ 而 `--list` **根本不需要**扩展产物：它只要知道有哪些 spec 文件。
 * 把「需要产物」的条件绑在「加载这个模块」上，就是绑错了地方。
 *
 * 所以这里改成**惰性检查**：真正要启动浏览器时才验，
 * 而那时缺产物是**真的**该报错（症状也准确）。
 */
const assertDistReady = () => {
  if (!existsSync(join(DIST, 'manifest.json'))) {
    throw new Error(
      `扩展构建产物不在 ${DIST}（或里面没有 manifest.json）——先跑 pnpm build。`,
    );
  }
};

/**
 * 「这个仓库该用哪个 Chromium」。
 *
 * ⚠️ 实现住在 `scripts/find-chromium.mjs` —— 因为**商店素材的生成脚本**
 * 也需要同一份答案（它以前自己 `chromium.launch()`，于是去全局缓存里找，
 * 在本项目的私有缓存里明明有浏览器却报「Executable doesn't exist」）。
 * 抄一份的后果是两边慢慢漂移，而两边的失败信息长得**一模一样**。
 */
export { findChromium };

/**
 * Chromium 的启动参数。
 *
 * ⚠️ 沙箱只在 **Linux** 上关：CI 容器里以 root 跑 Chrome 必须加
 * `--no-sandbox`（否则沙箱起不来），`/dev/shm` 也要换成 `/tmp`。
 * 但 macOS 上 Chrome 的沙箱本来就能用 —— 关掉它只会让开发机白白少一层隔离，
 * 所以这两个参数**只在 Linux 上加**。
 */
export const launchArgs = (extra = []) => [
  `--disable-extensions-except=${DIST}`,
  `--load-extension=${DIST}`,
  '--autoplay-policy=no-user-gesture-required',
  ...(process.platform === 'linux' ? ['--no-sandbox', '--disable-dev-shm-usage'] : []),
  ...extra,
];

/**
 * 启动一个装好扩展的持久化上下文。
 *
 * 返回 `{ context, extensionId, close }`：
 * - `extensionId` 从 service worker 的 URL 里取（`chrome-extension://<id>/background.js`）；
 * - `close()` 关掉浏览器并删掉临时 profile。
 *
 * @param {{ extraArgs?: string[], profilePrefix?: string }} options
 *   `extraArgs` 用于传额外的浏览器启动参数。
 *
 *   ⚠️ **别指望用它来固定文案语言**：`chrome.i18n` 挑 `_locales` 下的哪个
 *   目录跟的是**系统 locale** —— 不是 `--lang`，也不是浏览器界面语言
 *   （实测见 `src/shared/i18n.ts` 的 currentLocale() 注释与
 *   `tests/e2e/helpers/i18n.js`）。
 *   所以文案断言要用 `anyLocale` / `anyLocaleFragment`，而不是写死中文。
 */
export const launchExtension = async ({ extraArgs = [], profilePrefix = 'vsc-e2e-' } = {}) => {
  // 产物检查放在这里（而不是模块顶层）：见 assertDistReady 的说明。
  assertDistReady();

  const executablePath = findChromium();
  const candidates = [
    { label: 'channel:chromium', options: { channel: 'chromium', headless: true, args: launchArgs(extraArgs) } },
    { label: 'executablePath', options: { executablePath, headless: true, args: launchArgs(extraArgs) } },
  ];

  const failures = [];
  for (const candidate of candidates) {
    // 只在候选「指名要用 executablePath」而它又没解析出来时跳过；
    // channel 候选根本没有这个键，不能被这条守卫一起跳掉。
    if ('executablePath' in candidate.options && candidate.options.executablePath === undefined) {
      continue;
    }

    // ⚠️ 每个候选用**自己的** profile 目录：上一个候选残留的
    // Chrome 单例锁会让下一个候选起不来。
    const profile = mkdtempSync(join(tmpdir(), profilePrefix));
    let context = null;
    try {
      context = await chromium.launchPersistentContext(profile, candidate.options);
    } catch (error) {
      failures.push(`${candidate.label}: ${String(error).slice(0, 200)}`);
      rmSync(profile, { recursive: true, force: true });
      continue;
    }

    // ⚠️ service worker 的等待必须在**候选内部**：
    // 「浏览器起来了但扩展没加载」（headless shell 不支持 `--load-extension`）
    // 是**这个候选失败**，不是全局失败 —— 该换下一个候选，而不是直接报错。
    const worker = context.serviceWorkers()[0]
      ?? (await context.waitForEvent('serviceworker', { timeout: 15_000 }).catch(() => null));
    if (!worker) {
      await context.close();
      rmSync(profile, { recursive: true, force: true });
      failures.push(`${candidate.label}: 浏览器起来了但扩展没加载（没等到 background service worker）`);
      continue;
    }

    return {
      context,
      extensionId: new URL(worker.url()).host,
      /**
       * 当前活着的 background service worker。
       *
       * ⚠️ 每次都**现取**而不是缓存启动时那一个：MV3 的 service worker 空闲
       * 约 30 秒就会被回收，缓存下来的句柄再 `evaluate` 会直接报
       * "Target closed"。这里在回收后仍能拿到活的那个。
       */
      get serviceWorker() {
        return context.serviceWorkers()[0] ?? worker;
      },
      async close() {
        await context.close();
        rmSync(profile, { recursive: true, force: true });
      },
    };
  }

  throw new Error(
    `无法启动带扩展的浏览器：\n${failures.join('\n')}\n` +
      '提示：headless 下必须使用支持扩展的完整 chromium（channel: chromium），' +
      'headless shell 不支持 --load-extension。',
  );
};
