import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'fs';
import { dirname, resolve } from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const rootDir = resolve(dirname(__filename), '..');
const distDir = resolve(rootDir, 'dist');
const releaseDir = resolve(rootDir, 'release');

/**
 * 产物里唯一允许出现的外部主机 —— 本项目自己的 GitHub 仓库。
 *
 * 为什么出包时要查这一下：
 * README 与商店文案都写着「不发起任何网络请求」「产物里没有第三方库」。
 * 那两句话对**用户**是信任，对**审核员**是承诺。
 * 而构建产物是唯一会被上传的东西 —— 它里出现了 CDN、远程字体、统计端点，
 * 就说明承诺已经作废了，而且用户解包就能看到。
 *
 * ⚠️ 这里查的是**产物**，比源码那道守卫（scripts/release-content.test.ts）
 * 更靠后一层：构建工具自己注入的东西（preload helper 之类）也在里面。
 */
const OWN_REPO_URL = 'https://github.com/hibernate-pano/chrome-plugin-video-manager';

const listFiles = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const entryPath = resolve(dir, entry);
    if (statSync(entryPath).isDirectory()) {
      out.push(...listFiles(entryPath));
      continue;
    }
    out.push(entryPath);
  }
  return out;
};

/** 出包前的最后一道闸：产物里不许出现本仓库之外的 URL。 */
const assertNoForeignUrls = () => {
  const offenders = [];

  for (const file of listFiles(distDir)) {
    if (!/\.(js|css|html|json)$/.test(file)) continue;

    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/https?:\/\/[^\s'"`)\\]+/g)) {
      const url = match[0];
      if (url.startsWith(OWN_REPO_URL)) continue;
      offenders.push(`${file.replace(`${rootDir}/`, '')} → ${url}`);
    }
  }

  if (offenders.length > 0) {
    throw new Error(
      '产物里出现了本仓库之外的 URL ——「不发起任何网络请求」这句承诺已经不成立：\n' +
        `${offenders.join('\n')}\n\n` +
        '要么去掉它，要么把 README 与 CHROMEWEBSTORE.md 里的承诺一起改掉。',
    );
  }
};

/**
 * 出包前的第二道闸：产物里不许出现**网络 API**。
 *
 * ⚠️ 为什么这道闸是 2026-10-22 才加的：
 * 之前只有 `assertNoForeignUrls()`，它查的是「URL 指向哪里」，
 * **查不出「代码会不会自己发起请求」**。
 * 于是一段 Vite 注入的 modulepreload polyfill（里面有 `fetch(s.href)`）
 * 从那道闸里溜了过去 —— 而 README 与商店文案都写着「不发起任何网络请求」，
 * 商店文案甚至邀请用户「解压就能验证」。
 *
 * 那段 polyfill 运行时其实是死代码（Chrome 原生支持 modulepreload，
 * polyfill 第一件事就是「不支持就 return」），但**承诺的对象是产物**：
 * 用户 grep 得到 `fetch(`，审核员 grep 也得到 `fetch(`。
 *
 * ⚠️ 为什么这里不放过 `fetch`：
 * 产物里的 `fetch` 有两种可能 —— 一是死代码，二是**真的在用**。
 * 两者对用户没有区别：承诺是「不发网络请求」，
 * 而「一段永不执行的 fetch」和「一段会执行的 fetch」在**审计**上无法区分。
 * 所以规则简单到底：**产物里不许有网络 API**，除非先改文案。
 *
 * 例外只有一个：动态 `import()` —— 那是加载扩展**自己**的模块，
 * 不是网络请求（content-loader.js 就靠它加载 content.js）。
 */
const assertNoNetworkApis = () => {
  const forbidden = [
    { name: 'fetch()', pattern: /(?<![.\w])fetch\s*\(/ },
    { name: 'XMLHttpRequest', pattern: /(?<![.\w])new\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(/ },
    { name: 'WebSocket', pattern: /(?<![.\w])new\s+WebSocket\b/ },
    { name: 'sendBeacon', pattern: /(?<![.\w])sendBeacon\s*\(/ },
    { name: 'EventSource', pattern: /(?<![.\w])new\s+EventSource\b/ },
    { name: 'importScripts', pattern: /(?<![.\w])importScripts\s*\(/ },
    { name: 'eval()', pattern: /(?<![.\w])eval\s*\(/ },
    { name: 'new Function()', pattern: /(?<![.\w])new\s+Function\s*\(/ },
  ];

  const offenders = [];

  for (const file of listFiles(distDir)) {
    if (!/\.(js|css|html|json)$/.test(file)) continue;

    const text = readFileSync(file, 'utf8');
    for (const { name, pattern } of forbidden) {
      if (pattern.test(text)) {
        offenders.push(`${file.replace(`${rootDir}/`, '')} → ${name}`);
      }
    }
  }

  if (offenders.length > 0) {
    throw new Error(
      '产物里出现了网络 API 或动态代码执行 ——' +
        '「不发起任何网络请求」这句承诺已经不成立：\n' +
        `${offenders.join('\n')}\n\n` +
        '（产物是构建工具生成的，构建工具注入的东西也在里面 —— ' +
        '那种情况要改构建配置，不是改产物。' +
        '参考 vite.config.js 的 modulePreload.polyfill。）',
    );
  }
};

const removeJunkFiles = (targetDir) => {
  for (const entry of readdirSync(targetDir)) {
    const entryPath = resolve(targetDir, entry);
    const stats = statSync(entryPath);

    if (stats.isDirectory()) {
      removeJunkFiles(entryPath);
      continue;
    }

    if (entry === '.DS_Store') {
      rmSync(entryPath, { force: true });
    }
  }
};

if (!existsSync(resolve(distDir, 'manifest.json'))) {
  throw new Error('dist/manifest.json is missing. Run pnpm build first.');
}

removeJunkFiles(distDir);

if (!existsSync(releaseDir)) {
  mkdirSync(releaseDir, { recursive: true });
}

const manifest = JSON.parse(readFileSync(resolve(distDir, 'manifest.json'), 'utf8'));
const version = manifest.version ?? '0.0.0';
const outputPath = resolve(releaseDir, `video-speed-controller-v${version}.zip`);

rmSync(outputPath, { force: true });

assertNoForeignUrls();
assertNoNetworkApis();

execFileSync(
  'zip',
  ['-r', outputPath, '.', '-x', '__MACOSX/*'],
  { cwd: distDir, stdio: 'inherit' },
);

console.log(`Extension package created: ${outputPath}`);
