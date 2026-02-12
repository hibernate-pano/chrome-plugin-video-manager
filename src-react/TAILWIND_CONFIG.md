# Tailwind CSS 3.4 配置说明

## 概述

本项目使用 Tailwind CSS 3.4（稳定版）作为样式框架，配合 PostCSS 和 Autoprefixer 进行处理。

## 配置文件

### 1. tailwind.config.ts

主要配置文件，包含以下内容：

#### 内容路径（Content）
```typescript
content: [
  './options.html',
  './options/**/*.{ts,tsx}',
  './content/**/*.{ts,tsx}',
  './background/**/*.{ts,tsx}',
  './shared/**/*.{ts,tsx}',
]
```

指定 Tailwind 需要扫描的文件路径，用于生成最终的 CSS。

#### 暗色模式（Dark Mode）
```typescript
darkMode: 'class'
```

使用 class 策略，通过添加 `dark` 类来切换暗色模式。

#### 自定义主题

##### 颜色系统
- **primary**: 主题色（蓝色系）
- **hud**: HUD 指示器专用颜色
  - `hud-bg`: HUD 背景色
  - `hud-text`: HUD 文字色
  - `hud-speed`: 速度指示器颜色
  - `hud-volume`: 音量指示器颜色
  - `hud-seek`: 快进快退指示器颜色
  - `hud-reset`: 重置指示器颜色
- **extension**: 扩展特定颜色
  - `extension-bg`: 扩展背景色
  - `extension-bg-dark`: 暗色模式背景色
  - `extension-border`: 边框颜色
  - `extension-border-dark`: 暗色模式边框颜色

##### 字体系统
- **sans**: 系统默认无衬线字体栈
- **mono**: 等宽字体栈

##### 动画系统

###### 预定义动画
- `animate-fade-in`: 淡入动画（200ms）
- `animate-fade-out`: 淡出动画（200ms）
- `animate-slide-up`: 向上滑入动画（300ms）
- `animate-slide-down`: 向下滑入动画（300ms）
- `animate-scale-in`: 缩放进入动画（200ms）
- `animate-scale-out`: 缩放退出动画（200ms）
- `animate-bounce-in`: 弹性进入动画（500ms）
- `animate-number-roll`: 数字滚动动画（300ms）
- `animate-zoom-in`: 放大进入动画（300ms）
- `animate-zoom-out`: 缩小退出动画（300ms）

###### 自定义缓动函数
- `transition-spring`: 弹性缓动
- `transition-ease-in-out-back`: 回弹缓动

##### 阴影系统
- `shadow-hud`: HUD 专用阴影
- `shadow-modal`: 模态框专用阴影

##### 圆角系统
- `rounded-hud`: HUD 专用圆角（12px）
- `rounded-modal`: 模态框专用圆角（16px）

##### Z-Index 系统
- `z-hud`: HUD 层级（999999）
- `z-lightbox`: Lightbox 层级（999998）
- `z-modal`: 模态框层级（999997）

### 2. postcss.config.js

PostCSS 配置文件，包含以下插件：

```javascript
{
  plugins: {
    tailwindcss: {},      // Tailwind CSS 处理
    autoprefixer: {},     // 自动添加浏览器前缀
  }
}
```

## CSS 文件结构

### Options Page (options/styles/index.css)
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  /* 基础样式 */
}
```

### Content Script (content/styles/index.css)
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  /* Shadow DOM 样式隔离 */
}
```

## JIT 编译器

Tailwind CSS 3.x 默认启用 JIT（Just-In-Time）编译器，具有以下优势：

1. **按需生成**: 只生成实际使用的样式
2. **开发体验**: 支持任意值（如 `w-[137px]`）
3. **构建速度**: 更快的构建和热更新
4. **包大小**: 更小的最终 CSS 文件

## 使用示例

### 基础样式
```tsx
<div className="bg-primary-500 text-white p-4 rounded-lg">
  Hello World
</div>
```

### HUD 样式
```tsx
<div className="bg-hud-bg text-hud-text shadow-hud rounded-hud z-hud">
  <span className="text-hud-speed">1.5x</span>
</div>
```

### 动画
```tsx
<div className="animate-fade-in transition-spring">
  Animated Content
</div>
```

### 暗色模式
```tsx
<div className="bg-white dark:bg-gray-900 text-black dark:text-white">
  Dark Mode Support
</div>
```

### 响应式设计
```tsx
<div className="w-full md:w-1/2 lg:w-1/3">
  Responsive Layout
</div>
```

## 性能优化

### 1. 内容路径优化
只扫描必要的文件路径，避免扫描 `node_modules` 等目录。

### 2. 生产构建优化
- 自动清除未使用的样式（PurgeCSS）
- 压缩 CSS 输出
- 优化选择器

### 3. 开发体验优化
- HMR（热模块替换）支持
- 快速的增量构建
- 实时的样式更新

## 扩展自定义样式

### 添加自定义颜色
```typescript
// tailwind.config.ts
theme: {
  extend: {
    colors: {
      'custom-color': '#123456',
    },
  },
}
```

### 添加自定义动画
```typescript
// tailwind.config.ts
theme: {
  extend: {
    animation: {
      'custom-animation': 'customKeyframe 1s ease-in-out',
    },
    keyframes: {
      customKeyframe: {
        '0%': { /* ... */ },
        '100%': { /* ... */ },
      },
    },
  },
}
```

### 添加自定义实用类
```css
/* 在 CSS 文件中 */
@layer components {
  .btn-primary {
    @apply bg-primary-500 text-white px-4 py-2 rounded-lg hover:bg-primary-600;
  }
}
```

## 注意事项

1. **Shadow DOM 隔离**: Content Script 的样式在 Shadow DOM 中，不会影响宿主页面
2. **包大小监控**: 定期检查生成的 CSS 文件大小，确保不超过预算
3. **浏览器兼容性**: Autoprefixer 会自动处理浏览器前缀
4. **类名冲突**: 使用 Tailwind 的实用类可以避免类名冲突
5. **性能考虑**: 避免过度使用复杂的动画和过渡效果

## 升级到 Tailwind CSS 4

当 Tailwind CSS 4 正式发布后，可以按照以下步骤升级：

1. 更新依赖版本
2. 检查配置文件兼容性
3. 测试所有样式是否正常工作
4. 更新文档

当前配置已经使用了兼容的语法，升级应该比较平滑。

## 相关资源

- [Tailwind CSS 官方文档](https://tailwindcss.com/docs)
- [Tailwind CSS 3.4 发布说明](https://tailwindcss.com/blog/tailwindcss-v3-4)
- [PostCSS 文档](https://postcss.org/)
- [Autoprefixer 文档](https://github.com/postcss/autoprefixer)
