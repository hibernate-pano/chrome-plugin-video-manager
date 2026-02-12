#!/usr/bin/env node

/**
 * 动画效果验证脚本
 *
 * 验证所有动画实现是否符合要求：
 * 1. React Spring 动画（HUD、Lightbox、数字滚动）
 * 2. Tailwind CSS 动画（控制条、按钮、进度条）
 * 3. 动画设置（速度切换、prefers-reduced-motion）
 * 4. 动画降级（浏览器兼容性）
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ANSI 颜色代码
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkFileExists(filePath) {
    const fullPath = path.join(__dirname, '..', filePath);
    return fs.existsSync(fullPath);
}

function checkFileContains(filePath, searchString) {
    const fullPath = path.join(__dirname, '..', filePath);
    if (!fs.existsSync(fullPath)) return false;
    const content = fs.readFileSync(fullPath, 'utf-8');
    return content.includes(searchString);
}

function checkMultipleStrings(filePath, strings) {
    const fullPath = path.join(__dirname, '..', filePath);
    if (!fs.existsSync(fullPath)) return { found: false, missing: strings };
    const content = fs.readFileSync(fullPath, 'utf-8');
    const missing = strings.filter(str => !content.includes(str));
    return { found: missing.length === 0, missing };
}

// 验证结果统计
const results = {
    total: 0,
    passed: 0,
    failed: 0,
    warnings: 0,
};

function test(description, testFn) {
    results.total++;
    try {
        const result = testFn();
        if (result === true) {
            results.passed++;
            log(`✓ ${description}`, 'green');
            return true;
        } else if (result === 'warning') {
            results.warnings++;
            log(`⚠ ${description}`, 'yellow');
            return false;
        } else {
            results.failed++;
            log(`✗ ${description}`, 'red');
            if (result && result.details) {
                log(`  ${result.details}`, 'red');
            }
            return false;
        }
    } catch (error) {
        results.failed++;
        log(`✗ ${description}`, 'red');
        log(`  错误: ${error.message}`, 'red');
        return false;
    }
}

log('\n=== 动画效果验证 ===\n', 'cyan');

// ============================================
// 1. React Spring 动画验证
// ============================================
log('1. React Spring 动画实现', 'blue');

test('AnimatedNumber 组件存在', () => {
    return checkFileExists('content/components/AnimatedNumber.tsx');
});

test('AnimatedNumber 使用 useSpring', () => {
    return checkFileContains('content/components/AnimatedNumber.tsx', 'useSpring');
});

test('SpeedIndicator 使用 React Spring', () => {
    const checks = checkMultipleStrings('content/components/SpeedIndicator.tsx', [
        'useSpring',
        'animated',
        'config.wobbly'
    ]);
    if (!checks.found) {
        return { details: `缺少: ${checks.missing.join(', ')}` };
    }
    return true;
});

test('VolumeIndicator 使用 React Spring', () => {
    const checks = checkMultipleStrings('content/components/VolumeIndicator.tsx', [
        'useSpring',
        'animated',
        'config.gentle'
    ]);
    if (!checks.found) {
        return { details: `缺少: ${checks.missing.join(', ')}` };
    }
    return true;
});

test('SeekIndicator 使用 React Spring', () => {
    const checks = checkMultipleStrings('content/components/SeekIndicator.tsx', [
        'useSpring',
        'animated',
        'config.wobbly'
    ]);
    if (!checks.found) {
        return { details: `缺少: ${checks.missing.join(', ')}` };
    }
    return true;
});

test('VideoContainer 使用 React Spring 缩放动画', () => {
    const checks = checkMultipleStrings('content/components/VideoContainer.tsx', [
        'useSpring',
        'animated',
        'scale',
        'opacity'
    ]);
    if (!checks.found) {
        return { details: `缺少: ${checks.missing.join(', ')}` };
    }
    return true;
});

// ============================================
// 2. Tailwind CSS 动画验证
// ============================================
log('\n2. Tailwind CSS 动画配置', 'blue');

test('Tailwind 配置文件存在', () => {
    return checkFileExists('tailwind.config.ts');
});

test('定义了自定义动画', () => {
    const checks = checkMultipleStrings('tailwind.config.ts', [
        'animate-fade-in',
        'animate-controls-fade-in',
        'animate-hud-appear'
    ]);
    if (!checks.found) {
        return { details: `缺少动画: ${checks.missing.join(', ')}` };
    }
    return true;
});

test('定义了动画关键帧', () => {
    const checks = checkMultipleStrings('tailwind.config.ts', [
        'keyframes',
        'fadeIn',
        'controlsFadeIn',
        'hudAppear'
    ]);
    if (!checks.found) {
        return { details: `缺少关键帧: ${checks.missing.join(', ')}` };
    }
    return true;
});

test('Content Script 样式文件存在', () => {
    return checkFileExists('content/styles/index.css');
});

test('定义了工具类（controls-gradient, glass-effect 等）', () => {
    const checks = checkMultipleStrings('content/styles/index.css', [
        'controls-gradient',
        'glass-effect',
        'progress-smooth'
    ]);
    if (!checks.found) {
        return { details: `缺少工具类: ${checks.missing.join(', ')}` };
    }
    return true;
});

// ============================================
// 3. 动画设置验证
// ============================================
log('\n3. 动画设置系统', 'blue');

test('useAnimationConfig Hook 存在', () => {
    return checkFileExists('shared/hooks/useAnimationConfig.ts');
});

test('useAnimationConfig 检测 prefers-reduced-motion', () => {
    return checkFileContains('shared/hooks/useAnimationConfig.ts', 'prefers-reduced-motion');
});

test('animationVariables 工具模块存在', () => {
    return checkFileExists('shared/utils/animationVariables.ts');
});

test('定义了动画 CSS 变量', () => {
    const checks = checkMultipleStrings('shared/utils/animationVariables.ts', [
        '--vsc-animation-duration',
        '--vsc-hud-fade-duration',
        '--vsc-lightbox-fade-duration'
    ]);
    if (!checks.found) {
        return { details: `缺少 CSS 变量: ${checks.missing.join(', ')}` };
    }
    return true;
});

test('支持动画速度切换（normal, fast, off）', () => {
    const checks = checkMultipleStrings('shared/utils/animationVariables.ts', [
        'normal',
        'fast',
        'off'
    ]);
    if (!checks.found) {
        return { details: `缺少速度选项: ${checks.missing.join(', ')}` };
    }
    return true;
});

test('CSS 中定义了 prefers-reduced-motion 媒体查询', () => {
    return checkFileContains('content/styles/index.css', '@media (prefers-reduced-motion: reduce)');
});

test('AnimationTab 组件使用 useAnimationConfig', () => {
    return checkFileContains('options/components/AnimationTab.tsx', 'useAnimationConfig');
});

// ============================================
// 4. 动画降级验证
// ============================================
log('\n4. 动画降级系统', 'blue');

test('animationFallback 模块存在', () => {
    return checkFileExists('shared/utils/animationFallback.ts');
});

test('实现了浏览器特性检测', () => {
    const checks = checkMultipleStrings('shared/utils/animationFallback.ts', [
        'detectCSSAnimations',
        'detectCSSTransitions',
        'detectCSSTransforms',
        'detectBackdropFilter'
    ]);
    if (!checks.found) {
        return { details: `缺少检测函数: ${checks.missing.join(', ')}` };
    }
    return true;
});

test('实现了降级应用函数', () => {
    return checkFileContains('shared/utils/animationFallback.ts', 'applyAnimationFallback');
});

test('实现了降级样式表生成', () => {
    return checkFileContains('shared/utils/animationFallback.ts', 'createFallbackStylesheet');
});

test('Content Script 初始化时应用降级', () => {
    return checkFileContains('content/main.tsx', 'initAnimationFallback');
});

// ============================================
// 5. 组件集成验证
// ============================================
log('\n5. 组件动画集成', 'blue');

test('HUD 组件导出 AnimatedNumber', () => {
    return checkFileContains('content/components/index.ts', 'AnimatedNumber');
});

test('LightboxControls 使用动画类', () => {
    const checks = checkMultipleStrings('content/components/LightboxControls.tsx', [
        'animate-',
        'transition'
    ]);
    if (!checks.found) {
        return { details: '未使用动画类' };
    }
    return true;
});

test('KeyboardHelpModal 使用动画', () => {
    return checkFileContains('content/components/KeyboardHelpModal.tsx', 'animate-');
});

// ============================================
// 6. 性能优化验证
// ============================================
log('\n6. 性能优化', 'blue');

test('使用 React.memo 优化 AnimatedNumber', () => {
    return checkFileContains('content/components/AnimatedNumber.tsx', 'React.memo');
});

test('定义了 GPU 加速类', () => {
    return checkFileContains('content/styles/index.css', 'gpu-accelerated');
});

test('使用 transform 和 opacity（GPU 加速属性）', () => {
    const checks = checkMultipleStrings('tailwind.config.ts', [
        'transform',
        'opacity'
    ]);
    if (!checks.found) {
        return { details: '未使用 GPU 加速属性' };
    }
    return true;
});

// ============================================
// 7. 文档验证
// ============================================
log('\n7. 文档完整性', 'blue');

test('任务 63 完成文档存在', () => {
    return checkFileExists('TASK_63_COMPLETION.md');
});

test('任务 64 完成文档存在', () => {
    return checkFileExists('TASK_64_COMPLETION.md');
});

test('任务 64 视觉指南存在', () => {
    return checkFileExists('TASK_64_VISUAL_GUIDE.md');
});

test('任务 65 完成文档存在', () => {
    return checkFileExists('TASK_65_COMPLETION.md');
});

test('任务 66 完成文档存在', () => {
    return checkFileExists('TASK_66_COMPLETION.md');
});

test('Tailwind 动画总结文档存在', () => {
    return checkFileExists('TAILWIND_ANIMATIONS_SUMMARY.md');
});

test('动画降级指南存在', () => {
    return checkFileExists('ANIMATION_FALLBACK_GUIDE.md');
});

// ============================================
// 8. 测试覆盖验证
// ============================================
log('\n8. 测试覆盖', 'blue');

test('AnimatedNumber 测试文件存在', () => {
    return checkFileExists('content/components/__tests__/AnimatedNumber.test.tsx');
});

test('animationFallback 测试文件存在', () => {
    return checkFileExists('shared/utils/__tests__/animationFallback.test.ts');
});

// ============================================
// 结果汇总
// ============================================
log('\n=== 验证结果汇总 ===\n', 'cyan');

log(`总计: ${results.total} 项`, 'blue');
log(`通过: ${results.passed} 项`, 'green');
log(`失败: ${results.failed} 项`, 'red');
log(`警告: ${results.warnings} 项`, 'yellow');

const successRate = ((results.passed / results.total) * 100).toFixed(1);
log(`\n成功率: ${successRate}%`, successRate >= 90 ? 'green' : successRate >= 70 ? 'yellow' : 'red');

// 退出码
if (results.failed > 0) {
    log('\n❌ 验证失败！请修复上述问题。\n', 'red');
    process.exit(1);
} else if (results.warnings > 0) {
    log('\n⚠️  验证通过，但有警告。\n', 'yellow');
    process.exit(0);
} else {
    log('\n✅ 所有验证通过！动画系统实现完整。\n', 'green');
    process.exit(0);
}
