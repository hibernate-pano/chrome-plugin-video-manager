#!/usr/bin/env node

/**
 * 初始化性能测量脚本
 *
 * 此脚本提供自动化的性能测量工具，用于：
 * 1. 分析构建产物的加载时间
 * 2. 估算初始化性能
 * 3. 生成性能报告
 *
 * 注意：实际的运行时性能需要在浏览器中使用 Chrome DevTools 测量
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const distDir = join(__dirname, '../src-react/dist');
const reportPath = join(__dirname, '../INITIALIZATION_PERFORMANCE_RESULTS.md');

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
    extensionInitTime: 100, // 100ms
    firstMediaDetection: 100, // 100ms
    contentScriptLoad: 50, // 50ms
    hudFirstRender: 16, // 16ms (60fps)
};

/**
 * 格式化字节大小
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 获取状态图标
 */
function getStatusIcon(actual, target) {
    return actual <= target ? '✅' : '❌';
}

/**
 * 分析文件大小和估算加载时间
 * 假设网络速度：5 Mbps (典型的 3G/4G 速度)
 */
function analyzeLoadTime(filePath) {
    const stat = statSync(filePath);
    const sizeBytes = stat.size;
    const sizeKB = sizeBytes / 1024;

    // 估算加载时间（5 Mbps = 625 KB/s）
    const networkSpeed = 625; // KB/s
    const loadTime = (sizeKB / networkSpeed) * 1000; // ms

    // 估算解析时间（基于文件大小，粗略估计）
    const parseTime = sizeKB * 0.1; // 每 KB 约 0.1ms

    return {
        size: sizeBytes,
        sizeKB,
        formatted: formatBytes(sizeBytes),
        loadTime: Math.round(loadTime),
        parseTime: Math.round(parseTime),
        totalTime: Math.round(loadTime + parseTime),
    };
}

/**
 * 分析内容脚本性能
 */
function analyzeContentScriptPerformance() {
    const contentFiles = [
        'assets/content-components-Czw0mogb.js',
        'assets/main.tsx-B95jXd3r.js',
        'assets/shared-D9Cz6tYJ.js',
        'content/styles/index.css',
        'assets/main-CrTDGzRN.css',
    ];

    let totalLoadTime = 0;
    let totalParseTime = 0;
    const fileDetails = [];

    for (const file of contentFiles) {
        const filePath = join(distDir, file);
        try {
            const analysis = analyzeLoadTime(filePath);
            totalLoadTime += analysis.loadTime;
            totalParseTime += analysis.parseTime;
            fileDetails.push({
                file,
                ...analysis,
            });
        } catch (error) {
            console.warn(`${colors.yellow}警告: 无法分析文件 ${file}${colors.reset}`);
        }
    }

    const totalTime = totalLoadTime + totalParseTime;

    return {
        files: fileDetails,
        totalLoadTime,
        totalParseTime,
        totalTime,
        estimatedInitTime: Math.round(totalTime * 0.3), // 估算实际初始化时间约为总时间的 30%
    };
}

/**
 * 估算视频检测性能
 */
function estimateMediaDetectionPerformance() {
    // 基于代码复杂度和 DOM 操作的粗略估算
    // 实际性能取决于页面复杂度和视频元素数量

    const baseTime = 10; // 基础检测时间
    const perElementTime = 2; // 每个元素的检测时间

    // 假设不同场景
    const scenarios = [
        { name: '简单页面 (1-2 个视频)', elements: 2, time: baseTime + perElementTime * 2 },
        { name: '中等页面 (3-5 个视频)', elements: 4, time: baseTime + perElementTime * 4 },
        { name: '复杂页面 (6-10 个视频)', elements: 8, time: baseTime + perElementTime * 8 },
    ];

    return scenarios;
}

/**
 * 估算 HUD 渲染性能
 */
function estimateHUDRenderPerformance() {
    // 基于 React 渲染和 CSS 动画的估算

    const reactRenderTime = 5; // React 组件渲染时间
    const styleCalculation = 2; // 样式计算时间
    const layoutTime = 3; // 布局时间
    const paintTime = 4; // 绘制时间
    const compositeTime = 2; // 合成时间

    const totalTime = reactRenderTime + styleCalculation + layoutTime + paintTime + compositeTime;

    return {
        reactRenderTime,
        styleCalculation,
        layoutTime,
        paintTime,
        compositeTime,
        totalTime,
        breakdown: [
            { phase: 'React 渲染', time: reactRenderTime },
            { phase: '样式计算', time: styleCalculation },
            { phase: '布局', time: layoutTime },
            { phase: '绘制', time: paintTime },
            { phase: '合成', time: compositeTime },
        ],
    };
}

