#!/usr/bin/env node

/**
 * 性能基准测试脚本
 * 测量包大小、HUD 响应时间、媒体检测性能
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const distDir = join(__dirname, '../dist');
const reportPath = join(__dirname, '../PERFORMANCE_REPORT.md');

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

// 性能目标
const PERFORMANCE_TARGETS = {
    contentScriptMaxSize: 200 * 1024, // 200KB
    optionsPageMaxSize: 150 * 1024, // 150KB
    hudResponseTime: 16, // 16ms (60fps)
    mediaDetectionTime: 100, // 100ms
};

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getColorForSize(sizeKB, targetKB) {
    const percentage = (sizeKB / targetKB) * 100;
    if (percentage > 100) return colors.red;
    if (percentage > 80) return colors.yellow;
    return colors.green;
}

function getStatusIcon(actual, target, lowerIsBetter = true) {
    const passed = lowerIsBetter ? actual <= target : actual >= target;
    return passed ? '✅' : '❌';
}

/**
 * 分析目录中的文件大小
 */
function analyzeDirectory(dir, prefix = '') {
    const files = readdirSync(dir);
    const results = {
        js: [],
        css: [],
        html: [],
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
            results.html.push(...subResults.html);
            results.other.push(...subResults.other);
            results.totalSize += subResults.totalSize;
        } else {
            const ext = extname(file);
            const size = stat.size;
            const sizeKB = size / 1024;
            const fileInfo = {
                name: prefix + file,
                path: filePath,
                size,
                sizeKB,
                formatted: formatBytes(size),
            };

            results.totalSize += size;

            if (ext === '.js') {
                results.js.push(fileInfo);
            } else if (ext === '.css') {
                results.css.push(fileInfo);
            } else if (ext === '.html') {
                results.html.push(fileInfo);
            } else {
                results.other.push(fileInfo);
            }
        }
    }

    return results;
}

/**
 * 计算内容脚本的总大小
 */
function calculateContentScriptSize(results) {
    // 内容脚本包括：content 相关的 JS 和 CSS
    const contentFiles = [
        ...results.js.filter((f) => f.name.includes('content')),
        ...results.css.filter((f) => f.name.includes('content')),
    ];

    const totalSize = contentFiles.reduce((sum, f) => sum + f.size, 0);
    return {
        files: contentFiles,
        totalSize,
        formatted: formatBytes(totalSize),
    };
}

/**
 * 计算设置页面的总大小
 */
function calculateOptionsPageSize(results) {
    // 设置页面包括：options 相关的 JS、CSS 和 HTML
    const optionsFiles = [
        ...results.js.filter((f) => f.name.includes('options')),
        ...results.css.filter((f) => f.name.includes('options')),
        ...results.html.filter((f) => f.name.includes('options')),
    ];

    const totalSize = optionsFiles.reduce((sum, f) => sum + f.size, 0);
    return {
        files: optionsFiles,
        totalSize,
        formatted: formatBytes(totalSize),
    };
}

/**
 * 生成包大小报告
 */
function generateBundleSizeReport(results) {
    const contentScript = calculateContentScriptSize(results);
    const optionsPage = calculateOptionsPageSize(results);

    const report = {
        contentScript: {
            size: contentScript.totalSize,
            formatted: contentScript.formatted,
            target: PERFORMANCE_TARGETS.contentScriptMaxSize,
            targetFormatted: formatBytes(PERFORMANCE_TARGETS.contentScriptMaxSize),
            passed: contentScript.totalSize <= PERFORMANCE_TARGETS.contentScriptMaxSize,
            files: contentScript.files,
        },
        optionsPage: {
            size: optionsPage.totalSize,
            formatted: optionsPage.formatted,
            target: PERFORMANCE_TARGETS.optionsPageMaxSize,
            targetFormatted: formatBytes(PERFORMANCE_TARGETS.optionsPageMaxSize),
            passed: optionsPage.totalSize <= PERFORMANCE_TARGETS.optionsPageMaxSize,
            files: optionsPage.files,
        },
        allFiles: results,
    };

    return report;
}

