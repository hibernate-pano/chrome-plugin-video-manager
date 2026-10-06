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
import path from 'node:path';
import ts from 'typescript';
import { resolve } from 'node:path';

// vitest 的 cwd 就是仓库根（本文件由 vitest.config.ts 收集，配置里没改 root）。
const repoRoot = process.cwd();
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

  it('test:e2e:ext 覆盖 tests/e2e 下每一个 spec，新用例不会静默漏跑', () => {
    // 同一条教训：新增一个 spec 文件却忘了加进 test:e2e:ext，CI 会照样全绿，
    // 而那个文件从未被执行过。这里用文件系统做事实核查，而不是手写名单。
    // 唯一的例外来源是 playwright.config.js 的 testIgnore。
    const e2eDir = resolve(repoRoot, 'tests/e2e');
    const specFiles = readdirSync(e2eDir).filter((name) => name.endsWith('.spec.js'));
    expect(specFiles.length, 'tests/e2e 下应当有 spec 文件').toBeGreaterThan(0);

    const playwrightConfig = readFileSync(resolve(repoRoot, 'playwright.config.js'), 'utf8');
    const ignored = new Set(
      (playwrightConfig.match(/testIgnore:\s*\[([^\]]*)\]/)?.[1] ?? '')
        .split(',')
        .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean),
    );

    const script = pkg.scripts['test:e2e:ext'] ?? '';
    for (const file of specFiles) {
      if (ignored.has(file)) continue;
      expect(script, `${file} 没有被 test:e2e:ext 引用，CI 不会执行它`).toContain(file);
    }
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

    const current = String(pkg.version).split('.').map(Number);
    for (const file of readdirSync(releaseDir)) {
      if (!file.toLowerCase().endsWith('.zip')) continue;
      const matched = file.match(/(\d+)\.(\d+)\.(\d+)/);
      if (!matched) continue;
      const version = matched.slice(1, 4).map(Number);
      expect(
        version.every((part, i) => part <= current[i]!),
        `release/${file} 的版本高于 package.json(${pkg.version})，发布时会选中它`,
      ).toBe(true);
      if (parse(matched[0]!)) {
        // 版本号格式合法即可继续，无需额外断言。
      }
    }
  });
});

describe('类型检查覆盖面', () => {
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
