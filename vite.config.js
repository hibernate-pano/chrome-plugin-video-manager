import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    // ⚠️ 关掉 modulepreload polyfill。
    //
    // 为什么不关：Vite 默认会往产物里注入一段 polyfill，它里面有
    // `fetch(s.href)`。而我们的 README 与商店文案都写着
    // 「不发起任何网络请求」「产物里没有任何第三方库」——
    // 商店文案甚至明确邀请用户「解压就能验证」。
    //
    // 实测（真实 Chromium 147）：Chrome 原生支持
    // `link.relList.supports('modulepreload')`，那段 polyfill 的第一件事
    // 就是「不支持就 return」—— 于是它是**死代码**，运行时一个请求都不发。
    // 但**产物里有它**（用户 grep 得到 `fetch(`），而承诺是关于**产物**的。
    //
    // 根因是「承诺的对象」与「检查的对象」错位：源码那道守卫
    // （scripts/release-content.test.ts）扫的是源码，看不到构建工具注入的东西；
    // 出包那道闸（scripts/package-extension.js）只查 URL，查不到 `fetch`。
    // 于是这段 polyfill 从两道闸里都溜了过去。
    //
    // 关掉它没有代价：MV3 的 `minimum_chrome_version` 是 119，
    // 而 modulepreload 从 Chrome 73 起就原生支持了。
    modulePreload: {
      polyfill: false,
    },
    rollupOptions: {
      input: {
        content: resolve(__dirname, 'src/content/index.ts'),
        background: resolve(__dirname, 'src/background/index.ts'),
        options: resolve(__dirname, 'options.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
});
