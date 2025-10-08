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

### esbuild 配置

```javascript
{
    entryPoints: ['src/main.js'],
    bundle: true,
    outfile: 'content-bundled.js',
    format: 'iife',
    target: 'chrome90',
    platform: 'browser',
    sourcemap: isWatch ? 'inline' : false,
    minify: !isWatch
}
```

### 构建流程

1. **入口**：`src/main.js`
2. **打包**：esbuild 将所有模块打包成单文件
3. **格式**：IIFE（立即调用函数表达式）
4. **输出**：`content-bundled.js`

### 开发 vs 生产

| 特性       | 开发模式 | 生产模式 |
| ---------- | -------- | -------- |
| 代码压缩   | ❌       | ✅       |
| Source Map | Inline   | ❌       |
| 文件监听   | ✅       | ❌       |
| 构建速度   | 快       | 慢       |

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
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "orta.vscode-jest",
    "eamodio.gitlens"
  ]
}
```

### 有用的 npm 脚本

```bash
# 快速重新加载扩展
npm run reload

# 生成测试覆盖率报告
npm run coverage

# 性能分析
npm run analyze
```

## ❓ 常见问题

### Q: 为什么使用 IIFE 格式而不是 ES 模块？

A: Chrome 扩展的 content scripts 目前不支持 ES 模块的 `import/export`，需要打包成 IIFE 格式。

### Q: 如何添加新的快捷键动作？

1. 在 `defaultShortcuts` 中添加新键
2. 在 `KeyboardHandler.handleKeyDown` 中添加处理逻辑
3. 更新国际化文件
4. 添加测试

### Q: 如何调试构建后的代码？

在开发模式下启用 source map：

```bash
npm run watch
```

### Q: 如何优化扩展的性能？

1. 使用缓存减少 DOM 查询
2. 防抖频繁的事件
3. 使用 IntersectionObserver
4. 按需初始化功能

## 📚 参考资料

- [Chrome Extension API](https://developer.chrome.com/docs/extensions/reference/)
- [esbuild 文档](https://esbuild.github.io/)
- [Jest 文档](https://jestjs.io/)
- [MDN Web APIs](https://developer.mozilla.org/en-US/docs/Web/API)

---

更新时间：2024-01-XX
