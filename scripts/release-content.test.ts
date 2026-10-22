/**
 * 发布包的内容承诺 —— README 与商店文案里那几句话的**守卫**。
 *
 * 守的是什么承诺：
 *
 *   README「隐私与信任」与商店 Permissions Justification 里写着
 *   「产物里没有任何第三方库」「它不发起任何网络请求」「只申请必要的权限」。
 *
 * ⚠️ 这些话**会过期**，而过期的承诺比没有承诺更糟：
 * 审核员会拿它去对照真实的包，README 会拿它去回答用户「这扩展安全吗」。
 * 于是每一次加依赖、每一次引入一个 CDN 脚本、每一次多要一个权限，
 * 都必须**先**让这里变红 —— 提醒那句话要跟着改，而不是悄悄变成谎话。
 *
 * 为什么守**源码**而不是产物：
 *   - 产物（dist/）在 CI 的 `test` job 里还不存在（build 排在 test 之后）；
 *   - 源码扫描是**确定性**的，不依赖构建产物是否就位 ——
 *     那种「产物在就查、不在就跳过」的守卫等于没有守卫（它大多数时候是绿的）。
 *   - 真正针对**产物**的那道闸在 scripts/package-extension.js 里：
 *     出包前扫一遍 zip 内容，远程 URL 一律拦下。
 *
 * ⚠️ 扫描的是**构建入口真正能走到的文件**，不是 src/ 整个目录。
 * 差别很实在：src/options/options-test-env.ts 住在 src/ 里，
 * 但它只被 *.test.ts 引用，**不进产物**（实测 dist/ 里搜不到它）。
 * 按目录扫会把它算成「产物里有 vitest」—— 假警报一次，
 * 守卫就再也没人信了。
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { resolve } from 'node:path';

const repoRoot = process.cwd();

/** 项目的 GitHub 仓库 —— 产物里唯一允许出现的外部域名。 */
const OWN_REPO_URL = 'https://github.com/hibernate-pano/chrome-plugin-video-manager';

const pkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
};

const manifest = JSON.parse(
  readFileSync(resolve(repoRoot, 'manifest.json'), 'utf8'),
) as {
  permissions?: string[];
  optional_permissions?: string[];
  host_permissions?: string[];
  optional_host_permissions?: string[];
  content_security_policy?: unknown;
};

const optionsHtml = readFileSync(resolve(repoRoot, 'options.html'), 'utf8');
const contentLoader = readFileSync(resolve(repoRoot, 'content-loader.js'), 'utf8');

/**
 * 构建入口 —— 与 vite.config.js 的 rollupOptions.input 一致。
 *
 * ⚠️ 少写一个入口就等于漏扫一整块代码，所以这份名单要跟 vite.config.js 同步。
 */
const BUILD_ENTRIES = [
  'src/content/index.ts',
  'src/background/index.ts',
  'src/options/index.ts',
];

/** 去掉注释 —— 注释里的 URL 不可能发出请求（站点适配器里就写着 iqiyi.com）。 */
const stripComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/**
 * 从构建入口出发，沿 import 关系找出**真正会进产物**的源文件。
 *
 * 解析的是相对路径 import（`./x`、`../y`）；非相对路径的由另一条断言去管。
 */
const reachableSources = (): string[] => {
  const seen = new Set<string>();
  const queue = BUILD_ENTRIES.map((entry) => resolve(repoRoot, entry));

  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);

    const text = readFileSync(file, 'utf8');
    const matches = text.matchAll(/(?:from|import|require)\s*\(?\s*['"](\.[^'"]*)['"]/g);

    for (const match of matches) {
      const base = resolve(path.dirname(file), match[1]!);
      const candidates = [base, `${base}.ts`, `${base}.js`, resolve(base, 'index.ts')];

      for (const candidate of candidates) {
        if (existsSync(candidate) && statSync(candidate).isFile()) {
          queue.push(candidate);
          break;
        }
      }
    }
  }

  return [...seen].sort();
};

const runtimeFiles = reachableSources();

