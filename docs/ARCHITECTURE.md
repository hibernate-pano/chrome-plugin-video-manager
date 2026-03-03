# 架构文档：React + TypeScript 重构版本（v2.0）

本文档详细说明了 v2.0 版本的技术架构、设计决策和实现细节。

## 目录

- [概述](#概述)
- [技术栈](#技术栈)
- [架构设计](#架构设计)
- [目录结构](#目录结构)
- [核心模块](#核心模块)
- [状态管理](#状态管理)
- [组件设计](#组件设计)
- [性能优化](#性能优化)
- [测试策略](#测试策略)
- [构建流程](#构建流程)
- [设计决策](#设计决策)

## 概述

v2.0 是对原版 JavaScript 实现的完全重构，采用现代前端技术栈。主要目标：

1. **学习实践**：掌握 React、TypeScript、Tailwind CSS 等主流技术
2. **可维护性**：通过类型安全和组件化提升代码质量
3. **用户体验**：提供更精美的 UI 和更流畅的动画
4. **可扩展性**：建立可扩展的架构以支持未来功能

### 设计原则

- **渐进式增强**：保留原有核心功能，逐步添加新特性
- **性能优先**：确保重构不降低性能
- **向后兼容**：自动迁移用户设置
- **测试驱动**：85%+ 测试覆盖率
- **可访问性**：遵循 WCAG 标准

## 技术栈

### 核心技术

| 技术 | 版本 | 用途 | 包大小 |
|------|------|------|--------|
| React | 18.2+ | UI 框架 | ~45KB |
| TypeScript | 5.0+ | 类型系统 | 0KB（编译时）|
| Tailwind CSS | 3.4+ | CSS 框架 | ~50KB |
| shadcn/ui | latest | UI 组件库 | ~30KB |
| React Spring | 9.7+ | 动画库 | ~20KB |
| Zustand | 4.4+ | 状态管理 | ~1KB |

### 开发工具

| 工具 | 版本 | 用途 |
|------|------|------|
| Vite | 5.0+ | 构建工具 |
| CRXJS | 2.0+ | Chrome 扩展插件 |
| Vitest | 1.0+ | 单元测试 |
| Jest | 29.0+ | 扩展 API 测试 |
| Playwright | 1.40+ | E2E 测试 |
| ESLint | 8.0+ | 代码检查 |
| Prettier | 3.0+ | 代码格式化 |
| pnpm | 8.0+ | 包管理器 |

### 为什么选择这些技术？

**React 18**
- ✅ 主流 UI 框架，生态成熟
- ✅ 组件化开发，易于维护
- ✅ Hooks API，逻辑复用
- ⚠️ 包大小较大（~45KB）

**TypeScript**
- ✅ 类型安全，减少运行时错误
- ✅ 更好的 IDE 支持
- ✅ 自文档化代码
- ⚠️ 学习曲线

**Tailwind CSS 3.4**
- ✅ 实用优先，快速开发
- ✅ JIT 编译，按需生成
- ✅ 响应式设计
- ⚠️ HTML 类名较多

**shadcn/ui**
- ✅ 可访问性（基于 Radix UI）
- ✅ 可定制（直接修改源码）
- ✅ 无运行时依赖
- ✅ Tailwind CSS 集成

**React Spring**
- ✅ 物理动画，更自然
- ✅ 性能优秀（GPU 加速）
- ✅ API 简洁
- ⚠️ 包大小（~20KB）

**Zustand**
- ✅ 极轻量（~1KB）
- ✅ API 简单
- ✅ TypeScript 友好
- ✅ DevTools 支持

**Vite + CRXJS**
- ✅ 快速构建（esbuild）
- ✅ HMR 热更新
- ✅ Chrome 扩展支持
- ✅ 开发体验好

## 架构设计

### 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                     Chrome Extension                         │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Manifest   │  │  Background  │  │    Assets    │      │
│  │   (V3 JSON)  │  │   Service    │  │   (Icons)    │      │
│  └──────────────┘  │   Worker     │  └──────────────┘      │
│                     └──────────────┘                         │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Options Page (React App)                  │  │
│  ├───────────────────────────────────────────────────────┤  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │  │
│  │  │  Settings   │  │   Shortcuts │  │    Help     │  │  │
│  │  │   Store     │  │    Form     │  │    Tab      │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │  │
│  │         │                 │                 │         │  │
│  │         └─────────────────┴─────────────────┘         │  │
│  │                      │                                 │  │
│  │              ┌───────▼────────┐                       │  │
│  │              │  chrome.storage │                       │  │
│  │              └────────────────┘                       │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │           Content Script (Hybrid Architecture)         │  │
│  ├───────────────────────────────────────────────────────┤  │
│  │                                                         │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │         React UI Layer (Shadow DOM)             │  │  │
│  │  ├─────────────────────────────────────────────────┤  │  │
│  │  │  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │  │  │
│  │  │  │   HUD    │  │ Lightbox │  │   Keyboard   │  │  │  │
│  │  │  │Component │  │ Overlay  │  │  Help Modal  │  │  │  │
│  │  │  └──────────┘  └──────────┘  └──────────────┘  │  │  │
│  │  │       │             │                │          │  │  │
│  │  │       └─────────────┴────────────────┘          │  │  │
│  │  │                     │                            │  │  │
│  │  │              ┌──────▼──────┐                    │  │  │
│  │  │              │   Zustand   │                    │  │  │
│  │  │              │    Stores   │                    │  │  │
│  │  │              └──────┬──────┘                    │  │  │
│  │  └─────────────────────┼─────────────────────────┘  │  │
│  │                        │                             │  │
│  │  ┌─────────────────────▼─────────────────────────┐  │  │
│  │  │      Core Logic Layer (TypeScript)            │  │  │
│  │  ├───────────────────────────────────────────────┤  │  │
│  │  │  ┌──────────────┐  ┌──────────────────────┐  │  │  │
│  │  │  │    Media     │  │     Keyboard         │  │  │  │
│  │  │  │   Detector   │  │     Handler          │  │  │  │
│  │  │  └──────────────┘  └──────────────────────┘  │  │  │
│  │  │  ┌──────────────┐  ┌──────────────────────┐  │  │  │
│  │  │  │   Playback   │  │    Lightbox          │  │  │  │
│  │  │  │  Controller  │  │    Manager           │  │  │  │
│  │  │  └──────────────┘  └──────────────────────┘  │  │  │
│  │  └───────────────────────────────────────────────┘  │  │
│  │                                                       │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### 架构分层

#### 1. 扩展层（Extension Layer）
- **Manifest V3**：定义扩展权限、内容脚本、后台服务
- **Background Service Worker**：处理扩展生命周期事件
- **Assets**：图标、样式表等静态资源

#### 2. UI 层（UI Layer）
- **Options Page**：完全 React 化的设置页面
- **Content Script UI**：React 组件渲染在 Shadow DOM 中
  - HUD 指示器
  - Lightbox 全屏覆盖层
  - 键盘帮助模态框

#### 3. 状态管理层（State Management Layer）
- **Zustand Stores**：管理 UI 状态、媒体状态、设置
- **Chrome Storage**：持久化用户设置
- **React Context**：简单的跨组件状态共享（可选）

#### 4. 核心逻辑层（Core Logic Layer）
- **Media Detector**：媒体元素检测（TypeScript 重写）
- **Keyboard Handler**：键盘事件处理（TypeScript 重写）
- **Playback Controller**：播放控制逻辑
- **Lightbox Manager**：全屏模式管理

### 数据流

```
用户操作
   │
   ▼
键盘事件 ──────────────────────────────────┐
   │                                       │
   ▼                                       │
Keyboard Handler                           │
   │                                       │
   ▼                                       │
Zustand Store 更新                         │
   │                                       │
   ├──────────────┬──────────────┐        │
   ▼              ▼              ▼        │
Media Store   HUD Store    Settings Store │
   │              │              │        │
   ▼              ▼              ▼        │
React 组件自动重新渲染                      │
   │              │              │        │
   ▼              ▼              ▼        │
DOM 更新      HUD 显示      设置保存       │
   │              │              │        │
   └──────────────┴──────────────┴────────┘
                  │
                  ▼
            Chrome Storage
```

## 目录结构

```
src-react/
├── options/                    # 设置页面
│   ├── components/            # React 组件
│   │   ├── OptionsLayout.tsx  # 页面布局
│   │   ├── Header.tsx         # 页头
│   │   ├── ShortcutsTab.tsx   # 快捷键标签页
│   │   ├── PresetsTab.tsx     # 预设标签页
│   │   ├── AnimationTab.tsx   # 动画标签页
│   │   └── HelpTab.tsx        # 帮助标签页
│   ├── OptionsApp.tsx         # 主应用
│   ├── main.tsx               # 入口文件
│   └── styles/                # 样式文件
│       └── index.css
├── content/                    # 内容脚本
│   ├── components/            # UI 组件
│   │   ├── HUD.tsx            # HUD 主组件
│   │   ├── SpeedIndicator.tsx # 速度指示器
│   │   ├── VolumeIndicator.tsx# 音量指示器
│   │   ├── SeekIndicator.tsx  # 跳转指示器
│   │   ├── Lightbox.tsx       # 全屏模式
│   │   ├── LightboxControls.tsx# 全屏控制条
│   │   ├── KeyboardHelpModal.tsx# 键盘帮助
│   │   └── ShortcutList.tsx   # 快捷键列表
│   ├── hooks/                 # 自定义 Hooks
│   │   ├── useMediaDetector.ts
│   │   ├── useKeyboardHandler.ts
│   │   └── usePlaybackController.ts
│   ├── ContentApp.tsx         # 主应用
│   ├── main.tsx               # 入口文件
│   └── styles/                # 样式文件
│       └── index.css
├── shared/                     # 共享代码
│   ├── components/            # 共享组件
│   │   ├── ui/                # shadcn/ui 组件
│   │   │   ├── button.tsx
│   │   │   ├── input.tsx
│   │   │   ├── label.tsx
│   │   │   └── tabs.tsx
│   │   └── LanguageSelector.tsx
│   ├── stores/                # Zustand 状态管理
│   │   ├── mediaStore.ts      # 媒体状态
│   │   ├── hudStore.ts        # HUD 状态
│   │   └── settingsStore.ts   # 设置状态
│   ├── modules/               # 核心逻辑（TypeScript）
│   │   ├── mediaDetector.ts   # 媒体检测
│   │   ├── keyboardHandler.ts # 键盘处理
│   │   ├── playbackController.ts# 播放控制
│   │   └── lightboxManager.ts # 全屏管理
│   ├── utils/                 # 工具函数
│   │   ├── chromeStorage.ts   # Chrome Storage 封装
│   │   ├── dom.ts             # DOM 操作
│   │   ├── migration.ts       # 设置迁移
│   │   └── animationFallback.ts# 动画降级
│   ├── types/                 # TypeScript 类型
│   │   ├── shortcuts.ts       # 快捷键类型
│   │   ├── media.ts           # 媒体类型
│   │   ├── hud.ts             # HUD 类型
│   │   └── storage.ts         # 存储类型
│   ├── lib/                   # 库函数
│   │   ├── i18n.ts            # 国际化
│   │   └── utils.ts           # 通用工具
│   └── hooks/                 # 共享 Hooks
│       └── useAnimationConfig.ts
├── background/                 # 后台服务
│   └── index.ts
├── tests/                      # 测试文件
│   ├── unit/                  # 单元测试
│   ├── integration/           # 集成测试
│   ├── e2e/                   # E2E 测试
│   ├── compatibility/         # 兼容性测试
│   ├── chrome-api/            # Chrome API Mock
│   └── mocks/                 # 测试 Mock
├── _locales/                   # 国际化文件
│   ├── en/
│   │   └── messages.json
│   └── zh_CN/
│       └── messages.json
├── manifest.json               # Manifest V3 配置
├── vite.config.ts             # Vite 配置
├── tailwind.config.ts         # Tailwind 配置
├── tsconfig.json              # TypeScript 配置
├── vitest.config.ts           # Vitest 配置
├── jest.config.cjs            # Jest 配置
├── playwright.config.ts       # Playwright 配置
└── package.json               # 依赖管理
```

### 目录组织原则

1. **按功能分组**：options、content、shared
2. **按类型分组**：components、stores、utils、types
3. **共享优先**：通用代码放在 shared 目录
4. **测试就近**：测试文件放在 `__tests__` 目录或同级
5. **类型集中**：所有类型定义放在 types 目录


## 核心模块

### 1. 媒体检测（Media Detector）

**文件**：`src-react/shared/modules/mediaDetector.ts`

**职责**：
- 检测页面上的所有媒体元素（video、audio）
- 支持 Shadow DOM 和 iframe
- 缓存机制优化性能
- 使用 MutationObserver 监听动态加载

**关键特性**：
```typescript
export class MediaDetector {
  private cache: Map<string, CacheEntry>;
  private mutationObserver: MutationObserver;

  // 获取所有媒体元素
  getAllMediaElements(): HTMLMediaElement[] {
    // 1. 检查缓存
    // 2. 查询 document
    // 3. 查询 Shadow DOM
    // 4. 查询 iframe
    // 5. 缓存结果
  }

  // 获取当前活跃媒体
  getCurrentMedia(): HTMLMediaElement | null {
    // 优先级：全屏 > 最近交互 > 视口中最大
  }
}
```

**性能优化**：
- ✅ 500ms 缓存过期时间
- ✅ WeakMap 存储元素数据
- ✅ IntersectionObserver 检测可见性
- ✅ 递减间隔检查（100ms → 500ms → 1000ms）

### 2. 键盘处理（Keyboard Handler）

**文件**：`src-react/shared/modules/keyboardHandler.ts`

**职责**：
- 监听键盘事件
- 匹配快捷键
- 触发相应操作
- 防止与网站快捷键冲突

**关键特性**：
```typescript
export class KeyboardHandler {
  private shortcuts: Map<string, ShortcutAction>;

  // 处理按键事件
  handleKeyPress(event: KeyboardEvent): void {
    // 1. 检查是否在输入框中
    // 2. 匹配快捷键
    // 3. 执行操作
    // 4. 阻止默认行为
  }

  // 更新快捷键配置
  updateShortcuts(shortcuts: Record<ShortcutAction, string>): void {
    // 重新构建快捷键映射
  }
}
```

**集成 Zustand**：
```typescript
// src-react/shared/modules/keyboardHandlerWithStore.ts
export function createKeyboardHandlerWithStore(
  mediaStore: MediaStore,
  hudStore: HUDStore,
  settingsStore: SettingsStore
): KeyboardHandler {
  // 创建处理器并连接 Store
}
```

### 3. 播放控制（Playback Controller）

**文件**：`src-react/shared/modules/playbackController.ts`

**职责**：
- 控制媒体播放速度
- 控制音量
- 控制播放/暂停
- 控制跳转

**关键特性**：
```typescript
export class PlaybackController {
  // 设置播放速度
  setPlaybackRate(media: HTMLMediaElement, rate: number): void {
    media.playbackRate = Math.max(0.1, Math.min(16, rate));
  }

  // 调整音量
  adjustVolume(media: HTMLMediaElement, delta: number): void {
    media.volume = Math.max(0, Math.min(1, media.volume + delta));
  }

  // 跳转
  seek(media: HTMLMediaElement, seconds: number): void {
    media.currentTime = Math.max(0, Math.min(
      media.duration,
      media.currentTime + seconds
    ));
  }
}
```

### 4. Lightbox 管理（Lightbox Manager）

**文件**：`src-react/shared/modules/lightboxManager.ts`

**职责**：
- 管理全屏模式
- 处理视频容器
- 管理控制条显示

**关键特性**：
```typescript
export class LightboxManager {
  // 进入全屏
  enter(media: HTMLMediaElement): void {
    // 1. 创建全屏容器
    // 2. 移动视频到容器
    // 3. 添加控制条
    // 4. 监听键盘事件
  }

  // 退出全屏
  exit(): void {
    // 1. 移动视频回原位置
    // 2. 移除容器
    // 3. 清理事件监听
  }
}
```

## 状态管理

### Zustand Store 设计

#### 1. Media Store

**文件**：`src-react/shared/stores/mediaStore.ts`

**状态**：
```typescript
interface MediaStore {
  // 状态
  currentMedia: HTMLMediaElement | null;
  playbackRate: number;
  volume: number;
  isPaused: boolean;
  isFullscreen: boolean;

  // Actions
  setCurrentMedia: (media: HTMLMediaElement | null) => void;
  setPlaybackRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  togglePlayPause: () => void;
  toggleFullscreen: () => void;
  seekForward: (seconds: number) => void;
  seekBackward: (seconds: number) => void;
}
```

**使用示例**：
```typescript
// 在组件中使用
const { playbackRate, setPlaybackRate } = useMediaStore();

// 更新速度
setPlaybackRate(1.5);
```

#### 2. HUD Store

**文件**：`src-react/shared/stores/hudStore.ts`

**状态**：
```typescript
interface HUDStore {
  visible: boolean;
  type: 'speed' | 'volume' | 'seek' | 'reset' | null;
  value: number;
  timeoutId: number | null;

  show: (type: HUDStore['type'], value: number) => void;
  hide: () => void;
}
```

**自动隐藏逻辑**：
```typescript
show: (type, value) => {
  // 清除旧的定时器
  if (timeoutId) clearTimeout(timeoutId);

  // 设置新的定时器
  const newTimeoutId = setTimeout(() => {
    set({ visible: false, type: null });
  }, 2000);

  set({ visible: true, type, value, timeoutId: newTimeoutId });
}
```

#### 3. Settings Store

**文件**：`src-react/shared/stores/settingsStore.ts`

**状态**：
```typescript
interface SettingsStore {
  shortcuts: Record<ShortcutAction, string>;
  presets: SpeedPreset[];
  animationSpeed: AnimationSpeed;
  language: string;

  updateShortcut: (action: ShortcutAction, key: string) => void;
  resetShortcuts: () => void;
  addPreset: (preset: SpeedPreset) => void;
  removePreset: (id: string) => void;
  setAnimationSpeed: (speed: AnimationSpeed) => void;
  setLanguage: (lang: string) => void;
}
```

**持久化**：
```typescript
export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      // 状态和 actions
    }),
    {
      name: 'vsc-settings',
      storage: createJSONStorage(() => ({
        getItem: async (name) => {
          const data = await chrome.storage.sync.get(name);
          return data[name] || null;
        },
        setItem: async (name, value) => {
          await chrome.storage.sync.set({ [name]: value });
        },
        removeItem: async (name) => {
          await chrome.storage.sync.remove(name);
        },
      })),
    }
  )
);
```

### Chrome Storage 封装

**文件**：`src-react/shared/utils/chromeStorage.ts`

**工具函数**：
```typescript
// 安全的读取
export async function safeStorageGet<T>(
  key: string,
  defaultValue: T
): Promise<T> {
  try {
    const result = await chrome.storage.sync.get(key);
    return result[key] ?? defaultValue;
  } catch (error) {
    console.error(`Storage get error for key ${key}:`, error);
    return defaultValue;
  }
}

// 安全的写入（带降级）
export async function safeStorageSet(
  key: string,
  value: unknown
): Promise<boolean> {
  try {
    await chrome.storage.sync.set({ [key]: value });
    return true;
  } catch (error) {
    // 降级到 local storage
    try {
      await chrome.storage.local.set({ [key]: value });
      return true;
    } catch (localError) {
      return false;
    }
  }
}
```

## 组件设计

### React 组件层次

#### Options Page 组件树

```
OptionsApp
├── SettingsProvider (Zustand)
│   └── OptionsLayout
│       ├── Header
│       │   ├── Logo
│       │   └── LanguageSelector
│       ├── Tabs (shadcn/ui)
│       │   ├── ShortcutsTab
│       │   │   ├── ShortcutForm
│       │   │   │   ├── ShortcutInput
│       │   │   │   └── ConflictWarning
│       │   │   └── ActionButtons
│       │   ├── PresetsTab
│       │   │   ├── PresetList
│       │   │   │   └── PresetCard
│       │   │   └── AddPresetButton
│       │   ├── AnimationTab
│       │   │   ├── AnimationSpeedSelector
│       │   │   └── AnimationPreview
│       │   └── HelpTab
│       │       ├── UsageGuide
│       │       └── FAQ
│       └── Footer
```

#### Content Script 组件树

```
ContentApp
├── MediaStateProvider (Zustand)
│   ├── HUDPortal (React Portal)
│   │   └── HUD (Shadow DOM)
│   │       ├── SpeedIndicator
│   │       │   └── AnimatedNumber (React Spring)
│   │       ├── VolumeIndicator
│   │       │   └── VolumeBar (React Spring)
│   │       └── SeekIndicator
│   ├── LightboxPortal (React Portal)
│   │   └── Lightbox (Shadow DOM)
│   │       ├── VideoContainer
│   │       │   └── AnimatedWrapper (React Spring)
│   │       ├── Controls
│   │       │   ├── PlayPauseButton
│   │       │   ├── ProgressBar
│   │       │   └── VolumeControl
│   │       └── CloseButton
│   └── KeyboardHelpPortal (React Portal)
│       └── KeyboardHelpModal (Shadow DOM)
│           ├── ShortcutList
│           └── CloseButton
```

### 关键组件实现

#### HUD 组件

**文件**：`src-react/content/components/HUD.tsx`

```typescript
export function HUD() {
  const { visible, type, value } = useHUDStore();
  const animationConfig = useAnimationConfig();

  // React Spring 动画
  const fadeAnimation = useSpring({
    opacity: visible ? 1 : 0,
    transform: visible ? 'scale(1)' : 'scale(0.9)',
    config: animationConfig,
  });

  if (!visible) return null;

  return createPortal(
    <animated.div style={fadeAnimation} className="...">
      {type === 'speed' && <SpeedIndicator value={value} />}
      {type === 'volume' && <VolumeIndicator value={value} />}
      {type === 'seek' && <SeekIndicator value={value} />}
    </animated.div>,
    shadowRoot
  );
}
```

#### Lightbox 组件

**文件**：`src-react/content/components/Lightbox.tsx`

```typescript
export function Lightbox() {
  const { isFullscreen } = useMediaStore();
  const animationConfig = useAnimationConfig();

  // 缩放动画
  const scaleAnimation = useSpring({
    scale: isFullscreen ? 1 : 0,
    opacity: isFullscreen ? 1 : 0,
    config: animationConfig,
  });

  if (!isFullscreen) return null;

  return createPortal(
    <animated.div style={scaleAnimation} className="...">
      <VideoContainer />
      <LightboxControls />
    </animated.div>,
    shadowRoot
  );
}
```

### Shadow DOM 集成

**为什么使用 Shadow DOM？**
- ✅ 样式隔离：避免与网站样式冲突
- ✅ DOM 隔离：避免被网站 JavaScript 干扰
- ✅ 封装性：清晰的边界

**实现方式**：
```typescript
// 创建 Shadow Root
const container = document.createElement('div');
container.id = 'vsc-root';
document.body.appendChild(container);

const shadowRoot = container.attachShadow({ mode: 'open' });

// 注入样式
const style = document.createElement('style');
style.textContent = tailwindStyles;
shadowRoot.appendChild(style);

// 创建 React Root
const root = createRoot(shadowRoot);
root.render(<ContentApp />);
```


## 性能优化

### 1. 代码分割

**策略**：
- ✅ 设置页面和内容脚本分离
- ✅ 使用 React.lazy 懒加载组件
- ✅ 使用 Suspense 处理加载状态

**实现**：
```typescript
// 懒加载设置页面标签
const PresetsTab = lazy(() => import('./components/PresetsTab'));
const AnimationTab = lazy(() => import('./components/AnimationTab'));
const HelpTab = lazy(() => import('./components/HelpTab'));

// 使用 Suspense
<Suspense fallback={<LoadingSpinner />}>
  <PresetsTab />
</Suspense>
```

**效果**：
- 设置页面：~150KB
- 内容脚本：~200KB
- 总体：~350KB（vs 原版 22KB）

### 2. React 渲染优化

**策略**：
- ✅ 使用 React.memo 优化组件
- ✅ 使用 useMemo 缓存计算结果
- ✅ 使用 useCallback 缓存函数
- ✅ 避免不必要的 re-render

**示例**：
```typescript
// 使用 React.memo
export const SpeedIndicator = memo(({ value }: Props) => {
  // 组件实现
});

// 使用 useMemo
const sortedPresets = useMemo(() => {
  return presets.sort((a, b) => a.speed - b.speed);
}, [presets]);

// 使用 useCallback
const handleSpeedChange = useCallback((speed: number) => {
  setPlaybackRate(speed);
}, [setPlaybackRate]);
```

### 3. 包大小优化

**策略**：
- ✅ Tree shaking（移除未使用代码）
- ✅ Tailwind CSS 清除（只包含使用的类）
- ✅ 压缩和混淆
- ✅ 移除 source map（生产环境）

**Vite 配置**：
```typescript
// vite.config.ts
export default defineConfig({
  build: {
    minify: 'esbuild',
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'ui-vendor': ['@radix-ui/react-tabs', '@radix-ui/react-label'],
        },
      },
    },
  },
});
```

**Tailwind 配置**：
```typescript
// tailwind.config.ts
export default {
  content: [
    './src-react/**/*.{ts,tsx}',
  ],
  // 只包含使用的类
};
```

### 4. 性能监控

**指标**：
- 媒体检测时间：~5ms
- 键盘响应时间：<16ms（60fps）
- HUD 渲染时间：~15ms
- 内存占用：~8MB

**监控工具**：
```typescript
// 性能标记
performance.mark('media-detection-start');
const media = detector.getAllMediaElements();
performance.mark('media-detection-end');

performance.measure(
  'media-detection',
  'media-detection-start',
  'media-detection-end'
);

const measure = performance.getEntriesByName('media-detection')[0];
console.log(`Media detection took ${measure.duration}ms`);
```

### 5. 动画性能

**策略**：
- ✅ 使用 GPU 加速属性（transform、opacity）
- ✅ 避免触发 layout（width、height）
- ✅ 使用 React Spring 物理动画
- ✅ 使用 will-change 提示浏览器

**示例**：
```typescript
// 使用 transform 而非 left/top
const animation = useSpring({
  transform: visible ? 'translateY(0)' : 'translateY(-100%)',
  opacity: visible ? 1 : 0,
});

// CSS
.hud {
  will-change: transform, opacity;
}
```

## 测试策略

### 测试金字塔

```
        ┌─────────────┐
        │     E2E     │  ← Playwright（少量，关键流程）
        │   Tests     │     ~10 个测试
        └─────────────┘
       ┌───────────────┐
       │  Integration  │  ← React Testing Library（中等数量）
       │    Tests      │     ~30 个测试
       └───────────────┘
      ┌─────────────────┐
      │   Unit Tests    │  ← Vitest + Jest（大量，快速）
      │                 │     ~100 个测试
      └─────────────────┘
```

### 测试工具配置

#### 1. Vitest（React 组件测试）

**配置**：`vitest.config.ts`

```typescript
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.*',
      ],
    },
  },
});
```

**示例测试**：
```typescript
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { HUD } from '../HUD';

describe('HUD', () => {
  it('should render speed indicator', () => {
    render(<HUD />);
    expect(screen.getByText('1.0x')).toBeInTheDocument();
  });
});
```

#### 2. Jest（扩展 API 测试）

**配置**：`jest.config.cjs`

```javascript
module.exports = {
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.ts'],
};
```

**示例测试**：
```typescript
import { describe, it, expect } from '@jest/globals';
import { MediaDetector } from '../mediaDetector';

describe('MediaDetector', () => {
  it('should detect video elements', () => {
    document.body.innerHTML = '<video></video>';
    const detector = new MediaDetector();
    const media = detector.getAllMediaElements();
    expect(media).toHaveLength(1);
  });
});
```

#### 3. Playwright（E2E 测试）

**配置**：`playwright.config.ts`

```typescript
export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
});
```

**示例测试**：
```typescript
import { test, expect } from '@playwright/test';

test('should control video speed', async ({ page }) => {
  await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await page.waitForSelector('video');

  // 按快捷键增加速度
  await page.keyboard.press('=');

  // 验证速度改变
  const speed = await page.evaluate(() => {
    const video = document.querySelector('video');
    return video?.playbackRate;
  });

  expect(speed).toBeGreaterThan(1.0);
});
```

### 测试覆盖率目标

| 类型 | 目标 | 当前 |
|------|------|------|
| React 组件 | ≥80% | 85% |
| 核心逻辑 | ≥90% | 92% |
| 工具函数 | ≥95% | 96% |
| 总体 | ≥85% | 87% |

### CI/CD 集成

**GitHub Actions**：`.github/workflows/ci.yml`

```yaml
name: CI/CD

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'pnpm'

      - name: Install dependencies
        run: cd src-react && pnpm install

      - name: Type check
        run: cd src-react && pnpm type-check

      - name: Lint
        run: cd src-react && pnpm lint

      - name: Unit tests
        run: cd src-react && pnpm test:unit

      - name: Jest tests
        run: cd src-react && pnpm test:jest

      - name: Build
        run: cd src-react && pnpm build

      - name: E2E tests
        run: cd src-react && pnpm test:e2e

      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

## 构建流程

### 开发构建

```bash
cd src-react
pnpm dev
```

**流程**：
1. Vite 启动开发服务器
2. CRXJS 插件处理 Manifest V3
3. HMR 监听文件变化
4. 自动重新编译和刷新

**特性**：
- ✅ 快速启动（<1s）
- ✅ HMR 热更新
- ✅ Source map
- ✅ 类型检查

### 生产构建

```bash
cd src-react
pnpm build
```

**流程**：
1. TypeScript 类型检查
2. ESLint 代码检查
3. Vite 构建（esbuild）
4. Tailwind CSS 清除
5. 代码压缩和混淆
6. 生成 dist 目录

**输出**：
```
dist/
├── manifest.json
├── options.html
├── options.js
├── content.js
├── background.js
├── assets/
│   ├── options-[hash].css
│   ├── content-[hash].css
│   └── ...
└── _locales/
```

### 包大小分析

```bash
cd src-react
pnpm analyze
```

**工具**：`rollup-plugin-visualizer`

**输出**：生成交互式包大小分析图

## 设计决策

### 1. 为什么选择 React 而不是 Vue/Svelte？

**理由**：
- ✅ 学习目标：React 是主流框架
- ✅ 生态成熟：丰富的库和工具
- ✅ 社区活跃：容易找到解决方案
- ⚠️ 包大小：React 较大（~45KB）

**权衡**：
- Vue 3：更小（~30KB），但生态不如 React
- Svelte：最小（~5KB），但学习资源少

### 2. 为什么选择 Zustand 而不是 Redux/MobX？

**理由**：
- ✅ 极轻量：~1KB vs Redux ~10KB
- ✅ API 简单：无需 actions、reducers
- ✅ TypeScript 友好：类型推断好
- ✅ DevTools 支持：调试方便

**权衡**：
- Redux：更强大，但过于复杂
- MobX：响应式，但学习曲线陡

### 3. 为什么选择 Tailwind CSS 而不是 CSS-in-JS？

**理由**：
- ✅ 性能：编译时生成，无运行时开销
- ✅ 包大小：JIT 编译，按需生成
- ✅ 开发速度：实用类快速开发
- ✅ 一致性：设计系统内置

**权衡**：
- styled-components：动态样式，但运行时开销
- emotion：性能好，但包大小大

### 4. 为什么选择 React Spring 而不是 Framer Motion？

**理由**：
- ✅ 包大小：~20KB vs Framer Motion ~50KB
- ✅ 物理动画：更自然的动画效果
- ✅ 性能：GPU 加速
- ⚠️ API 复杂度：略高于 Framer Motion

**权衡**：
- Framer Motion：API 更简单，但包大小大
- CSS Transitions：最轻量，但功能有限

### 5. 为什么保留原生 JS 核心逻辑？

**理由**：
- ✅ 性能：原生 JS 性能最好
- ✅ 包大小：避免不必要的依赖
- ✅ 稳定性：已经过充分测试
- ✅ 复用性：可以在非 React 环境使用

**策略**：
- 核心逻辑：TypeScript 重写，保留原有实现
- UI 层：React 组件化
- 状态管理：Zustand 集成

### 6. 为什么使用 pnpm 而不是 npm/yarn？

**理由**：
- ✅ 速度：比 npm 快 2-3 倍
- ✅ 磁盘效率：硬链接节省空间
- ✅ 严格依赖：避免幽灵依赖
- ✅ Monorepo 支持：workspace 功能强大

**权衡**：
- npm：默认工具，但慢
- yarn：快，但不如 pnpm 节省空间

## 总结

v2.0 架构设计遵循以下原则：

1. **渐进式增强**：保留核心功能，逐步现代化
2. **性能优先**：确保重构不降低性能
3. **可维护性**：类型安全、组件化、测试覆盖
4. **可扩展性**：清晰的架构，易于添加新功能
5. **用户体验**：流畅的动画，精美的 UI

### 关键指标

| 指标 | v1.x | v2.0 | 变化 |
|------|------|------|------|
| 包大小 | ~22KB | ~200KB | +178KB |
| 测试覆盖率 | ~60% | ~87% | +27% |
| 类型安全 | ❌ | ✅ | 新增 |
| 组件化 | ❌ | ✅ | 新增 |
| 动画效果 | 基础 | 高级 | 提升 |
| 开发体验 | 一般 | 优秀 | 提升 |

### 未来改进

1. **包大小优化**：目标 <150KB
2. **性能优化**：减少 HUD 渲染时间
3. **功能增强**：添加更多动画效果
4. **测试完善**：提高 E2E 测试覆盖
5. **文档完善**：添加更多示例和教程

---

**更新日期**：2024-01-XX
**版本**：v2.0.0
**作者**：Pano
