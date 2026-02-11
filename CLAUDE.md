# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Chrome 浏览器扩展（Manifest V3），通过键盘快捷键控制网页视频和音频的播放速度。支持 Shadow DOM、iframe 中的媒体元素检测，以及网页全屏（Lightbox）模式。

## 常用命令

```bash
npm run build          # 生产构建（压缩，无 sourcemap）
npm run watch          # 开发模式（监听文件变化，inline sourcemap）
npm run dev            # 完整开发流程（clean + build + watch）
npm test               # 运行全部测试
npm run test:watch     # 测试监听模式
npx jest tests/unit/utils/debounce.test.js   # 运行单个测试文件
npx jest --testNamePattern="debounce"        # 按名称匹配运行测试
npm run lint           # ESLint 检查
npm run lint:fix       # ESLint 自动修复
npm run format         # Prettier 格式化
```

## 构建系统

- esbuild 将 `src/main.js` 打包为 `content-bundled.js`（IIFE 格式，target: chrome90）
- `content.js` 是旧版未模块化的完整脚本（仍被 manifest.json 引用）；`content-bundled.js` 是新架构的构建产物
- 开发时修改 `src/` 下的文件，运行 `npm run build` 后在 Chrome 扩展页面重新加载

## 代码架构

```
src/main.js                     # 入口，初始化 VideoSpeedController，组装所有模块
src/modules/
  mediaDetector.js              # 媒体元素检测（缓存、IntersectionObserver、Shadow DOM、iframe）
  keyboardHandler.js            # 捕获阶段键盘事件处理，快捷键匹配
  playbackController.js         # 播放控制（速度、音量、进度跳转）
  lightbox.js                   # 网页全屏模式（非浏览器原生全屏）
  indicator.js                  # 速度变化时的屏幕提示 UI（Shadow DOM Web Component）
  keyboardHelp.js               # 快捷键帮助面板
src/utils/
  dom.js                        # DOM 工具（Shadow DOM 递归查询、视口检测、可编辑区域判断）
  storage.js                    # chrome.storage.sync 的 Promise 封装
  debounce.js                   # 防抖工具
  presets.js                    # 速度预设管理
  performance.js                # 性能监控
```

### 核心数据流

1. `VideoSpeedController.init()` 加载用户配置后，依次创建各模块实例
2. `KeyboardHandler` 在 **捕获阶段** 监听 `keydown`，匹配快捷键后调用 `PlaybackController` 或 `LightboxManager`
3. `MediaDetector` 通过带缓存（500ms 过期）的检测 + IntersectionObserver + MutationObserver 定位目标媒体
4. `storage.js` 的 `onShortcutsChanged()` 实时同步快捷键配置变更到 `KeyboardHandler`

### 媒体选择优先级

1. Lightbox 模式中的视频
2. 鼠标悬停的媒体
3. 最近交互且正在播放的媒体
4. 视口中尺寸最大的播放中媒体
5. 页面上第一个媒体元素

## 代码风格

- 4 空格缩进，单引号，必须分号，trailing comma: es5（Prettier + ESLint 强制）
- 文件名 camelCase，类名 PascalCase，函数/变量 camelCase
- 导入使用命名导出/导入，路径需包含 `.js` 扩展名
- 每个模块类需提供 `destroy()` 方法清理监听器和定时器
- 使用 `WeakMap` 存储元素关联数据防止内存泄漏
- chrome.storage API 统一使用 `storage.js` 中的 Promise 封装

## 测试

- Jest + jsdom 环境，Babel 转译
- 测试文件位于 `tests/unit/`，目录结构镜像 `src/`
- 使用 `jest.useFakeTimers()` 测试防抖和定时器逻辑

## 国际化

翻译文件在 `_locales/en/` 和 `_locales/zh_CN/`，manifest.json 中使用 `__MSG_extName__` 格式引用。
