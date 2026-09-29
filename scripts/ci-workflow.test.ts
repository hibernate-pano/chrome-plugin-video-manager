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
import { readFileSync } from 'node:fs';
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

describe('CI 工作流：release job', () => {
  const release = jobs['release'] ?? '';

  it('不再用 pull_request 专属的 payload 拼 tag（push 事件下它恒为 null）', () => {
    expect(release).not.toMatch(/pull_request/);
  });

  it('tag 由 commit sha 派生，不会退化成字面量 "v"', () => {
    expect(release).toMatch(/v\$\{\{\s*github\.sha\s*\}\}/);
    // `tag_name: v${{ ... }}` 在表达式为空时会塌成 "v"，
    // 所以必须断言 tag 前面确实有 github.sha 这段非空来源。
    expect(release).not.toMatch(/tag_name:\s*v\$\{\{\s*github\.event\b/);
  });

  it('用官方 gh CLI 发布，不再用已 archived 的 actions/create-release', () => {
    // 匹配 `uses:` 而非裸字符串，否则解释这个决定的注释会误伤断言。
    expect(release).not.toMatch(/uses:\s*[\w.-]+\/create-release/);
    expect(release).toMatch(/gh release create/);
    expect(release).toMatch(/GH_TOKEN:\s*\$\{\{\s*secrets\.GITHUB_TOKEN\s*\}\}/);
  });

  it('先取回 build 产物再打包，zip 挂到 release 上', () => {
    expect(release).toMatch(/actions\/download-artifact@v\d+/);
    expect(release).toMatch(/name:\s*extension-build/);
    expect(release).toMatch(/pnpm run package:ext/);
    expect(release).toMatch(/release\/\*\.zip/);
  });

  it('仍然是草稿语义（是否自动发布是产品决定，不在本次修复范围）', () => {
    expect(release).toMatch(/--draft/);
  });
});

describe('CI 工作流：job 依赖图', () => {
  it('build 依赖 test，release 依赖 build 和 e2e', () => {
    expect(jobs['build']).toMatch(/needs:\s*\[test\]/);
    expect(jobs['release']).toMatch(/needs:\s*\[[^\]]*\bbuild\b[^\]]*\]/);
    expect(jobs['release']).toMatch(/needs:\s*\[[^\]]*\be2e\b[^\]]*\]/);
  });

  it('build 不再依赖已删除的 lint / type-check job', () => {
    expect(jobs['build']).not.toMatch(/needs:.*\b(lint|type-check)\b/);
  });

  it('job 集合就是 test / e2e / build / release 四个，没有别的残留', () => {
    // 用集合比而不是顺序比：YAML 里 job 的先后只是书写顺序，不该成为契约。
    const actual = Object.keys(jobs).sort();
    expect(actual).toEqual(['build', 'e2e', 'release', 'test']);
  });

  it('类型检查仍然被 build 门禁住 —— tsc 折在 package.json 的 build 里', () => {
    expect(pkg.scripts['build']).toMatch(/^\s*tsc\s*&&/);
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

  it('e2e 失败时 release 不会照样发出去', () => {
    expect(jobs['release']).toMatch(/needs:\s*\[[^\]]*\be2e\b[^\]]*\]/);
  });
});
