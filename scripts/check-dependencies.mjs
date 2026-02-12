#!/usr/bin/env node

/**
 * 依赖关系检查脚本
 *
 * 此脚本用于：
 * 1. 在整个项目中搜索对旧文件的引用
 * 2. 检查 manifest.json 中的引用
 * 3. 检查构建配置中的引用
 * 4. 确认没有新代码依赖旧代码
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
function scanDirectory(dir, extensions = ['.js', '.ts', '.tsx', '.jsx', '.json', '.html'], excludeDirs = []) {
    const files = [];

    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            // 跳过排除的目录
            if (entry.isDirectory()) {
                if (excludeDirs.includes(entry.name)) {
                    continue;
                }
                files.push(...scanDirectory(fullPath, extensions, excludeDirs));
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name);
                if (extensions.includes(ext)) {
                    files.push(fullPath);
                }
            }
        }
    } catch (error) {
    // 忽略无法访问的目录
    }

    return files;
}

/**
 * 在文件中搜索引用
 */
function searchInFile(filePath, patterns) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        const matches = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            for (const pattern of patterns) {
                // 特殊处理：排除 .style.cssText 这种属性访问
                if (pattern === 'style.css' && line.includes('.style.css')) {
                    continue;
                }

                if (line.includes(pattern)) {
                    matches.push({
                        line: i + 1,
                        content: line.trim(),
                        pattern: pattern
                    });
                }
            }
        }

        return matches;
    } catch (error) {
        return [];
    }
}

/**
 * 检查依赖关系
 */
function checkDependencies() {
    console.log('🔍 开始检查依赖关系...\n');

    const dependencies = {
        manifestReferences: [],
        buildConfigReferences: [],
        srcReactReferences: [],
        otherReferences: [],
        totalReferences: 0
    };

    // 定义要搜索的旧文件路径模式
    const legacyPatterns = [
    // 源代码文件
        'src/main.js',
        'src/modules/',
        'src/utils/',
        'src/styles/',
        // 配置和页面文件
        'options-new.html',
        'options-new.js',
        'style.css',
        // 旧的构建产物
        'content-bundled.js',
        'content.js'
    ];

    // 1. 检查 manifest.json
    console.log('📄 检查 manifest.json...');
    const manifestPath = path.join(projectRoot, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
        const matches = searchInFile(manifestPath, legacyPatterns);
        if (matches.length > 0) {
            dependencies.manifestReferences.push({
                file: 'manifest.json',
                matches: matches
            });
            dependencies.totalReferences += matches.length;
        }
    }

    // 2. 检查构建配置文件
    console.log('📄 检查构建配置文件...');
    const buildConfigs = [
        'package.json',
        'scripts/build.js',
        'scripts/clean.js',
        'babel.config.js',
        '.eslintrc.json'
    ];

    for (const config of buildConfigs) {
        const configPath = path.join(projectRoot, config);
        if (fs.existsSync(configPath)) {
            const matches = searchInFile(configPath, legacyPatterns);
            if (matches.length > 0) {
                dependencies.buildConfigReferences.push({
                    file: config,
                    matches: matches
                });
                dependencies.totalReferences += matches.length;
            }
        }
    }

    // 3. 检查 src-react 目录中的引用
    console.log('📁 检查 src-react/ 目录...');
    const srcReactDir = path.join(projectRoot, 'src-react');
    if (fs.existsSync(srcReactDir)) {
        const srcReactFiles = scanDirectory(
            srcReactDir,
            ['.js', '.ts', '.tsx', '.jsx', '.json'],
            ['node_modules', 'dist', 'coverage-jest', 'playwright-report']
        );

        for (const file of srcReactFiles) {
            const matches = searchInFile(file, legacyPatterns);
            if (matches.length > 0) {
                dependencies.srcReactReferences.push({
                    file: path.relative(projectRoot, file),
                    matches: matches
                });
                dependencies.totalReferences += matches.length;
            }
        }
    }

    // 4. 检查其他目录
    console.log('📁 检查其他文件...');
    const otherDirs = ['docs', 'scripts'];

    for (const dir of otherDirs) {
        const dirPath = path.join(projectRoot, dir);
        if (fs.existsSync(dirPath)) {
            const files = scanDirectory(dirPath, ['.js', '.mjs', '.md', '.json'], ['node_modules']);

            for (const file of files) {
                const matches = searchInFile(file, legacyPatterns);
                if (matches.length > 0) {
                    dependencies.otherReferences.push({
                        file: path.relative(projectRoot, file),
                        matches: matches
                    });
                    dependencies.totalReferences += matches.length;
                }
            }
        }
    }

    return dependencies;
}

