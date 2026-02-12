#!/usr/bin/env node

/**
 * 构建产物验证脚本
 *
 * 此脚本验证 src-react/dist/ 目录中的所有必需文件是否存在
 * 用于在加载扩展到浏览器之前进行快速检查
 */

import { existsSync, statSync, readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const distDir = join(projectRoot, 'src-react', 'dist');

// ANSI 颜色代码
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

// 必需的文件列表
const requiredFiles = [
  // 核心文件
  'manifest.json',
  'options.html',
  'service-worker-loader.js',

  // 图标文件
  'icons/icon16.png',
  'icons/icon48.png',
  'icons/icon128.png',

  // 内容脚本样式
  'content/styles/index.css',

  // 国际化文件
  '_locales/en/messages.json',
  '_locales/zh_CN/messages.json',
];

// 必需的目录
const requiredDirs = [
  'assets',
  'icons',
  'content',
  'content/styles',
  '_locales',
  '_locales/en',
  '_locales/zh_CN',
];

let hasErrors = false;
let hasWarnings = false;

/**
 * 打印带颜色的消息
 */
function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * 检查文件是否存在
 */
function checkFile(filePath, description) {
  const fullPath = join(distDir, filePath);
  const exists = existsSync(fullPath);

  if (exists) {
    const stats = statSync(fullPath);
    const sizeKB = (stats.size / 1024).toFixed(2);
    log(`  ✓ ${description}: ${filePath} (${sizeKB} KB)`, 'green');
    return true;
  } else {
    log(`  ✗ ${description}: ${filePath} - 文件不存在`, 'red');
    hasErrors = true;
    return false;
  }
}

/**
 * 检查目录是否存在
 */
function checkDir(dirPath, description) {
  const fullPath = join(distDir, dirPath);
  const exists = existsSync(fullPath);

  if (exists && statSync(fullPath).isDirectory()) {
    log(`  ✓ ${description}: ${dirPath}`, 'green');
    return true;
  } else {
    log(`  ✗ ${description}: ${dirPath} - 目录不存在`, 'red');
    hasErrors = true;
    return false;
  }
}

/**
 * 验证 manifest.json 内容
 */
function validateManifest() {
  const manifestPath = join(distDir, 'manifest.json');

  if (!existsSync(manifestPath)) {
    log('  ✗ manifest.json 不存在', 'red');
    hasErrors = true;
    return;
  }

  try {
    const manifestContent = readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestContent);

    // 检查必需字段
    const requiredFields = [
      'manifest_version',
      'name',
      'version',
      'description',
      'icons',
      'content_scripts',
      'permissions',
    ];

    let allFieldsPresent = true;
    for (const field of requiredFields) {
      if (!manifest[field]) {
        log(`  ✗ manifest.json 缺少必需字段: ${field}`, 'red');
        hasErrors = true;
        allFieldsPresent = false;
      }
    }

    if (allFieldsPresent) {
      log(`  ✓ manifest.json 包含所有必需字段`, 'green');
    }

    // 检查版本号
    if (manifest.version) {
      log(`  ℹ 版本号: ${manifest.version}`, 'cyan');
    }

    // 检查 manifest_version
    if (manifest.manifest_version === 3) {
      log(`  ✓ 使用 Manifest V3`, 'green');
    } else {
      log(`  ⚠ 使用 Manifest V${manifest.manifest_version}（推荐使用 V3）`, 'yellow');
      hasWarnings = true;
    }

    // 检查内容脚本配置
    if (manifest.content_scripts && manifest.content_scripts.length > 0) {
      const contentScript = manifest.content_scripts[0];
      if (contentScript.js && contentScript.js.length > 0) {
        log(`  ✓ 内容脚本已配置: ${contentScript.js.length} 个文件`, 'green');
      } else {
        log(`  ✗ 内容脚本未配置 JS 文件`, 'red');
        hasErrors = true;
      }
    } else {
      log(`  ✗ 未配置内容脚本`, 'red');
      hasErrors = true;
    }

  } catch (error) {
    log(`  ✗ manifest.json 解析失败: ${error.message}`, 'red');
    hasErrors = true;
  }
}

