# 视频速度控制器 - 重构设计方案

**日期**：2026-03-03
**版本**：v4.0
**状态**：已批准

## 1. 项目概述

### 目标
将现有 Chrome 视频速度控制器扩展重构为现代化的 React + TypeScript 版本，聚焦核心功能（网页全屏 + 播放速度控制），为 Chrome 商店发布和开源做准备。

### 核心功能范围
| 功能 | 说明 |
|------|------|
| 播放速度控制 | 增加/减少/重置 |
| 音量控制 | 增强/减弱/静音 |
| 播放/暂停 | 切换 |
| 快进/快退 | 5秒/10秒/30秒 |
| 网页全屏 | 自定义科幻感 UI |
| 快捷键自定义 | 用户配置 |
| 速度预设 | 快速切换常用速度 |

### 发布目标
- Chrome 商店发布
- 开源社区贡献

---

## 2. 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18.2 | UI 框架 |
| TypeScript | 5.0 | 类型安全 |
| Tailwind CSS | 3.4 | 样式系统 |
| Framer Motion | 11.0 | 动画库 |
| Zustand | 4.5 | 状态管理 |
| Vite | 5.0 | 构建工具 |
| CRXJS | 8.0 | Chrome 扩展打包 |

**选择理由：**
- Framer Motion 提供更流畅的动画效果和更简洁的 API
- Zustand 轻量且 TypeScript 友好
- Tailwind CSS 配合自定义 CSS 变量实现科幻风格

---

## 3. 目录结构

```
src/
├── components/
│   ├── Lightbox/           # 全屏组件
│   │   ├── Lightbox.tsx    # 主容器
│   │   ├── VideoPlayer.tsx # 视频播放器封装
│   │   ├── Controls.tsx    # 控制栏
│   │   ├── ProgressBar.tsx # 进度条
│   │   ├── VolumeSlider.tsx# 音量滑块
│   │   └── SpeedButton.tsx # 速度按钮
│   ├── HUD/                # 屏幕中央指示器
│   │   ├── HUD.tsx         # 主组件
│   │   └── SpeedDisplay.tsx# 速度显示
│   └── Settings/           # 设置页面
│       ├── SettingsPage.tsx
│       └── ShortcutEditor.tsx
├── core/                   # 核心逻辑（与 React 无关）
│   ├── mediaDetector.ts    # 媒体元素检测
│   ├── keyboardHandler.ts  # 键盘事件处理
│   └── playbackController.ts# 播放控制
├── stores/                 # Zustand 状态管理
│   ├── mediaStore.ts       # 媒体状态
│   ├── settingsStore.ts    # 用户设置
│   └── uiStore.ts          # UI 状态
├── hooks/                  # React Hooks
│   ├── useMedia.ts         # 媒体操作
│   ├── useKeyboard.ts      # 键盘绑定
│   └── useAnimation.ts    # 动画配置
├── styles/                 # 样式文件
│   └── globals.css
├── background.ts          # Service Worker
├── content.tsx             # Content Script 入口
└── options.tsx            # Options Page 入口
```

---

## 4. UI/UX 设计

### 4.1 Lightbox 全屏模式

**视觉风格：科幻赛博朋克**

设计特点：
- **毛玻璃效果**：控制栏使用 backdrop-filter: blur(20px) 半透明模糊背景
- **霓虹边框**：视频周围淡淡的青色/紫色霓虹光晕
- **渐变进度条**：从左到右的渐变色（青色 → 紫色）
- **动态光效**：按钮 hover 时发出柔和的光晕
- **自动隐藏**：控制栏 3 秒无操作后自动隐藏，鼠标移动时显示

**布局：**
```
┌─────────────────────────────────────────────────────────────┐
│  ═══════════════════════════════════════════════════════   │
│                                                              │
│                                                              │
│                         ┌─────────┐                         │
│                         │         │                         │
│                         │  视频   │                         │
│                         │         │                         │
│                         └─────────┘                         │
│                                                              │
│  ═══════════════════════════════════════════════════════   │
│  ▶ ▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐ 12:34  🔊 ━━━  │
│  1.5x                                          1.5x        │
└─────────────────────────────────────────────────────────────┘
```

**控制栏元素：**
- 播放/暂停按钮
- 进度条（可拖拽）
- 当前时间 / 总时长
- 音量滑块
- 速度按钮（显示当前速度，点击可切换预设）
- 退出全屏按钮

### 4.2 HUD 指示器

在屏幕中央显示速度/音量变化：
- 速度变化：显示 "1.5x" 大数字，带放大缩小动画
- 音量变化：显示音量百分比
- 快进快退：显示 "⏩ +10s" 或 "⏪ -10s"

### 4.3 设置页面

简洁的设置界面：
- 快捷键配置表格
- 预设速度管理
- 主题设置（可选）

---

## 5. 组件层级

```
App (Content Script)
├── MediaProvider (Context)
│   ├── HUD (显示速度/音量变化)
│   │   └── AnimatedNumber
│   └── Lightbox (全屏模式)
│       ├── VideoLayer
│       │   └── VideoPlayer
│       ├── ControlsOverlay
│       │   ├── PlayPauseButton
│       │   ├── ProgressBar
│       │   ├── TimeDisplay
│       │   ├── VolumeControl
│       │   └── SpeedButton
│       └── CloseButton
```

---

## 6. 数据流

```
用户按键
   │
   ▼
KeyboardHandler (core/)
   │
   ├── 更新 MediaStore (Zustand)
   │
   ├── 触发 UI 更新
   │   ├── HUD 显示
   │   └── Lightbox Controls
   │
   └── 执行播放控制
       └── HTMLMediaElement API
```

---

## 7. 性能优化

- **React.memo** 避免不必要的重渲染
- **CSS transform/opacity** 用于动画（GPU 加速）
- **RequestAnimationFrame** 同步视频进度
- **Shadow DOM** 隔离样式，防止与网站冲突

---

## 8. 包大小预估

| 模块 | 大小 |
|------|------|
| React + ReactDOM | ~45KB |
| Tailwind ( purged ) | ~15KB |
| Framer Motion | ~30KB |
| Zustand | ~1KB |
| 业务代码 | ~50KB |
| **总计** | ~140KB |

---

## 9. 默认快捷键

| 功能 | 快捷键 |
|------|--------|
| 加速 | `=` |
| 减速 | `-` |
| 重置速度 | `0` |
| 播放/暂停 | `空格` |
| 网页全屏 | `f` |
| 快进 10s | `→` |
| 快退 10s | `←` |
| 音量增加 | `[` |
| 音量减少 | `]` |
| 静音切换 | `m` |

---

## 10. 测试策略

- **Vitest**：单元测试（核心逻辑）
- **Playwright**：E2E 测试（关键用户流程）
- 目标覆盖率：>80%

---

## 11. 迁移计划

1. 创建新的 React 项目结构
2. 实现核心逻辑（mediaDetector, keyboardHandler, playbackController）
3. 实现 Lightbox 组件（科幻 UI）
4. 实现 HUD 组件
5. 实现设置页面
6. 配置构建和打包
7. 测试和调试
8. 发布到 Chrome 商店