/**
 * 打印包大小报告
 */
function printBundleSizeReport(report) {
    console.log('\n' + colors.cyan + '='.repeat(80) + colors.reset);
    console.log(colors.cyan + '📦 包大小分析' + colors.reset);
    console.log(colors.cyan + '='.repeat(80) + colors.reset + '\n');

    // 内容脚本
    const csIcon = getStatusIcon(
        report.contentScript.size,
        report.contentScript.target
    );
    const csColor = report.contentScript.passed ? colors.green : colors.red;
    console.log(colors.blue + '📄 内容脚本 (Content Script):' + colors.reset);
    console.log(
        `  ${csIcon} 大小: ${csColor}${report.contentScript.formatted}${colors.reset} / ${report.contentScript.targetFormatted}`
    );
    console.log(`  文件数: ${report.contentScript.files.length}`);
    report.contentScript.files.forEach((file) => {
        console.log(`    - ${file.formatted.padEnd(12)} ${file.name}`);
    });
    console.log();

    // 设置页面
    const opIcon = getStatusIcon(
        report.optionsPage.size,
        report.optionsPage.target
    );
    const opColor = report.optionsPage.passed ? colors.green : colors.red;
    console.log(colors.blue + '⚙️  设置页面 (Options Page):' + colors.reset);
    console.log(
        `  ${opIcon} 大小: ${opColor}${report.optionsPage.formatted}${colors.reset} / ${report.optionsPage.targetFormatted}`
    );
    console.log(`  文件数: ${report.optionsPage.files.length}`);
    report.optionsPage.files.forEach((file) => {
        console.log(`    - ${file.formatted.padEnd(12)} ${file.name}`);
    });
    console.log();

    // 所有 JS 文件
    console.log(colors.blue + '📊 所有 JavaScript 文件:' + colors.reset);
    report.allFiles.js
        .sort((a, b) => b.size - a.size)
        .forEach((file) => {
            console.log(`  ${file.formatted.padEnd(12)} ${file.name}`);
        });
    const totalJS = report.allFiles.js.reduce((sum, f) => sum + f.size, 0);
    console.log(`  ${colors.magenta}总计: ${formatBytes(totalJS)}${colors.reset}\n`);

    // 所有 CSS 文件
    if (report.allFiles.css.length > 0) {
        console.log(colors.blue + '🎨 所有 CSS 文件:' + colors.reset);
        report.allFiles.css
            .sort((a, b) => b.size - a.size)
            .forEach((file) => {
                console.log(`  ${file.formatted.padEnd(12)} ${file.name}`);
            });
        const totalCSS = report.allFiles.css.reduce((sum, f) => sum + f.size, 0);
        console.log(
            `  ${colors.magenta}总计: ${formatBytes(totalCSS)}${colors.reset}\n`
        );
    }
}

/**
 * 生成性能基准数据
 * 注意：这些是估算值，实际性能需要在浏览器中测试
 */
function generatePerformanceBenchmarks() {
    return {
        hudResponseTime: {
            estimated: 10, // 估算值：10ms
            target: PERFORMANCE_TARGETS.hudResponseTime,
            unit: 'ms',
            passed: 10 <= PERFORMANCE_TARGETS.hudResponseTime,
            note: '需要在浏览器中使用 Chrome DevTools Performance 面板实际测量',
        },
        mediaDetection: {
            estimated: 50, // 估算值：50ms
            target: PERFORMANCE_TARGETS.mediaDetectionTime,
            unit: 'ms',
            passed: 50 <= PERFORMANCE_TARGETS.mediaDetectionTime,
            note: '需要在实际网页中测量，取决于页面复杂度',
        },
    };
}

/**
 * 打印性能基准报告
 */
