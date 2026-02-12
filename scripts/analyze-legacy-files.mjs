#!/usr/bin/env node

/**
 * 旧代码文件分析脚本
 *
 * 此脚本用于：
 * 1. 扫描 src/ 目录下的所有旧版 JavaScript 文件
 * 2. 识别旧的配置和页面文件
 * 3. 生成详细的文件清单
 * 4. 分析文件大小和行数
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

/**
 * 递归扫描目录获取所有文件
 */
function scanDirectory(dir, baseDir = dir) {
  const files = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(baseDir, fullPath);

      if (entry.isDirectory()) {
        files.push(...scanDirectory(fullPath, baseDir));
      } else if (entry.isFile()) {
        files.push(relativePath);
      }
    }
  } catch (error) {
    console.error(`扫描目录失败 ${dir}:`, error.message);
  }

  return files;
}

/**
 * 获取文件统计信息
 */
function getFileStats(filePath) {
  try {
    const stats = fs.statSync(filePath);
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').length;

    return {
      size: stats.size,
      lines: lines,
      lastModified: stats.mtime
    };
  } catch (error) {
    return {
      size: 0,
      lines: 0,
      lastModified: null,
      error: error.message
    };
  }
}

/**
 * 格式化文件大小
 */
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * 分析旧代码文件
 */
function analyzeLegacyFiles() {
  console.log('🔍 开始分析旧代码文件...\n');

  const analysis = {
    sourceFiles: [],
    configFiles: [],
    testFiles: [],
    styleFiles: [],
    otherFiles: [],
    totalSize: 0,
    totalLines: 0
  };

  // 1. 扫描 src/ 目录
  const srcDir = path.join(projectRoot, 'src');
  if (fs.existsSync(srcDir)) {
    console.log('📁 扫描 src/ 目录...');
    const srcFiles = scanDirectory(srcDir, projectRoot);

    for (const file of srcFiles) {
      const fullPath = path.join(projectRoot, file);
      const stats = getFileStats(fullPath);
      const ext = path.extname(file);

      const fileInfo = {
        path: file,
        size: stats.size,
        lines: stats.lines,
        lastModified: stats.lastModified,
        formattedSize: formatSize(stats.size)
      };

      analysis.totalSize += stats.size;
      analysis.totalLines += stats.lines;

      if (ext === '.js') {
        analysis.sourceFiles.push(fileInfo);
      } else if (ext === '.css') {
        analysis.styleFiles.push(fileInfo);
      } else {
        analysis.otherFiles.push(fileInfo);
      }
    }
  }

  // 2. 检查旧的配置和页面文件
  const legacyFiles = [
    'options-new.html',
    'options-new.js',
    'background.js',
    'style.css'
  ];

  console.log('📁 检查旧的配置和页面文件...');
  for (const file of legacyFiles) {
    const fullPath = path.join(projectRoot, file);
    if (fs.existsSync(fullPath)) {
      const stats = getFileStats(fullPath);
      const ext = path.extname(file);

      const fileInfo = {
        path: file,
        size: stats.size,
        lines: stats.lines,
        lastModified: stats.lastModified,
        formattedSize: formatSize(stats.size)
      };

      analysis.totalSize += stats.size;
      analysis.totalLines += stats.lines;

      if (ext === '.js') {
        analysis.configFiles.push(fileInfo);
      } else if (ext === '.html' || ext === '.css') {
        analysis.configFiles.push(fileInfo);
      }
    }
  }

  // 3. 扫描旧的测试文件
  const testsDir = path.join(projectRoot, 'tests');
  if (fs.existsSync(testsDir)) {
    console.log('📁 扫描 tests/ 目录...');
    const testFiles = scanDirectory(testsDir, projectRoot);

    for (const file of testFiles) {
      const fullPath = path.join(projectRoot, file);
      const stats = getFileStats(fullPath);

      const fileInfo = {
        path: file,
        size: stats.size,
        lines: stats.lines,
        lastModified: stats.lastModified,
        formattedSize: formatSize(stats.size)
      };

      analysis.totalSize += stats.size;
      analysis.totalLines += stats.lines;
      analysis.testFiles.push(fileInfo);
    }
  }

  return analysis;
}

