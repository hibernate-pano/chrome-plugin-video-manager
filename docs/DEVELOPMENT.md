# 开发文档 (Development Guide)

本文档提供了项目的详细技术说明和开发指南。

## 📖 目录

- [架构概述](#架构概述)
- [核心模块](#核心模块)
- [构建系统](#构建系统)
- [测试策略](#测试策略)
- [调试技巧](#调试技巧)
- [性能优化](#性能优化)
- [常见问题](#常见问题)

## 🏗️ 架构概述

### 整体架构

```
┌─────────────────────────────────────┐
│         User Interaction            │
│    (Keyboard Events, Mouse Events)  │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│      Keyboard Handler               │
│  - Event Capture                    │
│  - Shortcut Matching                │
│  - Context Detection                │
└────────────┬────────────────────────┘
             │
      ┌──────┴──────┬──────────────────┐
      ▼             ▼                  ▼
┌──────────┐  ┌──────────┐   ┌────────────┐
│  Media   │  │ Playback │   │  Lightbox  │
│ Detector │  │Controller│   │  Manager   │
└──────────┘  └──────────┘   └────────────┘
      │             │                  │
      ▼             ▼                  ▼
┌─────────────────────────────────────┐
│         DOM / Media Elements        │
└─────────────────────────────────────┘
```

### 模块依赖关系

```
main.js
  ├── MediaDetector
  │   ├── dom.js (utils)
  │   └── debounce.js (utils)
  ├── SpeedIndicator
  ├── LightboxManager
  ├── PlaybackController
  │   └── SpeedIndicator
  └── KeyboardHandler
      ├── MediaDetector
      ├── PlaybackController
      ├── LightboxManager
      └── dom.js (utils)
```

## 🧩 核心模块

### 1. MediaDetector

**职责：**检测和管理页面上的媒体元素

**关键特性：**

- 缓存系统（2 秒过期）
- Shadow DOM 支持
- iframe 同源媒体检测
- IntersectionObserver 优化
- 递减间隔检测策略

**API：**

```javascript
class MediaDetector {
    constructor()
    getAllMediaElements()        // 获取所有媒体元素
    getTargetMedia(lightboxActive) // 获取目标媒体
    handleShadowDOMMedia()       // 处理 Shadow DOM
    setupMediaElementDetection() // 设置检测机制
    invalidateCache()            // 使缓存失效
}
```

**使用示例：**

```javascript
const detector = new MediaDetector();
detector.setupMediaElementDetection();
const media = detector.getTargetMedia(false);
```

### 2. SpeedIndicator

**职责：**管理速度指示器的显示

**关键特性：**

- 自动定位到媒体元素
- 1.5 秒自动隐藏
- 支持数字和文本显示
- 淡入淡出动画

**API：**

```javascript
class SpeedIndicator {
    constructor()
    show(speed, mediaElement) // 显示指示器
    hide()                    // 隐藏指示器
    destroy()                 // 销毁指示器
}
```

### 3. LightboxManager

**职责：**管理网页全屏模式

**关键特性：**

- 保存和恢复原始状态
- 控制栏可见性管理
- 事件监听器管理
- ESC 键退出支持

**API：**

```javascript
class LightboxManager {
    constructor()
    isActive()               // 检查是否激活
    enter(media)            // 进入全屏
    exit()                  // 退出全屏
    toggle(media)           // 切换全屏
    getVideo()              // 获取当前视频
}
```

### 4. PlaybackController

**职责：**控制媒体播放

**关键特性：**

- 速度控制（0.1x - 16x）
- 快进快退（5 秒步长）
- 音量控制（10%步长）
- 播放/暂停

**API：**

```javascript
class PlaybackController {
    constructor(indicator)
    handleSpeed(media, action)     // 处理速度
    handleSeek(video, direction, step) // 快进快退
    handleVolume(media, direction, step) // 音量控制
    handlePlayPause(media)         // 播放/暂停
}
```

### 5. KeyboardHandler

**职责：**处理键盘事件和快捷键

**关键特性：**

- 事件捕获阶段拦截
- 快捷键匹配
- 上下文检测（避免在输入框中触发）
- YouTube 特殊处理

**API：**

```javascript
class KeyboardHandler {
    constructor(shortcuts, mediaDetector, playbackController, lightboxManager)
    updateShortcuts(newShortcuts) // 更新快捷键
    handleKeyDown(e)              // 处理按键
    init()                        // 初始化
    destroy()                     // 清理
}
```

## 🔨 构建系统

> **注意**：本项目早期基于 esbuild，产出根目录 `content-bundled.js`。
> 现在的真实构建链是 **Vite + tsc + `scripts/copy-assets.js`**，仓库里
> 已没有 esbuild 入口，也不再生成 `content-bundled.js`。

### Vite 配置（vite.config.js）

```javascript
{
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        sourcemap: false,
        rollupOptions: {
            input: {
                content:   'src/content/index.ts',
                background:'src/background/index.ts',
                options:   'options.html',
                popup:     'popup.html',
            },
            output: {
                entryFileNames: '[name].js',            // dist/content.js ...
                chunkFileNames: 'chunks/[name]-[hash].js',
                assetFileNames: '[name].[ext]',
            },
        },
    },
}
```

四个入口与 `manifest.json` 中声明的 `content.js` / `background.js` /
`options.html` / `popup.html` 一一对应；`chunks/*.js` 对应 manifest 里的
`web_accessible_resources`。

### 构建流程（`pnpm run build`）

等价于：

```bash
tsc && vite build && node scripts/copy-assets.js
```

1. **类型检查**：`tsc`（`tsconfig.json` 已设 `noEmit: true`，只检查不出码）
2. **打包**：`vite build` 产出 `dist/{content,background,options,popup}.js`、`dist/chunks/*`、`dist/*.html`
3. **搬运静态资源**：`scripts/copy-assets.js` 把 `manifest.json`、`content-loader.js`、`icons/`、`_locales/`（`en` / `zh_CN` / `ja` / `ko`）复制进 `dist/`

### 打包发布（`pnpm run package:ext`）

把 `dist/` 打成 `release/video-speed-controller-v<manifest 版本号>.zip`
（脚本会先校验 `dist/manifest.json` 存在，并清掉 `.DS_Store`）。
`pnpm run build:ext` 是「构建 + 打包」两步合一。

### 开发 vs 生产

| 特性       | 开发模式（`pnpm dev`） | 生产模式（`pnpm run build`） |
| ---------- | --------------------- | --------------------------- |
| 入口       | vite dev server       | vite build → `dist/`         |
| 类型检查   | ❌ 不跑                 | ✅ `tsc` 先跑                 |
| HMR        | ✅                     | ❌                            |
| 产物       | 内存                  | `dist/` + `release/*.zip`    |

## 🧪 测试策略

### 测试金字塔

```
        /\
       /  \
      / E2E\         少量
     /------\
    /  集成  \       中等
   /----------\
  /   单元测试  \     大量
 /--------------\
```

### 单元测试

**目标**：测试独立的函数和类

**工具**：Jest + jsdom

**覆盖范围**：

- 工具函数（100%）
- 独立模块类（>80%）
- 边界情况和错误处理

**示例**：

```javascript
describe("debounce", () => {
  test("should debounce function calls", () => {
    const mockFn = jest.fn();
    const debouncedFn = debounce(mockFn, 100);

    debouncedFn();
    debouncedFn();

    jest.advanceTimersByTime(100);

    expect(mockFn).toHaveBeenCalledTimes(1);
  });
});
```

### 集成测试

**目标**：测试模块之间的交互

**示例**：

- KeyboardHandler + MediaDetector
- PlaybackController + SpeedIndicator

### E2E 测试（计划中）

**目标**：测试完整的用户流程

**工具**：Puppeteer

**场景**：

- 在真实网站上测试快捷键
- 测试全屏模式
- 测试设置页面

## 🐛 调试技巧

### Chrome DevTools

#### 1. 调试 Content Script

```javascript
// 在代码中添加断点
debugger;

// 或使用 console
console.log("Current media:", media);
console.table(mediaElements);
```

访问方式：

- 右键页面 → "检查"
- Sources → Content Scripts

#### 2. 调试 Service Worker

访问：`chrome://extensions/` → 点击"Service Worker"

#### 3. 查看存储

访问：DevTools → Application → Storage → Extension Storage

### 日志系统

**开发模式启用详细日志：**

```javascript
// src/utils/logger.js
const DEBUG = true;

export function log(...args) {
  if (DEBUG) {
    console.log("[VSC]", ...args);
  }
}
```

### 常用调试命令

```javascript
// 在控制台手动触发功能
// 获取当前目标媒体
document.querySelector("video");

// 查看缓存状态
// (在 content script 上下文中)
```

## ⚡ 性能优化

### 1. 缓存策略

**媒体元素缓存：**

```javascript
let mediaElementsCache = {
  timestamp: 0,
  elements: [],
  isStale: true,
  timeoutId: null,
};
```

- 2 秒过期时间
- 按需刷新
- WeakMap 存储元数据

### 2. 防抖优化

**事件处理防抖：**

```javascript
// 鼠标移动事件
const debouncedMouseHandler = enhancedDebounce(handleMouseEvent, 100);

// 媒体检测
const debouncedCheck = debounce(checkForMediaElements, 500);
```

### 3. 递减间隔检测

```javascript
const intervals = [500, 1000, 2000, 5000]; // 毫秒
```

初始频繁检查，找到媒体后降低频率。

### 4. IntersectionObserver

使用现代 API 优化可见性检测：

```javascript
new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    elementVisibilityMap.set(entry.target, entry.isIntersecting);
  });
});
```

### 性能指标

| 指标           | 目标值  |
| -------------- | ------- |
| 初始化时间     | < 100ms |
| 快捷键响应时间 | < 50ms  |
| 媒体检测时间   | < 200ms |
| 内存占用       | < 10MB  |

## 🔧 开发工具

### 推荐 VS Code 扩展

```json
{
  "recommendations": [
    "esbenp.prettier-vscode",
    "eamodio.gitlens"
  ]
}
```

> 仓库里没有 eslint 依赖也没有可跑的 `lint` 脚本，所以不推荐 eslint / jest 扩展。
> 类型检查由 `pnpm run build` 里的 `tsc` 负责。

### 常用脚本

以 [package.json](../package.json) 为准，当前实际存在的是：

```bash
pnpm dev            # vite dev server
pnpm build          # tsc + vite build + 复制静态资源 → dist/
pnpm test           # 单元测试 + CI 契约测试
pnpm test:coverage  # 单元测试 + 覆盖率
pnpm test:e2e       # 全部 Playwright（会先 build）
pnpm test:e2e:ext   # 只跑真实扩展 E2E（会先 build）
pnpm package:ext    # 把 dist/ 打成 release/ 下的 zip
```

改扩展后重新加载：在 `chrome://extensions/` 里点一下刷新即可，不需要额外的 reload 脚本。

## ❓ 常见问题

### Q: 为什么使用 IIFE 格式而不是 ES 模块？

A: `content-loader.js` 在 `document_start` 同步注册键盘桥接，再用动态 `import()` 加载
真正的 `content.js`。这样我们必然是 window 捕获阶段的第一个 keydown 监听器，
页面脚本无法用 `stopImmediatePropagation` 抢在我们前面吞键。`content.js` 本身是
ESM，由 vite 打包后通过 `import()` 加载，所以不受「content script 不支持 ESM」的限制。

### Q: 如何添加新的快捷键动作？

1. 在 `src/shared/types.ts` 的 `PersistedSettings['shortcuts']` 加字段，并给上默认值
2. 在 `src/content/keyboardController.ts` 的 `handleKeyDown` 里加匹配分支
3. 在 `src/shared/settings.ts` 的 `normalizePersistedSettings` 里加归一化
4. 更新 `_locales/*/messages.json`
5. 补 `src/content/keyboardController.test.ts`，并考虑在 `tests/e2e/real-extension.spec.js`
   加一条真加载扩展的用例

### Q: 如何优化扩展的性能？

`getCurrentVideo()` 在每次 keydown / pointerdown / play / ratechange 都会被调用，是最值得优化的热点。
现在它用 rAF 帧号 + MutationObserver 做了一帧内的快照缓存，命中缓存就不再遍历全页。
改动这个函数时注意别把跨 realm 支持弄丢：同源 iframe 里的节点属于另一个 realm，
`instanceof` 必须退回 `node.ownerDocument.defaultView` 的构造器。

## 📚 参考资料

- [Chrome Extension API](https://developer.chrome.com/docs/extensions/reference/)
- [Vite 文档](https://vitejs.dev/)
- [Vitest 文档](https://vitest.dev/)
- [Playwright 文档](https://playwright.dev/)
- [MDN Web APIs](https://developer.mozilla.org/en-US/docs/Web/API)

---

更新时间：2024-01-XX
