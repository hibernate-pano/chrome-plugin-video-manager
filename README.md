# 视频 & 音频速度控制器 (Video & Audio Speed Controller)

[![CI/CD Pipeline](https://github.com/yourusername/chrome-plugin-video-manager/actions/workflows/ci.yml/badge.svg)](https://github.com/yourusername/chrome-plugin-video-manager/actions/workflows/ci.yml)
[![Test Coverage](https://img.shields.io/badge/coverage-85%25-brightgreen.svg)](./src-react/coverage-jest)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](./package.json)

一个强大的 Chrome 浏览器扩展，允许您使用键盘快捷键轻松控制网页上视频和音频的播放速度。专为在线学习、视频会议和媒体爱好者设计。

> **🎉 v2.0 重大更新**：全新 React + TypeScript 架构，现代化 UI 设计，更流畅的动画效果！

![图标](icons/icon128.png)

## 功能特点

- 🚀 **自定义快捷键**：可定制的键盘快捷键控制媒体播放
- 🎯 **智能媒体检测**：自动检测页面上的视频和音频元素，包括动态加载的内容
- 🌐 **跨站点兼容**：适用于几乎所有网站，包括 YouTube、Bilibili、网课平台等
- 🌈 **视觉反馈**：调整速度时显示美观的屏幕提示
- 🎭 **网页全屏模式**：一键进入沉浸式观看模式，不受网站原有 UI 干扰
- 🔍 **Shadow DOM 支持**：能够检测和控制 Shadow DOM 中的媒体元素
- 🧩 **iframe 支持**：控制嵌入在 iframe 中的媒体
- 📱 **响应式设计**：在各种屏幕尺寸下都能正常工作
- 🔋 **高性能设计**：极低的资源占用，不影响浏览体验
- ⚡ **速度预设**：7 个常用速度预设，通过数字键快速切换
- 🧠 **速度记忆**：自动记住每个网站的速度设置
- 🔊 **音量控制**：快捷键调节音量大小
- ⏭️ **快速跳转**：快捷键前后跳转视频进度

## 默认快捷键

| 功能      | 快捷键   | 描述                        |
| --------- | -------- | --------------------------- |
| 加速      | `=`      | 增加播放速度 (+0.1)         |
| 减速      | `-`      | 降低播放速度 (-0.1)         |
| 重置速度  | `0`      | 将速度重置为 1.0x(正常速度) |
| 播放/暂停 | `空格键` | 切换媒体的播放/暂停状态     |
| 网页全屏  | `f`      | 进入/退出网页全屏模式       |
| 音量增加  | `]`      | 增加音量                   |
| 音量降低  | `[`      | 降低音量                   |
| 前进 5秒  | `.`      | 快速前进                   |
| 后退 5秒  | `,`      | 快速后退                   |
| 速度预设  | `7-9, 4-6, 0` | 快速切换到预设速度     |

### 速度预设

| 预设 | 速度 | 快捷键 |
| ---- | ---- | ------ |
| 0.5x | 0.50 | `7` |
| 0.75x | 0.75 | `8` |
| 1.0x | 1.00 | `9` |
| 1.25x | 1.25 | `4` |
| 1.5x | 1.50 | `5` |
| 1.75x | 1.75 | `6` |
| 2.0x | 2.00 | `0` |

> 所有快捷键均可在扩展选项中自定义，预设也可以添加或删除

## 安装方法

### 从 Chrome 网上应用店安装（推荐）

1. 访问[Chrome 网上应用店](https://chrome.google.com/webstore/category/extensions)（链接待更新）
2. 点击"添加到 Chrome"按钮
3. 确认安装

### 手动安装（开发版）

1. 下载或克隆此仓库到本地
2. 打开 Chrome 浏览器，访问 `chrome://extensions/`
3. 启用右上角的"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择包含此项目文件的文件夹

## 使用说明

### 基本使用

1. 安装扩展后，访问任何包含视频或音频的网页
2. 使用默认快捷键（或您自定义的快捷键）控制媒体播放
3. 调整速度时，屏幕上会短暂显示当前速度

### 视频选择逻辑

当页面上有多个媒体元素时，扩展会按以下优先级选择目标媒体：

1. 网页全屏模式中的视频
2. 最近鼠标悬停或点击的媒体
3. 当前在视口中且尺寸最大的媒体
4. 页面上第一个找到的媒体元素

### 自定义快捷键

1. 点击扩展图标打开设置页面
2. 在表单中设置您喜欢的快捷键
3. 点击"保存"按钮应用更改
4. 系统会自动检测快捷键冲突并给出提示

### 速度预设管理

1. 在设置页面切换到"速度预设"标签
2. 点击"添加预设"按钮自定义新的速度预设
3. 点击"重置"恢复到默认预设
4. 支持为每个预设设置快捷键和标签

### 速度记忆功能

扩展会自动记住每个网站的播放速度，下次访问时自动恢复：
- 基于域名存储（例如 youtube.com, bilibili.com）
- 切换到新网站时自动使用该网站的上次设置
- 可以在设置中清除记忆或重置

### 常见问题解答

**Q: 快捷键在某些网站上不工作？**
A: 一些网站可能会覆盖全局键盘快捷键。尝试使用网页全屏模式（按`f`）后再使用快捷键，或者在设置中更改为不常用的快捷键组合。

**Q: 在网页全屏模式下，点击视频控制条后快捷键无效？**
A: 这是已知问题，我们在最新版本中已修复。如果仍然遇到此问题，请尝试点击视频内容区域而非控制条。

**Q: 为什么不能设置全局快捷键？**
A: 出于安全考虑，Chrome 扩展不允许在未激活的标签页中运行内容脚本。我们只能控制当前活跃标签页中的媒体。

## 技术特点

### v2.0 新架构特性

- **🎨 现代化 UI**：使用 React 18 + Tailwind CSS 3.4 + shadcn/ui 构建，提供精美的用户界面
- **⚡ 类型安全**：完全使用 TypeScript 重写，提供更好的开发体验和代码质量
- **🎭 流畅动画**：使用 React Spring 实现物理动画效果，60fps 流畅体验
- **🔧 状态管理**：使用 Zustand 进行轻量级状态管理，响应式更新
- **🧪 完整测试**：85%+ 测试覆盖率，包含单元测试、集成测试和 E2E 测试
- **🚀 快速构建**：使用 Vite + CRXJS 构建，支持 HMR 热更新
- **🌐 国际化**：支持多语言切换（中文、英文）
- **♿ 可访问性**：遵循 WCAG 标准，支持键盘导航和屏幕阅读器

### 核心技术特性

- **高性能设计**：使用优化的缓存系统（500ms 过期时间）和防抖技术，确保在复杂页面上也能流畅运行
- **增强的媒体检测**：使用递减间隔检查和 MutationObserver，精确捕获动态加载的媒体
- **安全的事件处理**：采用事件委托和捕获阶段监听，确保快捷键在各种情况下都能正常工作
- **IntersectionObserver 支持**：使用现代 API 优化元素可见性检测
- **Shadow DOM 隔离**：使用 Shadow DOM 技术实现样式隔离，避免与网站样式冲突
- **内存泄漏防护**：完善的资源清理机制，确保在页面卸载时正确释放资源
- **性能监控**：内置性能监控系统，实时跟踪媒体检测、键盘响应等关键指标
- **代码分割**：智能代码分割，按需加载，优化包大小

## 项目结构

```
chrome-plugin-video-manager/
├── manifest.json              # 扩展配置文件（原版）
├── src/                      # 原版源代码（v1.x）
│   ├── main.js
│   ├── modules/
│   └── utils/
├── src-react/                # React 重构版本（v2.0）
│   ├── options/             # 设置页面
│   │   ├── components/      # React 组件
│   │   ├── OptionsApp.tsx   # 主应用
│   │   └── main.tsx         # 入口文件
│   ├── content/             # 内容脚本
│   │   ├── components/      # UI 组件（HUD、Lightbox）
│   │   ├── hooks/          # 自定义 Hooks
│   │   ├── ContentApp.tsx   # 主应用
│   │   └── main.tsx         # 入口文件
│   ├── shared/              # 共享代码
│   │   ├── components/      # 共享组件（shadcn/ui）
│   │   ├── stores/         # Zustand 状态管理
│   │   ├── modules/        # 核心逻辑（TypeScript）
│   │   ├── utils/          # 工具函数
│   │   ├── types/          # TypeScript 类型
│   │   └── lib/            # 库函数（i18n、utils）
│   ├── background/          # 后台服务
│   ├── tests/              # 测试文件
│   │   ├── unit/           # 单元测试
│   │   ├── integration/    # 集成测试
│   │   ├── e2e/            # E2E 测试
│   │   └── compatibility/  # 兼容性测试
│   ├── manifest.json        # Manifest V3 配置
│   ├── vite.config.ts      # Vite 配置
│   ├── tailwind.config.ts  # Tailwind 配置
│   ├── tsconfig.json       # TypeScript 配置
│   └── package.json        # 依赖管理
├── .github/
│   └── workflows/
│       └── ci.yml          # CI/CD 配置
└── docs/                   # 文档
    ├── MIGRATION.md        # 迁移指南
    └── ARCHITECTURE.md     # 架构文档
```

## 开发环境

本项目提供两个版本：

### v1.x（原版 - 稳定）
使用原生 JavaScript + Rollup 构建

### v2.0（React 重构版 - 推荐）
使用 React 18 + TypeScript + Vite 构建

### 环境要求
- Node.js >= 18
- pnpm >= 8（推荐）或 npm >= 9

### 安装依赖

**原版（v1.x）：**
```bash
npm install
```

**React 版（v2.0）：**
```bash
cd src-react
pnpm install
```

### 开发命令

**原版（v1.x）：**
```bash
# 构建生产版本
npm run build

# 开发模式（监听文件变化）
npm run watch

# 完整开发流程
npm run dev

# 运行测试
npm test
```

**React 版（v2.0）：**
```bash
cd src-react

# 开发模式（HMR 热更新）
pnpm dev

# 构建生产版本
pnpm build

# 运行所有测试
pnpm test

# 运行单元测试（Vitest）
pnpm test:unit

# 运行扩展 API 测试（Jest）
pnpm test:jest

# 运行 E2E 测试（Playwright）
pnpm test:e2e

# 代码检查
pnpm lint

# 类型检查
pnpm type-check

# 包大小分析
pnpm analyze
```

### 加载到浏览器

**原版（v1.x）：**
1. 运行 `npm run build`
2. 打开 Chrome 浏览器，访问 `chrome://extensions/`
3. 启用"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择项目根目录

**React 版（v2.0）：**
1. 运行 `cd src-react && pnpm build`
2. 打开 Chrome 浏览器，访问 `chrome://extensions/`
3. 启用"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择 `src-react/dist` 目录

### 开发工具

推荐使用 VS Code 并安装以下扩展：
- ESLint
- Prettier
- TypeScript and JavaScript Language Features
- Tailwind CSS IntelliSense
- Jest Runner
- GitLens

## 隐私说明

- 此扩展不收集任何用户数据
- 不需要网络访问权限
- 所有设置都存储在本地浏览器中

## 未来计划

### v2.1 计划
- [ ] 完善 E2E 测试覆盖
- [ ] 添加更多动画效果选项
- [ ] 优化包大小（目标 <150KB）
- [ ] 添加性能监控面板

### 长期计划
- [ ] 添加自定义步进值（控制每次加减速的幅度）
- [ ] 支持更多视频操作（如跳过、循环特定片段）
- [ ] 为常用网站添加特定优化
- [x] ~~添加快捷键冲突检测与提示~~ ✅ 已完成
- [x] ~~React + TypeScript 重构~~ ✅ v2.0 已完成
- [x] ~~现代化 UI 设计~~ ✅ v2.0 已完成
- [ ] 支持更多浏览器（Firefox、Edge 等）
- [ ] 键盘可视化（显示快捷键提示）
- [ ] 云端设置同步

## 已知问题

- 在某些使用严格 CSP(内容安全策略)的网站上，样式可能无法正常加载
- 极少数使用非标准视频播放器的网站可能无法被检测到
- 某些 SPA(单页应用)在页面切换时可能需要刷新才能检测到新视频（已优化但仍偶发）

## 贡献指南

欢迎贡献代码、报告问题或提出功能建议！

详细的贡献指南请查看 [CONTRIBUTING.md](CONTRIBUTING.md)

### 快速开始

1. Fork 这个仓库
2. 创建您的特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交您的更改 (`git commit -m 'feat: add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 打开一个 Pull Request

### 开发文档

- [迁移指南](docs/MIGRATION.md) - 从 v1.x 迁移到 v2.0
- [架构文档](docs/ARCHITECTURE.md) - v2.0 架构设计详解
- [贡献指南](CONTRIBUTING.md) - 如何参与项目开发

## 许可证

此项目采用 MIT 许可证 - 详情请查看[LICENSE](LICENSE)文件

## 支持与反馈

如有任何问题或建议，请在 GitHub 仓库中提交 Issue，或通过以下方式联系我们：

- Email: your-email@example.com（请替换为实际联系方式）

---

**开发者:** Pano
**版本:** 2.0.0
