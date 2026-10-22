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

execFileSync(
  'zip',
  ['-r', outputPath, '.', '-x', '__MACOSX/*'],
  { cwd: distDir, stdio: 'inherit' },
);

console.log(`Extension package created: ${outputPath}`);