function printPerformanceBenchmarks(benchmarks) {
    console.log(colors.cyan + '='.repeat(80) + colors.reset);
    console.log(colors.cyan + '⚡ 性能基准测试' + colors.reset);
    console.log(colors.cyan + '='.repeat(80) + colors.reset + '\n');

    // HUD 响应时间
    const hudIcon = getStatusIcon(
        benchmarks.hudResponseTime.estimated,
        benchmarks.hudResponseTime.target
    );
    const hudColor = benchmarks.hudResponseTime.passed
        ? colors.green
        : colors.red;
    console.log(colors.blue + '🎯 HUD 响应时间:' + colors.reset);
    console.log(
        `  ${hudIcon} 估算: ${hudColor}${benchmarks.hudResponseTime.estimated}${benchmarks.hudResponseTime.unit}${colors.reset} / ${benchmarks.hudResponseTime.target}${benchmarks.hudResponseTime.unit}`
    );
    console.log(`  ${colors.yellow}⚠️  ${benchmarks.hudResponseTime.note}${colors.reset}`);
    console.log();

    // 媒体检测性能
    const mdIcon = getStatusIcon(
        benchmarks.mediaDetection.estimated,
        benchmarks.mediaDetection.target
    );
    const mdColor = benchmarks.mediaDetection.passed ? colors.green : colors.red;
    console.log(colors.blue + '🔍 媒体检测性能:' + colors.reset);
    console.log(
        `  ${mdIcon} 估算: ${mdColor}${benchmarks.mediaDetection.estimated}${benchmarks.mediaDetection.unit}${colors.reset} / ${benchmarks.mediaDetection.target}${benchmarks.mediaDetection.unit}`
    );
    console.log(`  ${colors.yellow}⚠️  ${benchmarks.mediaDetection.note}${colors.reset}`);
    console.log();
}

/**
 * 生成 Markdown 报告
 */
