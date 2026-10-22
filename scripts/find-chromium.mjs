/**
 * 「这个仓库该用哪个 Chromium」的**唯一**答案。
 *
 * ⚠️ 为什么它值得单独一个文件：找浏览器的逻辑被抄过两遍
 * （e2e 的启动 helper 与商店素材的生成脚本），而两边的**失败信息长得一模一样**
 * —— 都是「Executable doesn't exist at …」。
 * 于是「环境坏了」与「产品坏了」分不开，而真正的原因（全局缓存被别的项目清空）
 * 会被埋掉。
 *
 * ⚠️ **全局缓存是这台机器上所有项目共享的**
 * （`~/Library/Caches/ms-playwright`），而 Playwright 的 `_deleteStaleBrowsers`
 * 会把「注册表里没有标记文件」的浏览器目录**删掉** ——
 * 于是这台机器上**另一个项目**跑一次 `playwright install`，
 * 就能把本项目的浏览器**连同正在下载的那一份**一起清掉。
 *
 * 实测（2026-10-22）：另一个项目的 agent 反复装 chromium，
 * 本项目的缓存被清空了 4 次，e2e 全部以「Executable doesn't exist」失败。
 *
 * 所以本项目用 `PLAYWRIGHT_BROWSERS_PATH=.cache/ms-playwright` 装一份**私有的**，
 * 别人的 install 碰不到它（GC 只扫全局注册表那份）。
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 本仓库的 playwright-core 期望的 Chromium 版本号（revision）。
 *
 * ⚠️ 必须**按版本**找，不能拿「缓存里最大的那个」凑合 ——
 * 全局缓存是这台机器上所有项目共享的，里面可能躺着**别的项目**的
 * 另一个版本（实测：另一个项目用 playwright 1.61 / chromium 1228，
 * 本项目是 1.59 / chromium 1217）。
 * 用别人的版本跑，缺 feature、行为不一致，
 * 失败时更难往根因上想（「这个 bug 只在某个 Chrome 版本上出现」）。
 *
 * ⚠️ 读的是 **playwright-core 自己那份** browsers.json —— 那就是唯一说了算的地方。
 * 手写一个版本号只会变成第二份会漂移的真相。
 *
 * ⚠️ `playwright-core` 在 pnpm 里**不是**顶层依赖（`node_modules/playwright-core`
 * 不存在），所以不能直接 require 它。要从 `@playwright/test` 的**真实路径**
 * 反推：那个包的 node_modules 旁边就躺着 playwright-core。
 */
const expectedChromiumRevision = () => {
  try {
    const require = createRequire(import.meta.url);
    // ⚠️ pnpm 的布局（实测）：
    //   node_modules/.pnpm/@playwright+test@1.59.1/node_modules/@playwright/test/index.js
    //   node_modules/.pnpm/playwright-core@1.59.1/node_modules/playwright-core/browsers.json
    //
    // `playwright-core` **不是**顶层依赖（`node_modules/playwright-core` 不存在），
    // `playwright` 也不是 —— require.resolve 两个都报 MODULE_NOT_FOUND。
    // 能直接 resolve 的只有 `@playwright/test`。
    //
    // 所以：从 `@playwright/test` 的入口往上退到 `.pnpm` 目录，
    // 再按包名 `playwright-core@` 找出它 —— 目录名带版本号，
    // 但包名那一段是稳定的。
    const testEntry = require.resolve('@playwright/test');
    // 上退 5 层：index.js → test → @playwright → node_modules → @playwright+test@x → .pnpm
    const pnpmDir = dirname(dirname(dirname(dirname(dirname(testEntry)))));
    if (!existsSync(pnpmDir)) return undefined;

    for (const entry of readdirSync(pnpmDir)) {
      if (!entry.startsWith('playwright-core@')) continue;
      const candidate = join(pnpmDir, entry, 'node_modules', 'playwright-core', 'browsers.json');
      if (!existsSync(candidate)) continue;

      const manifest = JSON.parse(readFileSync(candidate, 'utf8'));
      const chromium = manifest.browsers?.find((browser) => browser.name === 'chromium');
      if (chromium?.revision) return String(chromium.revision);
    }
    return undefined;
  } catch {
    // 解析不出来就退化成「不挑版本」—— 那比直接失败好。
    return undefined;
  }
};

/**
 * 在 Playwright 的浏览器缓存里找「支持扩展的完整 chromium」。
 *
 * ⚠️ 必须同时认 macOS 与 Linux 两个缓存目录 ——
 * 只写 macOS 那条的话，在 Linux CI 上这个函数恒返回 `undefined`。
 *
 * ⚠️ **项目内的私有缓存排在最前面**（2026-10-22 加）。
 *
 * 根因：Playwright 的浏览器缓存是**全局共享**的
 * （`~/Library/Caches/ms-playwright`），而它的 `_deleteStaleBrowsers`
 * 会把「注册表里没有标记文件」的浏览器目录**删掉** ——
 * 于是这台机器上**另一个项目**跑一次 `playwright install`，
 * 就能把本项目的浏览器**连同正在下载的那一份**一起清掉。
 *
 * 实测（2026-10-22）：另一个项目（chrome-plugin-one-tab）的 agent
 * 反复装 chromium，本项目的缓存被清空了 4 次，
 * e2e 全部以「Executable doesn't exist」失败 —— 那是**环境**坏了，
 * 不是产品坏了，而两者的失败信息长得几乎一样。
 *
 * 所以本项目用 `PLAYWRIGHT_BROWSERS_PATH=.cache/ms-playwright` 装一份**私有的**，
 * 别人的 install 碰不到它（GC 只扫全局注册表那份）。
 */
/** 仓库根（这个文件住在 scripts/ 里，所以往上一级就是）。 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const findChromium = () => {
  const caches = [
    // 项目内的私有缓存（见上面的说明）—— 先找它。
    join(repoRoot, '.cache', 'ms-playwright'),
    join(homedir(), 'Library/Caches/ms-playwright'), // macOS
    join(homedir(), '.cache/ms-playwright'), // Linux
  ];
  const relativeCandidates = [
    'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    'chrome-linux/chrome',
    'chrome-win/chrome.exe',
  ];

  const wanted = expectedChromiumRevision();

  for (const cache of caches) {
    if (!existsSync(cache)) continue;
    const versions = readdirSync(cache)
      .filter((name) => name.startsWith('chromium-'))
      .map((name) => name.slice('chromium-'.length))
      .filter((version) => /^\d+$/.test(version))
      // ⚠️ **期望的版本排最前**；其余按新到旧排。
      // 找不到期望版本时退而求其次用别的版本 —— 但那必须是**最后一个**选择，
      // 而不是「碰巧缓存里最大的那个」。
      .sort((a, b) => {
        if (wanted) {
          if (a === wanted) return -1;
          if (b === wanted) return 1;
        }
        return Number(b) - Number(a);
      });

    for (const version of versions) {
      for (const relative of relativeCandidates) {
        const candidate = join(cache, `chromium-${version}`, relative);
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  return undefined;
};
