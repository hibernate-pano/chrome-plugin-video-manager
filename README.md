# Video Speed Controller

一个面向 Chrome MV3 的网页视频控制扩展，只保留三类核心能力：

- 视频速度控制（快捷键 + 数字键预设档位）
- 全局播放/暂停
- 网页全屏切换

## 当前功能

- 自动选择当前页面最合适的 `video` 元素
- 快捷键控制播放速度：加速、减速、重置
- **数字键 `1`-`4` 直达预设档位**（默认 1.25x / 1.5x / 1.75x / 2.0x，设置页可自定义）
- **最大速度上限**（默认 4x，可配置），长按不会冲过头
- **空格键全局切换播放/暂停**（设置页可关闭）
- **站点速度记忆**：刷新/重开页面自动恢复该网站上次的速度（可全局开关、按站点关闭、一键清除）
- **悬停指示器**：鼠标悬停视频时显示当前受控对象与实时速度，点击视频即锁定
- **工具栏 Popup**：当前速度/播放状态、一键重置、本站记忆开关、快捷键速查
- 工具栏图标 badge 显示当前播放速度
- 网页全屏：优先 reparent，失败时退回 CSS cover
- 设置页支持快捷键、预设速度、最大速度、空格与记忆开关，界面支持中/英/日/韩
- 已打开页面会通过 `chrome.storage.onChanged` 热更新设置

## 默认快捷键

| 功能 | 快捷键 |
| --- | --- |
| 加速 | `=` |
| 减速 | `-` |
| 重置速度 | `0` |
| 预设档位 1-4 | `1` `2` `3` `4` |
| 播放/暂停 | `Space` |
| 网页全屏 | `f` |

说明：

- 在网页全屏模式下，`Escape` 退出网页全屏
- 在网页全屏模式下，`ArrowLeft` / `ArrowRight` 分别快退 / 快进 5 秒
- 在网页全屏模式下，`Space` 切换播放 / 暂停（全屏外同样生效，可在设置页关闭）

## 项目结构

- `src/content/`: 内容脚本运行时、视频选择、快捷键控制、网页全屏、HUD、站点记忆、受控对象指示器
- `src/background/`: service worker，负责图标 badge 更新
- `src/popup/`: 工具栏 Popup
- `src/options/`: 设置页
- `src/shared/`: 快捷键、设置持久化与 i18n
- `tests/e2e/`: Playwright 回归测试

## 本地开发

```bash
pnpm install
pnpm build
```

加载扩展：

1. 打开 `chrome://extensions/`
2. 开启"开发者模式"
3. 选择"加载已解压的扩展程序"
4. 指向项目的 `dist/` 目录

## 测试命令

```bash
pnpm test          # 单元测试 + CI 配置契约测试
pnpm build         # tsc 类型检查 + vite 构建 → dist/
pnpm test:e2e      # 全部 Playwright（会先 build）
pnpm test:e2e:ext  # 真加载扩展的 E2E（会先 build，需要本机有 Chromium）
```

CI 会在 push / PR 上跑 `test` → `e2e` → `build` → `release` 四个 job，
`release` 依赖前三个全绿。详见 [TESTING.md](./TESTING.md)。

## 当前边界

- 只控制 `video`，暂不覆盖 `audio`（路线图中计划支持播客场景）
- 跨域 iframe 内的视频无法直接接管
- 极少数强依赖原始 DOM 位置的站点会退回 CSS cover 模式

更多细节见 [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)、[PRODUCT.md](./PRODUCT.md) 和 [TESTING.md](./TESTING.md)。