describe('发布包承诺：零第三方库', () => {
  it('package.json 只有 devDependencies，没有任何运行时依赖', () => {
    // ⚠️ 这条是「产物里没有第三方库」的**根**：
    // 构建用的依赖（vite / vitest / playwright）全是 devDependencies，
    // 它们只参与构建，不会进到产物里。
    // 一旦有人把某个包挪进 `dependencies`，产物里就会多出第三方代码 ——
    // 而「零第三方库」这句话是写给审核员与用户的。
    expect(
      Object.keys(pkg.dependencies ?? {}),
      '出现了运行时依赖 —— 它们会进到发布包里。' +
        '确认这个包真的必要的话，把 README 与商店文案里「零第三方库」那句话一起改掉。',
    ).toEqual([]);
  });

  it('会进产物的代码里没有引入任何外部包', () => {
    const offenders: string[] = [];

    for (const file of runtimeFiles) {
      const text = readFileSync(file, 'utf8');
      // from 'x' / import 'x' / require('x') —— 只看非相对路径的
      const matches = text.matchAll(/(?:from|import|require)\s*\(?\s*['"]([^'"]+)['"]/g);

      for (const match of matches) {
        const specifier = match[1]!;
        if (specifier.startsWith('.')) continue; // 相对路径 —— 自有代码
        if (specifier.startsWith('node:')) continue; // node 内置
        offenders.push(`${path.relative(repoRoot, file)} → ${specifier}`);
      }
    }

    expect(
      offenders,
      `会进产物的代码里引入了外部包：\n${offenders.join('\n')}\n` +
        '它们会被打进发布包，「零第三方库」那句话就不成立了。',
    ).toEqual([]);
  });

  it('这道守卫真的扫到了东西（别让它扫了个空）', () => {
    // 恒真的守卫等于没有守卫：万一 import 图走坏了（比如入口改名了），
    // 上面的断言会**因为扫不到任何东西**而一直是绿的。
    expect(runtimeFiles.length, 'import 图走空了 —— 守卫正在空转').toBeGreaterThan(20);
    expect(
      runtimeFiles.some((file) => file.endsWith(path.join('options', 'index.ts'))),
      '没走到设置页入口 —— 守卫正在空转',
    ).toBe(true);
    expect(
      runtimeFiles.some((file) => file.endsWith(path.join('content', 'index.ts'))),
      '没走到内容脚本入口 —— 守卫正在空转',
    ).toBe(true);
  });
});

describe('发布包承诺：不发起任何网络请求', () => {
  it('会进产物的代码里没有任何网络 API', () => {
    // 逐个点名，而不是笼统地说「没有网络代码」——
    // 漏掉一个就等于承诺失效，所以名单要全。
    const forbidden: { name: string; pattern: RegExp }[] = [
      { name: 'fetch()', pattern: /(?<![.\w])fetch\s*\(/ },
      { name: 'XMLHttpRequest', pattern: /(?<![.\w])new\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(/ },
      { name: 'WebSocket', pattern: /(?<![.\w])new\s+WebSocket\b/ },
      { name: 'sendBeacon', pattern: /(?<![.\w])sendBeacon\s*\(/ },
      { name: 'EventSource', pattern: /(?<![.\w])new\s+EventSource\b/ },
      { name: 'importScripts', pattern: /(?<![.\w])importScripts\s*\(/ },
    ];

    const found: string[] = [];

    for (const file of runtimeFiles) {
      const text = stripComments(readFileSync(file, 'utf8'));
      for (const { name, pattern } of forbidden) {
        if (pattern.test(text)) {
          found.push(`${path.relative(repoRoot, file)} → ${name}`);
        }
      }
    }

    expect(
      found,
      `会进产物的代码里出现了网络 API：\n${found.join('\n')}\n` +
        '扩展一旦发起网络请求，「nothing is sent anywhere」这句承诺就不成立了 —— ' +
        '要么删掉它，要么把 README 与商店文案一起改掉。',
    ).toEqual([]);
  });

  it('content-loader.js 只加载扩展自己的文件，不碰网络', () => {
    // 它是唯一**不进 import 图**却会进产物的手写文件
    // （manifest 里 content_scripts 指的是它）。
    //
    // 它确实用了一个动态 import()，但目标是 chrome.runtime.getURL('content.js')
    // —— 扩展包内部的本地资源，不是网络请求。所以这里守的是「目标必须是本地 URL」。
    expect(contentLoader, 'content-loader.js 不见了 —— 它是内容脚本的入口').toBeTruthy();
    expect(
      contentLoader,
      'content-loader.js 里出现了远程 URL —— 内容脚本的 bootstrap 不该向外请求',
    ).not.toMatch(/https?:\/\//);

    const imports = [...contentLoader.matchAll(/import\s*\(([^)]*)\)/g)].map((m) => m[1]!);
    expect(imports.length, 'content-loader.js 里没有动态 import —— 入口方式变了？').toBeGreaterThan(0);
    imports.forEach((target) => {
      expect(
        target,
        'content-loader.js 的动态 import 目标不是扩展内部的 URL —— ' +
          '从外部加载代码会绕过扩展的 CSP',
      ).toContain('chrome.runtime.getURL');
    });
  });

  it('产物里出现的外部 URL 只有本项目自己的 GitHub 仓库', () => {
    // 这是「不发网络请求」在**产物**层面的直接体现：
    // 构建产物里除了仓库地址与隐私政策链接，不该有任何一个别的主机名。
    // （产物层面的完整扫描在 scripts/package-extension.js 里，
    //   那里能看到构建工具注入的东西 —— 这里守的是源码。）
    const sources = [
      ...runtimeFiles.map((file) => ({ file, text: stripComments(readFileSync(file, 'utf8')) })),
      { file: 'options.html', text: optionsHtml },
      { file: 'content-loader.js', text: contentLoader },
      { file: 'manifest.json', text: JSON.stringify(manifest) },
    ];

    const offenders: string[] = [];

    for (const { file, text } of sources) {
      for (const match of text.matchAll(/https?:\/\/[^\s'"`)\\]+/g)) {
        const url = match[0];
        if (url.startsWith(OWN_REPO_URL)) continue; // 仓库地址与隐私政策链接
        offenders.push(`${file} → ${url}`);
      }
    }

    expect(
      offenders,
      `产物里出现了本仓库之外的 URL：\n${offenders.join('\n')}\n` +
        '（远程字体 / CDN 脚本 / 统计端点都长这样）—— ' +
        '「不发起任何网络请求」这句承诺就不成立了。',
    ).toEqual([]);
  });
});

describe('发布包承诺：只申请必要的权限', () => {
  it('构建配置仍然关着 modulepreload polyfill', () => {
    // ⚠️ 为什么要在**源码**这一层守构建配置：
    // 产物那道闸（scripts/package-extension.js 的 assertNoNetworkApis）
    // 只在**出包时**跑 —— 而出包是最后一步，那时才发现问题已经晚了
    // （要重新改配置、重新构建、重新出包）。
    //
    // 而这里守的根因是 2026-10-22 那次真实的漏网：
    // Vite 默认注入 modulepreload polyfill，它里面有 `fetch(s.href)`。
    // 那段代码运行时是死的（Chrome 原生支持 modulepreload），
    // 但**产物里有它** —— 而承诺是关于**产物**的。
    //
    // 两道闸的关系：
    //   - 这条（源码层）：改配置时立刻红，拦住「别把 polyfill 加回来」；
    //   - assertNoNetworkApis（产物层）：出包时红，拦住「任何来源的网络 API」。
    // 少任何一道，那次漏网都会重现。
    const viteConfig = readFileSync(resolve(repoRoot, 'vite.config.js'), 'utf8');

    expect(
      viteConfig,
      'vite.config.js 里没有关掉 modulepreload polyfill —— ' +
        '它会把一段带 fetch() 的 polyfill 塞进产物，' +
        '而「不发起任何网络请求」这句承诺是关于产物的。',
    ).toMatch(/polyfill:\s*false/);
  });

  it('permissions 只含 storage', () => {
    // 商店文案里逐字写的是「Stores your shortcut bindings ... 」。
    // 多一个权限，商店文案与 Permissions Justification 就对不上 ——
    // 而「描述与实际不符」是 CWS 的拒审项。
    expect(manifest.permissions ?? []).toEqual(['storage']);
  });

  it('没有 optional_permissions / optional_host_permissions', () => {
    // 可选权限的坑在于：用户点了「同意」之后它就变成永久权限，
    // 而**商店文案里不会提**。这个扩展没有需要用户额外授权的能力。
    expect(manifest.optional_permissions ?? []).toEqual([]);
    expect(manifest.optional_host_permissions ?? []).toEqual([]);
  });

  it('host_permissions 只含 <all_urls>', () => {
    expect(manifest.host_permissions ?? []).toEqual(['<all_urls>']);
  });

  it('没有放宽内容安全策略（远程代码不可能）', () => {
    // MV3 的默认 CSP 不允许远程脚本。显式写一个更宽松的 CSP
    // 就等于把「远程代码不可能」这句话作废。
    expect(
      manifest.content_security_policy,
      'manifest 显式声明了 content_security_policy —— ' +
        '确认它没有放宽 script-src（默认策略已经够严）。',
    ).toBeUndefined();
  });
});

describe('发布包承诺：商店文案与真实行为对得上', () => {
  it('README 与商店文案都还写着「零第三方库 / 不发网络请求」', () => {
    // 反向守卫：有人把实现改了、却忘了改文案时，
    // 上面几条会红；有人**只**把文案删了、没改实现时，这条会红。
    // 两条合起来才完整。
    const readme = readFileSync(resolve(repoRoot, 'README.md'), 'utf8');
    const storeDoc = readFileSync(resolve(repoRoot, 'CHROMEWEBSTORE.md'), 'utf8');

    expect(readme, 'README 里少了「不发起任何网络请求」那句承诺').toContain('不发起任何网络请求');
    expect(readme, 'README 里少了「没有任何第三方库」那句承诺').toContain('没有任何第三方库');
    expect(storeDoc, '商店文案里少了 no network requests 那句承诺').toContain(
      'no network requests',
    );
    expect(storeDoc, '商店文案里少了 no third-party libraries 那句承诺').toContain(
      'no third-party libraries',
    );
  });

  it('要贴进商店的正文里没有 markdown 星号（CWS 会剥离 markdown）', () => {
    // ⚠️ 这条守的是一个真实发生过的问题（2026-10-22 复核发现）：
    // 详细描述里有三处 `**粗体**`，而 CWS **会剥离 markdown** ——
    // 用户在商店页面上看到的是**字面的星号**。
    //
    // 为什么它值得一条守卫：这一栏是**手工粘贴**到 Dashboard 的，
    // 没有 CI 参与。粘贴的那一刻没有任何东西会检查它，
    // 而这一栏里的每一句都会被审核员当真的读。
    //
    // ⚠️ 判据只覆盖「要贴进去的那两段正文」
    // （Detailed Description 与 Version History），
    // 不覆盖本文件其余部分 —— 那里的 `**` 是给维护者看的标记，不会被贴出去。
    const storeDoc = readFileSync(resolve(repoRoot, 'CHROMEWEBSTORE.md'), 'utf8');
    const lines = storeDoc.split('\n');

    // 详细描述正文：从「Video Speed Controller 把网页里的视频」起，
    // 到「**Category** [REQUIRED]」之前 —— 那之后是别的元数据小节，
    // 它们的 `**` 是给维护者看的标记，不会被贴进商店。
    const descStart = lines.findIndex((line) =>
      line.startsWith('Video Speed Controller 把网页里的视频'),
    );
    expect(descStart, '找不到详细描述正文的起点').toBeGreaterThan(-1);
    const descEnd = lines.findIndex(
      (line, index) => index > descStart && line.startsWith('**Category**'),
    );
    expect(descEnd, '找不到详细描述正文的终点（**Category** 那行不见了？）').toBeGreaterThan(descStart);
    const description = lines.slice(descStart, descEnd);

    // Version History 的两个代码块（中文段与英文段）。
    const versionHistory = extractVersionHistoryBlocks(storeDoc);

    const offenders: string[] = [];
    description.forEach((line, index) => {
      if (line.includes('**')) {
        offenders.push(`详细描述 第 ${descStart + index + 1} 行: ${line.trim().slice(0, 60)}`);
      }
    });
    versionHistory.forEach((block, index) => {
      block.split('\n').forEach((line, lineIndex) => {
        if (line.includes('**')) {
          offenders.push(`Version History 第 ${index + 1} 段 第 ${lineIndex + 1} 行: ${line.trim().slice(0, 60)}`);
        }
      });
    });

    expect(
      offenders,
      `要贴进商店的正文里出现了 markdown 星号：\n${offenders.join('\n')}\n` +
        'CWS 会剥离 markdown —— 用户会看到字面的星号。',
    ).toEqual([]);
  });

  it('商店正文里没有绝对化表述（CWS 拒审清单上的词）', () => {
    // 「any web video」这类说法在 CWS 的拒审清单上 ——
    // 它会被读成「支持所有网站」，而扩展的实际能力是「控制你正在看的那个视频」。
    //
    // ⚠️ 6.0.8 的 manifest description 里就带着 `for any HTML5 video` ——
    // 那句话**现在还在线上**。6.2.0 把它换成了本地化版本（不含 any），
    // 所以这条守的是「别让它回来」。
    const manifest = JSON.parse(
      readFileSync(resolve(repoRoot, 'manifest.json'), 'utf8'),
    ) as { description?: string };

    // manifest 的 description 是 `__MSG_xxx__` 时，实际文案在 _locales 里。
    const description = manifest.description ?? '';
    const localeMessage = description.startsWith('__MSG_')
      ? readLocaleMessage(description)
      : description;

    expect(
      /\bany\b/i.test(localeMessage),
      `扩展的商店描述里出现了 "any"：${localeMessage}\n` +
        'CWS 的拒审清单上绝对化表述（如 "any web video"）是一票否决项。',
    ).toBe(false);
  });

  it('隐私政策里没有绝对化表述（它是商店直接链接的页面，审核员会点开看）', () => {
    // ⚠️ 为什么隐私政策也要守：
    // 它不是「我们自己写的说明」，而是**商店 listing 里那个链接指向的页面** ——
    // 审核员点进去就会看到。而它同时也是给**用户**看的。
    //
    // 2026-10-22 实测：PRIVACY.md 里有两处
    // 「在**任意**网站上的视频上工作」/「work on **any** video」——
    // 与已经从 manifest description 与 Single Purpose 里删掉的 `any` 同一个毛病，
    // 只是这个页面当时没跟上。
    //
    // ⚠️ 判据只查**绝对化**的那两处，不是「全文不许有 any」——
    // 「does not collect, transmit, or share any user data」里的 `any`
    // 是正常用法（否定句），删掉反而读不通。
    const privacy = readFileSync(resolve(repoRoot, 'PRIVACY.md'), 'utf8');

    // 英文侧：work on **any** video / any video
    expect(
      /work(?:s)? on\s+\*{0,2}any\*{0,2}\s+(?:web\s+)?video/i.test(privacy),
      '隐私政策里仍有「work on any video」这类绝对化表述',
    ).toBe(false);

    // 中文侧：在**任意**网站上的视频上工作
    expect(
      /在\*{0,2}任意\*{0,2}网站/.test(privacy),
      '隐私政策里仍有「在任意网站上」这类绝对化表述',
    ).toBe(false);
  });
});

/**
 * 取出 Version History 那一栏里「要贴进 Dashboard 的两段」。
 *
 * ⚠️ **只取前两个**代码块 —— 那一节后面还有别的 ``` 块
 * （「提交前自检」之类的内部记录），那些**不该被贴出去**，
 * 里面带 `**Published**`、`**复核发现那是假的**` 这类给维护者看的标记。
 *
 * 取「前两个」而不是「按位置猜」：文件里明写着
 * 「贴进 Dashboard 用这一段」，紧接着就是中文块与英文块。
 */
const extractVersionHistoryBlocks = (doc: string): string[] => {
  const section = doc.slice(doc.indexOf('## Version History'));
  const blocks: string[] = [];
  const pattern = /```\n([\s\S]*?)```/g;
  let match = pattern.exec(section);
  while (match && blocks.length < 2) {
    blocks.push(match[1]);
    match = pattern.exec(section);
  }
  return blocks;
};

/** 从 `_locales/<locale>/messages.json` 里取 `__MSG_key__` 对应的文案。 */
const readLocaleMessage = (description: string): string => {
  const key = description.slice('__MSG_'.length, -2);
  const messages = JSON.parse(
    readFileSync(resolve(repoRoot, '_locales', 'en', 'messages.json'), 'utf8'),
  ) as Record<string, { message?: string }>;
  return messages[key]?.message ?? description;
};
