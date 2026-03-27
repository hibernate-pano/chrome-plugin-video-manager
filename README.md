# Video Speed Controller

一个面向 Chrome MV3 的网页视频控制扩展，目标是把“网页全屏 + 播放控制”做成稳定可用的通用能力，而不是只在少数站点上勉强工作。

## 当前能力

- 统一控制网页上的 `video` 和 `audio`
- 智能选主：优先网页全屏媒体、最近交互媒体、正在播放且可见的最大媒体
- 网页全屏模式：优先直接接管原始 `video` 元素，避免复制 `src` 破坏站点播放器状态
- 播放控制：加减速、重置、播放暂停、快进快退、音量、静音
- HUD 反馈：速度、音量、快进快退、静音、网页全屏状态
- 设置页：快捷键捕获录入、速度预设管理
- 基础站点适配：`generic`、`youtube`、`bilibili`

## 默认快捷键

| 功能 | 快捷键 |
| --- | --- |
| 加速 | `=` |
| 减速 | `-` |
| 重置速度 | `0` |
| 播放 / 暂停 | `Space` |
| 网页全屏 | `f` |
| 快进 10 秒 | `ArrowRight` |
| 快退 10 秒 | `ArrowLeft` |
| 音量增加 | `[` |
| 音量减少 | `]` |
| 静音 | `m` |

## 技术架构

- Content Script: React UI + Active Media Session 运行时
- Runtime Core: `mediaDetector`、`playbackController`、`lightboxManager`、`keyboardHandler`
- State: Zustand 只承载设置和会话投影，不承载真实媒体控制逻辑
- Build: Vite + TypeScript
- Test: Vitest + jsdom

详细说明见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 本地开发

```bash
pnpm install
pnpm build
```

加载方式：

1. 打开 `chrome://extensions/`
2. 开启“开发者模式”
3. 选择“加载已解压的扩展程序”
4. 指向项目的 `dist/` 目录

开发常用命令：

```bash
pnpm test
pnpm build
```

## 当前重点

Phase 1 的目标是把核心链路打稳：

- 主流 HTML5 站点上的媒体选主
- 网页全屏进入 / 退出的状态保持
- 高冲突快捷键的统一接管规则
- 主流站点适配和回归测试

## 已知边界

- 跨域 iframe 内的视频无法直接接管
- 极少数强依赖原始 DOM 位置的站点会退回 CSS cover 模式
- 当前还没有恢复旧版高级功能，如书签、历史、云同步、手势控制
