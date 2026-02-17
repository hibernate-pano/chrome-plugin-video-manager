# Video Audio Speed Controller

一个用于控制网页视频和音频播放速度的 Chrome 扩展，支持键盘快捷键操作。

## 功能特性

- ⚡ **播放速度控制**：通过快捷键调整视频速度 (0.1x - 16x)
- 🔊 **音量控制**：快捷键调整音量
- ⏩ **视频跳转**：前进/后退快进
- 🖼️ **网页全屏**：非浏览器原生全屏，页面内全屏模式 (Lightbox)
- 📋 **速度预设**：快速切换预设速度 (0.5x - 2.0x)
- 💾 **网站记忆**：每个网站独立记忆播放速度
- 🌐 **多语言支持**：中文、英文
- ⌨️ **自定义快捷键**：支持自定义键盘快捷键

## 技术栈

- **React 18** - UI 框架
- **TypeScript** - 类型安全
- **Tailwind CSS 3.4** - CSS 框架
- **shadcn/ui** - UI 组件库
- **React Spring** - 动画库
- **Zustand** - 状态管理
- **Vite + CRXJS** - 构建工具

## 项目结构

```
├── background/          # Service Worker
├── content/             # 内容脚本
│   ├── components/      # React 组件（HUD、Lightbox 等）
│   ├── hooks/           # 自定义 Hooks
│   └── styles/          # 样式文件
├── options/             # 设置页面
│   ├── components/      # React 组件
│   └── styles/          # 样式文件
├── shared/              # 共享代码
│   ├── components/      # 共享 UI 组件
│   ├── hooks/           # 共享 Hooks
│   ├── stores/          # Zustand Store
│   ├── modules/         # 核心模块
│   └── utils/           # 工具函数
├── _locales/            # 国际化文件
└── icons/               # 扩展图标
```

## 开发

### 环境要求

- Node.js 18+
- pnpm 8+

### 安装依赖

```bash
pnpm install
```

### 开发模式

```bash
pnpm dev
```

### 构建

```bash
pnpm build
```

### 测试

```bash
# 单元测试
pnpm test

# E2E 测试
pnpm test:e2e
```

### 代码检查

```bash
pnpm lint
pnpm type-check
```

## 安装扩展

1. 运行 `pnpm build` 构建扩展
2. 打开 Chrome，访问 `chrome://extensions/`
3. 启用"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择项目的 `dist` 目录

## 默认快捷键

| 快捷键 | 功能 |
|--------|------|
| `A` | 减速 |
| `D` | 加速 |
| `S` | 重置速度 |
| `W` | 切换网页全屏 |
| `Q` | 播放/暂停 |
| `Z` | 后退 |
| `X` | 前进 |
| `Shift + 1-9` | 预设速度 |

## 许可证

MIT