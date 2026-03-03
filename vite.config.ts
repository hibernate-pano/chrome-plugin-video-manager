import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, existsSync, readdirSync, mkdirSync } from 'fs';

// 复制静态文件
function copyManifest() {
  return {
    name: 'copy-manifest',
    writeBundle() {
      // 复制 manifest.json
      copyFileSync(
        resolve(__dirname, 'manifest.json'),
        resolve(__dirname, 'dist', 'manifest.json')
      );

      // 复制 icons 目录
      if (existsSync('icons')) {
        if (!existsSync(resolve(__dirname, 'dist', 'icons'))) {
          mkdirSync(resolve(__dirname, 'dist', 'icons'), { recursive: true });
        }
        readdirSync(resolve(__dirname, 'icons')).forEach(file => {
          copyFileSync(
            resolve(__dirname, 'icons', file),
            resolve(__dirname, 'dist', 'icons', file)
          );
        });
      }

      // 复制 _locales 目录
      if (existsSync('_locales')) {
        if (!existsSync(resolve(__dirname, 'dist', '_locales'))) {
          mkdirSync(resolve(__dirname, 'dist', '_locales'), { recursive: true });
        }
        readdirSync(resolve(__dirname, '_locales')).forEach(locale => {
          if (!existsSync(resolve(__dirname, 'dist', '_locales', locale))) {
            mkdirSync(resolve(__dirname, 'dist', '_locales', locale), { recursive: true });
          }
          readdirSync(resolve(__dirname, '_locales', locale)).forEach(file => {
            copyFileSync(
              resolve(__dirname, '_locales', locale, file),
              resolve(__dirname, 'dist', '_locales', locale, file)
            );
          });
        });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), copyManifest()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        content: resolve(__dirname, 'index.html'),
        options: resolve(__dirname, 'options.html'),
      },
    },
  },
});