/**
 * 生成依赖关系报告
 */
function generateReport(dependencies) {
    console.log('\n📊 依赖关系检查结果：\n');
    console.log('='.repeat(80));

    // Manifest 引用
    if (dependencies.manifestReferences.length > 0) {
        console.log('\n⚠️  manifest.json 中的引用:');
        console.log('-'.repeat(80));
        for (const ref of dependencies.manifestReferences) {
            console.log(`\n  文件: ${ref.file}`);
            for (const match of ref.matches) {
                console.log(`    行 ${match.line}: ${match.content}`);
                console.log(`    匹配模式: ${match.pattern}`);
            }
        }
    } else {
        console.log('\n✅ manifest.json 中没有发现旧文件引用');
    }

    // 构建配置引用
    if (dependencies.buildConfigReferences.length > 0) {
        console.log('\n⚠️  构建配置文件中的引用:');
        console.log('-'.repeat(80));
        for (const ref of dependencies.buildConfigReferences) {
            console.log(`\n  文件: ${ref.file}`);
            for (const match of ref.matches) {
                console.log(`    行 ${match.line}: ${match.content}`);
                console.log(`    匹配模式: ${match.pattern}`);
            }
        }
    } else {
        console.log('\n✅ 构建配置文件中没有发现旧文件引用');
    }

    // src-react 引用
    if (dependencies.srcReactReferences.length > 0) {
        console.log('\n❌ src-react/ 目录中的引用 (需要修复):');
        console.log('-'.repeat(80));
        for (const ref of dependencies.srcReactReferences) {
            console.log(`\n  文件: ${ref.file}`);
            for (const match of ref.matches) {
                console.log(`    行 ${match.line}: ${match.content}`);
                console.log(`    匹配模式: ${match.pattern}`);
            }
        }
    } else {
        console.log('\n✅ src-react/ 目录中没有发现旧文件引用');
    }

    // 其他引用
    if (dependencies.otherReferences.length > 0) {
        console.log('\n📝 其他文件中的引用:');
        console.log('-'.repeat(80));
        for (const ref of dependencies.otherReferences) {
            console.log(`\n  文件: ${ref.file}`);
            for (const match of ref.matches) {
                console.log(`    行 ${match.line}: ${match.content}`);
                console.log(`    匹配模式: ${match.pattern}`);
            }
        }
    } else {
        console.log('\n✅ 其他文件中没有发现旧文件引用');
    }

    // 总结
    console.log('\n' + '='.repeat(80));
    console.log('📈 总结:');
    console.log(`  总引用数: ${dependencies.totalReferences}`);
    console.log(`  manifest.json 引用: ${dependencies.manifestReferences.length}`);
    console.log(`  构建配置引用: ${dependencies.buildConfigReferences.length}`);
    console.log(`  src-react 引用: ${dependencies.srcReactReferences.length}`);
    console.log(`  其他引用: ${dependencies.otherReferences.length}`);

    if (dependencies.srcReactReferences.length > 0) {
        console.log('\n⚠️  警告: 发现新代码依赖旧代码，需要在清理前修复！');
    } else if (dependencies.totalReferences === 0) {
        console.log('\n✅ 没有发现任何依赖关系，可以安全清理旧代码！');
    } else {
        console.log('\n✅ 新代码没有依赖旧代码，但需要更新配置文件');
    }

    console.log('='.repeat(80));
}

/**
 * 保存依赖关系分析结果
 */
function saveDependenciesToFile(dependencies) {
    const outputPath = path.join(projectRoot, 'legacy-dependencies-analysis.json');

    try {
        fs.writeFileSync(outputPath, JSON.stringify(dependencies, null, 2), 'utf-8');
        console.log(`\n✅ 依赖关系分析结果已保存到: ${outputPath}`);
    } catch (error) {
        console.error('\n❌ 保存依赖关系分析结果失败:', error.message);
    }
}

// 主函数
function main() {
    console.log('🚀 依赖关系检查工具\n');

    const dependencies = checkDependencies();
    generateReport(dependencies);
    saveDependenciesToFile(dependencies);

    console.log('\n✨ 检查完成！\n');
}

main();
