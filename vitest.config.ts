import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Vitest 配置
// https://vitest.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // 启用全局测试 API（describe, it, expect 等）
    globals: true,

    // 使用 jsdom 环境模拟浏览器环境
    environment: 'jsdom',

    // 测试设置文件
    setupFiles: ['./shared/utils/__tests__/setup.ts'],

    // 覆盖率配置
    coverage: {
      // 使用 v8 作为覆盖率提供者（更快）
      provider: 'v8',

      // 覆盖率报告格式
      reporter: ['text', 'json', 'html', 'lcov'],

      // 排除的文件和目录
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData',
        '**/__tests__/**',
        '**/tests/**',
        // 排除类型定义文件
        '**/types/**',
        // 排除构建脚本
        'scripts/**',
        // 排除文档文件
        '**/*.md',
        // 排除配置文件
        'components.json',
        'tailwind.config.ts',
        'postcss.config.js',
        'vite-env.d.ts',
      ],

      // 覆盖率阈值（可选）
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },

      // 包含的文件
      include: [
        'shared/**/*.{ts,tsx}',
        'content/**/*.{ts,tsx}',
        'options/**/*.{ts,tsx}',
      ],
    },

    // 测试超时时间（毫秒）
    testTimeout: 10000,

    // Hook 超时时间（毫秒）
    hookTimeout: 10000,

    // 是否在测试失败时隔离环境
    isolate: true,

    // 测试文件匹配模式
    include: [
      '**/__tests__/**/*.{test,spec}.{ts,tsx}',
      '**/*.{test,spec}.{ts,tsx}',
    ],

    // 排除的测试文件
    exclude: [
      'node_modules',
      'dist',
      '.idea',
      '.git',
      '.cache',
    ],

    // 监听模式下排除的文件
    watchExclude: [
      'node_modules',
      'dist',
    ],
  },

  // 路径别名配置（与 vite.config.ts 保持一致）
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      '@/components': path.resolve(__dirname, './shared/components'),
      '@/lib': path.resolve(__dirname, './shared/lib'),
      '@/hooks': path.resolve(__dirname, './shared/hooks'),
      '@/stores': path.resolve(__dirname, './shared/stores'),
      '@/types': path.resolve(__dirname, './shared/types'),
      '@/utils': path.resolve(__dirname, './shared/utils'),
      '@/modules': path.resolve(__dirname, './shared/modules'),
    },
  },
});
