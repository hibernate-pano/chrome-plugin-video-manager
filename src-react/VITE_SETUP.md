# Vite + CRXJS 构建系统配置完成

## 配置概述

本文档记录了 Vite + CRXJS 构建系统的配置过程和关键决策。

## 已完成的配置

### 1. 依赖安装

已安装以下核心依赖：

**生产依赖：**
- `react@^18.3.1` - React 核心库
- `react-dom@^18.3.1` - React DOM 渲染器

**开发依赖：**
- `vite@^6.4.1` - 现代化构建工具
- `@vitejs/plugin-react@^4.3.4` - Vite 的 React 插件
- `@crxjs/vite-plugin@^2.0.0-beta.25` - Chrome 扩展开发插件
- `typescript@^5.7.3` - TypeScript 编译器
- `@types/react@^18.3.18` - React 类型定义
- `@types/react-dom@^18.3.5` - React DOM 类型定义
- `@types/chrome@^0.0.277` - Chrome API 类型定义
- `@types/node@^25.2.3` - Node.js 类型定义
- `terser@^5.46.0` - JavaScript 压缩工具

### 2. 配置文件

#### vite.config.ts
- 配置了 React 插件
- 配置了 CRXJS 插件用于 Chrome 扩展开发
- 配置了路径别名 `@/` 指向项目根目录
- 配置了 Terser 压缩（生产环境移除 console）
- 配置了开发服务器（端口 5173，HMR 支持）

#### tsconfig.json
- 启用严格模式类型检查
- 配置 ES2020 目标和 ESNext 模块
- 配置路径别名支持
- 包含 options、content、shared、background 目录

#### tsconfig.node.json
- 专门用于 Vite 配置文件的 TypeScript 配置
- 启用 Node.js 类型支持

#### manifest.json
- Manifest V3 格式
- 配置了 background service worker
- 配置了 content scripts
- 配置了 web_accessible_resources

### 3. 项目结构

```
src-react/
├── options/                 # 设置页面
│   ├── main.tsx            # 入口文件
│   └── styles/
│       └── index.css       # 样式文件
├── content/                 # 内容脚本
│   ├── main.tsx            # 入口文件
│   └── styles/
│       └── index.css       # 样式文件
├── background/              # 后台服务
│   └── index.ts            # Service Worker
├── shared/                  # 共享代码（待创建）
├── icons/                   # 图标资源
├── _locales/               # 国际化文件
├── options.html            # 设置页面 HTML
├── manifest.json           # 扩展清单
├── vite.config.ts          # Vite 配置
├── tsconfig.json           # TypeScript 配置
├── tsconfig.node.json      # Node TypeScript 配置
├── vite-env.d.ts          # Vite 类型声明
└── package.json            # 项目配置
```

### 4. 入口点配置

#### Options Page (设置页面)
- HTML: `options.html`
- 入口: `options/main.tsx`
- 渲染到: `#root`

#### Content Script (内容脚本)
- 入口: `content/main.tsx`
- 使用 Shadow DOM 隔离样式
- 自动注入到所有网页

#### Background Service Worker (后台服务)
- 入口: `background/index.ts`
- Manifest V3 Service Worker
- 处理消息传递和存储同步

### 5. 构建验证

✅ TypeScript 类型检查通过
✅ 生产构建成功
✅ 包大小符合预期：
  - Options page: ~1.2KB (不含 React)
  - Content script: ~0.7KB (不含 React)
  - React 共享 chunk: ~140KB (gzip 后 ~45KB)

## 可用的 npm 脚本

```bash
# 开发模式（HMR 支持）
pnpm dev

# 生产构建
pnpm build

# 类型检查
pnpm type-check

# 预览构建结果
pnpm preview

# 代码检查
pnpm lint
pnpm lint:fix
```

## 下一步

1. ✅ 配置 TypeScript（任务 3）
2. ✅ 安装核心依赖（任务 4）
3. ⏭️ 配置 Tailwind CSS 3.4（任务 5）
4. ⏭️ 初始化 shadcn/ui（任务 6）

## 注意事项

### CRXJS 插件特性
- 自动处理 Manifest V3 的入口点
- 自动处理 HMR（热模块替换）
- 自动处理资源文件（图标、语言文件等）
- 自动生成正确的文件路径

### 开发模式
- 开发模式下，扩展会自动重新加载
- 修改代码后，HMR 会自动更新页面
- 需要在 Chrome 中加载 `dist/` 目录作为未打包的扩展

### 生产构建
- 生产构建会压缩代码并移除 console
- 包大小已优化，符合目标要求
- 构建产物在 `dist/` 目录

## 已知问题

1. **Husky 警告**: 在 pnpm install 时会出现 "husky: command not found" 警告，这是因为 husky 在根项目中配置，可以忽略。

2. **开发模式错误**: 初次尝试 `pnpm dev` 时遇到了一些错误，已通过简化 vite.config.ts 解决。CRXJS 插件会自动处理入口点，不需要手动配置 rollupOptions。

## 参考资料

- [Vite 文档](https://vitejs.dev/)
- [CRXJS 文档](https://crxjs.dev/vite-plugin/)
- [Chrome Extension Manifest V3](https://developer.chrome.com/docs/extensions/mv3/)
- [React 文档](https://react.dev/)
- [TypeScript 文档](https://www.typescriptlang.org/)