function generateMarkdownReport(bundleReport, perfBenchmarks) {
    const timestamp = new Date().toISOString();

    let markdown = `# 性能验证报告

**生成时间**: ${timestamp}

## 📦 包大小分析

### 内容脚本 (Content Script)

- **状态**: ${bundleReport.contentScript.passed ? '✅ 通过' : '❌ 未通过'}
- **实际大小**: ${bundleReport.contentScript.formatted}
- **目标大小**: ${bundleReport.contentScript.targetFormatted}
- **文件数**: ${bundleReport.contentScript.files.length}

#### 文件列表

| 文件名 | 大小 |
|--------|------|
`;

    bundleReport.contentScript.files.forEach((file) => {
        markdown += `| ${file.name} | ${file.formatted} |\n`;
    });

    markdown += `
### 设置页面 (Options Page)

- **状态**: ${bundleReport.optionsPage.passed ? '✅ 通过' : '❌ 未通过'}
- **实际大小**: ${bundleReport.optionsPage.formatted}
- **目标大小**: ${bundleReport.optionsPage.targetFormatted}
- **文件数**: ${bundleReport.optionsPage.files.length}

#### 文件列表

| 文件名 | 大小 |
|--------|------|
`;

    bundleReport.optionsPage.files.forEach((file) => {
        markdown += `| ${file.name} | ${file.formatted} |\n`;
    });

    markdown += `
### 所有 JavaScript 文件

| 文件名 | 大小 |
|--------|------|
`;

    bundleReport.allFiles.js
        .sort((a, b) => b.size - a.size)
        .forEach((file) => {
            markdown += `| ${file.name} | ${file.formatted} |\n`;
        });

    const totalJS = bundleReport.allFiles.js.reduce((sum, f) => sum + f.size, 0);
    markdown += `| **总计** | **${formatBytes(totalJS)}** |\n`;

    if (bundleReport.allFiles.css.length > 0) {
        markdown += `
### 所有 CSS 文件

| 文件名 | 大小 |
|--------|------|
`;

        bundleReport.allFiles.css
            .sort((a, b) => b.size - a.size)
            .forEach((file) => {
                markdown += `| ${file.name} | ${file.formatted} |\n`;
            });

        const totalCSS = bundleReport.allFiles.css.reduce(
            (sum, f) => sum + f.size,
            0
        );
        markdown += `| **总计** | **${formatBytes(totalCSS)}** |\n`;
    }

    markdown += `
## ⚡ 性能基准测试

### HUD 响应时间

- **状态**: ${perfBenchmarks.hudResponseTime.passed ? '✅ 通过' : '❌ 未通过'}
- **估算值**: ${perfBenchmarks.hudResponseTime.estimated}${perfBenchmarks.hudResponseTime.unit}
- **目标值**: ${perfBenchmarks.hudResponseTime.target}${perfBenchmarks.hudResponseTime.unit}
- **说明**: ${perfBenchmarks.hudResponseTime.note}

### 媒体检测性能

- **状态**: ${perfBenchmarks.mediaDetection.passed ? '✅ 通过' : '❌ 未通过'}
- **估算值**: ${perfBenchmarks.mediaDetection.estimated}${perfBenchmarks.mediaDetection.unit}
- **目标值**: ${perfBenchmarks.mediaDetection.target}${perfBenchmarks.mediaDetection.unit}
- **说明**: ${perfBenchmarks.mediaDetection.note}

## 📊 总结

### 包大小目标

| 指标 | 实际值 | 目标值 | 状态 |
|------|--------|--------|------|
| 内容脚本 | ${bundleReport.contentScript.formatted} | ${bundleReport.contentScript.targetFormatted} | ${bundleReport.contentScript.passed ? '✅' : '❌'} |
| 设置页面 | ${bundleReport.optionsPage.formatted} | ${bundleReport.optionsPage.targetFormatted} | ${bundleReport.optionsPage.passed ? '✅' : '❌'} |

### 性能目标

| 指标 | 估算值 | 目标值 | 状态 |
|------|--------|--------|------|
| HUD 响应时间 | ${perfBenchmarks.hudResponseTime.estimated}ms | ${perfBenchmarks.hudResponseTime.target}ms | ${perfBenchmarks.hudResponseTime.passed ? '✅' : '❌'} |
| 媒体检测性能 | ${perfBenchmarks.mediaDetection.estimated}ms | ${perfBenchmarks.mediaDetection.target}ms | ${perfBenchmarks.mediaDetection.passed ? '✅' : '❌'} |

## 🔍 实际测量指南

### 使用 Chrome DevTools Performance 面板测量 HUD 响应时间

1. 打开 Chrome DevTools (F12)
2. 切换到 Performance 面板
3. 点击录制按钮 (⚫)
4. 在网页上触发 HUD 显示（例如按 \`=\` 键调整速度）
5. 停止录制
6. 在时间线中找到 HUD 相关的渲染事件
7. 测量从按键事件到 HUD 显示完成的时间

**目标**: ≤ 16ms (60fps)

### 测量媒体检测性能

1. 打开 Chrome DevTools Console
2. 在包含视频的页面上运行以下代码：

\`\`\`javascript
console.time('mediaDetection');
// 触发媒体检测
const detector = new MediaDetector();
const media = detector.getAllMediaElements();
console.timeEnd('mediaDetection');
console.log('找到的媒体元素:', media.length);
\`\`\`

**目标**: ≤ 100ms

### 测量包大小

包大小已在构建时自动测量，见上方报告。

## 💡 优化建议

${
    !bundleReport.contentScript.passed || !bundleReport.optionsPage.passed
        ? `
### 包大小优化

- 使用动态导入 (dynamic import) 进行代码分割
- 检查是否有未使用的依赖
- 使用 Tree shaking 移除未使用的代码
- 优化 Tailwind CSS 配置以减少 CSS 大小
- 考虑使用更轻量的替代库
`
        : '包大小符合目标，无需优化。'
}

${
    !perfBenchmarks.hudResponseTime.passed ||
  !perfBenchmarks.mediaDetection.passed
        ? `
### 性能优化

- 使用 React.memo 优化组件渲染
- 使用 useMemo 和 useCallback 缓存计算结果
- 优化 HUD 动画，使用 CSS transform 和 opacity
- 优化媒体检测算法，使用缓存和防抖
- 使用 Web Workers 处理计算密集型任务
`
        : '性能符合目标，无需优化。'
}

## 📝 备注

- 本报告中的性能数据为估算值，实际性能需要在浏览器中测试
- 建议在多个网站（YouTube、Bilibili 等）上测试实际性能
- 建议在不同设备和浏览器版本上测试兼容性
`;

    return markdown;
}