/**
 * 打印内容脚本性能报告
 */
function printContentScriptReport(analysis) {
    console.log('\n' + colors.cyan + '='.repeat(80) + colors.reset);
    console.log(colors.cyan + '📦 内容脚本加载性能分析' + colors.reset);
    console.log(colors.cyan + '='.repeat(80) + colors.reset + '\n');

    console.log(colors.blue + '文件详情:' + colors.reset);
    analysis.files.forEach((file) => {
        console.log(`  ${file.formatted.padEnd(12)} ${file.file}`);
        console.log(`    加载: ${file.loadTime}ms | 解析: ${file.parseTime}ms | 总计: ${file.totalTime}ms`);
    });

    console.log();
    console.log(colors.blue + '总计:' + colors.reset);
    console.log(`  加载时间: ${analysis.totalLoadTime}ms`);
    console.log(`  解析时间: ${analysis.totalParseTime}ms`);
    console.log(`  总时间: ${analysis.totalTime}ms`);
    console.log(`  估算初始化时间: ${analysis.estimatedInitTime}ms`);

    const icon = getStatusIcon(analysis.estimatedInitTime, PERFORMANCE_TARGETS.extensionInitTime);
    const color = analysis.estimatedInitTime <= PERFORMANCE_TARGETS.extensionInitTime ? colors.green : colors.red;
    console.log();
    console.log(`  ${icon} 目标: ${color}${analysis.estimatedInitTime}ms${colors.reset} / ${PERFORMANCE_TARGETS.extensionInitTime}ms`);

    console.log();
    console.log(colors.yellow + '⚠️  注意: 这是基于网络速度和文件大小的估算值' + colors.reset);
    console.log(colors.yellow + '   实际性能需要在浏览器中使用 Chrome DevTools 测量' + colors.reset);
}

/**
 * 打印视频检测性能报告
 */
function printMediaDetectionReport(scenarios) {
    console.log('\n' + colors.cyan + '='.repeat(80) + colors.reset);
    console.log(colors.cyan + '🎬 视频检测性能估算' + colors.reset);
    console.log(colors.cyan + '='.repeat(80) + colors.reset + '\n');

    scenarios.forEach((scenario) => {
        const icon = getStatusIcon(scenario.time, PERFORMANCE_TARGETS.firstMediaDetection);
        const color = scenario.time <= PERFORMANCE_TARGETS.firstMediaDetection ? colors.green : colors.red;
        console.log(`  ${icon} ${scenario.name}`);
        console.log(`     元素数量: ${scenario.elements}`);
        console.log(`     估算时间: ${color}${scenario.time}ms${colors.reset} / ${PERFORMANCE_TARGETS.firstMediaDetection}ms`);
        console.log();
    });

    console.log(colors.yellow + '⚠️  注意: 实际检测时间取决于页面复杂度和 DOM 结构' + colors.reset);
}

/**
 * 打印 HUD 渲染性能报告
 */
function printHUDRenderReport(analysis) {
    console.log('\n' + colors.cyan + '='.repeat(80) + colors.reset);
    console.log(colors.cyan + '🎯 HUD 渲染性能估算' + colors.reset);
    console.log(colors.cyan + '='.repeat(80) + colors.reset + '\n');

    console.log(colors.blue + '渲染阶段分解:' + colors.reset);
    analysis.breakdown.forEach((phase) => {
        console.log(`  ${phase.phase.padEnd(15)}: ${phase.time}ms`);
    });

    console.log();
    const icon = getStatusIcon(analysis.totalTime, PERFORMANCE_TARGETS.hudFirstRender);
    const color = analysis.totalTime <= PERFORMANCE_TARGETS.hudFirstRender ? colors.green : colors.red;
    console.log(`  ${icon} 总渲染时间: ${color}${analysis.totalTime}ms${colors.reset} / ${PERFORMANCE_TARGETS.hudFirstRender}ms (60fps)`);

    console.log();
    console.log(colors.yellow + '⚠️  注意: 这是理想情况下的估算值' + colors.reset);
    console.log(colors.yellow + '   实际渲染时间受设备性能和浏览器优化影响' + colors.reset);
}

/**
 * 生成 Markdown 报告
 */
