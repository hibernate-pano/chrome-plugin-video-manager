import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'fs';
import { dirname, resolve } from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const rootDir = resolve(dirname(__filename), '..');
const distDir = resolve(rootDir, 'dist');
const releaseDir = resolve(rootDir, 'release');

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

execFileSync(
  'zip',
  ['-r', outputPath, '.', '-x', '__MACOSX/*'],
  { cwd: distDir, stdio: 'inherit' },
);

console.log(`Extension package created: ${outputPath}`);
