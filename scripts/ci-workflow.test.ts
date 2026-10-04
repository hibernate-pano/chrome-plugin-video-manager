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
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { resolve } from 'node:path';

// vitest 的 cwd 就是仓库根（本文件由 vitest.config.ts 收集，配置里没改 root）。
const repoRoot = process.cwd();
const workflow = readFileSync(resolve(repoRoot, '.github/workflows/ci.yml'), 'utf8');
const pkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
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

  it('test:e2e:ext 同时跑影响边界套件，否则边界回归无人守', () => {
    // boundary.spec.js 里的用例是「不在真实浏览器里就跑不出来」的那一类
    // （shadow DOM 事件重定向、iframe 坐标系、无 body 文档、页面摘样式等），
    // 不在 CI 里跑就等于没有守卫。
    expect(pkg.scripts['test:e2e:ext']).toMatch(/boundary\.spec\.js/);
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