function generateMarkdownReport(contentScript, mediaDetection, hudRender) {
    const timestamp = new Date().toISOString().split('T')[0];

    let markdown = `# 初始化性能测试结果

**测试日期**: ${timestamp}
**测试类型**: 自动化估算
**Chrome 版本**: [需要在浏览器中测试]
**操作系统**: ${process.platform}

## ⚠️ 重要说明

本报告中的数据为基于文件大小和代码复杂度的**估算值**。

**实际性能测量需要**:
1. 在 Chrome 浏览器中加载扩展
2. 使用 Chrome DevTools Performance 面板
3. 在真实网页上进行测试
4. 记录实际的性能指标

详细测量方法请参考: [INITIALIZATION_PERFORMANCE_GUIDE.md](INITIALIZATION_PERFORMANCE_GUIDE.md)

## 📊 估算结果

### 1. 扩展初始化时间

**估算值**: ${contentScript.estimatedInitTime}ms
**目标值**: ${PERFORMANCE_TARGETS.extensionInitTime}ms
**状态**: ${contentScript.estimatedInitTime <= PERFORMANCE_TARGETS.extensionInitTime ? '✅ 预计通过' : '❌ 预计未通过'}

#### 文件加载详情

| 文件 | 大小 | 加载时间 | 解析时间 | 总计 |
|------|------|----------|----------|------|
`;

    contentScript.files.forEach((file) => {
        markdown += `| ${file.file} | ${file.formatted} | ${file.loadTime}ms | ${file.parseTime}ms | ${file.totalTime}ms |\n`;
    });

    markdown += `
**总加载时间**: ${contentScript.totalLoadTime}ms
**总解析时间**: ${contentScript.totalParseTime}ms
**总时间**: ${contentScript.totalTime}ms

### 2. 首次视频检测时间

`;

    mediaDetection.forEach((scenario) => {
        const status = scenario.time <= PERFORMANCE_TARGETS.firstMediaDetection ? '✅ 预计通过' : '❌ 预计未通过';
        markdown += `
#### ${scenario.name}

- **元素数量**: ${scenario.elements}
- **估算时间**: ${scenario.time}ms
- **目标值**: ${PERFORMANCE_TARGETS.firstMediaDetection}ms
- **状态**: ${status}
`;
    });

    markdown += `
### 3. HUD 首次渲染时间

**估算值**: ${hudRender.totalTime}ms
**目标值**: ${PERFORMANCE_TARGETS.hudFirstRender}ms (60fps)
**状态**: ${hudRender.totalTime <= PERFORMANCE_TARGETS.hudFirstRender ? '✅ 预计通过' : '❌ 预计未通过'}

#### 渲染阶段分解

| 阶段 | 时间 |
|------|------|
`;

    hudRender.breakdown.forEach((phase) => {
        markdown += `| ${phase.phase} | ${phase.time}ms |\n`;
    });

    markdown += `| **总计** | **${hudRender.totalTime}ms** |

## 📋 性能目标对比

| 指标 | 估算值 | 目标值 | 状态 |
|------|--------|--------|------|
| 扩展初始化时间 | ${contentScript.estimatedInitTime}ms | ${PERFORMANCE_TARGETS.extensionInitTime}ms | ${contentScript.estimatedInitTime <= PERFORMANCE_TARGETS.extensionInitTime ? '✅' : '❌'} |
| 首次视频检测 (简单) | ${mediaDetection[0].time}ms | ${PERFORMANCE_TARGETS.firstMediaDetection}ms | ${mediaDetection[0].time <= PERFORMANCE_TARGETS.firstMediaDetection ? '✅' : '❌'} |
| 首次视频检测 (中等) | ${mediaDetection[1].time}ms | ${PERFORMANCE_TARGETS.firstMediaDetection}ms | ${mediaDetection[1].time <= PERFORMANCE_TARGETS.firstMediaDetection ? '✅' : '❌'} |
| 首次视频检测 (复杂) | ${mediaDetection[2].time}ms | ${PERFORMANCE_TARGETS.firstMediaDetection}ms | ${mediaDetection[2].time <= PERFORMANCE_TARGETS.firstMediaDetection ? '✅' : '❌'} |
| HUD 首次渲染 | ${hudRender.totalTime}ms | ${PERFORMANCE_TARGETS.hudFirstRender}ms | ${hudRender.totalTime <= PERFORMANCE_TARGETS.hudFirstRender ? '✅' : '❌'} |

## 🔍 后续行动

### 必须完成的实际测量

1. **在浏览器中测试**
   - 加载扩展到 Chrome
   - 使用 Performance 面板录制
   - 测量实际的初始化时间

2. **在真实网站测试**
   - YouTube
   - Bilibili
   - 其他视频网站

3. **记录实际数据**
   - 更新本报告的实际测量值
   - 对比估算值和实际值
   - 识别性能瓶颈

### 测量工具和方法

详细的测量方法请参考:
- [INITIALIZATION_PERFORMANCE_GUIDE.md](INITIALIZATION_PERFORMANCE_GUIDE.md)

### 如果性能未达标

参考优化建议:
- [BUNDLE_SIZE_ANALYSIS_REPORT.md](BUNDLE_SIZE_ANALYSIS_REPORT.md)
- [src-react/PERFORMANCE_MEASUREMENT_GUIDE.md](src-react/PERFORMANCE_MEASUREMENT_GUIDE.md)

## 📝 备注

- 本报告基于文件大小和代码复杂度生成估算值
- 估算假设网络速度为 5 Mbps (典型 3G/4G)
- 实际性能受多种因素影响：
  - 设备性能 (CPU、内存)
  - 网络状况
  - 浏览器版本和优化
  - 页面复杂度
  - 其他扩展的影响
- **强烈建议进行实际测量以获得准确数据**
`;

    return markdown;
}

