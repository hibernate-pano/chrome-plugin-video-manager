/**
 * CI 配置契约测试。
 *
 * 这个仓库的 CI 曾经无声失效了很久：五个 job 全部用 `npm ci` + `cache: 'npm'`，
 * 而仓库里只有 pnpm-lock.yaml 且 .gitignore 明确忽略 package-lock.json。
 * setup-node 的 cache 步骤在根目录找不到 npm 锁文件时会直接抛
 * "Dependencies lock file is not found"，失败点比 `npm ci` 更早。
 * 同时 lint / type-check 两个 job 调用的 npm script 在 package.json 里根本不存在。
 *
 * 这些缺陷全都在 YAML/JSON 配置层面，没有运行时信号能拦住它们，
 * 所以在这里把「配置必须满足的契约」固化成测试。
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import ts from 'typescript';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// vitest 的 cwd 就是仓库根（本文件由 vitest.config.ts 收集，配置里没改 root）。
const repoRoot = process.cwd();

/**
 * 把 JS 源码里的**注释与字符串**替换成空格，只留下真正的代码。
 *
 * ⚠️ 为什么需要它：守卫要量的是**代码**，不是**关于代码的散文**。
 * 实测踩过两次同一个坑 ——
 * 一次是「样式表里不许有这条规则」那条守卫，匹配上了规则**上面那行注释**；
 * 一次是「不许有裸的 `chromium.launch()`」那条，匹配上了脚本**自己**那句
 * 「`chromium.launch()` 不带参数时走的是全局缓存」。
 *
 * ⚠️ 用**状态机**而不是正则：正则分不清「注释里的引号」与「字符串里的引号」，
 * 于是很容易把代码本身也一起吃掉（那样守卫就永远绿了 —— 更糟）。
 */
const stripJsCommentsAndStrings = (source: string): string => {
  const out = source.split('');
  let i = 0;
  const n = source.length;

  const blank = (from: number, to: number) => {
    for (let k = from; k < to && k < n; k += 1) {
      // 保留换行，免得行号信息全丢。
      if (out[k] !== '\n') out[k] = ' ';
    }
  };

  while (i < n) {
    const ch = source[i];
    const next = source[i + 1];

    // 注释
    if (ch === '/' && next === '/') {
      let end = source.indexOf('\n', i);
      if (end === -1) end = n;
      blank(i, end);
      i = end;
      continue;
    }
    if (ch === '/' && next === '*') {
      let end = source.indexOf('*/', i + 2);
      end = end === -1 ? n : end + 2;
      blank(i, end);
      i = end;
      continue;
    }

    // 字符串（模板串也照剥 —— 里面同样不会有我们要匹配的代码）
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      let j = i + 1;
      while (j < n) {
        if (source[j] === '\\') {
          j += 2;
          continue;
        }
        if (source[j] === quote) break;
        j += 1;
      }
      blank(i, Math.min(j + 1, n));
      i = j + 1;
      continue;
    }

    i += 1;
  }

  return out.join('');
};
const workflow = readFileSync(resolve(repoRoot, '.github/workflows/ci.yml'), 'utf8');
const pkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
  version?: string;
};

/** 把工作流按 job 切开，返回 job 名 → 该 job 的文本块。 */
const splitJobs = (source: string): Record<string, string> => {
  // 只在顶层 `jobs:` 之后切，否则 `on:` 下的 push / pull_request 会被当成 job。
  const jobsStart = source.indexOf('\njobs:\n');
  expect(jobsStart, '工作流缺少顶层 jobs: 块').toBeGreaterThan(-1);
  const body = source.slice(jobsStart);

  const jobHeader = /^ {2}([A-Za-z0-9_-]+):$/gm;
  const headers: { name: string; start: number }[] = [];
  for (const match of body.matchAll(jobHeader)) {
    headers.push({ name: match[1]!, start: match.index! });
  }
  const jobs: Record<string, string> = {};
  headers.forEach((header, i) => {
    const end = headers[i + 1]?.start ?? body.length;
    jobs[header.name] = body.slice(header.start, end);
  });
  return jobs;
};

const jobs = splitJobs(workflow);

/** pnpm 的内建命令，不是 package.json 里的 script。 */
const PNPM_BUILTIN_COMMANDS = new Set([
  'add',
  'approve-builds',
  'config',
  'create',
  'dlx',
  'env',
  'exec',
  'import',
  'init',
  'install',
  'link',
  'ls',
  'outdated',
  'pack',
  'prune',
  'rebuild',
  'remove',
  'run',
  'store',
  'unlink',
  'update',
  'upgrade',
  'version',
  'why',
]);

/** 抽出工作流里所有单行 `run:` 块的文本。 */
const runSteps = (source: string): string[] =>
  [...source.matchAll(/^\s*run:\s*(.+)$/gm)].map((m) => m[1]!.trim());

