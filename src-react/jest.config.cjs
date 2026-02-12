/**
 * Jest 配置文件
 * 用于测试 Chrome 扩展 API 和原生 JavaScript 模块
 *
 * 与 Vitest 的分工：
 * - Jest: 测试 Chrome API、扩展特定功能、原生 JS 模块
 * - Vitest: 测试 React 组件、UI 交互
 */

module.exports = {
    // 测试环境：使用 jsdom 模拟浏览器环境
    testEnvironment: 'jsdom',

    // 根目录
    roots: ['<rootDir>'],

    // 测试文件匹配模式
    testMatch: [
        '**/__tests__/**/*.jest.{js,ts}',
        '**/*.jest.{js,ts}',
        '**/tests/chrome-api/**/*.test.{js,ts}',
    ],

    // TypeScript 转换配置
    transform: {
        '^.+\\.tsx?$': ['ts-jest', {
            tsconfig: {
                // Jest 特定的 TypeScript 配置
                jsx: 'react-jsx',
                esModuleInterop: true,
                allowSyntheticDefaultImports: true,
                moduleResolution: 'node',
            },
        }],
    },

    // 模块名称映射（路径别名）
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/$1',
        '^@/components$': '<rootDir>/shared/components',
        '^@/components/(.*)$': '<rootDir>/shared/components/$1',
        '^@/lib$': '<rootDir>/shared/lib',
        '^@/lib/(.*)$': '<rootDir>/shared/lib/$1',
        '^@/hooks$': '<rootDir>/shared/hooks',
        '^@/hooks/(.*)$': '<rootDir>/shared/hooks/$1',
        '^@/stores$': '<rootDir>/shared/stores',
        '^@/stores/(.*)$': '<rootDir>/shared/stores/$1',
        '^@/types$': '<rootDir>/shared/types',
        '^@/types/(.*)$': '<rootDir>/shared/types/$1',
        '^@/utils$': '<rootDir>/shared/utils',
        '^@/utils/(.*)$': '<rootDir>/shared/utils/$1',
        '^@/modules$': '<rootDir>/shared/modules',
        '^@/modules/(.*)$': '<rootDir>/shared/modules/$1',
        // CSS 模块 mock
        '\\.(css|less|scss|sass)$': '<rootDir>/__mocks__/styleMock.js',
    },

    // 测试设置文件（在每个测试文件之前运行）
    setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.ts'],

    // 覆盖率收集配置
    collectCoverageFrom: [
        'shared/**/*.{js,ts}',
        'content/**/*.{js,ts}',
        'options/**/*.{js,ts}',
        'background/**/*.{js,ts}',
        // 排除
        '!**/*.d.ts',
        '!**/*.config.*',
        '!**/node_modules/**',
        '!**/dist/**',
        '!**/__tests__/**',
        '!**/tests/**',
        '!**/types/**',
        '!**/*.test.*',
        '!**/*.spec.*',
    ],

    // 覆盖率报告格式
    coverageReporters: ['text', 'lcov', 'html'],

    // 覆盖率目录
    coverageDirectory: '<rootDir>/coverage-jest',

    // 模块文件扩展名
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],

    // 测试超时时间（毫秒）
    testTimeout: 10000,

    // 清除 mock 调用和实例
    clearMocks: true,

    // 每次测试后恢复 mock 状态
    restoreMocks: true,

    // 忽略的路径
    testPathIgnorePatterns: [
        '/node_modules/',
        '/dist/',
        '\\.vitest\\.',
    ],

    // 转换忽略的路径（允许转换 node_modules 中的 ES 模块）
    transformIgnorePatterns: [
        'node_modules/(?!(zustand|@react-spring)/)',
    ],
};
