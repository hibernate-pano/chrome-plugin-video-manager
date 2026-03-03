# 迁移指南：从 v1.x 到 v2.0

本文档指导您如何从原版 JavaScript 实现（v1.x）迁移到新的 React + TypeScript 架构（v2.0）。

## 目录

- [概述](#概述)
- [主要变化](#主要变化)
- [用户迁移](#用户迁移)
- [开发者迁移](#开发者迁移)
- [API 变化](#api-变化)
- [常见问题](#常见问题)

## 概述

v2.0 是一次完全重构，采用现代前端技术栈：

| 方面 | v1.x | v2.0 |
|------|------|------|
| UI 框架 | 原生 JavaScript | React 18 |
| 类型系统 | 无 | TypeScript（严格模式）|
| 样式 | 原生 CSS | Tailwind CSS 3.4 + shadcn/ui |
| 状态管理 | 手动管理 | Zustand |
| 动画 | CSS Transitions | React Spring + Tailwind |
| 构建工具 | Rollup | Vite + CRXJS |
| 测试 | Jest | Vitest + Jest + Playwright |
| 包大小 | ~22KB | ~200KB（内容脚本）|

### 为什么重构？

1. **学习现代技术栈**：实践 React、TypeScript、Tailwind CSS 等主流技术
2. **提升可维护性**：类型安全、组件化、更好的代码组织
3. **改善开发体验**：HMR 热更新、更好的工具链、完整的测试覆盖
4. **增强用户体验**：更流畅的动画、更精美的 UI、更好的可访问性

### 权衡考虑

**优势：**
- ✅ 现代化的开发体验
- ✅ 类型安全，减少运行时错误
- ✅ 组件化，易于维护和扩展
- ✅ 完整的测试覆盖（85%+）
- ✅ 更好的 UI/UX

**劣势：**
- ⚠️ 包大小增加（22KB → 200KB）
- ⚠️ 学习曲线（需要了解 React 生态）
- ⚠️ 构建时间增加

## 主要变化

### 1. 项目结构

**v1.x：**
```
src/
├── main.js
├── modules/
│   ├── mediaDetector.js
│   ├── keyboardHandler.js
│   └── ...
└── utils/
```

**v2.0：**
```
src-react/
├── options/          # 设置页面
├── content/          # 内容脚本
├── shared/           # 共享代码
│   ├── components/   # UI 组件
│   ├── stores/       # 状态管理
│   ├── modules/      # 核心逻辑
│   ├── utils/        # 工具函数
│   └── types/        # 类型定义
└── tests/            # 测试文件
```

### 2. 核心模块迁移

#### 媒体检测（Media Detector）

**v1.x：**
```javascript
// src/modules/mediaDetector.js
class MediaDetector {
  getAllMediaElements() {
    // 实现
  }
}
```

**v2.0：**
```typescript
// src-react/shared/modules/mediaDetector.ts
export class MediaDetector {
  getAllMediaElements(): HTMLMediaElement[] {
    // 实现（保留原有逻辑）
  }
}
```

**变化：**
- ✅ 添加了 TypeScript 类型注解
- ✅ 保留了所有原有功能（缓存、Shadow DOM、iframe 支持）
- ✅ 性能优化保持不变

#### 键盘处理（Keyboard Handler）

**v1.x：**
```javascript
// src/modules/keyboardHandler.js
function handleKeyPress(event) {
  // 实现
}
```

**v2.0：**
```typescript
// src-react/shared/modules/keyboardHandler.ts
export class KeyboardHandler {
  handleKeyPress(event: KeyboardEvent): void {
    // 实现
  }
}

// 集成 Zustand Store
// src-react/shared/modules/keyboardHandlerWithStore.ts
export function createKeyboardHandlerWithStore(
  mediaStore: MediaStore,
  hudStore: HUDStore,
  settingsStore: SettingsStore
): KeyboardHandler {
  // 实现
}
```

**变化：**
- ✅ 类化封装
- ✅ 集成状态管理
- ✅ 类型安全

#### HUD 指示器

**v1.x：**
```javascript
// src/modules/indicator.js
class SpeedIndicator {
  show(speed) {
    // 使用 Web Components
  }
}
```

**v2.0：**
```typescript
// src-react/content/components/HUD.tsx
export function HUD() {
  const { visible, type, value } = useHUDStore();

  return (
    <Portal>
      <div className="...">
        {type === 'speed' && <SpeedIndicator value={value} />}
        {type === 'volume' && <VolumeIndicator value={value} />}
      </div>
    </Portal>
  );
}
```

**变化：**
- ✅ React 组件化
- ✅ 使用 React Spring 动画
- ✅ Tailwind CSS 样式
- ✅ 状态管理集成

### 3. 状态管理

**v1.x：**
```javascript
// 手动管理状态
let currentSpeed = 1.0;
let currentMedia = null;

function updateSpeed(newSpeed) {
  currentSpeed = newSpeed;
  // 手动更新 UI
}
```

**v2.0：**
```typescript
// src-react/shared/stores/mediaStore.ts
export const useMediaStore = create<MediaStore>((set) => ({
  playbackRate: 1.0,
  currentMedia: null,

  setPlaybackRate: (rate) => {
    set({ playbackRate: rate });
    // 自动触发 UI 更新
  },
}));
```

**变化：**
- ✅ 集中式状态管理
- ✅ 响应式更新
- ✅ DevTools 支持

### 4. 样式系统

**v1.x：**
```css
/* style.css */
.speed-indicator {
  position: fixed;
  top: 20px;
  right: 20px;
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 10px 20px;
  border-radius: 8px;
}
```

**v2.0：**
```typescript
// src-react/content/components/HUD.tsx
<div className="fixed top-5 right-5 bg-black/80 text-white px-5 py-2.5 rounded-lg">
  {/* 内容 */}
</div>
```

**变化：**
- ✅ Tailwind CSS 实用类
- ✅ 响应式设计
- ✅ 暗色模式支持
- ✅ 动画效果增强

## 用户迁移

### 自动迁移

v2.0 包含自动设置迁移功能：

```typescript
// src-react/shared/utils/migration.ts
export async function migrateSettings(): Promise<void> {
  const oldSettings = await chrome.storage.sync.get('vsc-settings-v1');

  if (oldSettings) {
    // 自动转换为新格式
    const newSettings = convertToV2Format(oldSettings);
    await chrome.storage.sync.set({ 'vsc-settings': newSettings });
  }
}
```

### 手动迁移

如果自动迁移失败，您可以手动迁移：

1. **导出 v1.x 设置**
   - 打开 v1.x 设置页面
   - 点击"导出设置"按钮
   - 保存 JSON 文件

2. **导入到 v2.0**
   - 打开 v2.0 设置页面
   - 点击"导入设置"按钮
   - 选择之前导出的 JSON 文件

### 设置兼容性

| 设置项 | v1.x | v2.0 | 兼容性 |
|--------|------|------|--------|
| 快捷键 | ✅ | ✅ | 完全兼容 |
| 速度预设 | ✅ | ✅ | 完全兼容 |
| HUD 位置 | ❌ | ✅ | 新增功能 |
| 动画速度 | ❌ | ✅ | 新增功能 |
| 语言设置 | ❌ | ✅ | 新增功能 |

## 开发者迁移

### 环境设置

**v1.x：**
```bash
npm install
npm run build
```

**v2.0：**
```bash
cd src-react
pnpm install
pnpm build
```

### 开发工作流

**v1.x：**
```bash
npm run dev      # 监听文件变化
npm test         # 运行测试
npm run lint     # 代码检查
```

**v2.0：**
```bash
cd src-react
pnpm dev         # HMR 热更新
pnpm test        # 运行所有测试
pnpm test:unit   # 单元测试（Vitest）
pnpm test:jest   # 扩展 API 测试（Jest）
pnpm test:e2e    # E2E 测试（Playwright）
pnpm lint        # 代码检查
pnpm type-check  # 类型检查
```

### 添加新功能

#### v1.x 方式

```javascript
// 1. 创建模块
// src/modules/myFeature.js
export class MyFeature {
  doSomething() {
    // 实现
  }
}

// 2. 在 main.js 中使用
import { MyFeature } from './modules/myFeature.js';
const feature = new MyFeature();
```

#### v2.0 方式

```typescript
// 1. 定义类型
// src-react/shared/types/myFeature.ts
export interface MyFeatureState {
  value: number;
}

// 2. 创建 Store（如果需要）
// src-react/shared/stores/myFeatureStore.ts
export const useMyFeatureStore = create<MyFeatureState>((set) => ({
  value: 0,
  setValue: (value) => set({ value }),
}));

// 3. 创建组件
// src-react/content/components/MyFeature.tsx
export function MyFeature() {
  const { value } = useMyFeatureStore();
  return <div>{value}</div>;
}

// 4. 添加测试
// src-react/content/components/__tests__/MyFeature.test.tsx
describe('MyFeature', () => {
  it('should render', () => {
    render(<MyFeature />);
    // 断言
  });
});
```

### 测试迁移

#### v1.x 测试

```javascript
// tests/unit/modules/myModule.test.js
describe('MyModule', () => {
  test('should work', () => {
    const module = new MyModule();
    expect(module.doSomething()).toBe(true);
  });
});
```

#### v2.0 测试

**单元测试（Vitest）：**
```typescript
// src-react/shared/modules/__tests__/myModule.test.ts
import { describe, it, expect } from 'vitest';
import { MyModule } from '../myModule';

describe('MyModule', () => {
  it('should work', () => {
    const module = new MyModule();
    expect(module.doSomething()).toBe(true);
  });
});
```

**组件测试：**
```typescript
// src-react/content/components/__tests__/MyComponent.test.tsx
import { render, screen } from '@testing-library/react';
import { MyComponent } from '../MyComponent';

describe('MyComponent', () => {
  it('should render correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

## API 变化

### Chrome Storage API

**v1.x：**
```javascript
// 直接使用 Chrome API
chrome.storage.sync.get('settings', (data) => {
  console.log(data.settings);
});
```

**v2.0：**
```typescript
// 使用封装的工具函数
import { safeStorageGet } from '@/shared/utils/chromeStorage';

const settings = await safeStorageGet('settings', defaultSettings);
```

### 媒体控制 API

**v1.x：**
```javascript
// 直接操作 DOM
const video = document.querySelector('video');
video.playbackRate = 1.5;
```

**v2.0：**
```typescript
// 使用 Store
import { useMediaStore } from '@/shared/stores/mediaStore';

const { setPlaybackRate } = useMediaStore();
setPlaybackRate(1.5);
```

### HUD 显示 API

**v1.x：**
```javascript
// 手动创建和销毁 DOM
const indicator = new SpeedIndicator();
indicator.show(1.5);
setTimeout(() => indicator.hide(), 2000);
```

**v2.0：**
```typescript
// 使用 Store
import { useHUDStore } from '@/shared/stores/hudStore';

const { show } = useHUDStore();
show('speed', 1.5);
// 自动隐藏
```

## 常见问题

### Q1: v2.0 的包大小为什么这么大？

**A:** v2.0 引入了 React、React Spring 等库，导致包大小从 22KB 增加到约 200KB。我们已经通过以下方式优化：

- ✅ 代码分割（设置页面和内容脚本分离）
- ✅ Tree shaking（移除未使用的代码）
- ✅ 懒加载（按需加载组件）
- ✅ Tailwind CSS 清除（只包含使用的类）

如果您对包大小敏感，可以继续使用 v1.x 版本。

### Q2: 性能会受影响吗？

**A:** 我们进行了全面的性能测试：

| 指标 | v1.x | v2.0 | 变化 |
|------|------|------|------|
| 媒体检测 | ~5ms | ~5ms | 无变化 |
| 键盘响应 | <16ms | <16ms | 无变化 |
| HUD 渲染 | ~10ms | ~15ms | +5ms |
| 内存占用 | ~5MB | ~8MB | +3MB |

核心功能性能保持不变，UI 渲染略有增加但在可接受范围内。

### Q3: 我的设置会丢失吗？

**A:** 不会。v2.0 包含自动迁移功能，会在首次运行时自动转换您的设置。如果遇到问题，可以使用手动导入/导出功能。

### Q4: 可以同时安装两个版本吗？

**A:** 不建议。两个版本会冲突。建议：

1. 导出 v1.x 设置
2. 卸载 v1.x
3. 安装 v2.0
4. 导入设置（如果自动迁移失败）

### Q5: 如何回退到 v1.x？

**A:** 如果您不满意 v2.0：

1. 导出 v2.0 设置
2. 卸载 v2.0
3. 重新安装 v1.x
4. 手动配置设置（v2.0 的新功能设置会丢失）

### Q6: v1.x 还会维护吗？

**A:** 是的。我们会继续维护 v1.x：

- ✅ Bug 修复
- ✅ 安全更新
- ⚠️ 不会添加新功能

新功能只会在 v2.0 中开发。

### Q7: 如何贡献代码？

**A:** 欢迎贡献！请查看：

- [贡献指南](../CONTRIBUTING.md)
- [架构文档](./ARCHITECTURE.md)

选择您熟悉的版本进行贡献：
- v1.x：适合 JavaScript 开发者
- v2.0：适合 React/TypeScript 开发者

### Q8: 遇到问题怎么办？

**A:** 请按以下步骤：

1. 查看 [常见问题](../README.md#常见问题解答)
2. 搜索 [GitHub Issues](https://github.com/yourusername/chrome-plugin-video-manager/issues)
3. 创建新 Issue（提供详细信息）
4. 加入讨论区寻求帮助

## 总结

v2.0 是一次重大升级，带来了现代化的技术栈和更好的开发体验。虽然包大小有所增加，但我们认为这是值得的权衡。

**推荐迁移路径：**

1. **普通用户**：直接升级到 v2.0，享受更好的 UI/UX
2. **开发者**：学习 React 生态，参与 v2.0 开发
3. **性能敏感用户**：继续使用 v1.x

无论您选择哪个版本，我们都会持续支持和改进！

---

**更新日期**：2024-01-XX
**版本**：v2.0.0