describe('CI 工作流：包管理器', () => {
  it('任何 job 都不再用 npm ci', () => {
    // \b 前缀是必须的：没有它，`pnpm install` 里的 "npm install" 会被误判。
    expect(workflow).not.toMatch(/\bnpm\s+ci\b/);
  });

  it('任何 job 都不再用 npm install / npm run', () => {
    expect(workflow).not.toMatch(/\bnpm\s+(install|run)\b/);
  });

  it('每个 job 都在 setup-node 之前装 pnpm，且 pnpm 版本必须钉死', () => {
    for (const [name, block] of Object.entries(jobs)) {
      if (!block.includes('actions/setup-node')) continue;
      expect(block, `job ${name} 缺少 pnpm/action-setup`).toMatch(/pnpm\/action-setup@v\d+/);
      expect(
        block.indexOf('pnpm/action-setup'),
        `job ${name} 里 pnpm/action-setup 必须排在 setup-node 之前（cache 步骤依赖 pnpm 在 PATH 上）`,
      ).toBeLessThan(block.indexOf('actions/setup-node'));

      // 版本必须显式钉死：pnpm/action-setup 不写 version 会装最新版，而
      // pnpm 12 对 --frozen-lockfile 有 lockfile 字段要求，版本漂移会让三个 job 全红。
      const pnpmStep = block.slice(
        block.indexOf('pnpm/action-setup'),
        block.indexOf('actions/setup-node'),
      );
      expect(pnpmStep, `job ${name} 的 pnpm/action-setup 没有钉版本`).toMatch(/version:\s*['"]?[\d.]+['"]?/);
    }
  });

  it('setup-node 的缓存一律用 pnpm，不用 npm', () => {
    // YAML 的单双引号等价，只挡单引号等于没挡。
    expect(workflow).not.toMatch(/cache:\s*['"]?npm['"]?/);
    for (const [name, block] of Object.entries(jobs)) {
      if (!block.includes('actions/setup-node')) continue;
      expect(block, `job ${name} 的 setup-node 没有声明 cache: 'pnpm'`).toMatch(/cache:\s*['"]?pnpm['"]?/);
    }
  });

  it('依赖安装一律是 pnpm install --frozen-lockfile', () => {
    // 只看真正装依赖的命令。`pnpm exec playwright install chromium` 装的是浏览器二进制，
    // 不是这个仓库的依赖，它出现在这里是合理的，不该被这条规则误伤。
    const dependencyInstalls = runSteps(workflow).filter((cmd) => /^pnpm\s+install\b/.test(cmd));
    expect(dependencyInstalls.length).toBeGreaterThan(0);
    for (const cmd of dependencyInstalls) {
      expect(cmd).toMatch(/^pnpm install --frozen-lockfile$/);
    }
  });
});

describe('CI 工作流：引用的 script 必须真实存在', () => {
  const referencedScripts = new Set<string>();

  for (const cmd of runSteps(workflow)) {
    // pnpm run <script> / pnpm <script>
    const explicit = cmd.match(/^pnpm run ([\w:.-]+)$/);
    if (explicit) {
      referencedScripts.add(explicit[1]!);
      continue;
    }
    const bare = cmd.match(/^pnpm ([\w:.-]+)$/);
    if (bare && !PNPM_BUILTIN_COMMANDS.has(bare[1]!)) {
      referencedScripts.add(bare[1]!);
    }
  }

  it('至少引用了一个 script（否则本组断言是空转）', () => {
    expect(referencedScripts.size).toBeGreaterThan(0);
  });

  for (const script of referencedScripts) {
    it(`pnpm ${script} 在 package.json 中存在`, () => {
      expect(Object.keys(pkg.scripts)).toContain(script);
    });
  }
});

describe('CI 工作流：构建产物', () => {
  it('上传的是 dist 目录，不是早已不存在的 *-bundled.js', () => {
    const upload = jobs['build'] ?? '';
    expect(upload).toMatch(/actions\/upload-artifact@v\d+/);
    expect(upload).toMatch(/path:\s*dist\b/);
    expect(workflow).not.toMatch(/(content|options)-bundled\.js/);
  });

  it('产物缺失时 upload-artifact 直接失败，而不是静默产出空包', () => {
    expect(jobs['build']).toMatch(/if-no-files-found:\s*error/);
  });

  it('不再上传没有生成者的 coverage/lcov.info', () => {
    // 补覆盖率需要同时加 @vitest/coverage-v8、vitest coverage 配置和
    // 私有仓库 token（三个新的失败面）。真要补的时候，连同本条断言一起更新。
    expect(workflow).not.toMatch(/coverage\/lcov\.info/);
  });
});

describe('CI 工作流：job 依赖图', () => {
  it('build 依赖 test，且不再有 release job', () => {
    expect(jobs['build']).toMatch(/needs:\s*\[test\]/);
    // 出包改为本地 `pnpm build:ext`，CI 不再有 release job。
    expect(jobs['release']).toBeUndefined();
  });

  it('build 不再依赖已删除的 lint / type-check job', () => {
    expect(jobs['build']).not.toMatch(/needs:.*\b(lint|type-check)\b/);
  });

  it('job 集合就是 test / e2e / build 三个，没有别的残留', () => {
    // 用集合比而不是顺序比：YAML 里 job 的先后只是书写顺序，不该成为契约。
    const actual = Object.keys(jobs).sort();
    expect(actual).toEqual(['build', 'e2e', 'test']);
  });

  it('类型检查仍然被 build 门禁住 —— tsc 折在 package.json 的 build 里', () => {
    expect(pkg.scripts['build']).toMatch(/^\s*tsc\s*&&/);
  });

  it('E2E 脚本必须先构建 —— 否则会拿上一次成功的产物跑真实的浏览器断言', () => {
    // 这不是洁癖。做 6.0.8 的字幕兼容时真的踩到了：`noUnusedLocals` 让
    // 变异版源码构建失败（tsc 先退出），vite 根本没跑，dist/ 留着上一次
    // 的产物 —— 而 `pnpm test:e2e` 里的 `&&` 在 shell 层会把失败传出去，
    // 手动分步跑时却极易以为「E2E 通过 = 改动生效」。
    //
    // 反过来也危险：E2E 真加载 dist/，dist 过期等于在测一个不存在的版本。
    // 这里钉死"先 build 再 playwright"，让这条契约不能被无声改掉。
    //
    // ⚠️ 中间允许夹**环境变量前缀**（`PLAYWRIGHT_BROWSERS_PATH=… playwright test`）——
    // 契约是「build 在前、playwright test 在后」，不是「两者必须紧挨着」。
    for (const script of ['test:e2e', 'test:e2e:ext']) {
      expect(pkg.scripts[script], `${script} 必须先构建再跑 playwright`).toMatch(
        /pnpm\s+build\s*&&\s*(?:[A-Za-z_][A-Za-z0-9_]*=\S+\s+)*playwright\s+test/,
      );
    }
  });
});

describe('CI 工作流：action 版本与 Node 运行时', () => {
  it('不再钉已 EOL 的 Node 20，跑在 Active LTS 上', () => {
    // Node 20 已于 2026-04-30 EOL；同时 checkout v5+ / setup-node v5+ /
    // upload-artifact v6+ 自身都跑在 node24 上，继续钉 20 只会让 job 提前进
    // deprecation 警告，且拿不到安全更新。
    expect(workflow).not.toMatch(/node-version:\s*['"]?20['"]?/);
    expect(workflow).toMatch(/node-version:\s*['"]?2[24]['"]?/);
  });

  it('action 主版本不低于 node24 运行时那一代', () => {
    // 这四行是“能用”的下限：低于它们的版本跑在 node20 上，会被 GitHub 强制
    // 升到 node24 并打出 deprecation 警告。将来主版本再涨时改这里。
    const minimums: Array<[string, RegExp]> = [
      ['actions/checkout', /actions\/checkout@v(?:[5-9]|\d{2,})/],
      ['actions/setup-node', /actions\/setup-node@v(?:[5-9]|\d{2,})/],
      ['actions/upload-artifact', /actions\/upload-artifact@v(?:[6-9]|\d{2,})/],
      ['pnpm/action-setup', /pnpm\/action-setup@v(?:[6-9]|\d{2,})/],
    ];

    for (const [name, pattern] of minimums) {
      expect(workflow, `${name} 仍在用过期的运行时版本`).toMatch(pattern);
    }
  });

  it('不再用 ubuntu-latest 之外的 runner 假设', () => {
    // ubuntu-latest 会随 GitHub 侧迁移（如 2026-10-19 起迁往 Ubuntu 26）。
    // 这里只确认仍是托管 runner，不把具体镜像写死成契约。
    for (const [name, block] of Object.entries(jobs)) {
      expect(block, `job ${name} 缺少 runs-on`).toMatch(/runs-on:\s*\S+/);
    }
  });
});

describe('CI 工作流：e2e 真的装了浏览器并跑起来', () => {
  it('e2e job 装了 Chromium —— 缺了它这整个 job 会在启动浏览器时直接失败', () => {
    expect(jobs['e2e']).toMatch(/playwright install[^\n]*chromium/);
  });

  it('e2e job 跑的是真实扩展那套用例，不是把 content.js 当脚本注入页面的旧用例', () => {
    expect(jobs['e2e']).toMatch(/test:e2e:ext/);
  });

  it('test:e2e:ext 真的存在，且会先构建出 dist/ 再跑', () => {
    const script = pkg.scripts['test:e2e:ext'];
    expect(script, 'package.json 缺少 test:e2e:ext').toBeTruthy();
    expect(script).toMatch(/build/);
    expect(script).toMatch(/real-extension\.spec\.js/);
  });

  /**
   * 浏览器必须装在**项目内的私有缓存**里。
   *
   * ⚠️ 为什么这条不能只是「文档里提一句」：
   * Playwright 的浏览器缓存是**全局共享**的
   * （`~/Library/Caches/ms-playwright`），而它的 `_deleteStaleBrowsers`
   * 会把「注册表里没有标记文件」的浏览器目录**删掉** ——
   * 于是这台机器上**另一个项目**跑一次 `playwright install`，
   * 就能把本项目的浏览器**连同正在下载的那一份**一起清掉。
   *
   * 实测（2026-10-22）：另一个项目的 agent 反复装 chromium，
   * 本项目的缓存被清空了 4 次，e2e 全部以
   * 「Executable doesn't exist at …/chromium-1217/…」失败。
   * 那**不是**产品坏了，但失败信息长得几乎一样 ——
   * 于是分诊的人会先去查产品，白查半天。
   *
   * 私有缓存（`PLAYWRIGHT_BROWSERS_PATH=.cache/ms-playwright`）
   * 别人的 install 碰不到它：GC 只扫全局注册表那一份。
   *
   * ⚠️ 还要**版本对得上**：全局缓存里可能躺着**别的项目**的另一个版本
   * （实测：一个项目用 playwright 1.61 / chromium 1228，
   * 本项目是 1.59 / chromium 1217）。所以 CI 里也必须装到私有路径。
   */
  it('浏览器装在项目内的私有缓存里（全局缓存会被别的项目清空）', () => {
    expect(
      pkg.scripts['setup:browsers'],
      'package.json 缺少 setup:browsers',
    ).toBeTruthy();
    expect(
      pkg.scripts['setup:browsers'],
      'setup:browsers 必须把浏览器装进项目内的私有缓存',
    ).toMatch(/PLAYWRIGHT_BROWSERS_PATH=\.cache\/ms-playwright/);

    // CI 里那一步也必须用同一套路径 —— 否则本地过了、CI 还是会踩全局缓存。
    expect(
      jobs['e2e'],
      'CI 的 e2e job 必须把浏览器装进私有缓存',
    ).toMatch(/PLAYWRIGHT_BROWSERS_PATH=\.cache\/ms-playwright[^\n]*playwright install[^\n]*chromium/);
  });

  /**
   * **装在哪，就用哪** —— 跑 e2e 用的浏览器必须是 `setup:browsers` 装的那一个。
   *
   * ⚠️ 实测（2026-10-22）：这台机器上别的项目把**全局**缓存清空了，
   * 于是 `playwright test` 走全局注册表时直接报
   * 「Executable doesn't exist at …/Library/Caches/ms-playwright/chromium-1217/…」。
   *
   * ⚠️ 更隐蔽的一种：全局缓存里若恰好有**另一个版本**的 Chromium，
   * 跑测试用的就不是本仓库锁定的那个版本了 ——
   * 行为不一致、失败时更难往根因上想（「这个 bug 只在某个 Chrome 版本上出现」）。
   *
   * 所以 `test:e2e` / `test:e2e:ext` 必须**自己**带上
   * `PLAYWRIGHT_BROWSERS_PATH=.cache/ms-playwright` ——
   * 不能指望开发者记得手打这个环境变量（README 里写一遍是不够的：
   * 忘了就静默地换了个浏览器跑）。
   */
  it('跑 e2e 用的浏览器，就是 setup:browsers 装的那一个', () => {
    for (const script of ['test:e2e', 'test:e2e:ext']) {
      expect(
        pkg.scripts[script],
        `package.json 缺少 ${script}`,
      ).toBeTruthy();
      expect(
        pkg.scripts[script],
        `${script} 必须把浏览器指到项目内的私有缓存 —— ` +
          '不指的话，它会走全局注册表：那边可能被别的项目清空，' +
          '也可能躺着另一个版本，于是「装的是 A、跑的是 B」',
      ).toMatch(/PLAYWRIGHT_BROWSERS_PATH=\.cache\/ms-playwright/);
    }
  });

  /**
   * `launch.js` 必须**先**找私有缓存。
   *
   * ⚠️ 顺序不能反：全局缓存里可能躺着别的项目的**另一个版本**，
   * 用它跑出来的行为与本仓库锁定的 playwright 版本不一致 ——
   * 缺 feature、行为不同，失败时更难往根因上想。
   */
  it('launch.js 优先找项目内的私有缓存', () => {
    // ⚠️ 找浏览器的实现住在 `scripts/find-chromium.mjs`（2026-10-22 挪过去的）：
    // **商店素材的生成脚本**也需要同一份答案 ——
    // 它以前自己 `chromium.launch()`，于是去全局缓存里找，
    // 在本项目的私有缓存里明明有浏览器却报「Executable doesn't exist」。
    // 抄一份的后果是两边慢慢漂移，而两边的失败信息长得**一模一样**。
    const source = readFileSync(resolve(repoRoot, 'scripts/find-chromium.mjs'), 'utf8');
    const privateAt = source.indexOf("'.cache', 'ms-playwright'");
    const globalAt = source.indexOf("'Library/Caches/ms-playwright'");

    expect(privateAt, 'find-chromium.mjs 没有找项目内的私有缓存').toBeGreaterThan(-1);
    expect(globalAt, 'find-chromium.mjs 没有找全局缓存（Linux 那条仍然需要）').toBeGreaterThan(-1);
    expect(
      privateAt,
      '私有缓存必须排在全局缓存**前面** —— 全局那份可能是别的项目的另一个版本',
    ).toBeLessThan(globalAt);

    // ⚠️ launch.js 必须**用**那一份，而不是自己再抄一遍。
    const launcher = readFileSync(resolve(repoRoot, 'tests/e2e/helpers/launch.js'), 'utf8');
    expect(
      launcher,
      'launch.js 必须从 scripts/find-chromium.mjs 取浏览器 —— 抄一份会漂',
    ).toContain('find-chromium.mjs');
    expect(
      launcher,
      'launch.js 里不许自己写浏览器路径 —— 那正是漂移的来源',
    ).not.toMatch(/Library\/Caches\/ms-playwright/);
  });

  it('商店素材的生成脚本也用私有缓存里的浏览器', () => {
    const source = readFileSync(resolve(repoRoot, 'scripts/generate-store-assets.mjs'), 'utf8');

    expect(
      source,
      '素材生成脚本必须从 find-chromium.mjs 取浏览器 —— ' +
        '裸的 chromium.launch() 会走**全局**缓存，而那个缓存是这台机器上' +
        '所有项目共享的，别的项目跑一次 install 就能把它清空',
    ).toContain('find-chromium.mjs');

    // ⚠️ 裸的 launch() 仍然可能藏在别处 —— 直接找那一句。
    // ⚠️ **必须先剥掉注释**：这段脚本自己的注释里就写着
    // 「`chromium.launch()` 不带参数时走的是全局缓存」——
    // 拿注释去匹配，守卫会红在自己的说明文字上（实测踩过）。
    expect(
      stripJsCommentsAndStrings(source),
      '素材生成脚本里不许有裸的 chromium.launch()（没有 executablePath 的那种）',
    ).not.toMatch(/chromium\.launch\(\s*\)/);
  });

  /**
   * 让 **Playwright 自己**回答「哪些 spec 会被执行」。
   *
   * ⚠️ 为什么不用手写 glob 匹配去解析 testIgnore：
   * Playwright 的真实规则是「pattern 若没写成目录通配前缀的形式，它会自动补上；
   * 随后用 minimatch 去匹配**绝对路径**」（见 playwright/lib/util.js 的
   * createFileMatcher）。自己复刻这套语义就是在猜；猜错了守卫会**骗人** ——
   * 那比没有守卫更糟。
   *
   * `--list` 用的是同一份 playwright.config.js、同一套匹配逻辑 ——
   * 它列出来的，就是 CI 真会跑的那些文件。
   *
   * ⚠️ 这里必须**炸掉**而不是跳过：核实不了「哪些会跑」时如果默默放过，
   * 这条守卫就成了假守卫（正是它要防的那类假象）。
   */
  const listPlaywrightSpecFiles = (): string[] => {
    const cli = resolve(repoRoot, 'node_modules/@playwright/test/cli.js');
    if (!existsSync(cli)) {
      throw new Error(
        `找不到 ${cli} —— 无法向 Playwright 核实「哪些用例会跑」。` +
          `守卫在这里必须炸掉，绝不能默默放过。`,
      );
    }

    let stdout = '';
    try {
      stdout = execFileSync(process.execPath, [cli, 'test', '--list', '--reporter=json'], {
        cwd: repoRoot,
        encoding: 'utf8',
        timeout: 120_000,
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      const stderr = String((error as { stderr?: unknown }).stderr ?? '');
      throw new Error(`Playwright 的 --list 跑挂了，无法判断哪些用例会被执行：\n${stderr}`);
    }

    const start = stdout.indexOf('{');
    if (start === -1) {
      throw new Error(`Playwright 的 --list 没有输出 JSON：\n${stdout}`);
    }
    const report = JSON.parse(stdout.slice(start)) as {
      suites?: { file?: string }[];
      errors?: unknown[];
    };
    if ((report.errors ?? []).length > 0) {
      throw new Error(`Playwright 收集用例时报错：\n${JSON.stringify(report.errors)}`);
    }
    return (report.suites ?? [])
      .map((suite) => suite.file)
      .filter((file): file is string => Boolean(file));
  };

  /** 从 `test:e2e:ext` 的命令行里取出登记的 spec 名单（按 token 精确切）。 */
  const parseRegisteredSpecs = (script: string): string[] => {
    const after = script.split('playwright test ')[1];
    if (!after) return [];
    return after.split(/\s+/).filter((entry) => entry.endsWith('.spec.js'));
  };

  /**
   * 「绿灯」的意思必须是「**该跑的跑了**」，不是「没报错」。
   *
   * 这条断言守的是这个仓库里反复出现的同一族错误 —— **静默漏跑**：
   *
   * - 方向 A：新增了一个 spec 文件，却忘了登记进 `test:e2e:ext`
   *   → CI 照样全绿，而那个文件从未被执行过。
   * - 方向 B：登记进了 `test:e2e:ext`，但文件名撞上了 `testIgnore`
   *   （探针豁免规则：一次性排查脚本按**文件名**放行）
   *   → Playwright 会跳过它，CI 照样全绿，而那个用例**一次都没跑过**。
   *
   * ⚠️ 方向 B 是实测过的洞，不是理论风险：
   * `playwright test <正常文件> <被 testIgnore 的文件>` 的退出码是 **0** ——
   * 被忽略的那个被静默跳过，其余照跑，CI 判绿。
   *
   * ⚠️ 判据只用**一个**来源：Playwright 自己列出来的文件清单。
   * 两个方向都在同一份清单上对账，所以「登记的」与「会跑的」不可能各说各话。
   *
   * ⚠️ 判据**不用**「有没有被 Git 跟踪」：
   * 那样一来，「新建了永久用例却忘了登记」这个**最该被抓住**的错误，
   * 在本地会悄无声息（文件还没 git add）；而用「已提交」当判据，
   * 等于把「提交前忘了登记」推迟到 commit 之后才报 ——
   * 那一刻人已经不看测试输出了。
   */
  it('test:e2e:ext 登记的 spec = Playwright 真会跑的 spec（谁都不会静默漏跑）', () => {
    const listed = listPlaywrightSpecFiles();
    const registered = parseRegisteredSpecs(pkg.scripts['test:e2e:ext'] ?? '');

    expect(listed.length, 'Playwright 一个 spec 都没列出 —— 这条断言在空转').toBeGreaterThan(0);
    expect(registered.length, 'test:e2e:ext 里应当登记了若干 spec').toBeGreaterThan(0);

    // 方向 A：会跑却没登记
    for (const file of listed) {
      expect(
        registered,
        `${file} 会被 Playwright 执行，却没登记进 test:e2e:ext —— CI 不会跑它。`,
      ).toContain(file);
    }

    // 方向 B：登记了却不会跑
    for (const file of registered) {
      expect(
        listed,
        `${file} 登记进了 test:e2e:ext，却不会被 Playwright 执行` +
          `（文件不存在，或文件名撞上了 testIgnore 的探针豁免规则）——` +
          `CI 照样全绿，但这个用例一次都没跑过。`,
      ).toContain(file);
    }
  }, 120_000);
});

describe('CI 工作流：什么情况下才真的跑', () => {
  /**
   * 这组断言守的是一件**没人会注意到**的事：
   * 「绿灯」到底意味着什么。
   *
   * 2026-10-21 的实况：6.1.0 与 6.2.0 的全部工作（含 6 个新 e2e spec、
   * 重写过的设置页与全屏控制器）**从未进过 CI** —— 最后一次绿的 e2e 作业是
   * 2026-10-08 跑的 6.0.8 那棵树。原因是 `on:` 只认 `main` / `develop`
   * 与「往 main 开 PR」，而工作一直做在功能分支上。
   *
   * 后果不是「CI 坏了」，是**分支上「测试全绿」与「CI 会绿」成了两件事**：
   * 前者只说明本地跑过，后者才是发布闸门。于是「绿」这个信号被高估了。
   *
   * 修法是让 e2e 在**任何分支**上都跑 —— 代价是每次推送多花约 2 分钟，
   * 换来的是「绿色」重新等于「真浏览器里还能用」。
   */
  it('e2e 必须在**所有分支**的 push 上都跑，不能只认 main/develop', () => {
    // 触发条件写在 `on:` 里，而 `on:` 里的 push: / pull_request: 会被
    // 误当成 job —— 所以这里只取 `jobs:` 之前的那一段。
    const trigger = workflow.slice(0, workflow.indexOf('\njobs:\n'));
    const lines = trigger.split('\n');

    const pushIndex = lines.findIndex((line) => /^\s*push:\s*(#.*)?$/.test(line));
    expect(pushIndex, '工作流的 on: 里没有 push 段').toBeGreaterThan(-1);

    // `push:` 下面**缩进更深**的行才是它的子项；没有子项 = 所有分支。
    const indentOf = (line: string) => line.length - line.trimStart().length;
    const pushIndent = indentOf(lines[pushIndex]!);
    const children: string[] = [];
    for (let i = pushIndex + 1; i < lines.length; i += 1) {
      const line = lines[i]!;
      if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
      if (indentOf(line) <= pushIndent) break;
      children.push(line.trim());
    }

    // `branches: [main, develop]` 之外的写法（`branches-ignore: [...]`、
    // `branches: ['*']`、直接不写 branches）都意味着「所有分支」。
    const branchFilter = children.find((child) => child.startsWith('branches:'));
    const hasAllBranches =
      !branchFilter ||
      /branches-ignore\s*:/.test(children.join('\n')) ||
      /branches\s*:\s*\[\s*['"]?\*['"]?\s*\]/.test(branchFilter);

    expect(
      hasAllBranches,
      `push 只在部分分支上触发（${children.join(' ')}）—— 功能分支上的改动永远不会跑 e2e，` +
        '而本地「全绿」会被误当成「CI 会绿」',
    ).toBe(true);
  });

  it('工作流必须由 push 或 pull_request 触发（不能只在手点时跑）', () => {
    const trigger = workflow.slice(0, workflow.indexOf('\njobs:\n'));
    expect(trigger).toMatch(/push:|pull_request:/);
  });
});

describe('单元测试覆盖面', () => {
  it('vitest 的 include 覆盖 src 与 scripts 下每一个含有测试的子目录', () => {
    // 这个仓库有同一个形状的缺口两次：tsconfig.include 曾漏掉 popup 与
    // background（~900 行从未被 tsc 看过，10 个类型错误一路发到商店），
    // 于是有了下面那个「类型检查覆盖面」的守护。但 vitest.config.ts 的
    // include 同样是逐条枚举，却没人守它——
    //
    //   实测：在 src/popup/ 放一个 expect(1).toBe(2) 的测试，
    //   `vitest run` 依然输出 Test Files 17 passed / Tests 185 passed，零失败。
    //   那个测试从未被执行，CI 全绿。
    //
    // 也就是说：新增一个带测试的目录却忘了改 vitest.config.ts，
    // 会得到「所有测试都通过了」的假象。
    const vitestConfig = readFileSync(resolve(repoRoot, 'vitest.config.ts'), 'utf8');

    const includeMatch = vitestConfig.match(/include:\s*\[([\s\S]*?)\]/);
    expect(includeMatch, 'vitest.config.ts 里找不到 test.include 数组').not.toBeNull();
    const includeEntries = (includeMatch?.[1] ?? '')
      .split(',')
      .map((entry) => entry.trim().replace(/^['"`]|['"`]$/g, ''))
      .filter(Boolean);

    expect(includeEntries.length, 'vitest include 解析不出任何条目，正则可能已失效').toBeGreaterThan(0);

    // 收集实际存在测试文件的目录（相对仓库根，用 / 分隔）。
    const roots = ['src', 'scripts'];
    const dirsWithTests = new Set<string>();
    for (const root of roots) {
      const rootDir = resolve(repoRoot, root);
      let entries: string[] = [];
      try {
        entries = readdirSync(rootDir, { recursive: true });
      } catch {
        continue;
      }
      for (const file of entries) {
        if (!String(file).endsWith('.test.ts')) continue;
        // readdirSync(root, { recursive: true }) 返回的是相对 root 的路径
        // （如 `background/action.test.ts`），前缀要自己补回去。
        const rel = `${root}/${String(file)}`.split(path.sep).join('/');
        const dir = path.dirname(rel);
        if (dir && dir !== '.') {
          dirsWithTests.add(dir);
        }
      }
    }

    expect(dirsWithTests.size, '一个带测试的目录都没扫到，扫描逻辑本身可能坏了').toBeGreaterThan(0);

    for (const dir of [...dirsWithTests].sort()) {
      const covered = includeEntries.some((entry) => {
        // 把 include 条目按 glob 语义简化成「目录前缀匹配」：
        // `src/content/**/*.test.ts` 覆盖 `src/content` 下的所有测试。
        const prefix = entry
          .replace(/\/?\*\*\/.*$/, '')
          .replace(/\/?\*\.test\.ts$/, '')
          .replace(/\/$/, '');
        return dir === prefix || dir.startsWith(`${prefix}/`);
      });

      expect(
        covered,
        `${dir} 下有测试文件，但 vitest.config.ts 的 include 没覆盖它 —— ` +
          '这些测试永远不会执行，CI 会在它们从未运行的情况下显示全绿',
      ).toBe(true);
    }
  });
});

/** 只做「删除旧数据」的文件，不算功能复活。 */
const MIGRATION_ONLY_FILES = new Set([
  path.join('src', 'shared', 'settings.ts'),
  path.join('src', 'shared', 'types.ts'),
]);

describe('已废弃功能的残留防护', () => {
  it('src 下不再有读写站点速度记忆的活代码', () => {
    // 6.0.7 删掉了站点速度记忆。它之所以值得一条守护，是因为这个功能
    // 「看起来很无害」——重新实现它只需要几行代码，而一旦复活，
    // 用户就又会被一条自己看不见的默认规则接管速度。
    //
    // 只扫 src/：文档里的历史记录（CHANGELOG / PRODUCT 变更记录）
    // 提到它是应该的，迁移用的 LEGACY_SITE_SPEEDS_KEY 常量也必须留着。
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) {
          continue;
        }
        // 两处白名单都是「只删不读」的迁移代码，删掉功能后必须留着：
        // settings.ts 负责清掉老用户残留的表，types.ts 只定义那个键名。
        const relative = path.relative(repoRoot, full);
        if (MIGRATION_ONLY_FILES.has(relative)) {
          return;
        }
        const source = readFileSync(full, 'utf8');
        const readsOrWrites =
          /siteSpeedMemory|SITE_SPEEDS_KEY|rememberSpeed|getSpeed\(|\.remember\(/.test(source);
        if (readsOrWrites) {
          offenders.push(relative);
        }
      }
    };
    walk(resolve(repoRoot, 'src'));

    expect(
      offenders,
      `站点速度记忆已被删除，但这些文件仍在读写它：${offenders.join(', ')}`,
    ).toEqual([]);
  });
});

describe('版本号单一来源', () => {
  it('package.json 与 manifest.json 的 version 一致', () => {
    // 版本号是手工同步的第二事实源（scripts/copy-assets.js 直接 copyFileSync
    // manifest.json，全仓没有从 package.json 同步版本的代码）。
    // 已经实际脱节过：tag v6.0.5 打在 9d249a4，而版本 bump 发生在其父提交
    // 508d6f5，之后 9d249a4 又改了用户可见文案 ——
    // 结果是 v6.0.5 的 zip 从未被构建出来，而 release/ 里只有 6.0.3。
    const manifest = JSON.parse(
      readFileSync(resolve(repoRoot, 'manifest.json'), 'utf8'),
    ) as { version?: string };

    expect(manifest.version, 'manifest.json 缺少 version').toBeTruthy();
    expect(
      manifest.version,
      `manifest.json(${manifest.version}) 与 package.json(${pkg.version}) 版本不一致 —— ` +
        '商店上传的是包内 manifest，两处不一致会让线上版本与仓库版本错位',
    ).toBe(pkg.version);
  });
  it('release/ 下不应残留与当前版本无关的旧包被误当作发布候选', () => {
    // store-publish.mjs 的 findLatestZip() 只按文件名版本号取最大、不校验包内
    // manifest，且全脚本没有 confirm/readline/prompt —— 裸跑会直接发到生产。
    // 这里不禁止存在旧包（归档是合理的），但要求 release/ 里的包版本号
    // 不超过当前仓库版本，避免「选包逻辑选中一个比仓库旧的包」。
    const releaseDir = resolve(repoRoot, 'release');
    if (!existsSync(releaseDir)) {
      return;
    }

    const parse = (value: string) =>
      value
        .split('.')
        .map((part) => Number(part))
        .every((part) => Number.isInteger(part) && part >= 0);

    // ⚠️ 必须按**语义化版本**比，不能逐段比大小。
    //
    // 逐段比（`version.every((part, i) => part <= current[i])`）在
    // 「6.0.3 vs 6.1.0」上判成「更高」—— 第三段 3 > 0 就得出结论，
    // 而 6.0.3 明明**低于** 6.1.0。这个比较方式让每一次 minor 升级
    // 都会把这条断言弄红（实测：版本提到 6.1.0 的当天就红了）。
    //
    // 正确的做法：逐段比，**第一段不同的**决定大小，后面的段不再参与。
    const compare = (left: number[], right: number[]) => {
      const length = Math.max(left.length, right.length);
      for (let i = 0; i < length; i += 1) {
        const a = left[i] ?? 0;
        const b = right[i] ?? 0;
        if (a !== b) {
          return a - b;
        }
      }
      return 0;
    };

    const current = String(pkg.version).split('.').map(Number);
    for (const file of readdirSync(releaseDir)) {
      if (!file.toLowerCase().endsWith('.zip')) continue;
      const matched = file.match(/(\d+)\.(\d+)\.(\d+)/);
      if (!matched) continue;
      const version = matched.slice(1, 4).map(Number);
      expect(
        compare(version, current) <= 0,
        `release/${file} 的版本高于 package.json(${pkg.version})，发布时会选中它`,
      ).toBe(true);
      if (parse(matched[0]!)) {
        // 版本号格式合法即可继续，无需额外断言。
      }
    }
  });
});

describe('类型检查覆盖面', () => {
  /**
   * 「有含义的常量」必须被**测试**引用到。
   *
   * ## 为什么需要这条
   *
   * 有一类缺陷是**单测抓不到、只有改坏实现才看得见**的：
   * 一个阈值常量（可见度 10%、巡检周期 1 秒、探针重试间隔 80ms…）
   * 写错了或被改成另一个值，**没有任何一条测试会红** ——
   * 因为那些测试压根没提到这个常量。
   *
   * 实测（2026-10-23 审计）：
   * - 把「在视口里」的可见度阈值从 10% 改成 1% → 1084 条单测**全绿**，
   *   33 条相关 E2E 也**全绿**（E2E 测的是 0% 与 100% 两个极端，
   *   分不出「阈值是 10% 还是 1%」）；
   * - 把探针的重试去掉（问一次扑空就当 frame 没了）→ 1084 条单测**全绿**。
   *
   * 两条都是**真盲区**：前者会让几乎看不见的视频抢走按键，
   * 后者会在页面刚打开的那几十毫秒里把「这个标签页的倍速读数」清掉
   * （扩展开始说一个假的倍速）。
   *
   * ## 判据
   *
   * 源码里每个「有含义的数值常量」都必须在**某个测试文件**里出现过
   * （按名字搜）。没出现 = 没有任何测试知道它的存在 = 改坏它没人拦。
   *
   * ⚠️ 这条守卫**不是**要覆盖所有数字（那不可能）——
   * 它只盯「阈值 / 周期 / 间隔 / 上限」这一类**调错了就有行为差别**的常量。
   * 列表是显式的：加一个常量进来，就该加一条测试。
   */
  it('有行为后果的阈值常量必须被测试引用（否则改坏了没人拦）', () => {
    // 常量名 → 它住在哪个文件里。
    const meaningfulConstants: Record<string, string> = {
      // 视频「在视口里」的可见度阈值（videoRegistry.ts）。
      // 10% 这条线是「用户实际上看不见它」的判据；1% 与 10% 的区别
      // 只有一条专门的测试才分得出来。
      MIN_VISIBLE_FRACTION: 'src/content/videoRegistry.ts',
      // 快捷键目标的粘性窗口（videoRegistry.ts）：多视频页面上
      // 「刚用键盘命中过谁」要记多久。
      KEYBOARD_TARGET_MS: 'src/content/videoRegistry.ts',
      // 「用户显式选过它」的窗口（videoRegistry.ts）。
      EXPLICIT_CHOICE_MS: 'src/content/videoRegistry.ts',
      // 焦点归属的巡检周期（runtime.ts）。
      FOCUS_WATCH_INTERVAL_MS: 'src/content/runtime.ts',
      // 「视频在嵌入框里」提示的节流窗口（runtime.ts）。
      NO_VIDEO_HINT_INTERVAL_MS: 'src/content/runtime.ts',
      // 探针扑空后的重试间隔（background/index.ts）：
      // 去掉重试 = 「第一次没答上就当 frame 没了」。
      FRAME_PROBE_RETRY_DELAY_MS: 'src/background/index.ts',
    };

    // 收集所有测试文件的内容。
    const testFiles: string[] = [];
    for (const root of ['src', 'scripts']) {
      const rootDir = resolve(repoRoot, root);
      let entries: string[] = [];
      try {
        entries = readdirSync(rootDir, { recursive: true });
      } catch {
        continue;
      }
      for (const file of entries) {
        if (!String(file).endsWith('.test.ts')) continue;
        testFiles.push(resolve(rootDir, String(file)));
      }
    }
    expect(testFiles.length, '一个测试文件都没扫到，扫描逻辑本身可能坏了').toBeGreaterThan(0);

    // ⚠️ **必须剥掉注释再搜**：
    // 注释里提到一个常量名，不等于有测试**依赖**它 ——
    // 而「依赖」正是这条守卫要问的事。
    // （第一版没剥注释，于是「在注释里写一句『阈值是 MIN_VISIBLE_FRACTION』」
    //   就足以让守卫通过 —— 那条守卫等于没有。）
    const stripComments = (source: string): string =>
      source
        // 块注释
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        // 行注释
        .replace(/(^|[^:])\/\/.*$/gm, '$1');

    // ⚠️ **必须排除本文件自己**：这份清单里就写着所有常量的名字，
    // 把自己算进去 = 守卫永远通过（自证陷阱）。
    const selfPath = fileURLToPath(import.meta.url);
    const testContents = testFiles
      .filter((file) => file !== selfPath)
      .map((file) => stripComments(readFileSync(file, 'utf8')))
      .join('\n');

    for (const [name, sourceFile] of Object.entries(meaningfulConstants)) {
      // 先确认这个常量真的存在于源码里（改错了名字会误报）。
      const source = readFileSync(resolve(repoRoot, sourceFile), 'utf8');
      expect(
        source.includes(name),
        `${sourceFile} 里找不到常量 ${name} —— 守卫的清单可能已经过期`,
      ).toBe(true);

      expect(
        testContents.includes(name),
        `常量 ${name}（${sourceFile}）没有被任何测试引用 —— ` +
          '改坏它不会有任何测试变红，它就是一条活的盲区。' +
          '要么给它补一条专门的测试，要么从这份清单里删掉它（并说明为什么无害）',
      ).toBe(true);
    }
  });

  it('tsconfig 的 include 覆盖 src 下每一个含有 TS 源码的子目录', () => {
    // tsconfig 曾经只列了 content / options / shared，popup 和 background 整整
    // ~900 行代码从来没被 tsc 看过 —— 那里有 10 个类型错误在 CI 全绿的情况下
    // 一路发布到了商店。
    //
    // 这里不用字符串匹配去猜 glob：include 现在是 `src/**/*.ts` 这种通配写法，
    // 里面根本不含目录名。直接问 TypeScript「你会检查哪些文件」，用它的
    // getParsedCommandLineOfConfigFile，而不是自己实现 glob 语义。
    const parsed = ts.getParsedCommandLineOfConfigFile(
      resolve(repoRoot, 'tsconfig.json'),
      {},
      {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic: () => {},
      },
    );

    const checkedDirs = new Set(
      (parsed?.fileNames ?? [])
        .map((file) => path.relative(repoRoot, file).split(path.sep).slice(0, 2).join('/'))
        .filter((entry) => entry.startsWith('src/')),
    );

    const srcRoot = resolve(repoRoot, 'src');
    const srcDirs = readdirSync(srcRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) =>
        readdirSync(resolve(srcRoot, name), { recursive: true })
          .some((file) => String(file).endsWith('.ts')),
      )
      .sort();

    expect(srcDirs.length).toBeGreaterThan(0);
    for (const dir of srcDirs) {
      expect(
        checkedDirs.has(`src/${dir}`),
        `tsc 不会检查 src/${dir}，该目录下的类型错误不会被 CI 拦住`,
      ).toBe(true);
    }
  });
});

describe('manifest 的 commands 与代码一致', () => {
  /**
   * 原生扩展命令的名字必须与代码里的常量**完全一致**。
   *
   * 对不上时的表现是最难查的一类：Chrome 不会报错、不会打日志，
   * 命令只是**永远不触发** —— 用户按了快捷键，什么都没发生，
   * 而扩展看起来完全正常。
   *
   * 这条测试把两个事实源锁在一起：manifest.json 的 commands 段，
   * 与 src/shared/types.ts 里导出的命令名常量。
   */
  it('manifest 声明的每个命令都有对应的代码常量', () => {
    const manifest = JSON.parse(
      readFileSync(resolve(repoRoot, 'manifest.json'), 'utf8'),
    ) as { commands?: Record<string, { description?: string; suggested_key?: unknown }> };

    const commands = manifest.commands ?? {};
    const source = readFileSync(resolve(repoRoot, 'src/shared/types.ts'), 'utf8');

    Object.keys(commands).forEach((name) => {
      expect(
        source.includes(`'${name}'`),
        `manifest 里声明了命令 "${name}"，但 src/shared/types.ts 里没有同名常量 —— ` +
          '命令永远不会被触发，而且没有任何报错',
      ).toBe(true);
    });
  });

  it('命令的 description 用 __MSG_ 占位符且该 key 在两个 locale 里都存在', () => {
    const manifest = JSON.parse(
      readFileSync(resolve(repoRoot, 'manifest.json'), 'utf8'),
    ) as { commands?: Record<string, { description?: string }> };

    const locales = (['en', 'zh_CN'] as const).map((locale) => ({
      locale,
      messages: JSON.parse(
        readFileSync(resolve(repoRoot, '_locales', locale, 'messages.json'), 'utf8'),
      ) as Record<string, { message?: string }>,
    }));

    Object.entries(manifest.commands ?? {}).forEach(([name, command]) => {
      const match = /^__MSG_(.+)__$/.exec(command.description ?? '');
      expect(
        match,
        `命令 "${name}" 的 description 不是 __MSG_xxx__ 形式：` +
          '直接写死英文的话，英文界面下会是一句没本地化的说明',
      ).not.toBeNull();

      const key = match?.[1] ?? '';
      locales.forEach(({ locale, messages }) => {
        expect(
          messages[key]?.message,
          `命令 "${name}" 的 description 引用了 ${key}，但 ${locale} 的 locale 文件里没有这个 key —— ` +
            'Chrome 会拒绝加载带未知 __MSG_ 的扩展',
        ).toBeTruthy();
      });
    });
  });

  it('快捷键用 Chrome 认的键名（逗号是 Comma，不是字面 ","）', () => {
    const manifest = JSON.parse(
      readFileSync(resolve(repoRoot, 'manifest.json'), 'utf8'),
    ) as { commands?: Record<string, { suggested_key?: { default?: string; mac?: string } }> };

    Object.entries(manifest.commands ?? {}).forEach(([name, command]) => {
      const shortcut = command.suggested_key?.default;
      if (!shortcut) {
        return;
      }

      // 字面逗号会让 Chrome 报 "Invalid value for 'commands[1].default'"，
      // 后果是**整个扩展加载失败** —— 不是"这个快捷键用不了"，是扩展装不上。
      expect(
        shortcut,
        `命令 "${name}" 的快捷键 "${shortcut}" 里有字面逗号 —— ` +
          '必须写成 Comma，否则 Chrome 会拒绝加载整个扩展',
      ).not.toContain(',');

      // Chrome 在 macOS 上会把 "Ctrl" 自动翻译成 "Command"（⌘）。
      // 但 "default" 段里**不能**写 "Command" / "Option" —— 那会直接报错。
      expect(
        shortcut,
        `命令 "${name}" 的快捷键写成了 "${shortcut}" —— ` +
          '"default" 段里只能用 Ctrl / Alt / Shift，写 Command 或 Option 会让扩展加载失败',
      ).not.toMatch(/(^|\+)(Command|Option)(\+|$)/);
    });
  });
});

describe('仓库卫生：被 .gitignore 忽略的文件不应还被 git 跟踪', () => {
  /**
   * 背景：`test-results/.last-run.json` 从 v4.1 起就一直被跟踪。
   * 它是 Playwright 的运行产物（记录上次跑挂了哪条用例），每跑一次 E2E 就变一次。
   *
   * 为什么这是个问题：`.gitignore` 对**已跟踪**文件无效 —— 规则只在
   * `git add` 时起作用。所以光在 .gitignore 里写 `test-results/` 完全没用，
   * 必须 `git rm --cached` 把它从索引里摘掉。
   *
   * 而且这类文件在 diff 里是纯噪音：每次跑完 E2E，git status 就多一条改动，
   * 让人误以为"我改了什么东西"。
   */
  it('git 索引里没有被 .gitignore 忽略的路径', () => {
    // 用 `git check-ignore` 逐条问 git：这个被跟踪的文件是不是被忽略了？
    // 是的话，说明它要么是历史遗留，要么是有人 `git add -f` 硬塞进来的。
    const tracked = execFileSync('git', ['ls-files', '-z'], {
      cwd: repoRoot,
      encoding: 'buffer',
    })
      .toString('utf8')
      .split('\0')
      .filter(Boolean);

    const ignored = execFileSync(
      'git',
      // -c = cached（已跟踪），-i = ignored（被忽略）。
      // 两个必须一起给：单独的 -i 会报 "must be used with either -o or -c"。
      ['ls-files', '-z', '-c', '-i', '--exclude-standard'],
      { cwd: repoRoot, encoding: 'buffer' },
    )
      .toString('utf8')
      .split('\0')
      .filter(Boolean);

    expect(
      ignored,
      '这些文件被 .gitignore 忽略，却仍在 git 索引里 —— ' +
        '.gitignore 对已跟踪文件无效，需要 git rm --cached <path>',
    ).toEqual([]);

    // 防呆：确保上面那条命令真的跑出了东西，否则这条断言是空转的。
    expect(tracked.length, 'git ls-files 应当列出仓库里的文件').toBeGreaterThan(0);
  });
});

/**
 * e2e 的**宿主负载契约**。
 *
 * ⚠️ 这组守卫守的不是「产品行为」，是「**测试环境会不会撒谎**」。
 *
 * 背景（实测 2026-10-22）：这台机器同时跑着好几个项目，
 * load average 一度到 96。于是同一套代码连着两次全量跑，
 * 失败集合**完全不同**（一次 3 条、一次 7 条，分布在 5 个互不相干的 spec 里），
 * 而这 5 个 spec 单独串行重跑 —— 24/24 全绿。
 *
 * 那种失败长这样：
 *
 *     Error: Test timeout of 30000ms exceeded.
 *
 * 没有断言差异、没有堆栈。**和「产品坏了」长得一模一样。**
 * 于是每一次分诊都要从头挣一遍，而挣错一次就可能去改产品 ——
 * 那是比测试慢得多的浪费。
 *
 * 所以契约有三条：
 * 1. 并发度由**宿主负载**决定（机器忙就别硬撑两个 Chromium）；
 * 2. 失败时必须**带上负载快照**（下次分诊不用从头猜）；
 * 3. CI 里**钉死**并发度（CI 的并发度必须可复现，不能随机器漂移）。
 */
describe('e2e 的宿主负载契约', () => {
  const configFile = 'playwright.config.js';
  const configSource = readFileSync(resolve(repoRoot, configFile), 'utf8');

  /** 从 defineConfig({...}) 里取出某个顶层属性的初始化表达式。 */
  const configProperty = (name: string): ts.Expression | undefined => {
    const sourceFile = ts.createSourceFile(
      configFile,
      configSource,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JS,
    );
    let object: ts.ObjectLiteralExpression | undefined;
    const visit = (node: ts.Node): void => {
      if (object) return;
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'defineConfig'
      ) {
        const arg = node.arguments[0];
        if (arg && ts.isObjectLiteralExpression(arg)) {
          object = arg;
          return;
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    if (!object) return undefined;
    for (const property of object.properties) {
      if (ts.isPropertyAssignment(property) && ts.getTextOfPropertyName(property.name) === name) {
        return property.initializer;
      }
    }
    return undefined;
  };

  /** 收集一个 JS 文件里所有 `timeout: <数字>` 属性的值（毫秒）。 */
  const collectTimeouts = (relativePath: string): number[] => {
    const sourceFile = ts.createSourceFile(
      relativePath,
      readFileSync(resolve(repoRoot, relativePath), 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JS,
    );
    const values: number[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isPropertyAssignment(node) && ts.getTextOfPropertyName(node.name) === 'timeout') {
        const initializer = node.initializer;
        // 数字字面量里的下划线分隔符（60_000）在 TS AST 里仍是 NumericLiteral，
        // 但 getText() 拿到的是原文，必须去掉下划线才能 Number()。
        if (ts.isNumericLiteral(initializer)) {
          values.push(Number(initializer.getText().replace(/_/g, '')));
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return values;
  };

  it('worker 数由宿主负载决定（不许写死数字）', () => {
    const workers = configProperty('workers');
    expect(workers, 'playwright.config.js 缺少 workers').toBeDefined();

    const isCall = workers !== undefined && ts.isCallExpression(workers);
    expect(
      isCall,
      'workers 必须写成 suggestWorkers() —— 写死数字等于假设「机器是安静的」，' +
        '而这台机器经常不是（实测 load average 到过 96），' +
        '于是失败会随机出现在不相关的用例里，且长得和「产品坏了」一模一样',
    ).toBe(true);

    if (isCall) {
      const callee = (workers as ts.CallExpression).expression;
      expect(
        ts.isIdentifier(callee) && callee.text === 'suggestWorkers',
        'workers 必须由 scripts/host-load.mjs 的 suggestWorkers() 决定',
      ).toBe(true);
    }

    expect(
      configSource,
      'playwright.config.js 必须真的 import 那份实现（否则 suggestWorkers 只是个名字）',
    ).toContain("from './scripts/host-load.mjs'");
    expect(
      existsSync(resolve(repoRoot, 'scripts/host-load.mjs')),
      'scripts/host-load.mjs 不存在 —— worker 数就没有来源',
    ).toBe(true);
  });

  it('配了宿主负载 reporter（失败时必须能一眼看出是产品坏了还是机器忙）', () => {
    const reporter = configProperty('reporter');
    expect(reporter, 'playwright.config.js 缺少 reporter').toBeDefined();
    expect(
      reporter?.getText(),
      'reporter 必须挂上 scripts/host-load-reporter.js —— ' +
        '没有它，失败时只有一句「Test timeout of 30000ms exceeded」，分诊只能从头来',
    ).toContain('host-load-reporter');
    expect(existsSync(resolve(repoRoot, 'scripts/host-load-reporter.js'))).toBe(true);
  });

  it('单条用例的兜底超时 ≥ 内层轮询超时的 2 倍（兜底不能抢在断言前面说话）', () => {
    const timeout = configProperty('timeout');
    expect(timeout, 'playwright.config.js 缺少 timeout').toBeDefined();
    const outer = timeout !== undefined && ts.isNumericLiteral(timeout)
      ? Number(timeout.getText().replace(/_/g, ''))
      : Number.NaN;
    expect(Number.isFinite(outer), 'timeout 必须是一个数字（毫秒）').toBe(true);

    const e2eFiles = readdirSync(resolve(repoRoot, 'tests/e2e'), {
      recursive: true,
      encoding: 'utf8',
    })
      .filter((entry) => entry.endsWith('.js'))
      .map((entry) => `tests/e2e/${entry}`);

    const innerTimeouts = e2eFiles.flatMap(collectTimeouts);
    expect(innerTimeouts.length, '一条内层超时都没扫到 —— 扫法坏了，这条守卫是空转的').toBeGreaterThan(0);

    const maxInner = Math.max(...innerTimeouts);
    expect(
      outer,
      `外层兜底 ${outer}ms 必须 ≥ 内层最大轮询 ${maxInner}ms 的 2 倍 —— ` +
        '否则机器一忙，「准备工作」就把兜底用光，报出来的是没有信息量的「超时了」，' +
        '而不是「到底在等什么没等到」',
    ).toBeGreaterThanOrEqual(maxInner * 2);
  });

  it('CI 的 e2e job 显式钉死 worker 数（CI 的并发度必须可复现）', () => {
    expect(
      jobs['e2e'],
      'CI 的 e2e job 必须设 VSC_E2E_WORKERS —— 不钉死的话，' +
        'CI 的并发度会随「跑测那一刻的机器负载」漂移，' +
        '于是「昨天绿今天红」永远说不清是谁变了',
    ).toMatch(/VSC_E2E_WORKERS/);
  });
});