/**
 * 生成分析报告
 */
function generateReport(analysis) {
  console.log('\n📊 分析结果：\n');
  console.log('='.repeat(80));

  // 源代码文件
  if (analysis.sourceFiles.length > 0) {
    console.log('\n📄 源代码文件 (src/):');
    console.log('-'.repeat(80));
    for (const file of analysis.sourceFiles) {
      console.log(`  ${file.path}`);
      console.log(`    大小: ${file.formattedSize} | 行数: ${file.lines}`);
    }
    console.log(`  总计: ${analysis.sourceFiles.length} 个文件`);
  }

  // 样式文件
  if (analysis.styleFiles.length > 0) {
    console.log('\n🎨 样式文件 (src/):');
    console.log('-'.repeat(80));
    for (const file of analysis.styleFiles) {
      console.log(`  ${file.path}`);
      console.log(`    大小: ${file.formattedSize} | 行数: ${file.lines}`);
    }
    console.log(`  总计: ${analysis.styleFiles.length} 个文件`);
  }

  // 配置和页面文件
  if (analysis.configFiles.length > 0) {
    console.log('\n⚙️  配置和页面文件:');
    console.log('-'.repeat(80));
    for (const file of analysis.configFiles) {
      console.log(`  ${file.path}`);
      console.log(`    大小: ${file.formattedSize} | 行数: ${file.lines}`);
    }
    console.log(`  总计: ${analysis.configFiles.length} 个文件`);
  }

  // 测试文件
  if (analysis.testFiles.length > 0) {
    console.log('\n🧪 测试文件 (tests/):');
    console.log('-'.repeat(80));
    for (const file of analysis.testFiles) {
      console.log(`  ${file.path}`);
      console.log(`    大小: ${file.formattedSize} | 行数: ${file.lines}`);
    }
    console.log(`  总计: ${analysis.testFiles.length} 个文件`);
  }

  // 其他文件
  if (analysis.otherFiles.length > 0) {
    console.log('\n📦 其他文件:');
    console.log('-'.repeat(80));
    for (const file of analysis.otherFiles) {
      console.log(`  ${file.path}`);
      console.log(`    大小: ${file.formattedSize} | 行数: ${file.lines}`);
    }
    console.log(`  总计: ${analysis.otherFiles.length} 个文件`);
  }

  // 总计
  console.log('\n' + '='.repeat(80));
  console.log('📈 总计统计:');
  console.log(`  总文件数: ${
    analysis.sourceFiles.length +
    analysis.styleFiles.length +
    analysis.configFiles.length +
    analysis.testFiles.length +
    analysis.otherFiles.length
  }`);
  console.log(`  总大小: ${formatSize(analysis.totalSize)}`);
  console.log(`  总行数: ${analysis.totalLines.toLocaleString()}`);
  console.log('='.repeat(80));
}

/**
 * 保存分析结果到 JSON 文件
 */
function saveAnalysisToFile(analysis) {
  const outputPath = path.join(projectRoot, 'legacy-files-analysis.json');

  try {
    fs.writeFileSync(outputPath, JSON.stringify(analysis, null, 2), 'utf-8');
    console.log(`\n✅ 分析结果已保存到: ${outputPath}`);
  } catch (error) {
    console.error(`\n❌ 保存分析结果失败:`, error.message);
  }
}

// 主函数
function main() {
  console.log('🚀 旧代码文件分析工具\n');

  const analysis = analyzeLegacyFiles();
  generateReport(analysis);
  saveAnalysisToFile(analysis);

  console.log('\n✨ 分析完成！\n');
}

main();
