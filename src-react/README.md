# React 重构源代码目录

这个目录包含使用 React + TypeScript + Tailwind CSS 3.4 重构的代码。

## 目录结构

```
src-react/
├── options/              # 设置页面（Options Page）
│   ├── components/       # React 组件
│   ├── hooks/           # 自定义 Hooks
│   ├── stores/          # Zustand 状态管理
│   ├── utils/           # 工具函数
│   ├── types/           # TypeScript 类型定义
│   └── styles/          # 样式文件
├── content/             # 内容脚本（Content Script）
│   ├── components/      # React 组件（HUD、Lightbox 等）
│   ├── hooks/          # 自定义 Hooks
│   ├── stores/         # Zustand 状态管理
│   ├── utils/          # 工具函数
│   ├── types/          # TypeScript 类型定义
│   └── styles/         # 样式文件
├── shared/             # 共享代码
│   ├── components/     # 共享组件
│   ├── hooks/         # 共享 Hooks
│   ├── stores/        # 共享 Store
│   ├── utils/         # 共享工具函数
│   ├── types/         # 共享类型定义
│   └── styles/        # 共享样式
└── assets/            # 静态资源
```

## 技术栈

- **React 18** - UI 框架
- **TypeScript** - 类型安全
- **Tailwind CSS 3.4** - CSS 框架
- **shadcn/ui** - UI 组件库
- **React Spring** - 动画库
- **Zustand** - 状态管理
- **Vite + CRXJS** - 构建工具

## 开发指南

详见项目根目录的 `.kiro/specs/react-tailwind-refactor/` 文档。