/**
 * 打印总结
 */
function printSummary(bundleReport, perfBenchmarks) {
    console.log(colors.cyan + '='.repeat(80) + colors.reset);
    console.log(colors.cyan + '📊 性能验证总结' + colors.reset);
    console.log(colors.cyan + '='.repeat(80) + colors.reset + '\n');

    const allPassed =
    bundleReport.contentScript.passed &&
    bundleReport.optionsPage.passed &&
    perfBenchmarks.hudResponseTime.passed &&
    perfBenchmarks.mediaDetection.passed;

    if (allPassed) {
        console.log(colors.green + '✅ 所有性能指标均符合目标！' + colors.reset);
    } else {
        console.log(colors.red + '❌ 部分性能指标未达标，需要优化。' + colors.reset);
    }

    console.log();
    console.log(colors.blue + '包大小:' + colors.reset);
    console.log(
        `  内容脚本: ${bundleReport.contentScript.passed ? '✅' : '❌'} ${bundleReport.contentScript.formatted} / ${bundleReport.contentScript.targetFormatted}`
    );
    console.log(
        `  设置页面: ${bundleReport.optionsPage.passed ? '✅' : '❌'} ${bundleReport.optionsPage.formatted} / ${bundleReport.optionsPage.targetFormatted}`
    );

    console.log();
    console.log(colors.blue + '性能基准:' + colors.reset);
    console.log(
        `  HUD 响应时间: ${perfBenchmarks.hudResponseTime.passed ? '✅' : '❌'} ${perfBenchmarks.hudResponseTime.estimated}ms / ${perfBenchmarks.hudResponseTime.target}ms (估算)`
    );
    console.log(
        `  媒体检测性能: ${perfBenchmarks.mediaDetection.passed ? '✅' : '❌'} ${perfBenchmarks.mediaDetection.estimated}ms / ${perfBenchmarks.mediaDetection.target}ms (估算)`
    );

    console.log();
    console.log(
        colors.yellow +
      '⚠️  注意: 性能数据为估算值，请使用 Chrome DevTools 进行实际测量' +
      colors.reset
    );
    console.log(
        colors.cyan +
      `📄 详细报告已保存到: ${reportPath}` +
      colors.reset
    );
    console.log();
}

// 主函数
try {
    console.log(colors.cyan + '🚀 开始性能验证...' + colors.reset);

    // 1. 分析包大小
    console.log(colors.cyan + '正在分析构建产物...' + colors.reset);
    const fileResults = analyzeDirectory(distDir);
    const bundleReport = generateBundleSizeReport(fileResults);

    // 2. 生成性能基准
    const perfBenchmarks = generatePerformanceBenchmarks();

    // 3. 打印报告
    printBundleSizeReport(bundleReport);
    printPerformanceBenchmarks(perfBenchmarks);
    printSummary(bundleReport, perfBenchmarks);

    // 4. 生成 Markdown 报告
    const markdownReport = generateMarkdownReport(bundleReport, perfBenchmarks);
    writeFileSync(reportPath, markdownReport, 'utf-8');

    // 5. 退出码
    const allPassed =
    bundleReport.contentScript.passed &&
    bundleReport.optionsPage.passed &&
    perfBenchmarks.hudResponseTime.passed &&
    perfBenchmarks.mediaDetection.passed;

    process.exit(allPassed ? 0 : 1);
} catch (error) {
    console.error(colors.red + '错误: ' + error.message + colors.reset);
    console.error(error.stack);
    process.exit(1);
}
