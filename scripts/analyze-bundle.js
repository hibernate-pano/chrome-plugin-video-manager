#!/usr/bin/env node

/**
 * 包大小分析脚本
 * 分析构建产物的大小并生成报告
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const distDir = join(__dirname, '../dist');

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getColorForSize(sizeKB, type) {
  if (type === 'js') {
    if (sizeKB > 200) return colors.red;
    if (sizeKB > 100) return colors.yellow;
    return colors.green;
  }
  if (type === 'css') {
    if (sizeKB > 50) return colors.red;
    if (sizeKB > 30) return colors.yellow;
    return colors.green;
  }
  return colors.reset;
}

function analyzeDirectory(dir, prefix = '') {
  const files = readdirSync(dir);
  const results = {
    js: [],
    css: [],
    other: [],
    totalSize: 0,
  };

  for (const file of files) {
    const filePath = join(dir, file);
    const stat = statSync(filePath);

    if (stat.isDirectory()) {
      const subResults = analyzeDirectory(filePath, prefix + file + '/');
      results.js.push(...subResults.js);
      results.css.push(...subResults.css);
      results.other.push(...subResults.other);
      results.totalSize += subResults.totalSize;
    } else {
      const ext = extname(file);
      const size = stat.size;
      const sizeKB = size / 1024;
      const fileInfo = {
        name: prefix + file,
        size,
        sizeKB,
        formatted: formatBytes(size),
      };

      results.totalSize += size;

      if (ext === '.js') {
        results.js.push(fileInfo);
      } else if (ext === '.css') {
        results.css.push(fileInfo);
      } else {
        results.other.push(fileInfo);
      }
    }
  }

  return results;
}

function printReport(results) {
  console.log('\n' + colors.cyan + '='.repeat(80) + colors.reset);
  console.log(colors.cyan + '📦 包大小分析报告' + colors.reset);
  console.log(colors.cyan + '='.repeat(80) + colors.reset + '\n');

  // JavaScript 文件
  if (results.js.length > 0) {
    console.log(colors.blue + '📄 JavaScript 文件:' + colors.reset);
    results.js
      .sort((a, b) => b.size - a.size)
      .forEach((file) => {
        const color = getColorForSize(file.sizeKB, 'js');
        console.log(
          `  ${color}${file.formatted.padEnd(12)}${colors.reset} ${file.name}`
        );
      });
    const totalJS = results.js.reduce((sum, f) => sum + f.size, 0);
    console.log(
      `  ${colors.magenta}总计: ${formatBytes(totalJS)}${colors.reset}\n`
    );
  }

  // CSS 文件
  if (results.css.length > 0) {
    console.log(colors.blue + '🎨 CSS 文件:' + colors.reset);
    results.css
      .sort((a, b) => b.size - a.size)
      .forEach((file) => {
        const color = getColorForSize(file.sizeKB, 'css');
        console.log(
          `  ${color}${file.formatted.padEnd(12)}${colors.reset} ${file.name}`
        );
      });
    const totalCSS = results.css.reduce((sum, f) => sum + f.size, 0);
    console.log(
      `  ${colors.magenta}总计: ${formatBytes(totalCSS)}${colors.reset}\n`
    );
  }

  // 总大小
  console.log(colors.cyan + '='.repeat(80) + colors.reset);
  console.log(
    colors.cyan +
      `📊 总大小: ${formatBytes(results.totalSize)}` +
      colors.reset
  );
  console.log(colors.cyan + '='.repeat(80) + colors.reset + '\n');

  // 警告
  const largeJS = results.js.filter((f) => f.sizeKB > 200);
  const largeCSS = results.css.filter((f) => f.sizeKB > 50);

  if (largeJS.length > 0 || largeCSS.length > 0) {
    console.log(colors.yellow + '⚠️  警告:' + colors.reset);
    if (largeJS.length > 0) {
      console.log(
        colors.yellow +
          `  - ${largeJS.length} 个 JS 文件超过 200KB` +
          colors.reset
      );
    }
    if (largeCSS.length > 0) {
      console.log(
        colors.yellow +
          `  - ${largeCSS.length} 个 CSS 文件超过 50KB` +
          colors.reset
      );
    }
    console.log();
  }

  // 建议
  console.log(colors.green + '💡 优化建议:' + colors.reset);
  console.log(colors.green + '  - 使用动态导入 (dynamic import) 进行代码分割' + colors.reset);
  console.log(colors.green + '  - 检查是否有未使用的依赖' + colors.reset);
  console.log(colors.green + '  - 使用 Tree shaking 移除未使用的代码' + colors.reset);
  console.log(colors.green + '  - 优化 Tailwind CSS 配置以减少 CSS 大小' + colors.reset);
  console.log();
}

// 主函数
try {
  console.log(colors.cyan + '正在分析构建产物...' + colors.reset);
  const results = analyzeDirectory(distDir);
  printReport(results);
} catch (error) {
  console.error(colors.red + '错误: ' + error.message + colors.reset);
  process.exit(1);
}
