# Video Speed Controller

一个面向 Chrome MV3 的网页视频控制扩展，当前只保留两类核心能力：

- 视频速度控制
- 网页全屏切换

## 当前功能

- 自动选择当前页面最合适的 `video` 元素
- 快捷键控制播放速度：加速、减速、重置
- 网页全屏：优先 reparent，失败时退回 CSS cover
- 设置页支持 4 个快捷键的录入、校验和持久化
- 已打开页面会通过 `chrome.storage.onChanged` 热更新快捷键

## 默认快捷键

| 功能 | 快捷键 |
| --- | --- |
| 加速 | `=` |
| 减速 | `-` |
| 重置速度 | `0` |
| 网页全屏 | `f` |

说明：

- 在网页全屏模式下，`Escape` 退出网页全屏
- 在网页全屏模式下，`ArrowLeft` / `ArrowRight` 分别快退 / 快进 5 秒
- 在网页全屏模式下，`Space` 切换播放 / 暂停

## 项目结构

- `src/content/`: 内容脚本运行时、视频选择、快捷键控制、网页全屏
- `src/options/`: 设置页
- `src/shared/`: 快捷键与设置持久化
- `tests/e2e/`: 当前保留的 Playwright 回归测试

## 本地开发

```bash
pnpm install
pnpm build
```

加载扩展：

1. 打开 `chrome://extensions/`
2. 开启“开发者模式”
3. 选择“加载已解压的扩展程序”
4. 指向项目的 `dist/` 目录

## 测试命令

```bash
pnpm test
pnpm build
pnpm test:e2e
```

## 当前边界

- 只控制 `video`，不再覆盖 `audio`
- 跨域 iframe 内的视频无法直接接管
- 极少数强依赖原始 DOM 位置的站点会退回 CSS cover 模式
- 设置页当前是中文文案，`_locales` 资源尚未接入新的 options 实现

更多细节见 [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) 和 [TESTING.md](./TESTING.md)。