/**
 * 检查 assets 目录中的文件
 */
function checkAssets() {
  const assetsDir = join(distDir, 'assets');

  if (!existsSync(assetsDir)) {
    log('  ✗ assets 目录不存在', 'red');
    hasErrors = true;
    return;
  }

  try {
    const files = readdirSync(assetsDir);

    // 检查是否有 JS 文件
    const jsFiles = files.filter(f => f.endsWith('.js'));
    const cssFiles = files.filter(f => f.endsWith('.css'));

    if (jsFiles.length > 0) {
      log(`  ✓ 找到 ${jsFiles.length} 个 JS 文件`, 'green');
    } else {
      log(`  ✗ assets 目录中没有 JS 文件`, 'red');
      hasErrors = true;
    }

    if (cssFiles.length > 0) {
      log(`  ✓ 找到 ${cssFiles.length} 个 CSS 文件`, 'green');
    } else {
      log(`  ⚠ assets 目录中没有 CSS 文件`, 'yellow');
      hasWarnings = true;
    }

    // 计算总大小
    let totalSize = 0;
    for (const file of files) {
      const filePath = join(assetsDir, file);
      const stats = statSync(filePath);
      totalSize += stats.size;
    }

    const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2);
    log(`  ℹ assets 总大小: ${totalSizeMB} MB`, 'cyan');

    if (totalSize > 5 * 1024 * 1024) {
      log(`  ⚠ assets 大小超过 5 MB，可能影响加载性能`, 'yellow');
      hasWarnings = true;
    }

  } catch (error) {
    log(`  ✗ 检查 assets 目录失败: ${error.message}`, 'red');
    hasErrors = true;
  }
}

/**
 * 主验证函数
 */
function main() {
  log('\n=== 构建产物验证 ===\n', 'blue');

  // 检查 dist 目录是否存在
  if (!existsSync(distDir)) {
    log('✗ dist 目录不存在！', 'red');
    log('\n请先运行构建命令:', 'yellow');
    log('  cd src-react', 'cyan');
    log('  pnpm run build', 'cyan');
    process.exit(1);
  }

  log(`✓ dist 目录存在: ${distDir}\n`, 'green');

  // 检查必需的目录
  log('检查必需目录...', 'blue');
  for (const dir of requiredDirs) {
    checkDir(dir, '目录');
  }

  // 检查必需的文件
  log('\n检查必需文件...', 'blue');
  for (const file of requiredFiles) {
    checkFile(file, '文件');
  }

  // 验证 manifest.json
  log('\n验证 manifest.json...', 'blue');
  validateManifest();

  // 检查 assets 目录
  log('\n检查 assets 目录...', 'blue');
  checkAssets();

  // 输出总结
  log('\n=== 验证总结 ===\n', 'blue');

  if (hasErrors) {
    log('✗ 验证失败！发现错误。', 'red');
    log('\n请修复上述错误后重新构建。', 'yellow');
    process.exit(1);
  } else if (hasWarnings) {
    log('⚠ 验证通过，但有警告。', 'yellow');
    log('\n扩展可以加载，但建议检查警告项。', 'cyan');
    process.exit(0);
  } else {
    log('✓ 验证通过！所有必需文件都存在。', 'green');
    log('\n你可以在 Chrome 中加载扩展了：', 'cyan');
    log('  1. 访问 chrome://extensions/', 'cyan');
    log('  2. 启用"开发者模式"', 'cyan');
    log('  3. 点击"加载已解压的扩展程序"', 'cyan');
    log(`  4. 选择目录: ${distDir}`, 'cyan');
    log('\n详细步骤请参考: scripts/load-extension-guide.md', 'blue');
    process.exit(0);
  }
}

// 运行验证
main();