/**
 * 打印总结
 */
function printSummary(contentScript, mediaDetection, hudRender) {
    console.log('\n' + colors.cyan + '='.repeat(80) + colors.reset);
    console.log(colors.cyan + '📊 性能估算总结' + colors.reset);
    console.log(colors.cyan + '='.repeat(80) + colors.reset + '\n');

    const initPassed = contentScript.estimatedInitTime <= PERFORMANCE_TARGETS.extensionInitTime;
    const mediaPassed = mediaDetection.every(s => s.time <= PERFORMANCE_TARGETS.firstMediaDetection);
    const hudPassed = hudRender.totalTime <= PERFORMANCE_TARGETS.hudFirstRender;

    const allPassed = initPassed && mediaPassed && hudPassed;

    if (allPassed) {
        console.log(colors.green + '✅ 所有性能指标预计均符合目标！' + colors.reset);
    } else {
        console.log(colors.yellow + '⚠️  部分性能指标可能需要优化' + colors.reset);
    }

    console.log();
    console.log(colors.blue + '估算结果:' + colors.reset);
    console.log(`  扩展初始化: ${initPassed ? '✅' : '❌'} ${contentScript.estimatedInitTime}ms / ${PERFORMANCE_TARGETS.extensionInitTime}ms`);
    console.log(`  视频检测: ${mediaPassed ? '✅' : '⚠️'} ${mediaDetection[0].time}-${mediaDetection[2].time}ms / ${PERFORMANCE_TARGETS.firstMediaDetection}ms`);
    console.log(`  HUD 渲染: ${hudPassed ? '✅' : '❌'} ${hudRender.totalTime}ms / ${PERFORMANCE_TARGETS.hudFirstRender}ms`);

    console.log();
    console.log(colors.yellow + '⚠️  重要提示:' + colors.reset);
    console.log(colors.yellow + '   这些是估算值，实际性能需要在浏览器中测量！' + colors.reset);
    console.log(colors.yellow + '   请参考 INITIALIZATION_PERFORMANCE_GUIDE.md 进行实际测量' + colors.reset);

    console.log();
    console.log(colors.cyan + `📄 详细报告已保存到: ${reportPath}` + colors.reset);
    console.log();
}

// 主函数
try {
    console.log(colors.cyan + '🚀 开始初始化性能分析...' + colors.reset);
    console.log(colors.yellow + '⚠️  注意: 这是基于文件大小的估算，实际性能需要在浏览器中测量' + colors.reset);

    // 1. 分析内容脚本性能
    const contentScriptAnalysis = analyzeContentScriptPerformance();
    printContentScriptReport(contentScriptAnalysis);

    // 2. 估算视频检测性能
    const mediaDetectionScenarios = estimateMediaDetectionPerformance();
    printMediaDetectionReport(mediaDetectionScenarios);

    // 3. 估算 HUD 渲染性能
    const hudRenderAnalysis = estimateHUDRenderPerformance();
    printHUDRenderReport(hudRenderAnalysis);

    // 4. 打印总结
    printSummary(contentScriptAnalysis, mediaDetectionScenarios, hudRenderAnalysis);

    // 5. 生成 Markdown 报告
    const markdownReport = generateMarkdownReport(
        contentScriptAnalysis,
        mediaDetectionScenarios,
        hudRenderAnalysis
    );
    writeFileSync(reportPath, markdownReport, 'utf-8');

    console.log(colors.green + '✅ 分析完成！' + colors.reset);
    console.log(colors.cyan + '📖 下一步: 请参考 INITIALIZATION_PERFORMANCE_GUIDE.md 进行实际测量' + colors.reset);
    console.log();

} catch (error) {
    console.error(colors.red + '错误: ' + error.message + colors.reset);
    console.error(error.stack);
    process.exit(1);
}
