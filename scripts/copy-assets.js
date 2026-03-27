import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const rootDir = resolve(dirname(__filename), '..');

const distDir = resolve(rootDir, 'dist');

// 确保目录存在
if (!existsSync(resolve(distDir, 'icons'))) {
  mkdirSync(resolve(distDir, 'icons'), { recursive: true });
}
if (!existsSync(resolve(distDir, '_locales', 'en'))) {
  mkdirSync(resolve(distDir, '_locales', 'en'), { recursive: true });
}
if (!existsSync(resolve(distDir, '_locales', 'zh_CN'))) {
  mkdirSync(resolve(distDir, '_locales', 'zh_CN'), { recursive: true });
}

// 复制 manifest.json
copyFileSync(resolve(rootDir, 'manifest.json'), resolve(distDir, 'manifest.json'));

// 复制 content script bootstrap
if (existsSync(resolve(rootDir, 'content-loader.js'))) {
  copyFileSync(resolve(rootDir, 'content-loader.js'), resolve(distDir, 'content-loader.js'));
}

// 复制 icons
if (existsSync(resolve(rootDir, 'icons', 'icon16.png'))) {
  copyFileSync(resolve(rootDir, 'icons', 'icon16.png'), resolve(distDir, 'icons', 'icon16.png'));
}
if (existsSync(resolve(rootDir, 'icons', 'icon48.png'))) {
  copyFileSync(resolve(rootDir, 'icons', 'icon48.png'), resolve(distDir, 'icons', 'icon48.png'));
}
if (existsSync(resolve(rootDir, 'icons', 'icon128.png'))) {
  copyFileSync(resolve(rootDir, 'icons', 'icon128.png'), resolve(distDir, 'icons', 'icon128.png'));
}

// 复制 _locales
if (existsSync(resolve(rootDir, '_locales', 'en', 'messages.json'))) {
  copyFileSync(resolve(rootDir, '_locales', 'en', 'messages.json'), resolve(distDir, '_locales', 'en', 'messages.json'));
}
if (existsSync(resolve(rootDir, '_locales', 'zh_CN', 'messages.json'))) {
  copyFileSync(resolve(rootDir, '_locales', 'zh_CN', 'messages.json'), resolve(distDir, '_locales', 'zh_CN', 'messages.json'));
}

console.log('Assets copied successfully!');
