# 任务 32 视觉指南：HUD 样式和动画

## 概述

本指南展示了 HUD 组件的样式和动画实现效果。

## 组件样式

### 1. 速度指示器（SpeedIndicator）

```
┌─────────────────────────┐
│   PLAYBACK SPEED        │  ← 小号灰色标签
│                         │
│       1.50×             │  ← 大号蓝色数字 + 符号
│                         │
└─────────────────────────┘
  ↑ 黑色半透明背景 + 毛玻璃效果
```

**样式特点：**
- 背景：`bg-black/85 backdrop-blur-md`
- 圆角：`rounded-hud` (12px)
- 阴影：`shadow-hud`
- 最小宽度：`min-w-[120px]`
- 内边距：`px-6 py-4`

**颜色方案：**
- 正常速度：蓝色 (`text-blue-400`)
- 重置速度：绿色 (`text-green-400`)

### 2. 音量指示器（VolumeIndicator）

```
┌─────────────────────────┐
│       VOLUME            │  ← 小号灰色标签
│                         │
│  ████████░░░░░░░░░░░    │  ← 动态颜色音量条
│                         │
│         75%             │  ← 大号彩色百分比
│                         │
└─────────────────────────┘
```

**样式特点：**
- 背景：`bg-black/85 backdrop-blur-md`
- 圆角：`rounded-hud` (12px)
- 阴影：`shadow-hud`
- 最小宽度：`min-w-[200px]`
- 音量条高度：`h-2`

**动态颜色方案：**
- 0%（静音）：红色 (`bg-red-500`)
- 1-29%（低音量）：橙色 (`bg-amber-500`)
- 30-69%（中等音量）：蓝色 (`bg-blue-500`)
- 70-100%（高音量）：绿色 (`bg-emerald-500`)

### 3. 快进快退指示器（SeekIndicator）

```
┌─────────────────────────┐
│       FORWARD           │  ← 小号灰色标签
│                         │
│      →  10s             │  ← 箭头 + 数字
│                         │
└─────────────────────────┘
```

**样式特点：**
- 背景：`bg-black/85 backdrop-blur-md`
- 圆角：`rounded-hud` (12px)
- 阴影：`shadow-hud`
- 最小宽度：`min-w-[140px]`

**颜色方案：**
- 快进（→）：绿色 (`text-emerald-500`)
- 快退（←）：橙色 (`text-amber-500`)

## 动画效果

### 1. 淡入动画（Fade In）

```css
@keyframes fadeIn {
  0%   { opacity: 0; }
  100% { opacity: 1; }
}
```

**应用：**
- 所有指示器组件
- 持续时间：200ms
- 缓动函数：ease-out

### 2. 弹性缩放动画（Spring Scale）

```typescript
// React Spring 配置
{
  from: { opacity: 0, scale: 0.8 },
  to: { opacity: 1, scale: 1 },
  config: {
    tension: 300,  // 弹簧张力
    friction: 20,  // 摩擦力
  }
}
```

**效果：**
- 从 80% 缩放到 100%
- 带有弹性效果
- 同时淡入

**视觉流程：**
```
时间轴：
0ms    50ms   100ms  150ms  200ms
│      │      │      │      │
80%    90%    105%   98%    100%  ← 缩放比例
↑      ↑      ↑      ↑      ↑
小     中     超过   回弹   稳定
```

### 3. 数字滚动动画（Number Roll）

```typescript
// React Spring 配置
{
  number: value,
  config: {
    tension: 280,
    friction: 60,
    mass: 1,
  }
}
```

**效果：**
- 数字平滑过渡
- 带有轻微的弹性
- 使用 `tabular-nums` 保持宽度一致

**示例：**
```
1.00 → 1.25 → 1.50
  ↑      ↑      ↑
平滑过渡，不是跳变
```

### 4. 音量条动画（Volume Bar）

```typescript
// React Spring 配置
{
  width: `${percentage}%`,
  config: {
    tension: 280,
    friction: 60,
  }
}
```

**效果：**
- 宽度平滑变化
- 颜色平滑过渡（CSS transition）
- 流体感强

