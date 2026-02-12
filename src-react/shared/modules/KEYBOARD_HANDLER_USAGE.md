# 键盘处理器使用指南

本文档说明如何使用键盘处理器模块的两个版本。

## 版本说明

### 1. KeyboardHandler（基础版本）

`KeyboardHandler` 是从原生 JavaScript 转换而来的 TypeScript 版本，保留了原有的依赖注入模式。适用于需要完全控制依赖的场景。

**特点：**
- 完全的依赖注入
- 不依赖 Zustand Store
- 需要手动提供所有依赖（playbackController、lightboxManager 等）
- 适合与现有代码集成

### 2. KeyboardHandlerWithStore（Store 集成版本）

`KeyboardHandlerWithStore` 直接使用 Zustand Store 进行状态管理，简化了依赖注入。适用于新的 React 应用。

**特点：**
- 直接使用 Zustand Store（mediaStore、hudStore、settingsStore）
- 简化的依赖注入（只需要 mediaDetector）
- 自动处理 HUD 显示
- 推荐用于新的 React 应用

## 使用示例

### 使用 KeyboardHandler（基础版本）

```typescript
import { KeyboardHandler } from '@/shared/modules';
import type { KeyboardHandlerConfig, KeyboardHandlerDependencies } from '@/shared/modules';

// 准备配置
const config: KeyboardHandlerConfig = {
  shortcuts: {
    'increase': '=',
    'decrease': '-',
    'reset': '0',
    // ... 其他快捷键
  },
  presets: [
    { id: '1', speed: 0.5, label: '0.5x', shortcut: '7' },
    // ... 其他预设
  ],
  debug: true, // 可选：启用调试日志
};

// 准备依赖
const deps: KeyboardHandlerDependencies = {
  mediaDetector: myMediaDetector,
  playbackController: {
    handleSpeed: (media, action) => {
      // 处理速度控制
    },
    handleVolume: (media, direction, step) => {
      // 处理音量控制
    },
    handleSeek: (media, direction, seconds) => {
      // 处理快进快退
    },
    handlePlayPause: (media) => {
      // 处理播放/暂停
    },
  },
  lightboxManager: {
    isActive: () => false,
    getVideo: () => null,
    toggle: (media) => {},
    exit: () => {},
  },
  keyboardHelp: {
    toggle: () => {},
  },
};

// 创建实例
const keyboardHandler = new KeyboardHandler(config, deps);

// 初始化
keyboardHandler.init();

// 更新快捷键（可选）
keyboardHandler.updateShortcuts({
  'increase': '+',
  'decrease': '_',
});

// 清理
// keyboardHandler.destroy();
```

### 使用 KeyboardHandlerWithStore（Store 集成版本）

```typescript
import { KeyboardHandlerWithStore } from '@/shared/modules';
import type {
  KeyboardHandlerWithStoreConfig,
  KeyboardHandlerWithStoreDependencies,
} from '@/shared/modules';
import { MediaDetector } from '@/shared/modules';

// 准备配置（简化版）
const config: KeyboardHandlerWithStoreConfig = {
  debug: true, // 可选：启用调试日志
};

// 准备依赖（简化版）
const deps: KeyboardHandlerWithStoreDependencies = {
  mediaDetector: new MediaDetector(),
  // lightboxManager 和 keyboardHelp 是可选的
  lightboxManager: {
    isActive: () => false,
    getVideo: () => null,
    toggle: (media) => {},
    exit: () => {},
  },
  keyboardHelp: {
    toggle: () => {},
  },
};

// 创建实例
const keyboardHandler = new KeyboardHandlerWithStore(config, deps);

// 初始化
keyboardHandler.init();

// Store 会自动处理快捷键配置、预设和 HUD 显示
// 无需手动更新配置，直接使用 Store 的 actions

// 清理
// keyboardHandler.destroy();
```

### 在 React 组件中使用

```typescript
import { useEffect, useRef } from 'react';
import { KeyboardHandlerWithStore } from '@/shared/modules';
import { MediaDetector } from '@/shared/modules';

function MyComponent() {
  const keyboardHandlerRef = useRef<KeyboardHandlerWithStore | null>(null);
  const mediaDetectorRef = useRef<MediaDetector | null>(null);

  useEffect(() => {
    // 创建媒体检测器
    mediaDetectorRef.current = new MediaDetector();

    // 创建键盘处理器
    keyboardHandlerRef.current = new KeyboardHandlerWithStore(
      { debug: true },
      { mediaDetector: mediaDetectorRef.current }
    );

    // 初始化
    keyboardHandlerRef.current.init();

    // 清理
    return () => {
      keyboardHandlerRef.current?.destroy();
      mediaDetectorRef.current?.destroy();
    };
  }, []);

  return <div>My Component</div>;
}
```

## 快捷键配置

快捷键配置存储在 `settingsStore` 中，可以通过以下方式访问和修改：

```typescript
import { useSettingsStore } from '@/shared/stores';

// 在组件中
function ShortcutSettings() {
  const shortcuts = useSettingsStore((state) => state.shortcuts);
  const updateShortcut = useSettingsStore((state) => state.updateShortcut);

  const handleChange = (action: ShortcutAction, key: string) => {
    updateShortcut(action, key);
  };

  return (
    <div>
      {/* 快捷键设置 UI */}
    </div>
  );
}

// 在非组件代码中
const shortcuts = useSettingsStore.getState().shortcuts;
useSettingsStore.getState().updateShortcut('increase', '+');
```

## 速度预设配置

速度预设也存储在 `settingsStore` 中：

```typescript
import { useSettingsStore } from '@/shared/stores';

// 添加预设
useSettingsStore.getState().addPreset({
  id: '8',
  speed: 2.5,
  label: '2.5x',
  shortcut: '2',
});

// 更新预设
useSettingsStore.getState().updatePreset('8', {
  speed: 3.0,
  label: '3.0x',
});

// 删除预设
useSettingsStore.getState().removePreset('8');
```

## 调试

启用调试模式可以在控制台查看详细的日志信息：

```typescript
const keyboardHandler = new KeyboardHandlerWithStore(
  { debug: true },
  { mediaDetector }
);
```

调试日志包括：
- 快捷键按下事件
- 匹配的操作
- 快捷键被阻止的原因
- 速度预设应用

## 注意事项

1. **YouTube 特殊处理**：在 YouTube 网站上，空格键不会被拦截，以保持原生播放控制
2. **可编辑区域**：在输入框、文本编辑器等可编辑区域，快捷键会被禁用
3. **全屏模式**：全屏模式下有特殊的按键处理（ESC 退出、方向键控制等）
4. **多媒体元素**：当页面有多个媒体元素时，只有焦点或鼠标悬停的元素会响应快捷键
5. **清理**：务必在组件卸载时调用 `destroy()` 方法清理事件监听器

## 迁移指南

如果你正在从原生 JavaScript 版本迁移到 TypeScript 版本：

1. **使用 KeyboardHandler**：如果你想保持现有的架构，使用基础版本
2. **使用 KeyboardHandlerWithStore**：如果你正在构建新的 React 应用，推荐使用 Store 集成版本
3. **逐步迁移**：可以先使用基础版本，然后逐步迁移到 Store 集成版本

## 相关文档

- [MediaDetector 使用指南](./MEDIA_DETECTOR_USAGE.md)
- [Zustand Store 文档](../stores/README.md)
- [快捷键类型定义](../types/shortcuts.ts)
