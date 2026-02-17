import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx, defineManifest } from '@crxjs/vite-plugin';
import path from 'path';
import { fileURLToPath } from 'url';
import { copyFileSync, mkdirSync } from 'fs';
import manifestJson from './manifest.json' with { type: 'json' };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const manifest = manifestJson as any;

const crxManifest = defineManifest(manifest);

// 插件：复制 content styles 到 dist
function copyContentStyles() {
  return {
    name: 'copy-content-styles',
    closeBundle() {
      const srcPath = path.resolve(__dirname, 'content/styles/index.css');
      const destDir = path.resolve(__dirname, 'dist/content/styles');
      const destPath = path.resolve(destDir, 'index.css');

      try {
        mkdirSync(destDir, { recursive: true });
        copyFileSync(srcPath, destPath);
        console.log('✓ Copied content/styles/index.css to dist');
      } catch (error) {
        console.error('Failed to copy content styles:', error);
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    crx({ manifest: crxManifest }),
    copyContentStyles(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      '@/components': path.resolve(__dirname, './shared/components'),
      '@/lib': path.resolve(__dirname, './shared/lib'),
      '@/hooks': path.resolve(__dirname, './shared/hooks'),
    },
  },
  build: {
    // 优化包大小
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // 生产环境移除 console
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug'], // 移除特定函数调用
        passes: 2, // 多次压缩以获得更好的结果
      },
      mangle: {
        safari10: true, // 兼容 Safari 10
      },
      format: {
        comments: false, // 移除所有注释
      },
    },
    // 设置 chunk 大小警告阈值
    chunkSizeWarningLimit: 200, // 200KB
    // 配置代码分割
    rollupOptions: {
      output: {
        // 手动配置 chunk 分割策略
        manualChunks: (id: string) => {
          // 将 node_modules 中的依赖分离到 vendor chunk
          if (id.includes('node_modules')) {
            // React 相关库单独打包
            if (id.includes('react') || id.includes('react-dom')) {
              return 'vendor-react';
            }
            // Zustand 状态管理库单独打包
            if (id.includes('zustand')) {
              return 'vendor-zustand';
            }
            // i18next 国际化库单独打包
            if (id.includes('i18next') || id.includes('react-i18next')) {
              return 'vendor-i18n';
            }
            // 其他第三方库
            return 'vendor-other';
          }

          // 将 Options 页面的组件分离（不包括 shared）
          if (id.includes('/options/components/') && !id.includes('/shared/')) {
            return 'options-components';
          }

          // 将 Content 页面的组件分离（不包括 shared）
          if (id.includes('/content/components/') && !id.includes('/shared/')) {
            return 'content-components';
          }

          // 将共享代码（components + modules + stores + utils）合并到一个 chunk
          // 这样可以避免循环依赖
          if (id.includes('/shared/')) {
            return 'shared';
          }
        },
        // 配置 chunk 文件名
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
      // 配置 Tree shaking
      treeshake: {
        moduleSideEffects: false, // 假设模块没有副作用，更激进的 tree shaking
        propertyReadSideEffects: false, // 假设属性读取没有副作用
        tryCatchDeoptimization: false, // 不对 try-catch 进行去优化
      },
    },
    // 启用 CSS 代码分割
    cssCodeSplit: true,
    // 报告压缩后的大小
    reportCompressedSize: true,
    // 启用源码映射（仅用于调试，生产环境可以关闭）
    sourcemap: false,
  },
  // 开发服务器配置
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173,
    },
    cors: {
      origin: [/chrome-extension:\/\//],
    },
  },
  // Vitest 配置
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./shared/utils/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData',
      ],
    },
  },
} as any);