**视觉效果：**
```
0%    25%   50%   75%   100%
│     │     │     │     │
░░░░░░░░░░░░░░░░░░░░░░░░  ← 背景
████████████░░░░░░░░░░░░  ← 音量条（流体动画）
```

### 5. 箭头弹性动画（Arrow Spring）

```typescript
// React Spring 配置
{
  from: { x: isForward ? -10 : 10 },
  to: { x: 0 },
  config: {
    tension: 280,
    friction: 12,  // 更低的摩擦力 = 更多弹性
  }
}
```

**效果：**
- 箭头从侧面弹入
- 快进：从左侧弹入（-10px → 0）
- 快退：从右侧弹入（+10px → 0）

**视觉流程：**
```
快进箭头：
  ←─────→
-10px    0px
  ↑      ↑
 开始   结束

快退箭头：
  ←─────→
  0px  +10px
  ↑      ↑
 结束   开始
```

## 防抖机制

### 防抖逻辑

```typescript
// 50ms 防抖延迟
const debouncedValue = useDebounce(hudState.value, 50);
```

**工作原理：**
```
用户操作：
│ │ │ │ │ │ │ │ │ │
↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓
快速连续按键

防抖后：
│           │
↓           ↓
只更新最后一次
```

**效果：**
- 防止快速连续更新时的闪烁
- 保持显示/隐藏的即时性
- 提升用户体验

## 位置系统

### 5 种定位选项

```
┌─────────────────────────────────┐
│ top-left          top-right     │
│   [HUD]              [HUD]      │
│                                  │
│                                  │
│            [HUD]                 │
│           center                 │
│                                  │
│                                  │
│   [HUD]              [HUD]      │
│ bottom-left      bottom-right   │
└─────────────────────────────────┘
```

**Tailwind 类映射：**
```typescript
{
  'top-left': 'top-5 left-5',
  'top-right': 'top-5 right-5',
  'bottom-left': 'bottom-5 left-5',
  'bottom-right': 'bottom-5 right-5',
  'center': 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
}
```

## Shadow DOM 隔离

### 样式隔离

```
宿主页面
├── 页面样式（不影响 HUD）
└── #vsc-hud-shadow-host
    └── Shadow Root
        ├── <style> ← Tailwind 类注入
        └── #vsc-hud-portal-container
            └── HUD 组件
```

**优点：**
- 完全隔离宿主页面样式
- 防止样式冲突
- 保持 HUD 样式一致性

## 性能优化

### 1. GPU 加速

使用 GPU 加速的 CSS 属性：
- `transform`（缩放、平移）
- `opacity`（透明度）

### 2. 防抖更新

- 50ms 延迟
- 减少不必要的渲染
- 防止闪烁

### 3. useMemo 优化

```typescript
const value = useMemo(() => {
  return visible ? debouncedValue : hudState.value;
}, [visible, debouncedValue, hudState.value]);
```

### 4. React Spring

- 使用 `will-change` 提示浏览器
- 硬件加速动画
- 60fps 流畅度

## 响应式设计

### 最小宽度

- 速度指示器：120px
- 音量指示器：200px
- 快进快退指示器：140px

### 自适应内容

- 使用 `flex` 布局
- 内容自动居中
- 文本自动换行（如果需要）

## 可访问性

### 语义化标签

- 使用清晰的标签文本
- 大号数字易于阅读
- 高对比度颜色

### 动画控制

- 支持 `prefers-reduced-motion`（未来实现）
- 可配置动画速度
- 可完全禁用动画

## 总结

任务 32 成功实现了：

✅ **Tailwind CSS 样式化**
- 所有组件使用 Tailwind 类
- Shadow DOM 中注入完整样式
- 语义化、可维护的类名

✅ **淡入淡出动画**
- CSS 关键帧动画
- React Spring 精细控制
- 平滑的视觉过渡

✅ **弹性动画**
- React Spring 物理动画
- 自然的弹性效果
- 多种动画类型

✅ **防抖更新**
- 50ms 防抖延迟
- 防止闪烁
- 保持响应性

所有动画都经过精心调优，提供流畅、专业的用户体验！
