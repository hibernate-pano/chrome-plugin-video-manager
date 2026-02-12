# shadcn/ui 配置文档

## 概述

本项目已成功集成 shadcn/ui 组件库，这是一个基于 Radix UI 和 Tailwind CSS 构建的高质量、可访问的 React 组件集合。

## 安装的组件

已安装以下基础组件：

1. **Button** - 按钮组件
2. **Input** - 输入框组件
3. **Label** - 标签组件
4. **Tabs** - 标签页组件

## 配置文件

### components.json

shadcn/ui 的配置文件，定义了组件的安装路径和样式配置：

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "content/styles/index.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

### 路径别名配置

已在 `tsconfig.json` 和 `vite.config.ts` 中配置了以下路径别名：

- `@/components` → `./shared/components`
- `@/lib` → `./shared/lib`
- `@/hooks` → `./shared/hooks`

## 依赖包

已安装以下依赖：

```json
{
  "dependencies": {
    "clsx": "^2.1.1",
    "tailwind-merge": "^3.4.0",
    "tailwindcss-animate": "^1.0.7",
    "class-variance-authority": "^0.7.1",
    "lucide-react": "^0.563.0",
    "@radix-ui/react-slot": "^1.2.4",
    "@radix-ui/react-label": "2.1.8",
    "@radix-ui/react-tabs": "1.1.13"
  }
}
```

## 工具函数

### cn() - 类名合并工具

位置：`shared/lib/utils.ts`

```typescript
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

这个工具函数结合了 `clsx` 和 `tailwind-merge`，用于：
- 条件性地应用类名
- 合并冲突的 Tailwind CSS 类

## 组件使用示例

### Button 组件

```tsx
import { Button } from '@/components/ui/button'

// 基础用法
<Button>点击我</Button>

// 不同变体
<Button variant="default">默认按钮</Button>
<Button variant="secondary">次要按钮</Button>
<Button variant="destructive">危险按钮</Button>
<Button variant="outline">轮廓按钮</Button>
<Button variant="ghost">幽灵按钮</Button>
<Button variant="link">链接按钮</Button>

// 不同尺寸
<Button size="sm">小按钮</Button>
<Button size="default">默认按钮</Button>
<Button size="lg">大按钮</Button>
<Button size="icon">图标按钮</Button>
```

### Input 和 Label 组件

```tsx
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

<div className="space-y-2">
  <Label htmlFor="email">邮箱</Label>
  <Input
    id="email"
    type="email"
    placeholder="请输入邮箱"
  />
</div>
```

### Tabs 组件

```tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

<Tabs defaultValue="tab1">
  <TabsList>
    <TabsTrigger value="tab1">标签页 1</TabsTrigger>
    <TabsTrigger value="tab2">标签页 2</TabsTrigger>
  </TabsList>
  <TabsContent value="tab1">
    标签页 1 的内容
  </TabsContent>
  <TabsContent value="tab2">
    标签页 2 的内容
  </TabsContent>
</Tabs>
```

## 组件文件结构

```
src-react/
├── shared/
│   ├── components/
│   │   └── ui/
│   │       ├── button.tsx       # Button 组件
│   │       ├── input.tsx        # Input 组件
│   │       ├── label.tsx        # Label 组件
│   │       ├── tabs.tsx         # Tabs 组件
│   │       ├── index.ts         # 组件导出
│   │       └── example.tsx      # 使用示例
│   └── lib/
│       └── utils.ts             # 工具函数
└── components.json              # shadcn/ui 配置
```

## CSS 变量

已在 `content/styles/index.css` 中配置了 shadcn/ui 所需的 CSS 变量：

```css
:root {
  --background: 0 0% 100%;
  --foreground: 0 0% 3.9%;
  --primary: 0 0% 9%;
  --primary-foreground: 0 0% 98%;
  --secondary: 0 0% 96.1%;
  --secondary-foreground: 0 0% 9%;
  /* ... 更多变量 */
}

.dark {
  --background: 0 0% 3.9%;
  --foreground: 0 0% 98%;
  /* ... 暗色模式变量 */
}
```

## 添加新组件

如果需要添加更多 shadcn/ui 组件，由于 husky 的问题，建议使用以下步骤：

1. 手动安装所需的 Radix UI 依赖：
   ```bash
   pnpm add --ignore-scripts @radix-ui/react-[component-name]
   ```

2. 从 [shadcn/ui 官网](https://ui.shadcn.com/docs/components) 复制组件代码

3. 将组件代码保存到 `shared/components/ui/` 目录

4. 在 `shared/components/ui/index.ts` 中导出新组件

5. 运行类型检查确保没有错误：
   ```bash
   pnpm type-check
   ```

## 可访问性

所有 shadcn/ui 组件都基于 Radix UI 构建，提供了：

- ✅ 完整的键盘导航支持
- ✅ 正确的 ARIA 属性
- ✅ 焦点管理
- ✅ 屏幕阅读器支持

## 自定义主题

可以通过修改 `tailwind.config.ts` 中的颜色变量来自定义主题：

```typescript
theme: {
  extend: {
    colors: {
      primary: {
        DEFAULT: 'hsl(var(--primary))',
        foreground: 'hsl(var(--primary-foreground))'
      },
      // ... 其他颜色
    }
  }
}
```

## 注意事项

1. **husky 问题**：由于项目根目录配置了 husky，在 src-react 工作区安装依赖时需要使用 `--ignore-scripts` 标志

2. **路径别名**：确保使用 `@/` 前缀导入组件和工具函数

3. **类型安全**：所有组件都有完整的 TypeScript 类型定义

4. **样式隔离**：组件样式通过 Tailwind CSS 类实现，不会与宿主页面冲突

## 参考资源

- [shadcn/ui 官方文档](https://ui.shadcn.com)
- [Radix UI 文档](https://www.radix-ui.com)
- [Tailwind CSS 文档](https://tailwindcss.com)
- [class-variance-authority 文档](https://cva.style)

## 验证安装

运行以下命令验证安装是否成功：

```bash
# 类型检查
pnpm type-check

# 构建项目
pnpm build
```

如果没有错误，说明 shadcn/ui 已成功配置！
