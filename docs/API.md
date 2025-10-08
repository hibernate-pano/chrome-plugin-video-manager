# API 文档 (API Documentation)

本文档详细介绍了项目中各个模块的 API 接口。

## 目录

- [工具函数 (Utils)](#工具函数)
- [模块类 (Modules)](#模块类)
- [类型定义 (Types)](#类型定义)

## 工具函数

### debounce.js

#### `debounce(func, wait)`

标准防抖函数。

**参数：**

- `func` (Function) - 要防抖的函数
- `wait` (number) - 等待时间（毫秒）

**返回：**

- (Function) - 防抖后的函数

**示例：**

```javascript
const debouncedFn = debounce(() => console.log("Called"), 300);
debouncedFn(); // 等待300ms后执行
```

#### `enhancedDebounce(func, wait, immediate)`

增强的防抖函数，支持立即执行。

**参数：**

- `func` (Function) - 要防抖的函数
- `wait` (number) - 等待时间（毫秒）
- `immediate` (boolean) - 是否立即执行，默认 false

**返回：**

- (Function) - 增强防抖后的函数

**示例：**

```javascript
const debouncedFn = enhancedDebounce(() => console.log("Called"), 300, true);
debouncedFn(); // 立即执行
```

### dom.js

#### `isElementInViewport(el, visibilityMap, observer)`

检查元素是否在视口内。

**参数：**

- `el` (HTMLElement) - 要检查的元素
- `visibilityMap` (WeakMap) - 可见性缓存
- `observer` (IntersectionObserver) - 交叉观察器

**返回：**

- (boolean) - 元素是否在视口内

**示例：**

```javascript
const isVisible = isElementInViewport(videoElement, visibilityMap, observer);
```

#### `isInIframe(el)`

检查元素是否在 iframe 中。

**参数：**

- `el` (HTMLElement) - 要检查的元素

**返回：**

- (boolean) - 元素是否在 iframe 中

#### `isTypingInEditable(event)`

判断是否正在可编辑区域输入。

**参数：**

- `event` (Event) - 键盘事件

**返回：**

- (boolean) - 是否在可编辑区域

**示例：**

```javascript
if (isTypingInEditable(event)) {
  return; // 不处理快捷键
}
```

#### `querySelectorAllIncludingShadowDOM(selector, shadowElements, isStale)`

查询所有元素，包括 Shadow DOM 中的元素。

**参数：**

- `selector` (string) - CSS 选择器
- `shadowElements` (Array) - Shadow DOM 元素缓存
- `isStale` (boolean) - 缓存是否过期

**返回：**

- (Array<HTMLElement>) - 匹配的元素数组

### storage.js

#### `defaultShortcuts`

默认快捷键配置对象。

```javascript
{
    increase: '=',
    decrease: '-',
    reset: '0',
    'toggle-fullscreen': 'f'
}
```

#### `loadShortcutSettings()`

从 Chrome 存储加载快捷键设置。

**返回：**

- (Promise<Object>) - 快捷键配置对象

**示例：**

```javascript
const shortcuts = await loadShortcutSettings();
console.log(shortcuts);
```

#### `saveShortcutSettings(shortcuts)`

保存快捷键设置到 Chrome 存储。

**参数：**

- `shortcuts` (Object) - 快捷键配置对象

**返回：**

- (Promise<void>)

**示例：**

```javascript
await saveShortcutSettings({ increase: 'ctrl+=', ...  });
```

#### `onShortcutsChanged(callback)`

监听快捷键设置变更。

**参数：**

- `callback` (Function) - 当快捷键变更时的回调函数

**示例：**

```javascript
onShortcutsChanged((newShortcuts) => {
  console.log("Shortcuts changed:", newShortcuts);
});
```

## 模块类

### MediaDetector

媒体元素检测和管理类。

#### 构造函数

```javascript
new MediaDetector();
```

创建一个新的 MediaDetector 实例。

#### 属性

- `cache` (Object) - 媒体元素缓存对象

  - `timestamp` (number) - 缓存时间戳
  - `elements` (Array) - 缓存的媒体元素
  - `shadowElements` (Array) - Shadow DOM 中的元素
  - `isStale` (boolean) - 缓存是否过期
  - `timeoutId` (number) - 超时 ID

- `elementVisibilityMap` (WeakMap) - 元素可见性映射
- `mediaSizeCache` (WeakMap) - 媒体尺寸缓存
- `intersectionObserver` (IntersectionObserver) - 交叉观察器
- `lastActiveMedia` (HTMLMediaElement) - 最后活动的媒体元素

#### 方法

##### `getAllMediaElements()`

获取所有媒体元素，包括 iframe 中的。

**返回：**

- (Array<HTMLMediaElement>) - 媒体元素数组

##### `getTargetMedia(lightboxActive)`

获取目标媒体元素（根据优先级）。

**参数：**

- `lightboxActive` (boolean) - 是否处于全屏模式

**返回：**

- (HTMLMediaElement|null) - 目标媒体元素

##### `handleShadowDOMMedia()`

处理 Shadow DOM 中的媒体元素。

**返回：**

- (void)

##### `setupMediaElementDetection()`

设置媒体元素检测机制。

**返回：**

- (void)

##### `setupMediaEventDelegation()`

设置媒体事件委托。

**返回：**

- (void)

##### `invalidateCache()`

使缓存失效。

**返回：**

- (void)

### SpeedIndicator

速度指示器管理类。

#### 构造函数

```javascript
new SpeedIndicator();
```

#### 方法

##### `show(speed, mediaElement)`

显示速度指示器。

**参数：**

- `speed` (number|string) - 播放速度或提示文本
- `mediaElement` (HTMLMediaElement) - 媒体元素

**返回：**

- (void)

##### `hide()`

隐藏指示器。

**返回：**

- (void)

##### `destroy()`

销毁指示器。

**返回：**

- (void)

### LightboxManager

网页全屏管理类。

#### 构造函数

```javascript
new LightboxManager();
```

#### 属性

- `active` (boolean) - 是否处于全屏模式
- `originalParent` (HTMLElement) - 原始父元素
- `originalNextSibling` (HTMLElement) - 原始下一个兄弟元素
- `originalVideoStyles` (Object) - 原始视频样式

#### 方法

##### `isActive()`

检查是否处于全屏模式。

**返回：**

- (boolean) - 是否处于全屏模式

##### `enter(media)`

进入全屏模式。

**参数：**

- `media` (HTMLVideoElement) - 视频元素

**返回：**

- (void)

##### `exit()`

退出全屏模式。

**返回：**

- (void)

##### `toggle(media)`

切换全屏模式。

**参数：**

- `media` (HTMLVideoElement) - 视频元素

**返回：**

- (void)

##### `getVideo()`

获取全屏模式下的视频元素。

**返回：**

- (HTMLVideoElement|null) - 视频元素

### PlaybackController

播放控制器类。

#### 构造函数

```javascript
new PlaybackController(indicator);
```

**参数：**

- `indicator` (SpeedIndicator) - 速度指示器实例

#### 方法

##### `handleSpeed(media, action)`

处理播放速度控制。

**参数：**

- `media` (HTMLMediaElement) - 媒体元素
- `action` (string) - 动作类型：'increase'|'decrease'|'reset'

**返回：**

- (void)

##### `handleSeek(video, direction, step)`

处理视频快进快退。

**参数：**

- `video` (HTMLVideoElement) - 视频元素
- `direction` (string) - 方向：'forward'|'backward'
- `step` (number) - 步长（秒），默认 5

**返回：**

- (void)

##### `handleVolume(media, direction, step)`

处理音量控制。

**参数：**

- `media` (HTMLMediaElement) - 媒体元素
- `direction` (string) - 方向：'up'|'down'
- `step` (number) - 步长（0-1），默认 0.1

**返回：**

- (void)

##### `handlePlayPause(media)`

处理播放/暂停。

**参数：**

- `media` (HTMLMediaElement) - 媒体元素

**返回：**

- (Promise<void>)

### KeyboardHandler

键盘事件处理器类。

#### 构造函数

```javascript
new KeyboardHandler(
  shortcuts,
  mediaDetector,
  playbackController,
  lightboxManager
);
```

**参数：**

- `shortcuts` (Object) - 快捷键配置
- `mediaDetector` (MediaDetector) - 媒体检测器实例
- `playbackController` (PlaybackController) - 播放控制器实例
- `lightboxManager` (LightboxManager) - 全屏管理器实例

#### 方法

##### `updateShortcuts(newShortcuts)`

更新快捷键配置。

**参数：**

- `newShortcuts` (Object) - 新的快捷键配置

**返回：**

- (void)

##### `handleKeyDown(e)`

处理键盘按下事件。

**参数：**

- `e` (KeyboardEvent) - 键盘事件

**返回：**

- (void)

##### `init()`

初始化键盘事件监听。

**返回：**

- (void)

##### `destroy()`

清理事件监听。

**返回：**

- (void)

## 类型定义

### ShortcutsConfig

快捷键配置对象。

```typescript
interface ShortcutsConfig {
  increase: string; // 加速快捷键
  decrease: string; // 减速快捷键
  reset: string; // 重置快捷键
  "toggle-fullscreen": string; // 切换全屏快捷键
}
```

### CacheObject

缓存对象。

```typescript
interface CacheObject {
  timestamp: number; // 缓存时间戳
  elements: HTMLMediaElement[]; // 缓存的元素
  shadowElements: HTMLElement[]; // Shadow DOM元素
  isStale: boolean; // 是否过期
  timeoutId: number | null; // 超时ID
}
```

## 事件

### storage.onChanged

当存储数据变更时触发。

**监听示例：**

```javascript
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "sync" && changes.shortcuts) {
    const newShortcuts = changes.shortcuts.newValue;
    // 处理快捷键变更
  }
});
```

---

更新时间：2024-01-XX
